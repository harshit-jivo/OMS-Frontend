/**
 * The admin-only "State-wise Item Sales" box: a state picker plus the top 3
 * varieties by sales value for the selected state. Moved verbatim out of
 * `Dashboard.tsx` (Phase 4 decomposition). The modal it opens into
 * ("View more") lives in `DashboardDialogs.tsx`.
 */
import { FiChevronDown } from "react-icons/fi";

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
    <div className="db-chart-box db-state-item-box">
      <div className="db-chart-head">
        <div>
          <div className="db-chart-title">State-wise Item Sales</div>
          <div className="db-chart-subtitle">
            Top 3 varieties by sales value in each state for {selectedPeriodLabel}
          </div>
        </div>
        <div className="db-chart-metric">
          <span>Selected State</span>
          <strong>{activeItemState ?? "N/A"}</strong>
        </div>
      </div>
      {stateItemSales.length === 0 ? (
        <div className="db-no-data">No state-wise item data for this period</div>
      ) : (
        <>
          <div className="db-state-item-tabs" aria-label="State-wise item sales">
            {visibleItemStates.map((item) => (
              <button
                key={item.state}
                type="button"
                className={item.state === activeItemState ? "is-active" : ""}
                onClick={() => {
                  setSelectedItemState(item.state);
                  setSelectedItemVariety("ALL");
                }}
              >
                {item.state}
              </button>
            ))}
            {stateItemSales.length > 5 ? (
              <button
                type="button"
                className="db-state-more-btn"
                onClick={() => setShowAllItemStates((current) => !current)}
              >
                {showAllItemStates ? "Less" : `More +${hiddenItemStateCount}`}
              </button>
            ) : null}
          </div>
          <div className="db-state-item-actions">
            <button
              type="button"
              onClick={() => {
                setSelectedItemVariety("ALL");
                setShowStateItems(true);
              }}
            >
              View more <FiChevronDown />
            </button>
          </div>
          <div className="db-state-item-list">
            {topStateVarieties.map((item, index) => (
              <button
                className={`db-state-item-row db-state-item-row--button${item.variety === selectedItemVariety ? " is-active" : ""}`}
                key={item.variety}
                type="button"
                onClick={() => {
                  setSelectedItemVariety(item.variety);
                  setShowStateItems(true);
                }}
              >
                <span className="db-manager-rank-number">{index + 1}</span>
                <div className="db-state-item-main">
                  <div className="db-state-item-meta">
                    <div>
                      <span>{item.variety}</span>
                      <small>Completed order lines</small>
                    </div>
                    <strong>{fmtCompactCurrency(item.total_sales)}</strong>
                  </div>
                  <div className="db-manager-rank-track">
                    <span
                      className="db-manager-rank-fill"
                      style={{
                        width: getSalesWidth(item.total_sales, activeStateMaxVarietySales),
                        background: PALETTE[index % PALETTE.length],
                      }}
                    />
                  </div>
                  <small className="db-state-item-foot">
                    Amount {fmtCompactCurrency(item.total_sales)} | Qty {fmt(item.quantity)} | Items{" "}
                    {fmt(item.count)}
                  </small>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
