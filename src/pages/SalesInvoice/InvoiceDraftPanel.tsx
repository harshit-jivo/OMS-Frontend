import { formatMoney, lineKey } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

export default function InvoiceDraftPanel({ state }: Props) {
  const selectedOrderCount = new Set(state.selectedLineList.map((line) => line.DocEntry)).size;

  return (
    <aside className="si-draft-panel">
      <div className="si-card-head">
        <div>
          <h3>Invoice Draft</h3>
          <p>{state.selectedLineList.length} lines from {selectedOrderCount} orders</p>
        </div>
      </div>

      <dl className="si-total-grid">
        <dt>Total Qty</dt>
        <dd>{state.totals.totalQty}</dd>
        <dt>Taxable</dt>
        <dd>{formatMoney(state.totals.taxable)}</dd>
        <dt>Tax</dt>
        <dd>{formatMoney(state.totals.tax)}</dd>
        <dt>Grand Total</dt>
        <dd>{formatMoney(state.totals.grandTotal)}</dd>
      </dl>

      <div className="si-draft-lines">
        {state.selectedLineList.length === 0 ? (
          <div className="si-empty">Selected lines appear here.</div>
        ) : (
          state.selectedLineList.map((line) => (
            <div className="si-draft-line" key={lineKey(line.DocEntry, line.LineNum)}>
              <strong>SO #{line.DocNum} — {line.Dscription}</strong>
              <span>
                {line.invoiceQty} x {formatMoney(line.Price)} = {formatMoney(line.invoiceQty * line.Price)}
              </span>
            </div>
          ))
        )}
      </div>

      {state.draftError && <div className="si-inline-error">{state.draftError}</div>}

      <button
        className="si-btn si-btn-primary si-full"
        type="button"
        disabled={state.selectedLineList.length === 0 || state.loadingDraftDetails}
        onClick={state.createInvoiceDraft}
      >
        Review selected lines
      </button>

      <details className="si-payload-box">
        <summary>▶ Draft payload</summary>
        <pre>{JSON.stringify(state.payload, null, 2)}</pre>
      </details>
    </aside>
  );
}
