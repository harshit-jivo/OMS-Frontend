import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import { HiOutlineClipboardDocumentList } from "react-icons/hi2";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCurrentUser } from "../services/authService";
import api from "../services/api";
import "../styles/Dashboard.css";

interface KPIData {
  total_orders: number;
  total_revenue: string;
  completed_revenue?: string;
  rejected_revenue?: string;
  pending_revenue?: string;
  today_orders: number;
  this_month_orders: number;
  status_counts: Record<string, number>;
  user_counts: Record<string, number>;
  accepted_orders?: number;
  rejected_orders?: number;
  pending_review_orders?: number;
  reviewed_orders?: number;
}

interface ChartsData {
  monthly_sales: { month: string; label: string; revenue: number; count: number }[];
  statewise_orders: { state: string; orders: number; sales?: number }[];
  manager_performance?: { manager_id: number | null; manager_name: string; orders: number; sales: number }[];
  manager_state_performance?: { manager_id: number | null; manager_name: string; state: string; orders: number; sales: number }[];
  status_distribution: { status: string; label: string; count: number }[];
  decision_distribution?: { status: string; label: string; count: number }[];
  top_parties: { card_code: string; card_name: string; count: number; revenue: number }[];
  category_sales: { category: string; total_sales: number; count: number }[];
  state_item_sales?: StateItemSales[];
  highest_sales_order?: { order_number: string | null; amount: number };
}

interface StateItemSales {
  state: string;
  products: {
    item_code: string;
    item_name: string;
    category: string;
    variety: string;
    total_sales: number;
    quantity: number;
    count: number;
  }[];
}

interface CurrentUser {
  role?: string;
  username?: string;
  full_name?: string;
  name?: string;
}

type SupportedRole = "admin" | "auditor" | "manager" | "billing" | "approver";
type TopPartyView = "all" | 5 | 10;

const PALETTE = ["#0f766e", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#4f46e5", "#ea580c"];
const TOP_PARTY_VIEW_OPTIONS: Array<{ label: string; value: TopPartyView }> = [
  { label: "All", value: "all" },
  { label: "Top 5", value: 5 },
  { label: "Top 10", value: 10 },
];
const MONTH_OPTIONS = [
  { label: "All Months", value: 0 },
  ...Array.from({ length: 12 }, (_, index) => ({
    label: new Date(2000, index).toLocaleString("default", { month: "short" }),
    value: index + 1,
  })),
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, index) => currentYear - index);

const fmt = (n: number | string) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const currencyPrefix = "\u20B9";

const fmtCurrency = (n: number | string) =>
  `${currencyPrefix}${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtCompactCurrency = (value: number | string) => {
  const amount = Number(value || 0);
  if (amount >= 10000000) return `${currencyPrefix}${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `${currencyPrefix}${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${currencyPrefix}${(amount / 1000).toFixed(1)}K`;
  return `${currencyPrefix}${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

const roleContent: Record<SupportedRole, { title: string; subtitle: string; focus: string; accent: string }> = {
  admin: {
    title: "Welcome",
    subtitle: "Platform-wide sales, orders and team performance at a glance.",
    focus: "System overview",
    accent: "Admin control center",
  },
  auditor: {
    title: "Welcome",
    subtitle: "Track received orders, audit value, accepted decisions and pending review workload.",
    focus: "Audit visibility",
    accent: "Review and exception tracking",
  },
  approver: {
    title: "Welcome",
    subtitle: "Track rate approval decisions, approved orders and pending approval workload.",
    focus: "Rate approval visibility",
    accent: "Rate approval tracking",
  },
  manager: {
    title: "Welcome",
    subtitle: "Monitor sales output, order progress and daily execution for your territory.",
    focus: "Field performance",
    accent: "Sales execution snapshot",
  },
  billing: {
    title: "Welcome",
    subtitle: "Track billing-stage orders, invoicing workload and order value ready for processing.",
    focus: "Billing operations",
    accent: "Invoice and billing queue",
  },
};

const normalizeRole = (role?: string): SupportedRole => {
  const value = role?.toLowerCase();
  if (value === "admin" || value === "auditor" || value === "manager" || value === "billing" || value === "approver") {
    return value;
  }
  return "manager";
};

const mergeRejectedStatuses = <T extends { status: string; label: string; count: number }>(items: T[]) => {
  const merged: Array<{ status: string; label: string; count: number }> = [];
  let rejectedItem: { status: string; label: string; count: number } | null = null;

  for (const item of items) {
    const statusValue = `${item.status} ${item.label}`.toLowerCase();

    if (statusValue.includes("rejected")) {
      if (!rejectedItem) {
        rejectedItem = { status: "rejected", label: "Rejected", count: 0 };
        merged.push(rejectedItem);
      }
      rejectedItem.count += item.count;
      continue;
    }

    merged.push(item);
  }

  return merged;
};

const getStatusDisplayLabel = (item: { status: string; label: string }) => {
  const statusValue = `${item.status} ${item.label}`.toLowerCase();

  if (statusValue.includes("rate approval")) return "Rate Approver Pending";
  if (statusValue.includes("auditor approval")) return "Auditor Pending";
  if (statusValue.includes("billing") && !statusValue.includes("rejected")) return "Billing Pending";

  return item.label;
};

const normalizeStatusLabels = <T extends { status: string; label: string; count: number }>(items: T[]) =>
  items.map((item) => ({
    ...item,
    label: getStatusDisplayLabel(item),
  }));

const shouldHideStatus = (item: { status: string; label: string }) => {
  const statusValue = `${item.status} ${item.label}`.toLowerCase();
  return statusValue.includes("order created");
};

const EMPTY_KPI: KPIData = {
  total_orders: 0,
  total_revenue: "0",
  today_orders: 0,
  this_month_orders: 0,
  status_counts: {},
  user_counts: {},
};

const EMPTY_CHARTS: ChartsData = {
  monthly_sales: [],
  statewise_orders: [],
  manager_performance: [],
  manager_state_performance: [],
  status_distribution: [],
  decision_distribution: [],
  top_parties: [],
  category_sales: [],
  highest_sales_order: { order_number: null, amount: 0 },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [charts, setCharts] = useState<ChartsData | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  const isUnauthorized = (result: PromiseSettledResult<unknown>) =>
    result.status === "rejected" &&
    (result.reason?.response?.status === 401 || result.reason?.status === 401);

  useEffect(() => {
    void fetchData(year, month, true);
  }, [year, month]);

  const hasVisibleData = (nextKpi: KPIData, nextCharts: ChartsData) => {
    if ((nextKpi.total_orders ?? 0) > 0) {
      return true;
    }

    return (nextCharts.monthly_sales ?? []).some(
      (item) => (item.count ?? 0) > 0 || (item.revenue ?? 0) > 0
    );
  };

  const fetchData = async (selectedYear: number, selectedMonth: number, allowFallback = false) => {
    setLoading(true);
    setError("");

    try {
      const [profileRes, kpiRes, chartsRes] = await Promise.allSettled([
        getCurrentUser(),
        api.get(`/orders/dashboardW/?year=${selectedYear}&month=${selectedMonth}`),
        api.get(`/orders/dashboardW/charts/?line_year=${selectedYear}&year=${selectedYear}&month=${selectedMonth}`),
      ]);

      if (isUnauthorized(profileRes) || isUnauthorized(kpiRes) || isUnauthorized(chartsRes)) {
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
        navigate("/");
        return;
      }

      if (profileRes.status === "fulfilled") {
        setUser(profileRes.value);
      }

      const nextKpi = kpiRes.status === "fulfilled" ? { ...EMPTY_KPI, ...kpiRes.value.data } : EMPTY_KPI;
      const nextCharts = chartsRes.status === "fulfilled" ? { ...EMPTY_CHARTS, ...chartsRes.value.data } : EMPTY_CHARTS;

      if (allowFallback && selectedYear === currentYear && !hasVisibleData(nextKpi, nextCharts)) {
        const fallbackYear = currentYear - 1;
        const [fallbackKpiRes, fallbackChartsRes] = await Promise.allSettled([
          api.get(`/orders/dashboardW/?year=${fallbackYear}&month=${selectedMonth}`),
          api.get(`/orders/dashboardW/charts/?line_year=${fallbackYear}&year=${fallbackYear}&month=${selectedMonth}`),
        ]);

        const fallbackKpi =
          fallbackKpiRes.status === "fulfilled" ? { ...EMPTY_KPI, ...fallbackKpiRes.value.data } : EMPTY_KPI;
        const fallbackCharts =
          fallbackChartsRes.status === "fulfilled"
            ? { ...EMPTY_CHARTS, ...fallbackChartsRes.value.data }
            : EMPTY_CHARTS;

        if (hasVisibleData(fallbackKpi, fallbackCharts)) {
          setYear(fallbackYear);
          setKpi(fallbackKpi);
          setCharts(fallbackCharts);
          return;
        }
      }

      setKpi(nextKpi);
      setCharts(nextCharts);

      if (kpiRes.status === "rejected" && chartsRes.status === "rejected") {
        setError("Unable to load dashboard data right now.");
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError("Unable to load dashboard data right now.");
    } finally {
      setLoading(false);
    }
  };

  const role = normalizeRole(user?.role);
  const roleMeta = roleContent[role];
  const isBilling = role === "billing";
  const isReviewRole = role === "auditor" || role === "approver";
  const shouldExpandVolumeChart = role === "billing" || isReviewRole;

  const activeStatus = useMemo(
    () => (charts?.status_distribution ?? []).filter((item) => item.count > 0),
    [charts?.status_distribution]
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
    [activeItemState, stateItemSales]
  );
  const activeStateFilteredProducts = useMemo(
    () =>
      selectedItemVariety === "ALL"
        ? activeStateProducts
        : activeStateProducts.filter((item) => (item.variety || "Unknown") === selectedItemVariety),
    [activeStateProducts, selectedItemVariety]
  );
  const activeStateVarietyTotals = useMemo(() => {
    const totals = activeStateProducts.reduce<Record<string, { variety: string; total_sales: number; quantity: number; count: number }>>(
      (acc, item) => {
        const variety = item.variety || "Unknown";
        if (!acc[variety]) {
          acc[variety] = { variety, total_sales: 0, quantity: 0, count: 0 };
        }
        acc[variety].total_sales += item.total_sales;
        acc[variety].quantity += item.quantity;
        acc[variety].count += item.count;
        return acc;
      },
      {}
    );

    return Object.values(totals).sort((a, b) => b.total_sales - a.total_sales);
  }, [activeStateProducts]);
  const activeStateMaxVarietySales = useMemo(
    () => Math.max(...activeStateVarietyTotals.map((item) => item.total_sales), 0),
    [activeStateVarietyTotals]
  );
  const topStateVarieties = useMemo(() => activeStateVarietyTotals.slice(0, 3), [activeStateVarietyTotals]);
  const activeStateMaxProductSales = useMemo(
    () => Math.max(...activeStateFilteredProducts.map((item) => item.total_sales), 0),
    [activeStateFilteredProducts]
  );
  const topParties = useMemo(
    () =>
      (charts?.top_parties ?? [])
        .filter((item) => (item.count ?? 0) > 0 || (item.revenue ?? 0) > 0),
    [charts?.top_parties]
  );
  const visibleTopParties = useMemo(
    () => (topPartyView === "all" ? topParties : topParties.slice(0, topPartyView)),
    [topParties, topPartyView]
  );
  const topParty = topParties[0];

  const monthlySales = charts?.monthly_sales ?? [];
  const managerPerformance = useMemo(
    () =>
      (charts?.manager_performance ?? [])
        .map((item) => ({
          id: item.manager_id ?? item.manager_name,
          name: item.manager_name,
          sales: item.sales ?? 0,
          orders: item.orders ?? 0,
        })),
    [charts?.manager_performance]
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
    [charts?.statewise_orders]
  );
  const activePerformance = performanceView === "state" ? statePerformance : managerPerformance;
  const topManager = managerPerformance[0];
  const topManagerPerformance = useMemo(() => managerPerformance.slice(0, 5), [managerPerformance]);
  const managerMaxSales = useMemo(
    () => Math.max(...managerPerformance.map((item) => item.sales), 0),
    [managerPerformance]
  );
  const activePerformanceMaxSales = useMemo(
    () => Math.max(...activePerformance.map((item) => item.sales), 0),
    [activePerformance]
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
      return ["approved", "accepted", "completed", "delivered"].some((value) => statusValue.includes(value));
    })
    .reduce((sum, item) => sum + item.count, 0);
  // Billing-specific counts derived from status_counts (more accurate than keyword matching)
  const statusCounts = kpi?.status_counts ?? {};
  const billingRejectedCount = Object.entries(statusCounts).reduce(
    (sum, [key, val]) => key.toLowerCase().includes("billing rejected") ? sum + val : sum, 0
  );
  const billingQueueCount = Object.entries(statusCounts).reduce((sum, [key, val]) => {
    const k = key.toLowerCase();
    return (k === "billing" || k === "billing pending") ? sum + val : sum;
  }, 0);
  const reviewAcceptedCount = kpi?.accepted_orders ?? 0;
  const reviewRejectedCount = kpi?.rejected_orders ?? 0;
  const reviewPendingCount = kpi?.pending_review_orders ?? 0;
  const billingAcceptedCount = kpi?.accepted_orders ?? 0;
  const billingRejectedHandledCount = billingRejectedCount;
  const billingHandledCount = billingAcceptedCount + billingRejectedHandledCount;
  const totalOrders = kpi?.total_orders ?? 0;
  const billingPendingCount = kpi?.pending_review_orders ?? billingQueueCount;
  const completionCount = isReviewRole ? reviewAcceptedCount : role === "billing" ? billingHandledCount : acceptedCount;
  const outstandingOrders = isReviewRole
    ? reviewPendingCount
    : billingPendingCount;
  const reviewDecisionChart = [
    { status: "accepted", label: role === "approver" ? "Approved" : "Accepted", count: reviewAcceptedCount },
    { status: "rejected", label: "Rejected", count: reviewRejectedCount },
    { status: "pending", label: role === "approver" ? "Pending Approval" : "Pending Review", count: reviewPendingCount },
  ].filter((item) => item.count > 0);
  const billingDecisionChart = [
    { status: "accepted", label: "Accepted", count: billingAcceptedCount },
    { status: "rejected", label: "Rejected", count: billingRejectedHandledCount },
    { status: "queue", label: "Pending", count: billingPendingCount },
  ].filter((item) => item.count > 0);
  const decisionDistribution = charts?.decision_distribution;
  const monthDecisionChart = (decisionDistribution ?? []).filter((item) => item.count > 0);
  const rawStatusItems = (isReviewRole || role === "billing")
    ? decisionDistribution
      ? monthDecisionChart
      : monthDecisionChart.length > 0
      ? monthDecisionChart
      : isReviewRole
        ? reviewDecisionChart
        : billingDecisionChart
      : activeStatus;
  const statusItems = normalizeStatusLabels(
    mergeRejectedStatuses(rawStatusItems).filter((item) => !shouldHideStatus(item))
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
  const statusDisplayItems =
    primaryStatusItems.length > 0
      ? primaryStatusItems
      : statusItems;
  const hiddenStatusItems =
    primaryStatusItems.length > 0
      ? statusItems.filter((item) => !isPrimaryStatus(item))
      : [];
  const hiddenStatusCount = hiddenStatusItems.length;
  const getStatusColor = (statusItem: { status: string; label: string }) => {
    const sourceIndex = statusItems.findIndex(
      (item) => item.status === statusItem.status && item.label === statusItem.label
    );
    return PALETTE[(sourceIndex >= 0 ? sourceIndex : 0) % PALETTE.length];
  };
  const selectedMonthLabel = MONTH_OPTIONS.find((option) => option.value === month)?.label ?? "All Months";
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
      return ["accepted", "approved", "completed", "delivered"].some((value) => statusValue.includes(value));
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
      return ["rejected", "declined", "cancelled", "canceled"].some((value) => statusValue.includes(value));
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
  const overviewRate = overviewTotalCount > 0 ? Math.round((overviewHandledCount / overviewTotalCount) * 100) : 0;

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
      { icon: "⚡", tone: "db-card--dark", label: "This Month", value: fmt(kpi?.this_month_orders ?? 0), sub: "Monthly order momentum" },
      { icon: "🗓️", tone: "db-card--teal", label: "Today Orders", value: fmt(kpi?.today_orders ?? 0), sub: "Orders created today" },
    ],
    auditor: [
      { icon: "📥", tone: "db-card--teal", label: "This Month Orders", value: fmt(kpi?.this_month_orders ?? 0), sub: "Orders assigned for audit review" },
      { icon: <HiOutlineClipboardDocumentList aria-hidden="true" />, tone: "db-card--blue", label: "Pending Review", value: fmt(outstandingOrders), sub: "Orders still awaiting decision" },
      { icon: "✅", tone: "db-card--dark", label: "Accepted Orders", value: fmt(reviewAcceptedCount), sub: "Orders accepted by auditor" },
    ],
    approver: [
      { icon: "📥", tone: "db-card--teal", label: "This Month Orders", value: fmt(kpi?.this_month_orders ?? 0), sub: "Orders assigned for rate approval" },
      { icon: <HiOutlineClipboardDocumentList aria-hidden="true" />, tone: "db-card--blue", label: "Pending Approval", value: fmt(outstandingOrders), sub: "Orders still awaiting rate decision" },
      { icon: "✅", tone: "db-card--dark", label: "Approved Orders", value: fmt(reviewAcceptedCount), sub: "Orders approved by rate approver" },
    ],
    manager: [
      { icon: currencyPrefix, tone: "db-card--teal", label: "Total Sales", value: fmtCurrency(completedRevenue), sub: "Completed order sales", salesBreakdown: true },
      { icon: "📦", tone: "db-card--blue", label: "Completed  Orders", value: fmt(completionCount ?? 0), sub: "Across selected year" },
      { icon: "⚡", tone: "db-card--dark", label: "Today Orders", value: fmt(kpi?.today_orders ?? 0), sub: "Live operational pace" },
    ],
    billing: [
      { icon: "🕒", tone: "db-card--blue", label: "Pending Orders", value: fmt(billingPendingCount), sub: "Orders waiting in billing queue" },
      { icon: "📌", tone: "db-card--teal", label: "Handled Orders", value: fmt(billingHandledCount), sub: "Orders sent to auditor or rejected" },
      { icon: "🗓️", tone: "db-card--blue", label: "Today Orders", value: fmt(kpi?.today_orders ?? 0), sub: "Billing orders updated today" },
    ],
  } satisfies Record<SupportedRole, { icon: ReactNode; tone: string; label: string; value: string; sub: string; salesBreakdown?: boolean }[]>;

  const chartCopy = {
    admin: {
      salesTitle: `Monthly Sales Trend (${year})`,
      salesSubtitle: "Revenue movement across the selected year",
      statusTitle: `Order Status (${year})`,
      statusSubtitle: "Current mix of order stages",
      managerPerformanceTitle: `Top Manager Performance (${year})`,
      managerPerformanceSubtitle: "Click to view all managers by sales",
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
      managerPerformanceSubtitle: "Sales value by manager",
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
      managerPerformanceSubtitle: "Sales value by manager",
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
      managerPerformanceSubtitle: "Sales value by manager",
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
      managerPerformanceSubtitle: "Sales value by manager",
      volumeTitle: `Monthly Billing Orders (${year})`,
      volumeSubtitle: "Billing-stage order volume across the year",
      categoryTitle: `Category Billing Orders (${year})`,
      categorySubtitle: "Billing orders split by product category",
    },
  } satisfies Record<SupportedRole, {
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
  }>;

  if (loading) {
    return (
      <div className="db-loading">
        <div className="db-spinner" />
        Loading dashboard...
      </div>
    );
  }

  if (error && !kpi && !charts) {
    return (
      <div className="db-root">
        <div className="db-empty-state">
          <h2>Dashboard unavailable</h2>
          <p>{error}</p>
          <button className="db-retry-btn" onClick={() => void fetchData(year, month, true)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="db-root">
      <style>{`
        @media (max-width: 1024px) {
          .db-kpi-row { grid-template-columns: repeat(2, 1fr) !important; }
          .db-overview-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .db-state-item-list { grid-template-columns: 1fr !important; }
          .db-charts-row { display: flex !important; flex-direction: column !important; gap: 24px !important; }
        }
        @media (max-width: 768px) {
          .db-kpi-row, .db-overview-grid { grid-template-columns: 1fr !important; display: flex !important; flex-direction: column !important; }
          .db-header { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
          .db-hero-summary { flex-wrap: wrap !important; justify-content: flex-start !important; margin-top: 16px !important; gap: 12px !important; }
          .db-overview-top, .db-chart-head { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
          .db-overview-top > div { width: 100%; }
          .db-party-list-details { flex: 1; min-width: 0; word-break: break-word; }
          .db-legend { flex-wrap: wrap !important; }
        }
        @media (max-width: 480px) {
          .db-filter-group { width: 100% !important; }
          .db-year-select { width: 100% !important; }
          .db-segmented-control { width: 100% !important; display: flex !important; flex-wrap: wrap !important; }
          .db-segmented-btn { flex: 1 1 auto !important; text-align: center !important; }
          .db-highlight-sub { word-break: break-word; }
        }
      `}</style>
      <div className="db-hero">
        <div className="db-hero-main">
          <div className="db-header">
            <div>
              <h1 className="db-title">{roleMeta.title}</h1>
              <p className="db-subtitle">{roleMeta.subtitle}</p>
            </div>
            <div className="db-filter-group">
              <select
                className="db-year-select"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Select year"
              >
                {YEARS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                className="db-year-select"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="Select month"
              >
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="db-hero-summary">
            {/* <div className="db-hero-summary-item">
              <span>{isBilling ? "Handled" : "Revenue"}</span>
              <strong>{isBilling ? fmt(completionCount) : fmtCurrency(kpi?.total_revenue ?? 0)}</strong>
            </div> */}
            <div className="db-hero-summary-item">
              <span>Total Orders</span>
              <strong>{fmt(kpi?.total_orders ?? 0)}</strong>
            </div>
            <div className="db-hero-summary-item">
              <span>Peak Month</span>
              <strong>{peakMonth?.label ?? "N/A"}</strong>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="db-inline-alert">
          {error}
        </div>
      ) : null}

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
            <div className={`db-card-value ${item.label.toLowerCase().includes("sales") ? "db-card-value--sm" : ""}`}>{item.value}</div>
            <div className="db-card-sub">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="db-panel db-panel--overview">
        <div className="db-highlights-head">
          <div>
            <div className="db-panel-title">Visual Overview</div>
            <div className="db-highlights-subtitle">Quick chart summaries for {roleMeta.focus.toLowerCase()}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div className="db-highlights-badge">3 charts</div>
          </div>
        </div>
        <div className="db-overview-grid">
          <div className="db-overview-card db-overview-card--pulse">
            <div className="db-overview-top db-overview-top--compact">
              <div>
                <div className="db-highlight-label">Top Parties</div>
                <div className="db-highlight-sub">
                  {topParty
                    ? `${topParty.card_name} leads with ${fmt(topParty.count)} orders`
                    : "No party data available"}
                </div>
              </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", width: "100%" }}>
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
              <div className="db-no-data" style={{ minHeight: 80 }}>No party data for this period</div>
            ) : (
              <div className="db-party-list db-party-list--spacious">
                {visibleTopParties.map((item, index) => (
                  <div key={item.card_code} className="db-party-list-item db-party-list-item--detailed">
                    <span
                      className="db-party-list-badge"
                      style={{ background: PALETTE[index % PALETTE.length] }}
                    >
                      {index + 1}
                    </span>
                    <div className="db-party-list-details">
                      <span className="db-party-list-name db-party-list-name--wrap">{item.card_name}</span>
                      <span className="db-party-list-code">{item.card_code}</span>
                    </div>
                    <span className="db-party-list-count db-party-list-count--detailed">
                      {fmt(item.count)} orders
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="db-overview-card db-overview-card--progress">
            <div className="db-overview-top">
              <div>
                <div className="db-highlight-label">
                  {isReviewRole ? "Review Completion" : role === "manager" ? "Order Momentum" : role === "admin" ? "Order Throughput" : "Handling Progress"}
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
                        <Cell key={item.status} fill={getStatusColor(item)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="db-legend">
                  {statusDisplayItems.map((item) => (
                    <div key={item.status} className="db-legend-item">
                      <span className="db-legend-dot" style={{ background: getStatusColor(item) }} />
                      <span className="db-legend-label">{item.label}</span>
                      <span className="db-legend-val">{item.count}</span>
                    </div>
                  ))}
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

      {showSalesBreakdown ? (
        <div className="db-status-modal-backdrop" onClick={() => setShowSalesBreakdown(false)}>
          <div
            className="db-sales-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Sales breakdown"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="db-status-modal-head">
              <div>
                <div className="db-chart-title">Sales Breakdown</div>
                <div className="db-chart-subtitle">{selectedPeriodLabel} order sales</div>
              </div>
              <button
                type="button"
                className="db-status-modal-close"
                onClick={() => setShowSalesBreakdown(false)}
                aria-label="Close sales breakdown"
              >
                <FiChevronUp />
              </button>
            </div>
            <div className="db-sales-modal-list">
              <div className="db-sales-modal-row">
                <span>All Orders Sales</span>
                <strong>{fmtCurrency(allRevenue)}</strong>
              </div>
              <div className="db-sales-modal-row db-sales-modal-row--primary">
                <span>Completed Orders Sales</span>
                <strong>{fmtCurrency(completedRevenue)}</strong>
              </div>
              <div className="db-sales-modal-row">
                <span>Pending Orders Sales</span>
                <strong>{fmtCurrency(pendingRevenue)}</strong>
              </div>
              <div className="db-sales-modal-row">
                <span>Rejected Orders Sales</span>
                <strong>{fmtCurrency(rejectedRevenue)}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showMoreStatuses ? (
        <div className="db-status-modal-backdrop" onClick={() => setShowMoreStatuses(false)}>
          <div
            className="db-status-modal"
            role="dialog"
            aria-modal="true"
            aria-label="More order statuses"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="db-status-modal-head">
              <div>
                <div className="db-chart-title">More Statuses</div>
                <div className="db-chart-subtitle">Additional order status counts</div>
              </div>
              <button
                type="button"
                className="db-status-modal-close"
                onClick={() => setShowMoreStatuses(false)}
                aria-label="Close more statuses"
              >
                <FiChevronUp />
              </button>
            </div>
            <div className="db-status-modal-list">
              {hiddenStatusItems.map((item) => (
                <div key={item.status} className="db-legend-item">
                  <span className="db-legend-dot" style={{ background: getStatusColor(item) }} />
                  <span className="db-legend-label">{item.label}</span>
                  <span className="db-legend-val">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showManagerPerformance ? (
        <div className="db-status-modal-backdrop" onClick={() => setShowManagerPerformance(false)}>
          <div
            className="db-manager-performance-modal"
            role="dialog"
            aria-modal="true"
            aria-label="All managers performance"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="db-status-modal-head">
              <div>
                <div className="db-chart-title">
                  {performanceView === "state" ? "State-wise Performance" : "All Managers Performance"}
                </div>
                <div className="db-chart-subtitle">
                  {selectedPeriodLabel} sales by {performanceView === "state" ? "state" : "manager"}
                </div>
              </div>
              <div className="db-performance-switch" aria-label="Performance view">
                <button
                  type="button"
                  className={performanceView === "manager" ? "is-active" : ""}
                  onClick={() => setPerformanceView("manager")}
                >
                  Managers
                </button>
                <button
                  type="button"
                  className={performanceView === "state" ? "is-active" : ""}
                  onClick={() => setPerformanceView("state")}
                >
                  States
                </button>
              </div>
              <button
                type="button"
                className="db-status-modal-close"
                onClick={() => setShowManagerPerformance(false)}
                aria-label="Close manager performance"
              >
                <FiChevronUp />
              </button>
            </div>
            {activePerformance.length === 0 ? (
              <div className="db-no-data">No manager sales data for this period</div>
            ) : (
              <div className="db-manager-ranking db-manager-ranking--full">
                {activePerformance.map((item, index) => (
                  <div className="db-manager-rank-row" key={item.id}>
                    <span className="db-manager-rank-number">{index + 1}</span>
                    <div className="db-manager-rank-main">
                      <div className="db-manager-rank-meta">
                        <span className="db-manager-rank-name">{item.name}</span>
                        <strong>{fmtCurrency(item.sales)}</strong>
                      </div>
                      <div className="db-manager-rank-track">
                        <span
                          className="db-manager-rank-fill"
                          style={{
                            width: getSalesWidth(item.sales, activePerformanceMaxSales),
                            background: PALETTE[index % PALETTE.length],
                          }}
                        />
                      </div>
                      <span className="db-manager-rank-orders">{fmt(item.orders)} orders</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showStateItems ? (
        <div className="db-status-modal-backdrop" onClick={() => setShowStateItems(false)}>
          <div
            className="db-manager-performance-modal"
            role="dialog"
            aria-modal="true"
            aria-label="All state-wise item sales"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="db-status-modal-head">
              <div>
                <div className="db-chart-title">
                  {selectedItemVariety === "ALL" ? `${activeItemState ?? "State"} Variety Sales` : `${selectedItemVariety} Products`}
                </div>
                <div className="db-chart-subtitle">
                  {selectedItemVariety === "ALL"
                    ? `All varieties ranked by total sales value for ${selectedPeriodLabel}`
                    : `${activeItemState ?? "State"} products ranked by sales value for ${selectedPeriodLabel}`}
                </div>
              </div>
              {selectedItemVariety !== "ALL" ? (
                <button
                  type="button"
                  className="db-state-item-back"
                  onClick={() => setSelectedItemVariety("ALL")}
                >
                  Varieties
                </button>
              ) : null}
              <button
                type="button"
                className="db-status-modal-close"
                onClick={() => setShowStateItems(false)}
                aria-label="Close state-wise item sales"
              >
                <FiChevronUp />
              </button>
            </div>
            <div className="db-state-item-list db-state-item-list--modal">
              {selectedItemVariety === "ALL" ? activeStateVarietyTotals.map((item, index) => (
                <button
                  className="db-state-item-row db-state-item-row--button"
                  key={`modal-variety-${item.variety}`}
                  type="button"
                  onClick={() => setSelectedItemVariety(item.variety)}
                >
                  <span className="db-manager-rank-number">{index + 1}</span>
                  <div className="db-state-item-main">
                    <div className="db-state-item-meta">
                      <div>
                        <span>{item.variety}</span>
                        <small>Total variety sale</small>
                      </div>
                      <strong>{fmtCurrency(item.total_sales)}</strong>
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
                      Qty {fmt(item.quantity)} | {fmt(item.count)} order lines
                    </small>
                  </div>
                </button>
              )) : activeStateFilteredProducts.map((item, index) => (
                <div className="db-state-item-row" key={`modal-${item.item_code}-${item.variety}-${item.category}`}>
                  <span className="db-manager-rank-number">{index + 1}</span>
                  <div className="db-state-item-main">
                    <div className="db-state-item-meta">
                      <div>
                        <span>{item.variety}</span>
                        <small>{item.item_name}</small>
                        <small>{item.item_code} | {item.category}</small>
                      </div>
                      <strong>{fmtCurrency(item.total_sales)}</strong>
                    </div>
                    <div className="db-manager-rank-track">
                      <span
                        className="db-manager-rank-fill"
                        style={{
                          width: getSalesWidth(item.total_sales, activeStateMaxProductSales),
                          background: PALETTE[index % PALETTE.length],
                        }}
                      />
                    </div>
                    <small className="db-state-item-foot">
                      Qty {fmt(item.quantity)} | {fmt(item.count)} order lines
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {!shouldExpandVolumeChart && (
      <div className="db-charts-row">
        <div
          className="db-chart-box db-chart-box--wide"
          style={{ gridColumn: role === "admin" ? undefined : "1 / -1" }}
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
                tickFormatter={isBilling ? undefined : (v) => `${currencyPrefix}${(v / 1000).toFixed(1)}k`}
                width={52}
              />
              <Tooltip formatter={(v) => isBilling ? [v, "Orders"] : [`${currencyPrefix}${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Revenue"]} />
              <Area type="monotone" dataKey={isBilling ? "count" : "revenue"} stroke="#0f172a" strokeWidth={2} fill="url(#revGrad)" dot={{ r: 3, fill: "#0f766e" }} />
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
                <YAxis tick={{ fontSize: 11, fill: "#5b6878" }} tickFormatter={fmtCompactCurrency} width={72} />
                <Tooltip formatter={(v) => [`${currencyPrefix}${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Sales"]} />
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

      {role === "admin" ? (
        <div className="db-chart-box db-state-item-box">
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">State-wise Item Sales</div>
              <div className="db-chart-subtitle">Top 3 varieties by sales value in each state for {selectedPeriodLabel}</div>
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
                          <small>Total variety sale</small>
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
                        Qty {fmt(item.quantity)} | {fmt(item.count)} order lines
                      </small>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
