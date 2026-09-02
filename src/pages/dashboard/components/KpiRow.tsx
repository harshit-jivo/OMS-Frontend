/**
 * The four-role KPI card row at the top of the Dashboard.
 *
 * `kpiConfig` lives here (not in `useDashboard`) purely because it embeds a
 * JSX icon (`<HiOutlineClipboardDocumentList />`) for two roles — a `.ts`
 * hook file can't hold JSX. Everything it's built from (`completedRevenue`,
 * `outstandingOrders`, `completionCount`, ...) comes straight off the hook,
 * unchanged from the pre-split `Dashboard.tsx`.
 */
import type { ReactNode } from "react";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import { HiOutlineClipboardDocumentList } from "react-icons/hi2";

import { currencyPrefix } from "../constants";
import { fmt, fmtCurrency } from "../format";
import type { DashboardState } from "../useDashboard";
import type { SupportedRole } from "../types";

export default function KpiRow({ dashboard }: { dashboard: DashboardState }) {
  const {
    role,
    kpi,
    completedRevenue,
    outstandingOrders,
    reviewAcceptedCount,
    completionCount,
    billingPendingCount,
    billingHandledCount,
    totalOrders,
    showSalesBreakdown,
    setShowSalesBreakdown,
  } = dashboard;

  const kpiConfig = {
    admin: [
      {
        icon: currencyPrefix,
        tone: "db-card--teal",
        label: "Total Sales",
        value: fmtCurrency(completedRevenue),
        sub: "Completed order sales",
        salesBreakdown: true,
      },
      {
        icon: "⚡",
        tone: "db-card--dark",
        label: "This Month",
        value: fmt(kpi?.this_month_orders ?? 0),
        sub: "Monthly order momentum",
      },
      {
        icon: "🗓️",
        tone: "db-card--teal",
        label: "Today Orders",
        value: fmt(kpi?.today_orders ?? 0),
        sub: "Orders created today",
      },
    ],
    auditor: [
      {
        icon: "📥",
        tone: "db-card--teal",
        label: "This Month Orders",
        value: fmt(kpi?.this_month_orders ?? 0),
        sub: "Orders assigned for audit review",
      },
      {
        icon: <HiOutlineClipboardDocumentList aria-hidden="true" />,
        tone: "db-card--blue",
        label: "Pending Review",
        value: fmt(outstandingOrders),
        sub: "Orders still awaiting decision",
      },
      {
        icon: "✅",
        tone: "db-card--dark",
        label: "Accepted Orders",
        value: fmt(reviewAcceptedCount),
        sub: "Orders accepted by auditor",
      },
    ],
    approver: [
      {
        icon: "📥",
        tone: "db-card--teal",
        label: "This Month Orders",
        value: fmt(totalOrders),
        sub: "Orders assigned for rate approval",
      },
      {
        icon: <HiOutlineClipboardDocumentList aria-hidden="true" />,
        tone: "db-card--blue",
        label: "Pending Approval",
        value: fmt(outstandingOrders),
        sub: "Orders still awaiting rate decision",
      },
      {
        icon: "✅",
        tone: "db-card--dark",
        label: "Approved Orders",
        value: fmt(reviewAcceptedCount),
        sub: "Orders approved by rate approver",
      },
    ],
    manager: [
      {
        icon: currencyPrefix,
        tone: "db-card--teal",
        label: "Total Sales",
        value: fmtCurrency(completedRevenue),
        sub: "Completed order sales",
        salesBreakdown: true,
      },
      {
        icon: "📦",
        tone: "db-card--blue",
        label: "Completed  Orders",
        value: fmt(completionCount ?? 0),
        sub: "Across selected year",
      },
      {
        icon: "⚡",
        tone: "db-card--dark",
        label: "Today Orders",
        value: fmt(kpi?.today_orders ?? 0),
        sub: "Live operational pace",
      },
    ],
    billing: [
      {
        icon: "🕒",
        tone: "db-card--blue",
        label: "Pending Orders",
        value: fmt(billingPendingCount),
        sub: "Orders waiting in billing queue",
      },
      {
        icon: "📌",
        tone: "db-card--teal",
        label: "Handled Orders",
        value: fmt(billingHandledCount),
        sub: "Orders sent to auditor or rejected",
      },
      {
        icon: "🗓️",
        tone: "db-card--blue",
        label: "Today Orders",
        value: fmt(kpi?.today_orders ?? 0),
        sub: "Billing orders updated today",
      },
    ],
  } satisfies Record<
    SupportedRole,
    {
      icon: ReactNode;
      tone: string;
      label: string;
      value: string;
      sub: string;
      salesBreakdown?: boolean;
    }[]
  >;

  return (
    <div className="db-kpi-row">
      {kpiConfig[role].map((item) => (
        <div className={`db-card ${item.tone}`} key={item.label}>
          {"salesBreakdown" in item && item.salesBreakdown ? (
            <div className="db-card-menu-wrap">
              <button
                type="button"
                className="db-card-menu-trigger"
                onClick={() => setShowSalesBreakdown((current) => !current)}
                aria-label={`${showSalesBreakdown ? "Hide" : "Show"} sales breakdown`}
                aria-expanded={showSalesBreakdown}
              >
                {showSalesBreakdown ? <FiChevronUp /> : <FiChevronDown />}
              </button>
            </div>
          ) : null}
          <div className="db-card-icon">{item.icon}</div>
          <div className="db-card-label">{item.label}</div>
          <div
            className={`db-card-value ${item.label.toLowerCase().includes("sales") ? "db-card-value--sm" : ""}`}
          >
            {item.value}
          </div>
          <div className="db-card-sub">{item.sub}</div>
        </div>
      ))}
    </div>
  );
}
