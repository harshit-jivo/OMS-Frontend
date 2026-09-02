import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ordersService } from "../../services/ordersService";
import type { Order, OrderLog, SalesOrderSapStatus } from "../../services/ordersService";
import { useQueryClient } from "@tanstack/react-query";

import { useCurrentUserOrders } from "../../lib/orderQueries";
import { useAction } from "../../auth/actions";
import "../../styles/Order_Tracking.css";
import { Badge } from "@/components/ui/badge";
import { toneForStatus } from "@/components/ui/statusTone";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { messageFrom } from "@/lib/apiError";

// Distributor-facing Order Tracking page.
//
// This is a trimmed copy of the staff Order_Tracking page: it reuses the same
// list + timeline UI but removes the staff-only "Edit order" flow (which routes
// into /Add_Sales). Distributors can only VIEW and TRACK their own orders.
// Data is scoped to the logged-in user via loadCurrentUserOrderSummaries(), and
// the backend additionally enforces created_by == request.user for this role.

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

const getLogTime = (log: Pick<OrderLog, "created_at">) => {
  const time = new Date(log.created_at || "").getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
};

const compareLogsByDisplayOrder = (
  a: Pick<OrderLog, "created_at" | "id">,
  b: Pick<OrderLog, "created_at" | "id">,
) => {
  const timeDifference = getLogTime(a) - getLogTime(b);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return a.id - b.id;
};

export default function Distributor_Order_Tracking() {
  const navigate = useNavigate();
  const location = useLocation();
  // Shared with View_Orders and the main Order_Tracking: one key, one fetch.
  const { orders, isOrdersLoading: loading } = useCurrentUserOrders();
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState<OrderLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [tracker, setTracker] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sapStatus, setSapStatus] = useState<SalesOrderSapStatus | null>(null);
  const [sapLoading, setSapLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [sapActionMsg, setSapActionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  // Only the Mart approver / admin may edit a failed order or resend it to SAP;
  // everyone else sees the SAP details read-only. The rule and its server
  // counterpart (`orders/views/mart.py:_is_mart_approver`) are recorded
  // together in `auth/actions.ts` — including the fact that the server's own
  // check accepts `is_staff` but not `is_superuser`, and reads the primary role
  // only. Previously this file compared a raw `localStorage` role string, which
  // matched neither.
  const isSapManager = useAction("mart.manageSap");

  /** Pull the list again — the resend flow can move an order to Completed. */
  const refreshOrders = () =>
    queryClient.invalidateQueries({ queryKey: ["orders", "current-user"] });

  useEffect(() => {
    if (location.state?.openOrderId && orders.length > 0) {
      const targetOrder = orders.find((o) => o.id === location.state.openOrderId);
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
          return String(b.order_number || "").localeCompare(String(a.order_number || ""));
        }

        return first - second;
      });
  }, [orders, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = useMemo(
    () => filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredOrders, currentPage],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const orderedLogs = useMemo(() => {
    return [...logs].sort(compareLogsByDisplayOrder);
  }, [logs]);

  const visibleLogs = useMemo(() => {
    const currentStatus = String(selectedOrder?.status_display || "")
      .trim()
      .toLowerCase();
    const isCurrentRatePending = currentStatus.includes("rate");
    const getPerformerKey = (log: OrderLog) =>
      String(log.performed_by_name || "")
        .trim()
        .toLowerCase();
    const isRealPerformer = (value: string | null | undefined) =>
      Boolean(value && value !== "pending" && value !== "system");
    const isRateLog = (log: OrderLog) =>
      String(log.status_name || "")
        .toLowerCase()
        .includes("rate");
    const isRejectedLog = (log: OrderLog) =>
      String(log.status_name || "")
        .toLowerCase()
        .includes("reject");
    const isApprovedLog = (log: OrderLog) => {
      const statusName = String(log.status_name || "").toLowerCase();
      const remarks = String(log.remarks || "").toLowerCase();
      return (
        statusName.includes("approved") ||
        statusName.includes("accepted") ||
        remarks.includes("approved") ||
        remarks.includes("accepted")
      );
    };
    const latestPendingRateLog = isCurrentRatePending
      ? [...orderedLogs]
          .reverse()
          .find((log) => isRateLog(log) && !isRealPerformer(log.performed_by_name))
      : null;
    const isWorkflowBoundaryLog = (log: OrderLog) => {
      const statusName = String(log.status_name || "").toLowerCase();
      return (
        statusName.includes("billing") ||
        statusName.includes("auditor") ||
        statusName.includes("rate") ||
        statusName.includes("reject") ||
        statusName.includes("complete")
      );
    };
    const hasWorkflowBoundaryBetween = (source: OrderLog, target: OrderLog) => {
      const sourceTime = new Date(source.created_at || "").getTime();
      const targetTime = new Date(target.created_at || "").getTime();

      return orderedLogs.some((betweenLog) => {
        const betweenTime = new Date(betweenLog.created_at || "").getTime();

        return (
          betweenLog.id !== source.id &&
          betweenLog.id !== target.id &&
          isWorkflowBoundaryLog(betweenLog) &&
          (betweenTime > sourceTime || (betweenTime === sourceTime && betweenLog.id > source.id)) &&
          (betweenTime < targetTime || (betweenTime === targetTime && betweenLog.id < target.id))
        );
      });
    };
    const hasLaterDuplicateDecision = (log: OrderLog) => {
      const statusName = String(log.status_name || "")
        .trim()
        .toLowerCase();
      const performer = getPerformerKey(log);
      const remarks = String(log.remarks || "")
        .trim()
        .toLowerCase();

      if (!isRealPerformer(performer) || !isDecisionHistoryLog(log)) {
        return false;
      }

      return orderedLogs.some((otherLog) => {
        const otherStatus = String(otherLog.status_name || "")
          .trim()
          .toLowerCase();
        const otherPerformer = getPerformerKey(otherLog);
        const otherRemarks = String(otherLog.remarks || "")
          .trim()
          .toLowerCase();
        const logTime = new Date(log.created_at || "").getTime();
        const otherTime = new Date(otherLog.created_at || "").getTime();

        return (
          otherLog.id !== log.id &&
          otherStatus === statusName &&
          otherPerformer === performer &&
          otherRemarks === remarks &&
          !hasWorkflowBoundaryBetween(log, otherLog) &&
          (otherTime > logTime || (otherTime === logTime && otherLog.id > log.id))
        );
      });
    };
    const hasLaterSameCycleRateRejection = (log: OrderLog) => {
      const performer = getPerformerKey(log);
      const logTime = new Date(log.created_at || "").getTime();

      if (!isRateLog(log) || isRejectedLog(log) || !isRealPerformer(performer)) {
        return false;
      }

      return orderedLogs.some((otherLog) => {
        const otherPerformer = getPerformerKey(otherLog);
        const otherTime = new Date(otherLog.created_at || "").getTime();
        const hasStageBoundaryBetween = orderedLogs.some((betweenLog) => {
          const betweenTime = new Date(betweenLog.created_at || "").getTime();
          const betweenStatus = String(betweenLog.status_name || "").toLowerCase();

          return (
            betweenLog.id !== log.id &&
            betweenLog.id !== otherLog.id &&
            (betweenTime > logTime || (betweenTime === logTime && betweenLog.id > log.id)) &&
            (betweenTime < otherTime ||
              (betweenTime === otherTime && betweenLog.id < otherLog.id)) &&
            (betweenStatus.includes("billing") ||
              betweenStatus.includes("auditor") ||
              betweenStatus.includes("rate"))
          );
        });

        return (
          otherLog.id !== log.id &&
          otherPerformer === performer &&
          isRejectedLog(otherLog) &&
          !hasStageBoundaryBetween &&
          (otherTime > logTime || (otherTime === logTime && otherLog.id > log.id))
        );
      });
    };
    const hasLaterSameCycleRateApproval = (log: OrderLog) => {
      const performer = getPerformerKey(log);
      const logTime = new Date(log.created_at || "").getTime();

      if (!isRateLog(log) || isRejectedLog(log) || !isRealPerformer(performer)) {
        return false;
      }

      return orderedLogs.some((otherLog) => {
        const otherPerformer = getPerformerKey(otherLog);
        const otherTime = new Date(otherLog.created_at || "").getTime();
        const hasStageBoundaryBetween = orderedLogs.some((betweenLog) => {
          const betweenTime = new Date(betweenLog.created_at || "").getTime();
          const betweenStatus = String(betweenLog.status_name || "").toLowerCase();

          return (
            betweenLog.id !== log.id &&
            betweenLog.id !== otherLog.id &&
            (betweenTime > logTime || (betweenTime === logTime && betweenLog.id > log.id)) &&
            (betweenTime < otherTime ||
              (betweenTime === otherTime && betweenLog.id < otherLog.id)) &&
            (betweenStatus.includes("billing") ||
              betweenStatus.includes("auditor") ||
              betweenStatus.includes("rate"))
          );
        });

        return (
          otherLog.id !== log.id &&
          otherPerformer === performer &&
          isApprovedLog(otherLog) &&
          !hasStageBoundaryBetween &&
          (otherTime > logTime || (otherTime === logTime && otherLog.id > log.id))
        );
      });
    };
    const isDecisionHistoryLog = (log: OrderLog) => {
      const statusName = String(log.status_name || "").toLowerCase();
      const remarks = String(log.remarks || "").toLowerCase();
      const performer = getPerformerKey(log);
      const combined = `${statusName} ${remarks}`;
      const hasRealPerformer = isRealPerformer(performer);

      return (
        combined.includes("reject") ||
        combined.includes("approved") ||
        combined.includes("accepted") ||
        combined.includes("complete") ||
        combined.includes("sent to auditor") ||
        (hasRealPerformer && statusName.includes("rate"))
      );
    };
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

      return isDecision && (pendingStage === "auditor" || pendingStage === "rate");
    };

    return orderedLogs.filter((log) => {
      const performer = getPerformerKey(log);
      const isPendingLog = !isRealPerformer(performer);

      if (latestPendingRateLog && !isPendingLog && isApprovedLog(log)) {
        const logTime = new Date(log.created_at || "").getTime();
        const pendingRateTime = new Date(latestPendingRateLog.created_at || "").getTime();
        const hasStageBoundaryBetween = orderedLogs.some((betweenLog) => {
          const betweenTime = new Date(betweenLog.created_at || "").getTime();
          const betweenStatus = String(betweenLog.status_name || "").toLowerCase();

          return (
            betweenLog.id !== log.id &&
            betweenLog.id !== latestPendingRateLog.id &&
            (betweenTime > pendingRateTime ||
              (betweenTime === pendingRateTime && betweenLog.id > latestPendingRateLog.id)) &&
            (betweenTime < logTime || (betweenTime === logTime && betweenLog.id < log.id)) &&
            (betweenStatus.includes("billing") ||
              betweenStatus.includes("auditor") ||
              betweenStatus.includes("rate") ||
              betweenStatus.includes("reject") ||
              betweenStatus.includes("complete"))
          );
        });

        if (
          !hasStageBoundaryBetween &&
          (logTime > pendingRateTime ||
            (logTime === pendingRateTime && log.id > latestPendingRateLog.id))
        ) {
          return false;
        }
      }

      if (isPendingLog) {
        if (isCurrentRatePending && isRateLog(log)) {
          return true;
        }

        const logTime = new Date(log.created_at || "").getTime();

        return !orderedLogs.some((otherLog) => {
          const otherPerformer = getPerformerKey(otherLog);
          const otherTime = new Date(otherLog.created_at || "").getTime();

          return (
            isRealPerformer(otherPerformer) &&
            isOutcomeForPendingStage(log, otherLog) &&
            (otherTime > logTime || (otherTime === logTime && otherLog.id > log.id))
          );
        });
      }

      if (
        hasLaterDuplicateDecision(log) ||
        hasLaterSameCycleRateRejection(log) ||
        hasLaterSameCycleRateApproval(log)
      ) {
        return false;
      }

      return isDecisionHistoryLog(log);
    });
  }, [orderedLogs, selectedOrder?.status_display]);

  const displayLogs = useMemo(() => {
    const isRealPerformer = (value: string | null | undefined) => {
      const normalized = String(value || "")
        .trim()
        .toLowerCase();
      return Boolean(normalized && normalized !== "pending" && normalized !== "system");
    };
    const isRateLog = (log: OrderLog) =>
      String(log.status_name || "")
        .toLowerCase()
        .includes("rate");
    const isBillingLog = (log: OrderLog) =>
      String(log.status_name || "")
        .toLowerCase()
        .includes("billing") ||
      String(log.remarks || "")
        .toLowerCase()
        .includes("billing");
    const isRejectedLog = (log: OrderLog) =>
      String(log.status_name || "")
        .toLowerCase()
        .includes("reject");
    const isApprovedLog = (log: OrderLog) => {
      const statusName = String(log.status_name || "").toLowerCase();
      const remarks = String(log.remarks || "").toLowerCase();
      return (
        statusName.includes("approved") ||
        statusName.includes("accepted") ||
        remarks.includes("approved") ||
        remarks.includes("accepted")
      );
    };
    const getPreviousStageName = (log: OrderLog) => {
      const logTime = new Date(log.created_at || "").getTime();
      const previousStage = [...orderedLogs]
        .filter((entry) => {
          const entryTime = new Date(entry.created_at || "").getTime();
          return (
            entry.id !== log.id &&
            (entryTime < logTime || (entryTime === logTime && entry.id < log.id))
          );
        })
        .reverse()
        .find((entry) => {
          const entryStatus = String(entry.status_name || "").toLowerCase();
          return (
            entryStatus.includes("rate") ||
            entryStatus.includes("auditor") ||
            entryStatus.includes("billing")
          );
        });

      return String(previousStage?.status_name || "").toLowerCase();
    };
    const isAcceptedRateApprovalLog = (log: OrderLog) => {
      if (isBillingLog(log) || isRejectedLog(log) || !isRealPerformer(log.performed_by_name)) {
        return false;
      }

      if (isRateLog(log) && isApprovedLog(log)) {
        return true;
      }

      return isApprovedLog(log) && getPreviousStageName(log).includes("rate");
    };

    return [...visibleLogs]
      .sort(compareLogsByDisplayOrder)
      .reduce<OrderLog[]>((mergedLogs, log) => {
        if (!isAcceptedRateApprovalLog(log)) {
          mergedLogs.push(log);
          return mergedLogs;
        }

        const previousLog = mergedLogs[mergedLogs.length - 1];
        if (previousLog && isAcceptedRateApprovalLog(previousLog)) {
          const names = [
            ...String(previousLog.performed_by_name || "")
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean),
            String(log.performed_by_name || "").trim(),
          ].filter(Boolean);

          const remarks = Array.from(
            new Set(
              [previousLog.remarks, log.remarks]
                .map((remark) => String(remark || "").trim())
                .filter(Boolean),
            ),
          ).join(", ");

          mergedLogs[mergedLogs.length - 1] = {
            ...previousLog,
            performed_by_name: Array.from(new Set(names)).join(", "),
            created_at: log.created_at || previousLog.created_at,
            remarks,
          };
          return mergedLogs;
        }

        mergedLogs.push({
          ...log,
          status_name: "Rate Approval",
        });
        return mergedLogs;
      }, []);
  }, [orderedLogs, visibleLogs]);

  const timelineLogs = useMemo(() => {
    const currentStatus = String(selectedOrder?.status_display || "").trim();
    const normalizedStatus = currentStatus.toLowerCase();

    if (!selectedOrder || !normalizedStatus.includes("billing")) {
      return displayLogs;
    }

    const hasBillingStep = displayLogs.some((log) =>
      String(log.status_name || "")
        .toLowerCase()
        .includes("billing"),
    );

    if (hasBillingStep) {
      return displayLogs;
    }

    return [
      ...displayLogs,
      {
        id: -selectedOrder.id,
        status_name: currentStatus.includes("Pending") ? currentStatus : "Billing Pending",
        remarks: "",
        performed_by_name: null,
        created_at: displayLogs[displayLogs.length - 1]?.created_at || selectedOrder.created_at,
      },
    ];
  }, [selectedOrder, displayLogs]);

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

  const isBillingAcceptedLog = (log: OrderLog) => {
    const statusName = String(log.status_name || "").toLowerCase();
    const remarks = String(log.remarks || "").toLowerCase();

    return (
      isSentToAuditorLog(log) ||
      (statusName.includes("billing") &&
        (statusName.includes("accepted") ||
          statusName.includes("approved") ||
          remarks.includes("accepted") ||
          remarks.includes("approved"))) ||
      remarks.includes("accepted by billing") ||
      remarks.includes("approved by billing")
    );
  };

  const getLogDisplayTitle = (log: OrderLog) => {
    const statusName = String(log.status_name || "").toLowerCase();
    const remarks = String(log.remarks || "").toLowerCase();
    const performer = String(log.performed_by_name || "")
      .trim()
      .toLowerCase();
    const hasRealPerformer = performer && performer !== "pending" && performer !== "system";
    const isRejected = statusName.includes("reject");
    const isAccepted =
      statusName === "approved" ||
      statusName === "accepted" ||
      statusName.includes("approved") ||
      statusName.includes("accepted");
    const logTime = new Date(log.created_at || "").getTime();
    const lastPreviousStage = [...orderedLogs]
      .filter((entry) => {
        const entryTime = new Date(entry.created_at || "").getTime();
        return (
          entry.id !== log.id &&
          (entryTime < logTime || (entryTime === logTime && entry.id < log.id))
        );
      })
      .reverse()
      .find((entry) => {
        const entryStatus = String(entry.status_name || "").toLowerCase();
        return (
          entryStatus.includes("rate") ||
          entryStatus.includes("auditor") ||
          entryStatus.includes("billing")
        );
      });
    const lastPreviousStageName = String(lastPreviousStage?.status_name || "").toLowerCase();

    if (isRejected && lastPreviousStageName.includes("rate")) {
      return "Rate Approval Rejected";
    }

    if (isRejected && lastPreviousStageName.includes("billing")) {
      return "Billing Rejected";
    }

    if (isRejected && lastPreviousStageName.includes("auditor")) {
      return "Auditor Rejected";
    }

    if (isBillingAcceptedLog(log)) {
      return "Accepted by Billing";
    }

    if (isAccepted && lastPreviousStageName.includes("rate")) {
      return "Accepted by Rate Approver";
    }

    if (isAccepted && lastPreviousStageName.includes("billing")) {
      return "Accepted by Billing";
    }

    if (isAccepted && lastPreviousStageName.includes("auditor")) {
      return "Accepted by Auditor";
    }

    if (statusName.includes("billing") && !hasRealPerformer) {
      return "Billing Pending";
    }

    if (statusName.includes("rate") && hasRealPerformer) {
      return isRejected ? "Rate Approval Rejected" : "Accepted by Rate Approver";
    }

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

    return log.status_name;
  };

  const getLogDisplayRemark = (log: OrderLog) => log.remarks;

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

    if (normalized.includes("rate")) {
      return "approved";
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

  const getRateApprovalStatusRows = () =>
    (selectedOrder?.rate_approvals || [])
      .map((approval) => ({
        name: approval.approver_name,
        status: String(approval.status || "PENDING").toUpperCase(),
      }))
      .filter((approval) => approval.name);

  const formatApprovalStatus = (status: string) => {
    if (status === "APPROVED") return "Approved";
    if (status === "REJECTED") return "Rejected";
    return "Pending";
  };

  const fetchSapStatus = async (orderId: number) => {
    setSapLoading(true);
    try {
      const statuses = await ordersService.getSalesOrderSapStatus([orderId]);
      setSapStatus(statuses[String(orderId)] ?? null);
    } catch (error) {
      console.log("Error fetching SAP status:", error);
      setSapStatus(null);
    } finally {
      setSapLoading(false);
    }
  };

  const handleTrack = async (order: Order) => {
    // Show the summary immediately; fetch full details (po_number, remarks,
    // rate_approvals) and logs on demand now that the list load is summary-only.
    setSelectedOrder(order);
    setTracker(true);
    setLogs([]);
    setLogsLoading(true);
    setSapStatus(null);
    setSapActionMsg(null);
    // SAP details are for the Mart approver / admin only — distributors don't see them.
    if (isSapManager) void fetchSapStatus(order.id);

    try {
      const [details, response] = await Promise.all([
        ordersService.getOrderDetails(order.id).catch((error) => {
          console.log("Error fetching order details:", error);
          return null;
        }),
        ordersService.getOrderLogs(order.id),
      ]);
      if (details) setSelectedOrder(details);
      setLogs(Array.isArray(response) ? response : []);
    } catch (error) {
      console.log("Error fetching order logs:", error);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleResendToSap = async () => {
    if (!selectedOrder) return;
    setResending(true);
    setSapActionMsg(null);
    try {
      const res = await ordersService.resendMartOrderToSap(selectedOrder.id);
      setSapActionMsg({
        kind: "ok",
        text: res?.message || "Order sent to SAP successfully.",
      });
      // Refresh the SAP result and the order/logs to reflect the new state.
      await Promise.all([
        fetchSapStatus(selectedOrder.id),
        (async () => {
          const details = await ordersService.getOrderDetails(selectedOrder.id).catch(() => null);
          if (details) setSelectedOrder(details);
          const response = await ordersService.getOrderLogs(selectedOrder.id).catch(() => []);
          setLogs(Array.isArray(response) ? response : []);
        })(),
      ]);
      // Keep the list in sync (status may have moved to Completed).
      void refreshOrders();
    } catch (error) {
      const detail = messageFrom(error, "Failed to send the order to SAP. Please try again.");
      setSapActionMsg({ kind: "err", text: detail });
      void fetchSapStatus(selectedOrder.id);
    } finally {
      setResending(false);
    }
  };

  const handleEditOrder = () => {
    if (!selectedOrder) return;
    // Reuse the full Add Sales edit form (same path Mart Approval uses); return
    // here afterwards so the approver can resend to SAP.
    navigate("/Add_Sales", {
      state: {
        editOrderId: selectedOrder.id,
        mode: "edit",
        returnTo: "/Distributor_Order_Tracking",
      },
    });
  };

  const handleBack = () => {
    setTracker(false);
    setSelectedOrder(null);
    setLogs([]);
    setSapStatus(null);
    setSapActionMsg(null);
  };

  return (
    <div className="tracker-page">
      <div className="ao-page-head">
        <span className="ao-page-accent" aria-hidden="true" />
        <div>
          <h1 className="ao-page-title">Order tracker</h1>
          <p className="ao-page-subtitle">Track the status of your orders at every stage.</p>
        </div>
      </div>

      {!tracker && (
        <div>
          <div className="tracker-list-head">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="tracker-filter-select"
              aria-label="Filter by order status"
            >
              <option value="">All Orders</option>
              {uniqueStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            {!loading && <span className="tracker-count">Total: {filteredOrders.length}</span>}
          </div>

          {loading ? (
            <TableSkeleton columns={7} label="Loading orders" />
          ) : filteredOrders.length > 0 ? (
            <div className="tracker-table-wrap">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Card Name</TableHead>
                    <TableHead>FOC</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((order) => (
                    <TableRow key={order.id} className={order.is_foc ? "tracker-foc-row" : ""}>
                      <TableCell className="ao-cell-id">{order.order_number}</TableCell>
                      <TableCell className="ao-cell-name">{order.card_name}</TableCell>
                      <TableCell>
                        {order.is_foc ? (
                          <span className="tracker-foc-badge">FOC</span>
                        ) : (
                          <span className="tracker-foc-empty">-</span>
                        )}
                      </TableCell>
                      <TableCell>{formatCreatedDateTime(order.created_at)}</TableCell>
                      <TableCell>{order.delivery_date}</TableCell>
                      <TableCell>
                        <Badge tone={toneForStatus(order.status_display)}>
                          {order.status_display}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="ao-row-actions">
                          <button
                            type="button"
                            className="tracker-btn"
                            onClick={() => void handleTrack(order)}
                          >
                            Track
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="vo-empty tracker-empty-state">No orders found</div>
          )}

          {!loading && filteredOrders.length > itemsPerPage && (
            <Pagination page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          )}
        </div>
      )}

      {tracker && selectedOrder && (
        <div className="tracker-detail-card">
          <div className="tracker-detail-top">
            <button type="button" className="tracker-back-btn" onClick={handleBack}>
              Back
            </button>
            <div className="tracker-status-row">
              <Badge tone={toneForStatus(selectedOrder.status_display)}>
                {selectedOrder.status_display}
              </Badge>
              {selectedOrder.is_foc ? (
                <span className="tracker-foc-badge tracker-foc-badge-detail">FOC ORDER</span>
              ) : null}
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
              <p className="tracker-label">Created At</p>
              <p>{formatCreatedDateTime(selectedOrder.created_at)}</p>
            </div>
            <div>
              <p className="tracker-label">Delivery Date</p>
              <p>{selectedOrder.delivery_date || "-"}</p>
            </div>
            <div>
              <p className="tracker-label">PO Number</p>
              <p>{selectedOrder.po_number || "-"}</p>
            </div>
            {selectedOrder.remarks?.trim() ? (
              <div>
                <p className="tracker-label">Comment</p>
                <p>{selectedOrder.remarks}</p>
              </div>
            ) : null}
          </div>

          {/* SAP Sales Order result: DocEntry/DocNum on success, the SAP error on
              failure. Visible to the Mart approver / admin only (not distributors),
              who can also edit a failed order and retry the push. */}
          {isSapManager &&
            (() => {
              const isFailed = sapStatus?.status === "FAILED";
              const isSuccess = sapStatus?.status === "SUCCESS";

              return (
                <div
                  className={`tracker-sap-details${
                    isFailed
                      ? " tracker-sap-details--failed"
                      : isSuccess
                        ? " tracker-sap-details--success"
                        : ""
                  }`}
                >
                  <div className="tracker-sap-head">
                    <h5 className="tracker-sap-title">SAP Details</h5>
                    {sapStatus ? (
                      <span
                        className={`tracker-sap-status-pill${
                          isFailed
                            ? " tracker-sap-status-pill--failed"
                            : isSuccess
                              ? " tracker-sap-status-pill--success"
                              : ""
                        }`}
                      >
                        {isSuccess ? "Created in SAP" : isFailed ? "SAP Failed" : sapStatus.status}
                      </span>
                    ) : null}
                  </div>

                  {sapLoading ? (
                    <p className="vo-empty tracker-vo-flush">Loading SAP status…</p>
                  ) : !sapStatus ? (
                    <p className="tracker-sap-note">This order has not been sent to SAP yet.</p>
                  ) : isSuccess ? (
                    <div className="tracker-summary-grid tracker-summary-grid--flush">
                      <div>
                        <p className="tracker-label">Doc Entry</p>
                        <p>{sapStatus.doc_entry ?? "-"}</p>
                      </div>
                      <div>
                        <p className="tracker-label">Doc Num</p>
                        <p>{sapStatus.doc_num ?? "-"}</p>
                      </div>
                      {sapStatus.completed_at ? (
                        <div>
                          <p className="tracker-label">Created At</p>
                          <p>{formatDateTime(sapStatus.completed_at)}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div>
                      <p className="tracker-label tracker-label--danger">Why SAP failed</p>
                      <p className="tracker-sap-error-text">
                        {sapStatus.error_message || "SAP did not return an error message."}
                      </p>
                    </div>
                  )}

                  {isFailed && isSapManager ? (
                    <div className="tracker-sap-actions">
                      <button
                        type="button"
                        className="tracker-btn"
                        onClick={handleEditOrder}
                        disabled={resending}
                      >
                        Edit Order
                      </button>
                      <button
                        type="button"
                        className="tracker-btn tracker-btn-resend"
                        onClick={() => void handleResendToSap()}
                        disabled={resending}
                      >
                        {resending ? "Sending to SAP…" : "Resend to SAP"}
                      </button>
                    </div>
                  ) : null}

                  {sapActionMsg ? (
                    <div className={`tracker-sap-msg tracker-sap-msg--${sapActionMsg.kind}`}>
                      {sapActionMsg.text}
                    </div>
                  ) : null}
                </div>
              );
            })()}

          <div className="tracker-timeline">
            <h5>Order Log Timeline</h5>

            {logsLoading ? (
              <p className="vo-empty">Loading order logs...</p>
            ) : timelineLogs.length === 0 ? (
              <p className="vo-empty">No tracking logs found for this order.</p>
            ) : (
              timelineLogs.map((log, index) => {
                const tone = getLogTone(log.status_name, log.performed_by_name);
                const displayRemark = getLogDisplayRemark(log);
                const displayTitle = getLogDisplayTitle(log);

                return (
                  <div key={log.id} className="tracker-timeline-row">
                    <div className="tracker-timeline-left">
                      <div className={`tracker-dot ${tone}`}>
                        {tone === "approved" ? "✓" : tone === "rejected" ? "✕" : "•"}
                      </div>
                      {index !== timelineLogs.length - 1 ? (
                        <div className={`tracker-line ${tone}`} />
                      ) : null}
                    </div>

                    <div className={`tracker-log-card ${tone}`}>
                      <div className="tracker-log-head">
                        <h6>{displayTitle}</h6>
                        <span>{formatDateTime(log.created_at)}</span>
                      </div>

                      {(() => {
                        const isLastLog = index === timelineLogs.length - 1;
                        const statusLower = (log.status_name || "").toLowerCase();
                        const isTerminal =
                          statusLower.includes("completed") || statusLower.includes("rejected");
                        const isPendingLog = isLastLog && !isTerminal;

                        if (isPendingLog) {
                          const isRateApprovalStatus =
                            statusLower.includes("rate") || statusLower.includes("need approval");
                          const rateApprovalRows = isRateApprovalStatus
                            ? getRateApprovalStatusRows()
                            : [];

                          let holderName = "";
                          if (isRateApprovalStatus) {
                            const pendingApprovers = rateApprovalRows
                              .filter((ra) => ra.status === "PENDING")
                              .map((ra) => ra.name);
                            holderName =
                              pendingApprovers.length > 0 ? pendingApprovers.join(", ") : "";
                          }

                          if (rateApprovalRows.length > 0) {
                            return (
                              <div
                                className="tracker-log-meta tracker-log-meta--approval"
                              >
                                {rateApprovalRows.map((approval) => (
                                  <div key={`${approval.name}-${approval.status}`}>
                                    {approval.name}: {formatApprovalStatus(approval.status)}
                                  </div>
                                ))}
                                {holderName ? (
                                  <span
                                    className="app-chip-amber"
                                  >
                                    Awaiting Action
                                  </span>
                                ) : null}
                              </div>
                            );
                          }

                          return holderName ? (
                            <div
                              className="tracker-log-meta tracker-log-meta--pending"
                            >
                              <div>Pending with: {holderName}</div>
                              <span
                                className="app-chip-amber"
                              >
                                Awaiting Action
                              </span>
                            </div>
                          ) : (
                            <p className="tracker-log-meta">
                              Performed By: {log.performed_by_name || "Pending"}
                            </p>
                          );
                        }

                        if (
                          displayTitle === "Accepted by Rate Approver" &&
                          String(log.performed_by_name || "").includes(",")
                        ) {
                          return (
                            <div className="tracker-log-meta">
                              {String(log.performed_by_name || "")
                                .split(",")
                                .map((name) => name.trim())
                                .filter(Boolean)
                                .map((name) => (
                                  <div key={name}>{name}: Approved</div>
                                ))}
                            </div>
                          );
                        }

                        return (
                          <p className="tracker-log-meta">
                            Performed By: {log.performed_by_name || "—"}
                          </p>
                        );
                      })()}

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
