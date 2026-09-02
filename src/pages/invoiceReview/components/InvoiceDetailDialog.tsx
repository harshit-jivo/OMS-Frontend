/**
 * The invoice detail modal (`selected`) — Phase 4 split. Markup moved
 * verbatim out of `InvoiceReview.tsx`.
 */
import {
  HiArrowPath,
  HiArrowUturnLeft,
  HiBanknotes,
  HiCheckCircle,
  HiDocumentText,
  HiExclamationTriangle,
  HiPaperAirplane,
  HiPencilSquare,
  HiXCircle,
  HiXMark,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { toneForStatus } from "@/components/ui/statusTone";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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

  return (
    <Dialog
      open={Boolean(selected)}
      onOpenChange={(next) => {
        if (!next) (() => setSelected(null))();
      }}
    >
      {selected && (
        <DialogContent
          title="Invoice detail"
          variant="bare"
          size="auto"
          showClose={false}
          className="ir-modal"
        >
          <header className="ir-modal-head">
            <div>
              <span className="ir-eyebrow">Invoice Details</span>
              <h2>SO #{selected.so_number || "—"}</h2>
              <p>{selected.party_name || "—"}</p>
            </div>
            <button
              type="button"
              className="ir-icon-btn"
              aria-label="Close details"
              onClick={() => setSelected(null)}
            >
              <HiXMark aria-hidden="true" />
            </button>
          </header>

          <div className="ir-modal-body">
            {/* The approver of a reworked invoice needs to see why the previous
                attempt was turned down before deciding on this one. */}
            {hasRef(selected.supersedes) && (
              <div className="ir-lineage-box" role="note">
                <HiArrowUturnLeft aria-hidden="true" />
                <div>
                  <strong>
                    Revision of invoice #{selected.supersedes}
                    {selected.supersedes_so_number
                      ? ` (SO #${selected.supersedes_so_number})`
                      : ""}
                    , which was rejected.
                  </strong>
                  {selected.supersedes_rejection_reason && (
                    <p>Previous rejection reason: {selected.supersedes_rejection_reason}</p>
                  )}
                  <button
                    type="button"
                    className="ir-link-btn"
                    onClick={() => {
                      const record = selected;
                      setSelected(null);
                      void openHistory(record);
                    }}
                  >
                    View full revision history
                  </button>
                </div>
              </div>
            )}
            {hasRef(selected.superseded_by_id) && (
              <div className="ir-lineage-box ir-lineage-box-muted" role="note">
                <HiArrowUturnLeft aria-hidden="true" />
                <div>
                  <strong>Replaced by invoice #{selected.superseded_by_id}.</strong>
                  <p>This version was reworked and is no longer active.</p>
                </div>
              </div>
            )}
            {selected.error_message && (
              <div className="ir-error-box" role="alert">
                <HiExclamationTriangle aria-hidden="true" />
                <span>{selected.error_message}</span>
              </div>
            )}
            {selected.rejection_reason && (
              <div className="ir-reason-box" role="note">
                <HiXCircle aria-hidden="true" />
                <span>
                  <strong>Rejection reason:</strong> {selected.rejection_reason}
                </span>
              </div>
            )}
            <div className="ir-detail-hero">
              <div className="ir-detail-hero-amount">
                <span className="ir-eyebrow">Total Amount</span>
                <strong>{formatAmount(selected.total_amount)}</strong>
              </div>
              <Badge
                tone={toneForStatus(normalizeStatus(selected.status))}
                className="ir-badge-lg"
              >
                {statusLabel(normalizeStatus(selected.status))}
              </Badge>
            </div>

            <dl className="ir-meta-grid">
              <div>
                <dt>Customer Code</dt>
                <dd>{selectedPayload.CardCode || "—"}</dd>
              </div>
              <div>
                <dt>Doc Date</dt>
                <dd>{selectedPayload.DocDate || "—"}</dd>
              </div>
              <div>
                <dt>Due Date</dt>
                <dd>{selectedPayload.DocDueDate || "—"}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDateTime(selected.created_at)}</dd>
              </div>
            </dl>

            <h3 className="ir-section-title">
              Line Items
              <span className="ir-section-count">
                {(selectedPayload.DocumentLines || []).length}
              </span>
            </h3>
            <div className="ir-table-wrap">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead className="ir-num">Qty</TableHead>
                    <TableHead>Tax Code</TableHead>
                    <TableHead>Batches</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(selectedPayload.DocumentLines || []).map((line, index) => (
                    <TableRow key={line.LineNum ?? index}>
                      <TableCell className="ir-cell-item">
                        {itemNameOf(line.ItemCode) ? (
                          <>
                            <span className="ir-item-name">{itemNameOf(line.ItemCode)}</span>
                            <span className="ir-item-code">{line.ItemCode}</span>
                          </>
                        ) : (
                          <span className="ir-item-name">{line.ItemCode || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>{line.WarehouseCode || "—"}</TableCell>
                      <TableCell className="ir-num">
                        {toNumber(line.Quantity).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>{line.TaxCode || "—"}</TableCell>
                      <TableCell>
                        {(line.BatchNumbers || []).length === 0 ? (
                          <span className="ir-muted">No batch</span>
                        ) : (
                          <div className="ir-batch-chips">
                            {(line.BatchNumbers || []).map((batch, batchIndex) => (
                              <span className="ir-batch-chip" key={batchIndex}>
                                {batch.BatchNumber || `Serial ${batch.SystemSerialNumber ?? "?"}`}
                                <em>×{toNumber(batch.Quantity)}</em>
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <details className="ir-raw">
              <summary>Raw payload</summary>
              <pre>{JSON.stringify(selectedPayload, null, 2)}</pre>
            </details>
          </div>

          {["PENDING", "EDITED"].includes(normalizeStatus(selected.status)) && (
            <footer className="ir-modal-foot">
              {canApproveReject ? (
                <>
                  <button
                    type="button"
                    className="ir-btn ir-btn-reject"
                    disabled={actionId === selected.id}
                    onClick={() => handleAction(selected, "REJECTED")}
                  >
                    <HiXCircle aria-hidden="true" />
                    Reject
                  </button>
                  <button
                    type="button"
                    className="ir-btn ir-btn-approve"
                    disabled={actionId === selected.id}
                    onClick={() => handleAction(selected, "APPROVED")}
                  >
                    <HiCheckCircle aria-hidden="true" />
                    Approve
                  </button>
                </>
              ) : (
                <span className="ir-pending-tag">Pending Approval</span>
              )}
            </footer>
          )}

          {normalizeStatus(selected.status) === "APPROVED" && canPostToSap && (
            <footer className="ir-modal-foot">
              <button
                type="button"
                className="ir-btn ir-btn-sap"
                disabled={actionId === selected.id}
                onClick={() => handlePostToSap(selected)}
              >
                <HiPaperAirplane aria-hidden="true" />
                Post to SAP
              </button>
            </footer>
          )}

          {normalizeStatus(selected.status) === "POSTED_TO_SAP" && (
            <footer className="ir-modal-foot">
              {invoiceReportRef(selected) ? (
                <button
                  type="button"
                  className="ir-btn ir-btn-report"
                  onClick={() => openReport(invoiceReportRef(selected)!, setActionError)}
                >
                  <HiDocumentText aria-hidden="true" />
                  Generate Invoice Report
                </button>
              ) : (
                <button
                  type="button"
                  className="ir-btn ir-btn-report"
                  disabled
                  title="No SAP document number was recorded for this invoice"
                >
                  <HiDocumentText aria-hidden="true" />
                  Generate Invoice Report
                </button>
              )}
            </footer>
          )}

          {["ERROR", "CL_RAISED"].includes(normalizeStatus(selected.status)) && canPostToSap && (
            <footer className="ir-modal-foot">
              {normalizeStatus(selected.status) === "ERROR" && isCreditLimitError(selected) && (
                <button
                  type="button"
                  className="ir-btn ir-btn-cl"
                  disabled={actionId === selected.id}
                  onClick={() => openCreditLimitRequest(selected)}
                >
                  <HiBanknotes aria-hidden="true" />
                  Raise Credit Limit
                </button>
              )}
              {normalizeStatus(selected.status) === "CL_RAISED" && (
                <button
                  type="button"
                  className="ir-btn ir-btn-cl"
                  disabled={actionId === selected.id}
                  onClick={() => openCreditLimitFlow(selected)}
                >
                  <HiBanknotes aria-hidden="true" />
                  Show Flow
                </button>
              )}
              <button
                type="button"
                className="ir-btn ir-btn-sap"
                disabled={actionId === selected.id}
                onClick={() => handlePostToSap(selected)}
              >
                <HiArrowPath aria-hidden="true" />
                Repost to SAP
              </button>
            </footer>
          )}

          {normalizeStatus(selected.status) === "REJECTED" && canPostToSap && (
            <footer className="ir-modal-foot">
              <button
                type="button"
                className="ir-btn ir-btn-edit"
                disabled={actionId === selected.id}
                onClick={() => handleEdit(selected)}
              >
                <HiPencilSquare aria-hidden="true" />
                Edit &amp; Resubmit
              </button>
            </footer>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
