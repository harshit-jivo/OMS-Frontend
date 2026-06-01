import { useState } from "react";
import ContentsTab from "./ContentsTab";
import { formatDateDisplay, formatMoney, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
  onReset: () => void;
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

export default function DraftStep({ state, onReset }: Props) {
  const [totalsModalOpen, setTotalsModalOpen] = useState(false);
  const customerName = state.customerDetails?.CardName || state.selectedParty?.CardName || "-";
  const totalBeforeTax = state.totals.taxable + state.totals.freight;

  const addFreightRow = () => {
    state.addFreightRow();
    setTotalsModalOpen(true);
  };

  return (
    <div className="si-draft-stage">
      {state.loadingDraftDetails && <div className="si-loader">Loading customer and salesperson details...</div>}
      {state.draftError && <div className="si-inline-error">{state.draftError}</div>}

      <section className="si-card si-draft-party-card si-draft-summary-card">
        <div className="si-draft-party-name-cell">
          <span>Party Name</span>
          <strong>{customerName}</strong>
          <button className="si-draft-change-party-btn" type="button" onClick={onReset}>
            Change Party
          </button>
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

      {(state.postError || state.postSuccess) && (
        <div className={state.postError ? "si-inline-error" : "si-inline-success"}>
          {state.postError || state.postSuccess}
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
              <dl>
                <dt>Total Before Tax</dt>
                <dd>{formatMoney(totalBeforeTax)}</dd>
                <dt>Tax Amount</dt>
                <dd>{formatMoney(state.totals.tax)}</dd>
                <dt>Grand Total</dt>
                <dd>{formatMoney(state.totals.grandTotal)}</dd>
              </dl>
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
            {/* <button className="si-btn si-btn-outline" type="button" onClick={addFreightRow}>
              + Freight
            </button> */}
            <button className="si-btn si-btn-primary" type="button" disabled={state.posting} onClick={state.postInvoice}>
              {state.posting ? "Posting..." : "Post to SAP HANA"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
