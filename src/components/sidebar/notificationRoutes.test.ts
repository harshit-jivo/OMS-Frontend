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

  it("routes a row taken straight from the bell's list", () => {
    // What `handleNotificationClick` now passes it: a whole notification as
    // the history endpoint returned it, not a hand-built payload. Until that
    // handler called this, clicking a payment-request notification in the bell
    // opened the order list with nothing selected - the row carries no
    // `order_id`, because it is not about an order.
    const fromTheList = {
      id: 9838,
      key: "framework:9838",
      source: "framework" as const,
      title: "Payment request awaiting you",
      message: "AP-84 - a vendor - Rs 5,000 (OIL)",
      is_read: false,
      created_at: "2026-10-13T07:40:00Z",
      event_type: "ADVANCE_PAYMENT_AWAITING_APPROVAL",
      entity_id: 84,
      entity_type: "advancerequest",
    };
    expect(routeForNotification(fromTheList)).toBe("/Advance_Payment_Approval?request=84");
  });

  it("sends an Orders row back to the order routing, as before", () => {
    // Orders rows carry no event, so this must keep returning null and let
    // `goToOrder` handle them - the second feed must not capture the first.
    const ordersRow = {
      id: 9,
      message: "Order SO-1 needs approval",
      is_read: false,
      created_at: "2026-10-13T07:40:00Z",
      order_id: 1,
    };
    expect(routeForNotification(ordersRow)).toBeNull();
  });

  it("leaves everything else to the existing order routing", () => {
    expect(routeForNotification({ event_type: "ORDER_CREATED", entity_id: 1 })).toBeNull();
    expect(routeForNotification(null)).toBeNull();
  });
});
