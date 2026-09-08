/**
 * The sidebar's navigation table.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DATA, NOT MARKUP
 * ─────────────────────────────────────────────────────────────────────────
 * One table, not six hundred lines of hand-written JSX. Each link names its
 * route; visibility is `canOpen(session, path)` — the same routeAccess table
 * the router enforces — so a link renders exactly when the route behind it
 * would open. A section auto-hides when none of its links are visible, which
 * is how a mart user ends up with a two-section sidebar without any
 * role-specific markup.
 *
 * `gate` overrides the visibility path for the two SAP reports that are
 * billing-only even though their routes sit under the Reports grant — the
 * pages themselves bounce anyone else, so the links follow /Sales_Invoice.
 *
 * To add a page: add a route + routeAccess entry, then one line here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT IS A FILE OF ITS OWN
 * ─────────────────────────────────────────────────────────────────────────
 * `auth/routeAccess.test.ts` reads this table as TEXT and checks every path in
 * it against `ROUTE_ACCESS`, so a link to a route with no access rule fails a
 * test rather than silently rendering a page nobody can open. Parsing a
 * 60-line data file is a reasonable thing for a test to do; parsing the
 * 677-line component this used to live inside was not.
 */
import type { ComponentType } from "react";
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArchiveBox,
  HiOutlineArrowPath,
  HiOutlineBanknotes,
  HiOutlineBeaker,
  HiOutlineBellAlert,
  HiOutlineBuildingStorefront,
  HiOutlineCalendarDays,
  HiOutlineChartBar,
  HiOutlineChartBarSquare,
  HiOutlineChartPie,
  HiOutlineCheckBadge,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentCheck,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineComputerDesktop,
  HiOutlineCube,
  HiOutlineCurrencyRupee,
  HiOutlineDevicePhoneMobile,
  HiOutlineDocumentChartBar,
  HiOutlineDocumentCheck,
  HiOutlineDocumentMagnifyingGlass,
  HiOutlineDocumentPlus,
  HiOutlineDocumentText,
  HiOutlineEye,
  HiOutlineFolderOpen,
  HiOutlineGift,
  HiOutlineIdentification,
  HiOutlineHome,
  HiOutlineKey,
  HiOutlineLanguage,
  HiOutlineLink,
  HiOutlineMap,
  HiOutlineMapPin,
  HiOutlinePencilSquare,
  HiOutlinePlusCircle,
  HiOutlinePresentationChartBar,
  HiOutlinePresentationChartLine,
  HiOutlinePuzzlePiece,
  HiOutlineQueueList,
  HiOutlineReceiptPercent,
  HiOutlineRectangleStack,
  HiOutlineScale,
  HiOutlineShieldCheck,
  HiOutlineShoppingCart,
  HiOutlineSquaresPlus,
  HiOutlineTag,
  HiOutlineTruck,
  HiOutlineUserCircle,
  HiOutlineUserGroup,
  HiOutlineUsers,
  HiOutlineWrenchScrewdriver,
} from "react-icons/hi2";

export type SidebarIconComponent = ComponentType<{ className?: string }>;

export interface SidebarLinkDef {
  to: string;
  label: string;
  icon: SidebarIconComponent;
  /** Visibility path when it differs from `to`. */
  gate?: string;
}

export interface SidebarSectionDef {
  label: string;
  links: SidebarLinkDef[];
}

/**
 * The one link outside every section: it belongs to no group.
 *
 * It was `/Dashboard` — shown to everyone except the tracker sub-roles, who
 * had no OMS dashboard to go to. Both halves of that are gone. The landing
 * page is now `/Home`, which lists whatever the user can open and is therefore
 * useful to every role including the tracker ones; the sales analytics it
 * replaced moved to `/Sales_Dashboard` in the Reports section, behind its own
 * permission.
 */
export const HOME_LINK: SidebarLinkDef = {
  to: "/Home",
  label: "Home",
  icon: HiOutlineHome,
};

export const SIDEBAR_SECTIONS: SidebarSectionDef[] = [
  {
    label: "Orders",
    links: [
      { to: "/Add_Sales", label: "Add Sales", icon: HiOutlinePlusCircle },
      { to: "/FOC", label: "FOC", icon: HiOutlineGift },
      { to: "/View_Orders", label: "View Orders", icon: HiOutlineEye },
      { to: "/Order_Tracking", label: "Order Tracker", icon: HiOutlinePresentationChartLine },
      { to: "/Auditor_orders", label: "Auditor Queue", icon: HiOutlineClipboardDocumentList },
      { to: "/Auditor_status_tracking", label: "Auditor Tracking", icon: HiOutlineClipboardDocumentCheck },
      { to: "/Billing_orders", label: "Billing Queue", icon: HiOutlineBanknotes },
      { to: "/Billing_status_tracking", label: "Billing Tracking", icon: HiOutlineCurrencyRupee },
      { to: "/Rate_Approver_orders", label: "Approver Queue", icon: HiOutlineCheckBadge },
      { to: "/Rate_Approver_status_tracking", label: "Approver Tracking", icon: HiOutlineCheckCircle },
      { to: "/Mart_Approval", label: "Mart Approval", icon: HiOutlineShoppingCart },
      // Both were reachable only by typing the URL — admin-only routes with no
      // link anywhere, so they were absent from the rail AND from /Home, which
      // builds its tiles from this same table.
      { to: "/Staff", label: "Staff Orders", icon: HiOutlineIdentification },
      {
        to: "/Staff_Rate_Assignment",
        label: "Staff Rates",
        icon: HiOutlineCurrencyRupee,
      },
    ],
  },
  {
    label: "Invoices",
    links: [
      { to: "/Sales_Invoice", label: "Sales Invoice", icon: HiOutlineDocumentText },
      { to: "/Invoice_Review", label: "Invoice Review", icon: HiOutlineDocumentMagnifyingGlass },
      { to: "/Invoice_Report", label: "Invoice Report", icon: HiOutlineDocumentChartBar },
      { to: "/Einvoice", label: "e-Invoice (IRN)", icon: HiOutlineReceiptPercent },
      { to: "/Ewaybill", label: "e-Way Bill", icon: HiOutlineTruck },
    ],
  },
  {
    label: "Payments",
    links: [{ to: "/Payments_Dashboard", label: "Payments Dashboard", icon: HiOutlineChartPie }],
  },
  {
    label: "Reports",
    links: [
      // The old `/Dashboard`. It sits here rather than standing alone because
      // that is what it is — a report on orders and sales — and standing
      // alone is what made it look like something everyone must have.
      { to: "/Sales_Dashboard", label: "Sales Dashboard", icon: HiOutlinePresentationChartBar },
      { to: "/Daily_Report", label: "Daily Report", icon: HiOutlineCalendarDays },
      { to: "/PersonWise_Report", label: "Person Wise", icon: HiOutlineUserCircle },
      { to: "/Sales_Report", label: "Sales Report", icon: HiOutlineChartBar },
      { to: "/StateWise_Report", label: "State Wise", icon: HiOutlineMap },
      { to: "/Inventory_Report", label: "Inventory Report", icon: HiOutlineArchiveBox, gate: "/Sales_Invoice" },
      // Was a section of its own called "Stock", holding this one link. It is
      // a report — HANA stock beside open-order demand — and a section with
      // one link in it reads as a module the app does not have. It sits next
      // to Inventory Report because the two are the stock pair: that one is
      // warehouse-wise from SAP, this one is per party and per product.
      { to: "/Product_Stock", label: "Product Stock", icon: HiOutlineCube },
      { to: "/SO_Invoice_Report", label: "Open SO", icon: HiOutlineFolderOpen, gate: "/Sales_Invoice" },
    ],
  },
  {
    label: "Schemes",
    links: [
      { to: "/Add_Scheme", label: "Add Scheme", icon: HiOutlineSquaresPlus },
      { to: "/Scheme_Manager", label: "Schemes", icon: HiOutlineTag },
      { to: "/Combo_Mapping", label: "Combo Mapping", icon: HiOutlinePuzzlePiece },
    ],
  },
  {
    label: "Distributor",
    links: [
      { to: "/Distributor", label: "Distributor", icon: HiOutlineBuildingStorefront },
      { to: "/Distributor_Order_Tracking", label: "Order Tracking", icon: HiOutlineMapPin },
    ],
  },
  {
    label: "Legal",
    links: [
      { to: "/Label_Checker", label: "Label Checker", icon: HiOutlineDocumentCheck },
      { to: "/Nutrition_Manager", label: "Nutrition Manager", icon: HiOutlineBeaker },
      { to: "/Compliance_Rules", label: "Compliance Rules", icon: HiOutlineScale },
      { to: "/Label_History", label: "Check History", icon: HiOutlineClock },
    ],
  },
  {
    label: "HAIS",
    links: [{ to: "/HAIS", label: "Hardware Assets", icon: HiOutlineComputerDesktop }],
  },
  {
    label: "Tracker",
    links: [
      { to: "/Tracker_Entry", label: "Invoice Entry", icon: HiOutlinePencilSquare },
      { to: "/Ap_Invoice_Entry", label: "AP Invoice Entry", icon: HiOutlineDocumentPlus },
      { to: "/Tracker_Queue", label: "My Stage Queue", icon: HiOutlineQueueList },
      { to: "/Tracker_Invoices", label: "All Invoices", icon: HiOutlineRectangleStack },
      { to: "/Tracker_Alerts", label: "Stuck Alerts", icon: HiOutlineBellAlert },
      { to: "/Tracker_Reports", label: "Reports", icon: HiOutlineChartBarSquare },
      // "Tracker Admin", not "Administration": /Home lays these labels out as
      // tiles with no section heading beside them, so a bare "Administration"
      // there was indistinguishable from the app-wide section of that name.
      { to: "/Tracker_Admin", label: "Tracker Admin", icon: HiOutlineWrenchScrewdriver },
    ],
  },
  /*
   * The masters and rules that govern ORDER ENTRY, as opposed to the app
   * itself.
   *
   * All four used to sit in Administration, where they were mixed in with
   * users, roles, devices and labels — so the section answered two unrelated
   * questions ("who may use this app" and "how do orders work here") and a
   * salesperson looking for a party's price list had to read past App User and
   * Permissions to find it.
   *
   * "Config" rather than "Admin" deliberately: none of these four administers
   * a person. They configure the order flow — which parties a user sees, which
   * products a party may buy, where the master data comes from, and what the
   * approval chain does. "Order Admin" next to a section already called
   * Administration would also have invited the question of which admin is
   * meant.
   *
   * It sits directly above Administration because both are low-frequency and
   * belong at the foot of the rail; putting it under Orders would have pushed
   * Invoices, Payments and Reports down for the sake of pages most people open
   * once a quarter.
   */
  {
    label: "Order Config",
    links: [
      { to: "/Party_Assignment", label: "Party Assignment", icon: HiOutlineUserGroup },
      { to: "/Party_Product_Assignment", label: "Party Products", icon: HiOutlineLink },
      { to: "/Order_Flow_Settings", label: "Order Flow Settings", icon: HiOutlineAdjustmentsHorizontal },
      { to: "/Sap_Sync", label: "SAP Sync", icon: HiOutlineArrowPath },
    ],
  },
  {
    label: "Administration",
    links: [
      { to: "/App_User", label: "App User", icon: HiOutlineUsers },
      { to: "/Page_Permissions", label: "Permissions", icon: HiOutlineShieldCheck },
      { to: "/Role_Permissions", label: "Role Permissions", icon: HiOutlineKey },
      { to: "/Device_Management", label: "Device Management", icon: HiOutlineDevicePhoneMobile },
      { to: "/UI_Labels", label: "UI Labels", icon: HiOutlineLanguage },
    ],
  },
];
