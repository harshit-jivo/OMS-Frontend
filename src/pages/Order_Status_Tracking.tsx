import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { exportToExcel } from "../utils/excelExport";
import type { Order, OrderItem, OrderLog, RateApproval } from "../services/ordersService";
// import { sapService } from "../services/sapService"; // only the disabled quotation lookup used it
import {
  getOrderItemSchemes,
  getOrderItemTotalLtrs,
  ordersService,
} from "../services/ordersService";
import {
  buildOrderTimelineLogs,
  getOrderLogDisplayRemark,
  getOrderLogDisplayTitle,
  getOrderLogTone,
} from "../utils/orderTrackingTimeline";
/** Stable empty, so the four `useMemo` chains below settle. */
const NO_ORDERS: Order[] = [];

import "../styles/Order_Status_Tracking.css";
import "../styles/Auditor_Order.css";
import { useUILabels } from "../services/uiConfig";
import ItemSection from "../components/order-items/ItemSection";
import PartyHeader from "../components/order-items/PartyHeader";
import { Badge } from "@/components/ui/badge";
import { toneForStatus } from "@/components/ui/statusTone";
import { HiEye, HiArrowDownTray, HiArrowPath, HiMagnifyingGlass, HiXMark } from "react-icons/hi2";
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
const APPROVER_ACCEPTED_STATUS_CODES = [
  "APPROVED",
  "BILLING",
  "BILLING_PENDING",
  "BILLED",
  "COMPLETED",
];
// An order can only progress past rate approval if it was approved, so any
// downstream status counts as accepted for the rate approver view.
const APPROVER_ACCEPTED_KEYWORDS = ["billing", "billed", "audit", "completed", "quotation"];
const RATE_APPROVER_REJECTED_KEYWORDS = ["rate approver rejected", "rate rejected", "rejected"];
const RATE_APPROVER_TRACKING_FALLBACK_STATUS = "APPROVED";

/*
 * Was: slugify a status into a CSS class suffix (`ot-badge-pending-approval`).
 * Phase 2.2 replaced it with `toneForStatus`, which normalises the same
 * spellings and returns a colour instead. Commented out, not deleted, per the
 * standing instruction.
 */
/* const normalizeStatusClass = (status: string) => status.toLowerCase().replace(/\s+/g, "-"); */

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
    if (
      BILLING_REJECTED_CODES.includes(statusCode) ||
      BILLING_REJECTED_KEYWORDS.some((keyword) => normalized.includes(keyword))
    ) {
      return "other";
    }
    if (AUDITOR_REJECTED_CODES.includes(statusCode) || normalized === "rejected") {
      return "rejected";
    }
    if (
      AUDITOR_ACCEPTED_STATUS_CODES.includes(statusCode) ||
      ["billing", "approved", "accepted", "completed", "quotation"].some((keyword) =>
        normalized.includes(keyword),
      )
    ) {
      return "accepted";
    }
  }

  if (mode === "billing") {
    if (AUDITOR_REJECTED_CODES.includes(statusCode) || normalized === "rejected") {
      return "accepted";
    }
    if (
      BILLING_REJECTED_CODES.includes(statusCode) ||
      BILLING_REJECTED_KEYWORDS.some((keyword) => normalized.includes(keyword))
    ) {
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
  const { t } = useUILabels();
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
  // const fetchedQuotationIds = useRef<Set<number>>(new Set()); // disabled quotation path

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

  /*
   * `mode` is the query key — this page is mounted three times under three
   * routes, one per mode, and each now has its own cache entry instead of a
   * refetch on every navigation between them.
   *
   * The rate_approver fallback stays INSIDE the queryFn. Splitting it into a
   * second query would change behaviour: it fires only when the primary call
   * returns nothing, and the two together are one logical read.
   */
  const { data: orders = NO_ORDERS, isPending: isOrdersLoading } = useQuery({
    queryKey: ["orders", "status-tracking", mode],
    queryFn: async () => {
      let data = await ordersService.getStatusTrackingOrders(mode);
      if (mode === "rate_approver" && (!Array.isArray(data) || data.length === 0)) {
        data = await ordersService.getOrders(RATE_APPROVER_TRACKING_FALLBACK_STATUS);
      }
      return normalizeTrackingOrders(Array.isArray(data) ? data : [], mode);
    },
  });

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

      const matchesCardName =
        !appliedSearch ||
        String(order.card_name || "")
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

  const acceptedCount = dateFilteredOrders.filter(
    (order) => getDecisionType(order, mode) === "accepted",
  ).length;
  const rejectedCount = dateFilteredOrders.filter(
    (order) => getDecisionType(order, mode) === "rejected",
  ).length;

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const isCompletedStatus = (order?: Order | null) => {
    const s = String(order?.status_display || "").toLowerCase();
    return ["completed", "billing", "billed", "quotation", "approved", "accepted"].some((k) =>
      s.includes(k),
    );
  };

  const applyQuotationNumber = (order: Order, quotationNo?: string) =>
    quotationNo && quotationNo !== order.sap_doc_number
      ? { ...order, sap_doc_number: quotationNo }
      : order;

  // Sales Quotation — DISABLED 2026-08-27, the flow is closed and its backend
  // routes are commented out. Flip to true here and re-enable
  // `/sap/quotation-log/<id>/` to restore the per-order fallback lookup.
  const QUOTATION_FLOW_ENABLED = false;

  /* Sales Quotation — DISABLED 2026-08-27. This patched the fetched order array
     in place after a per-order quotation lookup; `QUOTATION_FLOW_ENABLED` is
     false and `resolveQuotationNumber` returns before ever reaching it, so it
     has no callers. Kept rather than deleted, per the repo's rule on removals.
  const cacheQuotationNumber = (orderId: number, quotationNo?: string) => {
    if (!quotationNo) return;
    setOrders((prev) =>
      prev.map((item) => (item.id === orderId ? { ...item, sap_doc_number: quotationNo } : item)),
    );
  };
  */

  const resolveQuotationNumber = async (order: Order) => {
    const existingValue = String(order.sap_doc_number || "").trim();
    if (existingValue) return existingValue;
    if (!isCompletedStatus(order)) return "";

    // Sales Quotation — DISABLED 2026-08-27, the flow is closed. Only the
    // per-order FALLBACK fetch is switched off; historical numbers still show,
    // because `OrderListView` already resolves `sap_doc_number` from
    // SalesQuotationLog when it builds the list (orders/views.py, the
    // `sap_doc_map` block). That table is kept precisely so this keeps working.
    //
    // What is gone is the extra round trip for orders the list could not
    // resolve, which would now 404 against the commented-out
    // `/sap/quotation-log/<id>/` route.
    if (!QUOTATION_FLOW_ENABLED) return "";

    /* Unreachable while QUOTATION_FLOW_ENABLED is false — the early return
       above fires first. Restored together with `cacheQuotationNumber` and the
       `/sap/quotation-log/<id>/` route if the flow is ever re-opened.
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
    */
    return "";
  };

  /* Sales Quotation — DISABLED 2026-08-27, and this effect is the reason it had
     to go rather than merely be flagged. `paginatedOrders` is recomputed on
     every render (it is a `.slice`, not a memo), so this ran after every single
     one, and it reached `setOrders` through `cacheQuotationNumber` — a
     `react-hooks/set-state-in-effect` violation that was invisible only because
     the fetch effect above it made the component unanalysable.
  useEffect(() => {
    const fetchMissingQuotations = async () => {
      const ordersToFetch = paginatedOrders.filter(
        (o) =>
          !String(o.sap_doc_number || "").trim() &&
          isCompletedStatus(o) &&
          !fetchedQuotationIds.current.has(o.id),
      );
      if (ordersToFetch.length === 0) return;

      ordersToFetch.forEach((o) => fetchedQuotationIds.current.add(o.id));
      await Promise.all(ordersToFetch.map((order) => resolveQuotationNumber(order)));
    };
    void fetchMissingQuotations();
  }, [paginatedOrders]);
  */

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

  const totalLtrs = selectedItems.reduce((sum, item) => sum + getOrderItemTotalLtrs(item), 0);
  const subtotal = selectedItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const taxTotal = selectedItems.reduce(
    (sum, item) => sum + (Number(item.total || 0) * Number(item.tax_rate || 0)) / 100,
    0,
  );
  const grandTotal = subtotal + taxTotal;

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
    let excelData: Record<string, unknown>[] = [];

    if (exportOrder.items && exportOrder.items.length > 0) {
      excelData = exportOrder.items.flatMap((item: OrderItem) => {
        const schemes = getOrderItemSchemes(item);
        const baseRow = {
          "Order Number": exportOrder.order_number,
          "Card Code": exportOrder.card_code,
          "Card Name": exportOrder.card_name,
          "Delivery Date": exportOrder.delivery_date,
          Status: exportOrder.status_display,
          ...(String(exportOrder.sap_doc_number || "").trim()
            ? { "Quotation No": exportOrder.sap_doc_number }
            : {}),
          "Bill To": exportOrder.bill_to_address,
          "Ship To": exportOrder.ship_to_address,
          "Item Code": item.item_code,
          "Item Name": item.item_name,
          Qty: item.qty,
          Boxes: item.boxes,
          Liters: item.ltrs,
          "Total Ltrs": getOrderItemTotalLtrs(item),
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
        ...(String(exportOrder.sap_doc_number || "").trim()
          ? { "Quotation No": exportOrder.sap_doc_number }
          : {}),
        "Bill To": exportOrder.bill_to_address,
        "Ship To": exportOrder.ship_to_address,
        "Price List (Basic)": "",
        "Basic Price": "",
      });
    }

    await exportToExcel(excelData, {
      fileName: `Tracked_Order_${exportOrder.order_number}.xlsx`,
      sheetName: "Status Tracking",
    });
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
                <input aria-label="From"
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
                <input aria-label="To"
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
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Card Name</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>FOC</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isOrdersLoading ? (
                  <TableRow>
                    <TableCell colSpan={tableColumnCount}>
                      <TableSkeleton columns={8} label="Loading orders" />
                    </TableCell>
                  </TableRow>
                ) : paginatedOrders.length > 0 ? (
                  paginatedOrders.map((order) => (
                    <TableRow key={order.id} className={order.is_foc ? "ot-foc-row" : ""}>
                      <TableCell className="ao-cell-id">{order.order_number}</TableCell>
                      <TableCell className="ao-cell-name">{order.card_name}</TableCell>
                      <TableCell>{order.items_count ?? order.items?.length ?? 0}</TableCell>
                      <TableCell>
                        {order.is_foc ? (
                          <span className="ot-foc-badge">FOC</span>
                        ) : (
                          <span className="ot-foc-empty">-</span>
                        )}
                      </TableCell>
                      <TableCell>{formatCreatedDateTime(order.created_at)}</TableCell>
                      <TableCell>{order.delivery_date}</TableCell>
                      <TableCell>
                        <Badge tone={toneForStatus(order.status_display)}>
                          {order.status_display || "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="ao-row-actions">
                          <button
                            type="button"
                            className="ao-btn-icon view"
                            onClick={() => fetchOrderDetails(order.id)}
                            title="View Order"
                          >
                            <HiEye size={20} />
                          </button>
                          {showTrackColumn && (
                            <button
                              type="button"
                              className="ao-btn-icon track"
                              onClick={() => handleTrack(order)}
                              title="Track Order"
                            >
                              <HiArrowPath size={20} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="ao-btn-icon download"
                            onClick={() => downloadExcel(order)}
                            title="Download Order"
                          >
                            <HiArrowDownTray size={20} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={tableColumnCount} className="ot-empty">
                      No accepted or rejected orders found for this filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

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
        <div className="ao-detail ot-detail-scope">
          <div className="ao-d-nav">
            <button type="button" className="ao-d-back" onClick={() => setShowDetails(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 13L5 8l5-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back to Tracking
            </button>
            <div className="ao-d-actions">
              <button
                type="button"
                className="ao-d-export"
                onClick={() => downloadExcel(orderDetails)}
              >
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
            </div>
          </div>

          <PartyHeader order={orderDetails} />

          <div className="ao-d-items">
            <div className="ao-d-items-head">
              <span className="ao-d-items-title">Items</span>
              <span className="ao-d-items-count">{selectedItems.length}</span>
              <span className="ao-d-items-title ot-log-total-ltrs">
                Total Ltrs: {totalLtrs.toFixed(2)}
              </span>
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
                    {/* <TableHead>Scheme Ltrs</TableHead> */}
                    <TableHead>Total Ltrs</TableHead>
                    <TableHead>{t("price_list", "Price List (Basic)")}</TableHead>
                    <TableHead>Basic Price</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedItems.length > 0 ? (
                    selectedItems.map((item, index) => {
                      const schemes = getOrderItemSchemes(item);

                      return (
                        <TableRow key={`${item.item_code}-${index}`}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{item.item_code}</TableCell>
                          <TableCell className="app-col-item">{item.item_name}</TableCell>
                          <TableCell>{item.category}</TableCell>
                          <TableCell colSpan={2}>
                            {schemes.length > 0 ? (
                              <div className="order-scheme-stack" aria-label="Applied schemes">
                                {schemes.map((scheme, schemeIndex) => (
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
                          <TableCell>{item.qty}</TableCell>
                          <TableCell>{item.pcs}</TableCell>
                          <TableCell>{Number(item.boxes).toFixed(2)}</TableCell>
                          <TableCell>{item.ltrs}</TableCell>
                          {/* <TableCell>{item.scheme_name ? (item as any).scheme_ltrs || 0 : "—"}</TableCell> */}
                          <TableCell>{getOrderItemTotalLtrs(item).toFixed(2)}</TableCell>
                          <TableCell>{Number(item.price_list_basic).toFixed(2)}</TableCell>
                          <TableCell>{Number(item.basic_price).toFixed(2)}</TableCell>
                          <TableCell>{Number(item.total).toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={13} className="ot-empty">
                        No items found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
              <span className="ao-d-sum-val">{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Order Log Timeline */}
          {mode === "billing" && orderLogs.length > 0 && (
            <div className="ao-d-items ot-log-section">
              <div className="ao-d-items-head">
                <span className="ao-d-items-title">Order Log Timeline</span>
                <span className="ao-d-items-count">
                  {buildOrderTimelineLogs(orderLogs, orderDetails).length}
                </span>
              </div>
              <div className="ot-log-list">
                {buildOrderTimelineLogs(orderLogs, orderDetails).map((log, index, sortedLogs) => {
                  const isLast = index === sortedLogs.length - 1;
                  const tone = getOrderLogTone(log.status_name, log.performed_by_name);
                  const isPending = tone === "pending" && isLast;
                  const displayRemark = getOrderLogDisplayRemark(log);

                  let pendingWithName = "";
                  if (isPending) {
                    const statusLower = (log.status_name || "").toLowerCase();
                    const isRateApprovalStatus =
                      statusLower.includes("rate") || statusLower.includes("need approval");
                    if (isRateApprovalStatus) {
                      const pendingApprovers = (orderDetails?.rate_approvals || [])
                        .filter((ra: RateApproval) => (ra.status || "").toUpperCase() === "PENDING")
                        .map((ra: RateApproval) => ra.approver_name)
                        .filter(Boolean);
                      pendingWithName =
                        pendingApprovers.length > 0 ? pendingApprovers.join(", ") : "";
                    }
                  }

                  return (
                    <div
                      key={log.id}
                      className={`ot-log-row${isLast ? " is-last" : ""}`}
                    >
                      {!isLast && <div className="ot-log-connector" />}
                      <div className={`ot-log-dot ot-log-dot--${tone}`}>
                        {tone === "approved" ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2.5 6L5 8.5L9.5 3.5"
                              stroke="#fff"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : tone === "rejected" ? (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path
                              d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5"
                              stroke="#fff"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : (
                          <div className="ot-log-dot-inner" />
                        )}
                      </div>
                      <div className={`ot-log-card${isPending ? " ot-log-card--pending" : ""}`}>
                        <div className="ot-log-card-head">
                          <span className="ot-log-title">
                            {getOrderLogDisplayTitle(log, sortedLogs, orderLogs)}
                          </span>
                          <span className="ot-log-time">
                            {formatCreatedDateTime(log.created_at)}
                          </span>
                        </div>
                        {isPending && pendingWithName ? (
                          // Unreachable by any fixture \u2014 needs a log whose tone is
                          // "pending" AND is the last entry, on an order carrying
                          // `rate_approvals`. Left inline; see the test above.
                          <div style={{ marginTop: 4 }}>
                            <div style={{ fontSize: "0.82rem", color: "#92400E", fontWeight: 600 }}>
                              Pending with: {pendingWithName}
                            </div>
                            <span
                              className="app-chip-amber"
                            >
                              Awaiting Action
                            </span>
                          </div>
                        ) : (
                          <div className="ot-log-performed">
                            <span>Performed By: </span>
                            <strong>{log.performed_by_name || "\u2014"}</strong>
                          </div>
                        )}
                        {displayRemark ? (
                          <div className="ot-log-remark">
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

      <Dialog
        open={Boolean(showTrackModal && trackingOrder)}
        onOpenChange={(next) => {
          if (!next) setShowTrackModal(false);
        }}
      >
        {showTrackModal && trackingOrder && (
          <DialogContent
            title="Order tracking"
            variant="bare"
            size="auto"
            showClose={false}
            className="ao-track-modal"
          >
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
                  {buildOrderTimelineLogs(trackingLogs, trackingOrder).map((log, index, arr) => {
                    const tone = getOrderLogTone(log.status_name, log.performed_by_name);
                    const displayRemark = getOrderLogDisplayRemark(log);
                    return (
                      <div key={log.id} className="ao-track-row">
                        <div className="ao-track-left">
                          <div className={`ao-track-dot ${tone}`}>
                            {tone === "approved"
                              ? "\u2713"
                              : tone === "rejected"
                                ? "\u2715"
                                : "\u2022"}
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
                            <div className="ao-track-card-remark">Remark: {displayRemark}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
