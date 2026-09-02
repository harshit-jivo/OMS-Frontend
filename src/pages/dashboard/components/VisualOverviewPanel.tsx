/**
 * The "Visual Overview" panel: Top Parties list, the role-aware progress
 * card, and the order-status pie + legend. Moved verbatim out of
 * `Dashboard.tsx` (Phase 4 decomposition) — see `useDashboard` for the state
 * and derivations this reads.
 */
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { TOP_PARTY_VIEW_OPTIONS } from "../constants";
import { fmt } from "../format";
import type { DashboardState } from "../useDashboard";

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

  return (
    <div className="db-panel db-panel--overview">
      <div className="db-highlights-head">
        <div>
          <div className="db-panel-title">Visual Overview</div>
          <div className="db-highlights-subtitle">
            Quick chart summaries for {roleMeta.focus.toLowerCase()}
          </div>
        </div>
        <div className="db-highlights-actions">
          <div className="db-highlights-badge">{showTopParties ? "3 charts" : "2 charts"}</div>
        </div>
      </div>
      <div className={`db-overview-grid${showTopParties ? "" : " db-overview-grid--two"}`}>
        {showTopParties && (
          <div className="db-overview-card db-overview-card--pulse">
            <div className="db-overview-top db-overview-top--compact">
              <div>
                <div className="db-highlight-label">Top Parties</div>
                <div className="db-highlight-sub">
                  {topParty
                    ? `${topParty.card_name} (${topParty.category || "Unknown"}) leads with ${fmt(topParty.count)} orders (${fmt(topParty.completed_count ?? 0)} completed)`
                    : "No party data available"}
                </div>
              </div>
              <div className="db-chart-controls">
                <div className="db-segmented-control" role="tablist" aria-label="Top parties view">
                  {TOP_PARTY_VIEW_OPTIONS.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className={`db-segmented-btn${topPartyView === option.value ? " is-active" : ""}`}
                      onClick={() => setTopPartyView(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {topParties.length === 0 ? (
              <div className="db-no-data db-no-data--short">No party data for this period</div>
            ) : (
              <div className="db-party-list db-party-list--spacious">
                {visibleTopParties.map((item, index) => (
                  <div
                    key={`${item.card_code}-${item.category || "Unknown"}`}
                    className="db-party-list-item db-party-list-item--detailed"
                  >
                    <span className="db-party-list-badge">{index + 1}</span>
                    <div className="db-party-list-details">
                      <span className="db-party-list-name db-party-list-name--wrap">
                        {item.card_name}
                      </span>
                      <span className="db-party-list-code">
                        {item.card_code}
                        <span className="db-party-category-chip">{item.category || "Unknown"}</span>
                      </span>
                    </div>
                    <div className="db-party-figures">
                      <span className="db-party-list-count db-party-list-count--detailed">
                        {fmt(item.count)} orders
                      </span>
                      {item.completed_count != null && (
                        <div className="db-party-completed">{fmt(item.completed_count)} completed</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="db-overview-card db-overview-card--progress">
          <div className="db-overview-top">
            <div>
              <div className="db-highlight-label">
                {isReviewRole
                  ? "Review Completion"
                  : role === "manager"
                    ? "Order Momentum"
                    : role === "admin"
                      ? "Order Throughput"
                      : "Handling Progress"}
              </div>
              <div className="db-overview-hero">
                {isReviewRole
                  ? fmt(overviewHandledCount)
                  : role === "manager" || role === "admin"
                    ? fmt(overviewTotalCount)
                    : `${overviewRate}%`}
              </div>
              <div className="db-highlight-sub">
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
              </div>
            </div>
          </div>
          <div className="db-progress">
            <div className="db-progress-bar">
              <div className="db-progress-fill" style={{ width: `${overviewRate}%` }} />
            </div>
            <div className="db-progress-meta">
              <span>
                {isReviewRole
                  ? `${fmt(overviewPendingCount)} pending`
                  : role === "manager"
                    ? `${fmt(overviewAcceptedCount)} completed`
                    : role === "admin"
                      ? `${fmt(overviewHandledCount)} handled`
                      : `${fmt(overviewHandledCount)} handled`}
              </span>
              <strong>
                {isReviewRole
                  ? `${fmt(overviewHandledCount)} ${role === "approver" ? "decided" : "reviewed"}`
                  : role === "manager" || role === "admin"
                    ? `${fmt(overviewTotalCount)} total`
                    : `${fmt(overviewTotalCount)} total`}
              </strong>
            </div>
          </div>
        </div>

        <div className="db-overview-card db-overview-card--summary">
          <div className="db-overview-top db-overview-top--compact">
            <div>
              <div className="db-highlight-label">{chartCopy[role].statusTitle}</div>
              <div className="db-highlight-sub">{chartCopy[role].statusSubtitle}</div>
            </div>
          </div>
          {statusItems.length === 0 ? (
            <div className="db-no-data">No data for this period</div>
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
                        className={`db-pie-cell${statusClickable ? " db-pie-cell--clickable" : ""}`}
                        onClick={statusClickable ? () => void openStatusOrders(item) : undefined}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="db-legend">
                {statusDisplayItems.map((item) =>
                  statusClickable ? (
                    <button
                      key={item.status}
                      type="button"
                      className="db-legend-item db-legend-item--clickable"
                      onClick={() => void openStatusOrders(item)}
                      title={`View ${item.label} orders`}
                    >
                      <span className="db-legend-dot" style={{ background: getStatusColor(item) }} />
                      <span className="db-legend-label">{item.label}</span>
                      <span className="db-legend-val">{item.count}</span>
                    </button>
                  ) : (
                    <div key={item.status} className="db-legend-item">
                      <span className="db-legend-dot" style={{ background: getStatusColor(item) }} />
                      <span className="db-legend-label">{item.label}</span>
                      <span className="db-legend-val">{item.count}</span>
                    </div>
                  ),
                )}
              </div>
              {hiddenStatusCount > 0 ? (
                <div className="db-status-popover-wrap">
                  <button
                    type="button"
                    className="db-status-popover-trigger"
                    onClick={() => setShowMoreStatuses((current) => !current)}
                    aria-label={`${showMoreStatuses ? "Hide" : "Show"} ${hiddenStatusCount} more statuses`}
                    aria-expanded={showMoreStatuses}
                  >
                    {showMoreStatuses ? <FiChevronUp /> : <FiChevronDown />}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
