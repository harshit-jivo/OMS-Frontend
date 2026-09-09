/**
 * The main stock table — Phase 5.5's priority virtualization target.
 *
 * Rows are windowed with `@tanstack/react-virtual` over this component's OWN
 * scroll container, not the page's. That matters: DESIGN_SYSTEM §1.6 explains
 * why `useWindowVirtualizer` is wrong in this app (`document.body` scrolls,
 * `window.scrollY` never moves), and the reason this table was never caught by
 * that bug is that it passes an explicit `getScrollElement`. The container has
 * to keep a real `max-height` + `overflow` for that to hold — it did as
 * `.ps-table-wrap`, and the utilities below say the same thing.
 *
 * A product row and its (optional) expanded "ordered by" detail row are two
 * separate `<tr>`s, so they cannot be virtualized as one `Fragment` item the
 * way the pre-split page grouped them — `measureElement` needs one DOM node
 * per virtual item. `rowItems` flattens `pageProducts` + `expandedDemandKey`
 * into that one-`<tr>`-per-item list; the virtualizer indexes into it.
 *
 * Real row counts here are tiny — `ITEMS_PER_PAGE` caps a page at 15 rows,
 * 16 with a detail row expanded — so `overscan` is set high enough that
 * every row is always in the rendered range and nothing is ever clipped by
 * scroll position.
 */
import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HiOutlineCube, HiOutlineExclamationTriangle } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  STOCK_TONE,
  formatQuantity,
  formatRoundedQuantity,
  getStatusLabel,
  getStockStatus,
  getWarehouseQtyLtrs,
  getRequiredQtyLtrs,
} from "../productStockUtils";
import type { PartyDemandRow, StockDisplayProduct } from "../types";
import type { ProductStockState } from "../useProductStock";

const COLUMN_COUNT = 10;
const ESTIMATED_ROW_HEIGHT = 46;
const ROW_OVERSCAN = 20;

type RowItem =
  | { kind: "product"; key: string; product: StockDisplayProduct }
  | { kind: "detail"; key: string; partyDemandRows: PartyDemandRow[] };

export default function StockTable({ ps }: { ps: ProductStockState }) {
  const {
    loading,
    partyOrdersLoading,
    productOrdersLoading,
    error,
    pageProducts,
    selectedPartyCodes,
    selectedProductCode,
    expandedDemandKey,
    setExpandedDemandKey,
    getPartyDemandRows,
    selectProductDemand,
  } = ps;

  const scrollRef = useRef<HTMLDivElement>(null);

  const rowItems = useMemo<RowItem[]>(() => {
    const items: RowItem[] = [];

    pageProducts.forEach((product) => {
      items.push({ kind: "product", key: product.display_key, product });

      const partyDemandRows = getPartyDemandRows(product.display_party_demand);
      const canShowPartyDemand = selectedPartyCodes.length > 0 && partyDemandRows.length > 0;
      const isDemandExpanded = expandedDemandKey === product.display_key;

      if (canShowPartyDemand && isDemandExpanded) {
        items.push({
          kind: "detail",
          key: product.display_key + "__demand",
          partyDemandRows,
        });
      }
    });

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getPartyDemandRows closes over openParties, not a stable identity; pageProducts/selectedPartyCodes/expandedDemandKey are the real inputs.
  }, [pageProducts, selectedPartyCodes, expandedDemandKey]);

  const rowVirtualizer = useVirtualizer({
    count: rowItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  return (
    <Card className="overflow-hidden p-0">
      {loading || partyOrdersLoading || productOrdersLoading ? (
        <TableSkeleton
          columns={COLUMN_COUNT}
          label={
            partyOrdersLoading || productOrdersLoading
              ? "Loading ordered products"
              : "Loading stock"
          }
        />
      ) : error ? (
        <EmptyState icon={HiOutlineExclamationTriangle} title="Could not load stock" hint={error} />
      ) : pageProducts.length === 0 ? (
        <EmptyState
          icon={HiOutlineCube}
          title="No stock records found"
          hint="Try clearing a filter, or widening the warehouse selection."
        />
      ) : (
        // The virtualizer's scroll element. `max-h` + `overflow-auto` are load
        // bearing — see the note at the top of this file.
        <div
          className="max-h-[calc(100svh-320px)] w-full overflow-auto max-lg:max-h-none"
          ref={scrollRef}
        >
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Item code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Pack</TableHead>
                <TableHead className="text-right">Warehouse stock</TableHead>
                <TableHead className="text-right">Warehouse qty (L)</TableHead>
                <TableHead className="text-right">Order required qty</TableHead>
                <TableHead className="text-right">Order required qty (L)</TableHead>
                <TableHead className="text-right">Left over</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={COLUMN_COUNT} style={{ height: paddingTop, padding: 0, border: 0 }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const item = rowItems[virtualRow.index];
                if (!item) return null;

                if (item.kind === "detail") {
                  return (
                    <TableRow
                      key={item.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="bg-surface"
                    >
                      <TableCell colSpan={COLUMN_COUNT}>
                        <div className="py-1">
                          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                            Ordered by
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {item.partyDemandRows.map((row) => (
                              <span
                                className="inline-flex items-baseline gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[12px]"
                                key={row.partyCode}
                              >
                                <strong className="font-semibold text-ink">{row.partyName}</strong>
                                <small className="text-[11px] text-subtle">{row.partyCode}</small>
                                <em className="not-italic font-semibold tabular-nums text-brand">
                                  {formatQuantity(row.qty)}
                                </em>
                              </span>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                const product = item.product;
                const stock = product.display_stock;
                const partyDemand = product.display_party_demand;
                const pendingRequiredQty = product.display_required_qty;
                const leftOverStock = product.display_left_over_stock;
                const status = getStockStatus(stock, leftOverStock);
                const partyDemandRows = getPartyDemandRows(partyDemand);
                const canShowPartyDemand =
                  selectedPartyCodes.length > 0 && partyDemandRows.length > 0;
                const isDemandExpanded = expandedDemandKey === product.display_key;
                const isProductDemandLoading =
                  productOrdersLoading &&
                  selectedProductCode === String(product.item_code || "").trim();
                const warehouseQtyLtrs = getWarehouseQtyLtrs(product);
                const requiredQtyLtrs = getRequiredQtyLtrs(product);

                return (
                  <TableRow
                    key={item.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className={status === "shortage" || status === "out" ? "bg-bad-soft/40" : ""}
                  >
                    <TableCell className="font-mono text-[12px] text-ink">
                      {product.item_code || "—"}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        /* Opens this product's demand, so it is a row action
                           carrying the DESIGN_SYSTEM §1.1 reset rather than a
                           `ui/button`. */
                        className={
                          "flex w-full cursor-pointer appearance-none flex-col items-start gap-0.5 border-0 bg-transparent p-0 text-left [font-family:inherit] text-[13px] disabled:cursor-wait " +
                          (product.item_code ? "hover:underline" : "")
                        }
                        onClick={() => {
                          if (!product.item_code) return;
                          if (!canShowPartyDemand || selectedProductCode !== product.item_code) {
                            // `item_name` is nullable on the server (see
                            // types/conformance.ts), and `ProductOption`
                            // requires it — the same `|| item_code` fallback
                            // `productOptions` above already applies.
                            void selectProductDemand({
                              ...product,
                              item_name: product.item_name || product.item_code,
                            });
                            return;
                          }
                          setExpandedDemandKey((current) =>
                            current === product.display_key ? "" : product.display_key,
                          );
                        }}
                        disabled={isProductDemandLoading}
                      >
                        <span className="font-semibold text-ink">{product.item_name || "—"}</span>
                        {product.item_code && (
                          <span className="text-[11px] text-brand">
                            {isProductDemandLoading
                              ? "Loading…"
                              : canShowPartyDemand
                                ? isDemandExpanded
                                  ? "Hide parties"
                                  : "View parties"
                                : "Check parties"}
                          </span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>{product.category || "—"}</TableCell>
                    <TableCell>{product.sal_pack_unit || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(stock)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRoundedQuantity(warehouseQtyLtrs)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-brand">
                      {formatQuantity(pendingRequiredQty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRoundedQuantity(requiredQtyLtrs)}
                    </TableCell>
                    <TableCell
                      className={
                        "text-right tabular-nums " +
                        (leftOverStock < 0 ? "font-semibold text-bad" : "")
                      }
                    >
                      {formatQuantity(leftOverStock)}
                    </TableCell>
                    <TableCell>
                      {/*
                          Stock state, not a workflow status, so it does NOT go
                          through statusTone.ts — "low" means something here that
                          it does not mean on an order. The mapping is local and
                          matches the colours this page already used.
                        */}
                      <Badge outlined tone={STOCK_TONE[status] ?? "neutral"}>
                        {getStatusLabel(status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={COLUMN_COUNT}
                    style={{ height: paddingBottom, padding: 0, border: 0 }}
                  />
                </tr>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
