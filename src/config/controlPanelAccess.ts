/**
 * Control Panel access — four pages, one permission each, plus C_Panel's
 * report pages, one permission per report.
 *
 * Mirrors backend `control_panel/permissions.py`; `controlPanelAccess.test.ts`
 * checks the keys against the server registry. Holding a page's key opens the
 * page with ALL of its sub-pages (all segments, values shown) — the server
 * enforces it, this file decides what OMS links to and what Page Permissions
 * offers.
 */

export interface ControlPanelSubPage {
  label: string;
  /** The OMS route that shows it. */
  to: string;
  /** Its inner tab on that route (`?tab=`), for Oils Sale and Inventory. */
  tab?: string;
}

export interface ControlPanelPage {
  key: string;
  label: string;
  subPages: ControlPanelSubPage[];
}

const oils = (tab: string, label: string): ControlPanelSubPage => ({ label, to: "/Control_Panel/Realise", tab });
const inventory = (tab: string, label: string): ControlPanelSubPage => ({
  label,
  to: "/Control_Panel/Inventory",
  tab,
});

export const CONTROL_PANEL_PAGES: ControlPanelPage[] = [
  {
    key: "control_panel.oils_sale",
    label: "Oils Sale",
    subPages: [oils("overview", "Overview"), oils("map", "Map"), oils("realise", "Realise")],
  },
  {
    key: "control_panel.sales",
    label: "Sales",
    subPages: [
      { label: "Sales Channel", to: "/Control_Panel/Sales_Channel" },
      { label: "Beverages Sale", to: "/Control_Panel/Beverages" },
      { label: "Realise Dashboard", to: "/Control_Panel/Realise_Dashboard" },
      { label: "Sales", to: "/Control_Panel/Sales" },
      { label: "Targets", to: "/Control_Panel/Realise/Targets" },
    ],
  },
  {
    key: "control_panel.inventory",
    label: "Inventory",
    subPages: [
      inventory("dash", "Dashboard"),
      inventory("stock", "Stock & Warehouses"),
      inventory("move", "Stock Movement"),
      inventory("movers", "Moving / Non-Moving"),
      inventory("billing", "FG Not Billed"),
      inventory("abc", "ABC-XYZ Analysis"),
      inventory("aging", "Aging Analysis"),
      inventory("trace", "Item Trace"),
      inventory("planning", "Inventory Planning"),
    ],
  },
  {
    key: "control_panel.finance",
    label: "Finance",
    subPages: [
      { label: "Expenses", to: "/Control_Panel/Expenses" },
      { label: "Salaries", to: "/Control_Panel/Salaries" },
    ],
  },
];

/**
 * C_Panel's report pages — one permission each (backend
 * control_panel/permissions.REPORTS, same order and grouping as C_Panel's own
 * sidebar). `page` is the backend page id, `path` the page on the backend,
 * `to` the OMS route.
 */
export const CONTROL_PANEL_REPORTS = [
  { key: "control_panel.report.compare_sales", label: "Compare Sales", group: "Sales Reports", page: "compare-sales", path: "/realise/compare-sales/", to: "/Control_Panel/Compare_Sales" },
  { key: "control_panel.report.sales_cn", label: "Sales vs Credit Notes", group: "Sales Reports", page: "sales-cn", path: "/realise/sales-cn/", to: "/Control_Panel/Sales_CN" },
  { key: "control_panel.report.hidden_sales", label: "Hidden Customer Sales", group: "Sales Reports", page: "hidden-sales", path: "/realise/hidden-sales/", to: "/Control_Panel/Hidden_Sales" },
  { key: "control_panel.report.sales_flow", label: "Sales Document Flow", group: "Sales Reports", page: "sales-flow", path: "/realise/sales-flow/", to: "/Control_Panel/Sales_Flow" },
  { key: "control_panel.report.dispatch_details", label: "Dispatch Details", group: "Sales Reports", page: "dispatch-details", path: "/realise/dispatch-details/", to: "/Control_Panel/Dispatch_Details" },
  { key: "control_panel.report.realise_calculator", label: "Realise Calculator", group: "Sales Reports", page: "realise-calculator", path: "/realise/realise-calculator/", to: "/Control_Panel/Realise_Calculator" },
  { key: "control_panel.report.rate_list", label: "Rate List", group: "Sales Reports", page: "rate-list", path: "/realise/rate-list/", to: "/Control_Panel/Rate_List" },
  { key: "control_panel.report.plan_vs_done", label: "Plan vs Done", group: "Sales Reports", page: "plan-vs-done", path: "/realise/plan-vs-done/", to: "/Control_Panel/Plan_vs_Done" },
  { key: "control_panel.report.customer_aging", label: "Customer Aging", group: "Accounts", page: "customer-aging", path: "/realise/customer-aging/", to: "/Control_Panel/Customer_Aging" },
  { key: "control_panel.report.beverages_gst", label: "Beverages GST Data", group: "Accounts", page: "beverages-gst", path: "/realise/beverages-gst/", to: "/Control_Panel/Beverages_GST" },
  { key: "control_panel.report.required_credit_limit", label: "Required Credit Limit", group: "Accounts", page: "required-credit-limit", path: "/realise/required-credit-limit/", to: "/Control_Panel/Required_Credit_Limit" },
  { key: "control_panel.report.open_payments", label: "Open Payments", group: "Accounts", page: "open-payments", path: "/realise/open-payments/", to: "/Control_Panel/Open_Payments" },
  { key: "control_panel.report.claims", label: "Claims", group: "Accounts", page: "claims", path: "/realise/claims/", to: "/Control_Panel/Claims" },
  { key: "control_panel.report.reconciliation", label: "Wellness-Mart Reconciliation", group: "Accounts", page: "reconciliation", path: "/inventory/reconciliation/", to: "/Control_Panel/Reconciliation" },
  { key: "control_panel.report.stock_available", label: "Stock Available", group: "Inventory & Production", page: "stock-available", path: "/inventory/stock-available/", to: "/Control_Panel/Stock_Available" },
  { key: "control_panel.report.non_inventory", label: "FG Non-Moving Stock", group: "Inventory & Production", page: "non-inventory", path: "/inventory/non-inventory/", to: "/Control_Panel/Non_Moving_Stock" },
  { key: "control_panel.report.oih_vs_stock", label: "OIH vs Stock", group: "Inventory & Production", page: "oih-vs-stock", path: "/realise/oih-vs-stock/", to: "/Control_Panel/OIH_vs_Stock" },
  { key: "control_panel.report.production", label: "Production Plan", group: "Inventory & Production", page: "production", path: "/inventory/production/", to: "/Control_Panel/Production_Plan" },
  { key: "control_panel.report.daily_production", label: "Daily Production", group: "Inventory & Production", page: "daily-production", path: "/inventory/daily-production/", to: "/Control_Panel/Daily_Production" },
  { key: "control_panel.report.customer_master", label: "Customer Master", group: "Master Data", page: "customer-master", path: "/realise/customer-master/", to: "/Control_Panel/Customer_Master" },
] as const;

export type ControlPanelReport = (typeof CONTROL_PANEL_REPORTS)[number];

/** The report groups, in sidebar order. */
export const CONTROL_PANEL_REPORT_GROUPS = [...new Set(CONTROL_PANEL_REPORTS.map((r) => r.group))];

/** The report shown at the OMS route `to`, if any. */
export function controlPanelReportAt(to: string): ControlPanelReport | undefined {
  return CONTROL_PANEL_REPORTS.find((r) => r.to === to);
}

/** Every Control Panel key an admin may grant — the four pages, then the reports. */
export const CONTROL_PANEL_KEYS: string[] = [
  ...CONTROL_PANEL_PAGES.map((page) => page.key),
  ...CONTROL_PANEL_REPORTS.map((r) => r.key),
];

/** The key that opens the OMS route `to` (as a list, for a route rule). */
export function controlPanelKeysFor(to: string): string[] {
  const report = controlPanelReportAt(to);
  if (report) return [report.key];
  return CONTROL_PANEL_PAGES.filter((page) => page.subPages.some((s) => s.to === to)).map((p) => p.key);
}
