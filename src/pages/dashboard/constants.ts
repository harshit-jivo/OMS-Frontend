/**
 * Static config for the Dashboard page: palette, filter options and the
 * per-role copy blurb. Pulled out of `Dashboard.tsx` verbatim (Phase 4
 * decomposition) — none of this depends on component state.
 */
import type { ChartsData, KPIData, SupportedRole } from "./types";

export const PALETTE = [
  "#0f766e",
  "#2563eb",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#4f46e5",
  "#ea580c",
];

export const TOP_PARTY_VIEW_OPTIONS: Array<{ label: string; value: "all" | 5 | 10 }> = [
  { label: "All", value: "all" },
  { label: "Top 5", value: 5 },
  { label: "Top 10", value: 10 },
];

export const MONTH_OPTIONS = [
  { label: "All Months", value: 0 },
  ...Array.from({ length: 12 }, (_, index) => ({
    label: new Date(2000, index).toLocaleString("default", { month: "short" }),
    value: index + 1,
  })),
];

export const currentYear = new Date().getFullYear();
export const YEARS = Array.from({ length: 5 }, (_, index) => currentYear - index);

export const currencyPrefix = "₹";

export const roleContent: Record<
  SupportedRole,
  { title: string; subtitle: string; focus: string; accent: string }
> = {
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
    subtitle:
      "Track billing-stage orders, invoicing workload and order value ready for processing.",
    focus: "Billing operations",
    accent: "Invoice and billing queue",
  },
};

export const EMPTY_KPI: KPIData = {
  total_orders: 0,
  total_revenue: "0",
  today_orders: 0,
  this_month_orders: 0,
  status_counts: {},
  user_counts: {},
};

export const EMPTY_CHARTS: ChartsData = {
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
