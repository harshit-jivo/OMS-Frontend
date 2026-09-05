/**
 * Every route renders without throwing — plan item 0.2.
 *
 * WHAT THIS CATCHES, AND WHAT IT DOES NOT
 * ---------------------------------------
 * It is the cheapest test that would have caught the incident this project
 * already had: the four-branch merge silently deleted `formData.warehouse` from
 * `Add_Sales.tsx`, and only `tsc` noticed, and only because the field happened
 * to be referenced elsewhere. A deletion that type-checks would have shipped.
 *
 * It became more valuable with route-level code splitting, which moved page
 * loading to navigation time — a page that throws on mount now fails for the
 * user rather than at build.
 *
 * It does NOT test behaviour. Every request answers with an empty array (see
 * test/setup.ts), so what is asserted is: the module loads, the component
 * mounts, effects run, and nothing throws. That is a low bar deliberately —
 * a high bar over 57 pages would be 57 sets of fixtures nobody maintains.
 *
 * Pages are imported STATICALLY here even though the app loads them lazily.
 * Vitest has no chunking, and a static import surfaces a broken module as a
 * collection error naming the file, rather than a Suspense boundary that never
 * resolves.
 */
import { describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

/**
 * A page, plus the props the ROUTER passes it.
 *
 * Most pages take none. Three routes mount `Order_Status_Tracking` with a
 * required `mode`, and `/FOC` mounts `Add_Sales` with `focMode`. Typing this
 * strictly is what surfaced that: the first version declared every page as
 * `ComponentType<unknown>` and would happily have rendered
 * `<Order_Status_Tracking />` with `mode` undefined — a shape the router never
 * produces, so the test would have been exercising a state that cannot occur
 * while claiming to cover the route.
 */
type SmokeEntry<P> = [
  route: string,
  load: () => Promise<{ default: ComponentType<P> }>,
  props: P,
];

/** Convenience so an entry with no props does not have to write `{}`. */
function page(
  route: string,
  load: () => Promise<{ default: ComponentType<Record<string, never>> }>,
): SmokeEntry<Record<string, never>> {
  return [route, load, {} as Record<string, never>];
}

import { ROUTE_ACCESS } from "../auth/routeAccess";
import { renderPage } from "../test/renderPage";

/**
 * Every page reachable from the router, by the path it is mounted at.
 *
 * `() => import(...)` rather than a direct import so that one page failing to
 * even parse fails ONE test instead of the whole file — with 57 entries, a
 * collection error tells you nothing about which one broke.
 */
// The tuple is heterogeneous by design: each entry carries its own prop type,
// checked at the point it is written. A single union would erase exactly that
// check, which is the thing worth keeping.
//
// The directive goes on the line IMMEDIATELY above the code — separated by so
// much as one more comment line it targets that comment instead, and is then
// reported as unused while the original error still stands. Which is what
// happened on the first attempt at this block.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PAGES: Array<SmokeEntry<any>> = [
  page("/", () => import("./Login")),
  page("/Dashboard", () => import("./Dashboard")),
  page("/Profile", () => import("./Profile")),
  page("/App_User", () => import("./App_User")),
  page("/Sap_Sync", () => import("./Sap_Sync")),
  page("/Device_Management", () => import("./Device_Management")),
  page("/Page_Permissions", () => import("./Page_Permissions")),
  page("/UI_Labels", () => import("./UI_Labels")),
  page("/Party_Assignment", () => import("./Party_Assignment")),
  page("/Party_Product_Assignment", () => import("./Party_Product_Assignment")),
  page("/Order_Flow_Settings", () => import("./Order_Flow_Settings")),
  page("/Add_Scheme", () => import("./Add_Scheme")),
  page("/Scheme_Manager", () => import("./Scheme_Manager")),
  page("/Combo_Mapping", () => import("./Combo_Mapping")),
  page("/Product_Stock", () => import("./Product_Stock")),
  page("/Order_Stock_Check", () => import("./Order_Stock_Check")),
  page("/Einvoice", () => import("./Einvoice")),
  page("/Ewaybill", () => import("./Ewaybill")),
  page("/HAIS", () => import("./HAIS")),
  page("/Distributor", () => import("./Distributor")),
  page("/Distributor_Order_Tracking", () => import("./Distributor/Order_Tracking")),
  page("/Mart_Approval", () => import("./MartApproval")),
  page("/Payments_Dashboard", () => import("./Payments/ApprovalManagement")),
  page("/Tracker_Entry", () => import("./Tracker_Entry")),
  page("/Tracker_Queue", () => import("./Tracker_Queue")),
  page("/Tracker_Invoices", () => import("./Tracker_Invoices")),
  page("/Tracker_Alerts", () => import("./Tracker_Alerts")),
  page("/Tracker_Reports", () => import("./Tracker_Reports")),
  page("/Tracker_Admin", () => import("./Tracker_Admin")),
  page("/Ap_Invoice_Entry", () => import("./Ap_Invoice_Entry")),
  page("/Label_Checker", () => import("./Label_Checker")),
  page("/Nutrition_Manager", () => import("./Nutrition_Manager")),
  page("/Compliance_Rules", () => import("./Compliance_Rules")),
  page("/Label_History", () => import("./Label_History")),
      page("/FOC", () => import("./FOC")),
  // `/FOC` mounts the FOC page; `Add_Sales` is mounted with `focMode` on its
  // own route, and both shapes are worth covering.
  ["/Add_Sales", () => import("./Add_Sales"), { focMode: false }] as SmokeEntry<{ focMode: boolean }>,
  page("/View_Orders", () => import("./View_Orders")),
  page("/Drafts", () => import("./Drafts")),
  page("/Sales_Invoice", () => import("./Sales_Invoice")),
  page("/Sales_Invoice/SKU_Images", () => import("./SalesInvoice/SkuGalleryPage")),
  page("/Invoice_Review", () => import("./InvoiceReview")),
  page("/Auditor_orders", () => import("./Auditor_Order")),
  page("/Billing_orders", () => import("./Billing_Order")),
  page("/Rate_Approver_orders", () => import("./Rate_Approver_Order")),
    ["/Auditor_status_tracking", () => import("./Order_Status_Tracking"), { mode: "auditor" }] as SmokeEntry<{ mode: "auditor" }>,
  page("/Order_Tracking", () => import("./Order_Tracking")),
  page("/Invoice_Report", () => import("./Invoice_Report")),
  page("/Daily_Report", () => import("./Daily_Report")),
  page("/PersonWise_Report", () => import("./PersonWise_Report")),
  page("/Sales_Report", () => import("./Sales_Report")),
  page("/StateWise_Report", () => import("./StateWise_Report")),
  page("/Inventory_Report", () => import("./Inventory_Report")),
  page("/SO_Invoice_Report", () => import("./SO_Invoice_Report")),
  page("/Staff", () => import("./Staff")),
  page("/Staff_Rate_Assignment", () => import("./Staff_Rate_Assignment")),
  page("/hais/device/:code", () => import("./HAIS/AssetPublicView")),
];

describe("every page mounts", () => {
  it.each(PAGES)("%s", async (route, load, props) => {
    // A page is allowed to log — several report a failed fetch against the
    // empty responses this harness returns, which is correct behaviour, not a
    // defect. What is NOT allowed is throwing.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const Page = (await load()).default;
    expect(Page, `${route} has no default export`).toBeTypeOf("function");

    const { container } = renderPage(<Page {...props} />, { route });

    // Rendered SOMETHING. An empty container means the component returned null
    // for everyone — usually a guard that redirected, which would make this
    // test pass while proving nothing.
    expect(container.firstChild, `${route} rendered nothing`).not.toBeNull();
  });
});

describe("coverage", () => {
  /**
   * Routes that render a component another route already smoke-tests.
   *
   * Listed rather than inferred, so adding a genuinely new page cannot hide
   * behind "probably an alias". Each entry names what it shares.
   */
  const ALIASES: Record<string, string> = {
    "/Billing_status_tracking": "/Auditor_status_tracking",
    "/Rate_Approver_status_tracking": "/Auditor_status_tracking",
  };

  it("every guarded route is either smoke-tested or a named alias of one", () => {
    // The drift this file exists to prevent. A route added without a render
    // test is a page that can throw on first navigation and nothing notices —
    // which became more likely, not less, once pages started loading lazily.
    const smoked = new Set(PAGES.map(([route]) => route));
    const missing = Object.keys(ROUTE_ACCESS).filter(
      (route) => !smoked.has(route) && !(route in ALIASES),
    );
    expect(missing).toEqual([]);
  });

  it("every alias points at a route that IS smoke-tested", () => {
    // Otherwise an alias entry silently excuses a page nothing covers.
    const smoked = new Set(PAGES.map(([route]) => route));
    const dangling = Object.entries(ALIASES)
      .filter(([, target]) => !smoked.has(target))
      .map(([route]) => route);
    expect(dangling).toEqual([]);
  });

  it("smoke-tests no route that has been removed from the table", () => {
    // A test for a deleted page passes forever and covers nothing.
    const known = new Set(Object.keys(ROUTE_ACCESS));
    const stale = PAGES.map(([route]) => route).filter((r) => !known.has(r));
    expect(stale).toEqual([]);
  });
});
