/**
 * The badge primitive — Phase 2.2.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS ONE MATTERS MORE THAN IT LOOKS
 * ─────────────────────────────────────────────────────────────────────────
 * Unlike the table, where the 77 instances were two real designs, the 37 badge
 * variants are ONE design that drifted — pill, 3-5px x 9-11px, 10-11.5px text,
 * weight 600-800. Consolidating the geometry is tidying.
 *
 * The colours are not tidying. The same status word is rendered in different
 * colours on different screens, and in one case in colours that mean opposite
 * things:
 *
 *     billed      GREEN  in View_Orders, Order_Tracking, Billing_Order
 *                 BLUE   in Daily_Report        (.dr-badge-billed, #2563eb)
 *     pending     amber #d97706, brown #a16207, and GREY #64748b
 *     rejected    #991b1b, #dc2626, #b91c1c
 *
 * A person who reads "billed" as green on one screen and blue on the next has
 * to work out whether the difference means anything. It does not, and there was
 * no way to tell. So the tone for a status is decided ONCE, in `statusTone.ts`,
 * and this component only knows how to draw a tone.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COLOUR IS NEVER THE ONLY SIGNAL
 * ─────────────────────────────────────────────────────────────────────────
 * Every badge carries its text label, and the optional `dot` is a CSS shape,
 * not an emoji or a colour-only cue. That rule came from the existing
 * `StatusBadge`, which this replaces, and it is kept deliberately: roughly one
 * man in twelve cannot separate the red and green these badges lean on.
 */
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Geometry from the 15 base badge rules, converged on the median: `padding:
 * 3px 10px`, `border-radius: 999px`, 11px, weight 700.
 *
 * `caps` is a variant rather than baked in because only 4 of those 15 uppercase
 * their text — App_User and Daily_Report do, most do not. Forcing it either way
 * would restyle a majority of pages to make a minority consistent.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 whitespace-nowrap",
    "rounded-full border border-transparent",
    "px-2.5 py-[3px] text-[11px] font-bold leading-[1.6]",
  ],
  {
    variants: {
      tone: {
        neutral: "bg-surface-strong text-subtle",
        info: "bg-brand-soft text-brand",
        ok: "bg-ok-soft text-ok",
        hold: "bg-hold-soft text-hold",
        bad: "bg-bad-soft text-bad",
        note: "bg-note-soft text-note",
      },
      /** Adds the tone's own colour as a visible edge. */
      outlined: { true: "border-current/30", false: "" },
      /** Uppercase + tracking, for the pages whose badges already do that. */
      caps: { true: "uppercase tracking-[0.05em]", false: "" },
    },
    defaultVariants: { tone: "neutral", outlined: false, caps: false },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({
  className,
  tone,
  outlined,
  caps,
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** A small filled circle in the current colour, before the label. */
    dot?: boolean;
  }) {
  return (
    <span
      data-slot="badge"
      data-tone={tone ?? "neutral"}
      className={cn(badgeVariants({ tone, outlined, caps }), className)}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  );
}
