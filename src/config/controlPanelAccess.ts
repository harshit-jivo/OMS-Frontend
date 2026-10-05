/**
 * Control Panel access — four pages, one permission each.
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

/** Every Control Panel key an admin may grant — the four pages. */
export const CONTROL_PANEL_KEYS = CONTROL_PANEL_PAGES.map((page) => page.key);

/** The key that opens the OMS route `to` (as a list, for a route rule). */
export function controlPanelKeysFor(to: string): string[] {
  return CONTROL_PANEL_PAGES.filter((page) => page.subPages.some((s) => s.to === to)).map((p) => p.key);
}
