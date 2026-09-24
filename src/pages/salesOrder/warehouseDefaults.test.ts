/**
 * Which warehouse a new order starts on.
 *
 * The bug these pin: a BEVERAGES user (kp) saw BH-BT — the OIL warehouse — on
 * Add Sales, even though `HANA_WAREHOUSE_CODE_BEVERAGES=BH-FG` was configured
 * and `/orders/defaults/` returned it correctly. The form fetches the defaults
 * and the user's profile in parallel; the defaults call is a settings read and
 * the profile call is a database query, so the defaults land first, while the
 * category is still "". The old code resolved that blank to OIL and filled the
 * field — and a filled field looked like a chosen one, so the right answer was
 * ignored when it arrived a moment later.
 */
import { describe, expect, it } from "vitest";

import { defaultWarehouseFor, warehouseBranchFor } from "./warehouseDefaults";

/** As `/orders/defaults/` returns it on live. */
const DEFAULTS = { OIL: "BH-BT", BEVERAGES: "BH-FG", MART: "BH-BT" };

describe("warehouseBranchFor", () => {
  it("maps a category to the HANA endpoint's spelling", () => {
    expect(warehouseBranchFor("BEVERAGES")).toBe("BEVERAGE");
    expect(warehouseBranchFor("beverage")).toBe("BEVERAGE");
    expect(warehouseBranchFor("MART")).toBe("MART");
    expect(warehouseBranchFor("OIL")).toBe("OIL");
  });

  it("ignores case and surrounding space", () => {
    expect(warehouseBranchFor("  Beverages ")).toBe("BEVERAGE");
  });

  it("still answers OIL for an unknown category, so the LIST has something to show", () => {
    expect(warehouseBranchFor("")).toBe("OIL");
    expect(warehouseBranchFor(null)).toBe("OIL");
    expect(warehouseBranchFor("COSMETICS")).toBe("OIL");
  });
});

describe("defaultWarehouseFor", () => {
  it("gives a beverages user BH-FG, not the OIL warehouse", () => {
    expect(defaultWarehouseFor("BEVERAGES", DEFAULTS)).toBe("BH-FG");
  });

  it("gives oil and mart their own defaults", () => {
    expect(defaultWarehouseFor("OIL", DEFAULTS)).toBe("BH-BT");
    expect(defaultWarehouseFor("MART", DEFAULTS)).toBe("BH-BT");
  });

  it("returns NOTHING while the category is still unknown", () => {
    // The whole bug. An empty answer leaves the field alone; an OIL answer
    // fills it with the wrong warehouse before the user's own category lands.
    expect(defaultWarehouseFor("", DEFAULTS)).toBe("");
    expect(defaultWarehouseFor(null, DEFAULTS)).toBe("");
    expect(defaultWarehouseFor(undefined, DEFAULTS)).toBe("");
    expect(defaultWarehouseFor("   ", DEFAULTS)).toBe("");
  });

  it("returns nothing before the defaults have arrived either", () => {
    expect(defaultWarehouseFor("BEVERAGES", {})).toBe("");
    expect(defaultWarehouseFor("BEVERAGES", null)).toBe("");
  });

  it("falls back to OIL for a real category the map has no entry for", () => {
    // Different from a blank category: this one IS known, there is simply no
    // warehouse configured for it, so the general default is the right answer.
    expect(defaultWarehouseFor("COSMETICS", DEFAULTS)).toBe("BH-BT");
  });

  it("survives the arrival order that caused the bug", () => {
    // 1. defaults land, category still unknown -> nothing is written
    expect(defaultWarehouseFor("", DEFAULTS)).toBe("");
    // 2. the profile lands -> the correct warehouse, first time and only time
    expect(defaultWarehouseFor("BEVERAGES", DEFAULTS)).toBe("BH-FG");
  });
});
