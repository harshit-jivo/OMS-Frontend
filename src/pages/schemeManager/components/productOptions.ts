/**
 * The catalogue as `SearchSelect` options, once.
 *
 * Every item field on this page used to be a hand-rolled `ItemPicker`, on
 * the grounds that people set up schemes by product NAME, not FG code. That
 * is still true; the picker is `ui/dropdown`'s `SearchSelect` now, which
 * searches the label and the hint (name and code) and caps what it mounts —
 * the cap the old picker also had, silently.
 */
import type { SearchSelectOption } from "@/components/ui/dropdown";

import { isFinishedGood } from "../schemeManagerHelpers";
import type { CatalogueItem } from "../types";

/** Rows mounted at once. The catalogue runs to thousands; typing narrows it. */
export const PRODUCT_PICKER_LIMIT = 80;

export const productOptions = (products: CatalogueItem[]): SearchSelectOption<string>[] =>
  products.map((p) => ({
    value: p.item_code,
    label: p.item_name,
    hint: p.category ? `${p.item_code} · ${p.category}` : p.item_code,
  }));

const normalised = (value: string | null | undefined) =>
  String(value ?? "").trim().toUpperCase();

/**
 * The sellable catalogue a scheme can be written against.
 *
 * Finished goods only: the catalogue also carries PM (packing material), RM
 * (raw material), CG and SC — about two thirds of it — and none of those can be
 * sold, so none can trigger a scheme or be given away.
 *
 * De-duplicated on (item_code, CATEGORY), NOT on item_code alone. That
 * distinction is the whole point: an FG code is reused across the three
 * catalogues and names a DIFFERENT product in each — FG0000306 is YELLOW
 * MUSTARD OIL 1 LTR in OIL, a blueberry glass bottle in BEVERAGES and PUMPKIN
 * SEEDS 400 GM in MART. De-duplicating by code kept one row per code and threw
 * the other two away, so 198 codes that exist in OIL could not be found when
 * writing an OIL scheme; the picker had already discarded them as MART or
 * BEVERAGES rows. Which one survived was not even stable — `/sap/products/`
 * orders by `item_code` with no tie-breaker.
 */
export const schemeCatalogue = (raw: CatalogueItem[]): CatalogueItem[] => {
  const seen = new Set<string>();
  return raw.filter((p) => {
    if (!isFinishedGood(p.item_code)) return false;
    // Keyed as a JSON pair rather than a joined string: no separator
    // character can then collide with one inside a code or a category.
    const key = JSON.stringify([p.item_code, normalised(p.category)]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Names an item code IN A GIVEN CATEGORY: `resolver(scheme.category)(code)`.
 *
 * Curried because that is the shape `describeTrigger` / `describeBenefit`
 * already take — an `ItemNameResolver`, `(code) => string`. Binding the
 * category here means those keep their signatures and every call site simply
 * passes a resolver that knows which catalogue it is describing.
 *
 * Falls back to the first row for the code when the category is blank or holds
 * no such product, so a name is always produced: an unnamed row would read as
 * missing data when it is really a category mismatch. `1+1 CP` is the live
 * example — an OIL scheme triggering on FG0000033, a code that also exists in
 * MART; without the category it was described with MART's row.
 */
export const itemNameResolver = (products: CatalogueItem[]) => {
  const byPair = new Map<string, string>();
  const byCode = new Map<string, string>();
  for (const p of products) {
    const pair = JSON.stringify([p.item_code, normalised(p.category)]);
    if (!byPair.has(pair)) byPair.set(pair, p.item_name);
    if (!byCode.has(p.item_code)) byCode.set(p.item_code, p.item_name);
  }
  return (category?: string | null) => (itemCode: string) => {
    const wanted = normalised(category);
    const inCategory = wanted
      ? byPair.get(JSON.stringify([itemCode, wanted]))
      : undefined;
    return inCategory ?? byCode.get(itemCode) ?? itemCode;
  };
};

/** One row per code, first wins — for the category-less view only. */
const oneRowPerCode = (products: CatalogueItem[]) => {
  const seen = new Set<string>();
  return products.filter((p) => {
    if (seen.has(p.item_code)) return false;
    seen.add(p.item_code);
    return true;
  });
};

/**
 * The picker list for a scheme written against `category`.
 *
 * Built from that category's OWN rows, so the name shown is that catalogue's
 * name — picking FG0000306 for an OIL scheme reads "YELLOW MUSTARD OIL 1 LTR",
 * not "PUMPKIN SEEDS 400 GM".
 *
 * A blank category is a real choice in step 1 ("Every category"), and such a
 * scheme matches on the code alone, so that view collapses to one row per code.
 *
 * Falls back to the whole catalogue rather than showing an empty picker: a
 * category with no products mapped is a data gap, and hiding every option would
 * read as a broken page and block the scheme from being written at all.
 */
export const pickerOptions = (
  products: CatalogueItem[],
  category: string | null | undefined,
): SearchSelectOption<string>[] => {
  const wanted = normalised(category);
  if (!wanted) return productOptions(oneRowPerCode(products));
  const inCategory = products.filter((p) => normalised(p.category) === wanted);
  if (inCategory.length === 0) return productOptions(oneRowPerCode(products));
  return productOptions(inCategory);
};
