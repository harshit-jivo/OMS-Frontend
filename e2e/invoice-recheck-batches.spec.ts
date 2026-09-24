/**
 * The "Re-check batches & repost" offer in the INVOICE DETAIL dialog.
 *
 * The dialog is where a reviewer actually reads a SAP refusal — the table row
 * shows a truncated status, the dialog shows the message. So the dialog is
 * where the shortcut is acted on, and it was the one place that did not offer
 * it: the reviewer read "batch ... is locked", and the only button in front of
 * them was "Repost to SAP", which sends the identical dead batch numbers back.
 *
 * Both cases are checked, because a button that is always there is the same
 * bug in the other direction: re-allocating batches cannot fix a credit limit,
 * and offering it there would send the reviewer round a loop that never ends.
 */
import { expect, gotoStable, settle, test } from "./harness";
import type { Page } from "@playwright/test";

const BATCH_ERROR =
  "SAP error: 10001133 - Document cannot be added; batch 160426 in row 1 is locked or not accessible";
const OTHER_ERROR = "SAP returned -5002: attachment path not reachable";

/** One ERROR log, carrying whatever refusal the case is about. */
const logWith = (error: string) => [
  {
    id: 1,
    so_number: "1726096764",
    party_name: "ILAHI CO. (BTCPN5063N)",
    total_amount: 363636,
    status: "ERROR",
    error_message: error,
    rejection_reason: "",
    invoice_log: 1,
    created_by: 1,
    created_by_name: "Amit Kumar",
    created_at: "2026-06-01T09:10:00+05:30",
    updated_at: "2026-06-01T11:10:00+05:30",
    branch: "Oil",
    warehouse: "BH-SC",
    invoice_payload: {
      CardCode: "CUSTA000844",
      DocumentLines: [
        { ItemCode: "FG0000386", Quantity: 4000, WarehouseCode: "BH-SC", TaxCode: "IGST@5" },
      ],
    },
    item_names: { FG0000386: "CHAI 250 GMS 40 PCS" },
    sap_doc_num: null,
    sap_doc_entry: null,
    supersedes: null,
    supersedes_so_number: null,
    supersedes_status: null,
    supersedes_rejection_reason: null,
  },
];

/** Serve exactly one invoice log, whatever shape the list endpoint wants. */
const serveLog = async (page: Page, error: string) => {
  await page.route(/\/invoice\/logs\/all\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ data: logWith(error) }),
    });
  });
};

const openDetail = async (page: Page) => {
  await gotoStable(page, "/Invoice_Review");
  // The row opens the dialog through its "View" action, not the cell text.
  await page.getByRole("button", { name: "View" }).first().click();
  await settle(page);
};

test("the batch refusal offers a re-check in the detail dialog", async ({ appPage: page }) => {
  await serveLog(page, BATCH_ERROR);
  await openDetail(page);

  // The reviewer can see the reason...
  await expect(page.getByRole("dialog").getByText(/is locked or not accessible/)).toBeVisible();
  // ...and the button that answers it, not just the one that repeats the post.
  // Scoped to the dialog: the table row behind it carries the same button,
  // and an unscoped match would pass on the row while the dialog stayed bare
  // -- which is exactly the bug being fixed.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /Re-check batches & repost/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Repost to SAP$/ })).toBeVisible();
});

test("a refusal batches cannot fix offers only the plain repost", async ({ appPage: page }) => {
  await serveLog(page, OTHER_ERROR);
  await openDetail(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/attachment path not reachable/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Re-check batches & repost/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^Repost to SAP$/ })).toBeVisible();
});
