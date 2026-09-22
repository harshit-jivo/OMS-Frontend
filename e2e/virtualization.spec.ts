import type { Page } from "@playwright/test";
import { test, expect, gotoStable, settle } from "./harness";

/**
 * The long-list case, which nothing else in this suite covers.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * Invoice Review's list can run to thousands. Two things have to stay true of
 * it at that size: the DOM must not hold all of them, and the LAST one must
 * still be reachable. Miss the second and the failure is silent — the screen
 * looks fine and simply never shows you the rest.
 *
 * That is not hypothetical. The list used to virtualize, and for a while the
 * virtualizer and the stylesheet disagreed about what scrolls the page:
 * `index.css` made BODY the scrolling box while the list read
 * `window.scrollY`, which sat at 0. Measured against 300 rows: scrolled to
 * the very bottom, twenty-eight rows were mounted and row 300 was not in the
 * DOM at all.
 *
 * It is paginated now, and the same two properties are what this checks —
 * one page in the DOM, and the last invoice reachable by paging to it. The
 * mechanism changed; what can go wrong did not.
 *
 * No shorter fixture can catch it: with the seven invoices the rest of the
 * suite uses there is one page and nothing to get wrong. Hence 300 here, and
 * hence a spec of its own.
 *
 * It asserts BEHAVIOUR, not pixels: no screenshot, no baseline to re-record.
 */
const ROWS = Array.from({ length: 300 }, (_, i) => ({
  id: i + 1,
  so_number: `SO-9${String(i).padStart(4, "0")}`,
  party_name: `Party ${i}`,
  total_amount: "1000.00",
  status: "PENDING",
  created_at: "2026-06-01T09:10:00+05:30",
  invoice_payload: "{}",
  can_delete: false,
}));

const LAST = "SO-90299";

async function withManyInvoices(page: Page) {
  await page.route(/\/invoice\/logs\/all\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(ROWS),
    });
  });
}

test.describe("Invoice Review long list", () => {
  test("shows one page at a time, and lets you reach the last invoice", async ({ appPage }) => {
    await withManyInvoices(appPage);
    await gotoStable(appPage, "/Invoice_Review");
    await settle(appPage);

    // One page in the DOM, not 300 rows. If pagination is ever removed without
    // something else bounding the list, this is what says so.
    const mounted = await appPage.locator("tbody tr").count();
    expect(mounted, "should render one page, not all 300 rows").toBeLessThan(60);
    expect(mounted, "should render something").toBeGreaterThan(5);

    await expect(appPage.getByText("SO-90000", { exact: true })).toBeVisible();
    // The first page must not already contain the last row, or the rest of
    // this test would pass without pagination working at all.
    await expect(appPage.getByText(LAST, { exact: true })).toHaveCount(0);

    // The pager says how far the list goes, and the last page is one click.
    const pager = appPage.getByRole("navigation", { name: "Pagination" });
    await expect(pager).toBeVisible();
    // The numbers carry an accessible name of "Page N", not bare digits.
    const pages = await pager.getByRole("button").evaluateAll((buttons) =>
      buttons
        .map((button) => Number((button.getAttribute("aria-label") || "").replace(/\D/g, "")))
        .filter((value) => Number.isFinite(value) && value > 0),
    );
    expect(Math.max(...pages), "300 rows at 25 a page is 12 pages").toBe(12);

    await pager.getByRole("button", { name: "Page 12" }).click();
    await appPage.waitForTimeout(400);

    await expect(
      appPage.getByText(LAST, { exact: true }),
      "the last invoice must be reachable by paging to it",
    ).toBeVisible();
  });
});
