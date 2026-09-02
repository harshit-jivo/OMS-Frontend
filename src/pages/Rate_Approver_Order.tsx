import { useEffect, useState } from "react";
import {
  getOrderItemSchemeNames,
  getOrderItemSchemes,
  getOrderItemSchemeQtyText,
  getOrderItemTotalLtrs,
  ordersService,
} from "../services/ordersService";
import type { Order, OrderItem } from "../services/ordersService";
import { exportToExcel } from "../utils/excelExport";
import "../styles/Auditor_Order.css";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrderQueue, useOrderDetailsFetcher } from "../lib/approvalQueries";
import { useUILabels } from "../services/uiConfig";
import ItemSection from "../components/order-items/ItemSection";
import PartyHeader from "../components/order-items/PartyHeader";
import { HiArrowDownTray, HiCheckCircle, HiEye, HiXCircle } from "react-icons/hi2";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { messageFrom } from "@/lib/apiError";

const RATE_APPROVAL_STATUS = "RATE_APPROVAL";
const RATE_APPROVER_APPROVED_STATUS = 6;
const RATE_APPROVER_REJECTED_STATUS = 7;

const formatCreatedDateTime = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function RateApproverOrders() {
  const { t } = useUILabels();
  const location = useLocation();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  // Two-step approve/reject flow: review the order summary and enter a reason
  // (optional for approve, required for reject), then confirm before the API
  // call.
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewStep, setReviewStep] = useState<"review" | "confirm">("review");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const queryClient = useQueryClient();
  const fetchOrderDetails_ = useOrderDetailsFetcher();
  // No `refetchOrders`: its only caller was the redundant refetch that followed
  // `removeHandledOrder`'s invalidation, and the failure state here is a
  // message rather than a retry button.
  const { orders, isOrdersLoading, ordersFailed } = useOrderQueue(
    ["orders", "queue", "rate-approver"],
    () => ordersService.getOrders(RATE_APPROVAL_STATUS, false, true) as Promise<Order[]>,
  );
  const [showAcceptSuccess, setShowAcceptSuccess] = useState(false);
  const [acceptSuccessInfo, setAcceptSuccessInfo] = useState<{
    orderId: string;
    message: string;
    nextStatus: string;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const refreshNotifications = () => {
    window.dispatchEvent(new Event("refreshNotifications"));
    window.dispatchEvent(new Event("refresh-notifications"));
  };


  const fetchOrderDetails = async (orderId: number) => {
    try {
      // Shared ["order-details", id] cache: this page fetches the same order
      // twice — once to open the panel, again inside the Excel export.
      const data = await fetchOrderDetails_(orderId);
      setOrderDetails(data);
      setSelectedItems(data.items || []);
      setShowDetails(true);
    } catch (error) {
      console.log("Error fetching order details:", error);
    }
  };

  // Declared ABOVE the effect that calls it, not below. It read the other way
  // round for as long as the file has existed, which works at runtime — the
  // const is assigned during render, the effect runs after — but it is a
  // use-before-declare to any static analysis.
  useEffect(() => {
    if (location.state?.openOrderId) {
      fetchOrderDetails(location.state.openOrderId);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // `fetchOrderDetails` is re-created every render and opens the detail
    // panel; listing it would re-open the panel on every render. This effect is
    // a one-shot handoff from a navigation, keyed on the incoming id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openOrderId, location.pathname, navigate]);


  const removeHandledOrder = (orderId: number) => {
    // Was a local `setOrders` filter. The `fetchOrders()` that follows every
    // caller made it a double removal; one invalidation does both.
    void queryClient.invalidateQueries({ queryKey: ["orders", "queue", "rate-approver"] });
    setSelectedItems([]);
    if (orderDetails?.id === orderId) {
      setOrderDetails(null);
      setShowDetails(false);
    }
  };

  // Step 1 — open the review modal for an approve or reject action.
  const openReview = (order: Order, action: "approve" | "reject") => {
    setShowDetails(false);
    setReviewOrder(order);
    setReviewAction(action);
    setReviewReason("");
    setReviewStep("review");
  };

  const closeReview = () => {
    setReviewOrder(null);
    setReviewAction(null);
    setReviewReason("");
    setReviewStep("review");
  };

  // Step 2 — after reviewing, move to the final confirmation step. Reject
  // requires a reason; approve reason stays optional.
  const proceedToConfirm = () => {
    if (reviewAction === "reject" && !reviewReason.trim()) {
      alert("Reason required");
      return;
    }
    setReviewStep("confirm");
  };

  /*
   * Step 3 — the write.
   *
   * The hand-rolled version owned an `isProcessing` flag reset in a `finally`;
   * `useMutation` owns it as `isPending`, which cannot be left stuck on by a
   * path that returns before the reset. That flag also drives a blocking
   * Dialog on this page, so a stuck one is not merely a disabled button.
   *
   * The old body also called `refetchOrders()` right after
   * `removeHandledOrder`, which already invalidates this queue.
   */
  const reviewMutation = useMutation({
    mutationFn: async (vars: { order: Order; action: "approve" | "reject"; reason: string }) => {
      if (vars.action === "approve") {
        return await ordersService.UpdateStatus(
          vars.order.id,
          RATE_APPROVER_APPROVED_STATUS,
          vars.reason || "Approved",
        );
      }
      await ordersService.UpdateStatus(vars.order.id, RATE_APPROVER_REJECTED_STATUS, vars.reason);
      return null;
    },
    onSuccess: (response, vars) => {
      if (vars.action === "approve") {
        setAcceptSuccessInfo({
          orderId: vars.order.order_number,
          message: response?.message || "Order approved successfully",
          nextStatus: response?.status || "-",
        });
        removeHandledOrder(vars.order.id);
        setShowAcceptSuccess(true);
      } else {
        alert("Order Rejected");
        removeHandledOrder(vars.order.id);
      }
      closeReview();
      refreshNotifications();
    },
    onError: (error) => {
      alert("Error: " + messageFrom(error, "Something went wrong"));
    },
  });

  const isProcessing = reviewMutation.isPending;

  const submitReview = () => {
    if (!reviewOrder || !reviewAction) return;
    const reason = reviewReason.trim();
    if (reviewAction === "reject" && !reason) {
      alert("Reason required");
      return;
    }
    reviewMutation.mutate({ order: reviewOrder, action: reviewAction, reason });
  };

  const filteredOrders = orders.filter((order) => {
    if (!fromDate || !toDate) return true;
    const orderDate = new Date(order.created_at);
    const from = new Date(`${fromDate}T00:00:00.000`);
    const to = new Date(`${toDate}T23:59:59.999`);
    return orderDate >= from && orderDate <= to;
  });

  const downloadExcel = async (order: Order) => {
    // The list API does not include line items; fetch full details on demand.
    let full = order;
    if (!order.items || order.items.length === 0) {
      try {
        full = await ordersService.getOrderDetails(order.id);
      } catch (error) {
        console.log("Error fetching order details for download:", error);
      }
    }

    // Raw values only — exportToExcel infers the Excel type per column, so dates
    // stay dates and money stays numeric and summable.
    let excelData: Record<string, unknown>[] = [];

    if (full.items && full.items.length > 0) {
      excelData = full.items.map((item: OrderItem) => ({
        "Order Number": full.order_number,
        "Card Code": full.card_code,
        "Card Name": full.card_name,
        "Delivery Date": full.delivery_date,
        Status: full.status_display,
        "Bill To": full.bill_to_address,
        "Ship To": full.ship_to_address,
        "Item Code": item.item_code,
        "Item Name": item.item_name,
        Scheme: getOrderItemSchemeNames(item),
        "Scheme Qty": getOrderItemSchemeQtyText(item),
        Qty: item.qty,
        Boxes: item.boxes,
        Liters: item.ltrs,
        "Total Ltrs": getOrderItemTotalLtrs(item),
        "Price List (Basic)": item.price_list_basic,
        "Basic Price": item.basic_price,
        "Total Amount": item.total,
      }));
    } else {
      excelData.push({
        "Order Number": full.order_number,
        "Card Code": full.card_code,
        "Card Name": full.card_name,
        "Delivery Date": full.delivery_date,
        Status: full.status_display,
        "Bill To": full.bill_to_address,
        "Ship To": full.ship_to_address,
        "Price List (Basic)": "",
        "Basic Price": "",
      });
    }

    await exportToExcel(excelData, {
      fileName: `Order_${full.order_number}.xlsx`,
      sheetName: "Order Details",
    });
  };

  return (
    <div className="ao-page">
      {!showDetails && (
        <>
          <div className="ao-page-head">
            <span className="ao-page-accent" aria-hidden="true" />
            <div>
              <h1 className="ao-page-title">Pending Orders</h1>
              <p className="ao-page-subtitle">Review and action orders awaiting rate approval.</p>
            </div>
          </div>
          <div className="ao-toolbar">
            <div className="ao-filter-head">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M3 5h14M6 10h8M9 15h2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              <span>Filters</span>
            </div>
            <div className="ao-search-wrap">
              <div className="ao-date-wrap">
                <label className="ao-date-label">From</label>
                <input aria-label="From"
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="ao-date-input"
                />
              </div>
              <div className="ao-date-wrap">
                <label className="ao-date-label">To</label>
                <input aria-label="To"
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="ao-date-input"
                />
              </div>
              {(fromDate || toDate) && (
                <button
                  type="button"
                  className="ao-filter-clear"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                    setCurrentPage(1);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <span className="ao-count">Total: {filteredOrders.length}</span>
          </div>

          {isOrdersLoading ? (
            <TableSkeleton columns={8} label="Loading orders" />
          ) : filteredOrders.length > 0 ? (
            <div className="ao-table-wrap">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Card Name</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>FOC</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((order) => (
                      <TableRow key={order.id} className={order.is_foc ? "ao-foc-row" : ""}>
                        <TableCell className="ao-cell-id">{order.order_number}</TableCell>
                        <TableCell className="ao-cell-name">{order.card_name}</TableCell>
                        <TableCell>{order.items_count ?? order.items?.length ?? 0}</TableCell>
                        <TableCell>
                          {order.is_foc ? (
                            <span className="ao-foc-badge">FOC</span>
                          ) : (
                            <span className="ao-foc-empty">-</span>
                          )}
                        </TableCell>
                        <TableCell>{formatCreatedDateTime(order.created_at)}</TableCell>
                        <TableCell>{order.delivery_date}</TableCell>
                        <TableCell>
                          <div className="ao-row-actions">
                            <button
                              className="ao-btn-icon view"
                              onClick={() => fetchOrderDetails(order.id)}
                              title="View Order"
                            >
                              <HiEye size={20} />
                            </button>
                            <button
                              className="ao-row-btn ao-row-approve"
                              onClick={() => openReview(order, "approve")}
                            >
                              <HiCheckCircle size={18} /> Approve
                            </button>
                            <button
                              className="ao-row-btn ao-row-reject"
                              onClick={() => openReview(order, "reject")}
                            >
                              <HiXCircle size={18} /> Reject
                            </button>
                            <button
                              className="ao-btn-icon download"
                              onClick={() => downloadExcel(order)}
                              title="Download Order"
                            >
                              <HiArrowDownTray size={20} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div
              className="ao-empty"
              style={{
                padding: "40px",
                textAlign: "center",
                color: "#64748b",
                background: "#f8fafc",
                borderRadius: "8px",
                border: "1px dashed #cbd5e1",
                margin: "20px 0",
              }}
            >
              {ordersFailed
                        ? "Could not load orders. Refresh to try again."
                        : "No rate approval orders found"}
            </div>
          )}

          {filteredOrders.length > itemsPerPage && (
            <Pagination
              page={currentPage}
              totalPages={Math.ceil(filteredOrders.length / itemsPerPage)}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}

      {showDetails && orderDetails && (
        <div className="ao-detail">
          <div className="ao-d-nav">
            <button className="ao-d-back" onClick={() => setShowDetails(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 13L5 8l5-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back to Orders
            </button>
            <div className="ao-d-actions">
              <button className="ao-d-export" onClick={() => downloadExcel(orderDetails)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M7 1v8m0 0L4 6.5M7 9l3-2.5M2.5 12h9"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Export Excel
              </button>
              <button
                className="ao-d-action-btn ao-d-approve"
                disabled={isProcessing}
                onClick={() => openReview(orderDetails, "approve")}
              >
                <HiCheckCircle /> Approve
              </button>
              <button
                className="ao-d-action-btn ao-d-reject"
                disabled={isProcessing}
                onClick={() => openReview(orderDetails, "reject")}
              >
                <HiXCircle /> Reject
              </button>
            </div>
          </div>

          <PartyHeader order={orderDetails} />

          <div className="ao-d-items">
            <div className="ao-d-items-head">
              <span className="ao-d-items-title">Items</span>
              <span className="ao-d-items-count">{selectedItems.length}</span>
            </div>
            <div className="ao-d-items-scroll">
              <ItemSection items={selectedItems} />
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead className="app-col-item">Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Scheme Qty</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Pcs</TableHead>
                    <TableHead>Boxes</TableHead>
                    <TableHead>Ltrs</TableHead>
                    <TableHead>Total Ltrs</TableHead>
                    <TableHead>{t("price_list", "Price List (Basic)")}</TableHead>
                    <TableHead>Basic Price</TableHead>
                    <TableHead>Tax %</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedItems.length > 0 ? (
                    selectedItems.map((item, i) => (
                      <TableRow key={`${item.item_code}-${i}`}>
                        <TableCell className="text-center app-cell-index">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <span className="ao-d-item-code">{item.item_code}</span>
                        </TableCell>
                        <TableCell className="app-col-item app-cell-name">
                          {item.item_name}
                        </TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell colSpan={2}>
                          {getOrderItemSchemes(item).length > 0 ? (
                            <div className="order-scheme-stack" aria-label="Applied schemes">
                              {getOrderItemSchemes(item).map((scheme, schemeIndex) => (
                                <div
                                  className="order-scheme-chip"
                                  key={`${item.item_code}-scheme-${schemeIndex}`}
                                >
                                  <span className="order-scheme-name">{scheme.name || "-"}</span>
                                  <span className="order-scheme-qty">Qty {scheme.qty || 0}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="order-scheme-empty">No scheme</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{item.qty}</TableCell>
                        <TableCell className="text-center">{item.pcs}</TableCell>
                        <TableCell className="text-center">
                          {Number(item.boxes).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">{item.ltrs}</TableCell>
                        <TableCell className="text-center">
                          {getOrderItemTotalLtrs(item).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(item.price_list_basic).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(item.basic_price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          {Number(item.tax_rate).toFixed(2)}
                        </TableCell>
                        <TableCell
                          className="text-right app-cell-total"
                        >
                          {Number(item.total).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={14} className="ao-empty">
                        No items found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="ao-d-bottombar">
            <div className="ao-d-summary">
              <div className="ao-d-sum-row">
                <span className="ao-d-sum-label">Total Ltrs</span>
                <span className="ao-d-sum-val">
                  {selectedItems.reduce((s, i) => s + getOrderItemTotalLtrs(i), 0).toFixed(2)}
                </span>
              </div>
              <div className="ao-d-sum-row">
                <span className="ao-d-sum-label">Subtotal</span>
                <span className="ao-d-sum-val">
                  {selectedItems.reduce((s, i) => s + Number(i.total || 0), 0).toFixed(2)}
                </span>
              </div>
              <div className="ao-d-sum-row">
                <span className="ao-d-sum-label">Tax</span>
                <span className="ao-d-sum-val">
                  {selectedItems
                    .reduce((s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0)) / 100, 0)
                    .toFixed(2)}
                </span>
              </div>
              {[
                {
                  label: "Commodity",
                  value: orderDetails.vareity_cost?.commodity_price,
                  cls: "vc-commodity",
                },
                { label: "Other", value: orderDetails.vareity_cost?.other_total, cls: "vc-other" },
                {
                  label: "Premium",
                  value: orderDetails.vareity_cost?.premium_total,
                  cls: "vc-premium",
                },
              ]
                .filter((entry) => Number(entry.value) > 0)
                .map((entry) => (
                  <div className="ao-d-sum-row" key={entry.label}>
                    <span className={`ao-d-sum-label vc-pill ${entry.cls}`}>{entry.label}</span>
                    <span className="ao-d-sum-val">{Number(entry.value).toFixed(2)}</span>
                  </div>
                ))}
              <div className="ao-d-sum-row ao-d-sum-grand">
                <span className="ao-d-sum-label">Grand Total</span>
                <span className="ao-d-sum-val">
                  {(
                    selectedItems.reduce((s, i) => s + Number(i.total || 0), 0) +
                    selectedItems.reduce(
                      (s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0)) / 100,
                      0,
                    )
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ STEP 1: REVIEW MODAL â”€â”€ */}
      <Dialog
        open={Boolean(reviewOrder && reviewAction && reviewStep === "review")}
        onOpenChange={(next) => {
          if (!next) closeReview();
        }}
      >
        {reviewOrder && reviewAction && reviewStep === "review" && (
          <DialogContent
            title="Review order"
            variant="bare"
            size="auto"
            showClose={false}
            className="ao-modal"
          >
            <div className="ao-modal-title">
              {reviewAction === "approve" ? "Review & Approve" : "Review & Reject"}
            </div>
            <p className="ao-modal-msg">Review the order details before you continue.</p>
            <div className="ao-review-summary">
              <div className="ao-review-row">
                <span>Order Number</span>
                <strong>{reviewOrder.order_number}</strong>
              </div>
              <div className="ao-review-row">
                <span>Party</span>
                <strong>{reviewOrder.card_name}</strong>
              </div>
              <div className="ao-review-row">
                <span>Items</span>
                <strong>{reviewOrder.items_count ?? reviewOrder.items?.length ?? 0}</strong>
              </div>
              <div className="ao-review-row">
                <span>Amount</span>
                <strong>
                  ₹
                  {Number(reviewOrder.total_amount || 0).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </div>
              <div className="ao-review-row">
                <span>Delivery Date</span>
                <strong>{reviewOrder.delivery_date || "-"}</strong>
              </div>
            </div>
            <textarea
              className="ao-modal-textarea"
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              placeholder={
                reviewAction === "approve" ? "Add a reason (optional)..." : "Type reason..."
              }
              rows={3}
            />
            <div className="ao-modal-actions">
              <button className="ao-btn-approve" onClick={proceedToConfirm}>
                Continue
              </button>
              <button className="ao-btn-cancel" onClick={closeReview}>
                Cancel
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* â”€â”€ STEP 2: CONFIRM MODAL â”€â”€ */}
      <Dialog
        open={Boolean(reviewOrder && reviewAction && reviewStep === "confirm")}
        onOpenChange={(next) => {
          if (!next) closeReview();
        }}
      >
        {reviewOrder && reviewAction && reviewStep === "confirm" && (
          <DialogContent
            title="Confirm decision"
            variant="bare"
            size="auto"
            showClose={false}
            className="ao-modal"
          >
            <div className="ao-modal-title">
              {reviewAction === "approve" ? "Confirm Approval" : "Confirm Rejection"}
            </div>
            <p className="ao-modal-msg">
              {reviewAction === "approve"
                ? `Approve order ${reviewOrder.order_number} and send it to billing?`
                : `Are you sure you want to reject order ${reviewOrder.order_number}?`}
            </p>
            <div className="ao-modal-actions">
              <button className="ao-btn-approve" onClick={submitReview} disabled={isProcessing}>
                {reviewAction === "approve" ? "Yes, Approve" : "Yes, Reject"}
              </button>
              <button
                className="ao-btn-cancel"
                onClick={() => setReviewStep("review")}
                disabled={isProcessing}
              >
                Back
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* See Auditor_Order for why a busy overlay belongs on the primitive:
          it must not close, and it must stop the page behind being reached. */}
      <Dialog open={isProcessing}>
        {isProcessing && (
          <DialogContent
            title="Processing order"
            variant="bare"
            size="auto"
            showClose={false}
            overlayClassName="ao-modal-overlay"
            className="ao-modal ao-modal-loading"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <div role="status" aria-live="polite" aria-busy="true">
              <div className="ao-spinner" aria-hidden="true" />
              <p className="ao-loading-text">Processing order...</p>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(showAcceptSuccess && acceptSuccessInfo)}
        onOpenChange={(next) => {
          if (!next) setShowAcceptSuccess(false);
        }}
      >
        {showAcceptSuccess && acceptSuccessInfo && (
          <DialogContent
            title="Accepted"
            variant="bare"
            size="auto"
            showClose={false}
            className="ao-modal ao-modal-success"
          >
            <div className="ao-success-icon" aria-hidden="true" />
            <div className="ao-modal-title">
              {acceptSuccessInfo.nextStatus.toLowerCase().includes("completed")
                ? "Order Completed"
                : "Order Approved"}
            </div>
            <div className="ao-success-info">
              <div className="ao-success-row">
                <span className="ao-success-label">Order Number</span>
                <strong className="ao-success-value">{acceptSuccessInfo.orderId}</strong>
              </div>
              <div className="ao-success-row">
                <span className="ao-success-label">Message</span>
                <strong className="ao-success-value">{acceptSuccessInfo.message}</strong>
              </div>
              <div className="ao-success-row">
                <span className="ao-success-label">Current Status</span>
                <strong className="ao-success-value">{acceptSuccessInfo.nextStatus}</strong>
              </div>
            </div>
            <div className="ao-modal-actions">
              <button
                className="ao-btn-approve"
                onClick={() => {
                  setShowAcceptSuccess(false);
                  setAcceptSuccessInfo(null);
                }}
              >
                OK
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
