import { useEffect, useState } from "react";
import { HiCheckCircle, HiXMark } from "react-icons/hi2";
import ContentsTab from "./ContentsTab";
import InteractiveLoader from "./InteractiveLoader";
import { formatDateDisplay, formatMoney, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
  onReset: () => void;
  onAddItems?: () => void;
};

function DraftDocumentStrip({ state }: { state: SalesInvoiceState }) {
  const [postingDateEditable, setPostingDateEditable] = useState(false);
  const updatePostingDate = (postingDate: string) => {
    state.updateForm({
      postingDate,
      dueDate: postingDate,
      documentDate: postingDate,
    });
  };

  return (
    <label className="si-draft-summary-date">
      <span>Posting Date</span>
      <input
        type="date"
        value={state.form.postingDate}
        readOnly={!postingDateEditable}
        className={postingDateEditable ? "si-date-editable" : ""}
        onDoubleClick={(event) => {
          setPostingDateEditable(true);
          window.requestAnimationFrame(() => {
            event.currentTarget.focus();
            event.currentTarget.showPicker?.();
          });
        }}
        onBlur={() => setPostingDateEditable(false)}
        onChange={(event) => updatePostingDate(event.target.value)}
      />
    </label>
  );
}

export default function DraftStep({ state, onReset, onAddItems }: Props) {
  const [totalsModalOpen, setTotalsModalOpen] = useState(false);
  const [postErrorNotificationOpen, setPostErrorNotificationOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const customerName = state.customerDetails?.CardName || state.selectedParty?.CardName || "-";
  const postDisabledReason = state.selectedLineBatchError;

  const addFreightRow = () => {
    state.addFreightRow();
    setTotalsModalOpen(true);
  };

  useEffect(() => {
    if (state.postError) setPostErrorNotificationOpen(true);
  }, [state.postError]);

  useEffect(() => {
    if (state.postSuccess) {
      setSuccessModalOpen(true);
    }
  }, [state.postSuccess]);

  const closeSuccessModal = () => {
    setSuccessModalOpen(false);
    onReset();
  };

  useEffect(() => {
    if (state.posting) setTotalsModalOpen(false);
  }, [state.posting]);

  return (
    <div className="si-draft-stage">
      {state.posting && <InteractiveLoader />}
      {state.loadingDraftDetails && <div className="si-loader">Loading customer and salesperson details...</div>}
      {state.draftError && <div className="si-inline-error">{state.draftError}</div>}

      <section className="si-card si-draft-party-card si-draft-summary-card">
        <div className="si-draft-party-name-cell">
          <span>Party Name</span>
          <strong>{customerName}</strong>
          <div className="si-draft-summary-actions">
            {onAddItems && (
              <button className="si-draft-change-party-btn" type="button" onClick={onAddItems}>
                Add Items
              </button>
            )}
            <button className="si-draft-change-party-btn" type="button" onClick={onReset}>
              Change Party
            </button>
          </div>
        </div>
        <DraftDocumentStrip state={state} />
      </section>

      <section className="si-card si-tabs-card">
        <ContentsTab state={state} />
      </section>

      <details className="si-payload-box si-step3-payload">
        <summary>Draft payload - dates display as {formatDateDisplay(state.form.postingDate)}</summary>
        <pre>{JSON.stringify(state.payload, null, 2)}</pre>
      </details>

      {state.postError && postErrorNotificationOpen && (
        <aside className="si-floating-notification si-floating-notification-error" role="alert" aria-live="assertive">
          <header>
            <div>
              <strong>Unable to post invoice to SAP HANA</strong>
              <span>Full error message</span>
            </div>
            <button
              type="button"
              aria-label="Close SAP error notification"
              onClick={() => setPostErrorNotificationOpen(false)}
            >
              <HiXMark aria-hidden="true" />
            </button>
          </header>
          <pre>{state.postError}</pre>
        </aside>
      )}


      {successModalOpen && (
        <div className="si-modal-backdrop si-success-backdrop" role="presentation">
          <section
            className="si-success-modal"
            role="alertdialog"
            aria-modal="true"
            aria-label="Invoice posted to SAP HANA"
          >
            <button
              type="button"
              className="si-success-close"
              aria-label="Close"
              onClick={closeSuccessModal}
            >
              <HiXMark aria-hidden="true" />
            </button>
            <span className="si-success-icon" aria-hidden="true">
              <HiCheckCircle />
            </span>
            <span className="si-eyebrow">Sales Invoice</span>
            <h2>Invoice Posted to SAP HANA</h2>
            <p className="si-success-message">{state.postSuccess}</p>
            <div className="si-success-actions">
              <button className="si-btn si-btn-primary" type="button" onClick={closeSuccessModal}>
                Create New Invoice
              </button>
            </div>
          </section>
        </div>
      )}

      {totalsModalOpen && (
        <div className="si-modal-backdrop" role="presentation">
          <section className="si-totals-modal" role="dialog" aria-modal="true" aria-label="Invoice totals and freight">
            <header className="si-so-modal-head">
              <div>
                <span className="si-eyebrow">Invoice Total</span>
                <h2>{formatMoney(state.totals.grandTotal)}</h2>
                <p>Review totals and freight charges before posting.</p>
              </div>
              <button className="si-btn si-btn-outline" type="button" onClick={() => setTotalsModalOpen(false)}>
                Close
              </button>
            </header>

            <div className="si-action-total-panel si-action-total-panel-modal">
            <section className="si-footer-drawer-section">
              <header className="si-footer-drawer-head">
                <strong>Totals</strong>
              </header>
              <div className="si-totals-breakdown">
                <div className="si-totals-line">
                  <span>Taxable Amount</span>
                  <strong>{formatMoney(state.totals.taxable)}</strong>
                </div>
                {state.totals.discountAmount > 0 && (
                  <div className="si-totals-line si-totals-line-muted">
                    <span>Discount</span>
                    <strong>- {formatMoney(state.totals.discountAmount)}</strong>
                  </div>
                )}
                {state.totals.freight > 0 && (
                  <div className="si-totals-line">
                    <span>Freight</span>
                    <strong>{formatMoney(state.totals.freight)}</strong>
                  </div>
                )}
                <div className="si-totals-line">
                  <span>Tax Amount</span>
                  <strong>{formatMoney(state.totals.tax)}</strong>
                </div>
                {Math.abs(state.totals.roundOff) >= 0.005 && (
                  <div className="si-totals-line si-totals-line-muted">
                    <span>Round Off</span>
                    <strong>{formatMoney(state.totals.roundOff)}</strong>
                  </div>
                )}
                <div className="si-totals-line si-totals-grand">
                  <span>Grand Total</span>
                  <strong>{formatMoney(state.totals.grandTotal)}</strong>
                </div>
              </div>
            </section>

            <section className="si-footer-drawer-section">
              <header className="si-footer-drawer-head">
                <strong>Freight</strong>
                <button className="si-footer-add-freight" type="button" onClick={addFreightRow}>
                  + Add
                </button>
              </header>
              {state.freightRows.length === 0 ? (
                <div className="si-footer-freight-empty">No freight expenses added.</div>
              ) : (
                <div className="si-freight-rows">
                  {state.freightRows.map((row, index) => (
                    <div className="si-freight-row" key={`${row.expenseCode}-${index}`}>
                      <span className="si-freight-row-index">{index + 1}</span>
                      <label className="si-freight-field si-freight-field-expense">
                        <span>Expense</span>
                        <select
                          value={row.expenseCode}
                          aria-label={`Freight expense ${index + 1}`}
                          onChange={(event) => {
                            const selected = state.freightOptions.find(
                              (option) => String(option.ExpnsCode) === event.target.value,
                            );
                            state.updateFreightRow(index, {
                              expenseCode: event.target.value,
                              expenseName: selected?.ExpnsName || "",
                            });
                          }}
                        >
                          <option value="">Select freight</option>
                          {state.freightOptions.map((option) => (
                            <option key={option.ExpnsCode} value={option.ExpnsCode}>
                              {option.ExpnsName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="si-freight-field si-freight-field-amount">
                        <span>Amount</span>
                        <div className="si-freight-amount-input">
                          <em>₹</em>
                          <input
                            type="number"
                            min="0"
                            value={row.lineTotal}
                            aria-label={`Freight amount ${index + 1}`}
                            onChange={(event) => state.updateFreightRow(index, { lineTotal: toNumber(event.target.value) })}
                          />
                        </div>
                      </label>
                      <label className="si-freight-field si-freight-field-tax">
                        <span>Tax Code</span>
                        <input
                          type="text"
                          value={row.taxCode}
                          aria-label={`Freight tax code ${index + 1}`}
                          placeholder="GST exempt code"
                          onChange={(event) => state.updateFreightRow(index, { taxCode: event.target.value })}
                        />
                      </label>
                      <button
                        className="si-freight-remove"
                        type="button"
                        onClick={() => state.removeFreightRow(index)}
                        aria-label={`Remove freight row ${index + 1}`}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

            <footer className="si-totals-modal-foot">
              <div className="si-totals-modal-foot-summary">
                <span>Grand Total</span>
                <strong>{formatMoney(state.totals.grandTotal)}</strong>
              </div>
              {postDisabledReason && (
                <span className="si-totals-modal-foot-hint">{postDisabledReason}</span>
              )}
              <button
                className="si-btn si-btn-primary si-totals-modal-post"
                type="button"
                disabled={state.posting || Boolean(postDisabledReason)}
                title={postDisabledReason || undefined}
                onClick={state.postInvoice}
              >
                {state.posting ? "Submitting..." : "Submit for Review"}
              </button>
            </footer>
          </section>
        </div>
      )}

      <div className="si-action-bar">
        <div className="si-action-bar-row">
          <button
            className="si-action-total-btn"
            type="button"
            onClick={() => setTotalsModalOpen(true)}
          >
            <span>Total</span>
            <strong>{formatMoney(state.totals.grandTotal)}</strong>
          </button>
          <div className="si-action-buttons">
            <button
              className="si-btn si-btn-primary"
              type="button"
              onClick={() => setTotalsModalOpen(true)}
            >
              Review &amp; Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
