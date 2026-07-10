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
  { key: "Order_Flow_Settings", label: "Order Flow Settings", path: "/Order_Flow_Settings" },
  { key: "Product_Stock", label: "Stock", path: "/Product_Stock" },
  { key: "Reports", label: "Reports", path: "/Daily_Report" },
  { key: "Einvoice", label: "e-Invoice (IRN)", path: "/Einvoice" },
  { key: "Ewaybill", label: "e-Way Bill", path: "/Ewaybill" },
];

export const GRANTABLE_PAGE_KEYS = GRANTABLE_ADMIN_PAGES.map((page) => page.key);
