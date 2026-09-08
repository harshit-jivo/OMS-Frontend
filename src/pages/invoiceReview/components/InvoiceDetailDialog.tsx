/**
 * The invoice detail modal (`selected`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE READER CAME FOR, IN THAT ORDER
 * ─────────────────────────────────────────────────────────────────────────
 * The ordering is deliberate and it is not the API's. Anything that explains
 * why this invoice is not simply fine — a rejection reason, a SAP error, the
 * fact that it is a rework of something that was turned down — comes FIRST,
 * because on those records it is the reason the dialog was opened at all. The
 * amount and status follow, then the metadata, then the lines, then the raw
 * payload behind a disclosure for the person debugging a SAP push.
 *
 * The five footers below are mutually exclusive: which decision this invoice
 * is waiting for is a function of its status, and offering the others greyed
 * out would be five invitations of which four can never become true.
 */
import {
  HiOutlineArrowPath,
  HiOutlineArrowUturnLeft,
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
  HiOutlineDocumentText,
  HiOutlinePaperAirplane,
  HiOutlinePencilSquare,
  HiOutlineXCircle,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Notice, SectionHeading } from "@/components/ui/page";
import { toneForStatus } from "@/components/ui/statusTone";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toNumber } from "../../SalesInvoice/salesInvoice.utils";
import {
  formatAmount,
  formatDateTime,
  hasRef,
  invoiceReportRef,
  isCreditLimitError,
  normalizeStatus,
  openReport,
  statusLabel,
} from "../helpers";
import type { UseInvoiceReviewResult } from "../useInvoiceReview";

export default function InvoiceDetailDialog({ view }: { view: UseInvoiceReviewResult }) {
  const {
    selected,
    setSelected,
    selectedPayload,
    itemNameOf,
    actionId,
    canApproveReject,
    canPostToSap,
    setActionError,
    handleAction,
    handlePostToSap,
    handleEdit,
    openCreditLimitRequest,
    openCreditLimitFlow,
    openHistory,
  } = view;

  const status = selected ? normalizeStatus(selected.status) : "PENDING";
  const busy = Boolean(selected) && actionId === selected?.id;
  const lines = selectedPayload.DocumentLines || [];

  return (
    <Dialog
      open={Boolean(selected)}
      onOpenChange={(next) => {
        if (!next) setSelected(null);
      }}
    >
      {selected && (
        <DialogContent title="Invoice detail" size="xl">
          <DialogHeader>
            <div className="min-w-0">
              <p className="m-0 mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
                Invoice details
              </p>
              <DialogTitle>SO #{selected.so_number || "—"}</DialogTitle>
              <DialogDescription>{selected.party_name || "—"}</DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {/* The approver of a reworked invoice needs to see why the previous
                attempt was turned down before deciding on this one. */}
            {hasRef(selected.supersedes) && (
              <Notice tone="hold">
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <HiOutlineArrowUturnLeft
                    aria-hidden="true"
                    className="size-4 shrink-0 self-center"
                  />
                  <strong className="font-semibold">
                    Revision of invoice #{selected.supersedes}
                    {selected.supersedes_so_number
                      ? ` (SO #${selected.supersedes_so_number})`
                      : ""}
                    , which was rejected.
                  </strong>
                </span>
                {selected.supersedes_rejection_reason && (
                  <span className="mt-1 block">
                    Previous rejection reason: {selected.supersedes_rejection_reason}
                  </span>
                )}
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 px-0"
                  onClick={() => {
                    const record = selected;
                    setSelected(null);
                    void openHistory(record);
                  }}
                >
                  View full revision history
                </Button>
              </Notice>
            )}

            {hasRef(selected.superseded_by_id) && (
              <Notice tone="info" title={`Replaced by invoice #${selected.superseded_by_id}`}>
                This version was reworked and is no longer active.
              </Notice>
            )}

            {selected.error_message && (
              <Notice tone="bad" title="SAP error">
                {selected.error_message}
              </Notice>
            )}

            {selected.rejection_reason && (
              <Notice tone="bad" title="Rejection reason">
                {selected.rejection_reason}
              </Notice>
            )}

            {/* The two facts that decide what happens next, at the size that
                says so. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                  Total amount
                </p>
                <strong className="text-xl font-bold tabular-nums text-ink">
                  {formatAmount(selected.total_amount)}
                </strong>
              </div>
              <Badge tone={toneForStatus(status)} className="px-3 py-1 text-[13px]">
                {statusLabel(status)}
              </Badge>
            </div>

            <DetailGrid>
              <DetailField label="Customer code" value={selectedPayload.CardCode || "—"} />
              <DetailField label="Doc date" value={selectedPayload.DocDate || "—"} />
              <DetailField label="Due date" value={selectedPayload.DocDueDate || "—"} />
              <DetailField label="Submitted" value={formatDateTime(selected.created_at)} />
            </DetailGrid>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <SectionHeading>Line items</SectionHeading>
                <Badge tone="neutral">{lines.length}</Badge>
              </div>
              <div className="overflow-x-auto rounded-card border border-line">
                <Table density="compact">
                  <TableHeader>
                    <TableRow className="bg-surface hover:bg-surface">
                      <TableHead>Item</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Tax Code</TableHead>
                      <TableHead>Batches</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => (
                      <TableRow key={line.LineNum ?? index}>
                        <TableCell className="align-top">
                          {itemNameOf(line.ItemCode) ? (
                            <>
                              <span className="block font-medium text-ink">
                                {itemNameOf(line.ItemCode)}
                              </span>
                              <span className="block text-[11.5px] text-subtle">
                                {line.ItemCode}
                              </span>
                            </>
                          ) : (
                            <span className="font-medium text-ink">{line.ItemCode || "—"}</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">{line.WarehouseCode || "—"}</TableCell>
                        <TableCell className="align-top text-right tabular-nums">
                          {toNumber(line.Quantity).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="align-top">{line.TaxCode || "—"}</TableCell>
                        <TableCell className="align-top">
                          {(line.BatchNumbers || []).length === 0 ? (
                            <span className="text-subtle">No batch</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {(line.BatchNumbers || []).map((batch, batchIndex) => (
                                <Badge tone="neutral" key={batchIndex}>
                                  {batch.BatchNumber ||
                                    `Serial ${batch.SystemSerialNumber ?? "?"}`}
                                  <span className="font-semibold text-body">
                                    ×{toNumber(batch.Quantity)}
                                  </span>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Closed by default and last on the page: it is for the person
                working out why SAP refused the push, not for the approver. */}
            <details className="rounded-card border border-line bg-surface">
              <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-semibold text-body">
                Raw payload
              </summary>
              <pre className="m-0 max-h-[320px] overflow-auto border-t border-line px-3 py-2 text-[11.5px] leading-relaxed text-subtle">
                {JSON.stringify(selectedPayload, null, 2)}
              </pre>
            </details>
          </DialogBody>

          {["PENDING", "EDITED"].includes(status) && (
            <DialogFooter>
              {canApproveReject ? (
                <>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => handleAction(selected, "REJECTED")}
                  >
                    <HiOutlineXCircle aria-hidden="true" /> Reject
                  </Button>
                  <Button
                    variant="success"
                    disabled={busy}
                    onClick={() => handleAction(selected, "APPROVED")}
                  >
                    <HiOutlineCheckCircle aria-hidden="true" /> Approve
                  </Button>
                </>
              ) : (
                <Badge tone="hold">Pending approval</Badge>
              )}
            </DialogFooter>
          )}

          {status === "APPROVED" && canPostToSap && (
            <DialogFooter>
              <Button variant="primary" disabled={busy} onClick={() => handlePostToSap(selected)}>
                <HiOutlinePaperAirplane aria-hidden="true" /> Post to SAP
              </Button>
            </DialogFooter>
          )}

          {status === "POSTED_TO_SAP" && (
            <DialogFooter>
              {invoiceReportRef(selected) ? (
                <Button
                  onClick={() => openReport(invoiceReportRef(selected)!, setActionError)}
                >
                  <HiOutlineDocumentText aria-hidden="true" /> Generate Invoice Report
                </Button>
              ) : (
                <Button disabled title="No SAP document number was recorded for this invoice">
                  <HiOutlineDocumentText aria-hidden="true" /> Generate Invoice Report
                </Button>
              )}
            </DialogFooter>
          )}

          {["ERROR", "CL_RAISED"].includes(status) && canPostToSap && (
            <DialogFooter>
              {status === "ERROR" && isCreditLimitError(selected) && (
                <Button disabled={busy} onClick={() => openCreditLimitRequest(selected)}>
                  <HiOutlineBanknotes aria-hidden="true" /> Raise Credit Limit
                </Button>
              )}
              {status === "CL_RAISED" && (
                <Button disabled={busy} onClick={() => openCreditLimitFlow(selected)}>
                  <HiOutlineBanknotes aria-hidden="true" /> Show Flow
                </Button>
              )}
              <Button variant="primary" disabled={busy} onClick={() => handlePostToSap(selected)}>
                <HiOutlineArrowPath aria-hidden="true" /> Repost to SAP
              </Button>
            </DialogFooter>
          )}

          {status === "REJECTED" && canPostToSap && (
            <DialogFooter>
              <Button variant="primary" disabled={busy} onClick={() => handleEdit(selected)}>
                <HiOutlinePencilSquare aria-hidden="true" /> Edit &amp; Resubmit
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
