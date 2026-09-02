/**
 * The two chart rows below the KPI/overview panels: the sales-trend area
 * chart (with the admin-only manager-performance box beside it), and the
 * order-volume bar chart (with the category-sales bar chart beside it for
 * roles that don't expand the volume chart to full width). Moved verbatim
 * out of `Dashboard.tsx` (Phase 4 decomposition).
 */
import { FiChevronDown } from "react-icons/fi";
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

import { PALETTE, currencyPrefix } from "../constants";
import { fmt, fmtCompactCurrency } from "../format";
import type { DashboardState } from "../useDashboard";

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

  return (
    <>
      {!shouldExpandVolumeChart && (
        <div className="db-charts-row">
          <div
            className={`db-chart-box db-chart-box--wide${role === "admin" ? "" : " db-chart-box--full-span"}`}
          >
            <div className="db-chart-head">
              <div>
                <div className="db-chart-title">{chartCopy[role].salesTitle}</div>
                <div className="db-chart-subtitle">{chartCopy[role].salesSubtitle}</div>
              </div>
              <div className="db-chart-metric">
                <span>{revenueMetricLabel}</span>
                <strong>{revenueMetricValue}</strong>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={role === "admin" ? 205 : 240}>
              <AreaChart data={monthlySales} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f766e" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#5b6878" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#5b6878" }}
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
                  stroke="#0f172a"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  dot={{ r: 3, fill: "#0f766e" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {role === "admin" ? (
            <div
              className="db-chart-box db-chart-box--clickable"
              role="button"
              tabIndex={0}
              onClick={() => {
                if (managerPerformance.length > 0) {
                  setPerformanceView("manager");
                  setShowManagerPerformance(true);
                }
              }}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && managerPerformance.length > 0) {
                  event.preventDefault();
                  setPerformanceView("manager");
                  setShowManagerPerformance(true);
                }
              }}
            >
              <div className="db-chart-head">
                <div>
                  <div className="db-chart-title">{chartCopy[role].managerPerformanceTitle}</div>
                  <div className="db-chart-subtitle">{chartCopy[role].managerPerformanceSubtitle}</div>
                </div>
                <div className="db-chart-metric">
                  <span>Top Manager</span>
                  <strong>{topManager?.name ?? "N/A"}</strong>
                </div>
              </div>
              <div className="db-performance-card-actions">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPerformanceView("state");
                    setShowManagerPerformance(true);
                  }}
                  aria-label="View state-wise performance"
                >
                  States <FiChevronDown />
                </button>
              </div>
              {topManagerPerformance.length === 0 ? (
                <div className="db-no-data">No manager sales data for this period</div>
              ) : (
                <div className="db-manager-ranking db-manager-ranking--compact">
                  {topManagerPerformance.map((item, index) => (
                    <div className="db-manager-rank-row" key={item.id}>
                      <span className="db-manager-rank-number">{index + 1}</span>
                      <div className="db-manager-rank-main">
                        <div className="db-manager-rank-meta">
                          <span className="db-manager-rank-name">{item.name}</span>
                          <strong>{fmtCompactCurrency(item.sales)}</strong>
                        </div>
                        <div className="db-manager-rank-track">
                          <span
                            className="db-manager-rank-fill"
                            style={{
                              width: getSalesWidth(item.sales, managerMaxSales),
                              background: PALETTE[index % PALETTE.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      <div className={`db-charts-row${shouldExpandVolumeChart ? " db-charts-row--single" : ""}`}>
        <div className="db-chart-box db-chart-box--wide">
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">{chartCopy[role].volumeTitle}</div>
              <div className="db-chart-subtitle">{chartCopy[role].volumeSubtitle}</div>
            </div>
            <div className="db-chart-metric">
              <span>{orderVolumeMetricLabel}</span>
              <strong>{fmt(totalOrders)}</strong>
            </div>
          </div>
          {monthlySales.length === 0 ? (
            <div className="db-no-data">No monthly order data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={shouldExpandVolumeChart ? 360 : 235}>
              <BarChart data={monthlySales} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#5b6878" }} />
                <YAxis tick={{ fontSize: 11, fill: "#5b6878" }} width={42} />
                <Tooltip formatter={(v) => [v, "Orders"]} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={shouldExpandVolumeChart ? 44 : 72}>
                  {monthlySales.map((item, index) => (
                    <Cell key={item.label} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {!shouldExpandVolumeChart && (
          <div className="db-chart-box">
            <div className="db-chart-head">
              <div>
                <div className="db-chart-title">{chartCopy[role].categoryTitle}</div>
                <div className="db-chart-subtitle">{chartCopy[role].categorySubtitle}</div>
              </div>
              <div className="db-chart-metric">
                <span>Top Category</span>
                <strong>{topCategory?.category ?? "N/A"}</strong>
              </div>
            </div>
            {categorySales.length === 0 ? (
              <div className="db-no-data">No category data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={categorySales} margin={{ top: 10, right: 16, bottom: 24, left: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 11, fill: "#5b6878" }}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#5b6878" }}
                    tickFormatter={fmtCompactCurrency}
                    width={72}
                  />
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
          </div>
        )}
      </div>
    </>
  );
}
