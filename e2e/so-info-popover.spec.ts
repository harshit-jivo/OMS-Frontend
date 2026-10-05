/**
 * The (i) that shows what a sales order says.
 *
 * jsdom already covers which gesture opens the panel. What only a browser can
 * answer is whether it is VISIBLE once open: the panel is portalled precisely
 * because `Card` wears `.shimmer-hover`, which is `overflow: hidden`, and an
 * SO card sits inside a scrolling list. A panel that renders in the DOM and is
 * clipped to nothing passes every unit test and is useless on the screen.
 */
import { expect, gotoStable, settle, test } from "./harness";
import type { Page } from "@playwright/test";

/** Branch gate, then party, then the orders step. */
const openOrdersStep = async (page: Page) => {
  await gotoStable(page, "/Sales_Invoice");
  await page.getByRole("button", { name: /^Oil$/ }).click();
  await settle(page);
  await page.getByRole("button", { name: "Select Party" }).click();
  await page.getByText("Northern Traders").first().click();
  // Picking the party asks what to invoice against before showing the orders.
  await page.getByRole("button", { name: /Sales order.*open sales orders/ }).click();
  await settle(page);
};

test("the SO picker's (i) opens on hover and is not clipped by its card", async ({
  appPage: page,
}) => {
  await openOrdersStep(page);

  const info = page.getByRole("button", { name: /Order details for SO 1726096764/ });
  await expect(info).toBeVisible();

  await info.hover();
  const panel = page.getByRole("dialog", { name: /Order details for SO 1726096764/ });
  await expect(panel).toBeVisible();

  // The facts the biller came for, from the order header.
  await expect(panel.getByText("NORTHERN TRADERS NEW DELHI")).toBeVisible();
  await expect(panel.getByText("KALGIDHAR SOCIETY RAJOURI GARDEN")).toBeVisible();
  await expect(panel.getByText("PO-9912")).toBeVisible();

  /*
   * Not clipped. `toBeVisible` is not enough on its own — an element inside an
   * `overflow: hidden` ancestor still reports visible while being painted at
   * zero width. Measure the box instead, and check it against the card that
   * would do the clipping if the panel were not portalled.
   */
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.width).toBeGreaterThan(200);
  expect(panelBox.height).toBeGreaterThan(80);

  // The row the (i) hangs off. If the panel were not portalled it would be
  // confined to this row's Card, which is `overflow: hidden`.
  const row = page.getByRole("listitem").filter({ hasText: "SO #1726096764" }).first();
  const rowBox = (await row.boundingBox())!;
  expect(panelBox.height).toBeGreaterThan(rowBox.height);

  // And it goes away again.
  await page.mouse.move(0, 0);
  await expect(panel).toBeHidden({ timeout: 3000 });
});

/*
 * At 1920px `index.css` sets `body { zoom: 1.12 }`, and that is the width the
 * panel's placement can go wrong at: `getBoundingClientRect` returns post-zoom
 * pixels while the CSS `left`/`top` written from them are pre-zoom, so an
 * un-divided measurement lands the panel about 12% too far right and too low.
 * Below 1920 there is no zoom at all, which is how that bug survived a browser
 * check once already.
 */
test("the panel tracks its trigger at 1920px, where the app zooms", async ({ appPage: page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openOrdersStep(page);

  const info = page.getByRole("button", { name: /Order details for SO 1726096764/ });
  await info.hover();
  const panel = page.getByRole("dialog", { name: /Order details for SO 1726096764/ });
  await expect(panel).toBeVisible();

  const triggerBox = (await info.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;

  // Directly below the (i), not 12% down the page from it.
  expect(panelBox.y).toBeGreaterThanOrEqual(triggerBox.y);
  expect(panelBox.y - (triggerBox.y + triggerBox.height)).toBeLessThan(24);
  // Right-aligned to the trigger, so a panel wider than a 22px icon opens
  // leftward instead of off the edge of the screen.
  expect(Math.abs(panelBox.x + panelBox.width - (triggerBox.x + triggerBox.width))).toBeLessThan(8);
  expect(panelBox.x).toBeGreaterThan(0);
});

test("the draft page's (i) opens on click and lists every source order", async ({
  appPage: page,
}) => {
  await openOrdersStep(page);

  // Take both orders into the draft, so the panel has a list to draw.
  for (const docNum of ["1726096764", "1726096801"]) {
    await page.getByRole("checkbox", { name: `Select sales order ${docNum}` }).check();
  }
  await page.getByRole("button", { name: "Create draft" }).click();
  await settle(page);

  const info = page.getByRole("button", { name: "Sales order details for this draft" });
  await expect(info).toBeVisible();

  // Hover must NOT open this one — it sits on the path to "Add items".
  await info.hover();
  await expect(
    page.getByRole("dialog", { name: "Sales order details for this draft" }),
  ).toHaveCount(0);

  await info.click();
  const panel = page.getByRole("dialog", { name: "Sales order details for this draft" });
  await expect(panel).toBeVisible();

  await expect(panel.getByText("2 sales orders")).toBeVisible();
  await expect(panel.getByText("SO #1726096764")).toBeVisible();
  await expect(panel.getByText("SO #1726096801")).toBeVisible();
  // The addresses are loaded by this step, so the code gains its city/GSTIN.
  await expect(panel.getByText("New Delhi, DL")).toBeVisible();
  await expect(panel.getByText(/GSTIN 07AABCN1234M1ZQ/)).toBeVisible();

  // Pinned by the click: moving the pointer away leaves it up.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await expect(panel).toBeVisible();

  // An outside click is what closes it.
  await page.mouse.click(5, 5);
  await expect(panel).toBeHidden({ timeout: 3000 });
});
