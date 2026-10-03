/**
 * Control Panel access — four pages, granted per sub-tab.
 *
 * Mirrors backend `control_panel/permissions.py` (its TREE and SCOPES) key for
 * key; `controlPanelAccess.test.ts` reads that file and fails when the two
 * drift. Holding any sub-tab of a page opens the page, which then shows only
 * the sub-tabs held — the server enforces it (page guard + templates), this
 * file decides what OMS links to and what Page Permissions offers.
 */

export interface ControlPanelSubTab {
  key: string;
  label: string;
  /** The OMS route that shows it. */
  to: string;
  /** Its inner tab on that route (`?tab=`), for Oils Sale and Inventory. */
  tab?: string;
}

export interface ControlPanelPage {
  label: string;
  subTabs: ControlPanelSubTab[];
  /** Grants on top of a sub-tab — they open nothing by themselves. */
  extras?: { key: string; label: string; hint: string }[];
}

const P = "control_panel.";

export const CP_INVENTORY_CHAT = P + "inventory.chat";
export const CP_PREMIUM_ONLY = P + "segment.premium_only";
export const CP_COMMODITY_ONLY = P + "segment.commodity_only";

const oils = (tab: string, label: string): ControlPanelSubTab => ({
  key: P + "oils_sale." + tab,
  label,
  to: "/Control_Panel/Realise",
  tab,
});
const inventory = (tab: string, name: string, label: string): ControlPanelSubTab => ({
  key: P + "inventory." + name,
  label,
  to: "/Control_Panel/Inventory",
  tab,
});

export const CONTROL_PANEL_PAGES: ControlPanelPage[] = [
  {
    label: "Oils Sale",
    subTabs: [oils("overview", "Overview"), oils("map", "Map"), oils("realise", "Realise")],
  },
  {
    label: "Sales",
    subTabs: [
      { key: P + "sales.channel", label: "Sales Channel Dashboard", to: "/Control_Panel/Sales_Channel" },
      { key: P + "sales.beverages", label: "Beverages Sale", to: "/Control_Panel/Beverages" },
      { key: P + "sales.realise_dashboard", label: "Realise Dashboard", to: "/Control_Panel/Realise_Dashboard" },
      { key: P + "sales.sales", label: "Sales", to: "/Control_Panel/Sales" },
      { key: P + "sales.targets", label: "Targets", to: "/Control_Panel/Realise/Targets" },
    ],
  },
  {
    label: "Inventory",
    subTabs: [
      inventory("dash", "dashboard", "Dashboard"),
      inventory("stock", "stock", "Stock & Warehouses"),
      inventory("move", "movement", "Stock Movement"),
      inventory("movers", "movers", "Moving / Non-Moving"),
      inventory("billing", "billing", "FG Not Billed"),
      inventory("abc", "abc", "ABC-XYZ Analysis"),
      inventory("aging", "aging", "Aging Analysis"),
      inventory("trace", "trace", "Item Trace"),
      inventory("planning", "planning", "Inventory Planning"),
    ],
    extras: [
      {
        key: CP_INVENTORY_CHAT,
        label: "AI assistant",
        hint: "The chat panel on the Inventory page. Needs at least one sub-tab above.",
      },
    ],
  },
  {
    label: "Finance",
    subTabs: [
      { key: P + "finance.expenses", label: "Expenses", to: "/Control_Panel/Expenses" },
      { key: P + "finance.salaries", label: "Salaries", to: "/Control_Panel/Salaries" },
    ],
  },
];

/**
 * The segment limit on the Realise-based pages (all of Oils Sale, and every
 * Sales sub-tab but "Sales"). None = all segments, and targets are editable.
 */
export const CONTROL_PANEL_SEGMENTS = [
  { key: "", label: "All segments", hint: "Sees everything and can edit targets." },
  { key: CP_PREMIUM_ONLY, label: "Premium only", hint: "View only, Premium segment." },
  { key: CP_COMMODITY_ONLY, label: "Commodity only", hint: "View only, Commodity segment." },
] as const;

const ALL_SUB_TABS = CONTROL_PANEL_PAGES.flatMap((page) => page.subTabs);

/** Every key that opens something. */
export const CONTROL_PANEL_ACCESS_KEYS = ALL_SUB_TABS.map((s) => s.key);

/** Every Control Panel key an admin may grant. */
export const CONTROL_PANEL_KEYS = [
  ...CONTROL_PANEL_ACCESS_KEYS,
  CP_INVENTORY_CHAT,
  CP_PREMIUM_ONLY,
  CP_COMMODITY_ONLY,
];

/** The keys any one of which opens the OMS route `to`. */
export function controlPanelKeysFor(to: string): string[] {
  return ALL_SUB_TABS.filter((s) => s.to === to).map((s) => s.key);
}

/** The key of the sub-tab at `to` + `tab`, when there is one. */
export function controlPanelTabKey(to: string, tab: string): string | undefined {
  return ALL_SUB_TABS.find((s) => s.to === to && s.tab === tab)?.key;
}
