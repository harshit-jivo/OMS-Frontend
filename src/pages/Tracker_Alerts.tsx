import { useEffect, useMemo, useState } from "react";
import { HiExclamationTriangle, HiEye, HiArrowPath } from "react-icons/hi2";
import trackerService from "../services/trackerService";
import type { Invoice, StuckAlert } from "../services/trackerService";
import "../styles/Tracker.css";

const money = (v: string | number) =>
  Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDT = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

export default function Tracker_Alerts() {
  const [alerts, setAlerts] = useState<StuckAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [timelineInv, setTimelineInv] = useState<Invoice | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setAlerts(await trackerService.getAlerts());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  // Group by stage for a quick "where is it jammed" view.
  const byStage = useMemo(() => {
    const m = new Map<string, number>();
    alerts.forEach((a) => m.set(a.stage_name, (m.get(a.stage_name) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [alerts]);

  const openTimeline = async (id: number) => {
    try { setTimelineInv(await trackerService.getInvoice(id)); } catch { /* ignore */ }
  };

  const tone = (over: number) =>
    over > 7 ? "trk-badge-danger" : over > 3 ? "trk-badge-warn" : "trk-badge-muted";

  return (
    <div className="trk-page">
      <div className="trk-header">
        <div>
          <h1>Stuck Invoice Alerts</h1>
          <div className="trk-sub">Invoices sitting past their stage threshold. Refreshes every minute.</div>
        </div>
        <button className="trk-btn trk-btn-ghost" onClick={load}>
          <HiArrowPath /> Refresh
        </button>
      </div>

      {/* Banner */}
      <div className="trk-card" style={{
        background: alerts.length ? "#fef2f2" : "#ecfdf5",
        borderColor: alerts.length ? "#fecaca" : "#a7f3d0",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <HiExclamationTriangle style={{ fontSize: 32, color: alerts.length ? "#dc2626" : "#059669" }} />
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {alerts.length} stuck invoice{alerts.length === 1 ? "" : "s"}
          </div>
          <div className="trk-sub">
            {byStage.length
              ? byStage.map(([s, n]) => `${s}: ${n}`).join("  ·  ")
              : "All invoices are within their stage thresholds. 🎉"}
          </div>
        </div>
      </div>

      <div className="trk-card">
        <div className="trk-table-wrap">
          <table className="trk-table">
            <thead>
              <tr>
                <th>Invoice No.</th><th>Party</th><th>Value</th><th>Stuck At</th>
                <th>Days Here</th><th>Threshold</th><th>Over By</th><th>Since</th><th></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="trk-row-overdue">
                  <td>{a.invoice_number}</td>
                  <td>{a.party_name}</td>
                  <td>₹{money(a.invoice_value)}</td>
                  <td><span className="trk-badge trk-badge-stage">{a.stage_name}</span></td>
                  <td>{a.days_stuck}</td>
                  <td>{a.threshold_days}</td>
                  <td><span className={"trk-badge " + tone(a.over_by)}>+{a.over_by.toFixed(1)} d</span></td>
                  <td>{fmtDT(a.stage_entered_at)}</td>
                  <td>
                    <button className="trk-btn trk-btn-ghost" style={{ padding: "5px 9px" }}
                      onClick={() => openTimeline(a.invoice)}>
                      <HiEye /> Track
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && alerts.length === 0 && (
                <tr><td colSpan={9}><div className="trk-empty">No stuck invoices. 🎉</div></td></tr>
              )}
              {loading && alerts.length === 0 && (
                <tr><td colSpan={9}><div className="trk-empty">Loading…</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Timeline modal */}
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
