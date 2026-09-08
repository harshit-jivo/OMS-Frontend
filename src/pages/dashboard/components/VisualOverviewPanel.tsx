/**
 * The "Visual Overview" panel: Top Parties, the role-aware progress card, and
 * the order-status pie with its legend.
 *
 * One `Card` holding three inner panels, where it was `.db-panel` holding
 * `.db-overview-card`s. The inner ones stay visually lighter than the outer —
 * a bordered surface on `bg-surface` rather than another shadowed card —
 * because three shadowed cards inside a shadowed card is four levels of
 * elevation for two levels of meaning.
 */
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { TOP_PARTY_VIEW_OPTIONS } from "../constants";
import { fmt } from "../format";
import type { DashboardState } from "../useDashboard";

/** The inner surface the three overview cards share. */
const panelClass = "flex min-w-0 flex-col rounded-card border border-line bg-surface p-3.5";

/** "No data" said quietly, in place, at the size of the thing it replaces. */
function NoData({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 flex flex-1 items-center justify-center py-6 text-center text-[12.5px] text-subtle">
      {children}
    </p>
  );
}

export default function VisualOverviewPanel({ dashboard }: { dashboard: DashboardState }) {
  const {
    role,
    roleMeta,
    showTopParties,
    topParty,
    topParties,
    visibleTopParties,
    topPartyView,
    setTopPartyView,
    isReviewRole,
    overviewHandledCount,
    overviewTotalCount,
    overviewRate,
    overviewAcceptedCount,
    overviewPendingCount,
    selectedPeriodLabel,
    chartCopy,
    statusItems,
    statusDisplayItems,
    statusClickable,
    getStatusColor,
    openStatusOrders,
    hiddenStatusCount,
    showMoreStatuses,
    setShowMoreStatuses,
  } = dashboard;

  const progressTitle = isReviewRole
    ? "Review Completion"
    : role === "manager"
      ? "Order Momentum"
      : role === "admin"
        ? "Order Throughput"
        : "Handling Progress";

  const progressHero = isReviewRole
    ? fmt(overviewHandledCount)
    : role === "manager" || role === "admin"
      ? fmt(overviewTotalCount)
      : `${overviewRate}%`;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Visual Overview</CardTitle>
          <p className="m-0 mt-0.5 text-[12px] text-subtle">
            Quick chart summaries for {roleMeta.focus.toLowerCase()}
          </p>
        </div>
        <Badge tone="info">{showTopParties ? "3 charts" : "2 charts"}</Badge>
      </CardHeader>

      <div
        className={cn(
          "grid gap-3",
          showTopParties ? "lg:grid-cols-3" : "lg:grid-cols-2",
        )}
      >
        {showTopParties && (
          <section className={panelClass}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="m-0 text-[13px] font-semibold text-ink">Top Parties</h3>
                <p className="m-0 mt-0.5 text-[11.5px] leading-snug text-subtle">
                  {topParty
                    ? `${topParty.card_name} (${topParty.category || "Unknown"}) leads with ${fmt(topParty.count)} orders (${fmt(topParty.completed_count ?? 0)} completed)`
                    : "No party data available"}
                </p>
              </div>
              <div
                className="inline-flex shrink-0 items-center gap-0.5 rounded-sm border border-line bg-card p-0.5"
                role="tablist"
                aria-label="Top parties view"
              >
                {TOP_PARTY_VIEW_OPTIONS.map((option) => {
                  const selected = topPartyView === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      // `cn`, not a join: `bg-transparent` from the reset and
                      // `bg-brand` from the selected state are the same
                      // utility group, and the loser has to be dropped rather
                      // than left to emission order.
                      className={cn(
                        "appearance-none border-0 bg-transparent [font-family:inherit] cursor-pointer",
                        "rounded-[5px] px-2 py-1 text-[11.5px] font-semibold transition-colors",
                        "focus-visible:outline-none focus-visible:shadow-focus",
                        selected
                          ? "bg-brand text-white"
                          : "text-subtle hover:bg-surface hover:text-body",
                      )}
                      onClick={() => setTopPartyView(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {topParties.length === 0 ? (
              <NoData>No party data for this period</NoData>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {visibleTopParties.map((item, index) => (
                  <li
                    key={`${item.card_code}-${item.category || "Unknown"}`}
                    className="flex items-start gap-2.5"
                  >
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 break-words text-[12.5px] font-semibold text-ink">
                        {item.card_name}
                      </p>
                      <p className="m-0 mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-subtle">
                        {item.card_code}
                        <Badge tone="neutral">{item.category || "Unknown"}</Badge>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="m-0 text-[12.5px] font-semibold tabular-nums text-ink">
                        {fmt(item.count)} orders
                      </p>
                      {item.completed_count != null && (
                        <p className="m-0 text-[11px] tabular-nums text-ok">
                          {fmt(item.completed_count)} completed
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <section className={panelClass}>
          <h3 className="m-0 text-[13px] font-semibold text-ink">{progressTitle}</h3>
          <p className="m-0 mt-1 text-3xl font-bold leading-none tracking-[-0.02em] tabular-nums text-ink">
            {progressHero}
          </p>
          <p className="m-0 mt-1 text-[11.5px] leading-snug text-subtle">
            {isReviewRole
              ? overviewTotalCount > 0
                ? `${fmt(overviewPendingCount)} ${role === "approver" ? "pending approval" : "pending review"} in ${selectedPeriodLabel}`
                : `No ${role === "approver" ? "rate approval" : "audit"} data for ${selectedPeriodLabel}`
              : role === "manager"
                ? overviewTotalCount > 0
                  ? `${fmt(overviewAcceptedCount)} completed or approved in ${selectedPeriodLabel}`
                  : `No orders for ${selectedPeriodLabel}`
                : role === "admin"
                  ? overviewTotalCount > 0
                    ? `${fmt(overviewHandledCount)} handled in ${selectedPeriodLabel}`
                    : `No order activity for ${selectedPeriodLabel}`
                  : overviewTotalCount > 0
                    ? `${fmt(overviewPendingCount)} still waiting in billing queue for ${selectedPeriodLabel}`
                    : `No billing activity for ${selectedPeriodLabel}`}
          </p>

          <div className="mt-auto pt-4">
            {/* A real progress bar, announced as one: the value is the point
                and a decorative div says nothing to a screen reader. */}
            <div
              role="progressbar"
              aria-valuenow={overviewRate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={progressTitle}
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-strong"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-300"
                style={{ width: `${overviewRate}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-subtle">
              <span>
                {isReviewRole
                  ? `${fmt(overviewPendingCount)} pending`
                  : role === "manager"
                    ? `${fmt(overviewAcceptedCount)} completed`
                    : `${fmt(overviewHandledCount)} handled`}
              </span>
              <strong className="font-semibold text-ink">
                {isReviewRole
                  ? `${fmt(overviewHandledCount)} ${role === "approver" ? "decided" : "reviewed"}`
                  : `${fmt(overviewTotalCount)} total`}
              </strong>
            </div>
          </div>
        </section>

        <section className={cn(panelClass, "relative")}>
          <div className="mb-1">
            <h3 className="m-0 text-[13px] font-semibold text-ink">
              {chartCopy[role].statusTitle}
            </h3>
            <p className="m-0 mt-0.5 text-[11.5px] leading-snug text-subtle">
              {chartCopy[role].statusSubtitle}
            </p>
          </div>

          {statusItems.length === 0 ? (
            <NoData>No data for this period</NoData>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie
                    data={statusDisplayItems}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    innerRadius={32}
                  >
                    {statusDisplayItems.map((item) => (
                      <Cell
                        key={item.status}
                        fill={getStatusColor(item)}
                        className={cn(
                          "outline-none",
                          statusClickable && "cursor-pointer",
                        )}
                        onClick={statusClickable ? () => void openStatusOrders(item) : undefined}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                {statusDisplayItems.map((item) => {
                  const content = (
                    <>
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: getStatusColor(item) }}
                      />
                      <span className="text-[11.5px] text-body">{item.label}</span>
                      <span className="text-[11.5px] font-semibold tabular-nums text-ink">
                        {item.count}
                      </span>
                    </>
                  );
                  return statusClickable ? (
                    <button
                      key={item.status}
                      type="button"
                      className="flex appearance-none items-center gap-1.5 rounded-sm border-0 bg-transparent px-1 py-0.5 [font-family:inherit] cursor-pointer hover:bg-card focus-visible:outline-none focus-visible:shadow-focus"
                      onClick={() => void openStatusOrders(item)}
                      title={`View ${item.label} orders`}
                    >
                      {content}
                    </button>
                  ) : (
                    <span key={item.status} className="flex items-center gap-1.5 px-1 py-0.5">
                      {content}
                    </span>
                  );
                })}
              </div>

              {hiddenStatusCount > 0 ? (
                <button
                  type="button"
                  className="absolute right-2 top-2 appearance-none rounded-sm border-0 bg-transparent p-1 text-subtle [font-family:inherit] cursor-pointer hover:bg-card hover:text-ink focus-visible:outline-none focus-visible:shadow-focus"
                  onClick={() => setShowMoreStatuses((current) => !current)}
                  aria-label={`${showMoreStatuses ? "Hide" : "Show"} ${hiddenStatusCount} more statuses`}
                  aria-expanded={showMoreStatuses}
                >
                  {showMoreStatuses ? (
                    <HiChevronUp aria-hidden="true" className="size-4" />
                  ) : (
                    <HiChevronDown aria-hidden="true" className="size-4" />
                  )}
                </button>
              ) : null}
            </>
          )}
        </section>
      </div>
    </Card>
  );
}
