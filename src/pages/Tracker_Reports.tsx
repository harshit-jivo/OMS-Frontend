import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HiArrowDownTray, HiClock, HiExclamationTriangle, HiCheckCircle, HiInboxStack } from "react-icons/hi2";
import * as XLSX from "xlsx";
import trackerService from "../services/trackerService";
import type { Lookups, ReportData, ReportFilters } from "../services/trackerService";
import "../styles/Tracker.css";

const AGE_COLORS = ["#10b981", "#f59e0b", "#f97316", "#ef4444"];

export default function Tracker_Reports() {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    trackerService.getLookups().then(setLookups).catch(() => {});
    load();
  }, []);

  const load = async (f: ReportFilters = filters) => {
    setLoading(true);
    try {
      setData(await trackerService.getReports(f));
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet([data.summary]), "Summary");
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(data.pending_by_stage), "Pending");
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(data.avg_days_per_stage), "Avg Days");
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(data.bottleneck_by_person), "By Person");
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(data.bottleneck_by_vendor), "By Vendor");
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(data.bottleneck_by_category), "By Category");
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(data.ageing), "Ageing");
    XLSX.writeFile(wb, "tracker-report.xlsx");
  };

  const setF = (k: keyof ReportFilters, v: string | number) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));

  const kpi = (icon: React.ReactNode, label: string, value: React.ReactNode, tone: string) => (
    <div className="trk-card" style={{ margin: 0, flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 26, color: tone }}>{icon}</div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{value}</div>
          <div className="trk-sub">{label}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="trk-page">
      <div className="trk-header">
        <div>
          <h1>Tracker Reports</h1>
          <div className="trk-sub">Turnaround, bottlenecks and ageing across the invoice flow.</div>
        </div>
        <button className="trk-btn trk-btn-success" onClick={exportExcel} disabled={!data}>
          <HiArrowDownTray /> Export to Excel
        </button>
      </div>

      {/* Filters */}
      <div className="trk-actionbar" style={{ alignItems: "flex-end", gap: 14 }}>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>From</label>
          <input type="date" value={filters.from || ""} onChange={(e) => setF("from", e.target.value)} />
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>To</label>
          <input type="date" value={filters.to || ""} onChange={(e) => setF("to", e.target.value)} />
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Branch</label>
          <select value={filters.branch || ""} onChange={(e) => setF("branch", Number(e.target.value))}>
            <option value="">All branches</option>
            {lookups?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Unit</label>
          <select value={filters.unit || ""} onChange={(e) => setF("unit", Number(e.target.value))}>
            <option value="">All units</option>
            {lookups?.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Category</label>
          <select value={filters.category || ""} onChange={(e) => setF("category", Number(e.target.value))}>
            <option value="">All categories</option>
            {lookups?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="trk-btn trk-btn-primary" onClick={() => load()}>Apply</button>
        <button className="trk-btn trk-btn-ghost" onClick={() => { setFilters({}); load({}); }}>Reset</button>
      </div>

      {loading || !data ? (
        <div className="trk-card"><div className="trk-empty">Loading…</div></div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
            {kpi(<HiInboxStack />, "In progress", data.summary.in_progress, "#4f46e5")}
            {kpi(<HiCheckCircle />, "Completed", data.summary.completed, "#059669")}
            {kpi(<HiExclamationTriangle />, "Overdue", data.summary.overdue, "#dc2626")}
            {kpi(<HiClock />, "Avg cycle (days)", data.summary.avg_cycle_days, "#d97706")}
          </div>

          {/* Avg days per stage */}
          <div className="trk-card">
            <h3 style={{ marginTop: 0 }}>Average days per stage</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.avg_days_per_stage} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="stage_name" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="avg_days" name="Avg days" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pending per stage */}
          <div className="trk-card">
            <h3 style={{ marginTop: 0 }}>Pending invoices per stage</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.pending_by_stage} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="stage_name" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Pending" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="overdue" name="Overdue" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Ageing */}
          <div className="trk-card">
            <h3 style={{ marginTop: 0 }}>Ageing of open invoices</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.ageing} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="bucket" fontSize={12} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Open invoices" radius={[4, 4, 0, 0]}>
                  {data.ageing.map((_, i) => <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Bottleneck tables */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <BottleneckTable title="Slowest people" rows={data.bottleneck_by_person} keyLabel="Person" />
            <BottleneckTable title="Slowest vendors" rows={data.bottleneck_by_vendor} keyLabel="Vendor" />
            <BottleneckTable title="By category" rows={data.bottleneck_by_category} keyLabel="Category" />
          </div>
        </>
      )}
    </div>
  );
}

function BottleneckTable({
  title, rows, keyLabel,
}: { title: string; rows: { key: string; avg_days: number; visits: number }[]; keyLabel: string }) {
  return (
    <div className="trk-card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div className="trk-table-wrap">
        <table className="trk-table">
          <thead>
            <tr><th>{keyLabel}</th><th>Avg days</th><th>Visits</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((r, i) => (
              <tr key={i}>
                <td>{r.key}</td>
                <td>
                  <span className={"trk-badge " + (r.avg_days > 5 ? "trk-badge-danger" : r.avg_days > 3 ? "trk-badge-warn" : "trk-badge-ok")}>
                    {r.avg_days}
                  </span>
                </td>
                <td>{r.visits}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3}><div className="trk-empty">No data.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
