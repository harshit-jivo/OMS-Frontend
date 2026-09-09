/**
 * The admin-only "State-wise Item Sales" card: a state picker plus the top 3
 * varieties by sales value for the selected state. The "View more" modal it
 * opens lives in `DashboardDialogs.tsx`.
 *
 * The state picker is a real `tablist` now. It was a row of `<button>`s with
 * `class="is-active"` and nothing else — selecting one replaces the list
 * below it, which is what a tablist is, and saying so is what gets the roving
 * tabindex and the arrow keys.
 */
import { HiChevronDown } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";
import { Tab, TabList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PALETTE } from "../constants";
import { fmt, fmtCompactCurrency } from "../format";
import type { DashboardState } from "../useDashboard";

export default function StateItemSalesSection({ dashboard }: { dashboard: DashboardState }) {
  const {
    role,
    selectedPeriodLabel,
    activeItemState,
    stateItemSales,
    visibleItemStates,
    hiddenItemStateCount,
    showAllItemStates,
    setShowAllItemStates,
    setSelectedItemState,
    setSelectedItemVariety,
    setShowStateItems,
    topStateVarieties,
    activeStateMaxVarietySales,
    getSalesWidth,
    selectedItemVariety,
  } = dashboard;

  if (role !== "admin") return null;

  return (
    <Card>
      <CardHeader className="items-start">
        <div className="min-w-0">
          <CardTitle>State-wise Item Sales</CardTitle>
          <p className="m-0 mt-0.5 text-[11.5px] leading-snug text-subtle">
            Top 3 varieties by sales value in each state for {selectedPeriodLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="m-0 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
              Selected State
            </p>
            <p className="m-0 text-[13px] font-bold text-ink">{activeItemState ?? "N/A"}</p>
          </div>
          {stateItemSales.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedItemVariety("ALL");
                setShowStateItems(true);
              }}
            >
              View more <HiChevronDown aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </CardHeader>

      {stateItemSales.length === 0 ? (
        <p className="m-0 py-10 text-center text-[12.5px] text-subtle">
          No state-wise item data for this period
        </p>
      ) : (
        <>
          <div className="-mx-1 mb-3 overflow-x-auto px-1 pb-1">
            <TabList label="State" className="w-max">
              {visibleItemStates.map((item) => (
                <Tab
                  key={item.state}
                  selected={item.state === activeItemState}
                  onClick={() => {
                    setSelectedItemState(item.state);
                    setSelectedItemVariety("ALL");
                  }}
                >
                  {item.state}
                </Tab>
              ))}
              {stateItemSales.length > 5 ? (
                /* Not a `Tab`: it does not select anything, it reveals the
                   rest of the tabs. Inside the tablist it would be announced
                   as a state you could pick. */
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAllItemStates((current) => !current)}
                >
                  {showAllItemStates ? "Less" : `More +${hiddenItemStateCount}`}
                </Button>
              ) : null}
            </TabList>
          </div>

          <div className="grid gap-2.5 lg:grid-cols-3">
            {topStateVarieties.map((item, index) => (
              <button
                key={item.variety}
                type="button"
                className={cn(
                  "appearance-none [font-family:inherit] cursor-pointer text-left",
                  "flex items-start gap-2.5 rounded-card border bg-surface p-3 transition-colors",
                  "focus-visible:outline-none focus-visible:shadow-focus",
                  item.variety === selectedItemVariety
                    ? "border-brand-line bg-brand-soft"
                    : "border-line hover:border-line-strong",
                )}
                onClick={() => {
                  setSelectedItemVariety(item.variety);
                  setShowStateItems(true);
                }}
              >
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-strong text-[11px] font-bold text-subtle">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-semibold text-ink">
                        {item.variety}
                      </span>
                      <span className="block text-[11px] text-subtle">
                        Completed order lines
                      </span>
                    </span>
                    <strong className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink">
                      {fmtCompactCurrency(item.total_sales)}
                    </strong>
                  </span>
                  <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-strong">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: getSalesWidth(item.total_sales, activeStateMaxVarietySales),
                        background: PALETTE[index % PALETTE.length],
                      }}
                    />
                  </span>
                  <span className="mt-1.5 block text-[11px] text-subtle">
                    Amount {fmtCompactCurrency(item.total_sales)} · Qty {fmt(item.quantity)} ·
                    Items {fmt(item.count)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
