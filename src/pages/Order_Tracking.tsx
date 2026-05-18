import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ordersService } from "../services/ordersService";
import type { Order, OrderLog } from "../services/ordersService";
import { loadCurrentUserOrders } from "../utils/orderHistory";
import "../styles/Order_Tracking.css";

export default function Order_Tracking() {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [logs, setLogs] = useState<OrderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [tracker, setTracker] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  
  useEffect(() => {
    void fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await loadCurrentUserOrders();
      setOrders(data || []);
    } catch (error) {
      console.log("Error fetching orders:", error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (location.state?.openOrderId && orders.length > 0) {
      const targetOrder = orders.find(o => o.id === location.state.openOrderId);
      if (targetOrder) {
        void handleTrack(targetOrder);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state?.openOrderId, orders, location.pathname, navigate]);

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(orders.map((o) => o.status_display).filter(Boolean));
    return Array.from(statuses).sort() as string[];
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        if (statusFilter) {
          return order.status_display === statusFilter;
        }
        return true;
      })
      .sort((a, b) => {
        const first = new Date(b.created_at || "").getTime();
        const second = new Date(a.created_at || "").getTime();

        if (Number.isNaN(first) || Number.isNaN(second)) {
          return String(b.order_number || "").localeCompare(
            String(a.order_number || "")
          );
        }

        return first - second;
      });
  }, [orders, statusFilter]);

  const orderedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const first = new Date(a.created_at || "").getTime();
      const second = new Date(b.created_at || "").getTime();

      if (Number.isNaN(first) && Number.isNaN(second)) {
        return a.id - b.id;
      }

      if (Number.isNaN(first)) return 1;
      if (Number.isNaN(second)) return -1;

      return first - second;
    });
  }, [logs]);

  const visibleLogs = useMemo(() => {
    const latestLogByPerformer = new Map<string, OrderLog>();
    const performerLogIds = new Set<number>();
    const getStageKey = (log: OrderLog) => {
      const statusName = String(log.status_name || "").toLowerCase();

      if (statusName.includes("billing")) return "billing";
      if (statusName.includes("auditor")) return "auditor";
      if (statusName.includes("rate")) return "rate";
      if (statusName.includes("approval") || statusName.includes("approve")) return "approval";
      if (statusName.includes("complete")) return "completed";
      if (statusName.includes("reject")) return "rejected";

      return statusName.trim();
    };

    const isOutcomeForPendingStage = (pendingLog: OrderLog, laterLog: OrderLog) => {
      const pendingStage = getStageKey(pendingLog);
      const laterStage = getStageKey(laterLog);
      const laterStatus = String(laterLog.status_name || "").toLowerCase();

      if (laterStage === pendingStage) {
        return true;
      }

      const isDecision =
        laterStatus.includes("reject") ||
        laterStatus.includes("approved") ||
        laterStatus.includes("accepted") ||
        laterStatus.includes("complete");

      return isDecision && pendingStage === "auditor";
    };

    orderedLogs.forEach((log) => {
      const performer = String(log.performed_by_name || "").trim().toLowerCase();

      if (!performer || performer === "pending" || performer === "system") {
        return;
      }

      const currentLatest = latestLogByPerformer.get(performer);
      const currentTime = new Date(log.created_at || "").getTime();
      const latestTime = currentLatest
        ? new Date(currentLatest.created_at || "").getTime()
        : Number.NaN;

      if (
        !currentLatest ||
        (Number.isNaN(latestTime) && log.id > currentLatest.id) ||
        currentTime > latestTime ||
        (currentTime === latestTime && log.id > currentLatest.id)
      ) {
        latestLogByPerformer.set(performer, log);
      }
    });

    latestLogByPerformer.forEach((log) => {
      performerLogIds.add(log.id);
    });

    return orderedLogs.filter((log) => {
      const performer = String(log.performed_by_name || "").trim().toLowerCase();
      const isPendingLog = !performer || performer === "pending" || performer === "system";

      if (isPendingLog) {
        const logTime = new Date(log.created_at || "").getTime();

        return !orderedLogs.some((otherLog) => {
          const otherPerformer = String(otherLog.performed_by_name || "").trim().toLowerCase();
          const otherTime = new Date(otherLog.created_at || "").getTime();
          const isRealPerformer =
            otherPerformer && otherPerformer !== "pending" && otherPerformer !== "system";

          return (
            isRealPerformer &&
            isOutcomeForPendingStage(log, otherLog) &&
            (otherTime > logTime || (otherTime === logTime && otherLog.id > log.id))
          );
        });
      }

      return performerLogIds.has(log.id);
    });
  }, [orderedLogs]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("en-IN");
  };

  const isSentToAuditorLog = (log: OrderLog) => {
    const statusName = String(log.status_name || "").toLowerCase();
    const remarks = String(log.remarks || "").toLowerCase();

    return statusName.includes("billing") && remarks.includes("sent to auditor");
  };

  const getLogDisplayTitle = (log: OrderLog) => {
    const statusName = String(log.status_name || "").toLowerCase();
    const remarks = String(log.remarks || "").toLowerCase();

    if (statusName.includes("billing") && statusName.includes("reject")) {
      return "Billing Rejected";
    }

    if (
      statusName.includes("billing") &&
      (remarks.includes("edited") ||
        remarks.includes("resubmitted") ||
        remarks.includes("sent back to billing"))
    ) {
      return "Order Edited and Sent Back to Billing";
    }

    if (isSentToAuditorLog(log)) return "Accepted by Billing";

    return log.status_name;
  };

  const getLogDisplayRemark = (log: OrderLog) => {
    if (isSentToAuditorLog(log)) return "Sent to auditor";
    return log.remarks;
  };

  const getLogTone = (status: string, performedBy: string | null) => {
    const normalized = String(status || "").toLowerCase();
    const normalizedPerformer = String(performedBy || "").toLowerCase();

    const isPendingPerformer =
      !normalizedPerformer ||
      normalizedPerformer.includes("pending") ||
      normalizedPerformer.includes("system");

    if (normalized.includes("reject") || normalized.includes("cancel")) {
      return "rejected";
    }

    if (isPendingPerformer) {
      return "pending";
    }

    if (
      normalized.includes("approve") ||
      normalized.includes("accept") ||
      normalized.includes("bill") ||
      normalized.includes("complete")
    ) {
      return "approved";
    }

    return "progress";
  };

  const handleTrack = async (order: Order) => {
    setSelectedOrder(order);
    setTracker(true);
    setLogs([]);
    setLogsLoading(true);

    try {
      const response = await ordersService.getOrderLogs(order.id);
      setLogs(Array.isArray(response) ? response : []);
    } catch (error) {
      console.log("Error fetching order logs:", error);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleBack = () => {
    setTracker(false);
    setSelectedOrder(null);
    setLogs([]);
  };

  const handleEditOrder = (order: Order) => {
    navigate("/Add_Sales", {
      state: {
        editOrderId: order.id,
        returnTo: "/Order_Tracking",
        mode: "edit",
      },
    });
  };

  return (
    <div className="tracker-page">
      <div className="tracker-head">
        <h4>Order Tracker</h4>
      </div>

      {!tracker && (
        <div>
          <div className="tracker-list-head">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                height: 'var(--input-h, 40px)',
                padding: '0 12px',
                borderRadius: 'var(--radius-sm, 8px)',
                border: '1px solid #cbd5e1',
                backgroundColor: '#fff',
                color: '#0f172a',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 'var(--font-ui, 13px)',
                outline: 'none',
                minWidth: '180px'
              }}
            >
              <option value="">All Orders</option>
              {uniqueStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            {!loading && (
              <span className="tracker-count">Total: {filteredOrders.length}</span>
            )}
          </div>

          {loading ? (
            <div className="order-loading-state">
              <span className="order-loading-spinner" />
              <span>Loading orders...</span>
            </div>
          ) : filteredOrders.length > 0 ? (
            <div className="tracker-table-wrap">
              <table className="vo-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Card Code</th>
                    <th>Card Name</th>
                    <th>Created Date</th>
                    <th>Delivery Date</th>
                    <th>Status</th>
                    <th>Tracker</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.order_number}</td>
                        <td>{order.card_code}</td>
                        <td>{order.card_name}</td>
                        <td>{order.created_at ? new Date(order.created_at).toLocaleDateString("en-GB") : "—"}</td>
                        <td>{order.delivery_date}</td>
                        <td>
                          <span
                            className={`vo-badge vo-badge-${(
                              order.status_display || ""
                            )
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {order.status_display}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              className="tracker-btn"
                              onClick={() => void handleTrack(order)}
                            >
                              Track
                            </button>
                            {String(order.status_display || "").toLowerCase().includes("reject") && (
                              <button
                                type="button"
                                className="tracker-btn"
                                style={{ backgroundColor: "#ef4444" }}
                                onClick={() => handleEditOrder(order)}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="vo-empty" style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", margin: "20px 0" }}>No orders found</div>
          )}
        </div>
      )}

      {tracker && selectedOrder && (
        <div className="tracker-detail-card">
          <div className="tracker-detail-top">
            <button
              type="button"
              className="tracker-back-btn"
              onClick={handleBack}
            >
              Back
            </button>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {String(selectedOrder.status_display || "").toLowerCase().includes("reject") && (
                <button
                  type="button"
                  className="tracker-btn"
                  style={{ backgroundColor: "#ef4444" }}
                  onClick={() => handleEditOrder(selectedOrder)}
                >
                  Edit Order
                </button>
              )}
              <span
                className={`vo-badge vo-badge-${(
                  selectedOrder.status_display || ""
                )
                  .toLowerCase()
                  .replace(/\s+/g, "-")}`}
              >
                {selectedOrder.status_display}
              </span>
            </div>
          </div>

          <div className="tracker-summary-grid">
            <div>
              <p className="tracker-label">Order ID</p>
              <h5>{selectedOrder.order_number}</h5>
            </div>
            <div>
              <p className="tracker-label">Card Code</p>
              <p>{selectedOrder.card_code}</p>
            </div>
            <div>
              <p className="tracker-label">Card Name</p>
              <p>{selectedOrder.card_name}</p>
            </div>
            <div>
              <p className="tracker-label">Created Date</p>
              <p>{selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleDateString("en-GB") : "-"}</p>
            </div>
            <div>
              <p className="tracker-label">Delivery Date</p>
              <p>{selectedOrder.delivery_date || "-"}</p>
            </div>
            <div>
              <p className="tracker-label">PO Number</p>
              <p>{selectedOrder.po_number || "-"}</p>
            </div>
          </div>

          <div className="tracker-timeline">
            <h5>Order Log Timeline</h5>

            {logsLoading ? (
              <p className="vo-empty">Loading order logs...</p>
            ) : visibleLogs.length === 0 ? (
              <p className="vo-empty">No tracking logs found for this order.</p>
            ) : (
              visibleLogs.map((log, index) => {
                const tone = getLogTone(log.status_name, log.performed_by_name);
                const displayRemark = getLogDisplayRemark(log);

                return (
                  <div key={log.id} className="tracker-timeline-row">
                    <div className="tracker-timeline-left">
                      <div className={`tracker-dot ${tone}`}>
                        {tone === "approved"
                          ? "✓"
                          : tone === "rejected"
                            ? "✕"
                            : "•"}
                      </div>
                      {index !== visibleLogs.length - 1 ? (
                        <div className={`tracker-line ${tone}`} />
                      ) : null}
                    </div>

                    <div className={`tracker-log-card ${tone}`}>
                      <div className="tracker-log-head">
                        <h6>{getLogDisplayTitle(log)}</h6>
                        <span>{formatDateTime(log.created_at)}</span>
                      </div>

                      <p className="tracker-log-meta">
                        Performed By: {log.performed_by_name || "Pending"}
                      </p>

                      {displayRemark ? (
                        <p className="tracker-log-remarks">Remark: {displayRemark}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
