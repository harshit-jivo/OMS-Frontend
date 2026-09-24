/**
 * Which warehouse a new order starts on.
 *
 * The codes live in the backend environment (`HANA_WAREHOUSE_CODE` and the
 * beverages variant) and reach the form through `/orders/defaults/`, keyed by
 * category. Two things then have to agree: which HANA schema lists the
 * warehouses, and which of those defaults applies.
 *
 * Pure, and separate from the hook, because the bug these encode was invisible
 * in a `useMemo`: the form fetches `/orders/defaults/` and `/auth/profile/` in
 * parallel on mount, and the defaults call is a plain settings read while the
 * profile call hits the database — so the defaults essentially always land
 * first, while the user's own category is still unknown.
 */

/** The HANA endpoint's spelling — "BEVERAGE" singular, unlike the category. */
export type WarehouseBranch = "OIL" | "BEVERAGE" | "MART";

const normalised = (value: unknown) => String(value ?? "").trim().toLowerCase();

/**
 * Which company's warehouses to LIST.
 *
 * Falls back to OIL for an unknown or not-yet-loaded category: the picker needs
 * something to show, and OIL is the largest catalogue. That fallback is safe
 * HERE — it only decides what is listed — and unsafe for the default value,
 * which is why `defaultWarehouseFor` does not share it.
 */
export const warehouseBranchFor = (category: unknown): WarehouseBranch => {
  const c = normalised(category);
  if (c === "beverages" || c === "beverage") return "BEVERAGE";
  if (c === "mart") return "MART";
  return "OIL";
};

/**
 * The default warehouse CODE for a category, or "" when there is not one yet.
 *
 * Returns "" for a blank category rather than falling back to OIL. A BEVERAGES
 * user's profile arrives a moment after the defaults do, and filling the field
 * with OIL's warehouse in that gap put BH-BT on screen when BH-FG was meant —
 * the form then kept it, because a filled field looks like a chosen one.
 *
 * An unrecognised but non-blank category DOES fall back to OIL: that is a real
 * answer for a real category the defaults map has no entry for, not a gap
 * waiting to be filled.
 */
export const defaultWarehouseFor = (
  category: unknown,
  defaults: Record<string, string> | null | undefined,
): string => {
  if (!normalised(category)) return "";
  const map = defaults || {};
  const branch = warehouseBranchFor(category);
  const key = branch === "BEVERAGE" ? "BEVERAGES" : branch;
  return map[key] || map.OIL || "";
};
