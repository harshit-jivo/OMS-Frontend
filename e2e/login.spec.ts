import { expect, test } from "@playwright/test";

/**
 * The sign-in screen.
 *
 * Two rules that are invisible to a unit test and to a screenshot, because
 * both are about the SHAPE of the page rather than its markup:
 *
 * · it never scrolls the page — it is viewport-locked;
 * · its submit button is reachable anyway, at every size, because the form
 *   column scrolls internally instead.
 *
 * A page that cannot scroll AND clips its own submit button is worse than one
 * that scrolls, so the second assertion is what keeps the first honest.
 */
const SIZES: Array<[number, number]> = [
  [1920, 1080], // wide — index.css applies `zoom: 1.12` here
  [1440, 900],
  [1366, 650], // a laptop with browser chrome eating the height
  [390, 844], // phone
  [360, 480], // the shortest thing worth supporting
];

test.describe("login", () => {
  for (const [width, height] of SIZES) {
    test(`does not scroll the page at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.waitForSelector("form");

      const scrolls = await page.evaluate(
        () => document.documentElement.scrollHeight > window.innerHeight + 1,
      );
      expect(scrolls, "the login page grew past the viewport").toBe(false);

      // ...and the button is still on screen.
      const box = await page.getByRole("button", { name: "Log in" }).boundingBox();
      expect(box, "no submit button").not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    });
  }

  test("shows the brand panel on wide screens and hides it on narrow", async ({ page }) => {
    // The panel is the app's own navigation-rail surface. Below `lg` it would
    // be a tall dark box pushing the form off the fold.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Order Management System" })).toBeVisible();

    await page.setViewportSize({ width: 420, height: 900 });
    await expect(page.getByRole("heading", { name: "Order Management System" })).toBeHidden();
    // The form survives the collapse.
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });
});
