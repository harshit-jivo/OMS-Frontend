import { useMemo, useState } from "react";
import { HiArrowRight, HiChevronRight } from "react-icons/hi2";
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
  const [expandedOrderKey, setExpandedOrderKey] = useState<string | null>(null);
  const selectedOrderCount = new Set(state.selectedLineList.map((line) => line.DocEntry)).size;
  const hasInvalidQty = state.selectedLineList.some(
    (line) => toNumber(line.invoiceQty) < 1 || toNumber(line.invoiceQty) > toNumber(line.OpenQty),
  );

  const metrics = useMemo(() => {
    return state.salesOrders.reduce(
      (sum, order) => {
        const lines = state.getOrderLines(order);
        return {
          orders: sum.orders + 1,
          openLines: sum.openLines + lines.filter((line) => toNumber(line.OpenQty) > 0).length,
          total: sum.total + toNumber(order.DocTotal),
        };
      },
      { orders: 0, openLines: 0, total: 0 },
    );
  }, [state]);

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

  return (
    <div className="si-orders-stage">
      <section className="si-orders-main">
        <div className="si-summary-bar">
          <strong>{metrics.orders} orders - {metrics.openLines} open lines - {formatMoney(metrics.total)}</strong>
        </div>

        <input
          className="si-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by ItemCode, description, warehouse, or tax code"
        />

        {state.ordersError && <div className="si-inline-error">{state.ordersError}</div>}

        <div className="si-so-scroll">
          {state.loadingOrders ? (
            <div className="si-loader">Loading sales orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="si-empty">No open sales order lines found.</div>
          ) : (
            filteredOrders.map((order, index) => {
              const lines = state.getOrderLines(order);
              const openLines = lines.filter((line) => toNumber(line.OpenQty) > 0);
              const selectedCount = openLines.filter((line) => state.selectedLines[lineKey(order.DocEntry, line.LineNum)]).length;
              const docKey = `${order.DocEntry || order.DocNum || index}-${index}`;
              const isExpanded = expandedOrderKey === docKey;

              return (
                <div className={`si-visible-so ${isExpanded ? "is-expanded" : ""}`} key={docKey}>
                  <div
                    className="si-visible-so-head"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedOrderKey((current) => (current === docKey ? null : docKey))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedOrderKey((current) => (current === docKey ? null : docKey));
                      }
                    }}
                  >
                    <div>
                      <strong>
                        <span className={`si-accordion-caret ${isExpanded ? "is-open" : ""}`} aria-hidden="true">
                          <HiChevronRight />
                        </span>
                        SO #{order.DocNum || order.DocEntry || index + 1}
                      </strong>
                      <span>
                        DocEntry {order.DocEntry || "-"} - {formatDateDisplay(order.DocDate)} - Due {formatDateDisplay(order.DocDueDate)}
                      </span>
                    </div>
                    <div>
                      <span>{selectedCount}/{openLines.length} selected</span>
                      <button
                        className={selectedCount > 0 ? "si-btn si-btn-outline" : "si-btn si-btn-primary"}
                        type="button"
                        disabled={openLines.length === 0}
                        onClick={(event) => {
                          event.stopPropagation();
                          state.toggleOrder(order);
                        }}
                      >
                        {selectedCount > 0 ? "Clear order" : "Select order"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="si-visible-lines">
                      {lines.length === 0 ? (
                        <div className="si-visible-empty-line">No lines found on this sales order.</div>
                      ) : (
                        lines.map((line, lineIndex) => {
                          const key = lineKey(order.DocEntry || index, line.LineNum ?? lineIndex);
                          const selected = state.selectedLines[key];
                          const disabled = toNumber(line.OpenQty) <= 0;

                          return (
                            <div className={`si-visible-line ${selected ? "selected" : ""}`} key={key}>
                              <input
                                type="checkbox"
                                checked={Boolean(selected)}
                                disabled={disabled}
                                onChange={() => state.toggleLine(order, line)}
                              />
                              <div className="si-visible-line-main">
                                <div>
                                  <span>{line.ItemCode || "-"}</span>
                                  <strong>{line.Dscription || "Unnamed SAP line"}</strong>
                                </div>
                                <p>
                                  <em>{line.WhsCode || "-"}</em>
                                  <em>{line.TaxCode || line.VatGroup || "-"}</em>
                                </p>
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
                  )}
                </div>
              );
            })
          )}
        </div>

        {state.selectedLineList.length > 0 && (
          <div className="si-order-selection-bar">
            <div>
              <strong>{state.selectedLineList.length} lines selected across {selectedOrderCount} orders</strong>
              <span>
                Total Qty: {state.totals.totalQty} - Taxable: {formatMoney(state.totals.taxable)} - Grand Total: {formatMoney(state.totals.grandTotal)}
              </span>
            </div>
            <button
              className="si-btn si-btn-primary si-order-selection-next"
              type="button"
              disabled={hasInvalidQty || state.loadingDraftDetails}
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
          </div>
        )}
      </section>
    </div>
  );
}
