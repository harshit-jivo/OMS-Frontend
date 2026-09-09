import type { Order } from "@/services/ordersService";

/**
 * "Did MY desk accept this order?"
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS STRING MATCHING, AND WHY IT IS IN A FILE OF ITS OWN
 * ─────────────────────────────────────────────────────────────────────────
 * The tracking API returns a human status LABEL ("Rejected by Auditor",
 * "Billing Pending") rather than the numeric id the write endpoints take. So
 * the only way to answer the question above is to match strings, which is not
 * lovely and is what the data supports.
 *
 * It also cannot be answered once for the whole app, because the three desks
 * answer it differently about the SAME order:
 *
 *   an order the auditor REJECTED …
 *     · is `rejected` on the auditor's own tracking screen;
 *     · is `accepted` on BILLING's, because billing accepted it before the
 *       auditor ever saw it — billing's decision is not undone by a later
 *       desk's;
 *     · is `accepted` for the rate approver, for the same reason.
 *
 *   an order BILLING rejected …
 *     · is `other` for the auditor — it never reached that desk, so the
 *       auditor made no decision to track. It is filtered out entirely rather
 *       than shown as a rejection the auditor did not make.
 *
 * That asymmetry is the whole content of this module, it lived inline in a
 * 1,024-line page with no tests, and it is the thing most likely to be broken
 * by someone adding a status. It has tests now.
 *
 * `other` means "this desk made no decision" and is the signal to hide the row.
 */

export type TrackingMode = "auditor" | "billing" | "rate_approver";
export type Decision = "accepted" | "rejected" | "other";

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

/** When the rate-approval queue comes back empty, fall back to this status. */
export const RATE_APPROVER_TRACKING_FALLBACK_STATUS = "APPROVED";

export function getDecisionType(order: Order, mode: TrackingMode): Decision {
  // The API says so outright when it can; the matching below is the fallback.
  if (order.decision_type === "accepted" || order.decision_type === "rejected") {
    return order.decision_type;
  }

  const normalized = (order.status_display || "").toLowerCase();
  const statusCode = String(order.status || "").toUpperCase();

  if (mode === "auditor") {
    // Billing rejected it, so the auditor never decided anything — `other`,
    // and the row is dropped rather than shown as the auditor's rejection.
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
    // A later rejection by the auditor does not undo billing's acceptance.
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
}

/**
 * The rate approver's own verdict, read from the per-approver rows.
 *
 * An order can carry several approvers; ANY rejection makes it a rejection,
 * because one refusal is enough to send it back.
 */
export function getRateApproverApprovalDecision(order: Order): Order["decision_type"] {
  const approvals = Array.isArray(order.rate_approvals) ? order.rate_approvals : [];
  if (approvals.some((approval) => String(approval.status || "").toUpperCase() === "REJECTED")) {
    return "rejected";
  }
  if (approvals.some((approval) => String(approval.status || "").toUpperCase() === "APPROVED")) {
    return "accepted";
  }
  return undefined;
}

/**
 * Stamp the rate approver's verdict onto each order before anything filters.
 *
 * Only that mode needs it: for the other two the status label already says
 * what the desk did, while a rate approval lives in its own sub-table.
 */
export function normalizeTrackingOrders(items: Order[], mode: TrackingMode): Order[] {
  if (mode !== "rate_approver") return items;
  return items.map((order) => {
    const decisionType = getRateApproverApprovalDecision(order);
    return decisionType ? { ...order, decision_type: decisionType } : order;
  });
}
