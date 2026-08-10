/**
 * Formatting and palette shared by the dashboard's components.
 *
 * Separate module so `AnalyticsTab` and the lazily-loaded `DonutChart` can both
 * import them without either file exporting a non-component — which would break
 * Fast Refresh for the whole module.
 */

/** Indian-format currency, to paise, matching what the server sends. */
export function money(value: number): string {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Short currency for tight spaces — "₹1.7Cr", "₹10.3L", "₹4.5K".
 *
 * Used inside the donut hole, which is a fixed circle: a full figure such as
 * ₹1,72,40,103.00 is far wider than the gap and runs under the arcs. Crore and
 * lakh rather than M/B because that is how these amounts are read here.
 *
 * The exact figure is never only here — the legend beside the chart carries it
 * in full, so nothing is lost by abbreviating the centre.
 *
 * Mirrors compactMoney() in the mobile app's dashboard/format.ts; keep the two
 * in step so one amount does not read differently across the clients.
 */
export function compactMoney(value: number): string {
  const n = Math.abs(Number(value) || 0);
  const sign = value < 0 ? "-" : "";
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)}Cr`;
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L`;
  if (n >= 1e3) return `${sign}₹${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return `${sign}₹${n.toFixed(0)}`;
}

/** "05 Aug 2026" — the format already used across the console. */
export function prettyDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

/** Today in the browser's timezone as YYYY-MM-DD, for the custom-range inputs.
 *  Only a default for the pickers — the server resolves the real window. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Initials for the collection-person avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Slice colours. Indexed by position so a legend dot always matches its arc. */
export const SLICE_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
];
