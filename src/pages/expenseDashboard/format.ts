/** Numbers and periods for the Expense dashboard. */

/** ₹1.7 Cr · ₹45.7 L · ₹12K · ₹950 — how Control Panel writes money. */
export function compactINR(n: number): string {
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n);
  if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(1)} L`;
  if (v >= 1e3) return `${sign}₹${Math.round(v / 1e3)}K`;
  return `${sign}₹${Math.round(v)}`;
}

/** ₹20 Cr · ₹50 L · ₹12K — an axis tick: short enough to stay on one line. */
export function axisINR(n: number): string {
  const v = Math.abs(n);
  if (v >= 1e7) return `₹${+(n / 1e7).toFixed(1)} Cr`;
  // One decimal: whole lakhs repeat on a short axis (₹2.4 L and ₹1.8 L both read "₹2 L").
  if (v >= 1e5) return `₹${+(n / 1e5).toFixed(1)} L`;
  if (v >= 1e3) return `₹${Math.round(n / 1e3)}K`;
  return `₹${Math.round(n)}`;
}

/** ₹1,70,25,855 — the exact figure, for tooltips and tables. */
export function fullINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** "+60.6%" / "−12.0%" / "new" when the period before had nothing. */
export function changeLabel(change: number | null): string {
  if (change === null) return "new";
  // From almost nothing, a percentage stops meaning anything: say how many times over.
  if (change >= 1000) return `${Math.round(1 + change / 100)}×`;
  return `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(1)}%`;
}

/**
 * The five expense categories, each with a FIXED colour slot: colour follows
 * the category, never its rank, so a filter never repaints the survivors.
 */
export const CATEGORY_SLOTS: Record<string, string> = {
  "Sales & Marketing": "var(--series-1)",
  "Operations & Factory": "var(--series-2)",
  "Admin & General": "var(--series-3)",
  "Finance & Statutory": "var(--series-4)",
  "Salaries & HR": "var(--series-5)",
};

export const DIRECT = "var(--series-1)";
export const INDIRECT = "var(--series-2)";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type PeriodPreset = "this-month" | "last-month" | "last-3" | "fy";

/** `{from, to}` for a quick period, as of `today`. */
export function presetRange(preset: PeriodPreset, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "last-month":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "last-3":
      return { from: iso(new Date(y, m - 2, 1)), to: iso(today) };
    case "fy": {
      // The Indian financial year starts on 1 April.
      const start = m >= 3 ? new Date(y, 3, 1) : new Date(y - 1, 3, 1);
      return { from: iso(start), to: iso(today) };
    }
    default:
      return { from: iso(new Date(y, m, 1)), to: iso(today) };
  }
}

/** "1 Sep – 30 Sep 2026" */
export function periodLabel(from: string, to: string): string {
  const fmt = (s: string, year: boolean) =>
    new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      ...(year ? { year: "numeric" } : {}),
    });
  return `${fmt(from, from.slice(0, 4) !== to.slice(0, 4))} – ${fmt(to, true)}`;
}
