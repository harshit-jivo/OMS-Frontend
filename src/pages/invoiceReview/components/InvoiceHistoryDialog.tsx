/**
 * The invoice history / revision timeline modal (`historyFor`) — Phase 4
 * split. Markup moved verbatim out of `InvoiceReview.tsx`.
 */
import { Fragment } from "react";
import { HiInbox, HiXMark } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { toneForStatus } from "@/components/ui/statusTone";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDateTime, hasRef, normalizeStatus, statusLabel } from "../helpers";
import type { UseInvoiceReviewResult } from "../useInvoiceReview";

export default function InvoiceHistoryDialog({ view }: { view: UseInvoiceReviewResult }) {
  const { historyFor, setHistoryFor, historyRecords, historyLoading, historyError, historyVersions } =
    view;

  return (
    <Dialog
      open={Boolean(historyFor)}
      onOpenChange={(next) => {
        if (!next) (() => setHistoryFor(null))();
      }}
    >
      {historyFor && (
        <DialogContent
          title="Invoice history"
          variant="bare"
          size="auto"
          showClose={false}
          className="ir-modal"
        >
          <header className="ir-modal-head">
            <div>
              <span className="ir-eyebrow">Status History</span>
              <h2>SO #{historyFor.so_number || "—"}</h2>
              <p>{historyFor.party_name || "—"}</p>
            </div>
            <button
              type="button"
              className="ir-icon-btn"
              aria-label="Close history"
              onClick={() => setHistoryFor(null)}
            >
              <HiXMark aria-hidden="true" />
            </button>
          </header>

          <div className="ir-modal-body">
            {historyError && <div className="ir-banner ir-banner-error">{historyError}</div>}
            {historyLoading ? (
              <div className="ir-empty" role="status" aria-live="polite">
                Loading history…
              </div>
            ) : historyRecords.length === 0 && !historyError ? (
              <div className="ir-empty">
                <HiInbox aria-hidden="true" />
                <span>No history available for this entry.</span>
              </div>
            ) : (
              <ol className="ir-timeline">
                {historyRecords.map((entry, index) => {
                  const entryStatus = normalizeStatus(entry.status);
                  // The timeline spans every version in the revision chain, so
                  // mark where one log ends and its rework begins.
                  const logId = entry.invoice_log;
                  const startsVersion =
                    index === 0 || historyRecords[index - 1].invoice_log !== logId;
                  const versionNumber = historyVersions.get(String(logId ?? "")) ?? 1;
                  return (
                    <Fragment key={entry.id ?? index}>
                      {startsVersion && historyVersions.size > 1 && (
                        <li className="ir-timeline-sep" aria-hidden="false">
                          <span>
                            Version {versionNumber} of {historyVersions.size}
                            {hasRef(logId) ? ` · invoice #${logId}` : ""}
                          </span>
                        </li>
                      )}
                      <li className="ir-timeline-item">
                        <span
                          className={`ir-timeline-dot ir-dot-${entryStatus.toLowerCase()}`}
                          aria-hidden="true"
                        />
                        <div className="ir-timeline-body">
                          <div className="ir-timeline-head">
                            <Badge tone={toneForStatus(entryStatus)}>
                              {statusLabel(entryStatus)}
                            </Badge>
                            <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
                          </div>
                          {entry.created_by_name && (
                            <p className="ir-timeline-note ir-timeline-by">
                              By: {entry.created_by_name}
                            </p>
                          )}
                          {entry.rejection_reason && (
                            <p className="ir-timeline-note">Reason: {entry.rejection_reason}</p>
                          )}
                          {entry.error_message && (
                            <p className="ir-timeline-note ir-timeline-error">
                              {entry.error_message}
                            </p>
                          )}
                        </div>
                      </li>
                    </Fragment>
                  );
                })}
              </ol>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
