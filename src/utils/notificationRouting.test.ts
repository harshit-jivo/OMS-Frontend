import { describe, expect, it } from "vitest";

import {
  routeForNotification,
  routeFromSearchParams,
} from "./notificationRouting";

/**
 * The map from "what happened" to "where that is on screen".
 *
 * Every case here failed in production before this module existed: a BackDate
 * notification carries no `order_id`, so every click path fell through to the
 * orders route and the user landed on `/Home?notificationId=264` — the right
 * alert, the wrong screen, and no way to reach the request it was about.
 */
describe("routeForNotification", () => {
  it("sends an approver to the desk where the buttons are", () => {
    expect(
      routeForNotification({
        entity_type: "backdate",
        entity_id: 138,
        event_type: "BACKDATE_AWAITING_APPROVAL",
      }),
    ).toEqual({ pathname: "/BackDate_Approval", search: "?requestId=138" });
  });

  it("sends a requester to their own list", () => {
    // Approved and rejected both reach the person who RAISED it, and their
    // screen is /BackDate — the approval desk would show them nothing they
    // can do and no reason why.
    for (const event of ["BACKDATE_APPROVED", "BACKDATE_REJECTED"]) {
      expect(
        routeForNotification({
          entity_type: "backdate",
          entity_id: 7,
          event_type: event,
        }),
      ).toEqual({ pathname: "/BackDate", search: "?requestId=7" });
    }
  });

  it("matches the entity type case-insensitively", () => {
    expect(
      routeForNotification({ entity_type: "BackDate", entity_id: 3 }),
    ).toEqual({ pathname: "/BackDate", search: "?requestId=3" });
  });

  it("declines an entity this client has no screen for", () => {
    // `null` is a real answer: the caller keeps its existing behaviour rather
    // than navigating somewhere wrong.
    expect(
      routeForNotification({ entity_type: "purchaseorder", entity_id: 1 }),
    ).toBeNull();
  });

  it("declines an order notification, leaving the order route alone", () => {
    expect(routeForNotification({ event_type: "ORDER_APPROVED" })).toBeNull();
    expect(routeForNotification(null)).toBeNull();
  });

  it("declines an entity with no id rather than opening the bare list", () => {
    expect(
      routeForNotification({ entity_type: "backdate", entity_id: null }),
    ).toBeNull();
    expect(
      routeForNotification({ entity_type: "backdate", entity_id: "" }),
    ).toBeNull();
  });
});

describe("routeForNotification — production orders", () => {
  it("sends an approver to the desk where the buttons are", () => {
    expect(
      routeForNotification({
        entity_type: "productionorder",
        entity_id: 412,
        event_type: "PRDO_AWAITING_APPROVAL",
      }),
    ).toEqual({ pathname: "/Production_Approval", search: "?orderId=412" });
  });

  it("sends everyone else to the order list", () => {
    // PRDO has no requester — SAP raised it — so these reach whoever approved
    // it earlier in the chain, and their screen is the list.
    for (const event of ["PRDO_APPROVED", "PRDO_REJECTED"]) {
      expect(
        routeForNotification({
          entity_type: "productionorder",
          entity_id: 9,
          event_type: event,
        }),
      ).toEqual({ pathname: "/Production_Orders", search: "?orderId=9" });
    }
  });

  it("does not confuse the two modules' id params", () => {
    // `?requestId=` and `?orderId=` are read by different pages. Crossing them
    // would open the right page on no record at all, silently.
    const backdate = routeForNotification({
      entity_type: "backdate",
      entity_id: 1,
    });
    const production = routeForNotification({
      entity_type: "productionorder",
      entity_id: 1,
    });
    expect(backdate?.search).toBe("?requestId=1");
    expect(production?.search).toBe("?orderId=1");
  });
});

describe("routeFromSearchParams", () => {
  it("resolves the cold-start URL the service worker opens", () => {
    // No tab was open, so the worker could not ask anything to navigate; it
    // opened "/" with the entity in the query string instead.
    expect(
      routeFromSearchParams(
        "?notificationId=264&entityType=backdate&entityId=138" +
          "&eventType=BACKDATE_AWAITING_APPROVAL",
      ),
    ).toEqual({ pathname: "/BackDate_Approval", search: "?requestId=138" });
  });

  it("is silent on an ordinary page load", () => {
    expect(routeFromSearchParams("")).toBeNull();
    expect(routeFromSearchParams("?tab=create")).toBeNull();
    // An orders deep-link still belongs to the orders path, not this one.
    expect(routeFromSearchParams("?openOrderId=91")).toBeNull();
  });
});
