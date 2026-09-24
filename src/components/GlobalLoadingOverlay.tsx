import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  getInFlightCount,
  subscribeToRequestActivity,
} from "@/lib/requestActivity";

/**
 * The app-wide "we are fetching your data" cover.
 *
 * A scrim over the MAIN CONTENT — not the whole window — whenever any API
 * request is in flight. See `lib/requestActivity.ts` for why the count is
 * gathered in one place rather than wired up at 280 call sites.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CONTENT, AND ONLY THE CONTENT
 * ─────────────────────────────────────────────────────────────────────────
 * The header and the rail stay uncovered and usable, so a slow request never
 * traps anyone on the page they are waiting on — they can still navigate
 * away. What IS covered is the region whose data is stale or absent, which is
 * the thing being reported.
 *
 * It sits at `z-900`: under the dialog layer (z-1000), so a dialog running a
 * mutation stays crisp above the scrim with its own "Applying…" button, and
 * under the rail (z-999) and header (z-1000).
 *
 * Pointer events are NOT passed through. The content under this is dimmed and
 * partly unreadable, and letting clicks land on controls nobody can see is
 * how you get a double submit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HELD BACK, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────
 * Most calls answer in well under `SHOW_AFTER_MS`. A cover that flashes over
 * the page on every keystroke-triggered refetch is worse than none, so
 * nothing appears until a request has been outstanding long enough to be a
 * wait. `PageLoading` makes the same judgement with its delayed fade.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE GEOMETRY IS DIVIDED BY THE ZOOM
 * ─────────────────────────────────────────────────────────────────────────
 * `index.css` scales the UI with `body { zoom }` at >=1920px. A fixed
 * element's box is measured on the unzoomed viewport and then scaled, so a
 * plain `w-full` renders ~12% wider than the screen and hangs off the right
 * edge. Dividing the viewport units by `--app-zoom` (1 wherever the zoom is
 * off) cancels that exactly — the same fix the full-screen overlays listed in
 * `index.css` carry. The offsets themselves (58px header, 220px rail) are
 * plain: they are in the same scaled space as the shell they line up with.
 *
 * Those numbers are `.header`'s height and `.content-area`'s margin in
 * `Sidebar.css`, including the two breakpoints where they change — the rail
 * goes off-canvas at 1024px and the header grows at 768px. This is the one
 * place outside that stylesheet that has to know them, which is why they are
 * named here rather than guessed.
 */

/** How long a request must be outstanding before the cover appears. */
const SHOW_AFTER_MS = 250;

export default function GlobalLoadingOverlay({
  collapsed = false,
}: {
  /** Whether the rail is in its narrow state — it sets where the content starts. */
  collapsed?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cancelPending = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const apply = (count: number) => {
      if (count > 0) {
        // Already counting down, or already showing — either way the cover is
        // on its way and a second request must not restart the clock.
        if (timerRef.current !== null) return;
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setVisible(true);
        }, SHOW_AFTER_MS);
        return;
      }
      cancelPending();
      setVisible(false);
    };

    const unsubscribe = subscribeToRequestActivity(apply);
    // Requests fired before this mounted are still requests.
    apply(getInFlightCount());

    return () => {
      cancelPending();
      unsubscribe();
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      data-slot="global-loading-overlay"
      // `status` + `polite`, like `PageLoading`: data arriving is not an
      // interruption, and should be announced at a natural pause. `aria-busy`
      // is what says the region behind this is not to be read yet.
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "fixed z-[900] flex items-center justify-center",
        // Below the header, full width — the rail is off-canvas at this size.
        "left-0 top-[58px] w-[calc(100vw/var(--app-zoom))]",
        "h-[calc(100svh/var(--app-zoom)-58px)]",
        // The header is 60px on a phone (Sidebar.css).
        "max-[768px]:top-[60px] max-[768px]:h-[calc(100svh/var(--app-zoom)-60px)]",
        // 1025px, not Tailwind's `lg`: the rail returns one pixel above
        // `Sidebar.css`'s `max-width: 1024px`, and `lg` would start it early.
        collapsed
          ? "min-[1025px]:left-[70px] min-[1025px]:w-[calc(100vw/var(--app-zoom)-70px)]"
          : "min-[1025px]:left-[220px] min-[1025px]:w-[calc(100vw/var(--app-zoom)-220px)]",
        // Translucent, so the page stays recognisable underneath — this says
        // "your data is coming", not "something went wrong and the screen is
        // blank". The blur is what stops half-read text competing with it.
        // No entrance animation: the 250ms hold above is what stops it
        // flickering, and once it has earned its place it should be there
        // immediately rather than fading in over a wait already in progress.
        "bg-canvas/75 backdrop-blur-[2px]",
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <span
          // The same ring the approval dialogs spin. Someone who has asked for
          // reduced motion gets a static ring plus the text below it, rather
          // than a frozen shape with no explanation.
          className="size-9 animate-spin rounded-full border-2 border-line border-t-brand motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span className="text-[13px] font-medium text-body">Loading…</span>
      </div>
    </div>
  );
}
