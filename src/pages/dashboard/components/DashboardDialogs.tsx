/**
 * Every Dashboard dialog/modal in one file: sales breakdown, the "more
 * statuses" popover, manager/state performance ranking, the state-wise item
 * drill-down, the per-status orders list, and the order-detail modal it
 * opens. Moved verbatim out of `Dashboard.tsx` (Phase 4 decomposition).
 *
 * The order-detail modal is a hand-rolled `<div>`, not `<Dialog>` — it has to
 * stack ABOVE the status-orders `<Dialog>` it's opened from
 * (`.db-status-modal-backdrop--stacked`), which `interactions.visual.spec.ts`
 * ("dashboard charts") asserts by screenshot.
 */
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FiChevronUp } from "react-icons/fi";

import { PALETTE } from "../constants";
import { fmt, fmtCurrency } from "../format";
import type { DashboardState } from "../useDashboard";

export default function DashboardDialogs({ dashboard }: { dashboard: DashboardState }) {
  const {
    t,
    showSalesBreakdown,
    setShowSalesBreakdown,
    selectedPeriodLabel,
    allRevenue,
    completedRevenue,
    pendingRevenue,
    rejectedRevenue,
    showMoreStatuses,
    setShowMoreStatuses,
    hiddenStatusItems,
    statusClickable,
    openStatusOrders,
    getStatusColor,
    showManagerPerformance,
    setShowManagerPerformance,
    performanceView,
    setPerformanceView,
    activePerformance,
    activePerformanceMaxSales,
    getSalesWidth,
    showStateItems,
    setShowStateItems,
    selectedItemVariety,
    setSelectedItemVariety,
    activeItemState,
    activeStateVarietyTotals,
    activeStateFilteredProducts,
    activeStateMaxVarietySales,
    activeStateMaxProductSales,
    statusOrdersModal,
    setStatusOrdersModal,
    statusOrders,
    statusOrdersLoading,
    statusOrdersError,
    getPendingRateApprovers,
    getRejectedByName,
    setDetailOrder,
    detailOrder,
  } = dashboard;

  return (
    <>
      <Dialog
        open={Boolean(showSalesBreakdown)}
        onOpenChange={(next) => {
          if (!next) (() => setShowSalesBreakdown(false))();
        }}
      >
        {showSalesBreakdown && (
          <DialogContent
            title="Sales breakdown"
            variant="bare"
            size="auto"
            showClose={false}
            className="db-sales-modal"
          >
            <div className="db-status-modal-head">
              <div>
                <div className="db-chart-title">Sales Breakdown</div>
                <div className="db-chart-subtitle">{selectedPeriodLabel} order sales</div>
              </div>
              <button
                type="button"
                className="db-status-modal-close"
                onClick={() => setShowSalesBreakdown(false)}
                aria-label="Close sales breakdown"
              >
                <FiChevronUp />
              </button>
            </div>
            <div className="db-sales-modal-list">
              <div className="db-sales-modal-row">
                <span>All Orders Sales</span>
                <strong>{fmtCurrency(allRevenue)}</strong>
              </div>
              <div className="db-sales-modal-row db-sales-modal-row--primary">
                <span>Completed Orders Sales</span>
                <strong>{fmtCurrency(completedRevenue)}</strong>
              </div>
              <div className="db-sales-modal-row">
                <span>Pending Orders Sales</span>
                <strong>{fmtCurrency(pendingRevenue)}</strong>
              </div>
              <div className="db-sales-modal-row">
                <span>Rejected Orders Sales</span>
                <strong>{fmtCurrency(rejectedRevenue)}</strong>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(showMoreStatuses)}
        onOpenChange={(next) => {
          if (!next) (() => setShowMoreStatuses(false))();
        }}
      >
        {showMoreStatuses && (
          <DialogContent
            title="All statuses"
            variant="bare"
            size="auto"
            showClose={false}
            className="db-status-modal"
          >
            <div className="db-status-modal-head">
              <div>
                <div className="db-chart-title">More Statuses</div>
                <div className="db-chart-subtitle">Additional order status counts</div>
              </div>
              <button
                type="button"
                className="db-status-modal-close"
                onClick={() => setShowMoreStatuses(false)}
                aria-label="Close more statuses"
              >
                <FiChevronUp />
              </button>
            </div>
            <div className="db-status-modal-list">
              {hiddenStatusItems.map((item) =>
                statusClickable ? (
                  <button
                    key={item.status}
                    type="button"
                    className="db-legend-item db-legend-item--clickable"
                    onClick={() => void openStatusOrders(item)}
                    title={`View ${item.label} orders`}
                  >
                    <span className="db-legend-dot" style={{ background: getStatusColor(item) }} />
                    <span className="db-legend-label">{item.label}</span>
                    <span className="db-legend-val">{item.count}</span>
                  </button>
                ) : (
                  <div key={item.status} className="db-legend-item">
                    <span className="db-legend-dot" style={{ background: getStatusColor(item) }} />
                    <span className="db-legend-label">{item.label}</span>
                    <span className="db-legend-val">{item.count}</span>
                  </div>
                ),
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(showManagerPerformance)}
        onOpenChange={(next) => {
          if (!next) (() => setShowManagerPerformance(false))();
        }}
      >
        {showManagerPerformance && (
          <DialogContent
            title="Manager performance"
            variant="bare"
            size="auto"
            showClose={false}
            className="db-manager-performance-modal"
          >
            <div className="db-status-modal-head">
              <div>
                <div className="db-chart-title">
                  {performanceView === "state" ? "State-wise Performance" : "All Managers Performance"}
                </div>
                <div className="db-chart-subtitle">
                  {selectedPeriodLabel} completed order sales by{" "}
                  {performanceView === "state" ? "state" : "manager"}
                </div>
              </div>
              <div className="db-performance-switch" aria-label="Performance view">
                <button
                  type="button"
                  className={performanceView === "manager" ? "is-active" : ""}
                  onClick={() => setPerformanceView("manager")}
                >
                  Managers
                </button>
                <button
                  type="button"
                  className={performanceView === "state" ? "is-active" : ""}
                  onClick={() => setPerformanceView("state")}
                >
                  States
                </button>
              </div>
              <button
                type="button"
                className="db-status-modal-close"
                onClick={() => setShowManagerPerformance(false)}
                aria-label="Close manager performance"
              >
                <FiChevronUp />
              </button>
            </div>
            {activePerformance.length === 0 ? (
              <div className="db-no-data">No manager sales data for this period</div>
            ) : (
              <div className="db-manager-ranking db-manager-ranking--full">
                {activePerformance.map((item, index) => (
                  <div className="db-manager-rank-row" key={item.id}>
                    <span className="db-manager-rank-number">{index + 1}</span>
                    <div className="db-manager-rank-main">
                      <div className="db-manager-rank-meta">
                        <span className="db-manager-rank-name">{item.name}</span>
                        <strong>{fmtCurrency(item.sales)}</strong>
                      </div>
                      <div className="db-manager-rank-track">
                        <span
                          className="db-manager-rank-fill"
                          style={{
                            width: getSalesWidth(item.sales, activePerformanceMaxSales),
                            background: PALETTE[index % PALETTE.length],
                          }}
                        />
                      </div>
                      <span className="db-manager-rank-orders">{fmt(item.orders)} orders</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(showStateItems)}
        onOpenChange={(next) => {
          if (!next) (() => setShowStateItems(false))();
        }}
      >
        {showStateItems && (
          <DialogContent
            title="State items"
            variant="bare"
            size="auto"
            showClose={false}
            className="db-manager-performance-modal"
          >
            <div className="db-status-modal-head">
              <div>
                <div className="db-chart-title">
                  {selectedItemVariety === "ALL"
                    ? `${activeItemState ?? "State"} Variety Sales`
                    : `${selectedItemVariety} Products`}
                </div>
                <div className="db-chart-subtitle">
                  {selectedItemVariety === "ALL"
                    ? `All varieties ranked by total sales value for ${selectedPeriodLabel}`
                    : `${activeItemState ?? "State"} products ranked by sales value for ${selectedPeriodLabel}`}
                </div>
              </div>
              {selectedItemVariety !== "ALL" ? (
                <button
                  type="button"
                  className="db-state-item-back"
                  onClick={() => setSelectedItemVariety("ALL")}
                >
                  Varieties
                </button>
              ) : null}
              <button
                type="button"
                className="db-status-modal-close"
                onClick={() => setShowStateItems(false)}
                aria-label="Close state-wise item sales"
              >
                <FiChevronUp />
              </button>
            </div>
            <div className="db-state-item-list db-state-item-list--modal">
              {selectedItemVariety === "ALL"
                ? activeStateVarietyTotals.map((item, index) => (
                    <button
                      className="db-state-item-row db-state-item-row--button"
                      key={`modal-variety-${item.variety}`}
                      type="button"
                      onClick={() => setSelectedItemVariety(item.variety)}
                    >
                      <span className="db-manager-rank-number">{index + 1}</span>
                      <div className="db-state-item-main">
                        <div className="db-state-item-meta">
                          <div>
                            <span>{item.variety}</span>
                            <small>Completed order lines</small>
                          </div>
                          <strong>{fmtCurrency(item.total_sales)}</strong>
                        </div>
                        <div className="db-manager-rank-track">
                          <span
                            className="db-manager-rank-fill"
                            style={{
                              width: getSalesWidth(item.total_sales, activeStateMaxVarietySales),
                              background: PALETTE[index % PALETTE.length],
                            }}
                          />
                        </div>
                        <small className="db-state-item-foot">
                          Amount {fmtCurrency(item.total_sales)} | Qty {fmt(item.quantity)} | Items{" "}
                          {fmt(item.count)}
                        </small>
                      </div>
                    </button>
                  ))
                : activeStateFilteredProducts.map((item, index) => (
                    <div
                      className="db-state-item-row"
                      key={`modal-${item.item_code}-${item.variety}-${item.category}`}
                    >
                      <span className="db-manager-rank-number">{index + 1}</span>
                      <div className="db-state-item-main">
                        <div className="db-state-item-meta">
                          <div>
                            <span>{item.variety}</span>
                            <small>{item.item_name}</small>
                            <small>
                              {item.item_code} | {item.category}
                            </small>
                          </div>
                          <strong>{fmtCurrency(item.total_sales)}</strong>
                        </div>
                        <div className="db-manager-rank-track">
                          <span
                            className="db-manager-rank-fill"
                            style={{
                              width: getSalesWidth(item.total_sales, activeStateMaxProductSales),
                              background: PALETTE[index % PALETTE.length],
                            }}
                          />
                        </div>
                        <small className="db-state-item-foot">
                          Amount {fmtCurrency(item.total_sales)} | Qty {fmt(item.quantity)} | Items{" "}
                          {fmt(item.count)}
                        </small>
                      </div>
                    </div>
                  ))}
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(statusOrdersModal)}
        onOpenChange={(next) => {
          if (!next) (() => setStatusOrdersModal(null))();
        }}
      >
        {statusOrdersModal && (
          <DialogContent
            title="Orders by status"
            variant="bare"
            size="auto"
            showClose={false}
            className="db-status-orders-modal"
          >
            <div className="db-status-modal-head">
              <div>
                <div className="db-chart-title">{statusOrdersModal.label} Orders</div>
                <div className="db-chart-subtitle">
                  {statusOrdersLoading
                    ? "Loading orders..."
                    : `${statusOrders.length} ${statusOrders.length === 1 ? "order" : "orders"} with this status`}
                </div>
              </div>
              <button
                type="button"
                className="db-status-modal-close"
                onClick={() => setStatusOrdersModal(null)}
                aria-label="Close status orders"
              >
                <FiChevronUp />
              </button>
            </div>
            {statusOrdersLoading ? (
              <div className="db-no-data">Loading orders...</div>
            ) : statusOrdersError ? (
              <div className="db-no-data">{statusOrdersError}</div>
            ) : statusOrders.length === 0 ? (
              <div className="db-no-data">No orders found for this status.</div>
            ) : (
              <div className="db-status-orders-list">
                {statusOrders.map((order) => {
                  const pendingApprovers = getPendingRateApprovers(order);
                  const rejectedBy = getRejectedByName(order);
                  return (
                    <div className="db-status-order-row" key={order.id}>
                      <div className="db-status-order-main">
                        <span className="db-status-order-number">#{order.order_number}</span>
                        <span className="db-status-order-party">
                          {order.card_name || order.card_code}
                        </span>
                        {pendingApprovers.length > 0 ? (
                          <span className="db-status-order-approver">
                            Rate Approver: {pendingApprovers.join(", ")}
                          </span>
                        ) : null}
                        {rejectedBy ? (
                          <span className="db-status-order-approver db-status-order-rejected-by">
                            Rejected by: {rejectedBy}
                          </span>
                        ) : null}
                      </div>
                      <div className="db-status-order-meta">
                        <span className="db-status-order-amount">{fmtCurrency(order.total_amount)}</span>
                        <span className="db-status-order-sub">
                          {order.items?.length ?? 0} items
                          {order.created_by ? ` | ${order.created_by}` : ""}
                          {order.created_at
                            ? ` | ${new Date(order.created_at).toLocaleDateString("en-GB")}`
                            : ""}
                          {order.po_number ? ` | PO: ${order.po_number}` : ""}
                          {order.sap_doc_number ? ` | SAP: ${order.sap_doc_number}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="db-status-order-view"
                        onClick={() => setDetailOrder(order)}
                      >
                        View
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>

      {detailOrder ? (
        <div
          className="db-status-modal-backdrop db-status-modal-backdrop--stacked"
          onClick={() => setDetailOrder(null)}
        >
          <div
            className="db-order-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Order ${detailOrder.order_number} details`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="db-status-modal-head">
              <div>
                <div className="db-chart-title">Order #{detailOrder.order_number}</div>
                <div className="db-chart-subtitle">
                  {detailOrder.status_display}
                  {detailOrder.is_foc ? " | FOC" : ""}
                </div>
              </div>
              <button
                type="button"
                className="db-status-modal-close"
                onClick={() => setDetailOrder(null)}
                aria-label="Close order detail"
              >
                <FiChevronUp />
              </button>
            </div>

            <div className="db-order-detail-grid">
              <div className="db-order-detail-field">
                <span>Party</span>
                <strong>{detailOrder.card_name || "—"}</strong>
              </div>
              <div className="db-order-detail-field">
                <span>Card Code</span>
                <strong>{detailOrder.card_code || "—"}</strong>
              </div>
              <div className="db-order-detail-field">
                <span>Created By</span>
                <strong>{detailOrder.created_by || "—"}</strong>
              </div>
              <div className="db-order-detail-field">
                <span>Created At</span>
                <strong>
                  {detailOrder.created_at
                    ? new Date(detailOrder.created_at).toLocaleString("en-GB")
                    : "—"}
                </strong>
              </div>
              <div className="db-order-detail-field">
                <span>Delivery Date</span>
                <strong>{detailOrder.delivery_date || "—"}</strong>
              </div>
              <div className="db-order-detail-field">
                <span>PO Number</span>
                <strong>{detailOrder.po_number || "—"}</strong>
              </div>
              <div className="db-order-detail-field">
                <span>SAP Doc</span>
                <strong>{detailOrder.sap_doc_number || "—"}</strong>
              </div>
              <div className="db-order-detail-field">
                <span>Total Amount</span>
                <strong>{fmtCurrency(detailOrder.total_amount)}</strong>
              </div>
              {detailOrder.remarks?.trim() ? (
                <div className="db-order-detail-field">
                  <span>Comment</span>
                  <strong>{detailOrder.remarks}</strong>
                </div>
              ) : null}
            </div>

            <div className="db-order-detail-items-head">
              <span>Items</span>
              <span className="db-order-detail-items-count">{detailOrder.items?.length ?? 0}</span>
            </div>
            <div className="db-order-detail-items-scroll">
              {detailOrder.items && detailOrder.items.length > 0 ? (
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="db-num">Qty</TableHead>
                      <TableHead className="db-num">Pcs</TableHead>
                      <TableHead className="db-num">Boxes</TableHead>
                      <TableHead className="db-num">Ltrs</TableHead>
                      <TableHead className="db-num">Total Ltrs</TableHead>
                      <TableHead className="db-num">{t("price_list", "Price List (Basic)")}</TableHead>
                      <TableHead className="db-num">Basic Price</TableHead>
                      <TableHead className="db-num">Tax %</TableHead>
                      <TableHead className="db-num">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailOrder.items.map((item, index) => (
                      <TableRow key={`${item.item_code}-${index}`}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <span className="db-order-detail-item-name">{item.item_name}</span>
                          <span className="db-order-detail-item-code">{item.item_code}</span>
                        </TableCell>
                        <TableCell>{item.category || "—"}</TableCell>
                        <TableCell className="db-num">{item.qty}</TableCell>
                        <TableCell className="db-num">{item.pcs}</TableCell>
                        <TableCell className="db-num">{Number(item.boxes).toFixed(2)}</TableCell>
                        <TableCell className="db-num">{item.ltrs}</TableCell>
                        <TableCell className="db-num">{Number(item.total_ltrs ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="db-num">{Number(item.price_list_basic).toFixed(2)}</TableCell>
                        <TableCell className="db-num">{Number(item.basic_price).toFixed(2)}</TableCell>
                        <TableCell className="db-num">{Number(item.tax_rate).toFixed(2)}</TableCell>
                        <TableCell className="db-num db-order-detail-amount">
                          {Number(item.total).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="db-no-data">No items found for this order.</div>
              )}
            </div>

            {detailOrder.items && detailOrder.items.length > 0
              ? (() => {
                  const subtotal = detailOrder.items.reduce(
                    (sum, item) => sum + Number(item.total || 0),
                    0,
                  );
                  const tax = detailOrder.items.reduce(
                    (sum, item) => sum + (Number(item.total || 0) * Number(item.tax_rate || 0)) / 100,
                    0,
                  );
                  const totalLtrs = detailOrder.items.reduce(
                    (sum, item) => sum + Number(item.total_ltrs || 0),
                    0,
                  );
                  return (
                    <div className="db-order-detail-summary">
                      <div className="db-order-detail-sum-row">
                        <span>Total Ltrs</span>
                        <strong>{totalLtrs.toFixed(2)}</strong>
                      </div>
                      <div className="db-order-detail-sum-row">
                        <span>Subtotal</span>
                        <strong>{fmtCurrency(subtotal)}</strong>
                      </div>
                      <div className="db-order-detail-sum-row">
                        <span>Tax</span>
                        <strong>{fmtCurrency(tax)}</strong>
                      </div>
                      <div className="db-order-detail-sum-row db-order-detail-sum-grand">
                        <span>Grand Total</span>
                        <strong>{fmtCurrency(subtotal + tax)}</strong>
                      </div>
                    </div>
                  );
                })()
              : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
