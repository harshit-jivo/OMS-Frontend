/**
 * All Dashboard state, effects and derived data — data-fetching, the
 * role-aware KPI/chart derivations, and every dialog's open/close state.
 *
 * Split out of `Dashboard.tsx` (Phase 4 decomposition), following the
 * `useSalesOrderForm` convention: one hook owns everything, `Dashboard.tsx`
 * and `components/*` just destructure the pieces they render. `kpiConfig`
 * stays OUT of this file (and out of this return object) because it embeds
 * JSX icons (`<HiOutlineClipboardDocumentList />`) — a `.ts` file can't hold
 * JSX, so that per-role card list is built in `components/KpiRow.tsx`
 * instead, fed by the plain values this hook already computes
 * (`completedRevenue`, `outstandingOrders`, `completionCount`, etc).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getCurrentUser } from "../../services/authService";
import { ordersService } from "../../services/ordersService";
import { useUILabels } from "../../services/uiConfig";
import type { Order } from "../../services/ordersService";
import api from "../../services/api";

import { EMPTY_CHARTS, EMPTY_KPI, MONTH_OPTIONS, PALETTE, currentYear, roleContent } from "./constants";
import {
  fmtCurrency,
  mergeRejectedStatuses,
  normalizeRole,
  normalizeStatusLabels,
  shouldHideStatus,
} from "./format";
import type { ChartsData, CurrentUser, KPIData, SupportedRole, TopPartyView } from "./types";

const isUnauthorized = (result: PromiseSettledResult<unknown>) =>
  result.status === "rejected" &&
  (result.reason?.response?.status === 401 || result.reason?.status === 401);

const hasVisibleData = (nextKpi: KPIData, nextCharts: ChartsData) => {
  if ((nextKpi.total_orders ?? 0) > 0) {
    return true;
  }

  return (nextCharts.monthly_sales ?? []).some(
    (item) => (item.count ?? 0) > 0 || (item.revenue ?? 0) > 0,
  );
};

export function useDashboard() {
  const { t } = useUILabels();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(0);
  const [topPartyView, setTopPartyView] = useState<TopPartyView>(5);
  const [showMoreStatuses, setShowMoreStatuses] = useState(false);
  const [showSalesBreakdown, setShowSalesBreakdown] = useState(false);
  const [showManagerPerformance, setShowManagerPerformance] = useState(false);
  const [performanceView, setPerformanceView] = useState<"manager" | "state">("manager");
  const [selectedItemState, setSelectedItemState] = useState<string | null>(null);
  const [showStateItems, setShowStateItems] = useState(false);
  const [selectedItemVariety, setSelectedItemVariety] = useState("ALL");
  const [showAllItemStates, setShowAllItemStates] = useState(false);
  const [statusOrdersModal, setStatusOrdersModal] = useState<{
    status: string;
    label: string;
  } | null>(null);
  const [statusOrders, setStatusOrders] = useState<Order[]>([]);
  const [statusOrdersLoading, setStatusOrdersLoading] = useState(false);
  const [statusOrdersError, setStatusOrdersError] = useState("");
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  /*
   * KPIs, charts and the profile in ONE query.
   *
   * They were one `Promise.allSettled` and must stay one: the 401 check below
   * reads all three results together, and a partial failure is reported as a
   * single "Unable to load dashboard data" only when BOTH data calls fail.
   *
   * The year fallback stays inside the queryFn too. It is the reason this could
   * not simply become `useQuery` keyed on `[year, month]` — the old code called
   * `setYear(fallbackYear)` from inside the fetch, which changes the key, which
   * refetches. It now RETURNS the year it settled on and the adopt below is
   * identity-guarded, so it runs once instead of looping.
   */
  const { data, isPending: loading, isError } = useQuery({
    queryKey: ["dashboard", year, month],
    queryFn: async () => {
      const [profileRes, kpiRes, chartsRes] = await Promise.allSettled([
        getCurrentUser(),
        api.get(`/orders/dashboardW/?year=${year}&month=${month}`),
        api.get(`/orders/dashboardW/charts/?line_year=${year}&year=${year}&month=${month}`),
      ]);

      if (isUnauthorized(profileRes) || isUnauthorized(kpiRes) || isUnauthorized(chartsRes)) {
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
        navigate("/");
        return null;
      }

      const user = profileRes.status === "fulfilled" ? profileRes.value : null;
      const nextKpi =
        kpiRes.status === "fulfilled" ? { ...EMPTY_KPI, ...kpiRes.value.data } : EMPTY_KPI;
      const nextCharts =
        chartsRes.status === "fulfilled" ? { ...EMPTY_CHARTS, ...chartsRes.value.data } : EMPTY_CHARTS;

      // A brand-new year with nothing in it yet shows last year instead, rather
      // than an empty dashboard that looks broken.
      if (year === currentYear && !hasVisibleData(nextKpi, nextCharts)) {
        const fallbackYear = currentYear - 1;
        const [fbKpiRes, fbChartsRes] = await Promise.allSettled([
          api.get(`/orders/dashboardW/?year=${fallbackYear}&month=${month}`),
          api.get(
            `/orders/dashboardW/charts/?line_year=${fallbackYear}&year=${fallbackYear}&month=${month}`,
          ),
        ]);
        const fallbackKpi =
          fbKpiRes.status === "fulfilled" ? { ...EMPTY_KPI, ...fbKpiRes.value.data } : EMPTY_KPI;
        const fallbackCharts =
          fbChartsRes.status === "fulfilled"
            ? { ...EMPTY_CHARTS, ...fbChartsRes.value.data }
            : EMPTY_CHARTS;
        if (hasVisibleData(fallbackKpi, fallbackCharts)) {
          return { user, kpi: fallbackKpi, charts: fallbackCharts, settledYear: fallbackYear };
        }
      }

      return {
        user,
        kpi: nextKpi,
        charts: nextCharts,
        settledYear: year,
        bothFailed: kpiRes.status === "rejected" && chartsRes.status === "rejected",
      };
    },
  });

  // Annotated rather than inferred: the responses are spread from `any` axios
  // bodies, so without these the chart `.map` callbacks all become implicit any.
  const kpi: KPIData | null = data?.kpi ?? null;
  const charts: ChartsData | null = data?.charts ?? null;
  const user: CurrentUser | null = data?.user ?? null;
  const error = isError || data?.bothFailed ? "Unable to load dashboard data right now." : "";

  /* Adopt the year the fallback settled on. Identity-guarded so it runs once
     per result rather than re-keying the query forever. */
  const [adoptedFrom, setAdoptedFrom] = useState<typeof data>(undefined);
  if (data && data !== adoptedFrom) {
    setAdoptedFrom(data);
    if (data.settledYear !== year) setYear(data.settledYear);
  }

  const fetchData = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });

  const role = normalizeRole(user?.role);
  const roleMeta = roleContent[role];
  const isBilling = role === "billing";
  const isReviewRole = role === "auditor" || role === "approver";
  const shouldExpandVolumeChart = role === "billing" || isReviewRole;
  // Top Parties is only relevant to admin/manager; hide it for auditor, approver and billing.
  const showTopParties = !(isReviewRole || isBilling);

  const activeStatus = useMemo(
    () => (charts?.status_distribution ?? []).filter((item) => item.count > 0),
    [charts?.status_distribution],
  );

  const categorySales = charts?.category_sales ?? [];
  const topCategory = useMemo(() => {
    const [best] = [...categorySales].sort((a, b) => b.total_sales - a.total_sales);
    return best;
  }, [categorySales]);
  const stateItemSales = charts?.state_item_sales ?? [];
  const visibleItemStates = showAllItemStates ? stateItemSales : stateItemSales.slice(0, 5);
  const hiddenItemStateCount = Math.max(stateItemSales.length - visibleItemStates.length, 0);
  const activeItemState =
    selectedItemState && stateItemSales.some((item) => item.state === selectedItemState)
      ? selectedItemState
      : stateItemSales[0]?.state;
  const activeStateProducts = useMemo(
    () => stateItemSales.find((item) => item.state === activeItemState)?.products ?? [],
    [activeItemState, stateItemSales],
  );
  const activeStateFilteredProducts = useMemo(
    () =>
      selectedItemVariety === "ALL"
        ? activeStateProducts
        : activeStateProducts.filter((item) => (item.variety || "Unknown") === selectedItemVariety),
    [activeStateProducts, selectedItemVariety],
  );
  const activeStateVarietyTotals = useMemo(() => {
    const totals = activeStateProducts.reduce<
      Record<string, { variety: string; total_sales: number; quantity: number; count: number }>
    >((acc, item) => {
      const variety = item.variety || "Unknown";
      if (!acc[variety]) {
        acc[variety] = { variety, total_sales: 0, quantity: 0, count: 0 };
      }
      acc[variety].total_sales += item.total_sales;
      acc[variety].quantity += item.quantity;
      acc[variety].count += item.count;
      return acc;
    }, {});

    return Object.values(totals).sort((a, b) => b.total_sales - a.total_sales);
  }, [activeStateProducts]);
  const activeStateMaxVarietySales = useMemo(
    () => Math.max(...activeStateVarietyTotals.map((item) => item.total_sales), 0),
    [activeStateVarietyTotals],
  );
  const topStateVarieties = useMemo(
    () => activeStateVarietyTotals.slice(0, 3),
    [activeStateVarietyTotals],
  );
  const activeStateMaxProductSales = useMemo(
    () => Math.max(...activeStateFilteredProducts.map((item) => item.total_sales), 0),
    [activeStateFilteredProducts],
  );
  const topParties = useMemo(
    () =>
      (charts?.top_parties ?? []).filter(
        (item) => (item.count ?? 0) > 0 || (item.revenue ?? 0) > 0,
      ),
    [charts?.top_parties],
  );
  const visibleTopParties = useMemo(
    () => (topPartyView === "all" ? topParties : topParties.slice(0, topPartyView)),
    [topParties, topPartyView],
  );
  const topParty = topParties[0];

  const monthlySales = charts?.monthly_sales ?? [];
  const managerPerformance = useMemo(
    () =>
      (charts?.manager_performance ?? []).map((item) => ({
        id: item.manager_id ?? item.manager_name,
        name: item.manager_name,
        sales: item.sales ?? 0,
        orders: item.orders ?? 0,
      })),
    [charts?.manager_performance],
  );
  const statePerformance = useMemo(
    () =>
      (charts?.statewise_orders ?? [])
        .map((item) => ({
          id: item.state,
          name: item.state,
          sales: item.sales ?? 0,
          orders: item.orders ?? 0,
        }))
        .sort((a, b) => b.sales - a.sales || b.orders - a.orders || a.name.localeCompare(b.name)),
    [charts?.statewise_orders],
  );
  const activePerformance = performanceView === "state" ? statePerformance : managerPerformance;
  const topManager = managerPerformance[0];
  const topManagerPerformance = useMemo(() => managerPerformance.slice(0, 5), [managerPerformance]);
  const managerMaxSales = useMemo(
    () => Math.max(...managerPerformance.map((item) => item.sales), 0),
    [managerPerformance],
  );
  const activePerformanceMaxSales = useMemo(
    () => Math.max(...activePerformance.map((item) => item.sales), 0),
    [activePerformance],
  );
  const getSalesWidth = (sales: number, maxSales: number) => {
    if (maxSales <= 0) return "0%";
    const percent = (sales / maxSales) * 100;
    return `${sales > 0 ? Math.max(percent, 6) : 0}%`;
  };
  const peakMonth = useMemo(() => {
    const [best] = [...monthlySales].sort((a, b) => b.revenue - a.revenue);
    return best;
  }, [monthlySales]);
  const highestSalesOrder = charts?.highest_sales_order;
  const revenueMetricLabel = month === 0 ? "Peak Revenue" : "Highest Order";
  const revenueMetricValue =
    month === 0
      ? peakMonth
        ? fmtCurrency(peakMonth.revenue)
        : "N/A"
      : highestSalesOrder && highestSalesOrder.amount > 0
        ? fmtCurrency(highestSalesOrder.amount)
        : "N/A";

  const acceptedCount = activeStatus
    .filter((item) => {
      const statusValue = `${item.status} ${item.label}`.toLowerCase();
      return ["approved", "accepted", "completed", "delivered"].some((value) =>
        statusValue.includes(value),
      );
    })
    .reduce((sum, item) => sum + item.count, 0);
  // Billing-specific counts derived from status_counts (more accurate than keyword matching)
  const statusCounts = kpi?.status_counts ?? {};
  const billingRejectedCount = Object.entries(statusCounts).reduce(
    (sum, [key, val]) => (key.toLowerCase().includes("billing rejected") ? sum + val : sum),
    0,
  );
  const billingQueueCount = Object.entries(statusCounts).reduce((sum, [key, val]) => {
    const k = key.toLowerCase();
    return k === "billing" || k === "billing pending" ? sum + val : sum;
  }, 0);
  const reviewAcceptedCount = kpi?.accepted_orders ?? 0;
  const reviewRejectedCount = kpi?.rejected_orders ?? 0;
  const reviewPendingCount = kpi?.pending_review_orders ?? 0;
  const billingAcceptedCount = kpi?.accepted_orders ?? 0;
  const billingRejectedHandledCount = billingRejectedCount;
  const billingHandledCount = billingAcceptedCount + billingRejectedHandledCount;
  const totalOrders = kpi?.total_orders ?? 0;
  const billingPendingCount = kpi?.pending_review_orders ?? billingQueueCount;
  const completionCount = isReviewRole
    ? reviewAcceptedCount
    : role === "billing"
      ? billingHandledCount
      : acceptedCount;
  const outstandingOrders = isReviewRole ? reviewPendingCount : billingPendingCount;
  const reviewDecisionChart = [
    {
      status: "accepted",
      label: role === "approver" ? "Approved" : "Accepted",
      count: reviewAcceptedCount,
    },
    { status: "rejected", label: "Rejected", count: reviewRejectedCount },
    {
      status: "pending",
      label: role === "approver" ? "Pending Approval" : "Pending Review",
      count: reviewPendingCount,
    },
  ].filter((item) => item.count > 0);
  const billingDecisionChart = [
    { status: "accepted", label: "Accepted", count: billingAcceptedCount },
    { status: "rejected", label: "Rejected", count: billingRejectedHandledCount },
    { status: "queue", label: "Pending", count: billingPendingCount },
  ].filter((item) => item.count > 0);
  const decisionDistribution = charts?.decision_distribution;
  const monthDecisionChart = (decisionDistribution ?? []).filter((item) => item.count > 0);
  const rawStatusItems =
    isReviewRole || role === "billing"
      ? decisionDistribution
        ? monthDecisionChart
        : monthDecisionChart.length > 0
          ? monthDecisionChart
          : isReviewRole
            ? reviewDecisionChart
            : billingDecisionChart
      : activeStatus;
  const statusItems = normalizeStatusLabels(
    mergeRejectedStatuses(rawStatusItems).filter((item) => !shouldHideStatus(item)),
  );
  const isPrimaryStatus = (item: { status: string; label: string }) => {
    const statusValue = `${item.status} ${item.label}`.toLowerCase();
    return (
      /\bcompleted\b/.test(statusValue) ||
      /\brejected\b/.test(statusValue) ||
      /\baccepted\b/.test(statusValue) ||
      /\bapproved\b/.test(statusValue) ||
      /\bdelivered\b/.test(statusValue)
    );
  };
  const primaryStatusItems = statusItems.filter(isPrimaryStatus);
  const statusDisplayItems = primaryStatusItems.length > 0 ? primaryStatusItems : statusItems;
  const hiddenStatusItems =
    primaryStatusItems.length > 0 ? statusItems.filter((item) => !isPrimaryStatus(item)) : [];
  const hiddenStatusCount = hiddenStatusItems.length;
  const getStatusColor = (statusItem: { status: string; label: string }) => {
    const sourceIndex = statusItems.findIndex(
      (item) => item.status === statusItem.status && item.label === statusItem.label,
    );
    return PALETTE[(sourceIndex >= 0 ? sourceIndex : 0) % PALETTE.length];
  };

  // Status slices/legend are only backed by real OrderStatus codes for admin/manager.
  // Review/billing roles render synthetic decision buckets that can't be fetched by code.
  const statusClickable = !(isReviewRole || role === "billing");

  const getStatusCodesForItem = (statusItem: { status: string; label: string }) => {
    // "Rejected" is a merged bucket (synthetic status === "rejected"); expand it back to
    // every underlying rejected status code so the modal can fetch all of them.
    if (statusItem.status === "rejected") {
      const codes = activeStatus
        .filter((item) => `${item.status} ${item.label}`.toLowerCase().includes("rejected"))
        .map((item) => item.status);
      return codes.length > 0 ? codes : [statusItem.status];
    }
    return [statusItem.status];
  };

  const openStatusOrders = async (statusItem: { status: string; label: string }) => {
    if (!statusClickable) return;
    setStatusOrdersModal({ status: statusItem.status, label: statusItem.label });
    setStatusOrders([]);
    setStatusOrdersError("");
    setStatusOrdersLoading(true);

    try {
      const codes = getStatusCodesForItem(statusItem).join(",");
      const orders = await ordersService.getOrders(codes);
      setStatusOrders(Array.isArray(orders) ? orders : []);
    } catch (err) {
      console.error("Error fetching status orders:", err);
      setStatusOrdersError("Unable to load orders for this status.");
    } finally {
      setStatusOrdersLoading(false);
    }
  };
  // Names of the rate approver(s) still holding an order (status PENDING).
  // Only relevant while the order is actually at the rate-approval stage —
  // once it moves on (e.g. to billing) it can keep stale PENDING rows, which
  // we must not show as "with the rate approver".
  const getPendingRateApprovers = (order: Order) => {
    const isAtRateApproval = String(order.status_display || "")
      .toLowerCase()
      .includes("rate");
    if (!isAtRateApproval) return [];
    return (order.rate_approvals || [])
      .filter((approval) => String(approval.status || "").toUpperCase() === "PENDING")
      .map((approval) => approval.approver_name)
      .filter(Boolean);
  };

  // Name of the user who rejected the order — only relevant for rejected orders.
  const getRejectedByName = (order: Order) => {
    const isRejected = String(order.status_display || "")
      .toLowerCase()
      .includes("reject");
    return isRejected ? order.rejected_by || "" : "";
  };

  const selectedMonthLabel =
    MONTH_OPTIONS.find((option) => option.value === month)?.label ?? "All Months";
  const selectedPeriodLabel = month === 0 ? `${year}` : `${selectedMonthLabel} ${year}`;
  const orderVolumeMetricLabel = month === 0 ? "Year Total" : `${selectedMonthLabel} Total`;
  const completedRevenue = kpi?.completed_revenue ?? 0;
  const allRevenue = kpi?.total_revenue ?? 0;
  const rejectedRevenue = kpi?.rejected_revenue ?? 0;
  const pendingRevenue = kpi?.pending_revenue ?? 0;
  const overviewTotalCount = statusItems.reduce((sum, item) => sum + item.count, 0);
  const overviewAcceptedCount = statusItems
    .filter((item) => {
      const statusValue = `${item.status} ${item.label}`.toLowerCase();
      return ["accepted", "approved", "completed", "delivered"].some((value) =>
        statusValue.includes(value),
      );
    })
    .reduce((sum, item) => sum + item.count, 0);
  const overviewCompletedCount = statusItems
    .filter((item) => {
      const statusValue = `${item.status} ${item.label}`.toLowerCase();
      return statusValue.includes("completed");
    })
    .reduce((sum, item) => sum + item.count, 0);
  const overviewRejectedCount = statusItems
    .filter((item) => {
      const statusValue = `${item.status} ${item.label}`.toLowerCase();
      return ["rejected", "declined", "cancelled", "canceled"].some((value) =>
        statusValue.includes(value),
      );
    })
    .reduce((sum, item) => sum + item.count, 0);
  const overviewPendingCount = statusItems
    .filter((item) => {
      const statusValue = `${item.status} ${item.label}`.toLowerCase();
      return ["pending", "queue", "review", "billing"].some((value) => statusValue.includes(value));
    })
    .reduce((sum, item) => sum + item.count, 0);
  const overviewHandledCount =
    role === "admin"
      ? overviewCompletedCount + overviewRejectedCount
      : overviewAcceptedCount + overviewRejectedCount;
  const overviewRate =
    overviewTotalCount > 0 ? Math.round((overviewHandledCount / overviewTotalCount) * 100) : 0;

  const chartCopy = {
    admin: {
      salesTitle: `Monthly Sales Trend (${year})`,
      salesSubtitle: "Revenue movement across the selected year",
      statusTitle: `Order Status (${year})`,
      statusSubtitle: "Current mix of order stages",
      managerPerformanceTitle: `Top Manager Performance (${year})`,
      managerPerformanceSubtitle: "Completed order sales by manager",
      volumeTitle: `Monthly Order Volume (${year})`,
      volumeSubtitle: "How order count moves across the year",
      categoryTitle: `Category Sales (${year})`,
      categorySubtitle: "Completed order sales by product category",
    },
    auditor: {
      salesTitle: `Monthly Audit Value (${year})`,
      salesSubtitle: "Received order value across the selected year",
      statusTitle: `Audit Decisions (${year})`,
      statusSubtitle: "Accepted, rejected and in-review mix",
      managerPerformanceTitle: `Manager Performance (${year})`,
      managerPerformanceSubtitle: "Completed order sales by manager",
      volumeTitle: `Monthly Orders Received (${year})`,
      volumeSubtitle: "Audit intake across the year",
      categoryTitle: `Category Value Under Review (${year})`,
      categorySubtitle: "Product categories covered in audit scope",
    },
    approver: {
      salesTitle: `Monthly Rate Approval Value (${year})`,
      salesSubtitle: "Rate approval value across the selected year",
      statusTitle: `Rate Approval Decisions (${year})`,
      statusSubtitle: "Approved, rejected and pending approval mix",
      managerPerformanceTitle: `Manager Performance (${year})`,
      managerPerformanceSubtitle: "Completed order sales by manager",
      volumeTitle: `Monthly Orders Received (${year})`,
      volumeSubtitle: "Rate approval intake across the year",
      categoryTitle: `Category Value Under Approval (${year})`,
      categorySubtitle: "Product categories covered in rate approval scope",
    },
    manager: {
      salesTitle: `Monthly Sales Trend (${year})`,
      salesSubtitle: "Revenue movement across the selected year",
      statusTitle: `Order Status (${year})`,
      statusSubtitle: "Current mix of order stages",
      managerPerformanceTitle: `Manager Performance (${year})`,
      managerPerformanceSubtitle: "Completed order sales by manager",
      volumeTitle: `Monthly Order Volume (${year})`,
      volumeSubtitle: "How order count moves across the year",
      categoryTitle: `Category Sales (${year})`,
      categorySubtitle: "Revenue split by product category",
    },
    billing: {
      salesTitle: `Monthly Billing Orders (${year})`,
      salesSubtitle: "Billing order movement across the selected year",
      statusTitle: `Billing Decisions (${year})`,
      statusSubtitle: "Accepted, rejected and queued billing orders",
      managerPerformanceTitle: `Manager Performance (${year})`,
      managerPerformanceSubtitle: "Completed order sales by manager",
      volumeTitle: `Monthly Billing Orders (${year})`,
      volumeSubtitle: "Billing-stage order volume across the year",
      categoryTitle: `Category Billing Orders (${year})`,
      categorySubtitle: "Billing orders split by product category",
    },
  } satisfies Record<
    SupportedRole,
    {
      salesTitle: string;
      salesSubtitle: string;
      statusTitle: string;
      statusSubtitle: string;
      managerPerformanceTitle: string;
      managerPerformanceSubtitle: string;
      volumeTitle: string;
      volumeSubtitle: string;
      categoryTitle: string;
      categorySubtitle: string;
    }
  >;

  return {
    t,
    year,
    setYear,
    month,
    setMonth,
    topPartyView,
    setTopPartyView,
    showMoreStatuses,
    setShowMoreStatuses,
    showSalesBreakdown,
    setShowSalesBreakdown,
    showManagerPerformance,
    setShowManagerPerformance,
    performanceView,
    setPerformanceView,
    selectedItemState,
    setSelectedItemState,
    showStateItems,
    setShowStateItems,
    selectedItemVariety,
    setSelectedItemVariety,
    showAllItemStates,
    setShowAllItemStates,
    statusOrdersModal,
    setStatusOrdersModal,
    statusOrders,
    statusOrdersLoading,
    statusOrdersError,
    detailOrder,
    setDetailOrder,
    loading,
    error,
    kpi,
    charts,
    user,
    fetchData,
    role,
    roleMeta,
    isBilling,
    isReviewRole,
    shouldExpandVolumeChart,
    showTopParties,
    activeStatus,
    categorySales,
    topCategory,
    stateItemSales,
    visibleItemStates,
    hiddenItemStateCount,
    activeItemState,
    activeStateFilteredProducts,
    activeStateVarietyTotals,
    activeStateMaxVarietySales,
    topStateVarieties,
    activeStateMaxProductSales,
    topParties,
    visibleTopParties,
    topParty,
    monthlySales,
    managerPerformance,
    statePerformance,
    activePerformance,
    topManager,
    topManagerPerformance,
    managerMaxSales,
    activePerformanceMaxSales,
    getSalesWidth,
    peakMonth,
    revenueMetricLabel,
    revenueMetricValue,
    completionCount,
    outstandingOrders,
    totalOrders,
    billingPendingCount,
    billingHandledCount,
    reviewAcceptedCount,
    statusItems,
    statusDisplayItems,
    hiddenStatusItems,
    hiddenStatusCount,
    getStatusColor,
    statusClickable,
    openStatusOrders,
    getPendingRateApprovers,
    getRejectedByName,
    selectedPeriodLabel,
    orderVolumeMetricLabel,
    completedRevenue,
    allRevenue,
    rejectedRevenue,
    pendingRevenue,
    overviewTotalCount,
    overviewAcceptedCount,
    overviewPendingCount,
    overviewHandledCount,
    overviewRate,
    chartCopy,
  };
}

export type DashboardState = ReturnType<typeof useDashboard>;
