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
  // The order/revenue analytics screen, formerly the ungated `/Dashboard`.
  // Separate from "Reports": the tabular reports are a billing tool, this is a
  // company-wide sales picture, and the people who need one are not
  // automatically the people who should see the other.
  { key: "Sales_Dashboard", label: "Sales Dashboard", path: "/Sales_Dashboard" },
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
  // Staff orders — an internal order raised against an employee ID rather
  // than a party, priced from each product's staff rate.
  //
  // TWO keys, not one, because they are different authorities: reading the
  // staff catalogue to PLACE an order, and setting the rates the company
  // sells to its own people at. The second is the one worth withholding, so
  // it is grantable on its own.
  //
  // Both routes were `adminOnly` and grantable to nobody, while the endpoint
  // behind them (`orders/staff-products/`) carried no permission class at all
  // — admin-only pages over a write any signed-in user could make. They are
  // gated per method now; see core/permission_registry.py.
  { key: "Staff", label: "Staff Orders", path: "/Staff" },
  {
    key: "Staff_Rate_Assignment",
    label: "Staff Rate Assignment",
    path: "/Staff_Rate_Assignment",
  },
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
  // The handover gate between creation and approval: a second person checks
  // the physical cash or cheque against the entry. Independent of Create and
  // Approve — holding either confers nothing here, and the creator of a
  // receipt may never verify it (separation of duties is enforced in the
  // endpoint, not by this key).
  //
  { key: "Payments_Approve", label: "Payments — Approve", path: "/Payments_Dashboard" },
  // The handover check: a second person confirms the physical cash or cheque
  // against the entry before it may enter the approval chain. Independent of
  // Create and Approve — holding either confers nothing here — and the server
  // separately forbids verifying a receipt you raised yourself, so this grant
  // is only ever useful to someone other than the creator.
  //
  // It was registered on the SERVER but missing from this list, so it could
  // only ever be granted through Role Permissions — never to one person. The
  // registry-parity test in `adminPages.test.ts` is what found it, and the
  // duplicate-key test is what caught this line being added twice when two
  // branches fixed it independently.
  { key: "Payments_Verify", label: "Payments — Verify", path: "/Payments_Dashboard" },
  { key: "Deposit_Create", label: "Deposit — Create", path: "/Payments_Dashboard" },
  { key: "Deposit_Approve", label: "Deposit — Approve", path: "/Payments_Dashboard" },
  // Unlike the four above, this one DOES open a page — the analytics dashboard
  // on web and mobile. It is deliberately not implied by any of them: the
  // people who record and approve payments are not automatically the people
  // who should see company-wide collection totals.
  { key: "Payments_Dashboard", label: "Payments Dashboard", path: "/Payments_Dashboard" },
];

export const PAYMENT_ACTION_KEYS = PAYMENT_ACTION_PERMISSIONS.map((p) => p.key);

/**
 * Order visibility. An ACTION grant like the payments block above, not a page:
 * it opens no screen of its own, it widens what the screens you already hold
 * are allowed to show you.
 *
 * `Sales_Dashboard` answers "may you open the analytics screen". This answers
 * "whose orders are on it" — and they are genuinely separate. Every dashboard
 * and order list scopes through `_get_base_orders`, which used to decide that
 * by matching `user.role.name` against seven literals, so any role an
 * administrator created saw nothing at all: not a refusal, a screen of zeroes.
 * Scope is this key now, so a new role can be given a company-wide view
 * without a backend change.
 *
 * Listed here, and not only in the server registry, for the reason the
 * registry-parity test in `adminPages.test.ts` exists: a key registered on the
 * server but absent from this file can only ever be granted through Role
 * Permissions, never to one person. That is exactly how `Payments_Verify` went
 * missing.
 */
export const ORDER_SCOPE_PERMISSIONS: GrantablePage[] = [
  {
    key: "orders.sales.view_all",
    label: "Orders — see every order, company-wide",
    path: "/Sales_Dashboard",
  },
];

export const ORDER_SCOPE_KEYS = ORDER_SCOPE_PERMISSIONS.map((p) => p.key);

/** Every key an admin may grant — page access, payment and order actions. */
export const ALL_GRANTABLE_KEYS = [
  ...GRANTABLE_PAGE_KEYS,
  ...PAYMENT_ACTION_KEYS,
  ...ORDER_SCOPE_KEYS,
];
