/**
 * Record detail — Phase 2.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE PATTERN, WHETHER IT IS A PAGE OR A MODAL
 * ─────────────────────────────────────────────────────────────────────────
 * Looking at one record is the second thing every module does, after listing
 * them — and it is currently done three incompatible ways:
 *
 *   * `NicUI.KeyValues` / `NicUI.DetailsView` (`.nic-kv`), used by 19 pages
 *     across HAIS, e-Invoice and e-Way Bill;
 *   * `order-items/PartyHeader` + `ItemSection`, with 722 lines of their own
 *     CSS, used by six order screens;
 *   * bespoke `<div>` pairs inside a `DialogContent` on most other screens.
 *
 * These components are deliberately container-agnostic. The same
 * `DetailSection` + `DetailGrid` renders inside a `DialogBody` and inside a
 * `Card` on a full page, so "view order 1234" looks the same whether it opened
 * in a modal from the list or as its own route. That was not true before: the
 * modal version and the page version of the same record were visibly different
 * screens.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT GOES WHERE
 * ─────────────────────────────────────────────────────────────────────────
 *   modal:  <DialogContent> <DialogHeader> <DialogBody> …sections… <DialogFooter>
 *   page:   <Page> <PageHeader> <Card> …sections… </Card>
 *
 * The header and footer come from `ui/dialog` and `ui/page` respectively —
 * both already exist, and `DialogHeader`/`DialogBody`/`DialogFooter` are
 * currently the most under-used components in `ui/` (32 files import Dialog;
 * almost none use its subcomponents, so every modal re-invents its own header
 * and footer geometry).
 */
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The accent colour for a section's icon.
 *
 * Straight from EXIM's `DomesticContractDetailsPage`, which colours each
 * section of a record — Contract blue, Logistics cyan, Money emerald — so a
 * long one can be navigated by colour rather than by reading every label.
 *
 * It used to tint a filled header BAND as well. That earns its keep on a
 * record with eight groups and is pure decoration on one with two, where it
 * just puts a saturated bar above fields nobody was struggling to find. The
 * colour is on the icon alone now, which is the part that was navigating.
 *
 * `slate` is the default and is deliberately almost colourless.
 */
const SECTION_TONES = {
  slate: {
    icon: "text-slate-500 dark:text-slate-400",
  },
  blue: {
    icon: "text-blue-600 dark:text-blue-400",
  },
  emerald: {
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    icon: "text-amber-600 dark:text-amber-400",
  },
  rose: {
    icon: "text-rose-600 dark:text-rose-400",
  },
} as const;

export type DetailTone = keyof typeof SECTION_TONES;

/**
 * A titled group of fields.
 *
 * Self-contained bordered boxes — stack them in a `space-y-3`; they do not
 * need a card each. The heading is a caption over a hairline, and the icon
 * carries the tone.
 */
export function DetailSection({
  title,
  icon: Icon,
  tone = "slate",
  actions,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone?: DetailTone;
  actions?: React.ReactNode;
}) {
  const tones = SECTION_TONES[tone];

  return (
    <section
      data-slot="detail-section"
      data-tone={tone}
      className={cn("overflow-hidden rounded-md border border-line", className)}
      {...props}
    >
      {title || actions ? (
        // A hairline and a caption, not a filled band.
        //
        // The strip was EXIM's: a tinted bar per section so a long record can
        // be navigated by colour. At one or two sections it is not navigation,
        // it is decoration — a saturated blue bar announcing "PARTY &
        // DELIVERY" above eleven fields nobody was struggling to find. The
        // tone survives on the ICON, which is the part that was doing the
        // work; `data-tone` is unchanged, so a record that really does have
        // eight groups still gets its colour coding.
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          {Icon ? <Icon className={cn("size-3.5 shrink-0", tones.icon)} aria-hidden /> : null}
          {title ? (
            <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
              {title}
            </h3>
          ) : null}
          {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="p-3">{children}</div>
    </section>
  );
}

/**
 * The field grid.
 *
 * `auto-fit` with a 180px floor: three fields on a narrow modal, five on a wide
 * page, without either being told how many columns it has. The alternative —
 * a fixed column count per screen — is what produced the current situation
 * where the same record has a different layout in its modal and its page.
 */
export function DetailGrid({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      data-slot="detail-grid"
      className={cn(
        // Wider gaps than the chip version needed. With no box around each
        // field, the gap IS the separation — at `gap-2` a label sat as close
        // to its neighbour's value as to its own.
        "m-0 grid gap-x-6 gap-y-3.5",
        "grid-cols-[repeat(auto-fit,minmax(180px,1fr))]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * One label and its value.
 *
 * A `<dt>`/`<dd>` pair inside `DetailGrid`'s `<dl>` — the markup a description
 * list is for, so the association is real rather than visual.
 *
 * EMPTY VALUES ARE SHOWN, NOT HIDDEN
 * ----------------------------------
 * `NicUI.KeyValues` filters empty values out of the list entirely. That reads
 * tidily and loses information: on an order, "Delivery date: —" and no
 * delivery-date row at all mean different things to a reviewer, and only one of
 * them is visible. So a blank value renders as an em dash, and the field keeps
 * its place. `hideWhenEmpty` is available for the genuinely optional field, but
 * it is opt-in rather than the default.
 */
export function DetailField({
  label,
  value,
  span,
  strong = false,
  hint,
  hideWhenEmpty = false,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  /** `full` makes the field span every column — for remarks and addresses. */
  span?: "full";
  /** Emphasise the value: for the one figure a record is actually about. */
  strong?: boolean;
  hint?: React.ReactNode;
  hideWhenEmpty?: boolean;
}) {
  const isEmpty =
    value === null || value === undefined || value === "" || value === false;

  if (isEmpty && hideWhenEmpty) return null;

  return (
    <div
      data-slot="detail-field"
      className={cn(
        // A bare label/value pair, separated by space alone.
        //
        // It was a ring-inset chip on a faint fill, on the reasoning that the
        // chips separate fields without a border grid. On an eleven-field
        // record they do the opposite: eleven outlined boxes inside a card
        // inside a page is three nested frames, and the boxes end up carrying
        // more visual weight than the values in them. Whitespace separates
        // these perfectly well, and the grid gap is what keeps the columns
        // legible.
        "min-w-0 py-0.5",
        span === "full" && "col-span-full",
        className,
      )}
      {...props}
    >
      <dt className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">
        {label}
      </dt>
      <dd
        className={cn(
          "m-0 mt-1 break-words tabular-nums",
          strong ? "text-base font-bold text-ink" : "text-[13px] font-medium text-ink",
        )}
      >
        {isEmpty ? <span className="font-normal text-subtle">—</span> : value}
      </dd>
      {hint ? <p className="m-0 mt-0.5 text-[10px] text-subtle">{hint}</p> : null}
    </div>
  );
}

/**
 * Convenience for the common case: an array of pairs.
 *
 * The shape `NicUI.KeyValues` already takes, so the 19 pages using it can move
 * over without rewriting their data. It renders through `DetailField`, so they
 * gain the em-dash behaviour and the real `dl` markup at the same time.
 */
export function DetailFields({
  items,
  hideWhenEmpty = false,
}: {
  items: Array<[React.ReactNode, React.ReactNode]>;
  hideWhenEmpty?: boolean;
}) {
  return (
    <DetailGrid>
      {items.map(([label, value], index) => (
        <DetailField
          key={typeof label === "string" ? label : index}
          label={label}
          value={value}
          hideWhenEmpty={hideWhenEmpty}
        />
      ))}
    </DetailGrid>
  );
}
