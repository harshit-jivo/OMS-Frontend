/**
 * Pagination — arrows at the ends, numbers between them.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY ONE COMPONENT COVERS ALL 19
 * ─────────────────────────────────────────────────────────────────────────
 * The 19 hand-rolled pagers differ in class prefix and in whether the arrows
 * are "Prev" or "← Prev", and in nothing else. Every one is:
 *
 *     <button disabled={page === 1}>Prev</button>
 *     <span>{page} / {totalPages}</span>
 *     <button disabled={page === totalPages}>Next</button>
 *
 * Four of them also show a range ("Showing 1-10 of 47"), which is the `summary`
 * slot rather than a second component.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NUMBERS, NOT JUST A COUNTER
 * ─────────────────────────────────────────────────────────────────────────
 * "Page 1 of 5" between two arrows tells you where you are and gives you one
 * way to move: one step at a time. Reaching page 5 of 5 took four clicks and
 * four repaints of the table under it.
 *
 * The numbers are buttons now, so any page is one click away, and `pageWindow`
 * below keeps the control a CONSTANT width — it never has more than
 * `2 × siblings + 5` slots, so it does not resize as you page through and the
 * arrows do not move under the cursor. The "Page 3 of 7" text is still
 * rendered, screen-reader-only, because it is the thing that gets announced.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT GOES THROUGH `ui/button` NOW, AND THAT WAS A BUG
 * ─────────────────────────────────────────────────────────────────────────
 * The buttons were hand-rolled `<button>`s with a border and no `background`
 * or `appearance` reset. Preflight is not imported, so they kept the UA's grey
 * `buttonface` — and inside a `.tw-page` the `font: revert-layer` rule hands
 * them the UA's font rather than Inter, because nothing set
 * `[font-family:inherit]`. Both are visible in a screenshot once you know to
 * look: "Next" in the wrong typeface on a grey slab. `ui/button` exists
 * precisely so this cannot happen, and this component was not using it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT FIXES BEYOND CONSOLIDATION
 * ─────────────────────────────────────────────────────────────────────────
 *   * **It is a landmark.** `<nav aria-label="Pagination">`, so a screen-reader
 *     user can jump to it. The hand-rolled ones are anonymous divs.
 *   * **The position is announced.** `aria-live="polite"`, so changing page
 *     says "Page 3 of 7" instead of silently repainting. None of the 19 does
 *     this; a keyboard user pressing Prev gets no feedback at all, because
 *     focus stays on a button whose label did not change.
 *   * **The buttons say what they do.** "← Prev" as the accessible name reads
 *     as "left arrow Prev". The arrows are `aria-hidden` decoration and the
 *     name is a plain word; each number is named "Page 4".
 *   * **It cannot go out of range.** `onPageChange` is clamped, so the "next
 *     on the last page" bug that `disabled` alone does not prevent — a caller
 *     computing `totalPages` from a stale count — cannot fire.
 */
import * as React from "react";
import { HiOutlineChevronLeft, HiOutlineChevronRight } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A gap in the run of numbers, drawn as an ellipsis. */
export const PAGE_GAP = "gap" as const;
export type PageSlot = number | typeof PAGE_GAP;

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Which page numbers to draw.
 *
 * Always the first and the last, always the current one and `siblings` either
 * side of it, and an ellipsis wherever that leaves a gap.
 *
 * The slot count is CONSTANT — `2 × siblings + 5` — which is the property
 * worth having: a pager that grows from 5 items to 7 as you leave page 1
 * shifts the Next arrow out from under the cursor mid-click. So when the
 * window sits against an edge it extends inward rather than collapsing.
 *
 * A single hidden page never becomes an ellipsis: "1 … 3 4 5" hides exactly
 * one number behind a symbol that is wider than the number.
 */
export function pageWindow(
  page: number,
  totalPages: number,
  siblings = 1,
): PageSlot[] {
  const pages = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), pages);
  // first + last + current + siblings either side + two gaps
  const maxSlots = siblings * 2 + 5;

  if (pages <= maxSlots) return range(1, pages);

  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, pages);
  // `> 2` / `< pages - 1`: with the neighbour adjacent to the end there is
  // nothing at all to elide.
  const gapLeft = left > 2;
  const gapRight = right < pages - 1;
  const run = 3 + siblings * 2;

  const slots: PageSlot[] =
    !gapLeft && gapRight
      ? [...range(1, run), PAGE_GAP, pages]
      : gapLeft && !gapRight
        ? [1, PAGE_GAP, ...range(pages - run + 1, pages)]
        : [1, PAGE_GAP, ...range(left, right), PAGE_GAP, pages];

  return unelideSinglePages(slots);
}

/**
 * Replace any ellipsis that stands for exactly ONE page with that page.
 *
 * At page 4 of 20 the run above comes out as `1 … 3 4 5 … 20`, and the left
 * ellipsis is hiding nothing but page 2 — a symbol wider than the number it
 * replaces, costing a click to reach a page that would have fitted. Swapping
 * it for `2` keeps the slot count identical, so the constant-width property
 * above still holds.
 *
 * Done as a pass over the finished run rather than as more branches in it:
 * the same fix is needed at both ends and for any `siblings`, and a test that
 * walks every page of a 20-page list is what found it.
 */
function unelideSinglePages(slots: PageSlot[]): PageSlot[] {
  return slots.map((slot, index) => {
    if (slot !== PAGE_GAP) return slot;
    const before = slots[index - 1];
    const after = slots[index + 1];
    if (typeof before !== "number" || typeof after !== "number") return slot;
    return after - before === 2 ? before + 1 : slot;
  });
}

export type PaginationProps = {
  /** 1-based. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional left-hand text, e.g. "Showing 1-10 of 47". */
  summary?: React.ReactNode;
  /** What the announcement reads. Defaults to `Page {page} of {totalPages}`. */
  label?: string;
  /** Pages shown either side of the current one. */
  siblings?: number;
  className?: string;
};

export function Pagination({
  page,
  totalPages,
  onPageChange,
  summary,
  label,
  siblings = 1,
  className,
}: PaginationProps) {
  const pages = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), pages);
  const go = (next: number) => {
    const clamped = Math.min(Math.max(1, next), pages);
    if (clamped !== current) onPageChange(clamped);
  };

  const slots = pageWindow(current, pages, siblings);

  return (
    <nav
      data-slot="pagination"
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-line px-5 py-3",
        summary ? "justify-between" : "justify-end",
        // The pager is chrome, so it runs at the chrome height like the filter
        // bar and the page header. See `--spacing-control-xs`.
        "[&_[data-slot=button]]:h-control-xs [&_[data-slot=button]]:min-w-control-xs",
        "[&_[data-slot=button]]:px-1.5",
        className,
      )}
    >
      {summary ? (
        <span data-slot="pagination-summary" className="text-[12px] text-subtle">
          {summary}
        </span>
      ) : null}

      <div className="flex items-center gap-1">
        {/*
          The announcement, and the only place the position is stated in words.
          `sr-only` rather than removed: the numbers say where you are visually,
          but a screen-reader user who presses Next keeps focus on a button
          whose own label has not changed, so without this nothing is said at
          all. `aria-current` on the active number is not enough — it is a
          property of an element the user is not on.
        */}
        <span
          data-slot="pagination-position"
          aria-live="polite"
          className="sr-only"
        >
          {label ?? `Page ${current} of ${pages}`}
        </span>

        <Button
          variant="ghost"
          onClick={() => go(current - 1)}
          disabled={current <= 1}
          aria-label="Prev"
        >
          <HiOutlineChevronLeft aria-hidden="true" />
        </Button>

        {slots.map((slot, index) =>
          slot === PAGE_GAP ? (
            <span
              key={`gap-${index}`}
              aria-hidden="true"
              data-slot="pagination-gap"
              className="px-1 text-[12px] text-subtle"
            >
              …
            </span>
          ) : (
            <Button
              key={slot}
              // Filled for the page you are ON — the same rule the navigation
              // rail follows, so "where am I" is answered the same way
              // everywhere in the app.
              variant={slot === current ? "primary" : "ghost"}
              onClick={() => go(slot)}
              aria-label={`Page ${slot}`}
              aria-current={slot === current ? "page" : undefined}
              className="text-[12px] font-semibold tabular-nums"
            >
              {slot}
            </Button>
          ),
        )}

        <Button
          variant="ghost"
          onClick={() => go(current + 1)}
          disabled={current >= pages}
          aria-label="Next"
        >
          <HiOutlineChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
