import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
// SheetJS (422 kB) is fetched when the user asks for the export, not when
// the report page opens — see utils/xlsxLoader.ts.
import { loadXlsx } from "../utils/xlsxLoader";
import trackerService from "../services/trackerService";
import type { ReportFilters } from "../services/trackerService";
import "../styles/Tracker.css";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const AGE_COLORS = ["#10b981", "#f59e0b", "#f97316", "#ef4444"];

export default function Tracker_Reports() {
  // Draft vs applied, as on Tracker_Invoices: `applied` IS the query key, so
  // going back to a filter set already seen is a cache hit rather than a
  // round trip, and the report on screen can never disagree with the filters
  // that produced it.
  const [filters, setFilters] = useState<ReportFilters>({});
  const [applied, setApplied] = useState<ReportFilters>({});

  const { data: lookups = null } = useQuery({
    queryKey: ["tracker", "lookups"],
    queryFn: () => trackerService.getLookups(),
    staleTime: 5 * 60_000,
  });

  const { data = null, isFetching: loading } = useQuery({
    queryKey: ["tracker", "reports", applied],
    queryFn: () => trackerService.getReports(applied),
  });

  const load = (next: ReportFilters = filters) => setApplied(next);

  const exportExcel = async () => {
    if (!data) return;
    const XLSX = await loadXlsx();
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
    <div className="trk-card trk-kpi">
      <div className="trk-kpi-body">
        <div className="trk-kpi-icon" style={{ color: tone }}>{icon}</div>
        <div>
          <div className="trk-kpi-value">{value}</div>
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
      <div className="trk-actionbar trk-actionbar--filters">
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">From</label>
          <input aria-label="From" type="date" value={filters.from || ""} onChange={(e) => setF("from", e.target.value)} />
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">To</label>
          <input aria-label="To" type="date" value={filters.to || ""} onChange={(e) => setF("to", e.target.value)} />
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Branch</label>
          <select aria-label="Branch" value={filters.branch || ""} onChange={(e) => setF("branch", Number(e.target.value))}>
            <option value="">All branches</option>
            {lookups?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Unit</label>
          <select aria-label="Unit" value={filters.unit || ""} onChange={(e) => setF("unit", Number(e.target.value))}>
            <option value="">All units</option>
            {lookups?.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Category</label>
          <select aria-label="Category" value={filters.category || ""} onChange={(e) => setF("category", Number(e.target.value))}>
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
          <div className="trk-kpi-row">
            {kpi(<HiInboxStack />, "In progress", data.summary.in_progress, "#4f46e5")}
            {kpi(<HiCheckCircle />, "Completed", data.summary.completed, "#059669")}
            {kpi(<HiExclamationTriangle />, "Overdue", data.summary.overdue, "#dc2626")}
            {kpi(<HiClock />, "Avg cycle (days)", data.summary.avg_cycle_days, "#d97706")}
          </div>

          {/* Avg days per stage */}
          <div className="trk-card">
            <h3 className="trk-heading-top">Average days per stage</h3>
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
            <h3 className="trk-heading-top">Pending invoices per stage</h3>
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
            <h3 className="trk-heading-top">Ageing of open invoices</h3>
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
          <div className="trk-report-grid">
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
      <h3 className="trk-heading-top">{title}</h3>
      <div className="trk-table-wrap">
        <Table density="compact">
          <TableHeader>
            <TableRow><TableHead>{keyLabel}</TableHead><TableHead>Avg days</TableHead><TableHead>Visits</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 10).map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.key}</TableCell>
                <TableCell>
                  <Badge tone={r.avg_days > 5 ? "bad" : r.avg_days > 3 ? "hold" : "ok"} outlined>
                    {r.avg_days}
                  </Badge>
                </TableCell>
                <TableCell>{r.visits}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={3}><div className="trk-empty">No data.</div></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
