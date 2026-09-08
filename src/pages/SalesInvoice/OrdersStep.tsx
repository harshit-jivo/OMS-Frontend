/**
 * Step 2 — which open sales orders (and which of their lines) the invoice
 * covers.
 *
 * A master/detail: the order list on the left, the selected order's lines on
 * the right with live warehouse stock per item, so the person invoicing can
 * see whether the stock to fulfil a line actually exists.
 */
import { useEffect, useMemo, useState } from "react";
import { HiOutlineArrowRight, HiOutlineDocumentText } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Card, CardHeader, CardTitle, EmptyState, Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDateDisplay, formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import { apiFetch, hanaUrl, type SalesInvoiceState } from "./useSalesInvoice";

/** What an in-flight invoice log's status means for someone about to invoice
 *  this SO. SAP keeps reporting the order open until that invoice posts, so
 *  without the warning the same SO gets invoiced twice. */
const USED_STATUS_LABELS: Record<string, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved, not posted",
  EDITED: "Being reworked",
  ERROR: "Failed, in a log",
  CL_RAISED: "Credit limit raised",
  POSTED_TO_SAP: "Already invoiced",
};

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

const getItemCodeKey = (itemCode?: string | null) => String(itemCode || "").trim().toUpperCase();

const getWarehouseCode = (warehouse: InventoryWarehouse) =>
  String(warehouse.WhsCode ?? warehouse.WarehouseCode ?? warehouse.whs_code ?? "").trim();

const getWarehouseQuantity = (warehouse: InventoryWarehouse) =>
  toNumber(
    warehouse["SUM(Quantity)"] ??
      warehouse.Quantity ??
      warehouse.OnHand ??
      warehouse.AvailableQty ??
      warehouse.AvailableQuantity ??
      warehouse.TotalQty,
  );

/**
 * Can this warehouse cover the open quantity?
 *
 * ONE colour system on the chip, not two. The old badge carried both a stock
 * tone AND a per-warehouse identity hue picked from a 12-colour cycle — so a
 * chip's colour meant "GP-FG" and "not enough stock" at the same time, and
 * neither reliably. The warehouse CODE is printed on the chip and carries its
 * own identity perfectly well; the colour is reserved for the thing a colour
 * is good at, which is "is this fine, tight, or wrong" (DESIGN_SYSTEM §2).
 */
const stockTone = (warehouseQuantity: number, openQty: number) => {
  if (openQty > 0 && warehouseQuantity >= openQty) return "bg-ok-soft text-ok";
  if (warehouseQuantity <= 5 || (openQty >= 100 && warehouseQuantity / openQty <= 0.05)) {
    return "bg-bad-soft text-bad";
  }
  if (warehouseQuantity > 0 && warehouseQuantity < openQty) return "bg-hold-soft text-hold";
  return "bg-bad-soft text-bad";
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
  continueLabel = "Next: review lines",
  continueLoadingLabel = "Loading draft…",
  onContinue,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeOrderKey, setActiveOrderKey] = useState<string | null>(null);
  const [warehouseStockByItemCode, setWarehouseStockByItemCode] = useState<
    Record<string, WarehouseStock[]>
  >({});
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
          [line.ItemCode, line.Dscription, line.WhsCode, line.TaxCode, line.VatGroup].some(
            (value) => String(value || "").toLowerCase().includes(normalized),
          ),
        );
        return lines.length > 0 ? { ...order, lines } : null;
      })
      .filter((order): order is NonNullable<typeof order> => Boolean(order));
  }, [query, state]);

  const getDocKey = (order: (typeof state.salesOrders)[number], index: number) =>
    `${order.DocEntry || order.DocNum || index}-${index}`;

  /* `activeOrderKey` is what the user last clicked; it goes stale as soon as the
     search box narrows the list out from under it. The render below already
     falls back to the first order in that case, so `activeKey` is just that same
     fallback expressed as a key — which is all the effect that used to live here
     wrote back into state, one render later. */
  const activeOrderEntry = filteredOrders
    .map((order, index) => ({ order, index, key: getDocKey(order, index) }))
    .find((entry) => entry.key === activeOrderKey);
  const activeOrder = activeOrderEntry?.order || filteredOrders[0] || null;
  const activeOrderIndex = activeOrderEntry?.index || 0;
  const activeKey =
    activeOrderEntry?.key ?? (filteredOrders.length > 0 ? getDocKey(filteredOrders[0], 0) : null);
  const activeUsedBy = activeOrder
    ? state.usedSalesOrders?.[
        String(activeOrder.DocNum || activeOrder.DocEntry || activeOrderIndex + 1)
      ]
    : undefined;
  const activeOrderLines = activeOrder ? state.getOrderLines(activeOrder) : [];
  const activeOpenLines = activeOrderLines.filter((line) => toNumber(line.OpenQty) > 0);
  const selectedActiveOpenLineCount = activeOrder
    ? activeOpenLines.filter(
        (line) => state.selectedLines[lineKey(activeOrder.DocEntry, line.LineNum)],
      ).length
    : 0;
  const allActiveOpenLinesSelected =
    activeOpenLines.length > 0 && selectedActiveOpenLineCount === activeOpenLines.length;
  /* No `useMemo`: its only dependency was `activeOrderLines`, a fresh array on
     every render, so the memo never hit and the React Compiler reported
     `Compilation Skipped: Existing memoization could not be preserved` for the
     whole component. The compiler memoises this correctly on its own. */
  const activeItemCodes = (() => {
    const itemCodeByKey = activeOrderLines.reduce<Record<string, string>>((items, line) => {
      const key = getItemCodeKey(line.ItemCode);
      if (key && !items[key]) items[key] = line.ItemCode;
      return items;
    }, {});
    return Object.entries(itemCodeByKey)
      .sort(([codeA], [codeB]) => codeA.localeCompare(codeB))
      .map(([key, itemCode]) => ({ key, itemCode }));
  })();
  const activeItemCodesKey = activeItemCodes.map(({ key }) => key).join("|");

  useEffect(() => {
    let active = true;
    if (!activeItemCodesKey)
      return () => {
        active = false;
      };

    const loadWarehouseStock = async () => {
      const entries = await Promise.all(
        activeItemCodes.map(async ({ key, itemCode }) => {
          try {
            const data = await apiFetch<InventoryWarehouse[]>(
              hanaUrl(`/api/hana/inventory-details/?item_code=${encodeURIComponent(itemCode)}`),
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
    <div className="space-y-4">
      <FilterBar>
        <FilterSearch
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Item code, description, warehouse or tax code…"
          fieldClassName="min-w-[320px]"
        />
        <FilterCount>
          {filteredOrders.length} order{filteredOrders.length === 1 ? "" : "s"}
          {query ? " of " + state.salesOrders.length : ""}
        </FilterCount>
      </FilterBar>

      {state.ordersError && <Notice tone="bad">{state.ordersError}</Notice>}

      {state.loadingOrders ? (
        <Card>
          <div className="space-y-2" aria-label="Loading sales orders">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineDocumentText}
            title={query ? "No line matches this search" : "No open sales order lines"}
            hint={
              query
                ? "Try the item code on its own."
                : "This party has nothing left to invoice."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] lg:items-start">
          {/* ── Master: the orders ── */}
          <Card className="overflow-hidden p-0 lg:sticky lg:top-4">
            <CardHeader className="mb-0 border-b border-line px-4 py-3">
              <CardTitle>Sales orders</CardTitle>
            </CardHeader>
            <ul className="m-0 max-h-[520px] list-none divide-y divide-line overflow-y-auto p-0">
              {filteredOrders.map((order, index) => {
                const lines = state.getOrderLines(order);
                const openLines = lines.filter((line) => toNumber(line.OpenQty) > 0);
                const selectedCount = openLines.filter(
                  (line) => state.selectedLines[lineKey(order.DocEntry, line.LineNum)],
                ).length;
                const docKey = getDocKey(order, index);
                const isActive = activeKey === docKey;
                const isSelected = selectedCount > 0;
                const docNum = order.DocNum || order.DocEntry || index + 1;
                const usedBy = state.usedSalesOrders?.[String(docNum)];

                return (
                  <li
                    key={docKey}
                    className={cn(
                      "flex items-start gap-2.5 px-3 py-2.5 transition-colors",
                      isActive && "bg-brand-soft",
                      !isActive && isSelected && "bg-surface",
                      usedBy && !isSelected && "bg-hold-soft/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-3.5 shrink-0 accent-brand"
                      checked={isSelected}
                      disabled={openLines.length === 0}
                      onChange={() => state.toggleOrder(order)}
                      aria-label={"Select sales order " + docNum}
                    />
                    <button
                      type="button"
                      /* Opens this order in the pane beside it. It was a
                         `div role="button"` with a keydown handler standing in
                         for one; a real button gets Enter and Space free. */
                      className="min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left [font-family:inherit]"
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => setActiveOrderKey(docKey)}
                    >
                      <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink">
                        SO #{docNum}
                        {usedBy && (
                          <Badge
                            tone="hold"
                            title={
                              "Invoice log #" +
                              usedBy.log_id +
                              (usedBy.sap_doc_num ? " · SAP invoice " + usedBy.sap_doc_num : "") +
                              (usedBy.created_at
                                ? " · " + formatDateDisplay(usedBy.created_at)
                                : "")
                            }
                          >
                            {USED_STATUS_LABELS[usedBy.status] || "Already in a log"}
                          </Badge>
                        )}
                      </span>
                      <span className="block text-[11.5px] text-subtle">
                        {formatDateDisplay(order.DocDate)} · Due{" "}
                        {formatDateDisplay(order.DocDueDate)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* ── Detail: the active order's lines ── */}
          <Card className="overflow-hidden p-0">
            {activeOrder ? (
              <>
                <CardHeader className="mb-0 flex-wrap border-b border-line px-4 py-3">
                  <div className="min-w-0">
                    <CardTitle>
                      <span className="flex flex-wrap items-center gap-1.5">
                        SO #{activeOrder.DocNum || activeOrder.DocEntry || activeOrderIndex + 1}
                        {activeUsedBy && (
                          <Badge tone="hold">
                            {USED_STATUS_LABELS[activeUsedBy.status] || "Already in a log"}
                          </Badge>
                        )}
                      </span>
                    </CardTitle>
                    <p className="m-0 mt-0.5 text-[11.5px] text-subtle">
                      {activeUsedBy
                        ? "Invoice log #" + activeUsedBy.log_id + " already covers this order"
                        : formatDateDisplay(activeOrder.DocDate) +
                          " · Due " +
                          formatDateDisplay(activeOrder.DocDueDate)}
                    </p>
                  </div>
                </CardHeader>

                {activeOrderLines.length === 0 ? (
                  <EmptyState
                    icon={HiOutlineDocumentText}
                    title="No lines on this sales order"
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table density="compact">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[86px]">
                            <label className="flex cursor-pointer items-center gap-1.5">
                              <input
                                type="checkbox"
                                className="size-3.5 accent-brand"
                                checked={allActiveOpenLinesSelected}
                                disabled={activeOpenLines.length === 0}
                                onChange={() =>
                                  allActiveOpenLinesSelected
                                    ? rejectActiveOrder()
                                    : processActiveOrder()
                                }
                                aria-label={
                                  "Select all open lines for sales order " +
                                  (activeOrder.DocNum || activeOrder.DocEntry)
                                }
                              />
                              Select
                            </label>
                          </TableHead>
                          <TableHead>Item description</TableHead>
                          <TableHead className="text-right">Open qty</TableHead>
                          <TableHead>Warehouse stock</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeOrderLines.map((line, lineIndex) => {
                          const key = lineKey(
                            activeOrder.DocEntry || activeOrderIndex,
                            line.LineNum ?? lineIndex,
                          );
                          const selected = state.selectedLines[key];
                          const openQty = toNumber(line.OpenQty);
                          const disabled = openQty <= 0;
                          const warehouseStock =
                            warehouseStockByItemCode[getItemCodeKey(line.ItemCode)] || [];

                          return (
                            <TableRow
                              className={cn(selected && "bg-brand-soft", disabled && "opacity-55")}
                              key={key}
                            >
                              <TableCell>
                                <input
                                  type="checkbox"
                                  className="size-3.5 accent-brand"
                                  checked={Boolean(selected)}
                                  disabled={disabled}
                                  onChange={() => state.toggleLine(activeOrder, line)}
                                  aria-label={
                                    "Select " +
                                    (line.Dscription || line.ItemCode || "sales order line")
                                  }
                                />
                              </TableCell>
                              <TableCell className="font-semibold text-ink">
                                {line.Dscription || "Unnamed SAP line"}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums text-ink">
                                {openQty.toLocaleString("en-IN")}
                              </TableCell>
                              <TableCell>
                                <div
                                  className="flex flex-wrap gap-1"
                                  aria-label={
                                    "Warehouse stock for " + (line.Dscription || line.ItemCode)
                                  }
                                >
                                  {warehouseStock.length === 0 ? (
                                    <span className="text-[11.5px] text-subtle">
                                      No warehouse stock
                                    </span>
                                  ) : (
                                    warehouseStock.map((warehouse) => (
                                      <span
                                        className={cn(
                                          "rounded-full px-2 py-px text-[11px] font-semibold tabular-nums",
                                          stockTone(warehouse.quantity, openQty),
                                        )}
                                        key={warehouse.code}
                                        title={
                                          warehouse.code +
                                          " holds " +
                                          warehouse.quantity.toLocaleString("en-IN") +
                                          " against an open quantity of " +
                                          openQty.toLocaleString("en-IN")
                                        }
                                      >
                                        {warehouse.code}:{" "}
                                        {warehouse.quantity.toLocaleString("en-IN")}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={HiOutlineDocumentText}
                title="Select a sales order"
                hint="Its lines and warehouse stock appear here."
              />
            )}
          </Card>
        </div>
      )}

      {state.selectedLineList.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <strong className="block text-[13px] font-semibold text-ink">
              {state.selectedLineList.length} line
              {state.selectedLineList.length === 1 ? "" : "s"} across {selectedOrderCount} order
              {selectedOrderCount === 1 ? "" : "s"}
            </strong>
            <span className="text-[12px] tabular-nums text-subtle">
              Qty {state.totals.totalQty} · Taxable {formatMoney(state.totals.taxable)} · Grand
              total {formatMoney(state.totals.grandTotal)}
            </span>
            {state.selectedOrderAddressError && (
              <Notice tone="bad" className="mt-2">
                {state.selectedOrderAddressError}
              </Notice>
            )}
          </div>
          <Button
            variant="primary"
            disabled={cannotContinue || state.loadingDraftDetails}
            title={
              state.selectedOrderAddressError
                ? state.selectedOrderAddressError
                : hasInvalidQty
                  ? "One or more invoice quantities are outside the open quantity."
                  : undefined
            }
            onClick={() => {
              if (onContinue) {
                onContinue();
                return;
              }
              state.createInvoiceDraft();
            }}
          >
            {state.loadingDraftDetails ? continueLoadingLabel : continueLabel}
            <HiOutlineArrowRight aria-hidden="true" />
          </Button>
        </Card>
      )}
    </div>
  );
}
