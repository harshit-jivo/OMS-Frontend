import { useEffect, useMemo, useState } from "react";
import { HiArrowRight } from "react-icons/hi2";
import { formatDateDisplay, formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
  continueLabel?: string;
  continueLoadingLabel?: string;
  onContinue?: () => void | Promise<void>;
};

export default function OrdersStep({
  state,
  continueLabel = "Next: Review Lines",
  continueLoadingLabel = "Loading draft...",
  onContinue,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeOrderKey, setActiveOrderKey] = useState<string | null>(null);
  const selectedOrderCount = new Set(state.selectedLineList.map((line) => line.DocEntry)).size;
  const hasInvalidQty = state.selectedLineList.some(
    (line) => toNumber(line.invoiceQty) < 1 || toNumber(line.invoiceQty) > toNumber(line.OpenQty),
  );
  const cannotContinue = hasInvalidQty || Boolean(state.selectedOrderAddressError);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return state.salesOrders;

    return state.salesOrders
      .map((order) => {
        const lines = state.getOrderLines(order).filter((line) =>
          [line.ItemCode, line.Dscription, line.WhsCode, line.TaxCode, line.VatGroup].some((value) =>
            String(value || "").toLowerCase().includes(normalized),
          ),
        );
        return lines.length > 0 ? { ...order, lines } : null;
      })
      .filter((order): order is NonNullable<typeof order> => Boolean(order));
  }, [query, state]);

  const getDocKey = (order: typeof state.salesOrders[number], index: number) => `${order.DocEntry || order.DocNum || index}-${index}`;

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setActiveOrderKey(null);
      return;
    }

    const activeExists = filteredOrders.some((order, index) => getDocKey(order, index) === activeOrderKey);
    if (!activeExists) setActiveOrderKey(getDocKey(filteredOrders[0], 0));
  }, [activeOrderKey, filteredOrders]);

  const activeOrderEntry = filteredOrders
    .map((order, index) => ({ order, index, key: getDocKey(order, index) }))
    .find((entry) => entry.key === activeOrderKey);
  const activeOrder = activeOrderEntry?.order || filteredOrders[0] || null;
  const activeOrderIndex = activeOrderEntry?.index || 0;
  const activeOrderLines = activeOrder ? state.getOrderLines(activeOrder) : [];

  return (
    <div className="si-orders-stage">
      <section className="si-orders-main">
        <input
          className="si-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by ItemCode, description, warehouse, or tax code"
        />

        {state.ordersError && <div className="si-inline-error">{state.ordersError}</div>}

        <div className="si-so-split">
          {state.loadingOrders ? (
            <div className="si-loader">Loading sales orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="si-empty">No open sales order lines found.</div>
          ) : (
            <>
              <div className="si-so-list-pane" aria-label="Sales orders">
                {filteredOrders.map((order, index) => {
                  const lines = state.getOrderLines(order);
                  const openLines = lines.filter((line) => toNumber(line.OpenQty) > 0);
                  const selectedCount = openLines.filter((line) => state.selectedLines[lineKey(order.DocEntry, line.LineNum)]).length;
                  const docKey = getDocKey(order, index);
                  const isActive = activeOrderKey === docKey;

                  return (
                    <div
                      className={`si-so-list-row${isActive ? " is-active" : ""}`}
                      role="button"
                      tabIndex={0}
                      key={docKey}
                      onClick={() => setActiveOrderKey(docKey)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActiveOrderKey(docKey);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCount > 0 && selectedCount === openLines.length}
                        disabled={openLines.length === 0}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => state.toggleOrder(order)}
                        aria-label={`Select sales order DocEntry ${order.DocEntry || index + 1}`}
                      />
                      <span>
                        <strong>DocEntry {order.DocEntry || index + 1}</strong>
                        <small>
                          {formatDateDisplay(order.DocDate)} - Due {formatDateDisplay(order.DocDueDate)}
                        </small>
                        <small>{selectedCount}/{openLines.length} selected - {formatMoney(toNumber(order.DocTotal))}</small>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="si-so-lines-pane" aria-label="Sales order lines">
                {activeOrder ? (
                  <>
                    <header className="si-so-lines-head">
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }} >
                        <strong>DocEntry {activeOrder.DocEntry || activeOrderIndex + 1}</strong>
                        <span>
                          {formatDateDisplay(activeOrder.DocDate)} - Due {formatDateDisplay(activeOrder.DocDueDate)}
                        </span>
                      </div>
                      <button
                        className="si-btn si-btn-outline"
                        type="button"
                        disabled={activeOrderLines.filter((line) => toNumber(line.OpenQty) > 0).length === 0}
                        onClick={() => state.toggleOrder(activeOrder)}
                      >
                        Toggle order
                      </button>
                    </header>
                    <div className="si-visible-lines">
                      {activeOrderLines.length === 0 ? (
                        <div className="si-visible-empty-line">No lines found on this sales order.</div>
                      ) : (
                        activeOrderLines.map((line, lineIndex) => {
                          const key = lineKey(activeOrder.DocEntry || activeOrderIndex, line.LineNum ?? lineIndex);
                          const selected = state.selectedLines[key];
                          const disabled = toNumber(line.OpenQty) <= 0;

                          return (
                            <div className={`si-visible-line ${selected ? "selected" : ""}`} key={key}>
                              <input
                                type="checkbox"
                                checked={Boolean(selected)}
                                disabled={disabled}
                                onChange={() => state.toggleLine(activeOrder, line)}
                              />
                              <div className="si-visible-line-main">
                                <div>
                                  <strong>{line.Dscription || "Unnamed SAP line"}</strong>
                                </div>
                              </div>
                              <div className="si-visible-line-side">
                                <span>Open qty: {line.OpenQty}</span>
                                <span>Price: {formatMoney(toNumber(line.Price))}</span>
                                <label>
                                  Invoice qty
                                  <input
                                    type="number"
                                    min="1"
                                    max={line.OpenQty}
                                    required={Boolean(selected)}
                                    disabled={!selected}
                                    value={selected?.invoiceQty || ""}
                                    onChange={(event) => state.updateLine(key, { invoiceQty: toNumber(event.target.value) })}
                                  />
                                </label>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  <div className="si-empty">Select a sales order to view items.</div>
                )}
              </div>
            </>
          )}
        </div>

      </section>

      {state.selectedLineList.length > 0 && (
        <footer className={`si-order-selection-bar${state.selectedOrderAddressError ? " has-error" : ""}`}>
          <div>
            <strong>{state.selectedLineList.length} lines selected across {selectedOrderCount} orders</strong>
            <span>
              Total Qty: {state.totals.totalQty} - Taxable: {formatMoney(state.totals.taxable)} - Grand Total: {formatMoney(state.totals.grandTotal)}
            </span>
            {state.selectedOrderAddressError && (
              <span className="si-order-selection-error">{state.selectedOrderAddressError}</span>
            )}
          </div>
          <button
            className="si-btn si-btn-primary si-order-selection-next"
            type="button"
            disabled={cannotContinue || state.loadingDraftDetails}
            onClick={() => {
              if (onContinue) {
                onContinue();
                return;
              }
              state.createInvoiceDraft();
            }}
          >
            {state.loadingDraftDetails ? continueLoadingLabel : continueLabel}
            <HiArrowRight aria-hidden="true" />
          </button>
        </footer>
      )}
    </div>
  );
}
