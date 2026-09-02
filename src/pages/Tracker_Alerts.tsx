import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HiExclamationTriangle, HiEye, HiArrowPath, HiEnvelope } from "react-icons/hi2";
import trackerService from "../services/trackerService";
import type { Invoice } from "../services/trackerService";
import "../styles/Tracker.css";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const money = (v: string | number) =>
  Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDT = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export default function Tracker_Alerts() {
  const [timelineInv, setTimelineInv] = useState<Invoice | null>(null);

  /*
   * Phase 3.1 — the first page moved onto TanStack Query, and a good one to
   * start with because its old `useEffect` had every problem the library
   * exists to solve:
   *
   *   * `setInterval(load, 60000)` kept firing while the tab was in the
   *     background — a request a minute, forever, for a screen nobody was
   *     looking at. `refetchIntervalInBackground` defaults to false.
   *   * `load()` set state after the await with no cancellation, so
   *     unmounting mid-flight was a React state update on a dead component,
   *     and two overlapping loads resolved in arrival order rather than call
   *     order.
   *   * A failed poll threw into an unhandled rejection and left the previous
   *     alerts on screen with no indication they had stopped updating.
   *   * The manual Refresh button and the interval were separate code paths
   *     doing the same fetch.
   */
  const {
    data: alerts = [],
    isFetching: loading,
    refetch: load,
  } = useQuery({
    queryKey: ["tracker", "alerts"],
    queryFn: () => trackerService.getAlerts(),
    refetchInterval: 60_000,
    // Alerts are the point of the screen: 60s of staleness is the contract,
    // so nothing here should serve a cached copy for longer than that.
    staleTime: 60_000,
  });

  // Group by stage for a quick "where is it jammed" view.
  const byStage = useMemo(() => {
    const m = new Map<string, number>();
    alerts.forEach((a) => m.set(a.stage_name, (m.get(a.stage_name) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [alerts]);

  const openTimeline = async (id: number) => {
    try {
      setTimelineInv(await trackerService.getInvoice(id));
    } catch {
      /* ignore */
    }
  };

  /**
   * How far past its threshold an invoice is, as a badge tone.
   *
   * Returns a tone rather than a class name (Phase 2.2): the 7-day and 3-day
   * thresholds are this page's judgement and stay here, but what colour "bad"
   * is gets decided once, in components/ui/badge.tsx.
   */
  const tone = (over: number): BadgeTone => (over > 7 ? "bad" : over > 3 ? "hold" : "neutral");

  return (
    <div className="trk-page">
      <div className="trk-header">
        <div>
          <h1>Stuck Invoice Alerts</h1>
          <div className="trk-sub">
            Invoices sitting past their stage threshold. Refreshes every minute.
          </div>
        </div>
        <button className="trk-btn trk-btn-ghost" onClick={() => void load()}>
          <HiArrowPath /> Refresh
        </button>
      </div>

      {/* Banner */}
      <div
        className={`trk-card trk-alert-banner${
          alerts.length ? " trk-alert-banner--bad" : " trk-alert-banner--ok"
        }`}
      >
        <HiExclamationTriangle
          className={`trk-alert-icon${
            alerts.length ? " trk-alert-icon--bad" : " trk-alert-icon--ok"
          }`}
        />
        <div>
          <div className="trk-alert-count">
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
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Invoice No.</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Stuck At</TableHead>
                <TableHead>Days Here</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Over By</TableHead>
                <TableHead>Since</TableHead>
                <TableHead>Mailed To</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((a) => (
                <TableRow key={a.id} className="trk-row-overdue">
                  <TableCell>{a.invoice_number}</TableCell>
                  <TableCell>{a.party_name}</TableCell>
                  <TableCell>₹{money(a.invoice_value)}</TableCell>
                  <TableCell>
                    <Badge tone="info" outlined>
                      {a.stage_name}
                    </Badge>
                  </TableCell>
                  <TableCell>{a.days_stuck}</TableCell>
                  <TableCell>{a.threshold_days}</TableCell>
                  <TableCell>
                    <Badge tone={tone(a.over_by)} outlined>
                      +{a.over_by.toFixed(1)} d
                    </Badge>
                  </TableCell>
                  <TableCell>{fmtDT(a.stage_entered_at)}</TableCell>
                  <TableCell className="trk-cell-wrap trk-cell-wrap--220">
                    {a.notified && a.notified.length ? (
                      <span
                        title={a.notified.map((n) => `${n.user} — ${fmtDT(n.sent_at)}`).join("\n")}
                      >
                        <Badge tone="ok" outlined className="trk-badge-gap-right-4">
                          <HiEnvelope className="trk-icon-clock" /> {a.notified.length}
                        </Badge>
                        {a.notified
                          .slice(0, 2)
                          .map((n) => n.user)
                          .join(", ")}
                        {a.notified.length > 2 ? ` +${a.notified.length - 2}` : ""}
                      </span>
                    ) : (
                      <Badge outlined>Not mailed</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      className="trk-btn trk-btn-ghost trk-btn--sm"
                      onClick={() => openTimeline(a.invoice)}
                    >
                      <HiEye /> Track
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && alerts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <div className="trk-empty">No stuck invoices. 🎉</div>
                  </TableCell>
                </TableRow>
              )}
              {loading && alerts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <div className="trk-empty">Loading…</div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Timeline modal */}
      <Dialog
        open={Boolean(timelineInv)}
        onOpenChange={(next) => {
          if (!next) (() => setTimelineInv(null))();
        }}
      >
        {timelineInv && (
          <DialogContent title="Invoice timeline">
            <DialogHeader>
              <DialogTitle>
                {timelineInv.invoice_number} — {timelineInv.party_name}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <ul className="trk-timeline">
                {(timelineInv.events || []).map((ev) => (
                  <li key={ev.id}>
                    <div className="tl-stage">
                      {ev.stage_name}
                      {ev.stage_status && (
                        <Badge outlined className="trk-badge-gap">
                          {ev.stage_status}
                        </Badge>
                      )}
                      {ev.receiving_note === "LATE" && (
                        <Badge tone="hold" outlined className="trk-badge-gap-6">
                          Late (after 6 PM)
                        </Badge>
                      )}
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
            </DialogBody>
            <DialogFooter>
              <button className="trk-btn trk-btn-ghost" onClick={() => setTimelineInv(null)}>
                Close
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
