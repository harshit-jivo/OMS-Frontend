/**
 * Screenshots of states you have to CLICK to reach.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * `routes.visual.spec.ts` captures each route as it first paints. That covers a
 * lot, and it covered none of the following: the invoice detail panel, the
 * history drawer, the e-invoice browser's results. Every one of those is a
 * dense, badge-heavy screen, and every one of them was invisible to the suite.
 *
 * It stopped being an abstract gap during Phase 2.2. Three badge families —
 * `ir-badge` on Invoice_Review, `nic-badge` across the seven e-invoice screens,
 * and the ones on Tracker_Entry — turned out to render ONLY after a click.
 * Converting them without this file would have meant changing code that no test
 * could see, which is the thing the whole visual harness exists to avoid.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT MAKES AN INTERACTION SCREENSHOT DIFFERENT
 * ─────────────────────────────────────────────────────────────────────────
 * A route screenshot settles once. An interaction has two settling points —
 * after the navigation and again after the click — and the second one is the
 * one people forget. `gotoStable` handles the first; `settle()` below is the
 * same wait, factored out, for the second.
 *
 * These are captured at the VIEWPORT rather than full page. A modal is
 * positioned against the viewport, and a full-page shot of one is mostly the
 * dimmed content behind it — which drifts for reasons that have nothing to do
 * with the modal.
 */
import type { Page } from "@playwright/test";
import { asRole, expect, gotoStable, settle, test } from "./harness";

/** A parsed request body. The wire has no TypeScript type; `unknown` members
 *  are enough for `expect()` and keep `any` out of the suite. */
interface WireItem {
  [key: string]: unknown;
}
interface WireBody {
  [key: string]: unknown;
  items?: WireItem[];
}

test.describe("invoice review", () => {
  test("the detail panel for one invoice", async ({ appPage }) => {
    await gotoStable(appPage, "/Invoice_Review");

    // The first row's View button. Scoped to the row rather than the page:
    // there are seven "View" buttons and `getByRole` would refuse an ambiguous
    // match — correctly, and only at runtime.
    await appPage.getByRole("row").nth(1).getByRole("button", { name: "View" }).click();
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("invoice-review-detail.png");
  });

  test("the history drawer", async ({ appPage }) => {
    await gotoStable(appPage, "/Invoice_Review");
    await appPage.getByRole("row").nth(1).getByRole("button", { name: "History" }).click();
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("invoice-review-history.png");
  });
});

test.describe("e-invoice", () => {
  test("the invoice browser, loaded", async ({ appPage }) => {
    await gotoStable(appPage, "/Einvoice");

    // This screen loads nothing until asked — which is exactly why its badges
    // never appeared in a route screenshot.
    await appPage.getByRole("button", { name: /Load Invoices/i }).click();
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("einvoice-loaded.png");
  });
});

test.describe("approval management", () => {
  /*
   * `ActivePill` — the last of the `apv-badge` family — lives on four
   * configuration tabs, and the page opens on Analytics. A route screenshot
   * therefore never saw a single one of them, which is how that conversion
   * shipped carried by `tsc` alone.
   */
  test("the workflows tab", async ({ appPage }) => {
    await gotoStable(appPage, "/Payments_Dashboard");

    await appPage.getByRole("tab", { name: "Workflows", exact: true }).click();
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("approvals-workflows.png");
  });

  /*
   * Phase 6.3 — Levels, Approvers and Masters carry the rest of this file's
   * inline styles (the workflow-picker toolbars, the per-level wrapper, the
   * "no named approvers" notice, and Masters' two control rows plus the
   * ConfigTab it embeds for Payment Method Mapping / SAP Bank Accounts).
   * None of the three tabs had ever been opened by a screenshot.
   */
  test("the levels tab", async ({ appPage }) => {
    await gotoStable(appPage, "/Payments_Dashboard");

    await appPage.getByRole("tab", { name: "Levels", exact: true }).click();
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("approvals-levels.png");
  });

  test("the approvers tab", async ({ appPage }) => {
    await gotoStable(appPage, "/Payments_Dashboard");

    await appPage.getByRole("tab", { name: "Approvers", exact: true }).click();
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("approvals-approvers.png");
  });

  test("the masters tab, including the embedded config tab", async ({ appPage }) => {
    await gotoStable(appPage, "/Payments_Dashboard");

    await appPage.getByRole("tab", { name: "Masters", exact: true }).click();
    await settle(appPage);

    // Masters renders ConfigTab inline for Payment Method Mapping / SAP Bank
    // Accounts — without this the shot could pass on Masters' own content
    // alone while ConfigTab silently failed to mount.
    await expect(appPage.getByText("Payment Method Mapping").first()).toBeVisible();
    await expect(appPage).toHaveScreenshot("approvals-masters.png");
  });
});

/*
 * The two `dr-badge` report screens that render NOTHING until filtered.
 *
 * Sales_Report gates its whole report block on at least one filter being set
 * (Sales_Report.tsx:730) and PersonWise_Report gates its table on a user being
 * picked (PersonWise_Report.tsx:504) — behind a user dropdown that is itself
 * disabled until a main group is chosen. A route screenshot of either is a
 * picture of an empty filter card, which is exactly what both had.
 */
test.describe("filtered reports", () => {
  /** Open a `.dr-dropdown` by its trigger text and tick its first real option. */
  const pickFirstGroup = async (page: import("@playwright/test").Page) => {
    await page.getByText("Select Main Group", { exact: true }).click();
    await page.locator(".dr-dropdown-menu .dr-dropdown-item:not(.dr-select-all)").first().click();
  };

  test("sales report with a main group chosen", async ({ appPage }) => {
    await gotoStable(appPage, "/Sales_Report");
    await pickFirstGroup(appPage);
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("sales-report-filtered.png", { fullPage: true });
  });

  test("personwise report for one user", async ({ appPage }) => {
    await gotoStable(appPage, "/PersonWise_Report");
    await pickFirstGroup(appPage);

    // The user dropdown is `disabled` until the group above is set, so this
    // click would silently do nothing if the order were reversed.
    await appPage.getByRole("button", { name: "-- Select User --" }).click();
    await appPage.locator(".sl-party-option").filter({ hasText: "Amit Kumar" }).first().click();
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("personwise-report-filtered.png", { fullPage: true });
  });
});

/*
 * Sap_Sync is five pages behind one route. `Status` is the default tab, so the
 * route baseline covers exactly one fifth of it — and the `sd-badge` family
 * lives entirely in the other four.
 */
/*
 * StateWise_Report was routed with no baseline and its endpoint had no fixture,
 * so the page has always rendered an empty table. Adding the route screenshot
 * alone would have baselined that emptiness as if it were coverage — the trap
 * this file exists to avoid — so this asserts the rows are actually there
 * before anything is photographed.
 */
/*
 * Add_Sales — the wizard, driven past step 1 for the first time.
 *
 * Its route baseline is step 1 with every dropdown closed and `useWizard` true,
 * so the item editor, the summary and review steps and the whole 850-line
 * legacy form are absent from it: roughly 1,400 lines of that page could be
 * deleted without the image changing. Every endpoint it needs was also
 * unfixtured, so the party dropdown rendered options with blank labels whose
 * click handler received `undefined`.
 *
 * These tests are the precondition for converting that page to
 * react-hook-form + zod (plan item 3.4). They assert the wizard ADVANCES,
 * because a fixture with the wrong shape leaves it stuck on step 1 and produces
 * a screenshot identical to the one that was already being baselined.
 */
test.describe("add sales wizard", () => {
  /** Step 1: party, then a bill-to and a ship-to. Dispatch auto-fills. */
  const completeStepOne = async (page: import("@playwright/test").Page) => {
    // Each of these is a combo that only renders its options once the input is
    // focused (Add_Sales.tsx:2697-2701), so the placeholder is the handle.
    const pick = async (placeholder: string, option: string) => {
      await page.getByPlaceholder(placeholder).click();
      await page.locator(".sl-party-option").filter({ hasText: option }).first().click();
    };

    await pick("Search party...", "Northern Traders");
    // handlePartySelect deliberately BLANKS both addresses and nothing refills
    // them, so these two are not optional — without them Continue stays
    // disabled and the test would silently photograph step 1.
    await pick("Search bill to...", "Head Office");
    await pick("Search ship to...", "Main Warehouse");
  };

  /** Step 2: open the item modal, choose a product, give it boxes, confirm. */
  const addConfirmedItem = async (page: import("@playwright/test").Page) => {
    await page.getByRole("button", { name: "+ Add Item" }).click();
    await page.locator(".sl-pick-item").filter({ hasText: "JIVO CANOLA OIL 1 LTR" }).click();
    await page.locator(".sl-wiz-input").filter({ hasText: "Boxes" }).locator("input").fill("5");
    await page.getByRole("button", { name: "Add Item", exact: true }).click();
  };

  test("the party dropdown has real labels", async ({ appPage }) => {
    await gotoStable(appPage, "/Add_Sales");

    await appPage.getByPlaceholder("Search party...").click();

    // `PARTY_ROWS` has card_name/card_code; this page reads value/label. With
    // the old fixture these options rendered blank.
    await expect(
      appPage.locator(".sl-party-option-label").filter({ hasText: "Northern Traders" }),
    ).toBeVisible();
  });

  test("auto-fills the dispatch branch, which had no fixture at all", async ({ appPage }) => {
    // The effect at Add_Sales.tsx:267-272 picks branch[0] once the list loads.
    // `/orders/branch/` answered `[]` before, so this stayed empty and step 1
    // could never be completed — the reason the route baseline is a picture of
    // a form nobody can submit.
    await gotoStable(appPage, "/Add_Sales");
    await expect(appPage.getByText("--select--")).toHaveCount(0);
    await expect(appPage.getByText("Ludhiana").first()).toBeVisible();
  });

  test("reaches step 2, which no screenshot has ever shown", async ({ appPage }) => {
    await gotoStable(appPage, "/Add_Sales");
    await completeStepOne(appPage);

    const continueButton = appPage.getByRole("button", { name: "Continue" });
    // The gate is `parties && dispatch && billAddress && shipAddress &&
    // Deliverydate` — dispatch and the date auto-fill, the other three do not.
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect(appPage.getByRole("button", { name: "+ Add Item" })).toBeVisible();
  });

  test("a catalogue item can be picked and confirmed", async ({ appPage }) => {
    await gotoStable(appPage, "/Add_Sales");
    await completeStepOne(appPage);
    await appPage.getByRole("button", { name: "Continue" }).click();
    await appPage.getByRole("button", { name: "+ Add Item" }).click();

    await appPage.locator(".sl-pick-item").filter({ hasText: "JIVO CANOLA OIL 1 LTR" }).click();

    // Pcs comes from the product's sal_factor2 and is readOnly. A catalogue
    // fixture missing it would leave pcs at 0, and rowProblem would refuse the
    // row with "no pack size in the item master" — the check that makes this
    // fixture's sal_factor2 load-bearing rather than decorative.
    // toHaveValue, not toContainText: Pcs is a readOnly <input>, so its value is
    // not text content and a text assertion would pass on a blank field.
    await expect(
      appPage.locator(".sl-wiz-input").filter({ hasText: "Pcs" }).locator("input"),
    ).toHaveValue("12.0");
  });

  test("step 3 shows the PO field, and it is not mandatory", async ({ appPage }) => {
    await gotoStable(appPage, "/Add_Sales");
    await completeStepOne(appPage);
    await appPage.getByRole("button", { name: "Continue" }).click();

    // Step 2 will not advance without a CONFIRMED row (canAdvance:3171), so the
    // item has to be added properly rather than just picked.
    await addConfirmedItem(appPage);
    await appPage.getByRole("button", { name: "Continue" }).click();

    // PO renders only on step 3, which is why the `required={poField.required}`
    // binding had no test when it was changed.
    const po = appPage.locator("#wiz-po");
    await expect(po).toBeVisible();
    await expect(po).not.toHaveAttribute("required", /.*/);
  });

  /* ---------------------------------------------------------------------
   * Payload snapshots.
   *
   * `ordersService.test.ts` pins what the SERVICE sends for a given payload.
   * These two pin what the PAGE hands it, driven through the real wizard —
   * which is the half no unit test can reach, because the payload is built
   * from ~40 pieces of component state that only exist after four screens of
   * clicking.
   *
   * That is what makes them the safety net for Phase 3.4: the split moves this
   * state between files, and the wire format is the only evidence it survived.
   * ------------------------------------------------------------------ */

  /** Answer POST /orders/create/ ourselves and keep the body. */
  const capturePost = async (page: import("@playwright/test").Page) => {
    const bodies: WireBody[] = [];
    // Registered after the harness's `**/api/**` route, so it wins — and by
    // regex, because the glob form would need the URL to continue past the
    // trailing slash.
    await page.route(/\/orders\/create\//, async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ order_number: "SO-TEST-1" }),
      });
    });
    return bodies;
  };

  /**
   * All the way to step 4. The save buttons are NOT on the summary screen —
   * the wizard is Party / Items / Summary / Review, and only Review carries
   * "Save Order" and "Save as Draft".
   */
  const reachReview = async (page: import("@playwright/test").Page) => {
    await completeStepOne(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await addConfirmedItem(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
  };

  test("the create payload the wizard actually posts", async ({ appPage }) => {
    const bodies = await capturePost(appPage);
    await gotoStable(appPage, "/Add_Sales");
    await reachReview(appPage);

    // Wait for the engine's giveaway to actually appear on the review screen
    // before saving. The preview POST is debounced by 400ms and its proposals
    // land in state well after the step advances, so without this the click
    // races it — the payload is built from whatever `schemeProposals` holds at
    // that instant, and the test fails or passes depending on machine speed.
    await expect(appPage.getByText("1 box (24 pcs)")).toBeVisible();

    await appPage.getByRole("button", { name: "Save Order" }).click();
    await appPage.getByRole("button", { name: "Yes, Create New" }).click();

    await expect.poll(() => bodies.length).toBe(1);
    const body = bodies[0];

    // Ids, not labels. Both are `Number(...)` of a picker value, so a fixture
    // whose addresses had string ids would send NaN -> null and the order
    // would save against no address — silently, and only in production.
    expect(body.card_code).toBe("C000123");
    expect(body.bill_to_id).toBe(11);
    expect(body.ship_to_id).toBe(21);
    expect(body.dispatch_from_id).toBe(1);
    expect(body.is_draft).toBeUndefined();

    // One confirmed line. `item_code` is not typed anywhere — the page
    // re-derives it by matching item_name + category + brand + variety back
    // against the party catalogue (Add_Sales.tsx:899-906), so an empty string
    // here means SAP receives an order for nothing.
    expect(body.items).toHaveLength(1);
    const item = body.items![0];
    expect(item.item_code).toBe("JV-CAN-1L");
    expect(item.boxes).toBe(5);
    expect(item.pcs).toBe(12);
    expect(item.qty).toBe(60);

    // The v2 giveaway the engine proposed for this line, carried whole. The
    // backend qualifies it on `scheme_v2_id` alone, and the service used to
    // rebuild each scheme as `{scheme_id, scheme_qty}` — which dropped that
    // key and made the backend skip the entry, so every engine-resolved
    // scheme placed through this page was discarded on the wire.
    expect(item.is_scheme).toBe(true);
    const scheme = (item.schemes as WireItem[]).find((s) => s.scheme_v2_id)!;
    expect(scheme).toBeTruthy();
    expect(scheme.scheme_v2_id).toBe(42);
    expect(scheme.benefit_item_code).toBe("JV-OLV-500");
    // Pieces, not cartons: a SAP DocumentLine quantity is always pieces, and
    // the scheme was written as "1 BOX" of a 24-pack.
    expect(scheme.scheme_qty).toBe(24);
    expect(scheme.benefit_uom).toBe("BOX");
    expect(scheme.benefit_qty).toBe(1);
  });

  test("the draft payload, which is the same order minus the validation", async ({ appPage }) => {
    const bodies = await capturePost(appPage);
    await gotoStable(appPage, "/Add_Sales");
    await reachReview(appPage);

    // The wizard had no draft button at all until this was written:
    // `renderWizardFooter` offered Back and Save Order, and "Save as Draft"
    // lived only on the legacy form, which `useWizard` (Add_Sales.tsx:234)
    // renders for edit / duplicate / FOC. Creating a fresh order — the one
    // flow a draft is for — could not reach `handleSaveDraft`, the /Drafts
    // page or any of the code behind them.
    await appPage.getByRole("button", { name: "Save as Draft" }).click();

    await expect.poll(() => bodies.length).toBe(1);
    const body = bodies[0];

    // Same endpoint as a real order; `is_draft` is the whole difference, and
    // `order_id` is absent because this is a new draft rather than a resumed
    // one.
    expect(body.is_draft).toBe(true);
    expect(body.order_id).toBeUndefined();
    expect(body.card_code).toBe("C000123");
    expect(body.bill_to_id).toBe(11);
    expect(body.items![0].item_code).toBe("JV-CAN-1L");

    // A draft does NOT carry the engine's proposals: `handleSaveDraft` never
    // reads `schemeProposals`. That is survivable rather than a bug —
    // reopening the draft re-runs the preview — but it is a real difference
    // between the two payloads, so it is asserted here instead of being
    // rediscovered as a surprise.
    expect(body.items![0].schemes).toEqual([]);
  });

  test("a row that cannot be confirmed says so in the modal", async ({ appPage }) => {
    // No dialog is stubbed here on purpose. If this were still `alert()`, the
    // click would open a browser dialog Playwright auto-dismisses and the
    // assertion below would find nothing — which is exactly the difference
    // step 7 was for.
    await gotoStable(appPage, "/Add_Sales");
    await completeStepOne(appPage);
    await appPage.getByRole("button", { name: "Continue" }).click();
    await appPage.getByRole("button", { name: "+ Add Item" }).click();
    await appPage.locator(".sl-pick-item").filter({ hasText: "JIVO CANOLA OIL 1 LTR" }).click();

    // Confirm with no quantity typed.
    await appPage.getByRole("button", { name: "Add Item", exact: true }).click();

    await expect(appPage.locator(".sl-field-error")).toHaveText(
      "Enter boxes and quantity greater than 0.",
    );
    // And it did not confirm: the modal is still open.
    await expect(appPage.getByRole("button", { name: "Add Item", exact: true })).toBeVisible();
  });

  test("typing into a quantity keeps the caret in it", async ({ appPage }) => {
    await gotoStable(appPage, "/Add_Sales");
    await completeStepOne(appPage);
    await appPage.getByRole("button", { name: "Continue" }).click();
    await appPage.getByRole("button", { name: "+ Add Item" }).click();
    await appPage.locator(".sl-pick-item").filter({ hasText: "JIVO CANOLA OIL 1 LTR" }).click();

    const boxes = appPage.locator(".sl-wiz-input").filter({ hasText: "Boxes" }).locator("input");
    // One key at a time, NOT `fill`. The rows live in a react-hook-form field
    // array now, and every keystroke goes through `update()` — if that
    // remounted the input, `fill` would still pass while a human typing "12"
    // would get "1", then lose the caret. Only a per-key sequence can tell the
    // difference.
    await boxes.pressSequentially("12");

    await expect(boxes).toHaveValue("12");
    await expect(boxes).toBeFocused();
    // And the derived fields followed along: 12 boxes x 12 per box. `Qty`
    // exactly — "Pcs" and "Price List" both contain it as a substring.
    await expect(
      appPage.locator(".sl-wiz-input").filter({ hasText: /^Qty$/ }).locator("input"),
    ).toHaveValue("144");
  });

  test("a draft cannot be saved before a party is chosen", async ({ appPage }) => {
    await gotoStable(appPage, "/Add_Sales");

    // `handleSaveDraft` sends `card_code` straight through, so a draft saved
    // on a blank step 1 is a row nobody can resume.
    await expect(appPage.getByRole("button", { name: "Save as Draft" })).toBeDisabled();
  });

  /* ---------------------------------------------------------------------
   * The OTHER form.
   *
   * Line 3318 of Add_Sales.tsx is a ternary: the wizard, or an 850-line legacy
   * `<form>`. They never coexist, they have different party controls and
   * different item entry, and `useWizard` picks the legacy one only for edit /
   * duplicate / FOC — modes that arrive on `location.state`, which
   * `page.goto()` cannot supply. So half this page has never been rendered by
   * any test, and the only way in is to click through from a page that
   * navigates there.
   * ------------------------------------------------------------------ */
  test("the legacy edit form, reached the only way it can be", async ({ appPage }) => {
    await gotoStable(appPage, "/Order_Tracking");

    // Edit renders only for a REJECTED order (Order_Tracking.tsx:823), so this
    // is row 3 of ORDER_ROWS and the reason the detail fixture answers for it.
    await appPage.getByRole("button", { name: "Edit", exact: true }).first().click();
    await settle(appPage);

    // The wizard's stepper must be absent — otherwise this is the create flow
    // again and every assertion below would be testing the wrong branch.
    await expect(appPage.getByRole("button", { name: "1 Party" })).toHaveCount(0);
    await expect(appPage.getByRole("button", { name: "Update Order" })).toBeVisible();

    // Loaded from the order rather than typed: the party is injected into
    // `parties` by the edit loader because C000789 is not in the party list at
    // all (Add_Sales.tsx:586-604).
    await expect(appPage.getByText("Eastern Foods Ltd").first()).toBeVisible();
    await expect(appPage.locator("input[name='Deliverydate']")).toHaveValue("2026-06-20");
    await expect(appPage.getByText("JIVO CANOLA OIL 1 LTR").first()).toBeVisible();

    // The first pixel ever captured of this branch. ~850 lines — the whole
    // legacy item table, its scheme panel and its totals block — have been
    // invisible to the visual suite, which is exactly the code Phase 4 is
    // about to decompose. Taken only after the assertions above, so it is a
    // photograph of a LOADED order rather than of an empty form.
    await expect(appPage).toHaveScreenshot("add-sales-edit-form.png", { fullPage: true });
  });

  test("the legacy form's native validation is live, and mostly inert", async ({ appPage }) => {
    await gotoStable(appPage, "/Order_Tracking");
    await appPage.getByRole("button", { name: "Edit", exact: true }).first().click();
    await settle(appPage);

    // THE HAZARD FOR STEP 6. This branch is inside a real `<form>`, so its
    // `required` attributes participate in constraint validation — the
    // wizard's copies do not, because `renderWizard()` renders outside any
    // form. An RHF migration naturally wraps the wizard in a `<form>`, and the
    // moment it does, these attributes go live on a path where they never have
    // been. This test is what makes that change visible instead of silent.
    await expect(appPage.locator("input[name='Deliverydate']")).toHaveAttribute("required", "");
    await expect(appPage.locator("input[name='boxes']").first()).toHaveAttribute("required", "");

    // And the part that is NOT protection: dispatch, both addresses and company
    // are `required` on `type="hidden"` inputs (:3452, :3522, :3582, :4102).
    // A hidden input is barred from constraint validation by the HTML spec, so
    // the browser never checks any of them — `validateBeforeSave` is the only
    // thing actually guarding those four fields, and re-creating these
    // attributes during the migration would re-create four no-ops.
    const hiddenRequired = appPage.locator("input[type='hidden'][required]");
    await expect(hiddenRequired).toHaveCount(4);
    await expect(hiddenRequired.first()).not.toBeVisible();
  });
});

test.describe("ui labels", () => {
  test("renders the admin label rows, which had no fixture", async ({ appPage }) => {
    // `/ui-config/admin/labels/` answered the harness's `[]` fallback, so this
    // page rendered its empty state and its route baseline was a picture of
    // "no labels". The TanStack Query conversion of this screen was therefore
    // covered by a screenshot that could not see the table at all.
    await gotoStable(appPage, "/UI_Labels");

    await expect(appPage.getByRole("cell", { name: "po_number" })).toBeVisible();
    await expect(appPage.getByRole("cell", { name: "delivery_date" })).toBeVisible();
    // The row whose flags Add Sales actually reads. `is_required: false` here
    // is the "PO is not mandatory" decision, in the table that encodes it.
    await expect(appPage.getByRole("cell", { name: "PO Number" })).toBeVisible();
  });

  test("the search box narrows the table", async ({ appPage }) => {
    await gotoStable(appPage, "/UI_Labels");
    await appPage.getByPlaceholder(/search/i).fill("delivery");
    await settle(appPage);

    await expect(appPage.getByRole("cell", { name: "delivery_date" })).toBeVisible();
    await expect(appPage.getByRole("cell", { name: "po_number" })).toHaveCount(0);
  });
});

test.describe("inventory report", () => {
  test("renders warehouse columns and stock rows", async ({ appPage }) => {
    // `/hana/inventory-report/` had no fixture, so it answered `[]` — truthy
    // with no `groups`. The page's own loader crashed on `[].warehouses.map()`
    // inside its try, fell into the catch and rendered "Could not load
    // inventory from SAP". That error card is what the route baseline has been
    // a picture of.
    await gotoStable(appPage, "/Inventory_Report");

    await expect(
      appPage.getByText("Could not load inventory from SAP"),
    ).toHaveCount(0);
    await expect(appPage.getByRole("columnheader", { name: "LDH" })).toBeVisible();
    await expect(appPage.getByRole("columnheader", { name: "DEL" })).toBeVisible();
    await expect(appPage.getByText("JIVO CANOLA OIL 1 LTR").first()).toBeVisible();
  });

  test("unticking a warehouse drops its column", async ({ appPage }) => {
    // The conversion replaced a state array that the fetch re-seeded on every
    // load with a `null`-means-all sentinel, so this is the behaviour most at
    // risk from it — and the picker is invisible to a route screenshot.
    await gotoStable(appPage, "/Inventory_Report");
    await appPage.getByRole("button", { name: /All warehouses \(2\)/ }).click();
    await appPage.getByRole("checkbox").first().uncheck();
    await settle(appPage);

    await expect(appPage.getByRole("columnheader", { name: "LDH" })).toHaveCount(0);
    await expect(appPage.getByRole("columnheader", { name: "DEL" })).toBeVisible();
  });
});

test.describe("dashboard state-item panel", () => {
  test("renders products once the charts endpoint answers", async ({ appPage }) => {
    // Dashboard reads `state_item_sales` off the SAME endpoint StateWise_Report
    // uses (Dashboard.tsx:403), and branches on `length === 0` at :2086. That
    // endpoint had no fixture, so this panel has always rendered its empty
    // branch — and the route baseline photographed the empty branch as
    // coverage. This asserts the populated one before anything is baselined.
    await gotoStable(appPage, "/Dashboard");

    // The panel lists a state picker and the top VARIETIES for the selected
    // state — not item names, which is what the fixture's `variety` field is
    // for. Both states plus a variety proves the payload was read, not just
    // that a heading exists.
    await expect(appPage.getByRole("button", { name: "Punjab" })).toBeVisible();
    await expect(appPage.getByRole("button", { name: "Kerala" })).toBeVisible();
    await expect(appPage.getByText("Canola").first()).toBeVisible();
  });
});

/*
 * Phase 6.3 — `charts.top_parties` and `charts.status_distribution` had the
 * same gap as `state_item_sales` above: no fixture, so the Top Parties list
 * and the status pie/legend rendered their empty states in every baseline
 * that ever opened /Dashboard. That silently made two conversions
 * unverifiable: `.db-party-list-badge`'s nth-child palette cycle (was
 * `PALETTE[index % PALETTE.length]` inline) and `.db-pie-cell` /
 * `.db-pie-cell--clickable` (was a `cursor`/`outline` ternary inline).
 */
test.describe("dashboard charts", () => {
  test("top parties badges, the status legend, and the order-detail modal it opens", async ({
    appPage,
  }) => {
    await gotoStable(appPage, "/Dashboard");

    // Three distinctly-coloured badges prove the nth-child cycle runs per
    // row, not just that the list rendered. `{ exact: true }` because the
    // headline sub-text above the list also names the top party in prose.
    await expect(appPage.getByText("Northern Traders", { exact: true })).toBeVisible();
    await expect(appPage.getByText("Southern Supply Co", { exact: true })).toBeVisible();
    await expect(appPage.getByText("Ravi Menon", { exact: true })).toBeVisible();

    // Admin is not a review/billing role, so the legend is clickable —
    // exercising `.db-pie-cell--clickable`, not just the base `.db-pie-cell`.
    const completedLegendItem = appPage.locator(".db-legend-item--clickable", {
      hasText: "Completed",
    });
    await expect(completedLegendItem).toBeVisible();
    await completedLegendItem.click();
    await settle(appPage);

    await expect(appPage.getByText("Completed Orders")).toBeVisible();
    await appPage.getByRole("button", { name: "View" }).first().click();
    await settle(appPage);

    // The hand-rolled order-detail modal, stacked over the status-orders
    // dialog it was opened from — `.db-status-modal-backdrop--stacked`
    // (was `style={{ zIndex: 1100 }}`) has to out-rank it or this would be
    // hidden behind the dialog it came from.
    await expect(appPage.locator(".db-order-detail-modal")).toBeVisible();
    await expect(appPage).toHaveScreenshot("dashboard-order-detail-modal.png");
  });

  test("a non-admin role's sales chart spans the full row", async ({ appPage }) => {
    // `.db-chart-box--full-span` (was `gridColumn: role === "admin" ?
    // undefined : "1 / -1"`) only applies off the admin role the rest of
    // this suite defaults to.
    await asRole(appPage, "manager");
    await gotoStable(appPage, "/Dashboard");

    await expect(appPage.getByText("Northern Traders", { exact: true })).toBeVisible();
    await expect(appPage).toHaveScreenshot("dashboard-manager-charts-row.png", {
      fullPage: true,
    });
  });
});

test.describe("state-wise report", () => {
  test("renders rows from the charts endpoint, not an empty table", async ({ appPage }) => {
    await gotoStable(appPage, "/StateWise_Report");

    // Cells, not text. `getByText("Punjab")` matches the <option> in the state
    // filter, which is populated from the same query and is "hidden" to
    // Playwright — so it fails while the data is in fact loaded, and would
    // equally have PASSED on a page whose table was empty but whose filter was
    // not. The table is the thing under test.
    await expect(appPage.getByRole("cell", { name: "Punjab", exact: true })).toHaveCount(2);
    await expect(appPage.getByRole("cell", { name: "Kerala", exact: true })).toHaveCount(2);
    await expect(
      appPage.getByRole("cell", { name: "JIVO CANOLA OIL 1 LTR", exact: true }),
    ).toHaveCount(2);
  });

  test("narrows to one state", async ({ appPage }) => {
    await gotoStable(appPage, "/StateWise_Report");
    // The state filter is the native select carrying "All States".
    await appPage
      .locator("select")
      .filter({ has: appPage.locator('option[value=""]', { hasText: "All States" }) })
      .selectOption("Kerala");
    await settle(appPage);

    // Prove the filter did something before photographing it: Punjab's two
    // rows must be gone and Kerala's two must remain.
    await expect(appPage.getByRole("cell", { name: "Punjab", exact: true })).toHaveCount(0);
    await expect(appPage.getByRole("cell", { name: "Kerala", exact: true })).toHaveCount(2);

    await expect(appPage).toHaveScreenshot("statewise-report-filtered.png", { fullPage: true });
  });
});

test.describe("sap sync tabs", () => {
  /*
   * The Status tab's own badge is driven by `localStorage.lastSync`, which is
   * only written after a manual sync (Status.tsx:84). A visitor who has never
   * pressed Sync — which is every visitor in this suite — sees "No sync yet"
   * and no badge at all, so seeding the key is the only way to photograph it.
   */
  test("the Status tab after a sync", async ({ appPage }) => {
    await appPage.addInitScript(() => {
      localStorage.setItem(
        "lastSync",
        JSON.stringify({ type: "Products", date: "15/06/2026", time: "08:00", status: "success" }),
      );
    });
    await gotoStable(appPage, "/Sap_Sync");

    await expect(appPage).toHaveScreenshot("sap-sync-status-synced.png", { fullPage: true });
  });

  for (const tab of ["Products", "Parties & Addresses", "Branches", "Logs"]) {
    test(`the ${tab} tab`, async ({ appPage }) => {
      await gotoStable(appPage, "/Sap_Sync");
      await appPage.getByRole("tab", { name: tab, exact: true }).click();
      await settle(appPage);

      const slug = tab
        .toLowerCase()
        .replace(/[^a-z]+/g, "-")
        .replace(/^-|-$/g, "");
      await expect(appPage).toHaveScreenshot(`sap-sync-${slug}.png`, { fullPage: true });
    });
  }
});

/*
 * Phase 2.3 — the modals.
 *
 * These are the first screenshots of a modal in the suite. Until now every
 * baseline was of a page, and all 44 hand-rolled dialogs were invisible to it:
 * a conversion that centred the panel wrongly, dropped the footer or lost the
 * scroll would have passed 53 green tests.
 *
 * Captured at the viewport, not full page — a modal is positioned against the
 * viewport, and a full-page shot of one is mostly the dimmed content behind it.
 */
test.describe("tracker modals", () => {
  test("the invoice timeline", async ({ appPage }) => {
    await gotoStable(appPage, "/Tracker_Alerts");
    await appPage.getByRole("row").nth(1).getByRole("button", { name: /Track/ }).click();
    await settle(appPage);

    await expect(appPage.getByRole("dialog")).toHaveAccessibleName("Invoice timeline");
    await expect(appPage).toHaveScreenshot("tracker-timeline-dialog.png");
  });

  test("escape closes it — which the hand-rolled version never did", async ({ appPage }) => {
    await gotoStable(appPage, "/Tracker_Alerts");
    await appPage.getByRole("row").nth(1).getByRole("button", { name: /Track/ }).click();
    await expect(appPage.getByRole("dialog")).toBeVisible();

    await appPage.keyboard.press("Escape");
    await expect(appPage.getByRole("dialog")).toHaveCount(0);
  });

  test("the new-stage form", async ({ appPage }) => {
    await gotoStable(appPage, "/Tracker_Admin");
    await appPage
      .getByRole("button", { name: /Add Stage|New stage|Add stage/i })
      .first()
      .click();
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("tracker-stage-dialog.png");
  });
});

/*
 * Phase 6.3 — the distributor order tracker's timeline panel.
 *
 * `/Distributor_Order_Tracking` had no baseline at all until this phase went
 * looking for coverage; the route baseline added alongside this covers its
 * list, and 15 of its 18 inline styles are in the panel behind "Track".
 */
test.describe("distributor order tracking", () => {
  test("the timeline panel", async ({ appPage }) => {
    await gotoStable(appPage, "/Distributor_Order_Tracking");
    await appPage.getByRole("button", { name: "Track" }).first().click();
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("distributor-tracking-panel.png", { fullPage: true });
  });
});

/*
 * Phase 6.3 — UI_Labels' two dialogs.
 *
 * 17 of this page's 25 inline styles are behind them: 13 in the add/edit form
 * and 4 in the delete confirm. The existing `ui labels` describe asserts three
 * table cells and a search filter, and takes no screenshot at all.
 *
 * The fixture returns three rows, so the delete button needs `.first()` —
 * an unscoped `getByRole` matches three and dies on strict mode.
 */
test.describe("ui labels dialogs", () => {
  test("the add-label form", async ({ appPage }) => {
    await gotoStable(appPage, "/UI_Labels");
    await appPage.getByRole("button", { name: /Add Label/i }).click();
    await settle(appPage);

    await expect(appPage.getByRole("dialog")).toBeVisible();
    await expect(appPage).toHaveScreenshot("ui-labels-form.png");
  });

  test("the delete confirmation", async ({ appPage }) => {
    await gotoStable(appPage, "/UI_Labels");
    await appPage.getByRole("button", { name: "Delete label" }).first().click();
    await settle(appPage);

    await expect(appPage.getByRole("dialog")).toBeVisible();
    await expect(appPage).toHaveScreenshot("ui-labels-delete.png");
  });
});

/*
 * Phase 6.3 — the notification bell and its dialog.
 *
 * `Sidebar.tsx` carries 26 inline styles and 24 of them are here: the bell
 * button, the unread badge, and the whole notifications dialog. Every one was
 * invisible to the suite, because the block is gated on
 * `["auditor","billing","manager"].includes(normalizedRole) || isRateApprover`
 * and the harness signs in as `admin`.
 *
 * `asRole` is what makes them reachable. It also suppresses the push-permission
 * modal, which auto-opens for exactly these roles and would otherwise cover
 * the thing under test.
 */
test.describe("sidebar notifications", () => {
  test("the bell, with an unread badge", async ({ appPage }) => {
    await asRole(appPage, "billing");
    await gotoStable(appPage, "/Dashboard");

    // 2 unread of 3, from the fixture. Without this the badge is absent and
    // the shot would be of a bell with nothing on it.
    await expect(appPage.getByText("2", { exact: true }).first()).toBeVisible();
    await expect(appPage).toHaveScreenshot("sidebar-bell.png");
  });

  test("the notifications dialog", async ({ appPage }) => {
    await asRole(appPage, "billing");
    await gotoStable(appPage, "/Dashboard");

    await appPage.locator("button.header-bell-btn").click();
    await settle(appPage);

    await expect(appPage.getByRole("dialog")).toBeVisible();
    await expect(
      appPage.getByText("SO-202601 needs your approval — Northern Traders"),
    ).toBeVisible();
    await expect(appPage).toHaveScreenshot("sidebar-notifications.png");
  });
});

/*
 * Phase 6.3 — Order_Status_Tracking's detail view.
 *
 * The same order-item table again, behind the same eye button. Three routes
 * render this component (Auditor / Billing / Rate_Approver status tracking)
 * and all three have a list baseline; none had ever opened a row.
 */
test.describe("status tracking detail", () => {
  test("the order detail table", async ({ appPage }) => {
    await gotoStable(appPage, "/Auditor_status_tracking");
    await appPage.locator("button.ao-btn-icon.view").first().click();
    await settle(appPage);

    await expect(appPage.getByText("JIVO CANOLA OIL 1 LTR").first()).toBeVisible();
    await expect(appPage).toHaveScreenshot("status-tracking-detail.png", { fullPage: true });
  });

  /*
   * The "Order Log Timeline" block only renders for `mode === "billing"`
   * (Order_Status_Tracking.tsx) — the auditor test above never reaches it.
   * It carries most of this file's Phase 6.3 inline styles: the connector
   * line, the tone-coloured dot, the card, and the remark box all render
   * here from the shared orderlogs fixture (4 rows spanning progress,
   * pending and rejected tones).
   *
   * The one branch this does NOT reach is "Pending with: <name>" — it needs
   * a log whose tone is "pending" AND is the last entry, which requires an
   * order carrying `rate_approvals`; no fixture has one. Left inline for
   * that reason, same as this project's other genuinely-unreachable states.
   */
  test("the billing order log timeline", async ({ appPage }) => {
    await gotoStable(appPage, "/Billing_status_tracking");
    await appPage.locator("button.ao-btn-icon.view").first().click();
    await settle(appPage);

    await expect(appPage.getByText("Order Log Timeline")).toBeVisible();
    await expect(appPage.getByText("Rate not approved")).toBeVisible();
    await expect(appPage).toHaveScreenshot("order-log-timeline.png", { fullPage: true });
  });
});

/*
 * Phase 6.3 — the four order queues' detail view.
 *
 * `Auditor_Order`, `Billing_Order`, `Rate_Approver_Order` and `View_Orders`
 * render the SAME order-item table as the manager reports — verified by
 * normalising their inline style bodies and comparing as multisets, not by
 * eye: all four carry the identical seven declaration sets, and 55 objects
 * between them.
 *
 * The existing `phase 3.1 approval writes` tests exercise these pages but
 * never leave the list, and the table lives behind `showDetails` (e.g.
 * Auditor_Order.tsx:496). So all 55 sat behind one click nothing made.
 */
test.describe("order queue detail", () => {
  for (const [slug, path] of [
    ["auditor-orders", "/Auditor_orders"],
    ["billing-orders", "/Billing_orders"],
    ["rate-approver-orders", "/Rate_Approver_orders"],
    ["view-orders", "/View_Orders"],
  ] as const) {
    test(`${slug} — the order detail table`, async ({ appPage }) => {
      await gotoStable(appPage, path);
      await appPage.locator("button.ao-btn-icon.view").first().click();
      await settle(appPage);

      // Without a row the table renders its empty state and the screenshot
      // would pass forever while proving nothing about the cells converted.
      await expect(appPage.getByText("JIVO CANOLA OIL 1 LTR").first()).toBeVisible();
      await expect(appPage).toHaveScreenshot(`${slug}-detail.png`, { fullPage: true });
    });
  }
});

/*
 * Phase 6.3 — the three manager reports' order-detail table.
 *
 * `Daily_Report`, `PersonWise_Report` and `Sales_Report` are near-copies: the
 * same 16 inline styles in the same order, 13 of them `textAlign` on a
 * `TableCell` in this table. It opens only on the eye button in a report row
 * (`fetchOrderDetails` -> `showDetails`), so all 39 of those styles sat behind
 * one click and no baseline had ever reached any of them.
 *
 * The `/orders/orderdetailsbyid/` fixture already existed for the Add_Sales
 * edit path and carries one fully-populated item, which is all this needs.
 * The item-name assertion is the point of it: without a row the table renders
 * its empty state, and the screenshot would pass forever while proving nothing
 * about the cells being converted.
 */
test.describe("manager report detail", () => {
  /*
   * Daily_Report only, and that is enough for all three.
   *
   * `PersonWise_Report` gates its whole orders table on a Main Group AND a user
   * being chosen (PersonWise_Report.tsx:549, and the trigger at :379 is
   * disabled until `isFilterReady`); `Sales_Report` gates its own the same way.
   * Neither has a row, so neither has an eye button to click. Daily_Report
   * lists on arrival.
   *
   * The detail table's markup is byte-identical across the three — verified by
   * diffing the blocks, not assumed — so the classes this baseline proves are
   * the same classes the other two get. Their own coverage needs the filter
   * preamble and is recorded as outstanding rather than faked.
   */
  test("the order detail table", async ({ appPage }) => {
    await gotoStable(appPage, "/Daily_Report");
    await appPage.locator("button.ao-btn-icon.view").first().click();
    await settle(appPage);

    await expect(appPage.getByText("JIVO CANOLA OIL 1 LTR").first()).toBeVisible();
    await expect(appPage).toHaveScreenshot("daily-report-detail.png", { fullPage: true });
  });
});

/*
 * Phase 6.4 — the Lookups tab, which no baseline reached.
 *
 * `/tracker/admin/` answered `[]` for everything beneath it, so this tab drew
 * an empty table in every run and its rows, its two column sets and its add
 * form were all invisible to the suite.
 *
 * `LookupsTab` used to reset its draft and close its add form from an effect on
 * `kind`; that now happens in the tab's own click handler. Both resets turn out
 * to be unreachable through the UI — the add form is a Radix dialog, so the
 * kind tabs behind it cannot be clicked while a draft exists, and `openAdd`
 * rebuilds the draft every time it opens. So this is not a regression test for
 * the reset. It is the coverage the tab never had, and what makes the switch
 * itself — the only observable half of that effect — visible at all.
 */
test.describe("tracker admin lookups", () => {
  const openLookups = async (appPage: Page) => {
    await gotoStable(appPage, "/Tracker_Admin");
    await appPage.getByRole("button", { name: "Lookups", exact: true }).click();
    await settle(appPage);
  };

  test("the categories table", async ({ appPage }) => {
    await openLookups(appPage);
    await expect(appPage).toHaveScreenshot("tracker-admin-lookups.png", { fullPage: true });
  });

  test("switching kind swaps the column set", async ({ appPage }) => {
    await openLookups(appPage);
    // `gst_rates` is the other row shape — label + rate, not name — and the
    // only kind whose columns differ. One fixture for all six would have left
    // this table drawing empty cells and passing.
    await appPage.getByRole("button", { name: "GST Rates", exact: true }).click();
    await settle(appPage);

    await expect(appPage).toHaveScreenshot("tracker-admin-lookups-rates.png", { fullPage: true });
  });

  test("the add-value form", async ({ appPage }) => {
    await openLookups(appPage);
    await appPage.getByRole("button", { name: /^Add / }).click();
    await settle(appPage);

    await expect(appPage.getByRole("dialog")).toBeVisible();
    await expect(appPage).toHaveScreenshot("tracker-admin-lookups-add.png");
  });
});

/*
 * Phase 2.5 — the pager.
 *
 * 17 pagination blocks were replaced and the whole suite stayed green, which
 * sounds like a clean refactor and was not: every other paginated screen in
 * the fixtures has fewer rows than one page holds, so not one pager rendered.
 * Device_Management pages server-side, so its fixture is the only one that can
 * put a pager on screen — which is why it now claims three pages of four rows.
 *
 * Asserted rather than screenshotted: the pager sits below the fold, and the
 * things worth checking here are its landmark, its accessible names and the
 * fact that it actually pages — none of which a picture shows.
 */
test.describe("pagination", () => {
  test("is a landmark that pages", async ({ appPage }) => {
    await gotoStable(appPage, "/Device_Management");

    const pager = appPage.getByRole("navigation", { name: "Pagination" });
    await expect(pager).toBeVisible();
    await expect(pager.getByText("Page 1 of 3")).toBeVisible();

    // The arrows are decoration: the accessible names are plain words.
    await expect(pager.getByRole("button", { name: "Prev" })).toBeDisabled();
    await expect(pager.getByRole("button", { name: "Next" })).toBeEnabled();

    // Device_Management pages on the SERVER, so the position it displays comes
    // back from the API — and the fixture always answers "page 1". Asserting
    // the label changed would therefore be asserting the fixture, not the
    // pager. What the pager is responsible for is asking for the next page.
    const [request] = await Promise.all([
      appPage.waitForRequest((r) => /\/admin\/devices\/.*page=2/.test(r.url())),
      pager.getByRole("button", { name: "Next" }).click(),
    ]);
    expect(request.url()).toContain("page=2");
  });
});

/*
 * Phase 2.4 — the loading state.
 *
 * A loading state is invisible to every other test in this suite by
 * construction: `gotoStable` waits for exactly this to go away before it takes
 * a picture. So it gets one test that holds the response open on purpose.
 *
 * Worth being explicit about what changed here, because it is the one
 * conversion in Phase 2 that a user can see: the spinner and the words
 * "Loading orders..." are gone, replaced by bars the size of the table that is
 * coming. Nothing about the fetching or the branching moved.
 */
test.describe("loading states", () => {
  test("a table renders a skeleton while it waits", async ({ appPage }) => {
    // Hold the orders response open. `route.fetch` is never called, so the
    // page stays in its loading branch for as long as this test needs.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await appPage.route(/\/orders\/(list|ordersbyuser)\//, async (route) => {
      await held;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: "[]",
      });
    });

    // NOT `gotoStable` — that waits for this very state to disappear.
    await appPage.goto("/View_Orders");

    const skeleton = appPage.getByRole("status", { name: "Loading orders" });
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveAttribute("aria-busy", "true");
    await expect(appPage).toHaveScreenshot("view-orders-loading.png");

    release();
  });
});

/*
 * Phase 3.4 — validation, which is the half of a form that unit tests can
 * cover and screenshots cannot, and vice versa.
 *
 * `schemas/trackerInvoice.test.ts` proves the rules. This proves they are
 * WIRED: that the resolver runs, that the messages reach the fields, and that
 * Review does not open over an invalid form. A schema can be perfect and
 * connected to nothing.
 */
test.describe("invoice entry validation", () => {
  test("names each empty field instead of blocking with an alert", async ({ appPage }) => {
    await gotoStable(appPage, "/Tracker_Entry");
    await appPage.getByRole("button", { name: /Add Invoice/i }).click();
    await settle(appPage);

    await appPage.getByRole("button", { name: /^Review/ }).click();

    // The old validate() said "Required" thirteen times.
    await expect(appPage.getByText("Enter the party name")).toBeVisible();
    await expect(appPage.getByText("Enter the invoice number")).toBeVisible();
    await expect(appPage.getByText("Choose a GST type")).toBeVisible();

    // And it must not have advanced past the form.
    await expect(appPage.getByRole("dialog")).toHaveAccessibleName("Invoice form");
  });
});

/*
 * Phase 6.2 — what a crashing page does to the rest of the app.
 *
 * The root boundary's answer was "unmounts it", and the only way out was a
 * document reload. This proves the new one: the shell survives, the sidebar is
 * still there, and the user navigates away rather than reloading.
 *
 * The crash is induced by answering one endpoint with a shape the page cannot
 * read — which is not a contrived failure, it is exactly how the three
 * baselined error screens described in harness.ts came about.
 */
test.describe("a page that crashes", () => {
  test("does not take the app with it", async ({ appPage }) => {
    /*
     * `/tracker/reports/` is read as an object of report sections; an array
     * makes the page throw while rendering one of them.
     *
     * Not the first thing I tried. `/tracker/my-queue/` no longer crashes on a
     * bad shape, because its Phase 3.1 conversion reads `data?.invoices ?? []`
     * — the query layer made it resilient by accident. Worth recording: the
     * page a crash test targets has to be one that still crashes.
     */
    await appPage.route(/\/tracker\/reports\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([]),
      }),
    );

    // NOT `gotoStable` — it throws on the boundary, which is the point of it.
    await appPage.goto("/Tracker_Reports");

    await expect(appPage.getByRole("alert")).toContainText("Something went wrong");
    await expect(appPage.getByRole("alert")).toContainText("Tracker Reports");

    // The shell is still mounted: this is the whole difference.
    const dashboard = appPage.getByRole("link", { name: "Dashboard", exact: true });
    await expect(dashboard).toBeVisible();

    // And navigating away clears it, because the boundary is keyed on the path.
    await dashboard.click();
    await settle(appPage);
    await expect(appPage.getByRole("alert")).toHaveCount(0);
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────
 * Phase 3.1 — the pages converted to TanStack Query
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Every test below asserts the DATA is on screen before anything is
 * photographed. That is not ceremony. Five times now a baseline in this suite
 * has turned out to be a picture of an empty table — most recently /UI_Labels,
 * whose endpoint had no fixture at all — and each time the screenshot was
 * stable, green and completely worthless. A conversion that drops the fetch
 * entirely would still produce a matching image of "no rows".
 *
 * `/Drafts` and `/Add_Scheme` are the two new route baselines; both needed a
 * fixture before they were worth taking. `/Einvoice`'s Logs tab needed one
 * badly enough that it could not be opened at all — the `/einvoice/` catch-all
 * has no `totals` key and `GenLogs` reads `data.totals.SUCCESS` unguarded, so
 * clicking the tab threw. Nothing caught that, because "Invoices" is the
 * default tab and no test had ever clicked "Logs".
 */
test.describe("phase 3.1 conversions", () => {
  test("Drafts lists the current user's draft orders", async ({ appPage }) => {
    await gotoStable(appPage, "/Drafts");

    // The header count reads `drafts.length`. It is the one string that tells
    // "one draft" apart from "no drafts" and from "the fetch failed" — three
    // states this page used to render as the same reassuring empty box.
    await expect(appPage.getByText("Total: 1")).toBeVisible();
    await expect(appPage.getByRole("cell", { name: "SO-202606" })).toBeVisible();
    // Drafts is the ONLY status this page may show. Six orders come back from
    // `/orders/ordersbyuser/`; `getDrafts` keeps the one whose status_display
    // is "draft", and a conversion that lost the filter would show all six.
    await expect(appPage.getByRole("row")).toHaveCount(2); // header + one draft
  });

  test("Add_Scheme lists the managed schemes", async ({ appPage }) => {
    await gotoStable(appPage, "/Add_Scheme");

    // `(2)` is blanked while loading and reads `(0)` when the list is empty,
    // so this single assertion separates loaded / loading / empty.
    await expect(appPage.getByText("(2)", { exact: true })).toBeVisible();
    await expect(appPage.getByRole("cell", { name: "Canola Carton Offer" })).toBeVisible();
    await expect(
      appPage.getByRole("cell", { name: "Mustard Monsoon Offer (closed)" }),
    ).toHaveCount(0);

    await expect(appPage).toHaveScreenshot("add-scheme-loaded.png", { fullPage: true });
  });

  test("Add_Scheme's deactivated filter is a query key, not a no-op", async ({ appPage }) => {
    await gotoStable(appPage, "/Add_Scheme");
    await expect(appPage.getByText("(2)", { exact: true })).toBeVisible();

    /*
     * `include_inactive` is a server-side filter, and it stopped being a
     * `useCallback` dependency and became part of the query key. The fixture
     * answers differently for the two URLs, so the count moving 2 -> 3 is the
     * assertion that the key is actually reaching the network — a conversion
     * that dropped the flag from the key would keep serving the cached
     * two-row result and this would stay at (2).
     */
    await appPage.getByLabel("Show deactivated").check();
    await settle(appPage);

    await expect(appPage.getByText("(3)", { exact: true })).toBeVisible();
    // Drawn differently from an active row — struck through, with a "Turn on"
    // action instead of "Turn off".
    await expect(
      appPage.getByRole("cell", { name: "Mustard Monsoon Offer (closed)" }),
    ).toBeVisible();

    await expect(appPage).toHaveScreenshot("add-scheme-with-deactivated.png", { fullPage: true });
  });

  test("the e-invoice Logs tab", async ({ appPage }) => {
    await gotoStable(appPage, "/Einvoice");
    await appPage.getByRole("button", { name: "Logs", exact: true }).click();
    await settle(appPage);

    // The three totals come off `data.totals`, the envelope that the
    // `/einvoice/` catch-all does not have. Before the fixture below them
    // existed, this click threw rather than rendering an empty tab.
    await expect(appPage.getByText("1 success")).toBeVisible();
    await expect(appPage.getByText("1 failed")).toBeVisible();
    await expect(appPage.getByText("1 skipped")).toBeVisible();

    /*
     * Retry renders on `outcome !== "SUCCESS" && !log.irn`, so the FAILED and
     * the SKIPPED row each get one and the SUCCESS row does not. Two of three
     * is what proves the per-row gate — a count of three would mean the
     * outcome check had stopped working, and a count of one would mean the
     * SKIPPED row had stopped rendering at all.
     */
    await expect(appPage.getByRole("button", { name: "Retry" })).toHaveCount(2);
    // Only the FAILED row carries `validation_errors`, so only it expands.
    await expect(appPage.getByRole("button", { name: "Details" })).toHaveCount(1);

    await expect(appPage).toHaveScreenshot("einvoice-logs.png", { fullPage: true });
  });

  test("the Sap Sync Status tab counts its records", async ({ appPage }) => {
    await gotoStable(appPage, "/Sap_Sync");

    /*
     * The four KPI counts now come from the shared ["sap", …] queries rather
     * than from four hand-rolled fetch effects. The old code assigned
     * `response.data` straight into state with no `Array.isArray` guard, so a
     * non-array body left `.length` undefined and the footer total read "NaN"
     * — a failure mode a screenshot of "0" would not have distinguished from
     * an empty SAP table. Assert a real number is there.
     */
    await expect(appPage.getByText("records held locally across 4 modules")).toBeVisible();
    await expect(appPage.locator(".st-kpi-value").first()).not.toHaveText("0");
    await expect(appPage.locator(".st-load-error")).toHaveCount(0);
  });
});

/*
 * Batch 2 — the pages that share the ["users"] key.
 *
 * Party_Assignment is the one that needed covering. Its third fetch,
 * `/auth/users/<id>/parties/`, had no fixture and was being answered by the
 * `/parties/` catch-all — a bare array with no `parties` key — so
 * `res.data?.parties || []` came back empty and every checkbox rendered
 * unchecked. Nothing failed, because the route baseline never selects a user.
 *
 * `selectedParties` is the hardest state in this batch: the server seeds it and
 * then the user edits it before saving. It therefore stays `useState` rather
 * than becoming query data, and it must never be re-seeded from an effect on
 * the query — a background refetch would throw away unsaved edits. This test is
 * what proves the seed still happens at all.
 */
test.describe("phase 3.1 batch 2", () => {
  test("Party_Assignment seeds the checkboxes from the user's assignments", async ({
    appPage,
  }) => {
    await gotoStable(appPage, "/Party_Assignment");

    // Ravi Menon deliberately: USER_ROWS[2] has no category, and
    // `isPartyInUserCategory` returns true for everything when the user's
    // category is blank. So all three parties are listed and the fixture's two
    // are assigned — which is the only combination that can show a checked box
    // AND an unchecked one on the same screen.
    await appPage.getByPlaceholder("Type name to search...").click();
    // The dropdown itself is never in the seeded screenshot below — it closes
    // the moment a name is clicked — so it gets its own baseline here. This is
    // the only pixel proof the user-search dropdown's markup has, covering the
    // Phase 6.3 conversion of Party_Assignment.tsx:513-559.
    await expect(appPage).toHaveScreenshot("party-assignment-dropdown.png", { fullPage: true });

    await appPage.getByText("Ravi Menon", { exact: true }).click();
    await settle(appPage);

    // Same reasoning for the "Assigned Parties" panel (lines 563-727): it is
    // replaced by the assign-new-parties screen before the seeded screenshot,
    // so without this it would never be pixel-checked at all.
    await expect(appPage).toHaveScreenshot("party-assignment-assigned.png", { fullPage: true });

    await appPage.getByRole("button", { name: "+ Assign New Parties" }).click();
    await settle(appPage);

    const boxFor = (name: string) =>
      appPage.locator("label").filter({ hasText: name }).getByRole("checkbox");

    // Assigned by the fixture — seeded from the server.
    await expect(boxFor("Northern Traders")).toBeChecked();
    // Exists in the SAP party list but is NOT assigned. Without this the test
    // could not tell a correct seed from a select-all stuck on.
    await expect(boxFor("Southern Supply Co")).not.toBeChecked();
    // Which is exactly what the header counts, so it fails loudly either way.
    await expect(appPage.getByText("Select All (1/2)")).toBeVisible();

    await expect(appPage).toHaveScreenshot("party-assignment-seeded.png", { fullPage: true });
  });

  /*
   * `/Distributor` is not converted yet — it is Batch 5 — but its baseline
   * changed here, because the `/auth/users/<id>/parties/` fixture this batch
   * added is the first link in its chain.
   *
   * That baseline was previously a photograph of the "No party is assigned to
   * your account. Please contact an administrator." banner: stable, green, and
   * a picture of a failure. This asserts the whole chain now resolves — party,
   * then that party's MART products — BEFORE the new image is accepted, so the
   * replacement is not just a different-looking failure.
   */
  test("Distributor resolves its party and that party's products", async ({ appPage }) => {
    await gotoStable(appPage, "/Distributor");

    await expect(
      appPage.getByText("No party is assigned to your account", { exact: false }),
    ).toHaveCount(0);
    await expect(
      appPage.getByText("No MART products are assigned", { exact: false }),
    ).toHaveCount(0);

    // The party came from `/auth/users/<id>/parties/`...
    await expect(appPage.getByText("Northern Traders")).toBeVisible();
    // ...and the product from `/orders/party-products/<code>/`, filtered to the
    // page's hard-coded MART category. Two endpoints, two assertions, because
    // this page fails at either link independently. The catalogue lives behind
    // a searchable select, so it has to be opened before it can be asserted —
    // which is precisely why the empty catalogue went unnoticed for so long.
    await appPage.getByPlaceholder("Search product…").click();
    await expect(appPage.getByText("JIVO CHAKKI ATTA 5 KG")).toBeVisible();
  });
});

/*
 * Scheme_Manager's list, which had no fixture that matched.
 *
 * `scheme-manager.png` has been a route baseline for a while, and it was a
 * picture of an EMPTY scheme table the whole time: the file already carried
 * `[/\/orders\/schemes\//, []]`, which reads as coverage but never matches
 * `schemeService.list`'s actual `/orders/v2/schemes/`. The page's reference
 * data (states, parties, products) did load, so it looked convincingly alive.
 */
test.describe("phase 3.1 scheme manager", () => {
  test("Scheme_Manager lists the schemes it fetched", async ({ appPage }) => {
    await gotoStable(appPage, "/Scheme_Manager");

    await expect(appPage.getByText("Canola Carton Offer")).toBeVisible();
    // The turned-off row is drawn differently, so a fixture of only active
    // schemes would leave half the row states undrawn.
    await expect(appPage.getByText("Olive Monsoon Offer (turned off)")).toBeVisible();

    // The benefit line, which is rendered from the scheme's nested `benefits`
    // and `triggers` arrays rather than the top-level row — so it fails if the
    // envelope is unwrapped one level wrong, which a name-only check would miss.
    //
    // It also asserts the item shows a product NAME, not its code: `itemNameOf`
    // resolves against the shared ["sap","products"] catalogue, which this page
    // filters with `isFinishedGood` (Scheme_Manager.tsx:41). Until the fixture
    // codes were FG-prefixed, that filter emptied the catalogue here and this
    // line read "buy 10 boxes of FG0000011".
    await expect(appPage.getByText(/buy 10 boxes of Jivo Canola Oil 1 L/)).toBeVisible();

    // The inactive row's benefit, resolved the same way, so both halves of the
    // nested shape and both scheme states are covered.
    await expect(
      appPage.getByText(/of Jivo Olive Oil 5 L free for every 24, up to 10/),
    ).toBeVisible();
  });
});

/*
 * Phase 3.1 — the approve/reject WRITE, which nothing covered.
 *
 * `billing-orders.png` and `auditor-orders.png` are route baselines, so the
 * queue lists were watched; the two-step review modal and the API call behind
 * it were not. Converting `submitReview` from a hand-rolled async function to
 * `useMutation` changes exactly that path, so it gets a test that follows it to
 * the request body and back to the success dialog.
 *
 * The POST is answered here rather than in `fixtures.ts` because the test needs
 * the body: `status: 10` is what "billing approved" means to the backend, and a
 * conversion that sent the wrong code would still show a success dialog.
 */
test.describe("phase 3.1 approval writes", () => {
  test("Billing_Order approves through the mutation", async ({ appPage }) => {
    const posted: Array<{ url: string; body: unknown }> = [];
    // Registered after the harness's `**/api/**` route, so it wins.
    await appPage.route(/\/orders\/\d+\/update-status\//, async (route) => {
      posted.push({ url: route.request().url(), body: route.request().postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ message: "Order accepted successfully", status: "COMPLETED" }),
      });
    });

    await gotoStable(appPage, "/Billing_orders");

    await appPage.getByRole("button", { name: "Approve" }).first().click();
    // Step 1 is a review, step 2 a confirmation. The mutation fires on neither
    // of the first two clicks — that separation is the point of the flow.
    await appPage.getByRole("button", { name: "Continue" }).click();
    expect(posted).toHaveLength(0);

    await appPage.getByRole("button", { name: "Yes, Approve" }).click();

    // The success dialog is rendered from the RESPONSE, so it proves the
    // mutation's `onSuccess` ran with the body the server sent — not merely
    // that a request went out.
    await expect(appPage.getByText("Order Completed")).toBeVisible();
    await expect(appPage.getByText("Order accepted successfully")).toBeVisible();

    expect(posted).toHaveLength(1);
    expect(posted[0].body).toEqual({ status: 10 });
  });

  test("Auditor_Order approves through SAP first, then the status", async ({ appPage }) => {
    const calls: string[] = [];
    const statusBodies: unknown[] = [];
    await appPage.route(/\/sap\/approve-sales-order\//, async (route) => {
      calls.push("sap");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ data: { DocNum: 5150 } }),
      });
    });
    await appPage.route(/\/orders\/\d+\/update-status\//, async (route) => {
      calls.push("status");
      statusBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ message: "Order completed successfully", status: "COMPLETED" }),
      });
    });

    await gotoStable(appPage, "/Auditor_orders");

    await appPage.getByRole("button", { name: "Approve" }).first().click();
    await appPage.getByRole("button", { name: "Continue" }).click();
    await appPage.getByRole("button", { name: "Yes, Approve" }).click();

    // The quotation number comes off the SAP response, so it can only appear if
    // both awaits inside the single mutation ran, in this order.
    await expect(appPage.getByText("5150")).toBeVisible();
    expect(calls).toEqual(["sap", "status"]);
    // 9, not Billing's 10 or the rate approver's 6. The status code is the only
    // thing distinguishing these three otherwise near-identical writes.
    expect(statusBodies).toEqual([{ status: 9 }]);
  });

  test("Rate_Approver_Order approves through the mutation", async ({ appPage }) => {
    const posted: unknown[] = [];
    await appPage.route(/\/orders\/\d+\/update-status\//, async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ message: "Order approved successfully", status: "BILLING" }),
      });
    });

    await gotoStable(appPage, "/Rate_Approver_orders");

    await appPage.getByRole("button", { name: "Approve" }).first().click();
    await appPage.getByRole("button", { name: "Continue" }).click();
    await appPage.getByRole("button", { name: "Yes, Approve" }).click();

    await expect(appPage.getByText("Order approved successfully")).toBeVisible();
    // 6, not 10 or 9: each of these three pages moves an order to a DIFFERENT
    // status, and the code is the only thing distinguishing their writes.
    // Approve also sends a default reason, which reject does not.
    expect(posted).toEqual([{ status: 6, reason: "Approved" }]);
  });
});

/*
 * Phase 6.3 — the pages whose markup only exists after a click.
 *
 * `party-product-assignment.png` is a route baseline of a page that is almost
 * entirely a party picker and an Excel-upload card: the assignment grid, the
 * category filter and the rate rows all wait for a party to be chosen. That is
 * 85 inline styles — the densest file in the app, and the one 6.3 touches first
 * — sitting behind one click, invisible to the route baseline.
 */
test.describe("phase 6.3 coverage", () => {
  test("Party_Product_Assignment shows a party's grid", async ({ appPage }) => {
    await gotoStable(appPage, "/Party_Product_Assignment");

    await appPage.getByPlaceholder("Type name or code to search...").click();
    await appPage.getByText("Northern Traders").first().click();
    // Close the picker before the shot: it is an absolutely-positioned panel
    // that covers the top third of the grid, which is the part being watched.
    await appPage.getByRole("heading", { name: "Party Product Assignment" }).click();
    await settle(appPage);

    // The grid is rendered from `/auth/parties/{code}/products/`, which used to
    // land on the `/parties/` catch-all and unwrap to nothing.
    await expect(appPage.getByText("Jivo Canola Oil 1 L").first()).toBeVisible();
    await expect(appPage.getByText("Jivo Beverage 250 ml").first()).toBeVisible();

    await expect(appPage).toHaveScreenshot("party-product-assignment-grid.png", {
      fullPage: true,
    });
  });

  test("Party_Product_Assignment's add-products modal", async ({ appPage }) => {
    await gotoStable(appPage, "/Party_Product_Assignment");

    await appPage.getByPlaceholder("Type name or code to search...").click();
    await appPage.getByText("Northern Traders").first().click();
    await appPage.getByRole("heading", { name: "Party Product Assignment" }).click();
    await appPage.getByRole("button", { name: "+ Add Products" }).click();
    await settle(appPage);

    /*
     * The modal's EMPTY state, not a product list — and that is a fixture gap
     * rather than a bug. `availableProducts` keeps a product only when its
     * category is one of the SELECTED PARTY's categories, and the
     * `/sap/parties/` fixture gives its two rows `Distributor` / `Retail`,
     * while the product categories in this app are OIL / BEVERAGES / MART (the
     * page's own filter chips). No product can match, so the list is empty
     * whatever the party-products fixture says.
     *
     * Fixing it means either a third SAP party with a product category, or
     * changing the two existing ones — which `Party_Assignment` depends on for
     * `isPartyInUserCategory`. Recorded rather than bundled into 6.3. What this
     * shot DOES watch is the modal chrome: header, search field, empty state
     * and footer, which is where most of its inline styles live.
     */
    await expect(appPage.getByText("No products match your search")).toBeVisible();

    // Viewport, not full page: a modal is positioned against the viewport, and
    // a full-page shot of one is mostly the dimmed content behind it.
    await expect(appPage).toHaveScreenshot("party-product-assignment-modal.png");
  });
});

/*
 * The e-invoice tabs that had no screenshot.
 *
 * `/Einvoice` opens on Invoices and `/Ewaybill` on Generate, so those two panels
 * were covered and the other five were not — including `GenerateIrn`, `IrnQr`
 * and `EinvTools`, which carry 15 inline styles between them. A style move on a
 * panel nobody photographs is a change no test can see, which is the one thing
 * 6.3 must not do.
 *
 * Cancel and Lookup are here too. They carry no inline styles, but they are the
 * same three-line cost and the tab list is the natural unit.
 */
test.describe("e-invoice tabs", () => {
  for (const tab of ["Generate", "Cancel", "Lookup", "QR Code", "Tools"]) {
    test(`the ${tab} tab`, async ({ appPage }) => {
      await gotoStable(appPage, "/Einvoice");
      await appPage.getByRole("button", { name: tab, exact: true }).click();
      await settle(appPage);

      const slug = tab.toLowerCase().replace(/[^a-z]+/g, "-");
      await expect(appPage).toHaveScreenshot(`einvoice-${slug}.png`, { fullPage: true });
    });
  }
});

/*
 * The HAIS tabs, for the same reason as the e-invoice ones: `/HAIS` opens on
 * Asset Register and the other six panels had no screenshot at all. Reports,
 * Lookup and the asset history between them carry 31 inline styles.
 */
test.describe("HAIS tabs", () => {
  for (const tab of ["Add Asset", "Lookup", "Asset Type", "Departments", "Storage Type", "Reports"]) {
    test(`the ${tab} tab`, async ({ appPage }) => {
      await gotoStable(appPage, "/HAIS");
      // Scoped to the tab bar: the Asset Register panel carries its own "Add
      // Asset" and "Lookup" buttons, so an unscoped name matches two elements.
      await appPage
        .locator(".nic-tabs")
        .first()
        .getByRole("button", { name: tab, exact: true })
        .click();
      await settle(appPage);

      const slug = tab.toLowerCase().replace(/[^a-z]+/g, "-");
      await expect(appPage).toHaveScreenshot(`hais-${slug}.png`, { fullPage: true });
    });
  }
});

/*
 * Phase 6.3 — an asset actually found, not just the empty Lookup tab.
 *
 * No `/hais/*` endpoint had a fixture at all, so `asset &&` (AssetLookup.tsx)
 * never rendered, and `AssetHistory` — 12 of AssetHistory.tsx's inline
 * styles, including the `dotColor()`→`dotTone()` rename that turned a raw
 * hex colour into a fixed-tone modifier class — had only ever shown "No
 * history recorded yet." across every baseline in the suite.
 */
test.describe("HAIS asset lookup", () => {
  test("a found asset's history timeline, and the handover modal it opens", async ({
    appPage,
  }) => {
    await gotoStable(appPage, "/HAIS");
    await appPage
      .locator(".nic-tabs")
      .first()
      .getByRole("button", { name: "Lookup", exact: true })
      .click();
    await settle(appPage);

    await appPage.getByPlaceholder("Type the Asset ID").fill("HAIS-001");
    await appPage.getByRole("button", { name: "Look up" }).click();
    await settle(appPage);

    // All four `dotTone()` branches are on screen: Assigned (handover),
    // Config Updated (maintenance), Sent for Service (maintenance, plus the
    // `reason` line), Handover (handover, oldest — and the `last` connector).
    await expect(appPage.getByText("Memory 8 GB → 16 GB")).toBeVisible();
    await expect(appPage.getByText("Trackpad not responding")).toBeVisible();
    await expect(appPage).toHaveScreenshot("hais-asset-history.png", { fullPage: true });

    await appPage.getByRole("button", { name: "Handover" }).click();
    await settle(appPage);

    await expect(appPage.getByText("Currently with:")).toBeVisible();
    await expect(appPage).toHaveScreenshot("hais-handover-modal.png");
  });
});

/*
 * Tracker_Queue's two dialogs, before 6.3 touches the file.
 *
 * `tracker-queue.png` covers the table and the action bars; the invoice detail
 * dialog and the payment form are behind a click each, and between them they
 * hold about a third of that file's 55 inline styles.
 */
test.describe("tracker queue dialogs", () => {
  test("the invoice detail dialog", async ({ appPage }) => {
    await gotoStable(appPage, "/Tracker_Queue");
    await appPage.getByRole("button", { name: /View/ }).first().click();
    await settle(appPage);

    // Rendered from a `sections` array of label/value pairs — so an empty
    // dialog would still screenshot as a dialog.
    await expect(appPage.getByText("Created By")).toBeVisible();
    await expect(appPage).toHaveScreenshot("tracker-queue-detail.png");
  });
});
