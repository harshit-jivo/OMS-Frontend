import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Join class names, letting a later Tailwind utility beat an earlier one.
 *
 * `clsx` handles the conditional forms (`{ active: isActive }`, arrays, nulls).
 * `twMerge` then resolves CONFLICTS between Tailwind utilities, which plain
 * concatenation cannot: `"px-2 px-4"` produces two rules of equal specificity,
 * and which one wins depends on the order Tailwind happened to emit them in,
 * not the order they were written. `cn` makes the later one win, which is what
 * every caller assumes.
 *
 * That is the whole reason a component takes a `className` prop at all — a
 * caller must be able to override a default. Without `twMerge` the override
 * silently loses about half the time.
 *
 * It only knows about Tailwind utilities. The app's own class names
 * (`si-btn`, `app-card`) pass through untouched, which is what makes it safe
 * to use while both systems coexist.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT IS EXTENDED, AND THE BUG THAT MADE IT NECESSARY
 * ─────────────────────────────────────────────────────────────────────────
 * `styles/tailwind.css` adds three spacing tokens of its own —
 * `--spacing-control` (40px), `-sm` (36) and `-xs` (32) — so `h-control` is a
 * real utility. tailwind-merge has never heard of it, and its default config
 * only recognises the values it ships with. An unrecognised class is not put
 * in a conflict group, so it is not *replaced* by a later one in that group:
 *
 *     cn("h-control", "h-auto")   ->  "h-control h-auto"
 *
 * Both survive, both are layered utilities of equal specificity, and which
 * wins is decided by the order Tailwind emitted them — `h-control`, as it
 * happens. So `className="h-auto"` on a `ui/button` did nothing, and a list
 * row that should have grown to fit two lines of text stayed locked at 40px
 * and clipped them. Measured, not guessed: `getComputedStyle` returned
 * `height: 40px` with both classes present.
 *
 * This is the same shape of failure as `font-[inherit]` being silently
 * dropped: the class is in the DOM, it matches a real rule, and it does
 * nothing. Teaching the merger about the scale is the fix; a test in
 * `utils.test.ts` pins each one.
 */
const CONTROL_SIZES = ["control", "control-sm", "control-xs"];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      h: [{ h: CONTROL_SIZES }],
      w: [{ w: CONTROL_SIZES }],
      "min-w": [{ "min-w": CONTROL_SIZES }],
      "max-w": [{ "max-w": CONTROL_SIZES }],
      size: [{ size: CONTROL_SIZES }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
