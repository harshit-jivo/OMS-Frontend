import { describe, expect, it } from "vitest";

import {
  getDecisionType,
  getRateApproverApprovalDecision,
  normalizeTrackingOrders,
} from "./trackingDecision";
import type { Order } from "@/services/ordersService";

/**
 * The tracking vocabulary.
 *
 * This lived inline in a 1,024-line page with no tests, and it is the thing
 * most likely to be broken by someone adding a status: three desks answer
 * "did I accept this?" differently about the SAME order, and the difference is
 * not obvious from reading any one branch.
 */

const order = (over: Partial<Order> = {}): Order =>
  ({ id: 1, status_display: "", status: "", ...over }) as Order;

describe("the auditor's view", () => {
  it("counts its own rejection as a rejection", () => {
    expect(getDecisionType(order({ status_display: "Rejected" }), "auditor")).toBe(
      "rejected",
    );
    expect(getDecisionType(order({ status: "REJECTED" }), "auditor")).toBe("rejected");
  });

  it("counts anything downstream as an acceptance", () => {
    for (const status of ["Billing", "Billed", "Completed", "Approved"]) {
      expect(getDecisionType(order({ status_display: status }), "auditor")).toBe(
        "accepted",
      );
    }
  });

  it("HIDES an order billing rejected, rather than claiming the rejection", () => {
    // The auditor never saw it, so there is no auditor decision to track.
    // `other` is the signal the page uses to drop the row entirely.
    expect(
      getDecisionType(order({ status: "BILLING_REJECTED" }), "auditor"),
    ).toBe("other");
    expect(
      getDecisionType(order({ status_display: "Rejected by Billing" }), "auditor"),
    ).toBe("other");
  });
});

describe("billing's view", () => {
  it("counts its OWN rejection as a rejection", () => {
    expect(getDecisionType(order({ status: "BILLING_REJECTED" }), "billing")).toBe(
      "rejected",
    );
    expect(
      getDecisionType(order({ status_display: "Billing Rejected" }), "billing"),
    ).toBe("rejected");
  });

  it("still counts an order the AUDITOR later rejected as accepted", () => {
    // The asymmetry worth pinning: billing did its part before the auditor
    // saw it, and a later desk's refusal does not undo billing's decision.
    // The same order reads `rejected` on the auditor's screen.
    const rejectedByAuditor = order({ status_display: "Rejected", status: "REJECTED" });

    expect(getDecisionType(rejectedByAuditor, "billing")).toBe("accepted");
    expect(getDecisionType(rejectedByAuditor, "auditor")).toBe("rejected");
  });
});

describe("the rate approver's view", () => {
  it("counts a rate rejection as a rejection", () => {
    expect(
      getDecisionType(order({ status_display: "Rate Approver Rejected" }), "rate_approver"),
    ).toBe("rejected");
  });

  it("counts any downstream status as an approval", () => {
    // An order cannot get past rate approval without being approved, so the
    // absence of a rejection downstream IS the approval.
    for (const status of ["Billing", "Billed", "Completed", "Auditor Approval"]) {
      expect(
        getDecisionType(order({ status_display: status }), "rate_approver"),
      ).toBe("accepted");
    }
  });
});

describe("what the API says outright wins", () => {
  it("trusts an explicit decision_type over the status label", () => {
    const explicit = order({ decision_type: "rejected", status_display: "Completed" });

    expect(getDecisionType(explicit, "auditor")).toBe("rejected");
  });

  it("falls through to matching when decision_type is absent or unusable", () => {
    expect(
      getDecisionType(order({ decision_type: undefined, status_display: "Billed" }), "auditor"),
    ).toBe("accepted");
  });
});

describe("an unrecognised status", () => {
  it("is `other`, so an unknown state is hidden rather than mislabelled", () => {
    // The alternative — defaulting to accepted or rejected — would put a
    // confident wrong answer on a tracking screen.
    expect(getDecisionType(order({ status_display: "Draft" }), "auditor")).toBe("other");
    expect(getDecisionType(order({}), "billing")).toBe("other");
  });
});

describe("getRateApproverApprovalDecision", () => {
  const withApprovals = (statuses: string[]) =>
    order({
      rate_approvals: statuses.map((status, i) => ({
        id: i,
        status,
        approver_name: `A${i}`,
      })),
    } as Partial<Order>);

  it("lets one refusal outweigh any number of approvals", () => {
    expect(getRateApproverApprovalDecision(withApprovals(["APPROVED", "REJECTED"]))).toBe(
      "rejected",
    );
  });

  it("accepts when every recorded approver approved", () => {
    expect(getRateApproverApprovalDecision(withApprovals(["APPROVED", "APPROVED"]))).toBe(
      "accepted",
    );
  });

  it("says nothing while everyone is still pending", () => {
    expect(getRateApproverApprovalDecision(withApprovals(["PENDING"]))).toBeUndefined();
    expect(getRateApproverApprovalDecision(order({}))).toBeUndefined();
  });
});

describe("normalizeTrackingOrders", () => {
  it("stamps the approver's verdict on, for that mode only", () => {
    const items = [
      order({ rate_approvals: [{ id: 1, status: "REJECTED", approver_name: "A" }] } as Partial<Order>),
    ];

    expect(normalizeTrackingOrders(items, "rate_approver")[0].decision_type).toBe(
      "rejected",
    );
    // The other two read the status label instead; stamping there would
    // override what their own desk actually did.
    expect(normalizeTrackingOrders(items, "auditor")[0].decision_type).toBeUndefined();
  });

  it("leaves an order alone when no approver has voted", () => {
    const items = [order({ status_display: "Billing" })];

    expect(normalizeTrackingOrders(items, "rate_approver")[0]).toBe(items[0]);
  });
});
