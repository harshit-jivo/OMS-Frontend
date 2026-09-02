/**
 * Pagination — prev / position / next, which is what all 19 of them are.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY ONE COMPONENT COVERS ALL OF THEM
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
 * WHAT IT FIXES BEYOND CONSOLIDATION
 * ─────────────────────────────────────────────────────────────────────────
 *   * **It is a landmark.** `<nav aria-label="Pagination">`, so a screen-reader
 *     user can jump to it. The hand-rolled ones are anonymous divs.
 *   * **The position is announced.** `aria-live="polite"` on the counter, so
 *     changing page says "Page 3 of 7" instead of silently repainting. None of
 *     the 19 does this; a keyboard user pressing Prev gets no feedback at all,
 *     because focus stays on a button whose label did not change.
 *   * **The buttons say what they do.** "← Prev" as the accessible name reads
 *     as "left arrow Prev". The arrows are `aria-hidden` decoration here and
 *     the name is a plain word.
 *   * **It cannot go out of range.** `onPageChange` is clamped, so the "next
 *     on the last page" bug that `disabled` alone does not prevent — a caller
 *     computing `totalPages` from a stale count — cannot fire.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export type PaginationProps = {
  /** 1-based. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional left-hand text, e.g. "Showing 1-10 of 47". */
  summary?: React.ReactNode;
  /** What the counter reads. Defaults to `Page {page} of {totalPages}`. */
  label?: string;
  className?: string;
};

export function Pagination({
  page,
  totalPages,
  onPageChange,
  summary,
  label,
  className,
}: PaginationProps) {
  const pages = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), pages);
  const go = (next: number) => {
    const clamped = Math.min(Math.max(1, next), pages);
    if (clamped !== current) onPageChange(clamped);
  };

  return (
    <nav
      data-slot="pagination"
      aria-label="Pagination"
      className={cn(
        "flex items-center gap-3 border-t border-line px-5 py-4",
        summary ? "justify-between" : "justify-end",
        className,
      )}
    >
      {summary ? (
        <span data-slot="pagination-summary" className="text-[12px] text-subtle">
          {summary}
        </span>
      ) : null}

      <div className="flex items-center gap-3">
        <PaginationButton onClick={() => go(current - 1)} disabled={current <= 1}>
          <span aria-hidden="true">←</span> Prev
        </PaginationButton>

        <span
          data-slot="pagination-position"
          aria-live="polite"
          className="text-[12px] font-semibold tabular-nums text-body"
        >
          {label ?? `Page ${current} of ${pages}`}
        </span>

        <PaginationButton onClick={() => go(current + 1)} disabled={current >= pages}>
          Next <span aria-hidden="true">→</span>
        </PaginationButton>
      </div>
    </nav>
  );
}

function PaginationButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="pagination-button"
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5",
        "text-[12px] font-semibold text-body transition-colors",
        "hover:enabled:border-line-strong hover:enabled:bg-surface",
        "focus-visible:outline-none focus-visible:shadow-focus",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}
