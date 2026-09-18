/**
 * The scheme editor's product pickers, narrowed to the scheme's category.
 *
 * A scheme is written for ONE category and the editor asks for it in step 1,
 * but every picker after that offered the whole catalogue. That is not only
 * noise: `resolve_schemes` walls schemes off by category, so a trigger picked
 * from the wrong one produced a scheme that silently never fired.
 *
 * The filter itself is a `useMemo` inside `useSchemeManager`; this pins the
 * rule it implements, against the same shape the hook works with.
 */
import { describe, expect, it } from "vitest";

import { productOptions } from "./components/productOptions";
import type { CatalogueItem } from "./types";

const PRODUCTS: CatalogueItem[] = [
  { item_code: "FG0000003", item_name: "Cold Press 5 Ltr Combo", category: "MART" },
  { item_code: "FG0000031", item_name: "Mustard Pakki Ghani 1 Ltr", category: "MART" },
  { item_code: "FG0000004", item_name: "Cold Press 5 Ltr", category: "OIL" },
  { item_code: "FG0000009", item_name: "Jivo Water 1 Ltr", category: "BEVERAGES" },
  { item_code: "FG0000010", item_name: "Unmapped Item", category: "" },
];

/** The rule `useSchemeManager` applies. Kept in step with it deliberately. */
const narrow = (category: string) => {
  const all = productOptions(PRODUCTS);
  const wanted = category.trim().toUpperCase();
  if (!wanted) return all;
  const inCategory = new Set(
    PRODUCTS.filter((p) => (p.category || "").trim().toUpperCase() === wanted).map(
      (p) => p.item_code,
    ),
  );
  if (inCategory.size === 0) return all;
  return all.filter((option) => inCategory.has(option.value));
};

describe("the scheme editor's product list", () => {
  it("shows only MART products for a MART scheme", () => {
    expect(narrow("MART").map((o) => o.value)).toEqual(["FG0000003", "FG0000031"]);
  });

  it("shows only OIL products for an OIL scheme", () => {
    expect(narrow("OIL").map((o) => o.value)).toEqual(["FG0000004"]);
  });

  it("shows only BEVERAGES products for a beverages scheme", () => {
    expect(narrow("BEVERAGES").map((o) => o.value)).toEqual(["FG0000009"]);
  });

  it('keeps the whole catalogue for "Every category"', () => {
    // A blank category is a real choice in step 1, not an absence of one.
    expect(narrow("")).toHaveLength(PRODUCTS.length);
  });

  it("matches case-insensitively", () => {
    expect(narrow("mart").map((o) => o.value)).toEqual(["FG0000003", "FG0000031"]);
  });

  it("falls back to the whole catalogue rather than showing nothing", () => {
    // A category with no products mapped is a data gap. An empty picker would
    // read as a broken page, and would block the scheme from being written at
    // all.
    expect(narrow("COSMETICS")).toHaveLength(PRODUCTS.length);
  });

  it("carries the code and category as the searchable hint", () => {
    // People set schemes up by NAME; the code is what the engine matches on,
    // so it stays visible and searchable beside it.
    const [first] = narrow("MART");
    expect(first.label).toBe("Cold Press 5 Ltr Combo");
    expect(first.hint).toContain("FG0000003");
  });
});
