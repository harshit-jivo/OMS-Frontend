import type { BadgeTone } from "@/components/ui/badge";

/**
 * The tracker's formatters and its one shared tone map. Six pages each carried their own copy of
 * `money`/`fmtDate`/`fmtDT`, and they had already drifted (one `fmtDate`
 * returned "-" for a blank, another "—").
 */

/** Indian grouping, two decimals: `1,23,456.00`. */
export const money = (v: string | number | null | undefined) =>
  Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `dd/mm/yyyy`, or the raw value if it will not parse. */
export const fmtDate = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB");
};

/** `Mon yyyy` — for the effective month, stored as the first of the month. */
export const fmtMonth = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};

/** `dd/mm/yyyy, hh:mm`. */
export const fmtDT = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

/** Today as YYYY-MM-DD (local), used to cap date pickers. */
export const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

/** The status a desk gave, as a badge tone. */
export function decisionTone(status?: string | null): BadgeTone {
  switch ((status || "").toUpperCase()) {
    case "OK":
    case "APPROVED":
      return "ok";
    case "DEBIT":
    case "REJECTED":
    case "RETURN":
      return "bad";
    case "HOLD":
      return "hold";
    default:
      return "neutral";
  }
}
