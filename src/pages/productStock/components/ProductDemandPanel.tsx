/**
 * Shown once a product is selected from the main table, listing every open
 * sales-order line demanding it.
 */
import { HiOutlineDocumentText, HiOutlineExclamationTriangle } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
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
    <Card className="overflow-hidden p-0">
      <CardHeader className="mb-0 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
            Product demand
          </span>
          <CardTitle>{selectedProduct?.item_name || selectedProductCode}</CardTitle>
          <p className="m-0 mt-0.5 text-[12px] text-subtle">
            {selectedProductCode} · {selectedProductPartyCount} parties · Required{" "}
            {formatQuantity(selectedProductRequiredQty)}
          </p>
        </div>
        <Button size="xs" onClick={() => clearProductDemand()}>
          Clear
        </Button>
      </CardHeader>

      {productOrdersLoading ? (
        <div className="space-y-2 p-4" aria-label="Loading parties and sales orders">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : productOrderError ? (
        <EmptyState
          icon={HiOutlineExclamationTriangle}
          title="Could not load demand"
          hint={productOrderError}
        />
      ) : productDemandRows.length === 0 ? (
        <EmptyState
          icon={HiOutlineDocumentText}
          title="No open sales order for this product"
          hint="Nothing is currently demanding it."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>Sales order</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Open qty</TableHead>
                <TableHead className="text-right">Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productDemandRows.map((row) => {
                const lineStock = getProductLineStock(row.line);
                const openQty = toStockNumber(row.line.OpenQty);
                const rowKey =
                  row.order.CardCode + "-" + row.order.DocEntry + "-" + row.line.LineNum;

                return (
                  <TableRow key={rowKey}>
                    <TableCell>
                      <span className="block font-semibold text-ink">
                        {row.order.CardName || row.order.CardCode}
                      </span>
                      <span className="block text-[11.5px] text-subtle">
                        {row.order.CardCode}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block font-semibold text-ink">
                        SO #{row.order.DocNum || row.order.DocEntry}
                      </span>
                      {row.order.NumAtCard && (
                        <span className="block text-[11.5px] text-subtle">
                          Ref: {row.order.NumAtCard}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatOrderDate(row.order.DocDueDate)}
                    </TableCell>
                    <TableCell>{getOrderLineWarehouseCode(row.line) || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(openQty)}
                    </TableCell>
                    {/* Negative means this line cannot be filled from stock —
                        the one number on the row worth colouring. */}
                    <TableCell
                      className={
                        "text-right tabular-nums " +
                        (lineStock - openQty < 0 ? "font-semibold text-bad" : "")
                      }
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
    </Card>
  );
}
