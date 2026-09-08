/**
 * The donut behind each analytics card.
 *
 * Its own module so `AnalyticsTab` can `lazy()` it — recharts is the heaviest
 * dependency on the page, and the KPI cards above the fold do not need it.
 *
 * Percentages come from the caller, not from recharts' own `percent`: the
 * legend re-bases them when a slice is switched off, and the arc tooltip has to
 * agree with the legend beside it.
 */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { compactMoney, money, SLICE_COLORS } from "./dashboardFormat";
import type { ChartSlice } from "../../services/paymentsDashboardService";

interface Props {
  slices: ChartSlice[];
  /** Sum of the VISIBLE slices — recomputed by the caller as legend items are
   *  toggled, so the centre figure matches what is drawn. */
  total: number;
  centerLabel: string;
}

interface TipProps {
  active?: boolean;
  payload?: { payload: ChartSlice & { _percent: number } }[];
}

function SliceTooltip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="rounded-sm border border-line bg-card px-2.5 py-1.5 shadow-card">
      <div className="text-[12px] font-semibold text-ink">{slice.label}</div>
      <div className="text-[13px] font-bold tabular-nums text-ink">{money(slice.amount)}</div>
      <div className="text-[11px] text-subtle">{slice._percent.toFixed(1)}% of total</div>
    </div>
  );
}

export default function DonutChart({ slices, total, centerLabel }: Props) {
  // Zero-amount slices are dropped before drawing: recharts renders them as a
  // hairline that still catches the mouse, producing a tooltip for a segment
  // the user cannot see.
  const data = slices
    .filter((s) => s.amount > 0)
    .map((s) => ({
      ...s,
      _percent: total ? (s.amount / total) * 100 : 0,
    }));

  // Colour by the slice's index in the ORIGINAL list, so hiding one legend
  // entry does not recolour the others.
  const colorFor = (slice: ChartSlice) => {
    const index = slices.findIndex((s) => s.key === slice.key);
    return SLICE_COLORS[(index < 0 ? 0 : index) % SLICE_COLORS.length];
  };

  return (
    <div className="relative w-[200px] shrink-0">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          {/* innerRadius is wider than the usual 60%: the centre carries an
              amount and a label, and at 62% they sat hard against the inner
              edge of the ring. The band stays thick enough to read the
              split. */}
          <Pie
            data={data}
            dataKey="amount"
            nameKey="label"
            innerRadius="68%"
            outerRadius="92%"
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="none"
            animationDuration={700}
            animationBegin={0}
          >
            {data.map((slice) => (
              <Cell key={slice.key} fill={colorFor(slice)} />
            ))}
          </Pie>
          <Tooltip content={<SliceTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Centred over the hole. `pointer-events-none` so it never steals the
          hover from the arcs underneath.

          Abbreviated, and width-capped to the hole itself: the full figure is
          several times wider than the gap and would sit on top of the arcs.
          `title` keeps the exact amount one hover away, and the legend beside
          the chart always shows it in full. */}
      <div
        className="pointer-events-none absolute inset-0 flex max-w-[120px] flex-col items-center justify-center gap-0.5 justify-self-center text-center [inset-inline:auto] left-1/2 -translate-x-1/2"
        title={money(total)}
      >
        <span className="truncate text-[16px] font-bold leading-tight tabular-nums text-ink">
          {compactMoney(total)}
        </span>
        <span className="text-[10.5px] uppercase leading-tight tracking-wide text-subtle">
          {centerLabel}
        </span>
      </div>
    </div>
  );
}
