/**
 * Where a portalled panel is rendered, and where on screen it sits.
 *
 * Used by the dropdown pickers (`ui/dropdown.tsx`) and by the info popover
 * (`ui/info-popover.tsx`). It lives in its own module rather than being
 * exported from either of them because both are `.tsx`, where
 * `react-hooks`/`react-refresh` expect component-only exports.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT IS NOT JUST `absolute` UNDER THE TRIGGER
 * ─────────────────────────────────────────────────────────────────────────
 * It was, and any ancestor that scrolls clipped it. `DialogBody` is
 * `overflow-y-auto`, so every picker opened inside a dialog had its list cut
 * off at the dialog's edge with the footer painted over the remains. The same
 * happened in any scrolling card, and `Card` wears `.shimmer-hover`, which is
 * `overflow: hidden`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE HOST IS NOT ALWAYS `document.body`
 * ─────────────────────────────────────────────────────────────────────────
 * The obvious portal target is `body`, and inside a Radix dialog it is the
 * wrong one twice over: a modal dialog marks its body siblings `aria-hidden`
 * and clears their pointer events, so the panel would be both invisible to a
 * screen reader and unclickable. Portalling into the dialog's own content
 * keeps the panel inside the focus trap, which is also where it belongs.
 *
 * That host then decides the units. `DialogContent` is
 * `fixed … -translate-x-1/2`, and a transform makes an element the containing
 * block for its positioned descendants — so coordinates inside a dialog are
 * measured from the dialog, while at `body` they are viewport coordinates.
 *
 * Flipping up uses `translateY(-100%)` against the trigger's TOP rather than a
 * measured panel height, so there is no second layout pass and no frame where
 * the panel is drawn in the wrong place.
 */
import * as React from "react";

export type AnchoredPanelOptions = {
  /**
   * `"trigger"` makes the panel exactly as wide as the control it hangs from —
   * right for a picker, whose list is a continuation of its trigger.
   *
   * `"content"` leaves the width to CSS. An info popover hangs off a 28px icon
   * button, and matching that would give it a 28px panel.
   */
  width?: "trigger" | "content";
  /**
   * How tall the panel may get before it scrolls. A picker wants a long list;
   * a popover of a dozen fields wants to be shown whole.
   */
  maxHeight?: number;
  /** Aligns the panel's RIGHT edge to the trigger's. Only for `"content"`. */
  align?: "start" | "end";
};

export type AnchoredPlacement = {
  host: HTMLElement | null;
  style: React.CSSProperties;
};

export function useAnchoredPanel(
  rootRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  options: AnchoredPanelOptions = {},
): AnchoredPlacement {
  const { width = "trigger", maxHeight = 320, align = "start" } = options;
  const [placement, setPlacement] = React.useState<AnchoredPlacement>({
    host: null,
    style: {},
  });

  React.useLayoutEffect(() => {
    if (!open) return;
    let lastSignature = "";

    const measure = () => {
      const root = rootRef.current;
      if (!root) return;

      const host =
        (root.closest('[data-slot="dialog-content"]') as HTMLElement | null) ?? document.body;

      /*
       * `index.css` scales the whole UI on big monitors — `body { zoom: 1.12 }`
       * at 1920px, 1.25 at 2560, 1.4 at 3200 — because the app is built in
       * fixed px and would otherwise look tiny. That file already warns what it
       * does to `position: fixed`: the coordinates are read in the UNZOOMED
       * viewport and then scaled up by the zoom, so a box placed from measured
       * values comes out Z times too big and Z times too far right.
       *
       * `getBoundingClientRect` reports post-zoom screen pixels; CSS
       * `left`/`width` on a descendant of the zoomed body are pre-zoom.
       * Measured on a 1920 viewport, the panel was placed at 287.7/1453.1 and
       * rendered at 322.2/1627.5 — every number exactly ×1.125. It looked fine
       * on a laptop because below 1920px there is no zoom at all, which is why
       * this survived a browser check.
       *
       * Dividing here puts every measurement back into the same CSS-pixel space
       * the style is written in, so the zoom scales it once rather than twice.
       */
      const zoom =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--app-zoom"),
        ) || 1;
      const measured = root.getBoundingClientRect();
      const rect = {
        left: measured.left / zoom,
        right: measured.right / zoom,
        top: measured.top / zoom,
        bottom: measured.bottom / zoom,
        width: measured.width / zoom,
      };

      const spaceBelow = window.innerHeight / zoom - rect.bottom;
      const spaceAbove = rect.top;
      // Only flip when below is genuinely cramped AND above is roomier, so the
      // panel does not jump sides on a small scroll.
      const above = spaceBelow < 180 && spaceAbove > spaceBelow;
      const room = (above ? spaceAbove : spaceBelow) - 12;

      /*
       * At `body`: FIXED, in plain viewport coordinates.
       *
       * It was `absolute` in document coordinates, built as
       * `rect.top + window.scrollY`. That is wrong in this app, and measurably
       * so: the panel drifted from its trigger by exactly the scroll offset.
       * `fixed` removes the arithmetic rather than correcting it — viewport
       * coordinates are what `getBoundingClientRect` already returns. It is
       * only safe because nothing on the path to `body` is transformed —
       * checked in a browser, not assumed.
       *
       * In a dialog the host IS transformed (`-translate-x-1/2`), so there the
       * panel stays `absolute` and is measured against the host's own box.
       */
      const inDialog = host !== document.body;
      // Same space as `rect`: the dialog is inside the zoomed body too.
      const hostMeasured = inDialog ? host.getBoundingClientRect() : null;
      const hostBox = hostMeasured
        ? { left: hostMeasured.left / zoom, top: hostMeasured.top / zoom }
        : null;

      const style: React.CSSProperties = {
        position: inDialog ? "absolute" : "fixed",
        top: (above ? rect.top - 4 : rect.bottom + 4) - (hostBox?.top ?? 0),
        maxHeight: Math.min(maxHeight, Math.max(140, room)),
        transform: above ? "translateY(-100%)" : undefined,
      };

      if (width === "trigger") {
        style.left = rect.left - (hostBox?.left ?? 0);
        style.width = rect.width;
      } else if (align === "end") {
        // Pinned by its right edge, so a panel wider than its icon opens
        // leftward instead of running off the screen.
        style.left = rect.right - (hostBox?.left ?? 0);
        style.transform = [style.transform, "translateX(-100%)"].filter(Boolean).join(" ");
      } else {
        style.left = rect.left - (hostBox?.left ?? 0);
      }

      // Only when something actually moved. Without this guard the frame loop
      // below would setState every frame and re-render the whole picker 60
      // times a second for no change.
      const signature = host.tagName + JSON.stringify(style);
      if (signature === lastSignature) return;
      lastSignature = signature;
      setPlacement({ host, style });
    };

    /*
     * Re-measured every frame while open, not once on open.
     *
     * Measuring once and listening for scroll and resize misses everything
     * else that moves a trigger, and this app moves them: the sidebar settles,
     * a query resolves and reflows the card, the panel itself makes the page
     * taller and summons a scrollbar. Measured in a browser with the page
     * scrolled, the one-shot version put the panel 35px left of its trigger,
     * 174px too wide and 44px below it.
     *
     * A frame loop is what Floating UI's `autoUpdate` falls back to for the
     * same reason, and the signature guard above means a still page does no
     * work beyond two `getBoundingClientRect` calls per frame, only while a
     * panel is actually open.
     */
    let frame = 0;
    const tick = () => {
      measure();
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [open, rootRef, width, maxHeight, align]);

  return placement;
}
