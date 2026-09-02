import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  deviceAdminService,
  type CountRow,
  type DeviceFilters,
  type DeviceRow,
  type MobilePlatform,
  type PlatformAdoption,
  type VersionPolicy,
  type VersionPolicyStat,
} from "../services/deviceAdminService";
import { HiXMark } from "react-icons/hi2";
import StatusBadge from "../components/StatusBadge";
import relativeTime from "../utils/relativeTime";
import "../styles/Device_Management.css";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// The devices service exports a `Pagination` TYPE, so the component is
// aliased rather than renaming a shared API type for one call site.
import { Pagination as Pager } from "@/components/ui/pagination";

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

/** Per-row Update Status pill: latest = green, old = red, unknown = neutral. */
function UpdateBadge({ status }: { status: DeviceRow["update_status"] }) {
  if (status === "latest") return <span className="dm-upd dm-upd-latest">Latest</span>;
  if (status === "old") return <span className="dm-upd dm-upd-old">Old</span>;
  // "unknown" — no policy for this platform (or it is the web). A dash reads as
  // "not applicable" rather than implying the device is up to date or not.
  return <span className="dm-upd dm-upd-unknown" title="No version policy for this platform">—</span>;
}

const MOBILE_PLATFORMS: { key: MobilePlatform; label: string }[] = [
  { key: "ANDROID", label: "Android" },
  { key: "IOS", label: "iOS" },
];

/** One platform's policy form. Loads existing values; saves via PUT. */
function PolicyForm({
  platform,
  label,
  initial,
  onSaved,
}: {
  platform: MobilePlatform;
  label: string;
  initial: VersionPolicy | null;
  onSaved: () => void;
}) {
  const [version, setVersion] = useState(initial?.required_version ?? "");
  const [build, setBuild] = useState(
    initial?.required_build != null ? String(initial.required_build) : "",
  );
  const [storeUrl, setStoreUrl] = useState(initial?.store_url ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Re-sync when the parent reloads policies (e.g. after saving the other one).
  useEffect(() => {
    setVersion(initial?.required_version ?? "");
    setBuild(initial?.required_build != null ? String(initial.required_build) : "");
    setStoreUrl(initial?.store_url ?? "");
  }, [initial]);

  const save = async () => {
    setMsg(null);
    const buildNum = Number(build);
    if (!version.trim() || !Number.isInteger(buildNum) || buildNum < 1) {
      setMsg({ ok: false, text: "Enter a version and a whole build number (≥ 1)." });
      return;
    }
    setSaving(true);
    try {
      await deviceAdminService.saveVersionPolicy({
        platform,
        required_version: version.trim(),
        required_build: buildNum,
        store_url: storeUrl.trim(),
      });
      setMsg({ ok: true, text: "Saved." });
      onSaved();
    } catch (err) {
      // Surface the server's field error (e.g. an invalid store URL) rather
      // than a generic failure.
      const data = (err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } })
        ?.response?.data;
      const firstError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined;
      setMsg({ ok: false, text: firstError || data?.message || "Could not save. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dm-policy">
      <h3>{label}</h3>
      <label className="dm-policy-field">
        <span>Required Version</span>
        <input
          className="dm-input"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="e.g. 1.0.5"
        />
      </label>
      <label className="dm-policy-field">
        <span>Required Build</span>
        <input
          className="dm-input"
          value={build}
          onChange={(e) => setBuild(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 5"
        />
      </label>
      <label className="dm-policy-field">
        <span>Store URL</span>
        <input
          className="dm-input"
          value={storeUrl}
          onChange={(e) => setStoreUrl(e.target.value)}
          placeholder="https://play.google.com/store/apps/…"
        />
      </label>
      <div className="dm-policy-actions">
        <button type="button" className="dm-btn dm-btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && (
          <span className={msg.ok ? "dm-policy-ok" : "dm-policy-err"}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

/** Version-adoption bars for one platform: build → users, newest first.
 *  The required build is highlighted; everything below it reads as "old".
 *  A footer summarises how many devices are on the latest build vs old,
 *  counting the bars above (this replaces the old Latest/Old KPI cards). */
function AdoptionChart({
  adoption,
  stat,
}: {
  adoption?: PlatformAdoption;
  stat?: VersionPolicyStat;
}) {
  const data = useMemo(
    () =>
      (adoption?.builds ?? []).map((b) => ({
        name: `Build ${b.build_number}`,
        users: b.users,
        devices: b.devices,
        isRequired: adoption?.required_build === b.build_number,
      })),
    [adoption],
  );

  // The latest/old split. Shown even when there are no bars yet, so the footer
  // always states the current picture ("0 devices"). "No policy" when the
  // platform has no required build set — old/latest is undefined without one.
  const hasPolicy = stat?.required_build != null;
  const footer = (
    <div className="dm-adopt-foot">
      {hasPolicy ? (
        <>
          <span className="dm-adopt-stat">
            <span className="dm-adopt-dot dm-adopt-dot-latest" aria-hidden="true" />
            <b>{stat?.latest ?? 0}</b> latest
          </span>
          <span className="dm-adopt-stat">
            <span className="dm-adopt-dot dm-adopt-dot-old" aria-hidden="true" />
            <b>{stat?.old ?? 0}</b> old
          </span>
        </>
      ) : (
        <span className="dm-adopt-nopolicy">No version policy set — set a required build to classify devices.</span>
      )}
    </div>
  );

  if (!data.length) {
    return (
      <>
        <p className="dm-empty-sm">No devices yet</p>
        {footer}
      </>
    );
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 34 + 20)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 12, fill: "#475569" }} />
          <Tooltip
            formatter={(value, _n, item) => [
              `${value} users · ${(item?.payload as { devices: number }).devices} devices`,
              "",
            ]}
            labelStyle={{ fontWeight: 600 }}
          />
          <Bar dataKey="users" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: "#475569" }}>
            {data.map((row) => (
              <Cell
                key={row.name}
                // Required build = green (latest); anything else = red (old).
                // Same language as the footer and the table's Update column.
                fill={row.isRequired ? ACTIVE_COLOR : INACTIVE_COLOR}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {footer}
    </>
  );
}

/** Stable empty, so the table does not see a new array each poll. */
const NO_DEVICES: DeviceRow[] = [];

export default function Device_Management() {
  const [filters, setFilters] = useState<DeviceFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [ordering, setOrdering] = useState(DEFAULT_ORDERING);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DeviceRow | null>(null);
  // Mobile version policies. Separate key from the device poll: they change
  // only when an admin edits them.
  const { data: policies = null } = useQuery({
    queryKey: ["devices", "version-policy"],
    queryFn: () => deviceAdminService.getVersionPolicies(),
  });

  /**
   * Devices and analytics load together: the status tiles count the same rows
   * the table lists, so fetching them apart would let the tiles and the badges
   * drift for a moment after a refresh.
   *
   * The key is the SPREAD filter fields, not the `filters` object — it is
   * rebuilt by updater functions on every change, so keying on its identity
   * would refetch on every render.
   *
   * `refetchInterval` replaces a hand-rolled 60s `setInterval` plus a `loadRef`
   * that existed only to keep it from closing over stale filters.
   *
   * BEHAVIOUR CHANGE, knowingly: the old guard was `document.hidden`, so a
   * visible-but-unfocused tab kept refreshing. `refetchIntervalInBackground:
   * false` keys off window FOCUS, so that tab now stops until it is focused.
   */
  const deviceQuery = useQuery({
    queryKey: [
      "devices",
      filters.search,
      filters.build_number,
      filters.status,
      ordering,
      page,
    ],
    queryFn: async () => {
      const [list, stats] = await Promise.all([
        deviceAdminService.listDevices({ ...filters, ordering, page, page_size: PAGE_SIZE }),
        deviceAdminService.getAnalytics(),
      ]);
      return { rows: list.results, pagination: list.pagination, analytics: stats };
    },
    // Keeps the current page on screen while the next one loads, which is what
    // the old `silent` flag did by hand.
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  const rows = deviceQuery.data?.rows ?? NO_DEVICES;
  const pagination = deviceQuery.data?.pagination ?? null;
  const analytics = deviceQuery.data?.analytics ?? null;
  const loading = deviceQuery.isPending;
  const refreshing = deviceQuery.isFetching && !deviceQuery.isPending;
  const lastRefreshed = deviceQuery.dataUpdatedAt ? new Date(deviceQuery.dataUpdatedAt) : null;
  // A failed background refresh must not blank a table someone is reading —
  // TanStack keeps the last good data, so this is only a message.
  const error = deviceQuery.isError ? "Could not refresh devices. Showing the last known data." : "";

  const load = () => queryClient.invalidateQueries({ queryKey: ["devices"] });

  // After saving a policy, refresh the policy forms AND the analytics/table so
  // the new latest/old counts and Update Status column reflect it at once.
  const onPolicySaved = () => void queryClient.invalidateQueries({ queryKey: ["devices"] });

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
            <button type="button" className="dm-btn" onClick={() => load()} disabled={refreshing}>
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
          {/* Active/Inactive/Mobile/Web and the four Latest/Old tiles were
              removed: the latest-vs-old counts now live in the footer of each
              Version Adoption chart, next to the bars they summarise. */}
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

          <ChartBox title="Android Version Adoption" subtitle="Users per build — the required build is green">
            <AdoptionChart
              adoption={charts.version_adoption?.ANDROID}
              stat={cards?.version_policy?.ANDROID}
            />
          </ChartBox>

          <ChartBox title="iOS Version Adoption" subtitle="Users per build — the required build is green">
            <AdoptionChart
              adoption={charts.version_adoption?.IOS}
              stat={cards?.version_policy?.IOS}
            />
          </ChartBox>
        </section>
      )}

      {/* ---- Mobile Version Policy ----
          Only Android and iOS are ever gated. Saving here sets the minimum
          acceptable build; out-of-date mobile clients get an update screen. The
          web is never validated and is deliberately absent. */}
      <div className="dm-section-head">
        <h2>Mobile Version Policy</h2>
        <p>
          The required build for each mobile platform. Devices below it are asked
          to update. The web is never version-checked.
        </p>
      </div>
      <section className="dm-policies">
        {MOBILE_PLATFORMS.map(({ key, label }) => (
          <PolicyForm
            key={key}
            platform={key}
            label={label}
            initial={policies?.[key] ?? null}
            onSaved={onPolicySaved}
          />
        ))}
      </section>

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
        <Table density="compact">
          <TableHeader>
            <TableRow>
              {/* Sortable columns are exactly the API's allow-listed ordering
                  fields. Status is derived from last_active rather than stored,
                  so it is not one of them — it stays a plain header rather than
                  offering a sort that would silently do nothing. Relative sorts
                  by last_active, the timestamp it renders. */}
              <TableHead>Status</TableHead>
              <SortHeader label="Name" field="user__name" ordering={ordering} onSort={toggleSort} />
              <SortHeader label="App Type" field="app_type" ordering={ordering} onSort={toggleSort} />
              <SortHeader label="Version" field="app_version" ordering={ordering} onSort={toggleSort} />
              <SortHeader label="Build" field="build_number" ordering={ordering} onSort={toggleSort} />
              {/* Derived from the version policy, server-side. Not sortable: it's
                  computed, not a stored column the API can order by. */}
              <TableHead>Update</TableHead>
              <SortHeader label="Relative" field="last_active" ordering={ordering} onSort={toggleSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="dm-empty">Loading devices…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="dm-empty">No devices match this search</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} onClick={() => setSelected(row)} className="dm-row" title="View device details">
                  {/* The server-derived four-state status, matching what the
                      Online/Idle/Offline tiles count — not the binary
                      is_active registration flag, which would contradict them. */}
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell>{row.user_name || "-"}</TableCell>
                  <TableCell>{row.app_type}</TableCell>
                  <TableCell>{row.app_version}</TableCell>
                  <TableCell className="dm-num">{row.build_number}</TableCell>
                  <TableCell><UpdateBadge status={row.update_status} /></TableCell>
                  <TableCell className="dm-rel" title={formatDateTime(row.last_active)}>
                    {relativeTime(row.last_active)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.total_pages > 1 && (
        <Pager
          page={pagination.page}
          totalPages={pagination.total_pages}
          onPageChange={setPage}
        />
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
