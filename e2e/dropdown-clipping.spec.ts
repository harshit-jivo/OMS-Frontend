/**
 * The dropdown panel must be visible, and must line up with its trigger.
 *
 * Two bugs, both invisible to jsdom because neither has a layout engine:
 *
 *   1. `.shimmer-hover` set `overflow: hidden`, and `ui/page`'s Card wears it
 *      on every instance — so every card in the app clipped any panel opened
 *      inside it. A picker near the bottom of a card had no visible list.
 *   2. A call site's `className` landed on the TRIGGER while the panel sized
 *      itself from the ROOT, so `max-w-[420px]` gave a 420px button a panel as
 *      wide as the whole card.
 *
 * Both are geometry, so this measures geometry: the panel's box against the
 * trigger's box and against the card that contains it.
 */
import { expect } from "@playwright/test";

import { gotoStable, settle, test } from "./harness";

test.describe("dropdown panels", () => {
  test("open fully inside the card, aligned to their trigger", async ({ appPage: page }) => {
    await gotoStable(page, "/Party_Assignment");
    await settle(page);

    // Named by its LABEL, not its placeholder — DESIGN_SYSTEM §5a. The
    // Field's <label for> supplies the accessible name.
    const trigger = page.getByRole("button", { name: "User" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // The search box only exists once the panel is open.
    const search = page.getByRole("searchbox", { name: /Name or role/ });
    await expect(search).toBeVisible();

    const triggerBox = (await trigger.boundingBox())!;
    const searchBox = (await search.boundingBox())!;

    // ---- (2) the panel tracks the trigger, not the card ------------------
    // Left edges align, and the panel is no wider than the control it hangs
    // from. Before the fix the panel started at the card's left edge and ran
    // the full width of it.
    expect(Math.abs(searchBox.x - triggerBox.x)).toBeLessThan(12);
    expect(searchBox.width).toBeLessThanOrEqual(triggerBox.width + 4);

    // ---- (1) nothing clips it -------------------------------------------
    // Measured, not assumed: walk up from the panel and assert no ancestor
    // both clips overflow and cuts the panel short.
    const clipped = await search.evaluate(() => {
      // The panel is PORTALLED now — out of the trigger's root, so that no
      // scrolling ancestor can clip it. Found by its slot, not by walking up.
      const panel = document.querySelector("[data-slot='dropdown-panel']") as HTMLElement | null;
      if (!panel) return "no panel found";
      const box = panel.getBoundingClientRect();
      if (box.height < 8) return "panel has no height";

      for (let el = panel.parentElement; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        const clips = /hidden|clip|auto|scroll/.test(style.overflowY + style.overflowX);
        if (!clips) continue;
        const host = el.getBoundingClientRect();
        // A clipping ancestor is only a problem if the panel escapes it.
        if (box.bottom > host.bottom + 1 || box.right > host.right + 1) {
          return (
            "clipped by " +
            el.tagName.toLowerCase() +
            "." +
            String(el.className).split(" ").slice(0, 3).join(".")
          );
        }
      }
      return "ok";
    });
    expect(clipped).toBe("ok");

    // The panel is portalled OUT of `.tw-page`, where `index.css`'s unlayered
    // `input, select, button { font: inherit }` reaches it and renders every
    // control at the 18px root size. Measured at exactly that before the panel
    // carried `tw-page`; this is the assertion that keeps it.
    await expect(search).toHaveCSS("font-size", "12.5px");
  });

  test("a card does not clip, so the shimmer cannot come back", async ({ appPage: page }) => {
    await gotoStable(page, "/Party_Assignment");
    await settle(page);

    // Every Card carries `shimmer-hover`; none of them may clip because of it.
    const clippingCards = await page.evaluate(() =>
      [...document.querySelectorAll("[data-slot='card']")].filter((el) => {
        const style = getComputedStyle(el);
        // `overflow-hidden` passed deliberately by a call site is fine — those
        // carry the utility class. This looks for cards clipping WITHOUT it.
        return (
          style.overflow === "hidden" && !String(el.className).includes("overflow-hidden")
        );
      }).length,
    );
    expect(clippingCards).toBe(0);
  });

  /**
   * The hover state, which the harness cannot see by default.
   *
   * `.card-hover:hover` used to lift the card with `transform:
   * translateY(-2px)`. A transform creates a STACKING CONTEXT, and `Card`
   * carries `card-hover` on every instance — so hovering a card with an open
   * dropdown trapped the panel's `z-30` inside it and the NEXT card painted
   * over the panel. Moving the mouse in and out toggled it, which is what
   * "flickering behind the container below" was.
   *
   * `reducedMotion: "no-preference"` is essential: the suite runs with
   * `reduce`, and the reduced-motion block cancels the very transform under
   * test. With the default setting this test passes against the bug — see
   * DESIGN_SYSTEM §8.
   */
  test("stays above the next card while its own card is hovered", async ({
    appPage: page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await gotoStable(page, "/Party_Product_Assignment");
    await settle(page);

    await page.getByRole("button", { name: "Parties" }).click();
    // The panel is a DOM descendant of the card, so pointing at it hovers the
    // card too — there is no way to use this picker without doing so.
    await page.locator("input[type=search]").hover();
    await page.waitForTimeout(400); // the lift transition is 0.2s

    const verdict = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>("[data-slot='dropdown-panel']")!;
      const cards = [...document.querySelectorAll<HTMLElement>("[data-slot='card']")];
      // The panel is portalled to the body, so no card CONTAINS it any more —
      // which is itself most of the fix. Anchor on the card holding the
      // trigger instead.
      const trigger = document.querySelector<HTMLElement>("[data-dropdown-trigger]")!;
      const host = cards.find((c) => c.contains(trigger));
      if (!host) return "no card around the trigger — test is not exercising anything";
      const next = cards[cards.indexOf(host) + 1];
      if (!next) return "no card below the picker — test is not exercising anything";

      if (getComputedStyle(host).transform !== "none") {
        return "the hovered card has a transform, which creates a stacking context";
      }

      const pb = panel.getBoundingClientRect();
      const nb = next.getBoundingClientRect();
      if (pb.bottom <= nb.top) return "panel does not reach the next card — test is vacuous";

      const el = document.elementFromPoint(pb.left + 40, Math.min(pb.bottom - 6, nb.top + 12));
      return panel.contains(el) ? "ok" : "the next card paints over the panel";
    });
    expect(verdict).toBe("ok");
  });
});

/**
 * The panel must track its trigger on a BIG monitor, after scrolling.
 *
 * Two things conspire here and neither shows up on a laptop-sized viewport,
 * which is how both shipped:
 *
 *   1. `index.css` scales the whole UI on large screens — `body { zoom: 1.12 }`
 *      at 1920px, 1.25 at 2560, 1.4 at 3200. `getBoundingClientRect` reports
 *      post-zoom pixels while CSS `left`/`width` on a descendant of the zoomed
 *      body are pre-zoom, so a panel placed from measured values came out
 *      exactly 1.12× too wide and too far right.
 *   2. `body` is the scroll container (`overflow: hidden auto`), so
 *      `window.scrollY` is always 0 and document-coordinate maths drifted by
 *      the scroll offset.
 *
 * Both are geometry under conditions the default viewport does not reproduce,
 * so this test sets the viewport and scrolls before it measures.
 */
for (const width of [1920, 1440]) {
  test(`panel tracks its trigger at ${width}px, scrolled`, async ({ appPage: page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoStable(page, "/Bulk_Product_Assignment");
    await settle(page);

    await page.evaluate(() => {
      document.body.scrollTop = 200;
    });
    await page.getByRole("button", { name: "Products" }).click();
    await expect(page.locator("[data-slot='dropdown-panel']")).toBeVisible();

    const offsets = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>("[data-slot='dropdown-panel']")!;
      const root = document.querySelector<HTMLElement>("[data-dropdown-root]")!;
      const pb = panel.getBoundingClientRect();
      const rb = root.getBoundingClientRect();
      return { dx: pb.x - rb.x, dWidth: pb.width - rb.width, gap: pb.y - rb.bottom };
    });

    expect(Math.abs(offsets.dx)).toBeLessThan(2);
    expect(Math.abs(offsets.dWidth)).toBeLessThan(2);
    // Sits just under the trigger, not adrift from it.
    expect(offsets.gap).toBeGreaterThan(0);
    expect(offsets.gap).toBeLessThan(12);
  });
}
