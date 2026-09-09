import { getOrderItemTotalLtrs } from "@/services/ordersService";
import type { Order, OrderItem } from "@/services/ordersService";
import type { BadgeTone } from "@/components/ui/badge";

/**
 * The arithmetic and the vocabulary an order detail view needs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A MODULE AND NOT FOUR COPIES
 * ─────────────────────────────────────────────────────────────────────────
 * `View_Orders`, `Auditor_Order`, `Billing_Order` and `Rate_Approver_Order`
 * each show the same order, and each computed its totals inline in the
 * markup. In three of the four the subtotal and the tax were summed TWICE —
 * once for their own row and again inside the grand total — so a change to
 * how tax is derived had eight places to land and no test could see any of
 * them.
 *
 * The variety vocabulary was worse: PREMIUM / COMMODITY / OTHERS is SAP's own
 * product split (`OITM.U_TYPE`), and each page had invented its own casing and
 * its own colour for it. The same order read "Premium" in violet on one screen
 * and "PREMIUM" in amber on the next.
 */

/** Everything the totals row shows, derived once. */
export type OrderTotals = {
  litres: number;
  subtotal: number;
  tax: number;
  grand: number;
};

export function orderTotals(items: OrderItem[]): OrderTotals {
  const litres = items.reduce((sum, item) => sum + getOrderItemTotalLtrs(item), 0);
  const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const tax = items.reduce(
    (sum, item) => sum + (Number(item.total || 0) * Number(item.tax_rate || 0)) / 100,
    0,
  );
  return { litres, subtotal, tax, grand: subtotal + tax };
}

/**
 * A stable colour per variety, so the same category reads the same way on
 * every screen. `Other` stays neutral: it is the absence of a classification,
 * not a third one.
 */
export const VARIETY_TONE: Record<string, BadgeTone> = {
  Commodity: "info",
  Premium: "note",
  Other: "neutral",
};

/** SAP sends these uppercase. Sentence case, because a table is not a shout. */
export const titleCaseVariety = (value: string): string => {
  const text = String(value).trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

export const varietyBadgeTone = (value: string): BadgeTone =>
  VARIETY_TONE[titleCaseVariety(value)] ?? "neutral";

export type VarietyCost = { label: string; value: number };

/**
 * The variety breakdown, with the empty ones dropped.
 *
 * A zero here means SAP returned no lines of that type, which is not the same
 * as a variety costing nothing — showing "Other: 0.00" invites the reader to
 * treat an absence as a measurement. (`vareity_cost` is the API's spelling.)
 */
export function varietyCosts(order: Order | null | undefined): VarietyCost[] {
  return [
    { label: "Commodity", value: Number(order?.vareity_cost?.commodity_price ?? 0) },
    { label: "Other", value: Number(order?.vareity_cost?.other_total ?? 0) },
    { label: "Premium", value: Number(order?.vareity_cost?.premium_total ?? 0) },
  ].filter((entry) => entry.value > 0);
}

/**
 * Status predicates.
 *
 * Substring matching on a display string is not lovely, and it is what the API
 * gives: statuses arrive as human labels ("Rejected by Auditor"), and the
 * numeric ids are not on the list payload. Kept in one place so the looseness
 * is visible rather than repeated in six files.
 *
 * The parameter is `string | null | undefined` rather than `Pick<Order, ...>`
 * on purpose: `Order` types the field as a plain `string`, but the guards
 * below have always coerced it, which is the code saying it does not believe
 * that. Typing what the functions actually accept makes the disagreement
 * visible instead of forcing a cast at every call site.
 */
export const isRejectedOrder = (order: { status_display?: string | null }) =>
  String(order.status_display || "")
    .toLowerCase()
    .includes("reject");

export const isCompletedOrder = (order: { status_display?: string | null }) =>
  String(order.status_display || "")
    .trim()
    .toLowerCase() === "completed";
