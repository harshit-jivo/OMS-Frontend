import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  deviceAdminService,
  type Analytics,
  type CountRow,
  type DeviceFilters,
  type DeviceRow,
  type Pagination,
} from "../services/deviceAdminService";
import { HiXMark } from "react-icons/hi2";
import StatusBadge from "../components/StatusBadge";
import relativeTime from "../utils/relativeTime";
import "../styles/Device_Management.css";

/**
 * Device Management — the single System screen: live device activity and fleet
 * version analytics.
 *
 * Absorbed the former /Device_Activity page. The two device tables it implied
 * are deliberately ONE table: both read the same endpoint, so a second copy
 * would double the requests and split the search.
 *
 * Reads the existing devices_user_device table via the admin API. Pagination,
 * filtering, search and sorting are ALL server-side; this page never holds the
 * full table in memory.
 *
 * Status (online / idle / offline / inactive) is derived by the SERVER from
 * last_active and returned per row, so the badge, the status cards and the
 * ?status= filter can never disagree — and a skewed browser clock cannot change
 * what a badge says.
 */

// The app's established categorical chart palette (see Dashboard.tsx). Reused
// rather than redefined so every chart in the product reads as one system.
// Hues are assigned by fixed index and never cycled.
const PALETTE = ["#0f766e", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#4f46e5", "#ea580c"];
const MAX_SLICES = 8; // a 9th category folds into "Other" — never a new hue

// Activity status keeps the colours this page already uses for it: the table's
// Active/Inactive badges are green/red, so the chart must not invent a second
// visual language for the same fact. Identity is carried by the legend and the
// on-slice labels too — never by colour alone.
const ACTIVE_COLOR = PALETTE[0];
const INACTIVE_COLOR = PALETTE[3];

const PAGE_SIZE = 25;
const DEFAULT_ORDERING = "-last_active";
const REFRESH_MS = 60_000;

const EMPTY_FILTERS: DeviceFilters = {
  search: "",
  build_number: "",
  status: "",
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
};

/** Collapse a long tail into "Other" so hues are never generated/cycled. */
const topSlices = (rows: CountRow[], key: string) => {
  const named = (rows || []).map((row) => ({
    name: String(row[key] || "Unknown"),
    count: Number(row.count) || 0,
  }));
  if (named.length <= MAX_SLICES) return named;
  const head = named.slice(0, MAX_SLICES - 1);
  const tail = named.slice(MAX_SLICES - 1);
  head.push({ name: "Other", count: tail.reduce((sum, item) => sum + item.count, 0) });
  return head;
};

type CardTone = "warn" | "ok" | "online" | "idle" | "offline";

/**
 * A summary tile. With `onClick` it becomes a filter toggle (the status tiles);
 * without one it is a plain read-out and is rendered as a div, so only the
 * genuinely interactive tiles are focusable.
 */
function Card({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: CardTone;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `dm-card ${tone ? `dm-card-${tone}` : ""} ${
    onClick ? "dm-card-btn" : ""
  } ${active ? "dm-card-on" : ""}`;

  const body = (
    <>
      <span className="dm-card-value">{value}</span>
      <span className="dm-card-label">{label}</span>
    </>
  );

  if (!onClick) return <div className={className}>{body}</div>;

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-pressed={!!active}
      title={active ? `Showing ${label} only — click to clear` : `Show ${label} only`}
    >
      {body}
    </button>
  );
}

function ChartBox({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="dm-chart">
      <div className="dm-chart-head">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="dm-chart-body">{children}</div>
    </div>
  );
}

/**
 * Outside slice label: "<name> <pct>%".
 *
 * Rendered by hand rather than via Recharts' string label because that paints
 * the text in the slice's own colour. Labels are ink; the arc beside them
 * carries the identity. The radius also stays inside the box so the topmost
 * label cannot clip against the chart's edge.
 */
const renderSliceLabel = ({
  cx,
  cy,
  midAngle,
  outerRadius,
  name,
  percent,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  name?: string;
  percent?: number;
}) => {
  const RADIAN = Math.PI / 180;
  const radius = (outerRadius ?? 0) + 16;
  const x = (cx ?? 0) + radius * Math.cos(-(midAngle ?? 0) * RADIAN);
  const y = (cy ?? 0) + radius * Math.sin(-(midAngle ?? 0) * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#475569"
      fontSize={11}
      fontWeight={600}
      textAnchor={x > (cx ?? 0) ? "start" : "end"}
      dominantBaseline="central"
    >
      {`${name} ${Math.round((percent ?? 0) * 100)}%`}
    </text>
  );
};

/** Pie with a legend — identity is never conveyed by colour alone. */
function DistributionPie({
  data,
  colors,
}: {
  data: { name: string; count: number }[];
  /** Fixed hue per slice. Defaults to the categorical order. */
  colors?: string[];
}) {
  if (!data.length) return <p className="dm-empty-sm">No data</p>;
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart margin={{ top: 12, right: 8, bottom: 0, left: 8 }}>
        <Pie
          data={data}
          dataKey="count"
          nameKey="name"
          innerRadius={40}
          outerRadius={64}
          paddingAngle={2}
          // Labelled directly so the value never depends on reading a hue.
          label={renderSliceLabel}
          labelLine={false}
          // Off so the arcs are drawn on first paint. The mount animation adds
          // nothing to a two-slice status donut and leaves it briefly blank.
          isAnimationActive={false}
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={colors?.[index] ?? PALETTE[index % PALETTE.length]}
              stroke="#ffffff"
              strokeWidth={2}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => {
            const count = Number(value) || 0;
            return total ? `${count} (${Math.round((count / total) * 100)}%)` : String(count);
          }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: "0.75rem" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** One sortable column header. Sorting is server-side (allow-listed fields). */
function SortHeader({
  label,
  field,
  ordering,
  onSort,
}: {
  label: string;
  field: string;
  ordering: string;
  onSort: (field: string) => void;
}) {
  const direction = ordering === field ? "asc" : ordering === `-${field}` ? "desc" : null;
  return (
    <th
      className={`dm-th-sort ${direction ? "dm-th-active" : ""}`}
      onClick={() => onSort(field)}
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
      title={`Sort by ${label}`}
    >
      <span className="dm-th-inner">
        {label}
        <span className="dm-sort-icon" aria-hidden="true">
          {direction === "asc" ? "▲" : direction === "desc" ? "▼" : "↕"}
        </span>
      </span>
    </th>
  );
}

export default function Device_Management() {
  const [filters, setFilters] = useState<DeviceFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [ordering, setOrdering] = useState(DEFAULT_ORDERING);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [selected, setSelected] = useState<DeviceRow | null>(null);

  /**
   * Devices and analytics load together: the status tiles count the same rows
   * the table lists, so fetching them apart would let the tiles and the badges
   * drift for a moment after a refresh.
   *
   * `silent` distinguishes an auto-refresh from a user-driven load — a silent
   * pass leaves the current rows on screen (no "Loading…" flash) and swaps them
   * only once the new data lands.
   */
  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const [list, stats] = await Promise.all([
          deviceAdminService.listDevices({
            ...filters,
            ordering,
            page,
            page_size: PAGE_SIZE,
          }),
          deviceAdminService.getAnalytics(),
        ]);
        setRows(list.results);
        setPagination(list.pagination);
        setAnalytics(stats);
        setLastRefreshed(new Date());
        setError("");
      } catch (err) {
        console.error("Failed to load device data", err);
        // A failed background refresh must not blank a table someone is
        // reading — keep the last good rows and surface a quiet message.
        setError("Could not refresh devices. Showing the last known data.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters, ordering, page],
  );

  useEffect(() => {
    load();
  }, [load]);

  // A ref holds the latest `load` so the interval never closes over stale
  // filters/page/ordering, and the interval is created ONCE — so an auto
  // refresh never resets what the admin has selected.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Don't burn requests refreshing a tab nobody is looking at.
      if (document.hidden) return;
      loadRef.current(true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Escape closes the detail drawer — the expected way out of a panel, and the
  // only one available without moving the mouse to the corner.
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  /**
   * One search box covering name, version and build.
   *
   * The API has no single param that spans all three: its `search` matches the
   * user's name and app_version (among other text fields) but never the numeric
   * build_number, and combining `search` with `build_number` would AND them.
   * So a purely numeric term is routed to the build filter and anything else to
   * the text search — which is also how people actually type these: "131" means
   * a build, "1.0.4" a version, "Rohit" a person.
   */
  const runSearch = () => {
    const term = searchInput.trim();
    const isBuild = /^\d+$/.test(term);
    setFilters((current) => ({
      // Keep any status the tiles have set — searching within "Online" should
      // stay within Online.
      status: current.status,
      search: isBuild ? "" : term,
      build_number: isBuild ? term : "",
    }));
    setPage(1);
  };

  /**
   * Clear the box AND the applied search in one click.
   *
   * Sets the filters directly rather than calling runSearch(): the state update
   * above is async, so runSearch() would still read the old term. The status
   * filter is preserved, exactly as a normal search does.
   */
  const clearSearch = () => {
    setSearchInput("");
    setFilters((current) => ({ status: current.status, search: "", build_number: "" }));
    setPage(1);
  };

  /** Status tiles are a toggle: clicking the active one clears the filter. */
  const toggleStatus = (status: string) => {
    setFilters((current) => ({
      ...current,
      status: current.status === status ? "" : status,
    }));
    setPage(1);
  };

  const toggleSort = (field: string) => {
    // First click on a new column sorts ascending; clicking the active one flips.
    setOrdering((current) => (current === field ? `-${field}` : field));
    setPage(1);
  };

  const cards = analytics?.cards;
  const charts = analytics?.charts;
  const statusCounts = cards?.status_counts;
  const rules = cards?.status_thresholds;

  /** Active vs Inactive — the same two numbers the cards above report. */
  const activityData = useMemo(() => {
    if (!cards) return [];
    return [
      { name: "Active", count: cards.active_devices },
      { name: "Inactive", count: cards.inactive_devices },
    ].filter((slice) => slice.count > 0);
  }, [cards]);

  return (
    <div className="dm-page">
      <header className="dm-head">
        <div>
          <h1>Device Management</h1>
          <p>
            Live device activity and version adoption.
            {rules
              ? ` Online = active within ${rules.online_within_minutes} min · Idle = within ${rules.idle_within_minutes} min · Inactive = quiet for ${rules.inactive_after_days}+ days.`
              : ""}
          </p>
        </div>
        <div className="dm-head-side">
          <div className="dm-refresh">
            <span className="dm-refresh-info">
              {refreshing
                ? "Refreshing…"
                : lastRefreshed
                  ? `Updated ${relativeTime(lastRefreshed.toISOString())}`
                  : ""}
            </span>
            <button type="button" className="dm-btn" onClick={() => load(true)} disabled={refreshing}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* ---- summary cards ----
          Live status first (clicking one filters the table), then the fleet
          totals. Both read the same analytics payload as the table below. */}
      {cards && (
        <section className="dm-cards">
          <Card
            label="Online"
            value={statusCounts?.online ?? "–"}
            tone="online"
            active={filters.status === "online"}
            onClick={() => toggleStatus("online")}
          />
          <Card
            label="Idle"
            value={statusCounts?.idle ?? "–"}
            tone="idle"
            active={filters.status === "idle"}
            onClick={() => toggleStatus("idle")}
          />
          <Card
            label="Offline"
            value={statusCounts?.offline ?? "–"}
            tone="offline"
            active={filters.status === "offline"}
            onClick={() => toggleStatus("offline")}
          />
          <Card label="Total Devices" value={cards.total_devices} />
          <Card label="Active" value={cards.active_devices} tone="ok" />
          <Card label="Inactive" value={cards.inactive_devices} />
          <Card label="Mobile" value={cards.mobile_devices} />
          <Card label="Web" value={cards.web_devices} />
        </section>
      )}

      {/* ---- charts ---- */}
      {charts && (
        <section className="dm-charts">
          <ChartBox title="Active vs Inactive Users" subtitle="Share of all registered devices by activity status">
            <DistributionPie data={activityData} colors={[ACTIVE_COLOR, INACTIVE_COLOR]} />
          </ChartBox>

          <ChartBox title="App Type Distribution">
            <DistributionPie data={topSlices(charts.app_type_distribution, "app_type")} />
          </ChartBox>
        </section>
      )}

      {/* ---- devices (absorbed the former /Device_Activity page) ----
          Headed explicitly so the search box states what it searches. */}
      <div className="dm-section-head">
        <h2>Devices</h2>
        <p>Every registered device and its live status. Search by name, version or build.</p>
      </div>

      <form
        className="dm-filters"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch();
        }}
      >
        {/* The clear button sits inside the field, so it reads as part of the
            input rather than as a second action next to Search. */}
        <div className="dm-search-wrap">
          <input
            className="dm-input dm-search"
            placeholder="Search by name, version or build…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search devices by name, version or build"
          />
          {searchInput && (
            <button
              type="button"
              className="dm-search-clear"
              onClick={clearSearch}
              aria-label="Clear search"
              title="Clear search"
            >
              <HiXMark />
            </button>
          )}
        </div>
        <button type="submit" className="dm-btn dm-btn-primary">Search</button>
      </form>

      {/* ---- table ---- */}
      <div className="dm-toolbar">
        <span className="dm-count">
          {pagination ? `${pagination.total} device${pagination.total === 1 ? "" : "s"}` : "…"}
          {/* Name the active status filter — the tile highlight is the only
              other cue, and it is off-screen once the table is scrolled to. */}
          {filters.status ? ` · ${filters.status}` : ""}
        </span>
      </div>

      {error && <p className="dm-error">{error}</p>}

      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              {/* Sortable columns are exactly the API's allow-listed ordering
                  fields. Status is derived from last_active rather than stored,
                  so it is not one of them — it stays a plain header rather than
                  offering a sort that would silently do nothing. Relative sorts
                  by last_active, the timestamp it renders. */}
              <th>Status</th>
              <SortHeader label="Name" field="user__name" ordering={ordering} onSort={toggleSort} />
              <SortHeader label="App Type" field="app_type" ordering={ordering} onSort={toggleSort} />
              <SortHeader label="Version" field="app_version" ordering={ordering} onSort={toggleSort} />
              <SortHeader label="Build" field="build_number" ordering={ordering} onSort={toggleSort} />
              <SortHeader label="Relative" field="last_active" ordering={ordering} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="dm-empty">Loading devices…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="dm-empty">No devices match this search</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} onClick={() => setSelected(row)} className="dm-row" title="View device details">
                  {/* The server-derived four-state status, matching what the
                      Online/Idle/Offline tiles count — not the binary
                      is_active registration flag, which would contradict them. */}
                  <td><StatusBadge status={row.status} /></td>
                  <td>{row.user_name || "-"}</td>
                  <td>{row.app_type}</td>
                  <td>{row.app_version}</td>
                  <td className="dm-num">{row.build_number}</td>
                  <td className="dm-rel" title={formatDateTime(row.last_active)}>
                    {relativeTime(row.last_active)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total_pages > 1 && (
        <div className="dm-pagination">
          <button className="dm-pg-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="dm-pg-info">Page {pagination.page} / {pagination.total_pages}</span>
          <button
            className="dm-pg-btn"
            disabled={page >= pagination.total_pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {/* ---- device detail (right-side drawer) ---- */}
      {selected && (
        <div className="dm-drawer-backdrop" onClick={() => setSelected(null)}>
          <aside
            className="dm-drawer"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Device details"
          >
            <div className="dm-drawer-head">
              <div>
                <h2>Device Details</h2>
                {/* The same derived status the row's badge shows. */}
                <StatusBadge status={selected.status} />
              </div>
              <button
                type="button"
                className="dm-icon-btn"
                onClick={() => setSelected(null)}
                aria-label="Close device details"
                title="Close"
              >
                <HiXMark />
              </button>
            </div>
            <div className="dm-drawer-body">
              <h4>User</h4>
              <dl className="dm-dl">
                <dt>Name</dt><dd>{selected.user_name || "-"}</dd>
                <dt>Username</dt><dd>{selected.username}</dd>
                <dt>Email</dt><dd>{selected.email || "-"}</dd>
                <dt>Role</dt><dd>{selected.role || "-"}</dd>
              </dl>
              <h4>Application</h4>
              <dl className="dm-dl">
                <dt>Platform</dt><dd>{selected.platform}</dd>
                <dt>App Type</dt><dd>{selected.app_type}</dd>
                <dt>Version</dt><dd>{selected.app_version}</dd>
                <dt>Build Number</dt><dd>{selected.build_number}</dd>
              </dl>
              <h4>Device</h4>
              <dl className="dm-dl">
                <dt>Device ID</dt><dd className="dm-mono">{selected.device_id}</dd>
                <dt>Device Name</dt><dd>{selected.device_name || "-"}</dd>
                <dt>Manufacturer</dt><dd>{selected.manufacturer || "-"}</dd>
                <dt>Model</dt><dd>{selected.device_model || "-"}</dd>
                <dt>Browser</dt><dd>{selected.browser_name ? `${selected.browser_name} ${selected.browser_version}` : "-"}</dd>
                <dt>Operating System</dt><dd>{selected.os_name ? `${selected.os_name} ${selected.os_version}` : "-"}</dd>
                <dt>Language</dt><dd>{selected.language || "-"}</dd>
                <dt>Timezone</dt><dd>{selected.timezone || "-"}</dd>
              </dl>
              <h4>Activity</h4>
              <dl className="dm-dl">
                <dt>First Login</dt><dd>{formatDateTime(selected.first_login)}</dd>
                <dt>Last Login</dt><dd>{formatDateTime(selected.last_login)}</dd>
                <dt>Last Active</dt><dd>{formatDateTime(selected.last_active)}</dd>
                <dt>Last Seen</dt><dd>{relativeTime(selected.last_active)}</dd>
                {/* "Status" here used to read is_active as Active/Inactive,
                    which contradicted the row badge: is_active is the
                    registration flag, not the live activity status. Both are
                    now named for what they actually are. */}
                <dt>Current Status</dt><dd><StatusBadge status={selected.status} /></dd>
                <dt>Registration</dt><dd>{selected.is_active ? "Active" : "Deactivated"}</dd>
                <dt>Created</dt><dd>{formatDateTime(selected.created_at)}</dd>
                <dt>Updated</dt><dd>{formatDateTime(selected.updated_at)}</dd>
              </dl>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
