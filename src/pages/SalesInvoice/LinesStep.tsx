import { formatDateDisplay, formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState, SalesOrder } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

const orderHasSelection = (order: SalesOrder, state: SalesInvoiceState) =>
  state.getOrderLines(order).some((line) => state.selectedLines[lineKey(order.DocEntry, line.LineNum)]);

export default function LinesStep({ state }: Props) {
  const selectedOrders = state.salesOrders.filter((order) => orderHasSelection(order, state));
  const selectedOrderCount = new Set(state.selectedLineList.map((line) => line.DocEntry)).size;
  const hasInvalidQty = state.selectedLineList.some(
    (line) => toNumber(line.invoiceQty) < 1 || toNumber(line.invoiceQty) > toNumber(line.OpenQty),
  );
  const canProceed = state.selectedLineList.length > 0 && !hasInvalidQty && !state.loadingDraftDetails;

  const clearOrder = (order: SalesOrder) => {
    state.getOrderLines(order).forEach((line) => {
      state.removeLine(lineKey(order.DocEntry, line.LineNum));
    });
  };

  const selectOrder = (order: SalesOrder) => {
    state.getOrderLines(order).forEach((line) => {
      if (!state.selectedLines[lineKey(order.DocEntry, line.LineNum)] && toNumber(line.OpenQty) > 0) {
        state.toggleLine(order, line);
      }
    });
  };

  return (
    <section className="si-lines-review">
      <div className="si-lines-review-head">
        <div>
          <span>{state.selectedParty?.CardName} · {state.selectedParty?.CardCode}</span>
          <h2>Review Lines</h2>
          <p>Confirm quantities and items to include in the invoice.</p>
        </div>
        <button className="si-btn si-btn-outline" type="button" onClick={state.changeParty}>
          Change party
        </button>
      </div>

      {state.draftError && <div className="si-inline-error">{state.draftError}</div>}

      <div className="si-review-cards">
        {selectedOrders.length === 0 ? (
          <div className="si-empty">Select at least one sales order line to review.</div>
        ) : (
          selectedOrders.map((order) => {
            const lines = state.getOrderLines(order);
            const selectedLines = lines.filter((line) => state.selectedLines[lineKey(order.DocEntry, line.LineNum)]);
            const subtotal = selectedLines.reduce((sum, line) => {
              const selected = state.selectedLines[lineKey(order.DocEntry, line.LineNum)];
              return sum + toNumber(selected?.invoiceQty) * toNumber(selected?.Price);
            }, 0);

            return (
              <article className="si-review-card" key={order.DocEntry}>
                <header className="si-review-card-head">
                  <div>
                    <strong>SO #{order.DocNum}</strong>
                    <span>DocEntry {order.DocEntry}</span>
                    <p>
                      {formatDateDisplay(order.DocDate)} → Due {formatDateDisplay(order.DocDueDate)} · {state.selectedParty?.CardName}
                    </p>
                  </div>
                  <div>
                    <button className="si-btn si-btn-outline" type="button" onClick={() => selectOrder(order)}>
                      Select all
                    </button>
                    <button className="si-btn si-btn-outline" type="button" onClick={() => clearOrder(order)}>
                      Clear all
                    </button>
                  </div>
                </header>

                <div className="si-review-table-wrap">
                  <table className="si-review-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Whse / Tax</th>
                        <th>Open</th>
                        <th>Price</th>
                        <th>Invoice Qty</th>
                        <th>Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => {
                        const key = lineKey(order.DocEntry, line.LineNum);
                        const selected = state.selectedLines[key];
                        const checked = Boolean(selected);
                        const qty = toNumber(selected?.invoiceQty);
                        const price = toNumber(selected?.Price ?? line.Price);

                        return (
                          <tr className={checked ? "is-selected" : ""} key={key}>
                            <td>
                              <input type="checkbox" checked={checked} onChange={() => state.toggleLine(order, line)} />
                            </td>
                            <td><code>{line.ItemCode || "-"}</code></td>
                            <td>
                              <strong>{line.Dscription || "Unnamed SAP line"}</strong>
                            </td>
                            <td>
                              <span className="si-review-tag">{line.WhsCode || "-"}</span>
                              <span className="si-review-tag">{line.TaxCode || line.VatGroup || "-"}</span>
                            </td>
                            <td>{line.OpenQty}</td>
                            <td>{formatMoney(toNumber(line.Price))}</td>
                            <td>
                              <input
                                type="number"
                                min="1"
                                max={line.OpenQty}
                                disabled={!checked}
                                value={checked ? qty : ""}
                                placeholder="—"
                                onChange={(event) => state.updateLine(key, { invoiceQty: toNumber(event.target.value) })}
                              />
                            </td>
                            <td>{checked ? formatMoney(qty * price) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <footer className="si-review-card-foot">
                  <strong>SO Subtotal: {formatMoney(subtotal)}</strong>
                  <span>{selectedLines.length}/{lines.length} lines selected</span>
                </footer>
              </article>
            );
          })
        )}
      </div>

      <div className="si-lines-bottom-bar">
        <div>
          <strong>{state.selectedLineList.length} lines selected across {selectedOrderCount} orders</strong>
          <span>
            Total Qty: {state.totals.totalQty} · Taxable: {formatMoney(state.totals.taxable)} · Tax: {formatMoney(state.totals.tax)} · Grand Total: {formatMoney(state.totals.grandTotal)}
          </span>
        </div>
        <div>
          <button className="si-btn si-btn-outline" type="button" onClick={() => state.setStep(2)}>
            ← Back to Orders
          </button>
          <button className="si-btn si-btn-primary" type="button" disabled={!canProceed} onClick={state.proceedToDraft}>
            {state.loadingDraftDetails ? "Loading draft..." : "Proceed to Draft →"}
          </button>
        </div>
      </div>
    </section>
  );
}
