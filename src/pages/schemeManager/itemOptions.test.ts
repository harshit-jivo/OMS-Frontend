/**
 * The scheme editor's product pickers, narrowed to the scheme's category.
 *
 * A scheme is written for ONE category and the editor asks for it in step 1,
 * but every picker after that offered the whole catalogue. That is not only
 * noise: `resolve_schemes` walls schemes off by category, so a trigger picked
 * from the wrong one produced a scheme that silently never fired.
 *
 * These import the REAL functions the hook uses. They used to re-implement the
 * rule locally, and the copy left out the de-duplication step — which is
 * exactly where the bug was, so the copy passed while the page was broken. If
 * the rule moves, these fail rather than drift.
 */
import { describe, expect, it } from "vitest";

import { itemNameResolver, pickerOptions, schemeCatalogue } from "./components/productOptions";
import type { CatalogueItem } from "./types";

/**
 * FG0000306 is the real collision: one code, three unrelated products. The
 * OIL row is deliberately NOT first, because the catalogue arrives ordered by
 * item_code with no tie-breaker and the old code kept whichever came first.
 */
const RAW: CatalogueItem[] = [
  { item_code: "FG0000306", item_name: "PUMPKIN SEEDS 400 GM", category: "MART" },
  { item_code: "FG0000306", item_name: "GLASS BOTTLE 200 MLS BLUEBERRY", category: "BEVERAGES" },
  { item_code: "FG0000306", item_name: "YELLOW MUSTARD OIL 1 LTR", category: "OIL" },
  { item_code: "FG0000003", item_name: "Cold Press 5 Ltr Combo", category: "MART" },
  { item_code: "FG0000031", item_name: "Mustard Pakki Ghani 1 Ltr", category: "MART" },
  { item_code: "FG0000004", item_name: "Cold Press 5 Ltr", category: "OIL" },
  { item_code: "FG0000009", item_name: "Jivo Water 1 Ltr", category: "BEVERAGES" },
  { item_code: "FG0000010", item_name: "Unmapped Item", category: "" },
  // Not finished goods: two thirds of the real catalogue looks like this.
  { item_code: "PM0000001", item_name: "Carton 5 Ltr", category: "OIL" },
  { item_code: "RM0000001", item_name: "Mustard seed", category: "OIL" },
];

const CATALOGUE = schemeCatalogue(RAW);
const codesFor = (category: string) => pickerOptions(CATALOGUE, category).map((o) => o.value);

describe("schemeCatalogue", () => {
  it("keeps one row per code PER CATEGORY, not one per code", () => {
    // The bug: de-duplicating on the code alone dropped two of these three and
    // made the survivor's category decide who could ever find it again.
    const shared = CATALOGUE.filter((p) => p.item_code === "FG0000306");
    expect(shared.map((p) => p.category).sort()).toEqual(["BEVERAGES", "MART", "OIL"]);
  });

  it("drops anything that is not a finished good", () => {
    expect(CATALOGUE.map((p) => p.item_code)).not.toContain("PM0000001");
    expect(CATALOGUE.map((p) => p.item_code)).not.toContain("RM0000001");
  });

  it("collapses a genuine duplicate — same code AND same category", () => {
    const withDupe = schemeCatalogue([
      { item_code: "FG0000004", item_name: "Cold Press 5 Ltr", category: "OIL" },
      { item_code: "FG0000004", item_name: "Cold Press 5 Ltr", category: "oil" },
    ]);
    expect(withDupe).toHaveLength(1);
  });
});

describe("the scheme editor's product list", () => {
  it("finds a shared code when building a scheme for EACH category", () => {
    // The reported bug, from all three sides: FG0000306 is a live product in
    // every category, so every category must be able to pick it.
    for (const category of ["OIL", "BEVERAGES", "MART"]) {
      expect(codesFor(category)).toContain("FG0000306");
    }
  });

  it("names the shared code from the catalogue being written for", () => {
    // Half the bug was reachability; the other half was that the surviving row
    // carried the WRONG name, so an OIL scheme offered "PUMPKIN SEEDS".
    const nameIn = (category: string) =>
      pickerOptions(CATALOGUE, category).find((o) => o.value === "FG0000306")?.label;
    expect(nameIn("OIL")).toBe("YELLOW MUSTARD OIL 1 LTR");
    expect(nameIn("BEVERAGES")).toBe("GLASS BOTTLE 200 MLS BLUEBERRY");
    expect(nameIn("MART")).toBe("PUMPKIN SEEDS 400 GM");
  });

  it("shows only MART products for a MART scheme", () => {
    expect(codesFor("MART").sort()).toEqual(["FG0000003", "FG0000031", "FG0000306"]);
  });

  it("shows only OIL products for an OIL scheme", () => {
    expect(codesFor("OIL").sort()).toEqual(["FG0000004", "FG0000306"]);
  });

  it("shows only BEVERAGES products for a beverages scheme", () => {
    expect(codesFor("BEVERAGES").sort()).toEqual(["FG0000009", "FG0000306"]);
  });

  it("matches case-insensitively and ignores surrounding space", () => {
    expect(codesFor("mart")).toEqual(codesFor("MART"));
    expect(codesFor("  Oil  ")).toEqual(codesFor("OIL"));
  });

  it('offers each code once for "Every category"', () => {
    // A blank category is a real choice in step 1, not an absence of one, and
    // such a scheme matches on the code alone — so one row per code, and no
    // duplicate option values for the list to key on.
    const codes = codesFor("");
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("FG0000306");
  });

  it("falls back to the whole catalogue rather than showing nothing", () => {
    // A category with no products mapped is a data gap. An empty picker would
    // read as a broken page, and would block the scheme from being written.
    expect(codesFor("COSMETICS")).toEqual(codesFor(""));
  });

  it("carries the code and category as the searchable hint", () => {
    // People set schemes up by NAME; the code is what the engine matches on,
    // so it stays visible and searchable beside it.
    const option = pickerOptions(CATALOGUE, "OIL").find((o) => o.value === "FG0000306");
    expect(option?.hint).toContain("FG0000306");
    expect(option?.hint).toContain("OIL");
  });
});

/**
 * Naming a code that two catalogues share.
 *
 * `describeTrigger` / `describeBenefit` take an `ItemNameResolver` — a bare
 * `(code) => name` — so the category has to be bound BEFORE it is handed over.
 * Unbound, an OIL scheme's trigger was described with a MART product's name.
 * The live `1+1 CP` scheme does exactly this: an OIL scheme triggering on
 * FG0000033, a code that also exists in MART.
 */
describe("itemNameResolver", () => {
  const nameIn = itemNameResolver(CATALOGUE);

  it("names a shared code from the category being described", () => {
    expect(nameIn("OIL")("FG0000306")).toBe("YELLOW MUSTARD OIL 1 LTR");
    expect(nameIn("MART")("FG0000306")).toBe("PUMPKIN SEEDS 400 GM");
    expect(nameIn("BEVERAGES")("FG0000306")).toBe("GLASS BOTTLE 200 MLS BLUEBERRY");
  });

  it("is case- and space-insensitive about the category", () => {
    expect(nameIn(" oil ")("FG0000306")).toBe("YELLOW MUSTARD OIL 1 LTR");
  });

  it("still names the code when the scheme has no category", () => {
    // "Every category" is a real choice; falling through to no name at all
    // would read as missing data rather than an unscoped scheme.
    expect(nameIn("")("FG0000306")).toBeTruthy();
    expect(nameIn(null)("FG0000004")).toBe("Cold Press 5 Ltr");
    expect(nameIn(undefined)("FG0000004")).toBe("Cold Press 5 Ltr");
  });

  it("falls back rather than blanking when the code is not in that category", () => {
    // FG0000004 is OIL only; a MART scheme referencing it is a data problem,
    // but showing the bare code would hide which product it means.
    expect(nameIn("MART")("FG0000004")).toBe("Cold Press 5 Ltr");
  });

  it("returns the code itself for something not in the catalogue", () => {
    expect(nameIn("OIL")("FG-NOPE")).toBe("FG-NOPE");
  });
});
