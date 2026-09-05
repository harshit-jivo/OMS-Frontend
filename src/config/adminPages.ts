// Admin pages that can be individually granted to any user from the
// Permissions page. The `key` is what gets stored in User.extra_pages and
// checked by the Sidebar; `path` is the route the grant unlocks.
export type GrantablePage = {
  key: string;
  label: string;
  path: string;
};

export const GRANTABLE_ADMIN_PAGES: GrantablePage[] = [
  { key: "App_User", label: "App User", path: "/App_User" },
  { key: "Sap_Sync", label: "SAP Sync", path: "/Sap_Sync" },
  { key: "Party_Assignment", label: "Party Assignment", path: "/Party_Assignment" },
  { key: "Party_Product_Assignment", label: "Party Product Assignment", path: "/Party_Product_Assignment" },
  { key: "Add_Scheme", label: "Add Scheme", path: "/Add_Scheme" },
  // Scheme engine v2 — targeting, triggers and benefits. Granted separately from
  // "Add Scheme" (the legacy flat form) so the two can be rolled out apart.
  { key: "Scheme_Manager", label: "Schemes", path: "/Scheme_Manager" },
  { key: "Combo_Mapping", label: "Combo Mapping", path: "/Combo_Mapping" },
  { key: "Order_Flow_Settings", label: "Order Flow Settings", path: "/Order_Flow_Settings" },
  { key: "Product_Stock", label: "Stock", path: "/Product_Stock" },
  { key: "Reports", label: "Reports", path: "/Daily_Report" },
  // Tracker pages are gated centrally by role (see config/pageAccess.ts),
  // not by per-user extra_pages, so they are intentionally not listed here.
  { key: "Einvoice", label: "e-Invoice (IRN)", path: "/Einvoice" },
  { key: "Ewaybill", label: "e-Way Bill", path: "/Ewaybill" },
  { key: "HAIS", label: "Hardware Assets (HAIS)", path: "/HAIS" },
  { key: "Distributor", label: "Distributor", path: "/Distributor" },
  { key: "Mart_Approval", label: "Mart Approval", path: "/Mart_Approval" },
  // One key for the whole Legal module — unlocks Label Checker AND Nutrition
  // Manager, the way "Distributor" covers both distributor routes. Mirrors
  // the backend gate on legal/views.py (HasKeyOrRole, legal-role fallback).
  { key: "Legal", label: "Legal (Labels & Nutrition)", path: "/Label_Checker" },
  // System — one page carrying live device activity and version analytics.
  // "Device_Activity" and "Version_Management" are deliberately no longer
  // grantable: the pages they gated are gone, so offering those permissions
  // would grant nothing. Any stored grant with those keys is simply ignored.
  { key: "Device_Management", label: "Device Management", path: "/Device_Management" },
];

export const GRANTABLE_PAGE_KEYS = GRANTABLE_ADMIN_PAGES.map((page) => page.key);

/**
 * Payments module ACTION permissions.
 *
 * These differ from the page grants above: a page grant answers "can you open
 * this screen", these answer "can you take this action". They are stored in the
 * same `User.extra_pages` list, so one grant UI and one login payload cover
 * both — but they are listed separately so the Permissions page can present
 * them under their own heading rather than implying they open a page.
 *
 * The keys MUST match payments/permissions.py and the mobile app exactly.
 */
// `path` is informational here: these grants gate ACTIONS in the mobile app
// (raising a receipt, deciding an approval), not a web route. Recording and
// approving both happen on mobile; the web side only configures the workflow.
export const PAYMENT_ACTION_PERMISSIONS: GrantablePage[] = [
  { key: "Payments_Create", label: "Payments — Create", path: "/Payments_Dashboard" },
  { key: "Payments_Approve", label: "Payments — Approve", path: "/Payments_Dashboard" },
  { key: "Deposit_Create", label: "Deposit — Create", path: "/Payments_Dashboard" },
  { key: "Deposit_Approve", label: "Deposit — Approve", path: "/Payments_Dashboard" },
  // Unlike the four above, this one DOES open a page — the analytics dashboard
  // on web and mobile. It is deliberately not implied by any of them: the
  // people who record and approve payments are not automatically the people
  // who should see company-wide collection totals.
  { key: "Payments_Dashboard", label: "Payments Dashboard", path: "/Payments_Dashboard" },
];

export const PAYMENT_ACTION_KEYS = PAYMENT_ACTION_PERMISSIONS.map((p) => p.key);

/** Every key an admin may grant — page access plus payment actions. */
export const ALL_GRANTABLE_KEYS = [
  ...GRANTABLE_PAGE_KEYS,
  ...PAYMENT_ACTION_KEYS,
];
