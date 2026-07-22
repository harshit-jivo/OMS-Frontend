import { useState, useEffect } from "react";
import { getOrderItemSchemeNames, getOrderItemSchemes, getOrderItemSchemeQtyText, getOrderItemTotalLtrs, ordersService } from "../services/ordersService";
import type { Order, OrderItem } from "../services/ordersService";
import { exportToExcel } from "../utils/excelExport";
import "../styles/Billing_Order.css";
import { useNavigate, useLocation } from "react-router-dom";
import { sortOrders } from "../utils/orderHistory";
import { useUILabels } from "../services/uiConfig";
import ItemSection from "../components/order-items/ItemSection";
import PartyHeader from "../components/order-items/PartyHeader";
import {
  HiCheckCircle,   // Approve
  HiXCircle,       // Reject
  HiEye,           // View
  HiArrowDownTray,  // Download
  // HiEllipsisVertical  
  HiPencilSquare,
} from "react-icons/hi2";

const now = new Date();

// First day of current month
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  .toISOString()
  .split("T")[0];

// Last day of current month
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  .toISOString()
  .split("T")[0];

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

const isRejectedBillingOrder = (order: Order) => {
  const statusCode = String(order.status || "").toUpperCase();
  const statusText = String(order.status_display || "").toLowerCase();

  return statusCode === "BILLING_REJECTED" || statusText.includes("reject");
};
  
export default function Billing_orders() {
  const { t } = useUILabels();

  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  // const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
  const [pendingOrderNum, setPendingOrderNum] = useState<string>("");
  const [showAcceptSuccess, setShowAcceptSuccess] = useState(false);
  const [acceptSuccessInfo, setAcceptSuccessInfo] = useState<{ orderId: string; message: string; nextStatus: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setIsOrdersLoading(true);
    try {
      const data: Order[] = await ordersService.getOrders(undefined, true);
      const activeOrders = (data || []).filter((order) => !isRejectedBillingOrder(order));
      setOrders(sortOrders(activeOrders));
    } catch (error) {
      console.log("Error fetching orders:", error);
    } finally {
      setIsOrdersLoading(false);
    }
  };
  console.log("All Orders:", orders);

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

  // Step 1 â€“ open confirm modal
  const initiateApprove = (order: Order) => {
    setPendingOrderId(order.id);
    setPendingOrderNum(order.order_number);
    setShowConfirmModal(true);
  };

  // Step 2 â€“ user confirmed: show loader â†’ call API â†’ show success
  const confirmApprove = async () => {
    if (!pendingOrderId) return;
    setShowConfirmModal(false);
    setIsProcessing(true);
    try {
      const response = await ordersService.UpdateStatus(pendingOrderId, 10);
      setAcceptSuccessInfo({
        orderId: pendingOrderNum,
        message: response.message || "Order accepted successfully",
        nextStatus: response.status || "-",
      });
      removeHandledOrder(pendingOrderId);
      setShowAcceptSuccess(true);
      fetchOrders();
      window.dispatchEvent(new Event('refresh-notifications'));
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
      await ordersService.UpdateStatus(orderId, 8, rejectReason);
      alert("Order Rejected");
      removeHandledOrder(orderId);
      setShowRejectModal(false);
      setRejectReason("");
      fetchOrders();
      window.dispatchEvent(new Event('refresh-notifications'));
    } catch (error: any) {
      alert("Error: " + (error?.response?.data?.message || "Unknown error"));
    }
  };

  // const pendingApproval = async (orderId: number) => {
  //   try {
  //     await ordersService.UpdateStatus(orderId, 5);
  //     alert("Status Updated");
  //     setActiveOrderId(null);
  //     fetchOrders();
  //   } catch (error: any) {
  //     alert("Error: " + (error?.response?.data?.message || "Unknown error"));
  //   }
  // };

  // const needApproval = async (orderId: number) => {
  //   try {
  //     await ordersService.UpdateStatus(orderId, 4);
  //     alert("Status Updated");
  //     setActiveOrderId(null);
  //     fetchOrders();
  //   } catch (error: any) {
  //     alert("Error: " + (error?.response?.data?.message || "Unknown error"));
  //   }
  // };

  const filteredOrders = orders.filter((order) => {
    let matchDate = true;

    if (fromDate && toDate) {
      const orderDate = new Date(order.created_at);
      const from = new Date(`${fromDate}T00:00:00.000`);
      const to = new Date(`${toDate}T23:59:59.999`);


      matchDate = orderDate >= from && orderDate <= to;
    }

    return matchDate && !isRejectedBillingOrder(order);
  });
  console.log("Filtered Orders:", filteredOrders);

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
        "Status": full.status_display,
        "Bill To": full.bill_to_address,
        "Ship To": full.ship_to_address,
        "Item Code": item.item_code,
        "Item Name": item.item_name,
        "Scheme": getOrderItemSchemeNames(item),
        "Scheme Qty": getOrderItemSchemeQtyText(item),
        // "Scheme Ltrs": (item as any).scheme_ltrs || "",
        "Qty": item.qty,
        "Boxes": item.boxes,
        "Liters": item.ltrs,
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
        "Status": full.status_display,
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

  const handleEditOrder = (order: Order) => {
    navigate("/Add_Sales", {
      state: {
        editOrderId: order.id,
        returnTo: "/Billing_status_tracking",
        mode: "edit",
        allowPoNumber: true,
      },
    });
  };

  return (
    <div className="bo-page">

      {/* â”€â”€ LIST VIEW â”€â”€ */}
      {!showDetails && (
        <>
          <div className="bo-page-head">
            <span className="bo-page-accent" aria-hidden="true" />
            <div>
              <h1 className="bo-page-title">Pending Orders</h1>
              <p className="bo-page-subtitle">Review and action orders awaiting billing.</p>
            </div>
          </div>
          <div className="bo-toolbar">
            <div className="bo-filter-head">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>Filters</span>
            </div>
            <div className="bo-search-wrap">
              <div className="bo-date-wrap">
                <label className="bo-date-label">From</label>
                <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }} className="bo-date-input" />
              </div>
              <div className="bo-date-wrap">
                <label className="bo-date-label">To</label>
                <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }} className="bo-date-input" />
              </div>
              {(fromDate || toDate) && (
                <button type="button" className="bo-filter-clear" onClick={() => { setFromDate(""); setToDate(""); setCurrentPage(1); }}>Clear</button>
              )}
            </div>
            <span className="bo-count">Total: {filteredOrders.length}</span>
          </div>

          <div className="bo-table-wrap">
            <table className="bo-table">
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
                {isOrdersLoading ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="order-loading-state">
                        <span className="order-loading-spinner" />
                        <span>Loading orders...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredOrders.length > 0 ? (
                  filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((order) => (
                    <tr key={order.id} className={order.is_foc ? "bo-foc-row" : ""}>
                      <td className="ao-cell-id">{order.order_number}</td>
                      <td className="ao-cell-name">{order.card_name}</td>
                      <td>{order.items_count ?? order.items?.length ?? 0}</td>
                      <td>
                        {order.is_foc ? (
                          <span className="bo-foc-badge">FOC</span>
                        ) : (
                          <span className="bo-foc-empty">-</span>
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
                            className="ao-btn-icon edit"
                            onClick={() => handleEditOrder(order)}
                            title="Edit Order"
                          >
                            <HiPencilSquare size={20} />
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
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="bo-empty">No orders found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredOrders.length > itemsPerPage && (
            <div className="bo-pagination">
              <button className="bo-pg-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>Prev</button>
              <span className="bo-pg-info">{currentPage} / {Math.ceil(filteredOrders.length / itemsPerPage)}</span>
              <button className="bo-pg-btn" disabled={currentPage === Math.ceil(filteredOrders.length / itemsPerPage)} onClick={() => setCurrentPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {/* â”€â”€ DETAIL VIEW â”€â”€ */}
      {showDetails && orderDetails && (
        <div className="bo-detail">
          <div className="bo-d-nav">
            <button className="bo-d-back" onClick={() => setShowDetails(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 13L5 8l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back to Orders
            </button>
            <div className="bo-d-actions">
              <button className="bo-d-export" onClick={() => downloadExcel(orderDetails)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8m0 0L4 6.5M7 9l3-2.5M2.5 12h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Export Excel
              </button>
              <button
                className="bo-d-action-btn bo-d-approve"
                onClick={() => initiateApprove(orderDetails)}
              >
                <HiCheckCircle /> Approve
              </button>
              <button
                className="bo-d-action-btn bo-d-reject"
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

          <div className="bo-d-items">
            <div className="bo-d-items-head">
              <span className="bo-d-items-title">Items</span>
              <span className="bo-d-items-count">{selectedItems.length}</span>
            </div>
            <div className="bo-d-items-scroll">
              <ItemSection items={selectedItems} />
              <table className="bo-d-tbl">
                <thead><tr><th>#</th><th>Item Code</th>
                  <th style={{ minWidth: '250px' }}>Item Name</th>
                  <th>Category</th><th>Scheme</th><th>Scheme Qty</th>
                  <th>Qty</th><th>Pcs</th><th>Boxes</th><th>Ltrs</th>
                  {/* <th>Scheme Ltrs</th> */}
                  <th>Total Ltrs</th><th>{t("price_list", "Price List (Basic)")}</th><th>Basic Price</th><th>Tax %</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {selectedItems.length > 0 ? selectedItems.map((item, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
                      <td><span className="bo-d-item-code">{item.item_code}</span></td>
                      <td style={{ fontWeight: 500, color: '#0f172a', minWidth: '250px' }}>{item.item_name}</td>
                      <td>{item.category}</td>
                      <td colSpan={2}>{getOrderItemSchemes(item).length > 0 ? <div className="order-scheme-stack" aria-label="Applied schemes">{getOrderItemSchemes(item).map((scheme, schemeIndex) => <div className="order-scheme-chip" key={`${item.item_code}-scheme-${schemeIndex}`}><span className="order-scheme-name">{scheme.name || "-"}</span><span className="order-scheme-qty">Qty {scheme.qty || 0}</span></div>)}</div> : <span className="order-scheme-empty">No scheme</span>}</td>
                      <td style={{ textAlign: 'center' }}>{item.qty}</td>
                      <td style={{ textAlign: 'center' }}>{item.pcs}</td>
                      <td style={{ textAlign: 'center' }}>{Number(item.boxes).toFixed(2)}</td>
                      <td style={{ textAlign: 'center' }}>{item.ltrs}</td>
                      {/* <td style={{textAlign:'center'}}>{item.scheme_name ? ((item as any).scheme_ltrs || 0) : "-"}</td> */}
                      <td style={{ textAlign: 'center' }}>{getOrderItemTotalLtrs(item).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{Number(item.price_list_basic).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{Number(item.basic_price).toFixed(2)}</td>
                      <td style={{ textAlign: 'center' }}>{Number(item.tax_rate).toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{Number(item.total).toFixed(2)}</td>
                    </tr>
                  )) : (<tr><td colSpan={14} className="bo-empty">No items found</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bo-d-bottombar">
          <div className="bo-d-summary">
            <div className="bo-d-sum-row"><span className="bo-d-sum-label">Total Ltrs</span><span className="bo-d-sum-val">{selectedItems.reduce((s, i) => s + getOrderItemTotalLtrs(i), 0).toFixed(2)}</span></div>
            <div className="bo-d-sum-row"><span className="bo-d-sum-label">Subtotal</span><span className="bo-d-sum-val">{selectedItems.reduce((s, i) => s + Number(i.total || 0), 0).toFixed(2)}</span></div>
            <div className="bo-d-sum-row"><span className="bo-d-sum-label">Tax</span><span className="bo-d-sum-val">{selectedItems.reduce((s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0) / 100), 0).toFixed(2)}</span></div>
            {[
              { label: "Commodity", value: orderDetails.vareity_cost?.commodity_price, cls: "vc-commodity" },
              { label: "Other", value: orderDetails.vareity_cost?.other_total, cls: "vc-other" },
              { label: "Premium", value: orderDetails.vareity_cost?.premium_total, cls: "vc-premium" },
            ]
              .filter((entry) => Number(entry.value) > 0)
              .map((entry) => (
                <div className="bo-d-sum-row" key={entry.label}><span className={`bo-d-sum-label vc-pill ${entry.cls}`}>{entry.label}</span><span className="bo-d-sum-val">{Number(entry.value).toFixed(2)}</span></div>
              ))}
            <div className="bo-d-sum-row bo-d-sum-grand"><span className="bo-d-sum-label">Grand Total</span><span className="bo-d-sum-val">{(selectedItems.reduce((s, i) => s + Number(i.total || 0), 0) + selectedItems.reduce((s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0) / 100), 0)).toFixed(2)}</span></div>
          </div>
          </div>
        </div>
      )}

      {/* â”€â”€ CONFIRM MODAL â”€â”€ */}
      {showConfirmModal && (
        <div className="bo-modal-overlay">
          <div className="bo-modal">
            <div className="bo-modal-title">Approve Order</div>
            <p className="bo-modal-msg">Do you want to accept this order in billing?</p>
            <div className="bo-modal-actions">
              <button className="bo-btn-approve" onClick={confirmApprove}>Confirm</button>
              <button className="bo-btn-cancel" onClick={() => { setShowConfirmModal(false); setPendingOrderId(null); setPendingOrderNum(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ LOADING OVERLAY â”€â”€ */}
      {isProcessing && (
        <div className="bo-modal-overlay">
          <div className="bo-modal bo-modal-loading">
            <div className="bo-spinner" />
            <p className="bo-loading-text">Processing order...</p>
          </div>
        </div>
      )}

      {showAcceptSuccess && acceptSuccessInfo && (
        <div className="bo-modal-overlay">
          <div className="bo-modal bo-modal-success">
            <div className="bo-success-icon" aria-hidden="true" />
            <div className="bo-modal-title">
              {acceptSuccessInfo.nextStatus.toLowerCase().includes("completed") ? "Order Completed" : "Order Accepted"}
            </div>
            <div className="bo-success-info">
              <div className="bo-success-row">
                <span className="bo-success-label">Order Number</span>
                <strong className="bo-success-value">{acceptSuccessInfo.orderId}</strong>
              </div>
              <div className="bo-success-row">
                <span className="bo-success-label">Message</span>
                <strong className="bo-success-value">{acceptSuccessInfo.message}</strong>
              </div>
              <div className="bo-success-row">
                <span className="bo-success-label">Current Status</span>
                <strong className="bo-success-value">{acceptSuccessInfo.nextStatus}</strong>
              </div>
            </div>
            <div className="bo-modal-actions">
              <button
                className="bo-btn-approve"
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

      {/* â”€â”€ REJECT MODAL â”€â”€ */}
      {showRejectModal && (
        <div className="bo-modal-overlay">
          <div className="bo-modal">
            <div className="bo-modal-title">Rejection Reason</div>
            <textarea
              className="bo-modal-textarea"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Type reason..."
              rows={4}
            />
            <div className="bo-modal-actions">
              <button
                className="bo-btn-approve"
                onClick={() => rejectStatus(selectedOrderId)}
              >
                Submit
              </button>
              <button
                className="bo-btn-cancel"
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


