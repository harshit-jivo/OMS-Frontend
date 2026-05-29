import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import { ordersService } from "../services/ordersService";
import type { OrderStockCheck, OrderStockCheckItem } from "../services/ordersService";
import "../styles/Order_Stock_Check.css";

const itemsPerPage = 10;

type StockStatus = "Available" | "Partial" | "Shortage";
type StatusFilter = "ALL" | StockStatus;
type StockPopupType = "Partial" | "Shortage" | "Short Items";

const toNumber = (value: string | number | null | undefined) => Number(value || 0);

const formatDate = (value?: string | null) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const normalizeStockOrder = (order: OrderStockCheck): OrderStockCheck => ({
  ...order,
  date: formatDate(order.date),
  items: Array.isArray(order.items)
    ? order.items.map((item) => ({
        ...item,
        required_qty: toNumber(item.required_qty),
        available_stock: toNumber(item.available_stock),
      }))
    : [],
});

const getItemStatus = (item: OrderStockCheckItem) =>
  item.available_stock >= item.required_qty
    ? "OK"
    : item.available_stock > 0
      ? "Short"
      : "Out";

const getOrderStatus = (order: OrderStockCheck): StockStatus => {
  const okCount = order.items.filter((item) => getItemStatus(item) === "OK").length;

  if (order.items.length === 0 || okCount === order.items.length) return "Available";
  if (okCount === 0) return "Shortage";
  return "Partial";
};

const getStatusClass = (status: string) => {
  if (status === "Available" || status === "OK") return "is-ok";
  if (status === "Partial" || status === "Short") return "is-partial";
  return "is-short";
};

const getResultText = (order: OrderStockCheck) => {
  const ok = order.items.filter((item) => getItemStatus(item) === "OK").length;
  const short = order.items.length - ok;

  return `${ok} OK / ${short} Short`;
};

export default function Order_Stock_Check() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [orders, setOrders] = useState<OrderStockCheck[]>([]);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [stockPopup, setStockPopup] = useState<StockPopupType | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const ordersData = await ordersService.getOrderStockCheck();
      const nextOrders = Array.isArray(ordersData)
        ? ordersData.map(normalizeStockOrder)
        : [];

      setOrders(nextOrders);
      setSelectedOrderNumber((current) => current || nextOrders[0]?.order_number || "");
    } catch (fetchError) {
      console.error("Error loading orders for stock check:", fetchError);
      setOrders([]);
      setSelectedOrderNumber("");
      setError("Unable to load live stock from SAP.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const metrics = useMemo(() => {
    const available = orders.filter((order) => getOrderStatus(order) === "Available").length;
    const partial = orders.filter((order) => getOrderStatus(order) === "Partial").length;
    const shortage = orders.filter((order) => getOrderStatus(order) === "Shortage").length;
    const shortLines = orders.reduce(
      (sum, order) => sum + order.items.filter((item) => getItemStatus(item) !== "OK").length,
      0,
    );

    return { available, partial, shortage, shortLines };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch = [
        order.order_number,
        order.customer,
        order.dispatch_from,
        order.status,
      ].some((value) => value.toLowerCase().includes(term));
      const matchesType = typeFilter === "ALL" || order.order_type === typeFilter;
      const orderStatus = getOrderStatus(order);
      const matchesStatus = statusFilter === "ALL" || orderStatus === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [orders, search, statusFilter, typeFilter]);

  const selectedOrder =
    filteredOrders.find((order) => order.order_number === selectedOrderNumber) ||
    filteredOrders[0];
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = useMemo(
    () =>
      filteredOrders.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage,
      ),
    [currentPage, filteredOrders],
  );
  const pageStart =
    filteredOrders.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const pageEnd = Math.min(currentPage * itemsPerPage, filteredOrders.length);
  const selectedStatus = selectedOrder ? getOrderStatus(selectedOrder) : "Available";
  const totalItems = selectedOrder?.items.length || 0;
  const shortItems =
    selectedOrder?.items.filter((item) => getItemStatus(item) !== "OK").length || 0;
  const totalRequired = selectedOrder?.items.reduce(
    (sum, item) => sum + item.required_qty,
    0,
  ) || 0;
  const totalAvailable = selectedOrder?.items.reduce(
    (sum, item) => sum + item.available_stock,
    0,
  ) || 0;

  const popupOrders = useMemo(
    () =>
      stockPopup === "Partial" || stockPopup === "Shortage"
        ? orders.filter((order) => getOrderStatus(order) === stockPopup)
        : [],
    [orders, stockPopup],
  );
  const popupShortItems = useMemo(
    () =>
      orders.flatMap((order) =>
        order.items
          .filter((item) => getItemStatus(item) !== "OK")
          .map((item) => ({
            order,
            item,
            shortage: item.required_qty - item.available_stock,
          })),
      ),
    [orders],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const metricCards = [
    { label: "Orders", value: orders.length, tone: "neutral", icon: FiPackage },
    { label: "Available", value: metrics.available, tone: "ok", icon: FiCheckCircle },
    { label: "Partial", value: metrics.partial, tone: "partial", icon: FiAlertTriangle, popup: "Partial" },
    { label: "Shortage", value: metrics.shortage, tone: "short", icon: FiXCircle, popup: "Shortage" },
    { label: "Short Items", value: metrics.shortLines, tone: "short", icon: FiPackage, popup: "Short Items" },
  ];

  return (
    <div className="app-page stock-check-page">
      <div className="stock-check-header">
        <div>
          <h1 className="app-page-title">Order Stock Check</h1>
          <p className="stock-check-subtitle">
            Review SAP stock availability against approved orders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchOrders()}
          disabled={loading}
          className="stock-refresh-button"
        >
          <FiRefreshCw className={loading ? "stock-spin" : ""} />
          {loading ? "Refreshing..." : "Refresh Stock"}
        </button>
      </div>

      <div className="stock-metrics">
        {metricCards.map(({ label, value, tone, icon: Icon, popup }) => {
          const MetricTag = popup ? "button" : "div";

          return (
          <MetricTag
            key={label}
            type={popup ? "button" : undefined}
            className={`stock-metric stock-metric-${tone}${popup ? " stock-metric-clickable" : ""}`}
            onClick={popup ? () => setStockPopup(popup as StockPopupType) : undefined}
          >
            <div className="stock-metric-icon">
              <Icon />
            </div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </MetricTag>
          );
        })}
      </div>

      {stockPopup ? (
        <div className="stock-popup-backdrop" onClick={() => setStockPopup(null)}>
          <div
            className="stock-popup"
            role="dialog"
            aria-modal="true"
            aria-label={`${stockPopup} stock details`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="stock-popup-head">
              <div>
                <h2>{stockPopup}</h2>
                <p>
                  {stockPopup === "Short Items"
                    ? `${popupShortItems.length} item lines need stock`
                    : `${popupOrders.length} orders found`}
                </p>
              </div>
              <button type="button" onClick={() => setStockPopup(null)} aria-label="Close stock details">
                <FiX />
              </button>
            </div>
            <div className="stock-popup-body">
              {stockPopup === "Short Items" ? (
                popupShortItems.length === 0 ? (
                  <div className="stock-empty">No short items found.</div>
                ) : (
                  popupShortItems.map(({ order, item, shortage }) => (
                    <div className="stock-popup-row" key={`${order.order_number}-${item.item_code}-${item.category}`}>
                      <div>
                        <strong>{item.item_name}</strong>
                        <span>{item.item_code} • {item.category}</span>
                        <span>{order.order_number} • {order.customer}</span>
                      </div>
                      <div className="stock-popup-qty">
                        <span>Req {item.required_qty}</span>
                        <span>Avail {item.available_stock}</span>
                        <b>-{shortage}</b>
                      </div>
                    </div>
                  ))
                )
              ) : popupOrders.length === 0 ? (
                <div className="stock-empty">No {stockPopup.toLowerCase()} orders found.</div>
              ) : (
                popupOrders.map((order) => {
                  const orderShortItems = order.items.filter((item) => getItemStatus(item) !== "OK");

                  return (
                    <div className="stock-popup-row" key={order.order_number}>
                      <div>
                        <strong>{order.order_number}</strong>
                        <span>{order.customer} • {order.dispatch_from}</span>
                        <span>{orderShortItems.length} short item{orderShortItems.length === 1 ? "" : "s"}</span>
                      </div>
                      <button
                        type="button"
                        className="stock-popup-select"
                        onClick={() => {
                          setSelectedOrderNumber(order.order_number);
                          setStockPopup(null);
                        }}
                      >
                        View
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="stock-toolbar">
        <div className="stock-search">
          <FiSearch />
          <input
            type="text"
            placeholder="Search order, party, employee..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="stock-filters">
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="ALL">All Orders</option>
            <option value="Party">Party</option>
            <option value="Staff">Staff</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="ALL">All Stock Results</option>
            <option value="Available">Available</option>
            <option value="Partial">Partial</option>
            <option value="Shortage">Shortage</option>
          </select>
        </div>
      </div>

      <div className="stock-layout">
        <div className="stock-panel stock-orders-panel">
          <div className="stock-panel-head">
            <strong>Orders</strong>
            <span>
              {filteredOrders.length} matching
            </span>
          </div>
          {loading ? (
            <div className="stock-empty">Loading live stock...</div>
          ) : error ? (
            <div className="stock-error">
              <FiAlertTriangle />
              <span>{error}</span>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="stock-empty">No orders found.</div>
          ) : (
            <div className="stock-table-wrap">
              <table className="stock-table">
              <thead>
                <tr>
                  {["Order", "Party/Employee", "Type", "Lines", "Stock"].map((heading) => (
                    <th key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order) => {
                  const status = getOrderStatus(order);
                  const isActive = order.order_number === selectedOrder?.order_number;

                  return (
                    <tr
                      key={order.order_number}
                      onClick={() => setSelectedOrderNumber(order.order_number)}
                      className={isActive ? "is-active" : ""}
                    >
                      <td>
                        <div className="stock-order-number">{order.order_number}</div>
                        <div className="stock-muted">{order.date}</div>
                      </td>
                      <td>
                        <div className="stock-customer">{order.customer}</div>
                        <div className="stock-muted">{order.dispatch_from}</div>
                      </td>
                      <td>{order.order_type}</td>
                      <td>{order.items.length}</td>
                      <td>
                        <span className={`stock-badge ${getStatusClass(status)}`}>
                          {status}
                        </span>
                        <div className="stock-muted stock-result">{getResultText(order)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          )}
          {!loading && !error && filteredOrders.length > 0 && (
            <div className="stock-pagination">
              <span>
                Showing {pageStart}-{pageEnd} of {filteredOrders.length} orders
              </span>
              <div>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  <FiChevronLeft />
                </button>
                <span>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                >
                  <FiChevronRight />
                </button>
              </div>
            </div>
          )}
        </div>

        {selectedOrder ? (
          <div className="stock-panel stock-detail-panel">
            <div className="stock-detail-head">
              <div>
                <div className="stock-detail-title">{selectedOrder.order_number}</div>
                <div className="stock-detail-meta">
                  {selectedOrder.customer} • {selectedOrder.date} • {selectedOrder.dispatch_from}
                </div>
              </div>
              <span className={`stock-badge ${getStatusClass(selectedStatus)}`}>
                {selectedStatus}
              </span>
            </div>

            <div className="stock-summary-grid">
              {[
                ["Items", totalItems],
                ["OK", totalItems - shortItems],
                ["Short", shortItems],
                ["Req / Avail", `${totalRequired} / ${totalAvailable}`],
              ].map(([label, value]) => (
                <div className="stock-summary-item" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className="stock-table-wrap">
              <table className="stock-table stock-lines-table">
              <thead>
                <tr>
                  {["Product", "Required", "Available", "Diff", "Status"].map((heading) => (
                    <th key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedOrder.items.map((item, index) => {
                  const itemStatus = getItemStatus(item);
                  const diff = item.available_stock - item.required_qty;

                  return (
                    <tr
                      key={`${selectedOrder.order_number}-${item.item_code}-${item.category}-${index}`}
                      className={itemStatus === "OK" ? "" : "is-warning-row"}
                    >
                      <td>
                        <div className="stock-product-name">{item.item_name}</div>
                        <div className="stock-muted">{item.item_code} • {item.category}</div>
                      </td>
                      <td>{item.required_qty}</td>
                      <td className="stock-strong-cell">{item.available_stock}</td>
                      <td className={diff < 0 ? "stock-negative" : "stock-positive"}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                      <td>
                        <span className={`stock-badge ${getStatusClass(itemStatus)}`}>
                          {itemStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        ) : (
          <div className="stock-panel stock-empty-detail">
            Select an order to view item availability.
          </div>
        )}
      </div>
    </div>
  );
}
