/**
 * The arithmetic an invoice is made of.
 *
 * None of this could be tested before: it lived inside the Add Sales component,
 * closed over its state, and the only way to exercise a pack factor was to
 * mount 4,000 lines of page and type into a box. So the numbers that decide
 * what a customer is charged had no test at all, while the badge colours had
 * seventy.
 */
import { describe, expect, it } from "vitest";

import type { PartyProduct } from "@/services/ordersService";

import { createEmptyRow, type SalesRow } from "../salesOrderRow";
import {
  FOC_TOKEN_BASIC_PRICE,
  applyFocPricingToRow,
  computeLandingPrice,
  recalculateRowTotals,
} from "./rowTotals";

/** A 12-piece carton of 1-litre bottles at 107 a piece, 5% tax. */
const PRODUCT = {
  item_code: "JV-CAN-1L",
  item_name: "JIVO CANOLA OIL 1 LTR",
  sal_factor2: 12,
  sal_pack_unit: 1,
} as unknown as PartyProduct;

const row = (overrides: Partial<SalesRow> = {}): SalesRow => ({
  ...createEmptyRow(),
  category: "Edible Oil",
  item: "JIVO CANOLA OIL 1 LTR",
  type: "1 LTR",
  pcs: "12",
  tax: "5",
  basicPrice: "107",
  ...overrides,
});

describe("computeLandingPrice", () => {
  it("adds the tax to the basic rate", () => {
    expect(computeLandingPrice(170, 5)).toBe("178.50");
  });

  it("is blank rather than 0.00 when there is no rate yet", () => {
    // A displayed "0.00" reads as a free item; blank reads as "not priced".
    expect(computeLandingPrice("", 5)).toBe("");
    expect(computeLandingPrice(0, 5)).toBe("");
  });

  it("treats a missing tax as no tax", () => {
    expect(computeLandingPrice(100, null)).toBe("100.00");
  });
});

describe("recalculateRowTotals", () => {
  it("turns boxes into pieces, litres and an amount", () => {
    const result = recalculateRowTotals(row({ boxes: "5" }), "boxes", PRODUCT, false);

    expect(result.qty).toBe("60"); // 5 boxes x 12 per box
    expect(result.ltrs).toBe("60"); // 60 pieces x 1 litre
    expect(result.amount).toBe("6420.00"); // 60 x 107, pre-tax
    expect(result.priceListBasic).toBe("112.35"); // 107 + 5%
  });

  it("turns pieces back into boxes", () => {
    const result = recalculateRowTotals(row({ qty: "60" }), "qty", PRODUCT, false);

    expect(result.boxes).toBe("5");
    expect(result.amount).toBe("6420.00");
  });

  it("reprices without touching either quantity", () => {
    const before = row({ boxes: "5", qty: "60" });

    const result = recalculateRowTotals({ ...before, basicPrice: "120" }, "price", PRODUCT, false);

    expect(result.boxes).toBe("5");
    expect(result.qty).toBe("60");
    expect(result.amount).toBe("7200.00");
  });

  it("does not mutate the row it is given", () => {
    // The whole point of step 4. Its one caller used to hand it a fresh copy,
    // which made the mutation invisible; react-hook-form hands out the live
    // field object, where it would not be.
    const original = row({ boxes: "5" });
    const snapshot = JSON.stringify(original);

    const result = recalculateRowTotals(original, "boxes", PRODUCT, false);

    expect(JSON.stringify(original)).toBe(snapshot);
    expect(result).not.toBe(original);
  });

  it("blanks the derived fields rather than writing zeros", () => {
    const result = recalculateRowTotals(row({ boxes: "0" }), "boxes", PRODUCT, false);

    expect(result.qty).toBe("");
    expect(result.ltrs).toBe("");
    expect(result.amount).toBe("");
  });

  it("falls back to one piece per box when the product has no pack size", () => {
    // `rowProblem` refuses to confirm such a row, naming the item master. This
    // fallback is what keeps the arithmetic from dividing by zero in the
    // meantime — it is a guard, not a pack size.
    const noFactor = { ...PRODUCT, sal_factor2: 0 } as unknown as PartyProduct;

    expect(recalculateRowTotals(row({ boxes: "5" }), "boxes", noFactor, false).qty).toBe("5");
  });

  it("returns the row untouched when the product is unknown", () => {
    const result = recalculateRowTotals(row({ boxes: "5" }), "boxes", undefined, false);

    expect(result.qty).toBe("");
    expect(result.amount).toBe("");
  });

  it("zeroes the price list and drops schemes on an FOC order", () => {
    const result = recalculateRowTotals(
      row({ boxes: "5", isScheme: true, schemes: [{ scheme: "7", schemeQty: "3" }] }),
      "boxes",
      PRODUCT,
      true,
    );

    expect(result.priceListBasic).toBe("0");
    expect(result.isScheme).toBe(false);
    expect(result.schemes).toEqual([]);
  });
});

describe("applyFocPricingToRow", () => {
  it("supplies the token rate when the line has no price of its own", () => {
    // An FOC line ships free, but a zero rate reaches SAP as either a
    // zero-value invoice (which generates no IRN) or — worse — falls through
    // to the price list and bills the customer in full. 0.001 is the rate the
    // billing team has always keyed by hand.
    const result = applyFocPricingToRow(row({ qty: "60", basicPrice: "" }));

    expect(result.basicPrice).toBe(FOC_TOKEN_BASIC_PRICE);
    expect(result.priceListBasic).toBe("0");
    expect(result.amount).toBe("0.06");
  });

  it("treats an explicit zero the same as a blank", () => {
    const result = applyFocPricingToRow(row({ qty: "10", basicPrice: "0" }));

    expect(result.basicPrice).toBe(FOC_TOKEN_BASIC_PRICE);
    expect(result.amount).toBe("0.01");
  });

  it("keeps a rate somebody actually typed", () => {
    // FOC lines are occasionally billed at a nominal rate the billing team
    // chooses. Overwriting a non-zero rate with the token would silently undo
    // that decision, so only a blank or a zero falls back.
    const result = applyFocPricingToRow(row({ qty: "60", basicPrice: "107" }));

    expect(result.basicPrice).toBe("107");
    expect(result.amount).toBe("6420.00");
  });

  it("STILL charges for goods priced before the order was marked FOC", () => {
    // The defect this file has documented all along, and it is NOT closed by
    // the token rate. On a FOC order the form now seeds 0.001 at
    // product-select time, and the backend substitutes the token whenever
    // `basic_price <= 0` — but an order PRICED FIRST and marked FOC afterwards
    // keeps its 107, on both sides, and invoices at 6,420.
    //
    // Kept as an assertion rather than a comment so that closing it is a
    // deliberate change with a failing test to prove it landed.
    const result = applyFocPricingToRow(row({ qty: "60", basicPrice: "107" }));

    expect(result.priceListBasic).toBe("0");
    expect(Number(result.amount)).toBeGreaterThan(0.06);
  });
});
