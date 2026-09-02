/**
 * The "Open Sales Orders" dialog — opened by clicking a party in the party
 * filter dropdown. Lets the user pick which of that party's open sales
 * orders should drive the demand numbers on the main table.
 */
import { HiDocumentText, HiExclamationTriangle, HiMagnifyingGlass, HiXMark } from "react-icons/hi2";

import { Dialog, DialogContent } from "@/components/ui/dialog";
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
        <DialogContent
          title="Order items"
          variant="bare"
          size="auto"
          showClose={false}
          className="ps-order-modal"
        >
          <div className="ps-order-modal-head">
            <div>
              <span className="ps-order-modal-kicker">Open Sales Orders</span>
              <h2 id="ps-order-modal-title">
                {getPartyName(orderModal.party) || getPartyCode(orderModal.party)}
              </h2>
              <p>{getPartyCode(orderModal.party)}</p>
            </div>
            <button
              type="button"
              className="ps-modal-close"
              onClick={closeOrderModal}
              aria-label="Close"
            >
              <HiXMark />
            </button>
          </div>

          <div className="ps-order-modal-body">
            {orderModal.loading ? (
              <div className="ps-state ps-order-modal-state">
                <span className="ps-spinner" />
                Loading open sales orders...
              </div>
            ) : orderModal.error ? (
              <div className="ps-state ps-state-error ps-order-modal-state">
                <HiExclamationTriangle />
                {orderModal.error}
              </div>
            ) : orderModal.orders.length === 0 ? (
              <div className="ps-state ps-order-modal-state">
                <HiDocumentText />
                No open sales orders found.
              </div>
            ) : (
              <>
                <label className="ps-order-search">
                  <HiMagnifyingGlass />
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(event) => setOrderSearch(event.target.value)}
                    placeholder="Search SO number or reference"
                    autoFocus
                  />
                </label>
                <div className="ps-order-modal-actions">
                  <span>{selectedModalOrderCount} selected for this party</span>
                  <div>
                    <button
                      type="button"
                      className="ps-order-action-btn"
                      onClick={selectVisibleSalesOrders}
                      disabled={filteredModalOrders.length === 0}
                    >
                      Select Visible
                    </button>
                    <button
                      type="button"
                      className="ps-order-action-btn"
                      onClick={clearModalPartyOrders}
                      disabled={selectedModalOrderCount === 0}
                    >
                      Clear Party
                    </button>
                    <button type="button" className="ps-order-action-btn primary" onClick={closeOrderModal}>
                      Done
                    </button>
                  </div>
                </div>
                {filteredModalOrders.length === 0 ? (
                  <div className="ps-state ps-order-modal-state">
                    <HiDocumentText />
                    No sales order found for this search.
                  </div>
                ) : (
                  <div className="ps-order-table-wrap">
                    <Table density="compact">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sales Order</TableHead>
                          <TableHead>Order Date</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Open Qty</TableHead>
                          <TableHead>Select</TableHead>
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
                              className={isSelected ? "is-selected" : ""}
                              key={getSalesOrderKeyForParty(order, modalPartyCode)}
                            >
                              <TableCell>
                                <span className="ps-order-doc">
                                  SO #{order.DocNum || order.DocEntry}
                                </span>
                                {order.NumAtCard && (
                                  <span className="ps-order-ref">Ref: {order.NumAtCard}</span>
                                )}
                              </TableCell>
                              <TableCell>{formatOrderDate(order.DocDate)}</TableCell>
                              <TableCell>{formatOrderDate(order.DocDueDate)}</TableCell>
                              <TableCell>
                                <span className="ps-order-pill">{uniqueItems.size}</span>
                              </TableCell>
                              <TableCell className="ps-order-qty">
                                {formatQuantity(totalOpenQty)}
                              </TableCell>
                              <TableCell>
                                <button
                                  type="button"
                                  className="ps-order-select-btn"
                                  onClick={() => toggleSalesOrder(order)}
                                >
                                  {isSelected ? "Remove" : "Add"}
                                </button>
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
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
