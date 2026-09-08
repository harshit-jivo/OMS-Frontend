/**
 * A screenshot per route — the baseline Phase 2 is measured against.
 *
 * Run `npx playwright test` to check, `npx playwright test --update-snapshots`
 * to accept a change. Accepting should always be a deliberate act with the
 * diff looked at first; that is the entire mechanism.
 *
 * Routes are listed here rather than derived from `ROUTE_ACCESS` on purpose.
 * A screenshot suite is expensive, and which pages are worth a baseline is a
 * judgement — the coverage test at the bottom is what stops that judgement
 * quietly becoming "whatever someone remembered".
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, gotoStable, routeFonts, test } from "./harness";

/**
 * The pages Phase 2 will touch, in the order the plan works through them.
 *
 * Weighted towards screens that hand-roll a table, modal or badge, because
 * those are what the primitives replace and therefore where a regression will
 * actually land.
 */
const ROUTES: Array<[name: string, path: string]> = [
  // Landing and shell
  ["home", "/Home"],
  ["sales-dashboard", "/Sales_Dashboard"],
  // No "/Profile": Profile is a dialog off the header now, not a route
  // (DESIGN_SYSTEM §12). `AppHeader.test.tsx` and `ProfileDialog` cover it.

  // Tables — Phase 2.1, the biggest single group
  ["app-user", "/App_User"],
  ["product-stock", "/Product_Stock"],
  ["view-orders", "/View_Orders"],
  ["invoice-review", "/Invoice_Review"],
  ["scheme-manager", "/Scheme_Manager"],
  ["device-management", "/Device_Management"],
  ["party-assignment", "/Party_Assignment"],
  ["tracker-queue", "/Tracker_Queue"],
  ["tracker-invoices", "/Tracker_Invoices"],
  // The other three tracker screens. Added when 2.2 reached `.trk-badge` — the
  // largest badge family in the app, 37 uses across all six of these files.
  // Converting the three that already had baselines and leaving these to be
  // done blind would have been the worse half of the job.
  ["tracker-admin", "/Tracker_Admin"],
  ["tracker-alerts", "/Tracker_Alerts"],
  ["tracker-reports", "/Tracker_Reports"],
  ["mart-approval", "/Mart_Approval"],
  ["distributor", "/Distributor"],
  // A declared route with no baseline at all until Phase 6.3 went looking
  // for coverage on its 18 inline styles — the same hole
  // `/Rate_Approver_orders` had, and for the same reason: a page reached
  // from a menu nobody re-checked against `App.tsx`.
  ["distributor-order-tracking", "/Distributor_Order_Tracking"],

  // Badges and status chips — Phase 2.2
  ["auditor-orders", "/Auditor_orders"],
  ["billing-orders", "/Billing_orders"],
  // The third approval queue, unbaselined until 3.1 converted its write. Its
  // two siblings were watched and it was not, which is the worst arrangement:
  // the three pages are near-copies, so a change made to all three showed up in
  // two screenshots and vanished in the third.
  ["rate-approver-orders", "/Rate_Approver_orders"],
  ["order-tracking", "/Order_Tracking"],
  // Added in 2.2 alongside the badge families they carry: `ot-badge` (14
  // classes), `sovi-badge`, `ps-badge`, `apv-badge`. Added BEFORE converting
  // them, so the conversion has something to be measured against.
  // `/Order_Status_Tracking` is NOT a route. The page is mounted three times,
  // once per mode, under three different paths — and a baseline pointed at the
  // non-route captured the not-found page for weeks while reading as coverage.
  // All three modes are listed because `getDecisionType` branches on `mode`,
  // so one mode exercises a third of the code that decides the badge.
  ["status-tracking-auditor", "/Auditor_status_tracking"],
  ["status-tracking-billing", "/Billing_status_tracking"],
  ["status-tracking-approver", "/Rate_Approver_status_tracking"],
  ["personwise-report", "/PersonWise_Report"],
  ["tracker-entry", "/Tracker_Entry"],

  // Forms and modals — Phase 2.3
  ["add-sales", "/Add_Sales"],
  // Both routed since forever with no baseline, and both are 3.1 conversion
  // targets — so they get one BEFORE the conversion, not after. Each needed a
  // fixture too: `/Drafts` filters the shared order list down to
  // `status_display === "draft"` and there was no draft row, and `/Add_Scheme`
  // was being answered by the bare `/orders/schemes/` catch-all.
  ["drafts", "/Drafts"],
  ["add-scheme", "/Add_Scheme"],
  ["sales-invoice", "/Sales_Invoice"],
  ["order-flow-settings", "/Order_Flow_Settings"],
  ["page-permissions", "/Page_Permissions"],
  ["ui-labels", "/UI_Labels"],
  // Added for 6.3, BEFORE the inline styles come out of them. These three are
  // the densest inline-style files in the app — 85, 45 and 24 uses — and all
  // three were routed with no baseline, so the one phase most likely to move
  // pixels would have moved them unwatched.
  ["party-product-assignment", "/Party_Product_Assignment"],
  ["combo-mapping", "/Combo_Mapping"],
  ["staff-rate-assignment", "/Staff_Rate_Assignment"],

  // Reports — dense layout, tabular numerals, the easiest thing to break
  ["daily-report", "/Daily_Report"],
  // The third `dr-badge` screen. Daily_Report and PersonWise_Report were
  // already listed; this one was not, so a third of that family was
  // converted with nothing watching.
  ["sales-report", "/Sales_Report"],
  ["inventory-report", "/Inventory_Report"],
  // Routed since forever with no baseline at all, which is how its data
  // layer got refactored with nothing watching. Its endpoint had no fixture
  // either, so the page rendered an empty table.
  ["statewise-report", "/StateWise_Report"],
  ["so-invoice-report", "/SO_Invoice_Report"],
  ["invoice-report", "/Invoice_Report"],

  // Compliance and the rest
  ["einvoice", "/Einvoice"],
  ["ewaybill", "/Ewaybill"],
  ["hais", "/HAIS"],
  ["payments-dashboard", "/Payments_Dashboard"],
  ["label-checker", "/Label_Checker"],
  ["sap-sync", "/Sap_Sync"],
];

test.describe("route baselines", () => {
  for (const [name, path] of ROUTES) {
    test(`${name} (${path})`, async ({ appPage }) => {
      await gotoStable(appPage, path);

      // Full page, not the viewport. Below-the-fold content is where a table's
      // padding change shows up, and a viewport-only shot would miss it.
      await expect(appPage).toHaveScreenshot(`${name}.png`, { fullPage: true });
    });
  }
});

test.describe("the login screen", () => {
  test("renders for a signed-out visitor", async ({ page }) => {
    // Uses the bare `page`, not `appPage` — no seeded session, because the
    // point is what an anonymous visitor sees. It is also the one route that
    // is NOT lazily loaded, so it is the baseline that would catch a
    // regression in the eager chunk.
    await routeFonts(page);
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.goto("/");
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });
});

/**
 * A path in `ROUTES` that App.tsx does not declare renders the not-found page,
 * and the screenshot of a not-found page is stable, green, and worthless.
 *
 * That is not hypothetical: `/Order_Status_Tracking` sat in this list as a
 * baseline for three badge families while the real routes were
 * `/Auditor_status_tracking`, `/Billing_status_tracking` and
 * `/Rate_Approver_status_tracking`. Nothing failed, because nothing could.
 */
test.describe("the route list itself", () => {
  test("every path is a route App.tsx declares", async () => {
    const source = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), "..", "src", "App.tsx"),
      "utf8",
    );
    const declared = new Set([...source.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));
    const missing = ROUTES.map(([, path]) => path).filter((p) => !declared.has(p));
    expect(missing, "paths in ROUTES with no <Route path=…> in App.tsx").toEqual([]);
  });
});
