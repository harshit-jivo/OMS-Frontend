/**
 * Page shell primitives — Phase 2.
 *
 * The layout every screen in this app repeats: a title with its actions, an
 * optional row of numbers, then the content. It was written 108 times.
 * `ofs-header` + `ofs-kicker` + `h1` on one page, `app-page-head` +
 * `app-page-title` on another, `lc-empty-title` on a third — the same object,
 * three names, three sets of geometry.
 *
 * HOW MUCH VISUAL WEIGHT, AND WHY IT CHANGED
 * ------------------------------------------
 * The first version of these was austere: hairline borders, no elevation, a
 * 22px/600 KPI number. Reviewed against EXIM — the sibling JIVO app, same
 * stack — it read as unfinished rather than restrained, so the weight came
 * back deliberately and from a specific source:
 *
 *   * cards sit on `--shadow-card`, so they lift off the canvas;
 *   * a KPI carries a tinted icon chip and a `text-2xl font-bold` number,
 *     which is EXIM's `SummaryCard` shape;
 *   * hover states are real transitions rather than nothing.
 *
 * What is still NOT copied from the old OMS look: gradients, the 18px
 * `--shadow-panel` header slab, and 800-weight headings. And what is not
 * copied from EXIM is its palette — OMS keeps its own blue primary, so a
 * half-migrated app stays coherent instead of reading as two products.
 *
 * `eyebrow` names the module a page belongs to ("Orders", "Legal"). Small and
 * grey rather than uppercase brand-blue.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

/* ── Page frame ──────────────────────────────────────────────────────────── */

/**
 * The outermost wrapper. Replaces the `.xx-page` rule each stylesheet defines,
 * including the `border-radius: 26px 0 0 0` / `min-height: calc(100svh - 64px)`
 * recipe that `UIConsistency.css` asks every page to repeat by hand.
 */
export function Page({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page"
      className={cn(
        /*
         * `tw-page` — THE CONVERTED-PAGE RESET, AND IT WAS MISSING.
         *
         * `index.css` styles bare ELEMENTS, unlayered:
         *
         *     input, select, button, textarea   font: inherit
         *     h1                                font-size: 56px
         *
         * Unlayered CSS beats every cascade layer regardless of specificity,
         * so `button { font: inherit }` outranks `text-[13px]` — and `inherit`
         * resolves to `:root { font: 18px/145% }`. Every button, select and
         * date field on every converted page has therefore been rendering at
         * EIGHTEEN pixels, with the utility sitting in the DOM doing nothing.
         *
         * That is why the filter bar read as enormous and why three rounds of
         * shrinking button heights changed nothing: the box got smaller, the
         * text inside it never did. It was measured, not guessed —
         * `getComputedStyle` on a header button returned `fontSize: 18px`.
         *
         * `styles/tailwind.css` has carried the fix since Phase 1 and says to
         * "put `tw-page` on the root of a migrated page". `Page` IS that root,
         * and it never got the class; only `Add_Scheme` remembered to add it
         * by hand. Putting it here is what makes the instruction unnecessary.
         */
        "tw-page",
        "min-h-[calc(100svh-64px)] w-full overflow-x-clip",
        // Transparent, like every other page in the app: `.content-area`
        // paints the background (see the `:has()` rule in styles/tailwind.css).
        // A page that paints its own leaves the shell's 75px navbar padding
        // showing above it as a white band.
        "bg-transparent text-ink-soft",
        // EXIM's padding ladder and vertical rhythm: every page section is
        // separated by the same gap, so a page never has to invent spacing.
        "p-3 sm:p-4 md:p-6",
        "space-y-4 sm:space-y-6",
        // …and its page-entrance fade. Honours prefers-reduced-motion.
        "animate-page",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Title, optional description, and the actions that belong to the page.
 *
 * `actions` is a slot rather than `children` so the title block cannot be
 * accidentally reordered around the buttons — on a narrow screen the actions
 * wrap beneath the title, which is the behaviour every hand-rolled header got
 * wrong in a different way.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  badges,
  actions,
  className,
  ...props
}: Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /**
   * Status chips that belong to the record, beside its title.
   *
   * Separate from `actions` because they are not actions — putting a status
   * Badge in the button row makes it look pressable — and separate from
   * `title` because a badge inside an `h1` is read as part of the heading.
   */
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        // The header is a surface of its own, matching the cards below it.
        // On a washed canvas a bare title floats; on a card it is the first
        // object in a stack of objects.
        "flex flex-wrap items-start justify-between gap-3",
        "rounded-card border border-line bg-card px-4 py-3.5 shadow-card",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-brand">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="m-0 text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {title}
          </h1>
          {badges}
        </div>
        {description ? (
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-body">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        // Header actions run at the COMPACT control height, whatever size the
        // caller asked for.
        //
        // `ui/button`'s default `md` is 40px because that is the app's field
        // height — a button next to an input has to line up with it. A page
        // header has no inputs, and four 40px buttons with icons across the
        // top of a record read as a toolbar of tiles rather than as a row of
        // actions. `--spacing-control-xs` is the chrome height, shared with
        // the filter bar, so the furniture on a page is one size throughout.
        //
        // Set here rather than as `size="xs"` on every call site so it cannot
        // be forgotten on the next page converted. The descendant selector is
        // (0,2,0) and beats the variant's own (0,1,0) `h-control`, so it wins
        // without `!important`; a caller that genuinely needs a taller button
        // can still override it on the header's own `className`.
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-1.5",
            "[&_[data-slot=button]]:h-control-xs",
            "[&_[data-slot=button]]:px-2.5 [&_[data-slot=button]]:text-[12.5px]",
          )}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/* ── Cards ───────────────────────────────────────────────────────────────── */

/**
 * A surface: one hairline, one radius, one light shadow.
 *
 * The app has ~15 card rules (`ofs-card`, `app-card`, `lc-pane`, `ps-card`,
 * `db-card`…) differing mainly in shadow depth and gradient direction. What
 * survives is a single elevation — `--shadow-card`, roughly shadcn's `sm` —
 * rather than the 18px drop shadows and gradient fills those rules used. Deep
 * enough to separate a card from the canvas, light enough that a grid of six
 * does not look like six floating slabs.
 *
 * `bg-card` rather than `bg-white`: the shadcn bridge already maps it
 * (`--sh-card`), so these become dark-mode-capable by changing one token
 * instead of every component.
 */
export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn(
        "rounded-card border border-line bg-card p-4",
        "shadow-card",
        // EXIM puts `card-hover shimmer-hover` on every data card by hand.
        // Baked in here instead: it is the default treatment, not an opt-in.
        "card-hover shimmer-hover",
        "dark:border-white/10",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-2",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="card-title"
      className={cn("m-0 text-[14px] font-semibold text-ink", className)}
      {...props}
    />
  );
}

/* ── Stats (the KPI row) ─────────────────────────────────────────────────── */

/**
 * Tint pairs for the icon chip, one per tone.
 *
 * Taken from EXIM's `SummaryCard`, which puts the icon in a soft coloured
 * square rather than leaving the card flat. That chip is most of what makes a
 * KPI row look considered instead of bare, and it costs nothing: the icon was
 * going to be there anyway.
 *
 * Tailwind's default palette (`emerald-50`, `red-600`…) rather than the app's
 * semantic tokens, deliberately. The semantic set has one shade per meaning
 * (`--color-ok` is a single dark green), which is fine for text on a soft
 * background but gives no 50/600 pair to build a chip from. EXIM reaches for
 * the default palette in exactly the same place and for the same reason.
 *
 * `brand` uses blue, not EXIM's teal: OMS keeps its own primary.
 */
const STAT_TONES = {
  neutral: {
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    value: "text-ink",
  },
  brand: {
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
    value: "text-ink",
  },
  ok: {
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
    value: "text-ok",
  },
  bad: {
    chip: "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400",
    value: "text-bad",
  },
  hold: {
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
    value: "text-hold",
  },
} as const;

export type StatTone = keyof typeof STAT_TONES;

/**
 * One number with its label, and an optional icon chip.
 *
 * Three implementations existed — `dashboard/KpiRow` (tone classes and emoji),
 * `productStock/SummaryCards`, and a third set inside
 * `Order_Status_Tracking.css`. They agreed on the shape and disagreed on
 * everything else.
 *
 * The value is `text-2xl font-bold`, matching EXIM: on a KPI the number IS the
 * content, and the first draft of this component set it at 22px/600 alongside a
 * 12px label, which read as a form field rather than a figure.
 *
 * `icon` is optional so a page with no sensible glyph does not have to invent
 * one — a row of arbitrary icons is worse than none.
 */
export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  loading = false,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Any react-icons / lucide component: rendered inside the tinted chip. */
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone?: StatTone;
  loading?: boolean;
}) {
  const tones = STAT_TONES[tone];

  return (
    <div
      data-slot="stat"
      data-tone={tone}
      className={cn(
        "rounded-card border border-line bg-card px-4 py-3.5",
        "shadow-card transition-shadow duration-150",
        "hover:shadow-card-hover",
        "dark:border-white/10",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        {Icon ? (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-sm",
              tones.chip,
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
        ) : null}

        <div className="min-w-0">
          <p className="m-0 text-[12px] font-medium text-subtle">{label}</p>
          {loading ? (
            <span className="mt-1 block h-7 w-20 animate-pulse rounded bg-surface-strong" />
          ) : (
            <p
              className={cn(
                "m-0 mt-0.5 text-2xl font-bold leading-tight tracking-[-0.02em] tabular-nums",
                tones.value,
              )}
            >
              {value}
            </p>
          )}
          {hint ? <p className="m-0 mt-0.5 text-[11px] text-subtle">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The row a set of `Stat`s sits in.
 *
 * `auto-fit` rather than a fixed column count: a page with three KPIs and a
 * page with six both look deliberate, and neither needs its own media query.
 */
export function StatRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stat-row"
      className={cn(
        "grid gap-2.5 sm:gap-4",
        "grid-cols-[repeat(auto-fit,minmax(170px,1fr))]",
        className,
      )}
      {...props}
    />
  );
}


/* ── Section heading ─────────────────────────────────────────────────────── */

/**
 * The label above a group of cards — "Stock Status Summary", "Detailed
 * Filters".
 *
 * Uppercase, letterspaced, muted and small. It is one of the strongest
 * "considered" signals in EXIM's pages and it costs a line: without it, a KPI
 * row and a filter card are two unexplained boxes; with it, they are named
 * regions a reader can skip.
 *
 * An `h2`, so a page's structure survives being read by outline.
 */
export function SectionHeading({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="section-heading"
      className={cn(
        "m-0 text-[12px] font-semibold uppercase tracking-wide text-subtle",
        // px, not `sm:text-sm`: the root is 18px here, so `text-sm` is 15.75px
        // — which is what this rendered at, and read as a title rather than
        // a caption once it sat inside a dialog next to 13px values.
        "sm:text-[13px] sm:tracking-wider",
        className,
      )}
      {...props}
    />
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

/**
 * "Nothing here", said properly.
 *
 * EXIM's empty states are a large thin-stroked icon over a headline and a
 * hint, in `py-16` of space — which reads as a considered state rather than a
 * failure. The version this replaces was the string "No orders found" in a
 * padded div.
 *
 * `stroke-1` on the icon matters more than it sounds: a filled or heavy glyph
 * at 40px reads as an error, a hairline one reads as absence.
 */
/**
 * A short, coloured statement ABOUT the content below it.
 *
 * Not a `Card`: a card is a container for a section of a page, and this is one
 * sentence explaining the state of the record — "Rejection reason: rate not
 * approved", "SAP push failed: …". It sits between the header and the data it
 * qualifies, because on a rejected or failed record it is the reason the
 * reader opened the page.
 *
 * It started as `.mart-notice-box`, local to one page. It is here because a
 * second page wanted it; one use does not make a primitive, two do.
 */
const NOTICE_TONES = {
  bad: "border-bad/25 bg-bad-soft/50 text-bad",
  hold: "border-hold/25 bg-hold-soft/50 text-hold",
  info: "border-brand-line bg-brand-soft/50 text-brand",
  // "It worked" — the outcome of an action the user just took, which is not
  // the same statement as `info`. Invoice Review needed it: a decision that
  // lands (approved, rejected, posted to SAP) removes the row it was about,
  // so the banner is the ONLY confirmation the action happened at all, and
  // reporting that in the same blue as "here is how this screen works" makes
  // the two indistinguishable at a glance.
  ok: "border-ok/25 bg-ok-soft/50 text-ok",
} as const;

export type NoticeTone = keyof typeof NOTICE_TONES;

export function Notice({
  tone = "info",
  title,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  tone?: NoticeTone;
  title?: React.ReactNode;
}) {
  return (
    <div
      data-slot="notice"
      data-tone={tone}
      // `role="status"`: these appear in response to something the user did or
      // to explain a state they have just navigated into, and a colour alone
      // is not a signal everyone receives.
      role="status"
      className={cn(
        "rounded-card border px-4 py-3 text-[13px]",
        NOTICE_TONES[tone],
        className,
      )}
      {...props}
    >
      {title ? <strong className="font-semibold">{title}: </strong> : null}
      <span className="text-body">{children}</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-16 text-center",
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="size-10 stroke-1 text-subtle" aria-hidden /> : null}
      <p className="m-0 text-sm font-medium text-body">{title}</p>
      {hint ? <p className="m-0 max-w-[46ch] text-xs text-subtle">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
