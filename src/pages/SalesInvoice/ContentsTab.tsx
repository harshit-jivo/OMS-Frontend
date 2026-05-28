import { formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

export default function ContentsTab({ state }: Props) {
  return (
    <div className="si-tab-grid">
      <div className="si-invoice-line-grid" aria-label="Sales invoice lines">
        {state.selectedLineList.map((line) => {
          const key = lineKey(line.DocEntry, line.LineNum);
          return (
            <article className="si-invoice-line-card" key={key}>
              <button
                className="si-invoice-line-remove"
                type="button"
                onClick={() => state.removeLine(key)}
                aria-label={`Remove ${line.Dscription || line.ItemCode || "item"}`}
              >
                x
              </button>
              <div className="si-invoice-item-visual" aria-hidden="true">
                <span />
              </div>
              <div className="si-invoice-item-copy">
                <strong>{line.Dscription || "Unnamed SAP line"}</strong>
                <dl>
                  <div>
                    <dt>Unit Price</dt>
                    <dd>{formatMoney(line.Price)}</dd>
                  </div>
                  <div>
                    <dt>Qty</dt>
                    <dd>
                      <input
                        type="number"
                        min="1"
                        max={line.OpenQty}
                        value={line.invoiceQty}
                        onChange={(event) => state.updateLine(key, { invoiceQty: toNumber(event.target.value) })}
                        aria-label={`Invoice quantity for ${line.Dscription || line.ItemCode || "item"}`}
                      />
                    </dd>
                  </div>
                </dl>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
