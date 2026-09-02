/**
 * The main stock table — Phase 5.5's priority virtualization target.
 *
 * Rows are windowed with `@tanstack/react-virtual` over the existing
 * `.ps-table-wrap` scroll container (already `max-height` + `overflow: auto`
 * in `Product_Stock.css`, so no layout change was needed to host it). Only
 * the DOM-mounting strategy changes: the visible rows, their markup and
 * their styling are byte-for-byte what `pageProducts.map(...)` rendered
 * before the split.
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
 * scroll position. That keeps rendering pixel-identical to the unvirtualized
 * version today, while the table is wired for the row counts a future
 * removal of client paging would introduce.
 */
import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HiCube, HiExclamationTriangle } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
          key: `${product.display_key}__demand`,
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
    <section className="ps-table-card">
      {loading || partyOrdersLoading || productOrdersLoading ? (
        <div className="ps-state">
          <span className="ps-spinner" />
          {partyOrdersLoading || productOrdersLoading
            ? "Loading ordered products..."
            : "Loading stock..."}
        </div>
      ) : error ? (
        <div className="ps-state ps-state-error">
          <HiExclamationTriangle />
          {error}
        </div>
      ) : pageProducts.length === 0 ? (
        <div className="ps-state">
          <HiCube />
          No stock records found.
        </div>
      ) : (
        <div className="ps-table-wrap" ref={scrollRef}>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Item Code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Pack</TableHead>
                <TableHead>Warehouse Stock</TableHead>
                <TableHead>Warehouse Qty Ltrs</TableHead>
                <TableHead>Order Required Qty</TableHead>
                <TableHead>Order Required Qty Ltrs</TableHead>
                <TableHead>Left Over</TableHead>
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
                      className="ps-demand-detail-row"
                    >
                      <TableCell colSpan={COLUMN_COUNT}>
                        <div className="ps-demand-detail-panel">
                          <div className="ps-demand-detail-title">Ordered by</div>
                          <div className="ps-demand-detail-list">
                            {item.partyDemandRows.map((row) => (
                              <span className="ps-demand-party-chip" key={row.partyCode}>
                                <strong>{row.partyName}</strong>
                                <small>{row.partyCode}</small>
                                <em>{formatQuantity(row.qty)}</em>
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
                    className={status === "shortage" || status === "out" ? "ps-row-out" : ""}
                  >
                    <TableCell className="ps-code">{product.item_code || "-"}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className={`ps-product-name-btn${product.item_code ? " has-demand" : ""}`}
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
                        <span className="ps-product-name">{product.item_name || "-"}</span>
                        {product.item_code && (
                          <span className="ps-product-demand-hint">
                            {isProductDemandLoading
                              ? "Loading"
                              : canShowPartyDemand
                                ? isDemandExpanded
                                  ? "Hide parties"
                                  : "View parties"
                                : "Check parties"}
                          </span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>{product.category || "-"}</TableCell>
                    <TableCell>{product.sal_pack_unit || "-"}</TableCell>
                    <TableCell className="ps-stock">{formatQuantity(stock)}</TableCell>
                    <TableCell className="ps-stock">
                      {formatRoundedQuantity(warehouseQtyLtrs)}
                    </TableCell>
                    <TableCell className="ps-stock">
                      <span className="ps-required-qty">{formatQuantity(pendingRequiredQty)}</span>
                    </TableCell>
                    <TableCell className="ps-stock">
                      {formatRoundedQuantity(requiredQtyLtrs)}
                    </TableCell>
                    <TableCell className={`ps-stock ${leftOverStock < 0 ? "ps-stock-negative" : ""}`}>
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
    </section>
  );
}
