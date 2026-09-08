/**
 * The branch a Sales Invoice runs against, derived from the user's categories.
 *
 * Everything downstream of the branch — the customer list, the open orders,
 * the price list, the stock position — is branch-specific. The gate used to
 * offer both branches to everyone, so someone assigned only to Oil could pick
 * Beverage and work a book that was never theirs. These tests pin the mapping
 * and, more importantly, pin the two states that are easy to conflate:
 * "assigned nothing" (offer the choice) and "assigned one" (do not ask).
 */
import { describe, expect, it } from "vitest";

import { branchesForCategories } from "./useSalesInvoice";

describe("branchesForCategories", () => {
  it("maps OIL to the oil branch", () => {
    expect(branchesForCategories(["OIL"])).toEqual(["OIL"]);
  });

  it("maps both spellings of the beverage category", () => {
    // The category master says BEVERAGES; the branch is BEVERAGE.
    expect(branchesForCategories(["BEVERAGES"])).toEqual(["BEVERAGE"]);
    expect(branchesForCategories(["BEVERAGE"])).toEqual(["BEVERAGE"]);
  });

  it("returns both branches for a user assigned both categories", () => {
    expect(new Set(branchesForCategories(["OIL", "BEVERAGES"]))).toEqual(
      new Set(["OIL", "BEVERAGE"]),
    );
  });

  it("does not repeat a branch reached by two category spellings", () => {
    expect(branchesForCategories(["BEVERAGE", "BEVERAGES"])).toEqual(["BEVERAGE"]);
  });

  it("is empty for no categories at all", () => {
    // Which the caller reads as "we cannot narrow it" and shows the full
    // choice — NOT as "no branches allowed".
    expect(branchesForCategories([])).toEqual([]);
  });

  it("is empty for MART, which Sales Invoice does not serve", () => {
    expect(branchesForCategories(["MART"])).toEqual([]);
  });

  it("ignores an unrecognised category rather than guessing a branch", () => {
    expect(branchesForCategories(["Cosmetics"])).toEqual([]);
    expect(branchesForCategories(["Cosmetics", "Oil"])).toEqual(["OIL"]);
  });

  it("tolerates the casing and padding storage can hand back", () => {
    expect(branchesForCategories([" oil "])).toEqual(["OIL"]);
  });
});
