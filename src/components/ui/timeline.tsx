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
 * The connecting line belongs to each item rather than being one absolutely
 * positioned element on the `<ol>`. That is what makes a separator work: a
 * single tall rail would run straight through the "Version 2 of 3" row, and
 * the old CSS solved it by painting a background chip over the line — which
 * only looks right while the background behind it is the exact colour the
 * chip is. Per-item rails simply stop and restart.
 *
 * It is its own element rather than a `border-l` on the `li`, because a border
 * spans the item's FULL height — including the few pixels above the dot. On
 * every item but the first that stub is invisible, since the rail above joins
 * it. On the first item it is a line hanging off the top of the origin, which
 * reads as history that is not there. The rail therefore starts at the dot's
 * centre and the dot, painted after it, covers the join.
 *
 * The last item has no rail, so the line ends at the final dot instead of
 * trailing into the padding below it.
 *
 * `rail` colours the segment BELOW an item, which is what makes the line say
 * something rather than just connect dots: a solid brand rail is ground the
 * document actually covered, a dashed one is a leg it was fast-forwarded past,
 * and a red one is a step backwards. Separate from `tone`, which colours the
 * dot and describes the STOP; this describes the JOURNEY out of it.
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

/**
 * The rail BELOW an item — how the document left this stop, not what the stop
 * was. `covered` is the default for anything already behind the reader.
 */
const RAIL_TONES = {
  /** Nothing asserted: the plain connector. */
  idle: "border-line",
  /** Ground actually covered — a desk saw it and decided. */
  covered: "border-brand",
  /** Fast-forwarded past: dashed, because nobody walked this leg. */
  skipped: "border-dashed border-line-strong",
  /** A step backwards — a return or rejection sending it to an earlier desk. */
  back: "border-bad",
} as const;

export type TimelineRail = keyof typeof RAIL_TONES;

export function TimelineItem({
  tone = "neutral",
  rail = "idle",
  last = false,
  className,
  children,
  ...props
}: React.ComponentProps<"li"> & {
  tone?: BadgeTone;
  /** Colour of the connecting rail below this item. */
  rail?: TimelineRail;
  /** Hides the connecting rail below this item. */
  last?: boolean;
}) {
  return (
    <li
      data-slot="timeline-item"
      className={cn("relative pl-6", last ? "pb-0" : "pb-4", className)}
      {...props}
    >
      {/* Runs from the dot's centre to the bottom of the item. Declared BEFORE
          the dot so the dot paints over the join. */}
      {!last && (
        <span
          aria-hidden="true"
          data-slot="timeline-rail"
          className={cn(
            "absolute bottom-0 left-0 top-2 -translate-x-1/2 border-l",
            RAIL_TONES[rail],
          )}
        />
      )}
      {/* Centred ON the rail: half the dot's width to the left, so the line
          runs through it rather than beside it. */}
      <span
        aria-hidden="true"
        data-slot="timeline-dot"
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
