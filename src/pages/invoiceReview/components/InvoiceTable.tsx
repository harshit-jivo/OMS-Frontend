/**
 * The main invoice list — Phase 4 split, plus Phase 5.5 row virtualization.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SCROLL CONTAINER IS THE WINDOW
 * ─────────────────────────────────────────────────────────────────────────
 * This page has no inner vertical scrollbar — the wrapper only ever set
 * `overflow-x: auto` (for narrow viewports) and the table grows with the page.
 * So it virtualises against the window, and `scrollMargin` is where the list
 * starts in the document.
 *
 * This has been round once already. For a while `index.css` gave `body`
 * `height: 100%` and `overflow-x: hidden`, which made BODY the scrolling box
 * and left `window.scrollY` at 0 — so `useWindowVirtualizer` mounted
 * twenty-eight rows of a 300-row list and the rest was blank. The fix then was
 * `useVirtualizer` against `document.body`. The shell has since gone back to
 * a single window scroller (see the note at the top of `index.css`: the body
 * scroller doubled up with the window's under the wide-screen zoom), so this
 * is the window virtualizer again. `e2e/virtualization.spec.ts` keeps a
 * long-list case, because nothing shorter than ~30 rows can tell the two apart.
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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ACTION COLUMN
 * ─────────────────────────────────────────────────────────────────────────
 * Which buttons a row offers is decided by its status, and the tones are not
 * decoration: Approve is the affirmative `success`, Reject the `danger`,
 * "Post to SAP" the `primary` because it is the one action the APPROVED state
 * exists for. Everything else is `ghost`, so a row of six actions does not
 * read as six equally urgent choices. Delete stays last, so it never lands
 * where Approve or Post used to be and gets hit by muscle memory.
 */
import { useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  HiOutlineArrowPath,
  HiOutlineArrowUturnLeft,
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineDocumentText,
  HiOutlineEye,
  HiOutlineInbox,
  HiOutlinePaperAirplane,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineXCircle,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
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
    allRecords,
    filtersEnabled,
    actionId,
    canApproveReject,
    canApproveWarehouse,
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

  // Where the table starts inside the scrolling box, so the virtualizer can
  // translate its own (list-relative) offsets into real scroll positions. A
  // ref callback rather than a measuring effect: React calls it once the div
  // is actually in the document, so `offsetTop` is read straight off the live
  // node on every render from then on — no extra render pass to converge on.
  //
  // `offsetTop` is measured from the offsetParent, which is `body` here: no
  // ancestor between this div and the body is positioned, so it is also the
  // document offset the window virtualizer needs. If a `position: relative`
  // is ever added to `Page`, `Card` or `.content-area`, this becomes an offset
  // within THAT box instead and the rows will start landing in the wrong place.
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
      <div className="p-4">
        <TableSkeleton columns={COLUMN_COUNT} label="Loading invoices" />
      </div>
    );
  }

  if (records.length === 0) {
    // An empty tab and a tab emptied BY the filter bar are different problems
    // with different fixes, and "pick another status" is unhelpful advice to
    // someone who has just typed a search.
    const narrowedToNothing = filtersEnabled && allRecords.length > 0;
    return (
      <EmptyState
        icon={HiOutlineInbox}
        title={
          narrowedToNothing
            ? "No invoice matches these filters"
            : "No invoices found for this status"
        }
        hint={
          narrowedToNothing
            ? "Try a shorter search, a wider date range, or clear the filters above."
            : "Pick another status above, or refresh if you are expecting something new."
        }
      />
    );
  }

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMargin : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  return (
    <div className="overflow-x-auto" ref={setWrapNode}>
      <Table>
        <TableHeader>
          <TableRow className="bg-surface hover:bg-surface">
            <TableHead>SO #</TableHead>
            <TableHead>Party</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            {/* <TableHead>Status</TableHead> */}
            <TableHead>Submitted</TableHead>
            <TableHead className="w-px whitespace-nowrap">Actions</TableHead>
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
                <TableCell className="align-top">
                  <span className="font-semibold text-ink">{record.so_number || "—"}</span>
                  {/* Lineage: this row is either a rework of a rejected
                      invoice, or the version that was reworked away. */}
                  {hasRef(record.supersedes) && (
                    <Badge
                      tone="note"
                      className="ml-1.5 align-middle"
                      title={record.supersedes_rejection_reason || undefined}
                    >
                      <HiOutlineArrowUturnLeft aria-hidden="true" className="size-3" />
                      Revision of #{record.supersedes}
                    </Badge>
                  )}
                  {hasRef(record.superseded_by_id) && (
                    <Badge tone="neutral" className="ml-1.5 align-middle">
                      <HiOutlineArrowUturnLeft aria-hidden="true" className="size-3" />
                      Replaced by #{record.superseded_by_id}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="align-top text-ink">{record.party_name || "—"}</TableCell>
                <TableCell className="align-top text-right font-semibold tabular-nums text-ink">
                  {formatAmount(record.total_amount)}
                </TableCell>
                {/* <TableCell>
                  <Badge tone={toneForStatus(status)}>{statusLabel(status)}</Badge>
                </TableCell> */}
                <TableCell className="align-top whitespace-nowrap">
                  {formatDateTime(record.created_at)}
                </TableCell>
                <TableCell className="align-top">
                  {/* `flex-nowrap`, deliberately. The Actions column is
                      `w-px whitespace-nowrap`, which sizes it to its content —
                      but a wrapping flex row reports its min-content as the
                      widest single button, so the column collapsed and the six
                      actions stacked into a six-line row. Nowrap makes the
                      row's min-content the whole strip, which is what the
                      column was told to size to. */}
                  <div className="flex flex-nowrap items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(record)}>
                      <HiOutlineEye aria-hidden="true" /> View
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openHistory(record)}>
                      <HiOutlineClock aria-hidden="true" /> History
                    </Button>
                    {(status === "PENDING" || status === "EDITED") &&
                      (canApproveReject && canApproveWarehouse(record.warehouse) ? (
                        <>
                          <Button
                            size="sm"
                            variant="success"
                            disabled={busy}
                            onClick={() => handleAction(record, "APPROVED")}
                          >
                            <HiOutlineCheckCircle aria-hidden="true" />
                            {busy ? "…" : "Approve"}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() => handleAction(record, "REJECTED")}
                          >
                            <HiOutlineXCircle aria-hidden="true" />
                            {busy ? "…" : "Reject"}
                          </Button>
                        </>
                      ) : (
                        /* Not a disabled button: there is nothing here for
                           this user to enable, so a greyed-out Approve would
                           be an invitation that never becomes true. Reached
                           two ways now — this desk does not approve at all, or
                           it does but not for THIS invoice's warehouse — and
                           the reasoning is the same either way. */
                        <Badge tone="hold">Pending approval</Badge>
                      ))}
                    {status === "APPROVED" && canPostToSap && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy}
                        onClick={() => handlePostToSap(record)}
                      >
                        <HiOutlinePaperAirplane aria-hidden="true" />
                        {busy ? "…" : "Post to SAP"}
                      </Button>
                    )}
                    {status === "POSTED_TO_SAP" &&
                      (reportRef ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openReport(reportRef, setActionError)}
                          title={`Open the bill print for invoice #${reportRef.docNum || reportRef.docEntry}`}
                        >
                          <HiOutlineDocumentText aria-hidden="true" /> Generate Report
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled
                          title="No SAP document number was recorded for this invoice"
                        >
                          <HiOutlineDocumentText aria-hidden="true" /> Generate Report
                        </Button>
                      ))}
                    {(status === "ERROR" || status === "CL_RAISED") && canPostToSap && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy}
                        onClick={() => handlePostToSap(record)}
                      >
                        <HiOutlineArrowPath aria-hidden="true" />
                        {busy ? "…" : "Repost to SAP"}
                      </Button>
                    )}
                    {status === "CL_RAISED" && canPostToSap && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => openCreditLimitFlow(record)}
                      >
                        <HiOutlineBanknotes aria-hidden="true" /> Show Flow
                      </Button>
                    )}
                    {status === "ERROR" && canPostToSap && isCreditLimitError(record) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => openCreditLimitRequest(record)}
                      >
                        <HiOutlineBanknotes aria-hidden="true" />
                        {busy ? "…" : "Raise CL"}
                      </Button>
                    )}
                    {status === "REJECTED" && canPostToSap && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => handleEdit(record)}
                      >
                        <HiOutlinePencilSquare aria-hidden="true" />
                        {busy ? "…" : "Edit"}
                      </Button>
                    )}
                    {/* Last, so it never sits where Approve/Post used to be
                        and gets hit by muscle memory. */}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-subtle hover:bg-danger-soft hover:text-danger"
                        disabled={busy}
                        onClick={() => handleDelete(record)}
                        title="Remove this entry from the review screen"
                      >
                        <HiOutlineTrash aria-hidden="true" />
                        {busy ? "…" : "Delete"}
                      </Button>
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
