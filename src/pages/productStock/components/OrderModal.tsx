/**
 * The "Open Sales Orders" dialog — opened by clicking a party in the party
 * picker. Lets the user pick which of that party's open sales orders should
 * drive the demand numbers on the main table.
 */
import { HiOutlineDocumentText, HiOutlineExclamationTriangle } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { EmptyState } from "@/components/ui/page";
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
  getOrderLineItemCode,
  getPartyCode,
  getPartyName,
  getSalesOrderKeyForParty,
  toStockNumber,
} from "../productStockUtils";
import type { ProductStockState } from "../useProductStock";

export default function OrderModal({ ps }: { ps: ProductStockState }) {
  const {
    orderModal,
    setOrderModal,
    closeOrderModal,
    orderSearch,
    setOrderSearch,
    filteredModalOrders,
    selectedModalOrderCount,
    selectVisibleSalesOrders,
    clearModalPartyOrders,
    selectedSalesOrders,
    toggleSalesOrder,
  } = ps;

  return (
    <Dialog
      open={Boolean(orderModal)}
      onOpenChange={(next) => {
        if (!next) setOrderModal(null);
      }}
    >
      {orderModal && (
        <DialogContent title="Open sales orders" size="lg">
          <DialogHeader>
            <DialogTitle>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">
                  {getPartyName(orderModal.party) || getPartyCode(orderModal.party)}
                </span>
                <span className="text-[11.5px] font-normal text-subtle">
                  {getPartyCode(orderModal.party)} · open sales orders
                </span>
              </span>
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-3">
            {orderModal.loading ? (
              <div className="space-y-2" aria-label="Loading open sales orders">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : orderModal.error ? (
              <EmptyState
                icon={HiOutlineExclamationTriangle}
                title="Could not load open sales orders"
                hint={orderModal.error}
              />
            ) : orderModal.orders.length === 0 ? (
              <EmptyState
                icon={HiOutlineDocumentText}
                title="No open sales orders"
                hint="This party has nothing outstanding."
              />
            ) : (
              <>
                <FilterBar className="border-0 bg-transparent p-0">
                  <FilterSearch
                    value={orderSearch}
                    onChange={(event) => setOrderSearch(event.target.value)}
                    placeholder="SO number or reference…"
                    fieldClassName="min-w-[220px]"
                    autoFocus
                  />
                  <FilterCount>
                    {selectedModalOrderCount} selected for this party
                  </FilterCount>
                </FilterBar>

                {filteredModalOrders.length === 0 ? (
                  <EmptyState
                    icon={HiOutlineDocumentText}
                    title="No sales order matches that search"
                    hint="Try the SO number on its own."
                  />
                ) : (
                  <div className="max-h-[420px] overflow-auto rounded-sm border border-line">
                    <Table density="compact">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sales order</TableHead>
                          <TableHead>Order date</TableHead>
                          <TableHead>Due date</TableHead>
                          <TableHead className="text-right">Items</TableHead>
                          <TableHead className="text-right">Open qty</TableHead>
                          <TableHead className="text-right">Select</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredModalOrders.map((order) => {
                          const totalOpenQty = (order.lines || []).reduce(
                            (sum, line) => sum + toStockNumber(line.OpenQty),
                            0,
                          );
                          const uniqueItems = new Set(
                            (order.lines || [])
                              .map((line) => getOrderLineItemCode(line))
                              .filter(Boolean),
                          );
                          const modalPartyCode = getPartyCode(orderModal.party);
                          const isSelected = Boolean(
                            selectedSalesOrders[getSalesOrderKeyForParty(order, modalPartyCode)],
                          );

                          return (
                            <TableRow
                              className={isSelected ? "bg-brand-soft" : ""}
                              key={getSalesOrderKeyForParty(order, modalPartyCode)}
                            >
                              <TableCell>
                                <span className="block font-semibold text-ink">
                                  SO #{order.DocNum || order.DocEntry}
                                </span>
                                {order.NumAtCard && (
                                  <span className="block text-[11.5px] text-subtle">
                                    Ref: {order.NumAtCard}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatOrderDate(order.DocDate)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatOrderDate(order.DocDueDate)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge tone="neutral">{uniqueItems.size}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatQuantity(totalOpenQty)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant={isSelected ? "danger" : "secondary"}
                                  onClick={() => toggleSalesOrder(order)}
                                >
                                  {isSelected ? "Remove" : "Add"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              className="mr-auto"
              onClick={selectVisibleSalesOrders}
              disabled={filteredModalOrders.length === 0}
            >
              Select visible
            </Button>
            <Button onClick={clearModalPartyOrders} disabled={selectedModalOrderCount === 0}>
              Clear party
            </Button>
            <Button variant="primary" onClick={closeOrderModal}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
