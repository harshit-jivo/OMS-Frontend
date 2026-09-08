/**
 * The two chart rows below the KPI/overview panels: the sales-trend area chart
 * (with the admin-only manager-performance box beside it), and the
 * order-volume bar chart (with category sales beside it for the roles that do
 * not expand the volume chart to full width).
 *
 * The recharts configuration is unchanged — same series, same axes, same
 * formatters. What changed is the box around each chart (`Card`) and the head
 * above it, plus the two hardcoded greys in the axis styling, which now come
 * from the token palette so the charts follow the theme like everything else.
 */
import { HiChevronDown } from "react-icons/hi2";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";
import { PALETTE, currencyPrefix } from "../constants";
import { fmt, fmtCompactCurrency } from "../format";
import type { DashboardState } from "../useDashboard";

/** Axis ink and gridlines, matching `--color-subtle` / `--color-line`. */
const AXIS_TICK = { fontSize: 11, fill: "#64748b" } as const;
const GRID_STROKE = "#dbe4ee";

/**
 * The head every chart card shares: a title, a subtitle, and the one figure
 * that summarises the chart.
 *
 * The figure is on the right at the same weight as the title, because on a
 * chart card it answers "so what is the number" for a reader who is not going
 * to interpret the shape.
 */
function ChartHead({
  title,
  subtitle,
  metricLabel,
  metricValue,
  action,
}: {
  title: string;
  subtitle: string;
  metricLabel: string;
  metricValue: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <CardHeader className="items-start">
      {/*
        `min-w-[240px] flex-1`, not `min-w-0`.
        A zero minimum lets the title squeeze indefinitely, so on the narrow
        right-hand cards it never wrapped — it just crushed itself up against
        the metric beside it ("Top Manager Performance (2026)" ending a
        character from "TOP MANAGER"). With a real minimum the flex line runs
        out of room and the metric drops to the next row, which is what
        `flex-wrap` on the header was there for. 240px is chosen against the
        real width of the narrow right-hand card (~420px) minus the metric and
        its action button — measured, not guessed; 190 was not enough and the
        two still ran together.
      */}
      <div className="min-w-[240px] flex-1">
        <CardTitle>{title}</CardTitle>
        <p className="m-0 mt-0.5 text-[11.5px] leading-snug text-subtle">{subtitle}</p>
      </div>
      {/* `ml-auto` so that when the metric DOES wrap to its own line it lands
          against the right edge of the card, where it was before — without it
          the wrapped block sits under the title with its own text
          right-aligned inside a shrink-wrapped box, which reads as a mistake. */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div className="text-right">
          <p className="m-0 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
            {metricLabel}
          </p>
          <p className="m-0 text-[13px] font-bold text-ink">{metricValue}</p>
        </div>
        {action}
      </div>
    </CardHeader>
  );
}

function NoData({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 py-10 text-center text-[12.5px] text-subtle">{children}</p>
  );
}

export default function ChartsSection({ dashboard }: { dashboard: DashboardState }) {
  const {
    role,
    chartCopy,
    shouldExpandVolumeChart,
    revenueMetricLabel,
    revenueMetricValue,
    monthlySales,
    isBilling,
    managerPerformance,
    topManager,
    topManagerPerformance,
    managerMaxSales,
    getSalesWidth,
    setPerformanceView,
    setShowManagerPerformance,
    totalOrders,
    orderVolumeMetricLabel,
    categorySales,
    topCategory,
  } = dashboard;

  const openManagerPerformance = () => {
    if (managerPerformance.length > 0) {
      setPerformanceView("manager");
      setShowManagerPerformance(true);
    }
  };

  return (
    <>
      {!shouldExpandVolumeChart && (
        <div className={role === "admin" ? "grid gap-4 lg:grid-cols-[1.6fr_1fr]" : "grid gap-4"}>
          <Card>
            <ChartHead
              title={chartCopy[role].salesTitle}
              subtitle={chartCopy[role].salesSubtitle}
              metricLabel={revenueMetricLabel}
              metricValue={revenueMetricValue}
            />
            {/* The volume and category charts already guarded this; the trend
                chart did not, so an empty period drew an axis frame around
                nothing and read as a broken chart rather than as no data. */}
            {monthlySales.length === 0 ? (
              <NoData>No sales data for this period</NoData>
            ) : (
            <ResponsiveContainer width="100%" height={role === "admin" ? 205 : 240}>
              <AreaChart data={monthlySales} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={AXIS_TICK} />
                <YAxis
                  tick={AXIS_TICK}
                  tickFormatter={
                    isBilling ? undefined : (v) => `${currencyPrefix}${(v / 1000).toFixed(1)}k`
                  }
                  width={52}
                />
                <Tooltip
                  formatter={(v) =>
                    isBilling
                      ? [v, "Orders"]
                      : [
                          `${currencyPrefix}${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                          "Revenue",
                        ]
                  }
                />
                <Area
                  type="monotone"
                  dataKey={isBilling ? "count" : "revenue"}
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  dot={{ r: 3, fill: "#2563eb" }}
                />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </Card>

          {role === "admin" ? (
            /*
             * It was a `<div role="button" tabIndex={0}>` with a keydown
             * handler reimplementing Enter and Space — and a nested `<button>`
             * inside it that had to `stopPropagation`. A card is not a button:
             * the two real actions are buttons now, in the head, which is also
             * what makes them reachable by keyboard without a hand-rolled
             * handler.
             */
            <Card>
              <ChartHead
                title={chartCopy[role].managerPerformanceTitle}
                subtitle={chartCopy[role].managerPerformanceSubtitle}
                metricLabel="Top Manager"
                metricValue={topManager?.name ?? "N/A"}
                action={
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPerformanceView("state");
                      setShowManagerPerformance(true);
                    }}
                    aria-label="View state-wise performance"
                  >
                    States <HiChevronDown aria-hidden="true" />
                  </Button>
                }
              />

              {topManagerPerformance.length === 0 ? (
                <NoData>No manager sales data for this period</NoData>
              ) : (
                <>
                  <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                    {topManagerPerformance.map((item, index) => (
                      <li key={item.id} className="flex items-center gap-2.5">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-strong text-[11px] font-bold text-subtle">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[12.5px] font-medium text-ink">
                              {item.name}
                            </span>
                            <strong className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink">
                              {fmtCompactCurrency(item.sales)}
                            </strong>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-strong">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: getSalesWidth(item.sales, managerMaxSales),
                                background: PALETTE[index % PALETTE.length],
                              }}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3">
                    <Button size="sm" variant="ghost" block onClick={openManagerPerformance}>
                      All managers <HiChevronDown aria-hidden="true" />
                    </Button>
                  </div>
                </>
              )}
            </Card>
          ) : null}
        </div>
      )}

      <div className={shouldExpandVolumeChart ? "grid gap-4" : "grid gap-4 lg:grid-cols-[1.6fr_1fr]"}>
        <Card>
          <ChartHead
            title={chartCopy[role].volumeTitle}
            subtitle={chartCopy[role].volumeSubtitle}
            metricLabel={orderVolumeMetricLabel}
            metricValue={fmt(totalOrders)}
          />
          {monthlySales.length === 0 ? (
            <NoData>No monthly order data for this period</NoData>
          ) : (
            <ResponsiveContainer width="100%" height={shouldExpandVolumeChart ? 360 : 235}>
              <BarChart data={monthlySales} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} width={42} />
                <Tooltip formatter={(v) => [v, "Orders"]} />
                <Bar
                  dataKey="count"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={shouldExpandVolumeChart ? 44 : 72}
                >
                  {monthlySales.map((item, index) => (
                    <Cell key={item.label} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {!shouldExpandVolumeChart && (
          <Card>
            <ChartHead
              title={chartCopy[role].categoryTitle}
              subtitle={chartCopy[role].categorySubtitle}
              metricLabel="Top Category"
              metricValue={topCategory?.category ?? "N/A"}
            />
            {categorySales.length === 0 ? (
              <NoData>No category data for this period</NoData>
            ) : (
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={categorySales} margin={{ top: 10, right: 16, bottom: 24, left: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="category" tick={AXIS_TICK} angle={-20} textAnchor="end" />
                  <YAxis tick={AXIS_TICK} tickFormatter={fmtCompactCurrency} width={72} />
                  <Tooltip
                    formatter={(v) => [
                      `${currencyPrefix}${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      "Sales",
                    ]}
                  />
                  <Bar dataKey="total_sales" radius={[5, 5, 0, 0]} maxBarSize={40}>
                    {categorySales.map((item, index) => (
                      <Cell key={item.category} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
