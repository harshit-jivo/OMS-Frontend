/**
 * The `.ps-product-demand-panel` — shown once a product is selected from the
 * main table, listing every open sales-order line demanding it.
 */
import {
  HiDocumentText,
  HiExclamationTriangle,
} from "react-icons/hi2";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  formatOrderDate,
  formatQuantity,
  getOrderLineWarehouseCode,
  toStockNumber,
} from "../productStockUtils";
import type { ProductStockState } from "../useProductStock";

export default function ProductDemandPanel({ ps }: { ps: ProductStockState }) {
  const {
    selectedProduct,
    selectedProductCode,
    selectedProductPartyCount,
    selectedProductRequiredQty,
    clearProductDemand,
    productOrdersLoading,
    productOrderError,
    productDemandRows,
    getProductLineStock,
  } = ps;

  return (
    <section className="ps-product-demand-panel">
      <div className="ps-product-demand-head">
        <div>
          <span className="ps-order-modal-kicker">Product Demand</span>
          <h2>{selectedProduct?.item_name || selectedProductCode}</h2>
          <p>
            {selectedProductCode} | {selectedProductPartyCount} parties | Required{" "}
            {formatQuantity(selectedProductRequiredQty)}
          </p>
        </div>
        <button type="button" className="ps-order-action-btn" onClick={() => clearProductDemand()}>
          Clear
        </button>
      </div>

      {productOrdersLoading ? (
        <div className="ps-product-demand-state">
          <span className="ps-spinner" />
          Loading parties and sales orders...
        </div>
      ) : productOrderError ? (
        <div className="ps-product-demand-state ps-state-error">
          <HiExclamationTriangle />
          {productOrderError}
        </div>
      ) : productDemandRows.length === 0 ? (
        <div className="ps-product-demand-state">
          <HiDocumentText />
          No open sales order found for this product.
        </div>
      ) : (
        <div className="ps-product-demand-table-wrap">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>Sales Order</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Open Qty</TableHead>
                <TableHead>Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productDemandRows.map((row) => {
                const lineStock = getProductLineStock(row.line);
                const openQty = toStockNumber(row.line.OpenQty);
                const rowKey = `${row.order.CardCode}-${row.order.DocEntry}-${row.line.LineNum}`;

                return (
                  <TableRow key={rowKey}>
                    <TableCell>
                      <span className="ps-order-doc">{row.order.CardName || row.order.CardCode}</span>
                      <span className="ps-order-ref">{row.order.CardCode}</span>
                    </TableCell>
                    <TableCell>
                      <span className="ps-order-doc">SO #{row.order.DocNum || row.order.DocEntry}</span>
                      {row.order.NumAtCard && (
                        <span className="ps-order-ref">Ref: {row.order.NumAtCard}</span>
                      )}
                    </TableCell>
                    <TableCell>{formatOrderDate(row.order.DocDueDate)}</TableCell>
                    <TableCell>{getOrderLineWarehouseCode(row.line) || "-"}</TableCell>
                    <TableCell className="ps-order-qty">{formatQuantity(openQty)}</TableCell>
                    <TableCell
                      className={`ps-order-qty ${lineStock - openQty < 0 ? "ps-stock-negative" : ""}`}
                    >
                      {formatQuantity(lineStock)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
