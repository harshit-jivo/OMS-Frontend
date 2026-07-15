import { useEffect, useState } from "react";
import { HiEye, HiClock, HiFunnel, HiArrowDownTray } from "react-icons/hi2";
import { saveAs } from "file-saver";
import trackerService from "../services/trackerService";
import type { AllInvoiceFilters, Invoice, Lookups } from "../services/trackerService";
import "../styles/Tracker.css";

const money = (v: string | number) =>
  Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB");
};
const fmtDT = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const EMPTY: AllInvoiceFilters = {};

export default function Tracker_Invoices() {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [rows, setRows] = useState<Invoice[]>([]);
  const [filters, setFilters] = useState<AllInvoiceFilters>({ ...EMPTY });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [timelineInv, setTimelineInv] = useState<Invoice | null>(null);

  useEffect(() => {
    trackerService.getLookups().then(setLookups).catch(() => {});
    load();
  }, []);

  const load = async (f: AllInvoiceFilters = filters) => {
    setLoading(true);
    try {
      setRows(await trackerService.adminAllInvoices(f));
    } finally {
      setLoading(false);
    }
  };

  const setF = (k: keyof AllInvoiceFilters, v: string | number) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));

  const openTimeline = async (id: number) => {
    try { setTimelineInv(await trackerService.getInvoice(id)); } catch { /* ignore */ }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const blob = await trackerService.exportAllInvoices(filters);
      saveAs(blob, "invoice-register.xlsx");
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  };

  const counts = {
    total: rows.length,
    completed: rows.filter((r) => r.status === "COMPLETED").length,
    overdue: rows.filter((r) => r.is_overdue && r.status !== "COMPLETED").length,
  };

  return (
    <div className="trk-page">
      <div className="trk-header">
        <div>
          <h1>All Invoices</h1>
          <div className="trk-sub">
            Every invoice and its current stage. Completed ones are faded; overdue ones highlighted.
          </div>
        </div>
        <button className="trk-btn trk-btn-success" onClick={exportExcel} disabled={exporting}>
          <HiArrowDownTray /> {exporting ? "Exporting…" : "Export to Excel"}
        </button>
      </div>

      {/* Summary chips */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span className="trk-badge trk-badge-muted" style={{ fontSize: 13, padding: "6px 12px" }}>Total: {counts.total}</span>
        <span className="trk-badge trk-badge-ok" style={{ fontSize: 13, padding: "6px 12px" }}>Completed: {counts.completed}</span>
        <span className="trk-badge trk-badge-danger" style={{ fontSize: 13, padding: "6px 12px" }}>Overdue: {counts.overdue}</span>
      </div>

      {/* Filters */}
      <div className="trk-actionbar" style={{ alignItems: "flex-end", gap: 14 }}>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Search party</label>
          <input value={filters.party || ""} onChange={(e) => setF("party", e.target.value)} placeholder="Party name" />
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Invoice no.</label>
          <input value={filters.invoice_number || ""} onChange={(e) => setF("invoice_number", e.target.value)} placeholder="Invoice #" />
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Stage</label>
          <select value={filters.stage || ""} onChange={(e) => setF("stage", e.target.value)}>
            <option value="">All stages</option>
            {lookups?.stages.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Completion</label>
          <select value={filters.status || ""} onChange={(e) => setF("status", e.target.value)}>
            <option value="">Any</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Threshold</label>
          <select value={filters.overdue || ""} onChange={(e) => setF("overdue", e.target.value)}>
            <option value="">Any</option>
            <option value="true">Overdue only</option>
            <option value="false">Within threshold</option>
          </select>
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Category</label>
          <select value={filters.category || ""} onChange={(e) => setF("category", Number(e.target.value))}>
            <option value="">All</option>
            {lookups?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Unit</label>
          <select value={filters.unit || ""} onChange={(e) => setF("unit", Number(e.target.value))}>
            <option value="">All</option>
            {lookups?.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="trk-field" style={{ gap: 4 }}>
          <label style={{ fontSize: 11 }}>Branch</label>
          <select value={filters.branch || ""} onChange={(e) => setF("branch", Number(e.target.value))}>
            <option value="">All</option>
            {lookups?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <button className="trk-btn trk-btn-primary" onClick={() => load()}><HiFunnel /> Apply</button>
        <button className="trk-btn trk-btn-ghost" onClick={() => { setFilters({ ...EMPTY }); load({}); }}>Reset</button>
      </div>

      <div className="trk-card">
        <div className="trk-table-wrap">
          <table className="trk-table">
            <thead>
              <tr>
                <th>Invoice No.</th><th>Party</th><th>Inv. Date</th><th>Value</th>
                <th>GST</th><th>Category</th><th>Unit / Branch</th>
                <th>Current Stage</th><th>Days Here</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => {
                const completed = inv.status === "COMPLETED";
                const overdue = inv.is_overdue && !completed;
                return (
                  <tr key={inv.id}
                    className={overdue ? "trk-row-overdue" : ""}
                    style={completed ? { opacity: 0.5 } : undefined}>
                    <td>{inv.invoice_number}</td>
                    <td>{inv.party_name}</td>
                    <td>{fmtDate(inv.invoice_date)}</td>
                    <td>₹{money(inv.invoice_value)}</td>
                    <td>{inv.gst_type_name} {inv.gst_rate_label}</td>
                    <td>{inv.category_name}</td>
                    <td>{inv.unit_name} / {inv.branch_name}</td>
                    <td><span className="trk-badge trk-badge-stage">{inv.current_stage_name}</span></td>
                    <td>
                      <span className={"trk-badge " + (overdue ? "trk-badge-danger" : "trk-badge-muted")}>
                        <HiClock style={{ verticalAlign: "-2px" }} /> {inv.days_at_stage}{overdue ? " ⚠" : ""}
                      </span>
                    </td>
                    <td>
                      {completed
                        ? <span className="trk-badge trk-badge-ok">Completed</span>
                        : <span className="trk-badge trk-badge-warn">In progress</span>}
                    </td>
                    <td>
                      <button className="trk-btn trk-btn-ghost" style={{ padding: "5px 9px" }}
                        onClick={() => openTimeline(inv.id)}>
                        <HiEye /> Track
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={11}><div className="trk-empty">No invoices match these filters.</div></td></tr>
              )}
              {loading && (
                <tr><td colSpan={11}><div className="trk-empty">Loading…</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Timeline modal (read-only) */}
      {timelineInv && (
        <div className="trk-modal-overlay" onClick={() => setTimelineInv(null)}>
          <div className="trk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trk-modal-head">
              <h3>{timelineInv.invoice_number} — {timelineInv.party_name}</h3>
            </div>
            <div className="trk-modal-body">
              <ul className="trk-timeline">
                {(timelineInv.events || []).map((ev) => (
                  <li key={ev.id}>
                    <div className="tl-stage">
                      {ev.stage_name}
                      {ev.stage_status && <span className="trk-badge trk-badge-muted" style={{ marginLeft: 8 }}>{ev.stage_status}</span>}
                      {ev.receiving_note === "LATE" && <span className="trk-badge trk-badge-late" style={{ marginLeft: 6 }}>Late (after 6 PM)</span>}
                    </div>
                    <div className="tl-meta">
                      {ev.event_type} · in {fmtDT(ev.entered_at)}
                      {ev.exited_at ? ` · out ${fmtDT(ev.exited_at)}` : " · (here now)"}
                      {ev.days_spent ? ` · ${ev.days_spent} days` : ""}
                      {ev.acted_by_name ? ` · ${ev.acted_by_name}` : ""}
                    </div>
                    {ev.remarks && <div className="tl-remark">“{ev.remarks}”</div>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="trk-modal-foot">
              <button className="trk-btn trk-btn-ghost" onClick={() => setTimelineInv(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
