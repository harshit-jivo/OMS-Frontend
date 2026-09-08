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

import type { CatalogueItem } from "../types";

/** Rows mounted at once. The catalogue runs to thousands; typing narrows it. */
export const PRODUCT_PICKER_LIMIT = 80;

export const productOptions = (products: CatalogueItem[]): SearchSelectOption<string>[] =>
  products.map((p) => ({
    value: p.item_code,
    label: p.item_name,
    hint: p.category ? `${p.item_code} · ${p.category}` : p.item_code,
  }));
