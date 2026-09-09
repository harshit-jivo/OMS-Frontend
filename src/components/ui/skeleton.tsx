/**
 * Skeleton — the placeholder shown while content loads.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES, AND WHY IT IS NOT PURELY COSMETIC
 * ─────────────────────────────────────────────────────────────────────────
 * Twelve pages render the same block while a table loads:
 *
 *     <div className="order-loading-state">
 *       <span className="order-loading-spinner" />
 *       <span>Loading orders...</span>
 *     </div>
 *
 * That block is about 40px tall. The table that replaces it is several hundred,
 * so every one of those pages jumps the moment the data lands — the filter bar
 * and the header shift up, and anything the user was reaching for moves. A
 * skeleton is laid out to the size of the content it stands in for, so the
 * page settles once instead of twice.
 *
 * The behaviour it adds beyond that:
 *
 *   * **It announces itself.** `role="status"` with `aria-busy`, so a screen
 *     reader is told the region is loading. The spinner is a bare `<span>`
 *     with a CSS animation — invisible to assistive tech, and the "Loading
 *     orders..." text beside it is a static string in a div nobody is pointed
 *     at.
 *   * **It respects `prefers-reduced-motion`.** The shimmer is behind
 *     `motion-safe:`; the spinner animates unconditionally, which is exactly
 *     the kind of thing that setting exists to stop.
 *
 * What it deliberately does NOT do is change any fetching, branching or data.
 * `TableSkeleton` goes where the spinner block went, inside the same
 * `isLoading ? … : …` the page already had.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-surface-strong",
        "motion-safe:animate-[skeleton-pulse_1.6s_ease-in-out_infinite]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A stand-in for a table that has not arrived.
 *
 * `columns` and `rows` default to the shape of the lists these pages actually
 * show — eight columns, ten rows is one page of every paginated table in the
 * app — so a caller that knows no better still gets a placeholder the right
 * size rather than a differently-wrong one.
 */
export function TableSkeleton({
  columns = 8,
  rows = 10,
  label = "Loading",
  className,
}: {
  columns?: number;
  rows?: number;
  /** What a screen reader is told. "Loading orders", "Loading users", … */
  label?: string;
  className?: string;
}) {
  return (
    <div
      data-slot="table-skeleton"
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("w-full", className)}
    >
      <div className="flex gap-4 border-b border-line px-5 py-3.5">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b border-line/60 px-5 py-4">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton
              key={c}
              // The first column is a code or an id and reads shorter than the
              // rest; a grid of identical bars looks like a loading GIF, and
              // a little variation reads as "this is where your data goes".
              className={cn("h-3.5 flex-1", c === 0 && "max-w-[70%]")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
