/**
 * The credit-limit request form modal (`clRecord`) — Phase 4 split. Markup
 * moved verbatim out of `InvoiceReview.tsx`.
 */
import { HiBanknotes, HiXMark } from "react-icons/hi2";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatAmount, parsePayload } from "../helpers";
import type { UseInvoiceReviewResult } from "../useInvoiceReview";

export default function CreditLimitRequestDialog({ view }: { view: UseInvoiceReviewResult }) {
  const {
    clRecord,
    setClRecord,
    clCard,
    clLoading,
    clLookupError,
    clNewLimit,
    setClNewLimit,
    clValidTill,
    setClValidTill,
    setClFile,
    clSubmitting,
    clSubmitError,
    submitCreditLimitRequest,
  } = view;

  return (
    <Dialog
      open={Boolean(clRecord)}
      onOpenChange={(next) => {
        if (!next) (() => !clSubmitting && setClRecord(null))();
      }}
    >
      {clRecord && (
        <DialogContent
          title="Credit limit request"
          variant="bare"
          size="auto"
          showClose={false}
          className="ir-modal ir-cl-modal"
        >
          <header className="ir-modal-head">
            <div>
              <span className="ir-eyebrow">Credit Limit Request</span>
              <h2>{clCard?.cardName || clRecord.party_name || "—"}</h2>
              <p>{String(parsePayload(clRecord.invoice_payload).CardCode || "—")}</p>
            </div>
            <button
              type="button"
              className="ir-icon-btn"
              aria-label="Close credit limit request"
              onClick={() => !clSubmitting && setClRecord(null)}
            >
              <HiXMark aria-hidden="true" />
            </button>
          </header>

          <div className="ir-modal-body">
            {clLoading ? (
              <div className="ir-empty" role="status" aria-live="polite">
                Loading customer credit data…
              </div>
            ) : (
              <>
                {clLookupError && (
                  <div className="ir-banner ir-banner-error">{clLookupError}</div>
                )}
                <dl className="ir-meta-grid">
                  <div>
                    <dt>Current Balance</dt>
                    <dd>{clCard ? formatAmount(clCard.balance) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Current Credit Limit</dt>
                    <dd>{clCard ? formatAmount(clCard.creditLine) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Card Type</dt>
                    <dd>{clCard?.cardType || "—"}</dd>
                  </div>
                  <div>
                    <dt>Branch</dt>
                    <dd>{clRecord.branch || "—"}</dd>
                  </div>
                </dl>

                <div className="ir-cl-form">
                  <label className="ir-cl-field">
                    <span>New Credit Limit *</span>
                    <input
                      type="number"
                      min={1}
                      value={clNewLimit}
                      onChange={(event) => setClNewLimit(event.target.value)}
                      placeholder="e.g. 200000"
                    />
                  </label>
                  <label className="ir-cl-field">
                    <span>Valid Till *</span>
                    <input
                      type="date"
                      value={clValidTill}
                      onChange={(event) => setClValidTill(event.target.value)}
                    />
                  </label>
                  <label className="ir-cl-field ir-cl-field-wide">
                    <span>Attachment * (mandatory)</span>
                    <input
                      type="file"
                      onChange={(event) => setClFile(event.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                {clSubmitError && (
                  <div className="ir-banner ir-banner-error">{clSubmitError}</div>
                )}
              </>
            )}
          </div>

          <footer className="ir-modal-foot">
            <button
              type="button"
              className="ir-btn ir-btn-ghost"
              onClick={() => setClRecord(null)}
              disabled={clSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ir-btn ir-btn-cl"
              onClick={submitCreditLimitRequest}
              disabled={clSubmitting || clLoading}
            >
              <HiBanknotes aria-hidden="true" />
              {clSubmitting ? "Submitting…" : "Raise Request"}
            </button>
          </footer>
        </DialogContent>
      )}
    </Dialog>
  );
}
