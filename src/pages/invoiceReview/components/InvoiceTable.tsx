/**
 * The main invoice list — Phase 4 split, plus Phase 5.5 row virtualization.
 *
 * Rendering is unchanged: every row, cell and action button below is the same
 * markup `InvoiceReview.tsx` used to render inline via `records.map(...)`.
 * What changed is HOW MANY of those rows are ever mounted at once.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY `useWindowVirtualizer`, NOT a scrolling container
 * ─────────────────────────────────────────────────────────────────────────
 * This page has never had an inner scrollbar — `.ir-table-wrap` only ever set
 * `overflow-x: auto` (for narrow viewports), and the table grows with the
 * page, which the WHOLE document scrolls. Giving the table its own
 * `overflow-y` + fixed height to virtualize it the usual way would be a real
 * visual change (a new scrollbar nested inside the page), which is exactly
 * what this pass may not do. `useWindowVirtualizer` measures against the
 * document/window scroll position instead, so the page keeps scrolling
 * exactly as it always did — only the OFF-SCREEN rows stop being mounted.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A FIXED `estimateSize`, NOT DYNAMIC MEASUREMENT
 * ─────────────────────────────────────────────────────────────────────────
 * Dynamic per-row measurement needs a DOM ref on every rendered row, fed back
 * into the virtualizer via `measureElement`. The shared `TableRow` primitive
 * (`components/ui/table.tsx`) is a plain function component with no
 * `forwardRef`, and it belongs to every table in the app — not this page's to
 * change. A fixed estimate plus a generous `overscan` keeps the two spacer
 * rows' heights close enough that scroll position never visibly jumps, without
 * touching a shared file.
 *
 * The two spacer `<tr>` elements stand in for however many rows are skipped
 * above/below the rendered window, so the table's total height (and the
 * page's scrollbar) stays right even though most rows are unmounted.
 */
import { useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  HiArrowPath,
  HiArrowUturnLeft,
  HiBanknotes,
  HiCheckCircle,
  HiClock,
  HiDocumentText,
  HiEye,
  HiInbox,
  HiPaperAirplane,
  HiPencilSquare,
  HiTrash,
  HiXCircle,
} from "react-icons/hi2";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  formatAmount,
  formatDateTime,
  hasRef,
  invoiceReportRef,
  isCreditLimitError,
  normalizeStatus,
  openReport,
} from "../helpers";
import type { UseInvoiceReviewResult } from "../useInvoiceReview";

// SO #, Party, Amount, Submitted, Actions. (Status is commented out below, as
// it was in the original — see the badge-conversion note on this page.)
const COLUMN_COUNT = 5;

// A reasonable average row height for the comfortable-density table: enough
// that the spacer rows keep the scrollbar close to accurate without needing
// to measure every row. Real visible rows always render at their true height
// regardless of this estimate — only the space standing in for UNRENDERED
// rows depends on it.
const ESTIMATED_ROW_HEIGHT = 64;

export default function InvoiceTable({ view }: { view: UseInvoiceReviewResult }) {
  const {
    loading,
    records,
    actionId,
    canApproveReject,
    canPostToSap,
    setSelected,
    setActionError,
    openHistory,
    handleAction,
    handlePostToSap,
    handleEdit,
    handleDelete,
    openCreditLimitFlow,
    openCreditLimitRequest,
  } = view;

  // Where the table starts in the document, so the window virtualizer can
  // translate its own (list-relative) offsets into real scroll positions. A
  // ref callback rather than a measuring effect: React calls it once the div
  // is actually in the document, so `offsetTop` is read straight off the live
  // node on every render from then on — no extra render pass to converge on.
  const [wrapNode, setWrapNode] = useState<HTMLDivElement | null>(null);
  const scrollMargin = wrapNode?.offsetTop ?? 0;

  const rowVirtualizer = useWindowVirtualizer({
    count: records.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 12,
    scrollMargin,
  });

  if (loading) {
    return (
      <div className="ir-empty" role="status" aria-live="polite">
        Loading invoices…
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="ir-empty">
        <HiInbox aria-hidden="true" />
        <span>No invoices found for this status.</span>
      </div>
    );
  }

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMargin : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  return (
    <div className="ir-table-wrap" ref={setWrapNode}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SO #</TableHead>
            <TableHead>Party</TableHead>
            <TableHead className="ir-num">Amount</TableHead>
            {/* <TableHead>Status</TableHead> */}
            <TableHead>Submitted</TableHead>
            <TableHead className="ir-actions-col">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={COLUMN_COUNT} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const record = records[virtualRow.index];
            const status = normalizeStatus(record.status);
            const busy = actionId === record.id;
            const reportRef = invoiceReportRef(record);
            // The backend decides which statuses may be removed and says so
            // per row; older responses without the flag simply show no
            // Delete button rather than offering one that would be refused.
            const canDelete = Boolean(record.can_delete);
            return (
              <TableRow key={record.id ?? virtualRow.index}>
                <TableCell>
                  {record.so_number || "—"}
                  {/* Lineage: this row is either a rework of a rejected
                      invoice, or the version that was reworked away. */}
                  {hasRef(record.supersedes) && (
                    <span
                      className="ir-lineage-chip"
                      title={record.supersedes_rejection_reason || undefined}
                    >
                      <HiArrowUturnLeft aria-hidden="true" />
                      Revision of #{record.supersedes}
                    </span>
                  )}
                  {hasRef(record.superseded_by_id) && (
                    <span className="ir-lineage-chip ir-lineage-chip-muted">
                      <HiArrowUturnLeft aria-hidden="true" />
                      Replaced by #{record.superseded_by_id}
                    </span>
                  )}
                </TableCell>
                <TableCell>{record.party_name || "—"}</TableCell>
                <TableCell className="ir-num">{formatAmount(record.total_amount)}</TableCell>
                {/* <TableCell>
                  <span className={`ir-badge ir-badge-${status.toLowerCase()}`}>{statusLabel(status)}</span>
                </TableCell> */}
                <TableCell>{formatDateTime(record.created_at)}</TableCell>
                <TableCell className="ir-actions-col">
                  <div className="ir-row-actions">
                    <button
                      type="button"
                      className="ir-btn ir-btn-ghost ir-btn-sm"
                      onClick={() => setSelected(record)}
                    >
                      <HiEye aria-hidden="true" />
                      View
                    </button>
                    <button
                      type="button"
                      className="ir-btn ir-btn-ghost ir-btn-sm"
                      onClick={() => openHistory(record)}
                    >
                      <HiClock aria-hidden="true" />
                      History
                    </button>
                    {(status === "PENDING" || status === "EDITED") &&
                      (canApproveReject ? (
                        <>
                          <button
                            type="button"
                            className="ir-btn ir-btn-approve ir-btn-sm"
                            disabled={busy}
                            onClick={() => handleAction(record, "APPROVED")}
                          >
                            <HiCheckCircle aria-hidden="true" />
                            {busy ? "…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            className="ir-btn ir-btn-reject ir-btn-sm"
                            disabled={busy}
                            onClick={() => handleAction(record, "REJECTED")}
                          >
                            <HiXCircle aria-hidden="true" />
                            {busy ? "…" : "Reject"}
                          </button>
                        </>
                      ) : (
                        <span className="ir-pending-tag">Pending Approval</span>
                      ))}
                    {status === "APPROVED" && canPostToSap && (
                      <button
                        type="button"
                        className="ir-btn ir-btn-sap ir-btn-sm"
                        disabled={busy}
                        onClick={() => handlePostToSap(record)}
                      >
                        <HiPaperAirplane aria-hidden="true" />
                        {busy ? "…" : "Post to SAP"}
                      </button>
                    )}
                    {status === "POSTED_TO_SAP" &&
                      (reportRef ? (
                        <button
                          type="button"
                          className="ir-btn ir-btn-report ir-btn-sm"
                          onClick={() => openReport(reportRef, setActionError)}
                          title={`Open the bill print for invoice #${reportRef.docNum || reportRef.docEntry}`}
                        >
                          <HiDocumentText aria-hidden="true" />
                          Generate Report
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ir-btn ir-btn-report ir-btn-sm"
                          disabled
                          title="No SAP document number was recorded for this invoice"
                        >
                          <HiDocumentText aria-hidden="true" />
                          Generate Report
                        </button>
                      ))}
                    {(status === "ERROR" || status === "CL_RAISED") && canPostToSap && (
                      <button
                        type="button"
                        className="ir-btn ir-btn-sap ir-btn-sm"
                        disabled={busy}
                        onClick={() => handlePostToSap(record)}
                      >
                        <HiArrowPath aria-hidden="true" />
                        {busy ? "…" : "Repost to SAP"}
                      </button>
                    )}
                    {status === "CL_RAISED" && canPostToSap && (
                      <button
                        type="button"
                        className="ir-btn ir-btn-cl ir-btn-sm"
                        disabled={busy}
                        onClick={() => openCreditLimitFlow(record)}
                      >
                        <HiBanknotes aria-hidden="true" />
                        Show Flow
                      </button>
                    )}
                    {status === "ERROR" && canPostToSap && isCreditLimitError(record) && (
                      <button
                        type="button"
                        className="ir-btn ir-btn-cl ir-btn-sm"
                        disabled={busy}
                        onClick={() => openCreditLimitRequest(record)}
                      >
                        <HiBanknotes aria-hidden="true" />
                        {busy ? "…" : "Raise CL"}
                      </button>
                    )}
                    {status === "REJECTED" && canPostToSap && (
                      <button
                        type="button"
                        className="ir-btn ir-btn-edit ir-btn-sm"
                        disabled={busy}
                        onClick={() => handleEdit(record)}
                      >
                        <HiPencilSquare aria-hidden="true" />
                        {busy ? "…" : "Edit"}
                      </button>
                    )}
                    {/* Last, so it never sits where Approve/Post used to be
                        and gets hit by muscle memory. */}
                    {canDelete && (
                      <button
                        type="button"
                        className="ir-btn ir-btn-delete ir-btn-sm"
                        disabled={busy}
                        onClick={() => handleDelete(record)}
                        title="Remove this entry from the review screen"
                      >
                        <HiTrash aria-hidden="true" />
                        {busy ? "…" : "Delete"}
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={COLUMN_COUNT} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
