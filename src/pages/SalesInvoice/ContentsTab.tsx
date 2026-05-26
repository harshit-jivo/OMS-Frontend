import { formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

export default function ContentsTab({ state }: Props) {
  return (
    <div className="si-tab-grid">
      <div className="si-table-wrap">
        <table className="si-lines-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Item No.</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Disc%</th>
              <th>Price After Disc</th>
              <th>Tax Code</th>
              <th>Total (LC)</th>
              <th>Whse</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.selectedLineList.map((line, index) => {
              const key = lineKey(line.DocEntry, line.LineNum);
              const priceAfterDiscount = line.Price * (1 - toNumber(line.DiscPrcnt) / 100);
              return (
                <tr key={key}>
                  <td>{index + 1}</td>
                  <td>Item</td>
                  <td>
                    <input value={line.ItemCode} onChange={(event) => state.updateLine(key, { ItemCode: event.target.value })} />
                  </td>
                  <td>
                    <input value={line.Dscription} onChange={(event) => state.updateLine(key, { Dscription: event.target.value })} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      max={line.OpenQty}
                      value={line.invoiceQty}
                      onChange={(event) => state.updateLine(key, { invoiceQty: toNumber(event.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={line.Price}
                      onChange={(event) => state.updateLine(key, { Price: toNumber(event.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={line.DiscPrcnt}
                      onChange={(event) => state.updateLine(key, { DiscPrcnt: toNumber(event.target.value) })}
                    />
                  </td>
                  <td>{formatMoney(priceAfterDiscount)}</td>
                  <td>
                    <input value={line.TaxCode} onChange={(event) => state.updateLine(key, { TaxCode: event.target.value })} />
                  </td>
                  <td>{formatMoney(line.invoiceQty * priceAfterDiscount)}</td>
                  <td>
                    <input value={line.WhsCode} onChange={(event) => state.updateLine(key, { WhsCode: event.target.value })} />
                  </td>
                  <td>
                    <button className="si-delete-btn" type="button" onClick={() => state.removeLine(key)}>
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="si-form-summary-row si-form-summary-row-compact">
        <aside className="si-card si-form-totals">
          <dl className="si-total-grid">
            <dt>Total Before Discount</dt>
            <dd>{formatMoney(state.totals.totalBeforeDiscount)}</dd>
            <dt>Discount</dt>
            <dd>
              <input
                type="number"
                min="0"
                value={state.form.discountPercent}
                onChange={(event) => state.updateForm({ discountPercent: toNumber(event.target.value) })}
              /> %
              <span>-{formatMoney(state.totals.discountAmount)}</span>
            </dd>
            <dt>Taxable Amount</dt>
            <dd>{formatMoney(state.totals.taxable)}</dd>
            <dt>Tax (GST)</dt>
            <dd>{formatMoney(state.totals.tax)}</dd>
            <dt>Total Amount</dt>
            <dd>{formatMoney(state.totals.grandTotal)}</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}
