/**
 * Formatting for the Production Order pages.
 *
 * Separate from `shared.tsx` because a file that exports both components and
 * plain functions breaks Fast Refresh (`react-refresh/only-export-components`)
 * — the same split `components/tracker/timeline.ts` makes, for the same
 * reason.
 */
import type { ProductionOrder } from "../../services/productionService";

export function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Trim a decimal string for display: "1000.000000" -> "1,000".
 *
 * The backend sends quantities as STRINGS, deliberately — they are
 * `numeric(19,6)` and JSON numbers would lose precision on the way through.
 * So this parses rather than assuming a number arrived.
 */
export function fmtQty(value?: string | null) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * What a human calls this order.
 *
 * `DocNum` is the number printed and quoted; `DocEntry` is SAP's internal key
 * and the thing the release gate joins on. Falling back to DocEntry keeps a
 * row identifiable if DocNum was never captured, but the two are not
 * interchangeable and only one of them is unique on its own — and neither is
 * unique ACROSS companies, which is why the backend keys on the pair.
 */
export function orderNumber(order: ProductionOrder) {
  return order.sap_doc_num ?? order.sap_doc_entry;
}
