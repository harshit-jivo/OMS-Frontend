import { describe, expect, it } from "vitest";

import { routeForNotification } from "./notificationRoutes";

describe("routeForNotification", () => {
  it("sends an approver to the desk with the request open", () => {
    expect(
      routeForNotification({ event_type: "CREDIT_LIMIT_AWAITING_APPROVAL", entity_id: 12 }),
    ).toBe("/Credit_Limit_Approval?request=12");
  });

  it("sends a batch notification (no entity) to the queue itself", () => {
    expect(routeForNotification({ event_type: "CREDIT_LIMIT_AWAITING_APPROVAL" })).toBe(
      "/Credit_Limit_Approval",
    );
  });

  it("sends the requester to their own request on a decision", () => {
    expect(routeForNotification({ event_type: "CREDIT_LIMIT_REJECTED", entity_id: "7" })).toBe(
      "/Credit_Limit?request=7",
    );
  });

  it("opens a payment request on the desk, or the creator's own", () => {
    expect(
      routeForNotification({ event_type: "ADVANCE_PAYMENT_AWAITING_APPROVAL", entity_id: 62 }),
    ).toBe("/Advance_Payment_Approval?request=62");
    expect(routeForNotification({ event_type: "ADVANCE_PAYMENT_RETURNED", entity_id: 62 })).toBe(
      "/Advance_Payment_Request?request=62",
    );
    expect(routeForNotification({ event_type: "ADVANCE_PAYMENT_ASSIGNED" })).toBe(
      "/Advance_Payment_Request",
    );
  });

  it("leaves everything else to the existing order routing", () => {
    expect(routeForNotification({ event_type: "ORDER_CREATED", entity_id: 1 })).toBeNull();
    expect(routeForNotification(null)).toBeNull();
  });
});
