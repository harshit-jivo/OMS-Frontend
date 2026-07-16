import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import {
  deviceAdminService,
  type Analytics,
  type CountRow,
  type DeviceFilters,
  type DeviceRow,
  type Pagination,
} from "../services/deviceAdminService";
import "../styles/Device_Management.css";

/**
 * Device Management — searchable inventory of every registered device plus
 * fleet-level version analytics.
 *
 * Reads the existing devices_user_device table via the admin API. Pagination,
 * filtering and search are ALL server-side; this page never holds the full
 * table in memory.
 */

// The app's established categorical chart palette (see Dashboard.tsx). Reused
// rather than redefined so every chart in the product reads as one system.
// Hues are assigned by fixed index and never cycled.
const PALETTE = ["#0f766e", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#4f46e5", "#ea580c"];
const GRID = "#dbe4ea";
const MAX_SLICES = 8; // a 9th category folds into "Other" — never a new hue

const PLATFORMS = ["ANDROID", "IOS", "WEB", "DESKTOP"];
const APP_TYPES = ["MOBILE", "TABLET", "WEB", "ADMIN_WEB", "PARTNER_WEB", "DESKTOP"];
const PAGE_SIZE = 25;

const EMPTY_FILTERS: DeviceFilters = {
  search: "",
  platform: "",
  app_type: "",
  app_version: "",
  build_number: "",
  browser_name: "",
  os_name: "",
  is_active: "",
  user_id: "",
  date_from: "",
  date_to: "",
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

const formatDate = (value?: string | null): string => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
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

function Card({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "ok" }) {
  return (
    <div className={`dm-card ${tone ? `dm-card-${tone}` : ""}`}>
      <span className="dm-card-value">{value}</span>
      <span className="dm-card-label">{label}</span>
    </div>
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

/** Pie with a legend — identity is never conveyed by colour alone. */
function DistributionPie({ data }: { data: { name: string; count: number }[] }) {
  if (!data.length) return <p className="dm-empty-sm">No data</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} stroke="#ffffff" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip />
        <Legend iconType="circle" wrapperStyle={{ fontSize: "0.75rem" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function Device_Management() {
  const [filters, setFilters] = useState<DeviceFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DeviceRow | null>(null);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput }));
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await deviceAdminService.listDevices({
        ...filters,
        page,
        page_size: PAGE_SIZE,
      });
      setRows(data.results);
      setPagination(data.pagination);
    } catch (err) {
      console.error("Failed to load devices", err);
      setError("Could not load devices. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    deviceAdminService
      .getAnalytics()
      .then(setAnalytics)
      .catch((err) => console.error("Failed to load analytics", err));
  }, []);

  const setFilter = (key: keyof DeviceFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchInput("");
    setPage(1);
  };

  const cards = analytics?.cards;
  const charts = analytics?.charts;

  const versionBars = useMemo(() => {
    if (!charts) return [];
    return (charts.version_distribution || [])
      .slice(0, 10)
      .map((row) => ({
        name: `${row.app_version} (${row.build_number})`,
        platform: String(row.platform),
        count: Number(row.count) || 0,
      }));
  }, [charts]);

  const latestText = cards?.latest_releases?.length
    ? cards.latest_releases
        .map((release) => `${release.platform}/${release.app_type} v${release.version} (${release.build_number})`)
        .join("  ·  ")
    : "No release configured";

  return (
    <div className="dm-page">
      <header className="dm-head">
        <div>
          <h1>Device Management</h1>
          <p>Registered devices and version adoption across mobile and web.</p>
        </div>
        <span className="dm-latest" title="Latest release per platform / app type">
          {latestText}
        </span>
      </header>

      {/* ---- summary cards ---- */}
      {cards && (
        <section className="dm-cards">
          <Card label="Total Devices" value={cards.total_devices} />
          <Card label="Active" value={cards.active_devices} tone="ok" />
          <Card label="Inactive" value={cards.inactive_devices} />
          <Card label="Mobile" value={cards.mobile_devices} />
          <Card label="Web" value={cards.web_devices} />
          <Card label="Android" value={cards.android_devices} />
          <Card label="iOS" value={cards.ios_devices} />
          <Card label="Desktop Browsers" value={cards.desktop_browsers} />
          <Card label="Active Today" value={cards.devices_active_today} tone="ok" />
          <Card label="On Latest Build" value={cards.on_latest_devices} tone="ok" />
          <Card label="Outdated" value={cards.outdated_devices} tone="warn" />
        </section>
      )}

      {/* ---- charts ---- */}
      {charts && (
        <section className="dm-charts">
          <ChartBox title="Version Distribution" subtitle="Top 10 builds by device count">
            {versionBars.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={versionBars} margin={{ top: 8, right: 8, left: -18, bottom: 46 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="name"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={60}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip />
                  {/* Single series -> the title names it; no legend box needed.
                      Values are labelled on the bars so the reading never
                      depends on colour alone. */}
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={38} label={{ position: "top", fontSize: 10, fill: "#475569" }}>
                    {versionBars.map((entry, index) => (
                      <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="dm-empty-sm">No data</p>
            )}
          </ChartBox>

          <ChartBox title="Platform Distribution">
            <DistributionPie data={topSlices(charts.platform_distribution, "platform")} />
          </ChartBox>

          <ChartBox title="App Type Distribution">
            <DistributionPie data={topSlices(charts.app_type_distribution, "app_type")} />
          </ChartBox>

          <ChartBox title="Browser Distribution">
            <DistributionPie data={topSlices(charts.browser_distribution, "browser_name")} />
          </ChartBox>

          <ChartBox title="Operating System Distribution">
            <DistributionPie data={topSlices(charts.os_distribution, "os_name")} />
          </ChartBox>

          <ChartBox
            title="Devices by Last Seen"
            subtitle="Devices whose last activity fell on each day (last 14 days). Not a true daily-active count — last_active is a single timestamp."
          >
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={charts.devices_by_last_seen} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="dmSeen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PALETTE[0]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={PALETTE[0]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip labelFormatter={(value) => formatDate(String(value))} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={PALETTE[0]}
                  strokeWidth={2}
                  fill="url(#dmSeen)"
                  dot={{ r: 3, fill: PALETTE[0] }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>
        </section>
      )}

      {/* ---- filters ---- */}
      <section className="dm-filters">
        <input
          className="dm-input dm-search"
          placeholder="Search name, username, email, device ID, browser, version…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <select className="dm-input" value={filters.platform} onChange={(e) => setFilter("platform", e.target.value)}>
          <option value="">All platforms</option>
          {PLATFORMS.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select className="dm-input" value={filters.app_type} onChange={(e) => setFilter("app_type", e.target.value)}>
          <option value="">All app types</option>
          {APP_TYPES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <input
          className="dm-input"
          placeholder="Version"
          value={filters.app_version}
          onChange={(e) => setFilter("app_version", e.target.value)}
        />
        <input
          className="dm-input"
          placeholder="Build"
          inputMode="numeric"
          value={filters.build_number}
          onChange={(e) => setFilter("build_number", e.target.value)}
        />
        <input
          className="dm-input"
          placeholder="Browser"
          value={filters.browser_name}
          onChange={(e) => setFilter("browser_name", e.target.value)}
        />
        <input
          className="dm-input"
          placeholder="OS"
          value={filters.os_name}
          onChange={(e) => setFilter("os_name", e.target.value)}
        />
        <select className="dm-input" value={filters.is_active} onChange={(e) => setFilter("is_active", e.target.value)}>
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <label className="dm-date">
          From
          <input type="date" className="dm-input" value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} />
        </label>
        <label className="dm-date">
          To
          <input type="date" className="dm-input" value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} />
        </label>
        <button type="button" className="dm-btn" onClick={resetFilters}>Reset</button>
      </section>

      {/* ---- table ---- */}
      <div className="dm-toolbar">
        <span className="dm-count">
          {pagination ? `${pagination.total} device${pagination.total === 1 ? "" : "s"}` : "…"}
        </span>
      </div>

      {error && <p className="dm-error">{error}</p>}

      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Username</th>
              <th>Platform</th>
              <th>App Type</th>
              <th>Version</th>
              <th>Build</th>
              <th>Device</th>
              <th>Manufacturer</th>
              <th>Model</th>
              <th>Browser</th>
              <th>OS</th>
              <th>Language</th>
              <th>Timezone</th>
              <th>First Login</th>
              <th>Last Login</th>
              <th>Last Active</th>
              <th>Status</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={19} className="dm-empty">Loading devices…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={19} className="dm-empty">No devices match these filters</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} onClick={() => setSelected(row)} className="dm-row" title="View device details">
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
                  <td>{row.timezone || "-"}</td>
                  <td>{formatDateTime(row.first_login)}</td>
                  <td>{formatDateTime(row.last_login)}</td>
                  <td>{formatDateTime(row.last_active)}</td>
                  <td>
                    <span className={row.is_active ? "dm-badge-ok" : "dm-badge-off"}>
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>{formatDateTime(row.updated_at)}</td>
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

      {/* ---- device detail ---- */}
      {selected && (
        <div className="dm-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="dm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="dm-modal-head">
              <h2>Device Details</h2>
              <button type="button" className="dm-btn" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div className="dm-modal-body">
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
                <dt>Status</dt><dd>{selected.is_active ? "Active" : "Inactive"}</dd>
                <dt>Created</dt><dd>{formatDateTime(selected.created_at)}</dd>
                <dt>Updated</dt><dd>{formatDateTime(selected.updated_at)}</dd>
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
