import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HiEye, HiClock, HiFunnel, HiArrowDownTray, HiTrash } from "react-icons/hi2";

// A tracker admin may delete an invoice up to this stage order (inclusive).
const DELETE_MAX_ORDER = 5;
import { saveAs } from "file-saver";
import trackerService from "../services/trackerService";
import type { AllInvoiceFilters, Invoice } from "../services/trackerService";
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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toast } from "@/components/ui/toast";
import { messageFrom } from "@/lib/apiError";

const money = (v: string | number) =>
  Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB");
};
const fmtMonth = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};
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

const EMPTY: AllInvoiceFilters = {};

export default function Tracker_Invoices() {
  const queryClient = useQueryClient();

  /*
   * `filters` is the DRAFT the form edits; `applied` is what the table is
   * showing. The old code kept only one and passed it to `load()` on Apply,
   * which meant the request and the inputs could not disagree — and also that
   * nothing could re-run the current search without re-reading the form. As a
   * query key, `applied` gives both: Apply is a `setState`, and going back to
   * a previous filter set is a cache hit rather than a round trip.
   */
  const [filters, setFilters] = useState<AllInvoiceFilters>({ ...EMPTY });
  const [applied, setApplied] = useState<AllInvoiceFilters>({ ...EMPTY });
  const [exporting, setExporting] = useState(false);
  const [timelineInv, setTimelineInv] = useState<Invoice | null>(null);
  const [delInv, setDelInv] = useState<Invoice | null>(null);
  const [toast, setToast] = useState("");
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  const { data: lookups = null } = useQuery({
    queryKey: ["tracker", "lookups"],
    queryFn: () => trackerService.getLookups(),
    // Stages and dropdown values change when an admin edits them, which is
    // rare and never mid-session for the person reading this page.
    staleTime: 5 * 60_000,
  });

  const { data: rows = [], isFetching: loading } = useQuery({
    queryKey: ["tracker", "all-invoices", applied],
    queryFn: () => trackerService.adminAllInvoices(applied),
  });

  const load = (next: AllInvoiceFilters = filters) => setApplied(next);

  // Stage order for an invoice (from lookups); used to gate the delete button.
  const stageOrder = (inv: Invoice) =>
    lookups?.stages.find((s) => s.code === inv.current_stage_code)?.order ?? 99;
  const canDelete = (inv: Invoice) => stageOrder(inv) <= DELETE_MAX_ORDER;

  /*
   * Delete as a mutation rather than an async handler.
   *
   * The difference that matters is the last line: invalidating the key
   * refreshes whatever list is on screen, including a filtered one. The old
   * `load()` re-ran with the CURRENT form state, so deleting a row after
   * editing a filter without pressing Apply silently changed the table
   * underneath the user.
   *
   * `isPending` also replaces the hand-managed `deleting` flag, which had the
   * usual bug: it was only cleared in `finally`, so it was correct, but every
   * page that writes this pattern has to get that right again.
   */
  const del = useMutation({
    mutationFn: (invoice: Invoice) => trackerService.deleteInvoice(invoice.id),
    onSuccess: (_data, invoice) => {
      flash(`Invoice ${invoice.invoice_number} deleted`);
      setDelInv(null);
      void queryClient.invalidateQueries({ queryKey: ["tracker", "all-invoices"] });
    },
    onError: (error: unknown) => flash(messageFrom(error, "Delete failed")),
  });

  const doDelete = () => {
    if (delInv) del.mutate(delInv);
  };
  const deleting = del.isPending;

  const setF = (k: keyof AllInvoiceFilters, v: string | number) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));

  const openTimeline = async (id: number) => {
    try {
      setTimelineInv(await trackerService.getInvoice(id));
    } catch {
      /* ignore */
    }
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
      <div className="trk-summary-row">
        <Badge outlined className="trk-badge-lg">
          Total: {counts.total}
        </Badge>
        <Badge tone="ok" outlined className="trk-badge-lg">
          Completed: {counts.completed}
        </Badge>
        <Badge tone="bad" outlined className="trk-badge-lg">
          Overdue: {counts.overdue}
        </Badge>
      </div>

      {/* Filters */}
      <div className="trk-actionbar trk-actionbar--filters">
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Search party</label>
          <input aria-label="Search party"
            value={filters.party || ""}
            onChange={(e) => setF("party", e.target.value)}
            placeholder="Party name"
          />
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Invoice no.</label>
          <input aria-label="Invoice no."
            value={filters.invoice_number || ""}
            onChange={(e) => setF("invoice_number", e.target.value)}
            placeholder="Invoice #"
          />
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Effective month</label>
          <input aria-label="Effective month"
            type="month"
            value={filters.effective_month || ""}
            onChange={(e) => setF("effective_month", e.target.value)}
          />
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Stage</label>
          <select aria-label="Stage" value={filters.stage || ""} onChange={(e) => setF("stage", e.target.value)}>
            <option value="">All stages</option>
            {lookups?.stages.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Completion</label>
          <select aria-label="Completion" value={filters.status || ""} onChange={(e) => setF("status", e.target.value)}>
            <option value="">Any</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Threshold</label>
          <select aria-label="Threshold" value={filters.overdue || ""} onChange={(e) => setF("overdue", e.target.value)}>
            <option value="">Any</option>
            <option value="true">Overdue only</option>
            <option value="false">Within threshold</option>
          </select>
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Category</label>
          <select aria-label="Category"
            value={filters.category || ""}
            onChange={(e) => setF("category", Number(e.target.value))}
          >
            <option value="">All</option>
            {lookups?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Unit</label>
          <select aria-label="Unit" value={filters.unit || ""} onChange={(e) => setF("unit", Number(e.target.value))}>
            <option value="">All</option>
            {lookups?.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="trk-field trk-field--tight">
          <label className="trk-label-xs">Branch</label>
          <select aria-label="Branch"
            value={filters.branch || ""}
            onChange={(e) => setF("branch", Number(e.target.value))}
          >
            <option value="">All</option>
            {lookups?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <button className="trk-btn trk-btn-primary" onClick={() => load()}>
          <HiFunnel /> Apply
        </button>
        <button
          className="trk-btn trk-btn-ghost"
          onClick={() => {
            setFilters({ ...EMPTY });
            load({});
          }}
        >
          Reset
        </button>
      </div>

      <div className="trk-card">
        <div className="trk-table-wrap">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Invoice No.</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Inv. Date</TableHead>
                <TableHead>Eff. Month</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit / Branch</TableHead>
                <TableHead>Current Stage</TableHead>
                <TableHead>Days Here</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inv) => {
                const completed = inv.status === "COMPLETED";
                const overdue = inv.is_overdue && !completed;
                return (
                  <TableRow
                    key={inv.id}
                    className={overdue ? "trk-row-overdue" : ""}
                    style={completed ? { opacity: 0.5 } : undefined}
                  >
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell>{inv.party_name}</TableCell>
                    <TableCell>{fmtDate(inv.invoice_date)}</TableCell>
                    <TableCell>{fmtMonth(inv.effective_month)}</TableCell>
                    <TableCell>₹{money(inv.invoice_value)}</TableCell>
                    <TableCell>
                      {inv.gst_type_name} {inv.gst_rate_label}
                    </TableCell>
                    <TableCell>{inv.category_name}</TableCell>
                    <TableCell>
                      {inv.unit_name} / {inv.branch_name}
                    </TableCell>
                    <TableCell>
                      <Badge tone="info" outlined>
                        {inv.current_stage_name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge outlined tone={overdue ? "bad" : "neutral"}>
                        <HiClock className="trk-icon-clock" /> {inv.days_at_stage}
                        {overdue ? " ⚠" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {completed ? (
                        <Badge tone="ok" outlined>
                          Completed
                        </Badge>
                      ) : (
                        <Badge tone="hold" outlined>
                          In progress
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="trk-row-actions">
                      <button
                        className="trk-btn trk-btn-ghost trk-btn--sm"
                        onClick={() => openTimeline(inv.id)}
                      >
                        <HiEye /> Track
                      </button>
                      {canDelete(inv) && (
                        <button
                          className="trk-btn trk-btn-danger trk-btn--sm"
                          title="Delete invoice (allowed up to stage 5)"
                          onClick={() => setDelInv(inv)}
                        >
                          <HiTrash /> Delete
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12}>
                    <div className="trk-empty">No invoices match these filters.</div>
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={12}>
                    <div className="trk-empty">Loading…</div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Timeline modal (read-only) */}
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

      {/* Delete confirmation (tracker admin, up to stage 5) */}
      <Dialog
        open={Boolean(delInv)}
        onOpenChange={(next) => {
          if (!next) (() => !deleting && setDelInv(null))();
        }}
      >
        {delInv && (
          <DialogContent title="Delete invoice">
            <DialogHeader>
              <DialogTitle>Delete invoice?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="trk-heading-flush">
                Delete invoice <b>{delInv.invoice_number}</b> — {delInv.party_name} (₹
                {money(delInv.invoice_value)})?
              </p>
              <p className="trk-sub trk-sub--top">
                Currently at <b>{delInv.current_stage_name}</b>. It will be removed from the tracker
                (soft delete — the record is kept but hidden).
              </p>
            </DialogBody>
            <DialogFooter>
              <button
                className="trk-btn trk-btn-ghost"
                disabled={deleting}
                onClick={() => setDelInv(null)}
              >
                Cancel
              </button>
              <button className="trk-btn trk-btn-danger" disabled={deleting} onClick={doDelete}>
                <HiTrash /> {deleting ? "Deleting…" : "Delete"}
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Toast message={toast} />
    </div>
  );
}
