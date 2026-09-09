import type { Page } from "@playwright/test";
import { test, expect, gotoStable, settle } from "./harness";

/**
 * The long-list case, which nothing else in this suite covers.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * Invoice Review virtualizes its rows. It did so with `useWindowVirtualizer`,
 * which reads `window.scrollY` — and `window.scrollY` is always 0 in this app,
 * because `index.css` gives `html, body, #root` `height: 100%` and
 * `overflow-x: hidden`, which makes BODY the scrolling box rather than the
 * viewport.
 *
 * So the virtualizer's idea of "where am I in the list" never moved. Measured
 * against 300 rows: scrolled to the very bottom, twenty-eight rows were
 * mounted and row 300 was not in the DOM. Every invoice past the first
 * screenful was unreachable.
 *
 * No shorter fixture can catch that — with the seven invoices the rest of the
 * suite uses, the whole list fits inside the overscan and everything looks
 * fine. Hence 300 here, and hence a spec of its own.
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

test.describe("Invoice Review row virtualization", () => {
  test("mounts only a window of rows, and reaches the last one", async ({ appPage }) => {
    await withManyInvoices(appPage);
    await gotoStable(appPage, "/Invoice_Review");
    await settle(appPage);

    // Still virtualizing: 300 rows must not all be in the DOM, or the
    // optimisation has quietly been removed rather than fixed.
    const mounted = await appPage.locator("tbody tr").count();
    expect(mounted, "should render a window, not all 300 rows").toBeLessThan(60);
    expect(mounted, "should render something").toBeGreaterThan(5);

    await expect(appPage.getByText("SO-90000", { exact: true })).toBeVisible();

    // `document.body`, not `window` — see the note above. Scrolling the thing
    // that does not scroll is exactly the bug this guards.
    await appPage.evaluate(() => {
      document.body.scrollTop = document.body.scrollHeight;
    });
    await appPage.waitForTimeout(500);

    await expect(
      appPage.getByText(LAST, { exact: true }),
      "the last row must mount once its position is scrolled to",
    ).toBeVisible();
  });
});
