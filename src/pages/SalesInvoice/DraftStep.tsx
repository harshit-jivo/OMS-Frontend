import { useState } from "react";
import ContentsTab from "./ContentsTab";
import { formatDateDisplay, type PartyAddress } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

type DraftDateField = "postingDate" | "dueDate" | "documentDate";

const formatAddressOption = (address: PartyAddress) => {
  return [address.Address, address.GSTRegnNo ? `GST: ${address.GSTRegnNo}` : ""].filter(Boolean).join(" | ");
};

export default function DraftStep({ state }: Props) {
  const [editableDates, setEditableDates] = useState<Record<DraftDateField, boolean>>({
    postingDate: false,
    dueDate: false,
    documentDate: false,
  });
  const customerCode = state.customerDetails?.CardCode || state.selectedParty?.CardCode || "-";
  const customerName = state.customerDetails?.CardName || state.selectedParty?.CardName || "-";
  const hasSelectedBillAddress = state.billToAddresses.some((address) => address.Address === state.form.payTo);
  const hasSelectedShipAddress = state.shipToAddresses.some((address) => address.Address === state.form.shipTo);

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
          </div>
          <label className="si-draft-address-field">
            <span>Bill To</span>
            <select
              value={state.form.payTo}
              onChange={(event) => state.updateForm({ payTo: event.target.value })}
              disabled={state.loadingDraftDetails}
            >
              {!state.form.payTo && <option value="">Select billing address</option>}
              {state.form.payTo && !hasSelectedBillAddress && (
                <option value={state.form.payTo}>{state.form.payTo}</option>
              )}
              {state.billToAddresses.map((address, index) => (
                <option value={address.Address} key={`${address.Address}-${address.City || ""}-${index}`}>
                  {formatAddressOption(address)}
                </option>
              ))}
            </select>
          </label>
          <label className="si-draft-address-field">
            <span>Ship To</span>
            <select
              value={state.form.shipTo}
              onChange={(event) => state.updateForm({ shipTo: event.target.value })}
              disabled={state.loadingDraftDetails}
            >
              {!state.form.shipTo && <option value="">Select shipping address</option>}
              {state.form.shipTo && !hasSelectedShipAddress && (
                <option value={state.form.shipTo}>{state.form.shipTo}</option>
              )}
              {state.shipToAddresses.map((address, index) => (
                <option value={address.Address} key={`${address.Address}-${address.City || ""}-${index}`}>
                  {formatAddressOption(address)}
                </option>
              ))}
            </select>
          </label>
          <div className="si-draft-info-cell">
            <span>State</span>
            <strong>{state.customerDetails?.State1 || "-"}</strong>
          </div>
          <div className="si-draft-info-cell">
            <span>U-Chain</span>
            <strong>{state.customerDetails?.U_Chain || "-"}</strong>
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

      <div className="si-action-bar">
        <button className="si-btn si-btn-outline" type="button" onClick={state.resetStep3Form}>
          Clear
        </button>
        <button className="si-btn si-btn-outline" type="button" onClick={state.saveDraft}>
          Save as Draft
        </button>
        <button className="si-btn si-btn-primary" type="button" disabled={state.posting} onClick={state.postInvoice}>
          {state.posting ? "Posting..." : "Post to SAP HANA"}
        </button>
      </div>
    </div>
  );
}
