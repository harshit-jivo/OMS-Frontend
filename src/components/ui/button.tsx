/**
 * The button primitive — Phase 2, minimal theme.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS DID NOT EXIST, AND WHY IT HAS TO NOW
 * ─────────────────────────────────────────────────────────────────────────
 * `ui/` had Table, Badge, Dialog, Pagination, Skeleton, Toast and Tabs — but no
 * Button, so every page invented one. `ofs-refresh`, `ofs-save`, `ofs-primary`,
 * `ofs-secondary`, `lc-btn`, `vo-filter-clear`, `cr-delete` and dozens more are
 * the same four buttons redrawn per stylesheet, and they are a large share of
 * the 37,000 lines of page CSS this migration exists to remove.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PREFLIGHT IS NOT IMPORTED — THE RESET IS THIS COMPONENT'S JOB
 * ─────────────────────────────────────────────────────────────────────────
 * `styles/tailwind.css` deliberately omits Tailwind's preflight, because it
 * would restyle 108 pages at once. One consequence lands squarely here: a bare
 * `<button>` keeps the browser's own background, border, font and centring.
 * Utilities alone do not undo those — `font-family` in particular is NOT
 * inherited by form controls, so a button styled only with `text-sm` renders in
 * the UA's default font next to text in Inter.
 *
 * So the base below resets appearance, border, background, font and cursor
 * explicitly. Anything that skips this component and hand-rolls a `<button>`
 * with utilities will look subtly wrong, and that is the trap worth naming.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE MINIMAL THEME
 * ─────────────────────────────────────────────────────────────────────────
 * Existing `@theme` tokens, no new ones: brand for the single primary action,
 * `line`/`surface` for everything else, `danger` for destructive. What is
 * dropped from the old look is the chrome — gradients, 18px shadows, and the
 * 800-weight shouting. Weight is 500/600 here; a button does not need to be
 * bolder than a heading to be found.
 *
 * One primary action per screen is a convention this cannot enforce, but the
 * variant names make it obvious when a screen has three.
 */
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    // --- reset (see the preflight note above) ---
    "appearance-none border border-transparent bg-transparent",
    // `[font-family:inherit]`, NOT `font-[inherit]`: the latter is ambiguous
    // (family or weight?), so tailwind-merge treats it as conflicting with
    // `font-medium` below and DROPS it — leaving the button in the UA font.
    // A test pins this; it was a real silent failure, not a hypothetical.
    "[font-family:inherit] cursor-pointer",
    // --- geometry ---
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-sm font-medium",
    "transition-colors duration-150",
    // --- states ---
    "focus-visible:outline-none focus-visible:shadow-focus",
    "disabled:cursor-not-allowed disabled:opacity-55",
    // Icons keep their box; text never pushes them out of shape.
    //
    // 14px, not 16px, and the OUTLINE set — matching the navigation rail.
    // A 16px solid glyph beside 13px text is bigger than the words it labels,
    // which is what made a row of four buttons read as a toolbar of tiles.
    "[&_svg]:shrink-0 [&_svg]:size-3.5 [&_svg]:[stroke-width:1.5]",
  ],
  {
    variants: {
      variant: {
        /**
         * The one action a screen is FOR. At most one per view.
         *
         * `bg-brand/90` at rest, full `bg-brand` on hover — so the button
         * lightens rather than darkens when idle, and gains weight under the
         * cursor. Solid #2563eb read as heavy against the pale cards around
         * it; the same hue at 90% sits in the page instead of on top of it,
         * and stays well past the contrast floor on white.
         */
        primary: "bg-brand/90 text-white hover:bg-brand disabled:hover:bg-brand/90",
        /** The default. A bordered surface — legible without competing. */
        secondary:
          "border-line bg-white text-ink hover:bg-surface hover:border-line-strong",
        /** Tertiary: no border until hovered. For toolbars and row actions. */
        ghost: "text-body hover:bg-surface hover:text-ink",
        /**
         * Destructive.
         *
         * Outline at rest, filling only on hover. It was a permanent soft
         * fill, and a filled pink box sitting next to a filled blue one in
         * every page header made a four-button row read as four tiles. A
         * delete button that shouts is a delete button people click to make
         * it stop; the colour is in the text and the hairline, which is
         * enough to find it and not enough to dominate.
         */
        danger:
          "border-danger-line/70 bg-transparent text-danger hover:bg-danger-soft",
        /**
         * Affirmative, and the mirror of `danger`.
         *
         * It exists for the approve/reject PAIR on the three approval queues.
         * Those sit on every row of a table, so neither can be `primary` —
         * "the one action a screen is FOR" cannot be ten things — and an
         * approve rendered `secondary` beside a red reject reads as the
         * lesser of the two, which is backwards for the action most rows get.
         *
         * Outline at rest and filling on hover, exactly like `danger`, so the
         * pair stays symmetric: a column of ten filled buttons is a column
         * nobody reads, and on these pages it competed with the navigation
         * rail's own accent.
         */
        success: "border-ok/25 bg-transparent text-ok hover:bg-ok-soft",
        /**
         * Reads as a link, behaves as a button. For an action that navigates
         * WITHIN a page rather than to a URL — a breadcrumb crumb closing a
         * detail panel, say, where an <a> would reload the page it is on.
         *
         * It exists so that case stops being hand-rolled. A bare <button>
         * styled with utilities keeps the UA's `border: 2px outset` and grey
         * `buttonface` background, because preflight is not imported — which
         * is exactly how the breadcrumb shipped looking like a pressed 1997
         * toolbar button.
         */
        link: "text-subtle underline-offset-4 hover:text-brand hover:underline",
      },
      size: {
        /** Matches `--spacing-control` (40px) — the app's field height, so a
         *  button sits flush with an input beside it. */
        md: "h-control px-4 text-[13px]",
        /** `--spacing-control-sm` (36px), for toolbars and dense tables. */
        sm: "h-control-sm px-3 text-[13px]",
        /**
         * `--spacing-control-xs` (32px) — the CHROME height.
         *
         * For the furniture around the content: page-header actions, filter
         * toolbars. Both of those containers force this size on whatever they
         * are given (see `ui/page` and `ui/filter-bar`), so it rarely needs
         * naming at a call site — it exists so those overrides have a real
         * token to point at rather than a bare `h-8`.
         */
        xs: "h-control-xs px-2.5 text-[12.5px]",
        /** Icon-only. Square, so it cannot drift from the row height. */
        icon: "h-control-sm w-control-sm px-0",
        /**
         * No box at all: sits inline in running text at the surrounding size.
         * `text-[length:inherit]` rather than `text-inherit`, which is a
         * COLOUR utility — the bracket form with an explicit `length:` hint is
         * how Tailwind is told this one is a font-size.
         */
        inline: "h-auto px-0 py-0 text-[length:inherit]",
      },
      /** Fills its container. For a modal footer's confirm on narrow screens. */
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "secondary", size: "md", block: false },
  },
);

export type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;

export function Button({
  className,
  variant,
  size,
  block,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      // `type` defaults to "button", not "submit". The browser default submits
      // the enclosing form, which is the wrong thing for the overwhelming
      // majority of buttons in this app and a bug that only shows up once a
      // button is placed inside a <form>.
      type={type}
      data-slot="button"
      data-variant={variant ?? "secondary"}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
