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
  // System — one page carrying live device activity and version analytics.
  // "Device_Activity" and "Version_Management" are deliberately no longer
  // grantable: the pages they gated are gone, so offering those permissions
  // would grant nothing. Any stored grant with those keys is simply ignored.
  { key: "Device_Management", label: "Device Management", path: "/Device_Management" },
];

export const GRANTABLE_PAGE_KEYS = GRANTABLE_ADMIN_PAGES.map((page) => page.key);
