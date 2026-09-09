import {
  HiOutlineBanknotes,
  HiOutlineBeaker,
  HiOutlineCurrencyRupee,
  HiOutlineReceiptPercent,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Card, Stat, StatRow } from "@/components/ui/page";
import type { OrderTotals as Totals, VarietyCost } from "./orderDetail";
import { VARIETY_TONE } from "./orderDetail";

/**
 * An order's money, as the KPI row the list pages already use.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ABOVE THE ITEMS, NOT BELOW THEM
 * ─────────────────────────────────────────────────────────────────────────
 * Every approval screen put these four numbers in a fixed footer bar pinned
 * to the bottom of the viewport — `position: fixed`, with a `padding-left`
 * hard-coded to clear the sidebar. Three separate stylesheets carried their
 * own copy of that offset and all three had the wrong number in it.
 *
 * A reviewer reads "what is this worth" before "what is in it", so the totals
 * belong at the top. Putting them there also means they are just a `StatRow`
 * like every other page's, and the fixed bar — with its sidebar-width
 * arithmetic — stops existing.
 */
export function OrderTotalsRow({
  totals,
  itemCount,
}: {
  totals: Totals;
  itemCount: number;
}) {
  return (
    <StatRow>
      <Stat
        icon={HiOutlineBeaker}
        tone="neutral"
        label="Total Ltrs"
        value={totals.litres.toFixed(2)}
      />
      <Stat
        icon={HiOutlineBanknotes}
        tone="neutral"
        label="Subtotal"
        value={totals.subtotal.toFixed(2)}
      />
      <Stat
        icon={HiOutlineReceiptPercent}
        tone="neutral"
        label="Tax"
        value={totals.tax.toFixed(2)}
      />
      <Stat
        icon={HiOutlineCurrencyRupee}
        tone="brand"
        label="Grand Total"
        value={totals.grand.toFixed(2)}
        hint={`${itemCount} item${itemCount === 1 ? "" : "s"}`}
      />
    </StatRow>
  );
}

/**
 * The variety breakdown — one card per variety, filling the row.
 *
 * `auto-fit` rather than a fixed two columns, so the layout is right whether
 * SAP returns two varieties or three: two sit adjacent across the full width,
 * three divide it evenly.
 *
 * The variety takes a `Badge` because PREMIUM / COMMODITY / OTHERS is a
 * category exactly as a status is — the same treatment, not a new one. These
 * were `.vc-pill` in three stylesheets, each with its own colours.
 */
export function VarietyCostCards({ costs }: { costs: VarietyCost[] }) {
  if (costs.length === 0) return null;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      {costs.map((entry) => (
        <Card key={entry.label} className="flex items-center justify-between gap-3">
          <Badge tone={VARIETY_TONE[entry.label] ?? "neutral"}>{entry.label}</Badge>
          <span className="text-xl font-bold tabular-nums text-ink">
            {entry.value.toFixed(2)}
          </span>
        </Card>
      ))}
    </div>
  );
}
