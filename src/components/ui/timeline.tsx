/**
 * Timeline — a vertical list of things that happened, in order.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A PRIMITIVE
 * ─────────────────────────────────────────────────────────────────────────
 * Invoice Review draws this twice — the status history of an invoice, and the
 * JSAP credit-limit approval flow — from two components that had independently
 * hand-rolled `ol.ir-timeline > li.ir-timeline-item > span.ir-timeline-dot`
 * plus a `.ir-dot-<status>` colour class per state. Two callers is the bar for
 * a primitive, and the pair had already drifted: one supports group
 * separators, the other does not.
 *
 * `components/orders/OrderTimelineDialog` draws a third one, older and
 * heavier, coupled to `Order`/`OrderLog`. It is deliberately NOT rebuilt on
 * this yet — it works, it is well covered, and rewriting a shared component
 * belongs in its own change rather than riding along with a module
 * conversion. When it is, this is the shape to move it onto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE RAIL IS DRAWN BY THE ITEMS, NOT BY THE LIST
 * ─────────────────────────────────────────────────────────────────────────
 * The connecting line is a `border-l` on each item rather than one absolutely
 * positioned element on the `<ol>`. That is what makes a separator work: a
 * single tall rail would run straight through the "Version 2 of 3" row, and
 * the old CSS solved it by painting a background chip over the line — which
 * only looks right while the background behind it is the exact colour the
 * chip is. Per-item borders simply stop and restart.
 *
 * The last item's rail is hidden, so the line ends at the final dot instead
 * of trailing into the padding below it.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import type { BadgeTone } from "./badge";

/** Dot colours, keyed by the same tone vocabulary `Badge` uses. */
const DOT_TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-strong ring-line",
  info: "bg-brand ring-brand-soft",
  ok: "bg-ok ring-ok-soft",
  hold: "bg-hold ring-hold-soft",
  bad: "bg-bad ring-bad-soft",
  note: "bg-note ring-note-soft",
};

export function Timeline({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="timeline"
      className={cn("m-0 flex list-none flex-col p-0", className)}
      {...props}
    />
  );
}

export function TimelineItem({
  tone = "neutral",
  last = false,
  className,
  children,
  ...props
}: React.ComponentProps<"li"> & {
  tone?: BadgeTone;
  /** Hides the connecting rail below this item. */
  last?: boolean;
}) {
  return (
    <li
      data-slot="timeline-item"
      className={cn(
        "relative pb-4 pl-6",
        // `border-transparent` rather than dropping the border on the last
        // item: removing it would change the item's left padding by a pixel
        // and shift the final row out of line with the ones above it.
        last ? "border-l border-transparent pb-0" : "border-l border-line",
        className,
      )}
      {...props}
    >
      {/* Centred ON the rail: half the dot's width to the left, so the line
          runs through it rather than beside it. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-1 size-2.5 -translate-x-1/2 rounded-full ring-4",
          DOT_TONES[tone],
        )}
      />
      {children}
    </li>
  );
}

/**
 * A labelled break between groups of items — "Version 2 of 3".
 *
 * Renders as an `li` because it is a child of the `ol`, and a `div` there is
 * invalid and drops out of the list's accessibility tree.
 */
export function TimelineSeparator({ className, children, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="timeline-separator"
      className={cn("relative py-2 pl-6", className)}
      {...props}
    >
      <span className="inline-flex items-center rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
        {children}
      </span>
    </li>
  );
}

/** The first line of an item: what happened, and when. */
export function TimelineHead({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-head"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1",
        "text-[13px] font-semibold text-ink",
        // The timestamp is the one thing here that is reliably secondary.
        "[&_time]:text-[11.5px] [&_time]:font-normal [&_time]:text-subtle",
        className,
      )}
      {...props}
    />
  );
}

/** A line of detail under the head — who did it, why, what failed. */
export function TimelineNote({
  tone = "muted",
  className,
  ...props
}: React.ComponentProps<"p"> & { tone?: "muted" | "bad" }) {
  return (
    <p
      data-slot="timeline-note"
      className={cn(
        "m-0 mt-1 text-[12px] leading-snug",
        tone === "bad" ? "text-danger" : "text-subtle",
        className,
      )}
      {...props}
    />
  );
}
