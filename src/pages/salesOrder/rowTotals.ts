/**
 * The arithmetic of one order line: boxes to pieces, pieces to litres, price to
 * amount.
 *
 * These lived inside `useSalesOrderForm`, closed over its state, and so could
 * only be exercised by mounting the page and typing into it. They are the rules
 * an order's money comes from, which makes that the wrong place for them: a
 * wrong pack factor is a wrong invoice, and nothing here needs React to be
 * checked.
 *
 * Everything below is a pure function of its arguments. `recalculateRowTotals`
 * in particular returns a NEW row and never touches the one it is given — it
 * used to assign onto its argument, which was survivable only because its one
 * caller happened to pass a fresh copy. React-hook-form (plan step 6) hands out
 * the live field object, where that same code would mutate form state behind
 * the resolver's back.
 */
import type { PartyProduct, Product } from "@/services/ordersService";

import type { SalesRow } from "../salesOrderRow";

/**
 * Landing Price = Basic Price inclusive of tax: basic * (1 + tax%/100).
 * e.g. 170 @ 5% -> "178.50". Returns "" when there is no basic price yet.
 *
 * Basic Price stays the pre-tax rate — it is what SAP receives as UnitPrice —
 * and Landing is a display-only figure derived from it.
 */
export const computeLandingPrice = (
  basic: string | number | null | undefined,
  tax: string | number | null | undefined,
) => {
  const base = Number(basic) || 0;
  const taxRate = Number(tax) || 0;
  return base > 0 ? (base * (1 + taxRate / 100)).toFixed(2) : "";
};

/**
 * An FOC line: no schemes, nothing on the price list.
 *
 * KNOWN DEFECT, deliberately preserved here rather than fixed inside a
 * refactor: this zeroes `priceListBasic` but leaves `basicPrice` alone and then
 * prices the line off it, so an FOC order can ship `basic_price: 170` beside
 * `price_list_basic: 0`. The Basic Price input is editable on both forms, so it
 * is reachable. Fixing it changes what saved orders are worth, which is a
 * decision rather than a cleanup.
 */
/**
 * The rate an FOC line carries.
 *
 * An FOC line ships free, but SAP still needs a non-zero rate: an invoice
 * totalling 0 generates no IRN, so a token rate has always been keyed by hand
 * (0.001 on 70 lines, 0.01 on 105, 0.1 on 31). This is that convention as a
 * default, so nobody has to remember it. Kept in step with the backend's
 * `FOC_TOKEN_BASIC_PRICE` and sap_sync's `FOC_TOKEN_UNIT_PRICE`.
 */
export const FOC_TOKEN_BASIC_PRICE = "0.001";

/**
 * FOC pricing for one row.
 *
 * A rate the operator typed themselves is KEPT — only a blank or zero falls
 * back to the token. That matters: FOC lines are occasionally billed at a
 * nominal rate the billing team chooses, and overwriting it would silently
 * undo their decision.
 */
export const applyFocPricingToRow = (row: SalesRow): SalesRow => {
  const basicPrice = Number(row.basicPrice) > 0 ? row.basicPrice : FOC_TOKEN_BASIC_PRICE;
  return {
    ...row,
    isScheme: false,
    scheme: "",
    schemeQty: "",
    schemes: [],
    priceListBasic: "0",
    basicPrice,
    amount: Number(row.qty) > 0 ? (Number(row.qty) * Number(basicPrice)).toFixed(2) : "",
  };
};

/** Which number the user changed, and therefore which ones follow from it. */
export type RowTotalsSource = "boxes" | "qty" | "price";

/**
 * The row you get when one of its numbers changes.
 *
 * `product` supplies the pack size (`sal_factor2`, pieces per box) and the pack
 * unit (`sal_pack_unit`, litres per piece). Without one there is nothing to
 * derive, and the row comes back unchanged apart from FOC pricing.
 */
export const recalculateRowTotals = (
  row: SalesRow,
  source: RowTotalsSource,
  product: PartyProduct | Product | undefined,
  isFocOrder: boolean,
): SalesRow => {
  const withFoc = (next: SalesRow) => (isFocOrder ? applyFocPricingToRow(next) : next);

  if (!product) return withFoc(row);

  const factor = Number(product.sal_factor2) || 1;
  const packUnit = Number(product.sal_pack_unit) || 0;
  const qty = source === "boxes" ? (Number(row.boxes) || 0) * factor : Number(row.qty) || 0;
  // Priced off the Basic rate so the amount stays pre-tax; Landing is kept in
  // step with it rather than driving it.
  const price = Number(row.basicPrice) || 0;

  return withFoc({
    ...row,
    qty: source === "boxes" ? (qty > 0 ? String(qty) : "") : row.qty,
    boxes: source === "qty" ? (qty > 0 && factor > 0 ? String(qty / factor) : "") : row.boxes,
    ltrs: qty > 0 ? String(packUnit * qty) : "",
    priceListBasic: computeLandingPrice(price, row.tax),
    amount: qty > 0 && price > 0 ? (price * qty).toFixed(2) : "",
  });
};
