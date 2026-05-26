import { useState } from "react";
import ContentsTab from "./ContentsTab";
import { formatDateDisplay } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

type DraftDateField = "postingDate" | "dueDate" | "documentDate";

export default function DraftStep({ state }: Props) {
  const [editableDates, setEditableDates] = useState<Record<DraftDateField, boolean>>({
    postingDate: false,
    dueDate: false,
    documentDate: false,
  });
  const customerCode = state.customerDetails?.CardCode || state.selectedParty?.CardCode || "-";
  const customerName = state.customerDetails?.CardName || state.selectedParty?.CardName || "-";

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
        <div className="si-draft-customer-panel">
          <div className="si-draft-info-cell si-draft-customer-name">
            <span>Customer Name</span>
            <strong>{customerCode} - {customerName}</strong>
          </div>
          <div className="si-draft-readonly-field">
            <span>Bill To</span>
            <strong>{state.form.payTo || "-"}</strong>
          </div>
          <div className="si-draft-readonly-field">
            <span>Ship To</span>
            <strong>{state.form.shipTo || "-"}</strong>
          </div>
          <div className="si-draft-meta-row">
            <div className="si-draft-info-cell">
              <span>State</span>
              <strong>{state.customerDetails?.State1 || "-"}</strong>
            </div>
            <div className="si-draft-info-cell">
              <span>U-Chain</span>
              <strong>{state.customerDetails?.U_Chain || "-"}</strong>
            </div>
          </div>
        </div>

        <div className="si-draft-document-panel">
          <div className="si-draft-top-title">
            <span>Document No.</span>
            <strong>Pending</strong>
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
