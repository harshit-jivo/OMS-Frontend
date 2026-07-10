import { useEffect, useMemo, useState, useRef } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import type { Order, OrderItem, OrderLog } from "../services/ordersService";
import { sapService } from "../services/sapService";
import { getOrderItemSchemes, getOrderItemTotalLtrs, ordersService } from "../services/ordersService";
import {
  buildOrderTimelineLogs,
  getOrderLogDisplayRemark,
  getOrderLogDisplayTitle,
  getOrderLogTone,
} from "../utils/orderTrackingTimeline";
import "../styles/Order_Status_Tracking.css";
import "../styles/Auditor_Order.css";
import ItemSection from "../components/order-items/ItemSection";
import PartyHeader from "../components/order-items/PartyHeader";
import {
  HiEye, HiArrowDownTray, HiArrowPath, HiMagnifyingGlass, HiXMark
} from "react-icons/hi2";

type TrackingMode = "auditor" | "billing" | "rate_approver";

type OrderStatusTrackingProps = {
  mode: TrackingMode;
};

const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0];

const ACCEPTED_KEYWORDS: Record<TrackingMode, string[]> = {
  auditor: ["billed", "completed", "quotation"],
  billing: ["auditor", "audit", "billed", "completed", "quotation"],
  rate_approver: ["billing", "approved", "accepted", "rate"],
};
const REJECTED_KEYWORDS = ["rejected", "declined", "cancelled", "canceled"];
const BILLING_REJECTED_KEYWORDS = ["billing rejected", "rejected by billing", "billing reject"];
const AUDITOR_REJECTED_CODES = ["REJECTED"];
const AUDITOR_ACCEPTED_STATUS_CODES = ["BILLING", "BILLING_PENDING", "APPROVED", "COMPLETED"];
const BILLING_REJECTED_CODES = ["BILLING_REJECTED"];
const APPROVER_ACCEPTED_STATUS_CODES = ["APPROVED", "BILLING", "BILLING_PENDING", "BILLED", "COMPLETED"];
// An order can only progress past rate approval if it was approved, so any
// downstream status counts as accepted for the rate approver view.
const APPROVER_ACCEPTED_KEYWORDS = ["billing", "billed", "audit", "completed", "quotation"];
const RATE_APPROVER_REJECTED_KEYWORDS = ["rate approver rejected", "rate rejected", "rejected"];
const RATE_APPROVER_TRACKING_FALLBACK_STATUS = "APPROVED";

const normalizeStatusClass = (status: string) => status.toLowerCase().replace(/\s+/g, "-");

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

const getDecisionType = (order: Order, mode: TrackingMode) => {
  if (order.decision_type === "accepted" || order.decision_type === "rejected") {
    return order.decision_type;
  }

  const normalized = (order.status_display || "").toLowerCase();
  const statusCode = String(order.status || "").toUpperCase();

  if (mode === "auditor") {
    if (BILLING_REJECTED_CODES.includes(statusCode) || BILLING_REJECTED_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      return "other";
    }
    if (AUDITOR_REJECTED_CODES.includes(statusCode) || normalized === "rejected") {
      return "rejected";
    }
    if (
      AUDITOR_ACCEPTED_STATUS_CODES.includes(statusCode) ||
      ["billing", "approved", "accepted", "completed", "quotation"].some((keyword) => normalized.includes(keyword))
    ) {
      return "accepted";
    }
  }

  if (mode === "billing") {
    if (AUDITOR_REJECTED_CODES.includes(statusCode) || normalized === "rejected") {
      return "accepted";
    }
    if (BILLING_REJECTED_CODES.includes(statusCode) || BILLING_REJECTED_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      return "rejected";
    }
  }

  if (mode === "rate_approver") {
    if (RATE_APPROVER_REJECTED_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      return "rejected";
    }
    if (
      APPROVER_ACCEPTED_STATUS_CODES.includes(statusCode) ||
      APPROVER_ACCEPTED_KEYWORDS.some((keyword) => normalized.includes(keyword))
    ) {
      return "accepted";
    }
  }

  if (ACCEPTED_KEYWORDS[mode].some((keyword) => normalized.includes(keyword))) {
    return "accepted";
  }
  if (REJECTED_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "rejected";
  }
  return "other";
};

const getRateApproverApprovalDecision = (order: Order): Order["decision_type"] => {
  const approvals = Array.isArray(order.rate_approvals) ? order.rate_approvals : [];
  if (approvals.some((approval) => String(approval.status || "").toUpperCase() === "REJECTED")) {
    return "rejected";
  }
  if (approvals.some((approval) => String(approval.status || "").toUpperCase() === "APPROVED")) {
    return "accepted";
  }
  return undefined;
};

const normalizeTrackingOrders = (items: Order[], mode: TrackingMode) => {
  if (mode !== "rate_approver") return items;
  return items.map((order) => {
    const decisionType = getRateApproverApprovalDecision(order);
    return decisionType ? { ...order, decision_type: decisionType } : order;
  });
};

export default function Order_Status_Tracking({ mode }: OrderStatusTrackingProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [decisionFilter, setDecisionFilter] = useState<"all" | "accepted" | "rejected">("all");
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [orderLogs, setOrderLogs] = useState<OrderLog[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);
  const fetchedQuotationIds = useRef<Set<number>>(new Set());

  const itemsPerPage = 10;
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
  const [trackingLogs, setTrackingLogs] = useState<OrderLog[]>([]);
  const [trackLogsLoading, setTrackLogsLoading] = useState(false);
  const showTrackColumn = mode !== "rate_approver";
  const tableColumnCount = 8;
  const pageTitle =
    mode === "auditor"
      ? "Auditor Status Tracking"
      : mode === "billing"
        ? "Billing Status Tracking"
        : "Rate Approver Status Tracking";
  
  useEffect(() => {
    void fetchOrders();
  }, [mode]);

  const fetchOrders = async () => {
    setIsOrdersLoading(true);
    try {
      let data = await ordersService.getStatusTrackingOrders(mode);
      if (mode === "rate_approver" && (!Array.isArray(data) || data.length === 0)) {
        data = await ordersService.getOrders(RATE_APPROVER_TRACKING_FALLBACK_STATUS);
      }
      setOrders(normalizeTrackingOrders(Array.isArray(data) ? data : [], mode));
    } catch (error) {
      console.log("Error fetching orders:", error);
    } finally {
      setIsOrdersLoading(false);
    }
  };

  const trackedOrders = useMemo(
    () => orders.filter((order) => getDecisionType(order, mode) !== "other"),
    [orders, mode],
  );

  const dateFilteredOrders = useMemo(() => {
    return trackedOrders.filter((order) => {
      let matchesDate = true;
      if (fromDate && toDate) {
        const orderDate = new Date(order.created_at);
        const from = new Date(`${fromDate}T00:00:00.000`);
        const to = new Date(`${toDate}T23:59:59.999`);
        matchesDate = orderDate >= from && orderDate <= to;
      }

      const matchesCardName = !appliedSearch || String(order.card_name || "")
        .toLowerCase()
        .includes(appliedSearch);

      return matchesDate && matchesCardName;
    });
  }, [trackedOrders, fromDate, toDate, appliedSearch]);

  const filteredOrders = useMemo(() => {
    return dateFilteredOrders.filter((order) => {
      const decisionType = getDecisionType(order, mode);
      return decisionFilter === "all" ? true : decisionType === decisionFilter;
    });
  }, [dateFilteredOrders, decisionFilter, mode]);

  const acceptedCount = dateFilteredOrders.filter((order) => getDecisionType(order, mode) === "accepted").length;
  const rejectedCount = dateFilteredOrders.filter((order) => getDecisionType(order, mode) === "rejected").length;

  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const isCompletedStatus = (order?: Order | null) => {
    const s = String(order?.status_display || "").toLowerCase();
    return ["completed", "billing", "billed", "quotation", "approved", "accepted"].some(k => s.includes(k));
  };

  const applyQuotationNumber = (order: Order, quotationNo?: string) =>
    quotationNo && quotationNo !== order.sap_doc_number
      ? { ...order, sap_doc_number: quotationNo }
      : order;

  const cacheQuotationNumber = (orderId: number, quotationNo?: string) => {
    if (!quotationNo) return;
    setOrders((prev) =>
      prev.map((item) => (item.id === orderId ? { ...item, sap_doc_number: quotationNo } : item)),
    );
  };

  const resolveQuotationNumber = async (order: Order) => {
    const existingValue = String(order.sap_doc_number || "").trim();
    if (existingValue) return existingValue;
    if (!isCompletedStatus(order)) return "";

    try {
      const quotationLog = await sapService.getQuotationLog(order.id);
      const quotationNo = String(quotationLog?.sap_doc_num || "").trim();
      if (quotationNo) {
        cacheQuotationNumber(order.id, quotationNo);
      }
      return quotationNo;
    } catch (error) {
      console.log("Error fetching quotation number:", error);
      return "";
    }
  };

  useEffect(() => {
    const fetchMissingQuotations = async () => {
      const ordersToFetch = paginatedOrders.filter(
        (o) => !String(o.sap_doc_number || "").trim() && isCompletedStatus(o) && !fetchedQuotationIds.current.has(o.id)
      );
      if (ordersToFetch.length === 0) return;

      ordersToFetch.forEach((o) => fetchedQuotationIds.current.add(o.id));
      await Promise.all(ordersToFetch.map((order) => resolveQuotationNumber(order)));
    };
    void fetchMissingQuotations();
  }, [paginatedOrders]);

     const fetchOrderDetails = async (orderId: number) => {
  try {
    const [data, logs] = await Promise.all([
      ordersService.getOrderDetails(orderId),
      ordersService.getOrderLogs(orderId).catch(() => []),
    ]);

    const qno = await resolveQuotationNumber(data);
    if (qno) {
      data.sap_doc_number = qno;
    }

    setOrderDetails(data);
    setSelectedItems(data.items || []);
    setOrderLogs(logs || []);
    setShowDetails(true);
  } catch (error) {
    console.log("Error fetching order details:", error);
  }
};

  const totalLtrs = selectedItems.reduce(
    (sum, item) =>
      sum + getOrderItemTotalLtrs(item),
    0,
  );
  const subtotal = selectedItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const taxTotal = selectedItems.reduce(
    (sum, item) => sum + ((Number(item.total || 0) * Number(item.tax_rate || 0)) / 100),
    0,
  );
  const grandTotal = subtotal + taxTotal;
  const hasQuotationNumber = Boolean(String(orderDetails?.sap_doc_number || "").trim());
  const isCompletedOrder = isCompletedStatus(orderDetails);

  const handleTrack = async (order: Order) => {
    setTrackingOrder(order);
    setShowTrackModal(true);
    setTrackingLogs([]);
    setTrackLogsLoading(true);
    try {
      const response = await ordersService.getOrderLogs(order.id);
      setTrackingLogs(Array.isArray(response) ? response : []);
    } catch (error) {
      console.log("Error fetching order logs:", error);
      setTrackingLogs([]);
    } finally {
      setTrackLogsLoading(false);
    }
  };

  const downloadExcel = async (order: Order) => {
    const quotationNo = await resolveQuotationNumber(order);
    const exportOrder = applyQuotationNumber(order, quotationNo);
    let excelData: object[] = [];

    if (exportOrder.items && exportOrder.items.length > 0) {
      excelData = exportOrder.items.flatMap((item: OrderItem) => {
        const schemes = getOrderItemSchemes(item);
        const baseRow = {
        "Order Number": exportOrder.order_number,
        "Card Code": exportOrder.card_code,
        "Card Name": exportOrder.card_name,
        "Delivery Date": exportOrder.delivery_date,
        Status: exportOrder.status_display,
        ...(String(exportOrder.sap_doc_number || "").trim() ? { "Quotation No": exportOrder.sap_doc_number } : {}),
        "Bill To": exportOrder.bill_to_address,
        "Ship To": exportOrder.ship_to_address,
        "Item Code": item.item_code,
        "Item Name": item.item_name,
        Qty: item.qty,
        Boxes: item.boxes,
        Liters: item.ltrs,
        "Total Ltrs": getOrderItemTotalLtrs(item).toFixed(2),
        "Price List (Basic)": item.price_list_basic,
        "Basic Price": item.basic_price,
        "Total Amount": item.total,
        };
        return schemes.length
          ? schemes.map((scheme) => ({ ...baseRow, Scheme: scheme.name, "Scheme Qty": scheme.qty }))
          : [{ ...baseRow, Scheme: "", "Scheme Qty": "" }];
      });
    } else {
      excelData.push({
        "Order Number": exportOrder.order_number,
        "Card Code": exportOrder.card_code,
        "Card Name": exportOrder.card_name,
        "Delivery Date": exportOrder.delivery_date,
        Status: exportOrder.status_display,
        ...(String(exportOrder.sap_doc_number || "").trim() ? { "Quotation No": exportOrder.sap_doc_number } : {}),
        "Bill To": exportOrder.bill_to_address,
        "Ship To": exportOrder.ship_to_address,
        "Price List (Basic)": "",
        "Basic Price": "",
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Status Tracking");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const file = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(file, `Tracked_Order_${exportOrder.order_number}.xlsx`);
  };

  return (
    <div className="ot-page">
      {!showDetails && (
        <>
          <div className="ao-page-head">
            <span className="ao-page-accent" aria-hidden="true" />
            <div>
              <h1 className="ao-page-title">{pageTitle}</h1>
              <p className="ao-page-subtitle">View and Track orders</p>
            </div>
          </div>

          <div className="ot-kpis">
            
            <div className="ot-kpi-card ot-kpi-card-accepted">
              <span className="ot-kpi-label">Accepted</span>
              <span className="ot-kpi-value">{acceptedCount}</span>
            </div>
            <div className="ot-kpi-card ot-kpi-card-rejected">
              <span className="ot-kpi-label">Rejected</span>
              <span className="ot-kpi-value">{rejectedCount}</span>
            </div>
          </div>

          <div className="ot-toolbar">
            <div className="ot-toolbar-group">
              <button
                type="button"
                className={`ot-chip${decisionFilter === "all" ? " active" : ""}`}
                onClick={() => {
                  setDecisionFilter("all");
                  setCurrentPage(1);
                }}
              >
                All
              </button>
              <button
                type="button"
                className={`ot-chip${decisionFilter === "accepted" ? " active ot-chip-accepted" : ""}`}
                onClick={() => {
                  setDecisionFilter("accepted");
                  setCurrentPage(1);
                }}
              >
                Accepted
              </button>
              <button
                type="button"
                className={`ot-chip${decisionFilter === "rejected" ? " active ot-chip-rejected" : ""}`}
                onClick={() => {
                  setDecisionFilter("rejected");
                  setCurrentPage(1);
                }}
              >
                Rejected
              </button>
              <div className="ot-card-search">
                <HiMagnifyingGlass className="ot-card-search-icon" aria-hidden="true" />
                <input
                  type="text"
                  className="ot-card-search-input"
                  value={searchInput}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    setSearchInput(value);
                    setAppliedSearch(value.trim().toLowerCase());
                    setCurrentPage(1);
                  }}
                  placeholder="Search e.g. Bachan Singh"
                  aria-label="Search orders by card name"
                />
                {(searchInput || appliedSearch) && (
                  <button
                    type="button"
                    className="ot-card-search-clear"
                    onClick={() => {
                      setSearchInput("");
                      setAppliedSearch("");
                      setCurrentPage(1);
                    }}
                    aria-label="Clear card-name search"
                    title="Clear search"
                  >
                    <HiXMark aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <div className="ot-filters">
              {/* <select
                className="ot-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">All Statuses</option>
                {filteredStatusOptions.map((status) => (
                  <option key={status.id} value={status.name}>
                    {status.name}
                  </option>
                ))}
              </select> */}

              <div className="ot-date-wrap">
                <label className="ot-date-label">From</label>
                <input
                  type="date"
                  className="ot-date-input"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              <div className="ot-date-wrap">
                <label className="ot-date-label">To</label>
                <input
                  type="date"
                  className="ot-date-input"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="ot-table-wrap">
            <table className="ot-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Card Name</th>
                  <th>Items</th>
                  <th>FOC</th>
                  <th>Created At</th>
                  <th>Delivery Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isOrdersLoading ? (
                  <tr>
                    <td colSpan={tableColumnCount}>
                      <div className="order-loading-state">
                        <span className="order-loading-spinner" />
                        <span>Loading orders...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedOrders.length > 0 ? (
                  paginatedOrders.map((order) => (
                    <tr key={order.id} className={order.is_foc ? "ot-foc-row" : ""}>
                      <td className="ao-cell-id">{order.order_number}</td>
                      <td className="ao-cell-name">{order.card_name}</td>
                      <td>{order.items_count ?? order.items?.length ?? 0}</td>
                      <td>
                        {order.is_foc ? (
                          <span className="ot-foc-badge">FOC</span>
                        ) : (
                          <span className="ot-foc-empty">-</span>
                        )}
                      </td>
                      <td>{formatCreatedDateTime(order.created_at)}</td>
                      <td>{order.delivery_date}</td>
                      <td>
                        <span className={`ot-badge ot-badge-${normalizeStatusClass(order.status_display || "unknown")}`}>
                          {order.status_display || "Unknown"}
                        </span>
                      </td>
                      <td>
                        <div className="ao-row-actions">
                          <button type="button" className="ao-btn-icon view" onClick={() => fetchOrderDetails(order.id)} title="View Order">
                            <HiEye size={20} />
                          </button>
                          {showTrackColumn && (
                            <button type="button" className="ao-btn-icon track" onClick={() => handleTrack(order)} title="Track Order">
                              <HiArrowPath size={20} />
                            </button>
                          )}
                          <button type="button" className="ao-btn-icon download" onClick={() => downloadExcel(order)} title="Download Order">
                            <HiArrowDownTray size={20} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                <td colSpan={tableColumnCount} className="ot-empty">No accepted or rejected orders found for this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredOrders.length > itemsPerPage && (
            <div className="ot-pagination">
              <button
                type="button"
                className="ot-pg-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => prev - 1)}
              >
                ← Prev
              </button>
              <span className="ot-pg-info">
                {currentPage} / {Math.ceil(filteredOrders.length / itemsPerPage)}
              </span>
              <button
                type="button"
                className="ot-pg-btn"
                disabled={currentPage === Math.ceil(filteredOrders.length / itemsPerPage)}
                onClick={() => setCurrentPage((prev) => prev + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {showDetails && orderDetails && (
        <div className="ao-detail ot-detail-scope">
          <div className="ao-d-nav">
            <button type="button" className="ao-d-back" onClick={() => setShowDetails(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 13L5 8l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back to Tracking
            </button>
            <div className="ao-d-actions">
              <button type="button" className="ao-d-export" onClick={() => downloadExcel(orderDetails)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8m0 0L4 6.5M7 9l3-2.5M2.5 12h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Export Excel
              </button>
            </div>
          </div>

          <PartyHeader order={orderDetails} />

          <div className="ao-d-items">
            <div className="ao-d-items-head">
              <span className="ao-d-items-title">Items</span>
              <span className="ao-d-items-count">{selectedItems.length}</span>
              <span className="ao-d-items-title" style={{ marginLeft: "auto", marginRight: "16px" }}>
                Total Ltrs: {totalLtrs.toFixed(2)}
              </span>
            </div>
            <div className="ao-d-items-scroll">
              <ItemSection items={selectedItems} />
              <table className="ot-items-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item Code</th>
                    <th style={{ minWidth: '250px' }}>Item Name</th>
                    <th>Category</th>
                    <th>Scheme</th>
                    <th>Scheme Qty</th>
                    <th>Qty</th>
                    <th>Pcs</th>
                    <th>Boxes</th>
                    <th>Ltrs</th>
                    {/* <th>Scheme Ltrs</th> */}
                    <th>Total Ltrs</th>
                    <th>Price List (Basic)</th>
                    <th>Basic Price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.length > 0 ? (
                    selectedItems.map((item, index) => {
                      const schemes = getOrderItemSchemes(item);

                      return (
                      <tr key={`${item.item_code}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{item.item_code}</td>
                        <td style={{ minWidth: '250px' }}>{item.item_name}</td>
                        <td>{item.category}</td>
                        <td colSpan={2}>
                          {schemes.length > 0 ? (
                            <div className="order-scheme-stack" aria-label="Applied schemes">
                              {schemes.map((scheme, schemeIndex) => (
                                <div className="order-scheme-chip" key={`${item.item_code}-scheme-${schemeIndex}`}>
                                  <span className="order-scheme-name">{scheme.name || "-"}</span>
                                  <span className="order-scheme-qty">Qty {scheme.qty || 0}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="order-scheme-empty">No scheme</span>
                          )}
                        </td>
                        <td>{item.qty}</td>
                        <td>{item.pcs}</td>
                        <td>{Number(item.boxes).toFixed(2)}</td>
                        <td>{item.ltrs}</td>
                        {/* <td>{item.scheme_name ? (item as any).scheme_ltrs || 0 : "—"}</td> */}
                        <td>{getOrderItemTotalLtrs(item).toFixed(2)}</td>
                        <td>{Number(item.price_list_basic).toFixed(2)}</td>
                        <td>{Number(item.basic_price).toFixed(2)}</td>
                        <td>{Number(item.total).toFixed(2)}</td>
                      </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={13} className="ot-empty">No items found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ao-d-summary">
            <div className="ao-d-sum-row">
              <span className="ao-d-sum-label">Total Ltrs</span>
              <span className="ao-d-sum-val">{totalLtrs.toFixed(2)}</span>
            </div>
            <div className="ao-d-sum-row">
              <span className="ao-d-sum-label">Subtotal</span>
              <span className="ao-d-sum-val">{subtotal.toFixed(2)}</span>
            </div>
            <div className="ao-d-sum-row">
              <span className="ao-d-sum-label">Tax</span>
              <span className="ao-d-sum-val">{taxTotal.toFixed(2)}</span>
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
              <span className="ao-d-sum-val">{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Order Log Timeline */}
          {mode === "billing" && orderLogs.length > 0 && (
            <div className="ao-d-items" style={{ marginTop: 16 }}>
              <div className="ao-d-items-head">
                <span className="ao-d-items-title">Order Log Timeline</span>
                <span className="ao-d-items-count">{buildOrderTimelineLogs(orderLogs, orderDetails).length}</span>
              </div>
              <div style={{ padding: "20px 24px" }}>
                {buildOrderTimelineLogs(orderLogs, orderDetails)
                  .map((log, index, sortedLogs) => {
                  const isLast = index === sortedLogs.length - 1;
                  const tone = getOrderLogTone(log.status_name, log.performed_by_name);
                  const isPending = tone === "pending" && isLast;
                  const dotColor =
                    tone === "approved" ? "#10B981" :
                    tone === "rejected" ? "#EF4444" :
                    tone === "pending" ? "#F59E0B" :
                    "#2563EB";
                  const displayRemark = getOrderLogDisplayRemark(log);

                  let pendingWithName = "";
                  if (isPending) {
                    const statusLower = (log.status_name || "").toLowerCase();
                    const isRateApprovalStatus = statusLower.includes("rate") || statusLower.includes("need approval");
                    if (isRateApprovalStatus) {
                      const pendingApprovers = (orderDetails?.rate_approvals || [])
                        .filter((ra: any) => (ra.status || "").toUpperCase() === "PENDING")
                        .map((ra: any) => ra.approver_name)
                        .filter(Boolean);
                      pendingWithName = pendingApprovers.length > 0 ? pendingApprovers.join(", ") : "";
                    }
                  }

                  return (
                    <div key={log.id} style={{ display: "flex", gap: 16, position: "relative", paddingBottom: isLast ? 0 : 24 }}>
                      {!isLast && (
                        <div style={{ position: "absolute", left: 11, top: 24, bottom: 0, width: 2, background: "#e2e8f0" }} />
                      )}
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                        {tone === "approved" ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        ) : tone === "rejected" ? (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        ) : (
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
                        )}
                      </div>
                      <div style={{ flex: 1, background: isPending ? "#FFFBEB" : "#f8fafc", border: `1px solid ${isPending ? "#FDE68A" : "#e2e8f0"}`, borderRadius: 10, padding: "14px 18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>{getOrderLogDisplayTitle(log, sortedLogs, orderLogs)}</span>
                          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{formatCreatedDateTime(log.created_at)}</span>
                        </div>
                        {isPending && pendingWithName ? (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ fontSize: "0.82rem", color: "#92400E", fontWeight: 600 }}>
                              Pending with: {pendingWithName}
                            </div>
                            <span style={{ display: "inline-block", marginTop: 4, background: "#FEF3C7", color: "#D97706", fontSize: "0.72rem", fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>
                              Awaiting Action
                            </span>
                          </div>
                        ) : (
                          <div style={{ fontSize: "0.82rem", color: "#475569" }}>
                            <span>Performed By: </span>
                            <strong>{log.performed_by_name || "\u2014"}</strong>
                          </div>
                        )}
                        {displayRemark ? (
                          <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#64748b", background: "#fff", padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                            {displayRemark}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showTrackModal && trackingOrder && (
        <div className="ao-modal-overlay">
          <div className="ao-track-modal">
            <div className="ao-track-header">
              <div>
                <div className="ao-track-title">Order Track</div>
                <div className="ao-track-subtitle">
                  {trackingOrder.order_number} &mdash; {trackingOrder.card_name}
                </div>
              </div>
              <button
                className="ao-track-close"
                onClick={() => {
                  setShowTrackModal(false);
                  setTrackingOrder(null);
                  setTrackingLogs([]);
                }}
              >
                &times;
              </button>
            </div>

            <div className="ao-track-body">
              {trackLogsLoading ? (
                <div className="ao-track-loading">
                  <span className="order-loading-spinner" />
                  <span>Loading logs...</span>
                </div>
              ) : trackingLogs.length === 0 ? (
                <div className="ao-track-empty">No tracking logs found.</div>
              ) : (
                <div className="ao-track-timeline">
                  {buildOrderTimelineLogs(trackingLogs, trackingOrder)
                    .map((log, index, arr) => {
                      const tone = getOrderLogTone(log.status_name, log.performed_by_name);
                      const displayRemark = getOrderLogDisplayRemark(log);
                      return (
                        <div key={log.id} className="ao-track-row">
                          <div className="ao-track-left">
                            <div className={`ao-track-dot ${tone}`}>
                              {tone === "approved" ? "\u2713" : tone === "rejected" ? "\u2715" : "\u2022"}
                            </div>
                            {index !== arr.length - 1 && <div className={`ao-track-line ${tone}`} />}
                          </div>
                          <div className={`ao-track-card ${tone}`}>
                            <div className="ao-track-card-head">
                              <strong>{getOrderLogDisplayTitle(log, arr, trackingLogs)}</strong>
                              <span>{formatCreatedDateTime(log.created_at)}</span>
                            </div>
                            <div className="ao-track-card-meta">
                              By: {log.performed_by_name || "Pending"}
                            </div>
                            {displayRemark && (
                              <div className="ao-track-card-remark">
                                Remark: {displayRemark}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

