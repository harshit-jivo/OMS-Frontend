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
    const clipped = await search.evaluate((node) => {
      const panel = node.closest("div.absolute") as HTMLElement | null;
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
      const search = document.querySelector<HTMLElement>("input[type=search]")!;
      const panel = search.closest("div.absolute") as HTMLElement;
      const cards = [...document.querySelectorAll<HTMLElement>("[data-slot='card']")];
      const host = cards.find((c) => c.contains(panel))!;
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
