import { useCallback, useEffect, useRef, useState } from "react";
import StatusBadge from "../components/StatusBadge";
import {
  deviceAdminService,
  type AnalyticsCards,
  type DeviceFilters,
  type DeviceRow,
  type Pagination,
} from "../services/deviceAdminService";
import relativeTime from "../utils/relativeTime";
import "../styles/Device_Activity.css";

/**
 * Device Activity — live status of every registered device.
 *
 * Status is derived by the SERVER from last_active (online / idle / offline /
 * inactive) and returned per row, so the badge, the ?status= filter and the
 * summary cards can never disagree — and a skewed browser clock can't change
 * what a badge says. Nothing about status is stored in the database.
 *
 * Everything is server-side: pagination, search, filtering and sorting. The
 * browser never holds the full device table.
 */

const PLATFORMS = ["ANDROID", "IOS", "WEB", "DESKTOP"];
const APP_TYPES = ["MOBILE", "TABLET", "WEB", "ADMIN_WEB", "PARTNER_WEB", "DESKTOP"];
const STATUSES = ["online", "idle", "offline", "inactive"] as const;
const PAGE_SIZE = 25;
const REFRESH_MS = 60_000;

const EMPTY_FILTERS: DeviceFilters = {
  search: "",
  status: "",
  platform: "",
  app_type: "",
  app_version: "",
  build_number: "",
  browser_name: "",
  os_name: "",
  date_from: "",
  date_to: "",
};

const SORTABLE: { key: string; label: string }[] = [
  { key: "user__name", label: "User Name" },
  { key: "app_version", label: "Version" },
  { key: "build_number", label: "Build" },
  { key: "last_login", label: "Last Login" },
  { key: "last_active", label: "Last Active" },
];

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

function Card({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`da-card ${tone ? `da-card-${tone}` : ""} ${active ? "da-card-active" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="da-card-value">{value}</span>
      <span className="da-card-label">{label}</span>
    </button>
  );
}

export default function Device_Activity() {
  const [filters, setFilters] = useState<DeviceFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState("-last_active");

  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [cards, setCards] = useState<AnalyticsCards | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [selected, setSelected] = useState<DeviceRow | null>(null);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput }));
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  /**
   * `silent` distinguishes an auto-refresh from a user-driven load: a silent
   * pass leaves the current rows on screen (no "Loading…" flash) and only
   * swaps them once the new data lands.
   */
  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const [list, analytics] = await Promise.all([
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
        setCards(analytics.cards);
        setLastRefreshed(new Date());
        setError("");
      } catch (err) {
        console.error("Failed to load device activity", err);
        // A failed background refresh must not blank a table the admin is
        // reading — keep the last good rows and surface a quiet message.
        setError("Could not refresh device activity. Showing the last known data.");
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

  // ---- auto refresh -------------------------------------------------------
  // A ref holds the latest `load` so the interval never closes over stale
  // filters/page/ordering, and the interval itself is created ONCE — so a
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

  const setFilter = (key: keyof DeviceFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const toggleStatus = (status: string) => {
    setFilter("status", filters.status === status ? "" : status);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchInput("");
    setPage(1);
  };

  const sortBy = (key: string) => {
    setOrdering((current) => (current === key ? `-${key}` : key));
    setPage(1);
  };

  const sortIndicator = (key: string) => {
    if (ordering === key) return " ▲";
    if (ordering === `-${key}`) return " ▼";
    return "";
  };

  const status = cards?.status_counts;
  const rules = cards?.status_thresholds;

  return (
    <div className="da-page">
      <header className="da-head">
        <div>
          <h1>Device Activity</h1>
          <p>
            Live status of every registered device.
            {rules
              ? ` Online = active within ${rules.online_within_minutes} min · Idle = within ${rules.idle_within_minutes} min · Inactive = quiet for ${rules.inactive_after_days}+ days.`
              : ""}
          </p>
        </div>
        <div className="da-refresh">
          <span className="da-refresh-info">
            {refreshing
              ? "Refreshing…"
              : lastRefreshed
                ? `Updated ${relativeTime(lastRefreshed.toISOString())}`
                : ""}
          </span>
          <button type="button" className="da-btn" onClick={() => load(true)} disabled={refreshing}>
            Refresh
          </button>
        </div>
      </header>

      {/* ---- summary cards (clicking a status card filters the table) ---- */}
      <section className="da-cards">
        <Card
          label="Online"
          value={status?.online ?? "–"}
          tone="online"
          active={filters.status === "online"}
          onClick={() => toggleStatus("online")}
        />
        <Card
          label="Idle"
          value={status?.idle ?? "–"}
          tone="idle"
          active={filters.status === "idle"}
          onClick={() => toggleStatus("idle")}
        />
        <Card
          label="Offline"
          value={status?.offline ?? "–"}
          tone="offline"
          active={filters.status === "offline"}
          onClick={() => toggleStatus("offline")}
        />
        <Card
          label="Inactive"
          value={status?.inactive ?? "–"}
          tone="inactive"
          active={filters.status === "inactive"}
          onClick={() => toggleStatus("inactive")}
        />
        <Card label="Total Devices" value={cards?.total_devices ?? "–"} />
        <Card label="Android" value={cards?.android_devices ?? "–"} />
        <Card label="Web" value={cards?.web_devices ?? "–"} />
      </section>

      {/* ---- filters ---- */}
      <section className="da-filters">
        <input
          className="da-input da-search"
          placeholder="Search name, username, email, device ID, version, browser…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <select className="da-input" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </option>
          ))}
        </select>
        <select className="da-input" value={filters.platform} onChange={(e) => setFilter("platform", e.target.value)}>
          <option value="">All platforms</option>
          {PLATFORMS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="da-input" value={filters.app_type} onChange={(e) => setFilter("app_type", e.target.value)}>
          <option value="">All app types</option>
          {APP_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input className="da-input" placeholder="Version" value={filters.app_version} onChange={(e) => setFilter("app_version", e.target.value)} />
        <input className="da-input" placeholder="Build" inputMode="numeric" value={filters.build_number} onChange={(e) => setFilter("build_number", e.target.value)} />
        <input className="da-input" placeholder="Browser" value={filters.browser_name} onChange={(e) => setFilter("browser_name", e.target.value)} />
        <input className="da-input" placeholder="OS" value={filters.os_name} onChange={(e) => setFilter("os_name", e.target.value)} />
        <label className="da-date">
          From
          <input type="date" className="da-input" value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} />
        </label>
        <label className="da-date">
          To
          <input type="date" className="da-input" value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} />
        </label>
        <button type="button" className="da-btn" onClick={resetFilters}>Reset</button>
      </section>

      <div className="da-toolbar">
        <span className="da-count">
          {pagination ? `${pagination.total} device${pagination.total === 1 ? "" : "s"}` : "…"}
        </span>
        <span className="da-sorts">
          Sort:
          {SORTABLE.map((column) => (
            <button
              key={column.key}
              type="button"
              className={`da-sort ${ordering === column.key || ordering === `-${column.key}` ? "da-sort-on" : ""}`}
              onClick={() => sortBy(column.key)}
            >
              {column.label}{sortIndicator(column.key)}
            </button>
          ))}
        </span>
      </div>

      {error && <p className="da-error">{error}</p>}

      <div className="da-table-wrap">
        <table className="da-table">
          <thead>
            <tr>
              <th>Status</th>
              <th className="da-th-sort" onClick={() => sortBy("user__name")}>User Name{sortIndicator("user__name")}</th>
              <th>Username</th>
              <th>Platform</th>
              <th>App Type</th>
              <th className="da-th-sort" onClick={() => sortBy("app_version")}>Version{sortIndicator("app_version")}</th>
              <th className="da-th-sort" onClick={() => sortBy("build_number")}>Build{sortIndicator("build_number")}</th>
              <th>Device Name</th>
              <th>Manufacturer</th>
              <th>Model</th>
              <th>Browser</th>
              <th>Operating System</th>
              <th>Language</th>
              <th className="da-th-sort" onClick={() => sortBy("last_login")}>Last Login{sortIndicator("last_login")}</th>
              <th className="da-th-sort" onClick={() => sortBy("last_active")}>Last Active{sortIndicator("last_active")}</th>
              <th>Relative</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={16} className="da-empty">Loading device activity…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={16} className="da-empty">No devices match these filters</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="da-row" onClick={() => setSelected(row)} title="View device details">
                  <td><StatusBadge status={row.status} /></td>
                  <td>{row.user_name || "-"}</td>
                  <td>{row.username}</td>
                  <td>{row.platform}</td>
                  <td>{row.app_type}</td>
                  <td>{row.app_version}</td>
                  <td>{row.build_number}</td>
                  <td>{row.device_name || "-"}</td>
                  <td>{row.manufacturer || "-"}</td>
                  <td>{row.device_model || "-"}</td>
                  <td>{row.browser_name ? `${row.browser_name} ${row.browser_version}` : "-"}</td>
                  <td>{row.os_name ? `${row.os_name} ${row.os_version}` : "-"}</td>
                  <td>{row.language || "-"}</td>
                  <td>{formatDateTime(row.last_login)}</td>
                  <td>{formatDateTime(row.last_active)}</td>
                  <td className="da-rel">{relativeTime(row.last_active)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total_pages > 1 && (
        <div className="da-pagination">
          <button className="da-pg-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="da-pg-info">Page {pagination.page} / {pagination.total_pages}</span>
          <button className="da-pg-btn" disabled={page >= pagination.total_pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      {/* ---- details drawer ---- */}
      {selected && (
        <div className="da-drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="da-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="da-drawer-head">
              <div>
                <h2>{selected.user_name || selected.username}</h2>
                <StatusBadge status={selected.status} />
              </div>
              <button type="button" className="da-btn" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div className="da-drawer-body">
              <h4>User</h4>
              <dl className="da-dl">
                <dt>Name</dt><dd>{selected.user_name || "-"}</dd>
                <dt>Username</dt><dd>{selected.username}</dd>
                <dt>Email</dt><dd>{selected.email || "-"}</dd>
                <dt>Role</dt><dd>{selected.role || "-"}</dd>
              </dl>

              <h4>Application</h4>
              <dl className="da-dl">
                <dt>Current Version</dt><dd>{selected.app_version}</dd>
                <dt>Build Number</dt><dd>{selected.build_number}</dd>
                <dt>Platform</dt><dd>{selected.platform}</dd>
                <dt>App Type</dt><dd>{selected.app_type}</dd>
              </dl>

              <h4>Device</h4>
              <dl className="da-dl">
                <dt>Device ID</dt><dd className="da-mono">{selected.device_id}</dd>
                <dt>Device Name</dt><dd>{selected.device_name || "-"}</dd>
                <dt>Manufacturer</dt><dd>{selected.manufacturer || "-"}</dd>
                <dt>Model</dt><dd>{selected.device_model || "-"}</dd>
                <dt>Browser</dt><dd>{selected.browser_name ? `${selected.browser_name} ${selected.browser_version}` : "-"}</dd>
                <dt>Operating System</dt><dd>{selected.os_name ? `${selected.os_name} ${selected.os_version}` : "-"}</dd>
                <dt>Language</dt><dd>{selected.language || "-"}</dd>
                <dt>Timezone</dt><dd>{selected.timezone || "-"}</dd>
              </dl>

              <h4>Activity</h4>
              <dl className="da-dl">
                <dt>Current Status</dt><dd><StatusBadge status={selected.status} /></dd>
                <dt>First Login</dt><dd>{formatDateTime(selected.first_login)}</dd>
                <dt>Last Login</dt><dd>{formatDateTime(selected.last_login)}</dd>
                <dt>Last Active</dt><dd>{formatDateTime(selected.last_active)}</dd>
                <dt>Last Seen</dt><dd>{relativeTime(selected.last_active)}</dd>
                <dt>Registration</dt><dd>{selected.is_active ? "Active" : "Deactivated"}</dd>
              </dl>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
