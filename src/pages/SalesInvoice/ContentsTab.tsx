import { Fragment } from "react";
import { formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

export default function ContentsTab({ state }: Props) {
  const summaryFreightRows = state.freightRows.filter((row) => row.expenseName || toNumber(row.lineTotal) > 0);

  return (
    <div className="si-tab-grid">
      <div className="si-table-wrap">
        <table className="si-lines-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Disc%</th>
              <th>Price After Disc</th>
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
                    <span className="si-line-readonly">{line.Dscription || "-"}</span>
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
                    <span className="si-line-readonly">{line.Price}</span>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={line.DiscPrcnt}
                      onChange={(event) => state.updateLine(key, { DiscPrcnt: toNumber(event.target.value) })}
                    />
                  </td>
                  <td>{formatMoney(priceAfterDiscount)}</td>
                  <td>{formatMoney(line.invoiceQty * priceAfterDiscount)}</td>
                  <td>
                    <span className="si-line-readonly">{line.WhsCode || "-"}</span>
                  </td>
                  <td>
                    <button className="si-delete-btn" type="button" onClick={() => state.removeLine(key)}>
                      x
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="si-freight-section">
        <div className="si-freight-head">
          <span>Planned SO</span>
          <strong>Freight / Expense</strong>
        </div>
        {state.freightRows.length === 0 ? (
          <button className="si-add-freight-btn" type="button" onClick={state.addFreightRow}>
            + Add freight expense
          </button>
        ) : (
          <table className="si-freight-table">
            <thead>
              <tr>
                <th>Expense</th>
                <th>Amount</th>
                <th>Add</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {state.freightRows.map((row, index) => (
                <tr key={`${row.expenseCode}-${index}`}>
                  <td>
                    <select
                      value={row.expenseCode}
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
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={row.lineTotal}
                      onChange={(event) => state.updateFreightRow(index, { lineTotal: toNumber(event.target.value) })}
                    />
                  </td>
                  <td>
                    <button className="si-freight-add" type="button" onClick={state.addFreightRow}>
                      +
                    </button>
                  </td>
                  <td>
                    <button className="si-freight-remove" type="button" onClick={() => state.removeFreightRow(index)}>
                      x
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
            {summaryFreightRows.map((row, index) => (
              <Fragment key={`${row.expenseCode}-${index}-summary`}>
                <dt>{row.expenseName || "Freight Expense"}</dt>
                <dd>{formatMoney(toNumber(row.lineTotal))}</dd>
              </Fragment>
            ))}
            <dt>Total Amount</dt>
            <dd>{formatMoney(state.totals.grandTotal)}</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}
