import { describe, expect, it } from "vitest";

import {
  isCompletedOrder,
  isRejectedOrder,
  orderTotals,
  titleCaseVariety,
  varietyBadgeTone,
  varietyCosts,
} from "./orderDetail";
import type { Order, OrderItem } from "@/services/ordersService";

/**
 * The arithmetic four order screens used to do inline in their markup.
 *
 * `orderTotals` is the one that matters: three of the four summed the
 * subtotal and the tax TWICE — once for their own row, again inside the grand
 * total — so the grand total could not be checked against its parts.
 */

const line = (total: number, taxRate: number, ltrs = 0): OrderItem =>
  ({ total, tax_rate: taxRate, ltrs, qty: 0, boxes: 0 }) as OrderItem;

describe("orderTotals", () => {
  it("sums the lines and derives tax per line, not on the subtotal", () => {
    // Two lines at different tax rates: 100 @ 5% and 200 @ 12% is 5 + 24 = 29.
    // Applying one blended rate to the subtotal would give a different number,
    // and that is the mistake this shape prevents.
    const totals = orderTotals([line(100, 5), line(200, 12)]);

    expect(totals.subtotal).toBe(300);
    expect(totals.tax).toBeCloseTo(29, 10);
    expect(totals.grand).toBeCloseTo(329, 10);
  });

  it("makes the grand total exactly subtotal plus tax", () => {
    const totals = orderTotals([line(1000, 5), line(500, 5)]);

    expect(totals.grand).toBeCloseTo(totals.subtotal + totals.tax, 10);
  });

  it("returns zeroes for an order with no lines", () => {
    expect(orderTotals([])).toEqual({ litres: 0, subtotal: 0, tax: 0, grand: 0 });
  });

  it("treats a missing total or tax rate as zero, not NaN", () => {
    // A NaN here renders as "NaN" in a KPI card rather than failing anywhere.
    const totals = orderTotals([{ } as OrderItem]);

    expect(Number.isNaN(totals.grand)).toBe(false);
    expect(totals.grand).toBe(0);
  });
});

describe("variety vocabulary", () => {
  it("sentence-cases what SAP sends in caps", () => {
    expect(titleCaseVariety("PREMIUM")).toBe("Premium");
    expect(titleCaseVariety("commodity")).toBe("Commodity");
  });

  it("survives an empty value", () => {
    expect(titleCaseVariety("")).toBe("");
    expect(titleCaseVariety("   ")).toBe("");
  });

  it("gives each variety a stable tone, whatever the casing", () => {
    // The same order read "Premium" in violet on one screen and "PREMIUM" in
    // amber on the next, because each page had its own map.
    expect(varietyBadgeTone("PREMIUM")).toBe(varietyBadgeTone("premium"));
    expect(varietyBadgeTone("COMMODITY")).toBe("info");
    expect(varietyBadgeTone("PREMIUM")).toBe("note");
  });

  it("falls back to neutral for a variety it has never heard of", () => {
    expect(varietyBadgeTone("SOMETHING_NEW")).toBe("neutral");
  });
});

describe("varietyCosts", () => {
  const order = (cost: Record<string, number>) =>
    ({ vareity_cost: cost }) as unknown as Order;

  it("drops the varieties the order has none of", () => {
    // Zero means SAP returned no lines of that type — not that the variety
    // cost nothing. Showing "Other: 0.00" invites reading an absence as a
    // measurement.
    const costs = varietyCosts(
      order({ commodity_price: 120, other_total: 0, premium_total: 30 }),
    );

    expect(costs.map((c) => c.label)).toEqual(["Commodity", "Premium"]);
  });

  it("returns nothing for an order with no variety cost at all", () => {
    expect(varietyCosts(null)).toEqual([]);
    expect(varietyCosts({} as Order)).toEqual([]);
  });
});

describe("status predicates", () => {
  it("matches a rejection however the label is worded", () => {
    expect(isRejectedOrder({ status_display: "Rejected by Auditor" })).toBe(true);
    expect(isRejectedOrder({ status_display: "Billing Rejected" })).toBe(true);
    expect(isRejectedOrder({ status_display: "Approved" })).toBe(false);
  });

  it("matches completed exactly, so 'Not completed' is not completed", () => {
    expect(isCompletedOrder({ status_display: "Completed" })).toBe(true);
    expect(isCompletedOrder({ status_display: " completed " })).toBe(true);
    expect(isCompletedOrder({ status_display: "Not completed" })).toBe(false);
  });

  it("treats a missing status as neither", () => {
    expect(isRejectedOrder({ status_display: null })).toBe(false);
    expect(isCompletedOrder({ status_display: null })).toBe(false);
  });
});
