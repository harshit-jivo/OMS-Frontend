import { useEffect, useMemo, useState } from "react";
import { HiArrowRight } from "react-icons/hi2";
import { formatDateDisplay, formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import { apiFetch, type SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
  continueLabel?: string;
  continueLoadingLabel?: string;
  onContinue?: () => void | Promise<void>;
};

type InventoryWarehouse = {
  WhsCode?: string;
  WarehouseCode?: string;
  whs_code?: string;
  "SUM(Quantity)"?: number | string | null;
  Quantity?: number | string | null;
  OnHand?: number | string | null;
  AvailableQty?: number | string | null;
  AvailableQuantity?: number | string | null;
  TotalQty?: number | string | null;
  [key: string]: unknown;
};

type WarehouseStock = {
  code: string;
  quantity: number;
};

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const getItemCodeKey = (itemCode?: string | null) => String(itemCode || "").trim().toUpperCase();

const getWarehouseCode = (warehouse: InventoryWarehouse) =>
  String(warehouse.WhsCode ?? warehouse.WarehouseCode ?? warehouse.whs_code ?? "").trim();

const getWarehouseQuantity = (warehouse: InventoryWarehouse) =>
  toNumber(
    warehouse["SUM(Quantity)"]
      ?? warehouse.Quantity
      ?? warehouse.OnHand
      ?? warehouse.AvailableQty
      ?? warehouse.AvailableQuantity
      ?? warehouse.TotalQty,
  );

const getWarehouseStockTone = (warehouseQuantity: number, openQty: number) => {
  if (openQty > 0 && warehouseQuantity >= openQty) return "is-full";
  if (warehouseQuantity <= 5 || (openQty >= 100 && warehouseQuantity / openQty <= 0.05)) return "is-critical";
  if (warehouseQuantity > 0 && warehouseQuantity < openQty) return "is-partial";
  return "is-critical";
};

const warehouseColorByCode: Record<string, number> = {
  "BH-EC": 0,
  "BH-FG": 1,
  "BH-GR": 2,
  "BH-LR": 3,
  "BH-PF": 4,
  "BH-UF": 5,
  "GP-FG": 6,
  "BH-PC": 7,
  "BH-PP": 8,
};

const warehouseColorCount = 12;

const getWarehouseColorTone = (warehouseCode: string) => {
  const normalizedCode = warehouseCode.trim().toUpperCase();
  const pinnedTone = warehouseColorByCode[normalizedCode];
  if (pinnedTone !== undefined) return `si-warehouse-code-tone-${pinnedTone}`;

  const hash = normalizedCode.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `si-warehouse-code-tone-${hash % warehouseColorCount}`;
};

const normalizeWarehouseStock = (warehouses: InventoryWarehouse[]) =>
  warehouses
    .map((warehouse) => ({
      code: getWarehouseCode(warehouse),
      quantity: getWarehouseQuantity(warehouse),
    }))
    .filter((warehouse) => warehouse.code)
    .sort((a, b) => a.code.localeCompare(b.code));

export default function OrdersStep({
  state,
  continueLabel = "Next: Review Lines",
  continueLoadingLabel = "Loading draft...",
  onContinue,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeOrderKey, setActiveOrderKey] = useState<string | null>(null);
  const [warehouseStockByItemCode, setWarehouseStockByItemCode] = useState<Record<string, WarehouseStock[]>>({});
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
  const activeOpenLines = activeOrderLines.filter((line) => toNumber(line.OpenQty) > 0);
  const selectedActiveOpenLineCount = activeOrder
    ? activeOpenLines.filter((line) => state.selectedLines[lineKey(activeOrder.DocEntry, line.LineNum)]).length
    : 0;
  const allActiveOpenLinesSelected = activeOpenLines.length > 0 && selectedActiveOpenLineCount === activeOpenLines.length;
  const activeItemCodes = useMemo(() => {
    const itemCodeByKey = activeOrderLines.reduce<Record<string, string>>((items, line) => {
      const key = getItemCodeKey(line.ItemCode);
      if (key && !items[key]) items[key] = line.ItemCode;
      return items;
    }, {});
    return Object.entries(itemCodeByKey)
      .sort(([codeA], [codeB]) => codeA.localeCompare(codeB))
      .map(([key, itemCode]) => ({ key, itemCode }));
  }, [activeOrderLines]);
  const activeItemCodesKey = activeItemCodes.map(({ key }) => key).join("|");

  useEffect(() => {
    let active = true;
    if (!activeItemCodesKey) return () => {
      active = false;
    };

    const loadWarehouseStock = async () => {
      const entries = await Promise.all(
        activeItemCodes.map(async ({ key, itemCode }) => {
          try {
            const data = await apiFetch<InventoryWarehouse[]>(
              `/api/hana/inventory-details/?item_code=${encodeURIComponent(itemCode)}`,
            );
            return [key, normalizeWarehouseStock(Array.isArray(data) ? data : [])] as const;
          } catch (err) {
            console.error(`Unable to load warehouse stock for ${itemCode}:`, err);
            return [key, []] as const;
          }
        }),
      );

      if (!active) return;
      setWarehouseStockByItemCode((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
    };

    loadWarehouseStock();
    return () => {
      active = false;
    };
  }, [activeItemCodesKey]);

  const processActiveOrder = () => {
    if (!activeOrder) return;
    activeOpenLines.forEach((line) => {
      const key = lineKey(activeOrder.DocEntry, line.LineNum);
      if (!state.selectedLines[key]) state.toggleLine(activeOrder, line);
    });
  };

  const rejectActiveOrder = () => {
    if (!activeOrder) return;
    activeOpenLines.forEach((line) => {
      const key = lineKey(activeOrder.DocEntry, line.LineNum);
      if (state.selectedLines[key]) state.removeLine(key);
    });
  };

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
                  const isSelected = selectedCount > 0;
                  const docNum = order.DocNum || order.DocEntry || index + 1;

                  return (
                    <div
                      className={`si-so-list-row${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
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
                        checked={isSelected}
                        disabled={openLines.length === 0}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => state.toggleOrder(order)}
                        aria-label={`Select sales order ${docNum}`}
                      />
                      <span>
                        <strong>SO #{docNum}</strong>
                        <small>
                          {formatDateDisplay(order.DocDate)} - Due {formatDateDisplay(order.DocDueDate)}
                        </small>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="si-so-lines-pane" aria-label="Sales order lines">
                {activeOrder ? (
                  <>
                    <header className="si-so-lines-head">
                      <div>
                        <strong>SO #{activeOrder.DocNum || activeOrder.DocEntry || activeOrderIndex + 1}</strong>
                        <span>
                          {formatDateDisplay(activeOrder.DocDate)} - Due {formatDateDisplay(activeOrder.DocDueDate)}
                        </span>
                      </div>
                      {/* <div className="si-so-lines-actions">
                        <button
                          className="si-so-process-btn"
                          type="button"
                          disabled={activeOpenLines.length === 0 || allActiveOpenLinesSelected}
                          onClick={processActiveOrder}
                        >
                          Process Order
                        </button>
                        <button
                          className="si-so-reject-btn"
                          type="button"
                          disabled={selectedActiveOpenLineCount === 0}
                          onClick={rejectActiveOrder}
                        >
                          Reject Order
                        </button>
                      </div> */}
                    </header>
                    <div className="si-so-lines-table-wrap">
                      {activeOrderLines.length === 0 ? (
                        <div className="si-visible-empty-line">No lines found on this sales order.</div>
                      ) : (
                        <table className="si-so-lines-table">
                          <thead>
                            <tr>
                              <th className="si-so-select-cell">
                                <label className="si-so-select-all">
                                  <input
                                    type="checkbox"
                                    checked={allActiveOpenLinesSelected}
                                    disabled={activeOpenLines.length === 0}
                                    onChange={() => (allActiveOpenLinesSelected ? rejectActiveOrder() : processActiveOrder())}
                                    aria-label={`Select all open lines for sales order ${activeOrder.DocNum || activeOrder.DocEntry}`}
                                  />
                                  <span>Select</span>
                                </label>
                              </th>
                              <th>Item Description</th>
                              <th className="si-so-open-qty-head">Open Qty</th>
                              <th>Warehouse Stock / Batches</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeOrderLines.map((line, lineIndex) => {
                              const key = lineKey(activeOrder.DocEntry || activeOrderIndex, line.LineNum ?? lineIndex);
                              const selected = state.selectedLines[key];
                              const openQty = toNumber(line.OpenQty);
                              const disabled = openQty <= 0;
                              const warehouseStock = warehouseStockByItemCode[getItemCodeKey(line.ItemCode)] || [];

                              return (
                                <tr className={cn("si-so-line-row", selected && "is-selected", disabled && "is-disabled")} key={key}>
                                  <td className="si-so-select-cell">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(selected)}
                                      disabled={disabled}
                                      onChange={() => state.toggleLine(activeOrder, line)}
                                      aria-label={`Select ${line.Dscription || line.ItemCode || "sales order line"}`}
                                    />
                                  </td>
                                  <td>
                                    <span className="si-so-item-description">{line.Dscription || "Unnamed SAP line"}</span>
                                  </td>
                                  <td>
                                    <strong className="si-so-open-qty">{openQty.toLocaleString("en-IN")}</strong>
                                  </td>
                                  <td>
                                    <div className="si-warehouse-stock-row" aria-label={`Warehouse stock for ${line.Dscription || line.ItemCode}`}>
                                      {warehouseStock.length === 0 ? (
                                        <em className="si-warehouse-stock-empty">No warehouse stock</em>
                                      ) : (
                                        warehouseStock.map((warehouse) => (
                                          <em
                                            className={cn(
                                              "si-warehouse-stock-badge",
                                              getWarehouseColorTone(warehouse.code),
                                              getWarehouseStockTone(warehouse.quantity, openQty),
                                            )}
                                            key={warehouse.code}
                                          >
                                            {warehouse.code}: {warehouse.quantity.toLocaleString("en-IN")}
                                          </em>
                                        ))
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
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
