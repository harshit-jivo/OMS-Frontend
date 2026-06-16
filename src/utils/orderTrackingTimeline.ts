import type { Order, OrderLog } from "../services/ordersService";

const getLogTime = (log: Pick<OrderLog, "created_at">) => {
  const time = new Date(log.created_at || "").getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
};

export const compareLogsByDisplayOrder = (
  a: Pick<OrderLog, "created_at" | "id">,
  b: Pick<OrderLog, "created_at" | "id">,
) => {
  const timeDifference = getLogTime(a) - getLogTime(b);
  return timeDifference !== 0 ? timeDifference : a.id - b.id;
};

const getPerformerKey = (log: OrderLog) =>
  String(log.performed_by_name || "").trim().toLowerCase();

const isRealPerformer = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized && normalized !== "pending" && normalized !== "system");
};

const isRateLog = (log: OrderLog) =>
  String(log.status_name || "").toLowerCase().includes("rate");

const isBillingLog = (log: OrderLog) =>
  String(log.status_name || "").toLowerCase().includes("billing") ||
  String(log.remarks || "").toLowerCase().includes("billing");

const isRejectedLog = (log: OrderLog) =>
  String(log.status_name || "").toLowerCase().includes("reject");

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

const hasWorkflowBoundaryBetween = (orderedLogs: OrderLog[], source: OrderLog, target: OrderLog) => {
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

const hasLaterDuplicateDecision = (orderedLogs: OrderLog[], log: OrderLog) => {
  const statusName = String(log.status_name || "").trim().toLowerCase();
  const performer = getPerformerKey(log);
  const remarks = String(log.remarks || "").trim().toLowerCase();

  if (!isRealPerformer(performer) || !isDecisionHistoryLog(log)) {
    return false;
  }

  return orderedLogs.some((otherLog) => {
    const otherStatus = String(otherLog.status_name || "").trim().toLowerCase();
    const otherPerformer = getPerformerKey(otherLog);
    const otherRemarks = String(otherLog.remarks || "").trim().toLowerCase();
    const logTime = new Date(log.created_at || "").getTime();
    const otherTime = new Date(otherLog.created_at || "").getTime();

    return (
      otherLog.id !== log.id &&
      otherStatus === statusName &&
      otherPerformer === performer &&
      otherRemarks === remarks &&
      !hasWorkflowBoundaryBetween(orderedLogs, log, otherLog) &&
      (otherTime > logTime || (otherTime === logTime && otherLog.id > log.id))
    );
  });
};

const hasLaterSameCycleRateDecision = (
  orderedLogs: OrderLog[],
  log: OrderLog,
  isMatchingDecision: (candidate: OrderLog) => boolean,
) => {
  const performer = getPerformerKey(log);
  const logTime = new Date(log.created_at || "").getTime();

  if (!isRateLog(log) || isRejectedLog(log) || !isRealPerformer(performer)) {
    return false;
  }

  return orderedLogs.some((otherLog) => {
    const otherPerformer = getPerformerKey(otherLog);
    const otherTime = new Date(otherLog.created_at || "").getTime();

    return (
      otherLog.id !== log.id &&
      otherPerformer === performer &&
      isMatchingDecision(otherLog) &&
      !hasWorkflowBoundaryBetween(orderedLogs, log, otherLog) &&
      (otherTime > logTime || (otherTime === logTime && otherLog.id > log.id))
    );
  });
};

const isDecisionHistoryLog = (log: OrderLog) => {
  const statusName = String(log.status_name || "").toLowerCase();
  const remarks = String(log.remarks || "").toLowerCase();
  const performer = getPerformerKey(log);
  const combined = `${statusName} ${remarks}`;

  return (
    combined.includes("reject") ||
    combined.includes("approved") ||
    combined.includes("accepted") ||
    combined.includes("complete") ||
    combined.includes("sent to auditor") ||
    (isRealPerformer(performer) && statusName.includes("rate"))
  );
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

const getPreviousStageName = (log: OrderLog, contextLogs: OrderLog[]) => {
  const logTime = new Date(log.created_at || "").getTime();
  const lastPreviousStage = [...contextLogs].sort(compareLogsByDisplayOrder)
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

  return String(lastPreviousStage?.status_name || "").toLowerCase();
};

const isAcceptedRateApprovalLog = (log: OrderLog, contextLogs: OrderLog[]) => {
  if (isBillingLog(log) || isRejectedLog(log) || !isRealPerformer(log.performed_by_name)) {
    return false;
  }

  if (isRateLog(log) && isApprovedLog(log)) {
    return true;
  }

  return isApprovedLog(log) && getPreviousStageName(log, contextLogs).includes("rate");
};

const mergeRateApprovalLogs = (displayLogs: OrderLog[], contextLogs: OrderLog[]) => {
  const mergedLogs: OrderLog[] = [];

  displayLogs.forEach((log) => {
    if (!isAcceptedRateApprovalLog(log, contextLogs)) {
      mergedLogs.push(log);
      return;
    }

    const previousLog = mergedLogs[mergedLogs.length - 1];
    if (previousLog && isAcceptedRateApprovalLog(previousLog, contextLogs)) {
      const names = [
        ...String(previousLog.performed_by_name || "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
        String(log.performed_by_name || "").trim(),
      ].filter(Boolean);

      mergedLogs[mergedLogs.length - 1] = {
        ...previousLog,
        performed_by_name: Array.from(new Set(names)).join(", "),
        created_at: log.created_at || previousLog.created_at,
        remarks: "Approved",
      };
      return;
    }

    mergedLogs.push({
      ...log,
      status_name: "Rate Approval",
      remarks: "Approved",
    });
  });

  return mergedLogs;
};

export const buildOrderTimelineLogs = (logs: OrderLog[], selectedOrder?: Order | null) => {
  const orderedLogs = [...logs].sort(compareLogsByDisplayOrder);
  const currentStatus = String(selectedOrder?.status_display || "").trim();
  const normalizedStatus = currentStatus.toLowerCase();
  const isCurrentRatePending = normalizedStatus.includes("rate");
  const latestPendingRateLog = isCurrentRatePending
    ? [...orderedLogs]
        .reverse()
        .find((log) => isRateLog(log) && !isRealPerformer(log.performed_by_name))
    : null;

  const visibleLogs = orderedLogs.filter((log) => {
    const performer = getPerformerKey(log);
    const isPendingLog = !isRealPerformer(performer);

    if (
      latestPendingRateLog &&
      !isPendingLog &&
      isApprovedLog(log) &&
      !hasWorkflowBoundaryBetween(orderedLogs, latestPendingRateLog, log) &&
      compareLogsByDisplayOrder(log, latestPendingRateLog) > 0
    ) {
      return false;
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
      hasLaterDuplicateDecision(orderedLogs, log) ||
      hasLaterSameCycleRateDecision(orderedLogs, log, isRejectedLog) ||
      hasLaterSameCycleRateDecision(orderedLogs, log, isApprovedLog)
    ) {
      return false;
    }

    return isDecisionHistoryLog(log);
  });

  const displayLogs = mergeRateApprovalLogs([...visibleLogs].sort(compareLogsByDisplayOrder), orderedLogs);

  if (!selectedOrder || !normalizedStatus.includes("billing")) {
    return displayLogs;
  }

  const hasBillingStep = displayLogs.some((log) =>
    String(log.status_name || "").toLowerCase().includes("billing")
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
};

export const isSentToAuditorLog = (log: OrderLog) => {
  const statusName = String(log.status_name || "").toLowerCase();
  const remarks = String(log.remarks || "").toLowerCase();

  return statusName.includes("billing") && remarks.includes("sent to auditor");
};

export const isBillingAcceptedLog = (log: OrderLog) => {
  const statusName = String(log.status_name || "").toLowerCase();
  const remarks = String(log.remarks || "").toLowerCase();

  return (
    isSentToAuditorLog(log) ||
    (
      statusName.includes("billing") &&
      (
        statusName.includes("accepted") ||
        statusName.includes("approved") ||
        remarks.includes("accepted") ||
        remarks.includes("approved")
      )
    ) ||
    remarks.includes("accepted by billing") ||
    remarks.includes("approved by billing")
  );
};

export const getOrderLogDisplayTitle = (
  log: OrderLog,
  timelineLogs: OrderLog[],
  contextLogs = timelineLogs,
) => {
  const statusName = String(log.status_name || "").toLowerCase();
  const remarks = String(log.remarks || "").toLowerCase();
  const performer = String(log.performed_by_name || "").trim().toLowerCase();
  const hasRealPerformer =
    performer && performer !== "pending" && performer !== "system";
  const isRejected = statusName.includes("reject");
  const isAccepted =
    statusName === "approved" ||
    statusName === "accepted" ||
    statusName.includes("approved") ||
    statusName.includes("accepted");
  const logTime = new Date(log.created_at || "").getTime();
  const lastPreviousStage = [...contextLogs].sort(compareLogsByDisplayOrder)
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

  if (isRejected && lastPreviousStageName.includes("rate")) return "Rate Approval Rejected";
  if (isRejected && lastPreviousStageName.includes("billing")) return "Billing Rejected";
  if (isRejected && lastPreviousStageName.includes("auditor")) return "Auditor Rejected";
  if (isBillingAcceptedLog(log)) return "Accepted by Billing";
  if (isAccepted && lastPreviousStageName.includes("rate")) return "Accepted by Rate Approver";
  if (isAccepted && lastPreviousStageName.includes("billing")) return "Accepted by Billing";
  if (isAccepted && lastPreviousStageName.includes("auditor")) return "Accepted by Auditor";
  if (statusName.includes("billing") && !hasRealPerformer) return "Billing Pending";
  if (statusName.includes("rate") && hasRealPerformer) {
    return isRejected ? "Rate Approval Rejected" : "Accepted by Rate Approver";
  }
  if (statusName.includes("billing") && statusName.includes("reject")) return "Billing Rejected";
  if (
    statusName.includes("billing") &&
    (
      remarks.includes("edited") ||
      remarks.includes("resubmitted") ||
      remarks.includes("sent back to billing")
    )
  ) {
    return "Order Edited and Sent Back to Billing";
  }

  return log.status_name;
};

export const getOrderLogDisplayRemark = (log: OrderLog) => {
  if (isSentToAuditorLog(log)) return "Sent to auditor";
  return log.remarks;
};

export const getOrderLogTone = (status: string, performedBy: string | null) => {
  const normalized = String(status || "").toLowerCase();
  const normalizedPerformer = String(performedBy || "").toLowerCase();
  const isPendingPerformer =
    !normalizedPerformer ||
    normalizedPerformer.includes("pending") ||
    normalizedPerformer.includes("system");

  if (normalized.includes("reject") || normalized.includes("cancel")) return "rejected";
  if (isPendingPerformer) return "pending";
  if (normalized.includes("rate")) return "approved";
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
