/**
 * The main invoice list — Phase 4 split, plus Phase 5.5 row virtualization.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE PAGE AT A TIME, NOT A VIRTUAL WINDOW
 * ─────────────────────────────────────────────────────────────────────────
 * This drew a moving window of the whole list (`useWindowVirtualizer`), with
 * two spacer rows standing in for what was not mounted. It is paginated now
 * and the virtualizer is gone: the hook hands over one page of 25 rows, and
 * there is nothing in 25 rows worth virtualizing.
 *
 * That also retires a genuinely awkward dependency. The virtualizer needed
 * this table's document offset, read as `offsetTop` from the body — so a
 * `position: relative` added to `Page`, `Card` or `.content-area` by anyone,
 * for any reason, would have silently landed every row in the wrong place.
 * Nothing here measures the document any more.
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

export default function InvoiceTable({ view }: { view: UseInvoiceReviewResult }) {
  const {
    loading,
    records,
    filteredRecords,
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

  if (loading) {
    return (
      <div className="p-4">
        <TableSkeleton columns={COLUMN_COUNT} label="Loading invoices" />
      </div>
    );
  }

  if (filteredRecords.length === 0) {
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

  return (
    <div className="overflow-x-auto">
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
          {records.map((record, index) => {
            const status = normalizeStatus(record.status);
            const busy = actionId === record.id;
            const reportRef = invoiceReportRef(record);
            // The backend decides which statuses may be removed and says so
            // per row; older responses without the flag simply show no
            // Delete button rather than offering one that would be refused.
            const canDelete = Boolean(record.can_delete);
            return (
              <TableRow key={record.id ?? index}>
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
        </TableBody>
      </Table>
    </div>
  );
}
