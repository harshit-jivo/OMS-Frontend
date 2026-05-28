import { useState } from "react";
import ContentsTab from "./ContentsTab";
import { formatDateDisplay, formatMoney, toNumber, type PartyAddress } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
  onReset: () => void;
};

type DraftDateField = "postingDate" | "dueDate" | "documentDate";

const formatAddressOption = (address: PartyAddress) => {
  return [address.Address, address.GSTRegnNo ? `GST: ${address.GSTRegnNo}` : ""].filter(Boolean).join(" | ");
};

export default function DraftStep({ state, onReset }: Props) {
  const [editableDates, setEditableDates] = useState<Record<DraftDateField, boolean>>({
    postingDate: false,
    dueDate: false,
    documentDate: false,
  });
  const [footerDrawerOpen, setFooterDrawerOpen] = useState(false);
  const customerCode = state.customerDetails?.CardCode || state.selectedParty?.CardCode || "-";
  const customerName = state.customerDetails?.CardName || state.selectedParty?.CardName || "-";
  const totalBeforeTax = state.totals.taxable + state.totals.freight;
  const billToDisplay = formatAddressOption(
    state.billToAddresses.find((address) => address.Address === state.form.payTo) || {
      Address: state.form.payTo,
      AdresType: "B",
      CardCode: customerCode,
    },
  ) || "-";
  const shipToDisplay = formatAddressOption(
    state.shipToAddresses.find((address) => address.Address === state.form.shipTo) || {
      Address: state.form.shipTo,
      AdresType: "S",
      CardCode: customerCode,
    },
  ) || "-";

  const enableDateEdit = (field: DraftDateField, input: HTMLInputElement) => {
    setEditableDates((current) => ({ ...current, [field]: true }));
    window.requestAnimationFrame(() => {
      input.focus();
      input.showPicker?.();
    });
  };

  const disableDateEdit = (field: DraftDateField) => {
    setEditableDates((current) => ({ ...current, [field]: false }));
  };

  const addFreightRow = () => {
    state.addFreightRow();
    setFooterDrawerOpen(true);
  };

  return (
    <div className="si-draft-stage">
      {state.loadingDraftDetails && <div className="si-loader">Loading customer and salesperson details...</div>}
      {state.draftError && <div className="si-inline-error">{state.draftError}</div>}

      <section className="si-draft-top-card">
        <div className="si-draft-document-panel">
          <div className="si-draft-top-title">
            <span>Document No.</span>
            <strong>{state.nextDocNumber || "Pending"}</strong>
          </div>
          <div className="si-draft-info-cell">
            <span>Status</span>
            <strong className="si-draft-status-pill">DRAFT</strong>
          </div>
          <label>
            Posting Date
            <input
              type="date"
              value={state.form.postingDate}
              readOnly={!editableDates.postingDate}
              className={editableDates.postingDate ? "si-date-editable" : ""}
              onDoubleClick={(event) => enableDateEdit("postingDate", event.currentTarget)}
              onBlur={() => disableDateEdit("postingDate")}
              onChange={(event) => state.updateForm({ postingDate: event.target.value })}
            />
          </label>
          <label>
            Due Date
            <input
              type="date"
              value={state.form.dueDate}
              readOnly={!editableDates.dueDate}
              className={editableDates.dueDate ? "si-date-editable" : ""}
              onDoubleClick={(event) => enableDateEdit("dueDate", event.currentTarget)}
              onBlur={() => disableDateEdit("dueDate")}
              onChange={(event) => state.updateForm({ dueDate: event.target.value })}
            />
          </label>
          <label>
            Document Date
            <input
              type="date"
              value={state.form.documentDate}
              readOnly={!editableDates.documentDate}
              className={editableDates.documentDate ? "si-date-editable" : ""}
              onDoubleClick={(event) => enableDateEdit("documentDate", event.currentTarget)}
              onBlur={() => disableDateEdit("documentDate")}
              onChange={(event) => state.updateForm({ documentDate: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="si-card si-draft-party-card">
        <div className="si-draft-customer-panel">
          <div className="si-draft-info-cell si-draft-customer-name">
            <span>Customer Name</span>
            <strong>{customerCode} - {customerName}</strong>
            <button className="si-party-reset-btn" type="button" onClick={onReset}>
              Reset
            </button>
          </div>
          <div className="si-draft-address-field si-draft-address-readonly">
            <span>Bill To</span>
            <strong>{billToDisplay}</strong>
          </div>
          <div className="si-draft-address-field si-draft-address-readonly">
            <span>Ship To</span>
            <strong>{shipToDisplay}</strong>
          </div>
        </div>
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

      <div className={`si-action-bar${footerDrawerOpen ? " is-open" : ""}`}>
        {footerDrawerOpen && (
          <div className="si-action-total-panel">
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
        )}
        <div className="si-action-bar-row">
          <button
            className="si-action-total-btn"
            type="button"
            aria-expanded={footerDrawerOpen}
            onClick={() => setFooterDrawerOpen((current) => !current)}
          >
            <span>{footerDrawerOpen ? "Hide details" : "Total"}</span>
            <strong>{formatMoney(state.totals.grandTotal)}</strong>
          </button>
          <div className="si-action-buttons">
            <button className="si-btn si-btn-outline" type="button" onClick={addFreightRow}>
              + Freight
            </button>
            <button className="si-btn si-btn-primary" type="button" disabled={state.posting} onClick={state.postInvoice}>
              {state.posting ? "Posting..." : "Post to SAP HANA"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
