import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  getOrderItemSchemeNames,
  getOrderItemSchemes,
  getOrderItemSchemeQtyText,
  getOrderItemTotalLtrs,
  ordersService,
} from "../services/ordersService";
import type { Order, OrderItem } from "../services/ordersService";
import "../styles/Auditor_Order.css";
import { useLocation, useNavigate } from "react-router-dom";
import { sortOrders } from "../utils/orderHistory";
import ItemSection from "../components/order-items/ItemSection";
import PartyHeader from "../components/order-items/PartyHeader";
import {
  HiArrowDownTray,
  HiCheckCircle,
  HiEye,
  HiXCircle,
} from "react-icons/hi2";

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
  const location = useLocation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
  const [pendingOrderNum, setPendingOrderNum] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAcceptSuccess, setShowAcceptSuccess] = useState(false);
  const [acceptSuccessInfo, setAcceptSuccessInfo] = useState<{
    orderId: string;
    message: string;
    nextStatus: string;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchOrders();
  }, []);

  const refreshNotifications = () => {
    window.dispatchEvent(new Event("refreshNotifications"));
    window.dispatchEvent(new Event("refresh-notifications"));
  };

  const fetchOrders = async () => {
    setIsOrdersLoading(true);
    try {
      const data = await ordersService.getOrders(RATE_APPROVAL_STATUS, false, true);
      setOrders(sortOrders(data || []));
    } catch (error) {
      console.log("Error fetching rate approval orders:", error);
    } finally {
      setIsOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (location.state?.openOrderId) {
      fetchOrderDetails(location.state.openOrderId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.openOrderId, location.pathname, navigate]);

  const fetchOrderDetails = async (orderId: number) => {
    try {
      const data = await ordersService.getOrderDetails(orderId);
      setOrderDetails(data);
      setSelectedItems(data.items || []);
      setShowDetails(true);
    } catch (error) {
      console.log("Error fetching order details:", error);
    }
  };

  const removeHandledOrder = (orderId: number) => {
    setOrders((current) => current.filter((order) => order.id !== orderId));
    setSelectedItems([]);
    setSelectedOrderId(null);
    if (orderDetails?.id === orderId || pendingOrderId === orderId) {
      setOrderDetails(null);
      setShowDetails(false);
    }
  };

  const initiateApprove = (order: Order) => {
    setPendingOrderId(order.id);
    setPendingOrderNum(order.order_number);
    setShowConfirmModal(true);
  };

  const confirmApprove = async () => {
    if (!pendingOrderId) return;
    setShowConfirmModal(false);
    setIsProcessing(true);

    try {
      const response = await ordersService.UpdateStatus(
        pendingOrderId,
        RATE_APPROVER_APPROVED_STATUS,
        "Approved",
      );
      setAcceptSuccessInfo({
        orderId: pendingOrderNum,
        message: response.message || "Order approved successfully",
        nextStatus: response.status || "-",
      });
      removeHandledOrder(pendingOrderId);
      setShowAcceptSuccess(true);
      fetchOrders();
      refreshNotifications();
    } catch (error: any) {
      alert("Error: " + (error?.response?.data?.message || "Something went wrong"));
    } finally {
      setIsProcessing(false);
      setPendingOrderId(null);
      setPendingOrderNum("");
    }
  };

  const rejectStatus = async (orderId: number | null) => {
    if (!orderId) return;
    if (!rejectReason.trim()) {
      alert("Reason required");
      return;
    }

    try {
      await ordersService.UpdateStatus(
        orderId,
        RATE_APPROVER_REJECTED_STATUS,
        rejectReason,
      );
      alert("Order Rejected");
      removeHandledOrder(orderId);
      setShowRejectModal(false);
      setRejectReason("");
      fetchOrders();
      refreshNotifications();
    } catch (error: any) {
      alert("Error: " + (error?.response?.data?.message || "Unknown error"));
    }
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

    let excelData: object[] = [];

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
        "Total Ltrs": getOrderItemTotalLtrs(item).toFixed(2),
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

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Order Details");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const file = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(file, `Order_${full.order_number}.xlsx`);
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
                <path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>Filters</span>
            </div>
            <div className="ao-search-wrap">
              <div className="ao-date-wrap">
                <label className="ao-date-label">From</label>
                <input
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
                <input
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
            <div className="order-loading-state">
              <span className="order-loading-spinner" />
              <span>Loading orders...</span>
            </div>
          ) : filteredOrders.length > 0 ? (
            <div className="ao-table-wrap">
              <table className="ao-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Card Name</th>
                    <th>Items</th>
                    <th>FOC</th>
                    <th>Created At</th>
                    <th>Delivery Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((order) => (
                      <tr key={order.id} className={order.is_foc ? "ao-foc-row" : ""}>
                        <td className="ao-cell-id">{order.order_number}</td>
                        <td className="ao-cell-name">{order.card_name}</td>
                        <td>{order.items_count ?? order.items?.length ?? 0}</td>
                        <td>
                          {order.is_foc ? (
                            <span className="ao-foc-badge">FOC</span>
                          ) : (
                            <span className="ao-foc-empty">-</span>
                          )}
                        </td>
                        <td>{formatCreatedDateTime(order.created_at)}</td>
                        <td>{order.delivery_date}</td>
                        <td>
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
                              onClick={() => initiateApprove(order)}
                            >
                              <HiCheckCircle size={18} /> Approve
                            </button>
                            <button
                              className="ao-row-btn ao-row-reject"
                              onClick={() => {
                                setSelectedOrderId(order.id);
                                setShowRejectModal(true);
                              }}
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
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
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
              No rate approval orders found
            </div>
          )}

          {filteredOrders.length > itemsPerPage && (
            <div className="ao-pagination">
              <button
                className="ao-pg-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                Prev
              </button>
              <span className="ao-pg-info">
                {currentPage} / {Math.ceil(filteredOrders.length / itemsPerPage)}
              </span>
              <button
                className="ao-pg-btn"
                disabled={currentPage === Math.ceil(filteredOrders.length / itemsPerPage)}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
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
                onClick={() => initiateApprove(orderDetails)}
              >
                <HiCheckCircle /> Approve
              </button>
              <button
                className="ao-d-action-btn ao-d-reject"
                disabled={isProcessing}
                onClick={() => {
                  setSelectedOrderId(orderDetails.id);
                  setShowRejectModal(true);
                }}
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
              <table className="ao-d-tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item Code</th>
                    <th style={{ minWidth: "250px" }}>Item Name</th>
                    <th>Category</th>
                    <th>Scheme</th>
                    <th>Scheme Qty</th>
                    <th>Qty</th>
                    <th>Pcs</th>
                    <th>Boxes</th>
                    <th>Ltrs</th>
                    <th>Total Ltrs</th>
                    <th>Price List (Basic)</th>
                    <th>Basic Price</th>
                    <th>Tax %</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.length > 0 ? (
                    selectedItems.map((item, i) => (
                      <tr key={`${item.item_code}-${i}`}>
                        <td style={{ textAlign: "center", color: "#94a3b8" }}>{i + 1}</td>
                        <td>
                          <span className="ao-d-item-code">{item.item_code}</span>
                        </td>
                        <td style={{ fontWeight: 500, color: "#0f172a", minWidth: "250px" }}>
                          {item.item_name}
                        </td>
                        <td>{item.category}</td>
                        <td colSpan={2}>
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
                        </td>
                        <td style={{ textAlign: "center" }}>{item.qty}</td>
                        <td style={{ textAlign: "center" }}>{item.pcs}</td>
                        <td style={{ textAlign: "center" }}>{Number(item.boxes).toFixed(2)}</td>
                        <td style={{ textAlign: "center" }}>{item.ltrs}</td>
                        <td style={{ textAlign: "center" }}>
                          {getOrderItemTotalLtrs(item).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {Number(item.price_list_basic).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {Number(item.basic_price).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {Number(item.tax_rate).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                          {Number(item.total).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={14} className="ao-empty">
                        No items found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
              { label: "Commodity", value: orderDetails.vareity_cost?.commodity_price, cls: "vc-commodity" },
              { label: "Other", value: orderDetails.vareity_cost?.other_total, cls: "vc-other" },
              { label: "Premium", value: orderDetails.vareity_cost?.premium_total, cls: "vc-premium" },
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

      {showConfirmModal && (
        <div className="ao-modal-overlay">
          <div className="ao-modal">
            <div className="ao-modal-title">Approve Order</div>
            <p className="ao-modal-msg">
              Do you want to approve order {pendingOrderNum} and send it to billing?
            </p>
            <div className="ao-modal-actions">
              <button className="ao-btn-approve" onClick={confirmApprove}>
                Confirm
              </button>
              <button
                className="ao-btn-cancel"
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingOrderId(null);
                  setPendingOrderNum("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="ao-modal-overlay">
          <div className="ao-modal ao-modal-loading">
            <div className="ao-spinner" />
            <p className="ao-loading-text">Processing order...</p>
          </div>
        </div>
      )}

      {showAcceptSuccess && acceptSuccessInfo && (
        <div className="ao-modal-overlay">
          <div className="ao-modal ao-modal-success">
            <div className="ao-success-icon" aria-hidden="true" />
            <div className="ao-modal-title">
              {acceptSuccessInfo.nextStatus.toLowerCase().includes("completed") ? "Order Completed" : "Order Approved"}
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
          </div>
        </div>
      )}

      {showRejectModal && (
        <div className="ao-modal-overlay">
          <div className="ao-modal">
            <div className="ao-modal-title">Rejection Reason</div>
            <textarea
              className="ao-modal-textarea"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Type reason..."
              rows={4}
            />
            <div className="ao-modal-actions">
              <button className="ao-btn-approve" onClick={() => rejectStatus(selectedOrderId)}>
                Submit
              </button>
              <button
                className="ao-btn-cancel"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
