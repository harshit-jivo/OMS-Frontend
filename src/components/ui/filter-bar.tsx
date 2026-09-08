/**
 * The filter toolbar — Phase 2.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS THE HIGHEST-LEVERAGE PRIMITIVE IN THE SET
 * ─────────────────────────────────────────────────────────────────────────
 * The same toolbar is hand-written five times across the orders module —
 * `View_Orders` (`.vo-toolbar`), `Auditor_Order` (`.ao-search-wrap`),
 * `Order_Status_Tracking`, `Order_Tracking` and `Distributor/Order_Tracking` —
 * each about 120 lines of markup over ~200 lines of stylesheet, each with its
 * own class prefix and its own idea of the gap between two selects. It is the
 * largest copy-paste surface in the module and it had no primitive at all.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LABELS ARE VISIBLE, AND THAT IS A CORRECTION
 * ─────────────────────────────────────────────────────────────────────────
 * The first version hid every label with `sr-only`, on the reasoning that the
 * first option ("All Statuses") already said what the control was. Two things
 * were wrong with that. It only reads as a label while nothing is selected —
 * pick "Billed" and the control is nameless again. And faced with a row of
 * five identical grey selects, a sighted user has exactly the problem the
 * hidden label was meant to solve for a screen reader.
 *
 * So each field is a labelled column now: caption above, control below, both
 * the same width. The label takes an optional icon, because a funnel beside
 * "Status" is read before the word is.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FORM CONTROLS AND THE MISSING PREFLIGHT
 * ─────────────────────────────────────────────────────────────────────────
 * Preflight is not imported, so `<select>` and `<input>` keep the browser's
 * own border, background and — the one that catches people — FONT.
 * `font-family` is not inherited by form controls, so a select styled with
 * `text-sm` alone renders in the UA font beside Inter text. Every field here
 * sets `[font-family:inherit]` explicitly — spelled that way rather than
 * `font-[inherit]`, which is ambiguous enough that tailwind-merge strips it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────
 * It holds no state and knows nothing about what is being filtered. Every
 * existing toolbar owns its own `useState` and resets the page number on
 * change, and that logic is genuinely per-page.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { MultiSelect, SearchSelect } from "./dropdown";
import { SegmentedControl } from "./segmented";

/** Shared field chrome, so a select and a date input cannot drift apart. */
const fieldClass = [
  // `--spacing-control-xs` (32px), not the 36px form height. A filter is not
  // a field you fill in — you glance at a toolbar and change one thing. At
  // 36px inside a 4-unit card, five of these were taller than the KPI row
  // above and read as the most important object on the page. The same token
  // sizes page-header actions, so a page's furniture is one height.
  "h-control-xs w-full min-w-0 rounded-sm",
  // A faint fill rather than white: on a white card a white input is defined
  // only by its border and reads as flat. The tint is what makes a row of
  // controls legible AS controls.
  "border border-line bg-surface px-2.5",
  // `[font-family:inherit]` rather than `font-[inherit]` — the latter is
  // ambiguous and tailwind-merge can drop it against a font-weight class.
  "[font-family:inherit] text-[12.5px] text-ink",
  "transition-colors hover:border-line-strong",
  "focus-visible:outline-none focus-visible:border-brand focus-visible:bg-card focus-visible:shadow-focus",
  "disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-subtle",
].join(" ");

/**
 * The bar itself — a card, not a strip.
 *
 * `items-end` so a labelled field and a bare button share a baseline: the
 * controls line up even though one column is taller than the other.
 *
 * Wraps rather than scrolls: on a narrow screen a filter that has scrolled out
 * of sight is a filter the user does not know is applied.
 */
export function FilterBar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar"
      role="search"
      className={cn(
        "flex flex-wrap items-end gap-x-3 gap-y-2.5",
        // `px-3 py-2.5`, not `p-4`. See the note on the field height: this is
        // a toolbar, and it was competing with the content it filters.
        "rounded-card border border-line bg-card px-3 py-2.5",
        "shadow-card",
        // Buttons in the bar match the FIELD height, not `ui/button`'s own
        // 36px `sm`. Set here rather than on every Clear/Apply so the two
        // cannot drift — a Clear button 4px taller than the input beside it is
        // the kind of thing nobody reports and everybody sees. The descendant
        // selector is (0,2,0), so it beats the size variant's (0,1,0).
        "[&_[data-slot=button]]:h-control-xs",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * The column a labelled control sits in.
 *
 * `flex-1` with a floor: three filters share the row equally, and a fourth
 * wraps rather than squeezing the others below readability.
 */
function Field({
  id,
  label,
  icon: Icon,
  className,
  children,
}: {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-[140px] flex-1 flex-col gap-1", className)}>
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle"
      >
        {Icon ? <Icon className="size-3 [stroke-width:1.5]" aria-hidden /> : null}
        {label}
      </label>
      {children}
    </div>
  );
}

/** A labelled select. */
export function FilterSelect({
  label,
  icon,
  fieldClassName,
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & {
  label: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  fieldClassName?: string;
}) {
  const id = React.useId();
  return (
    <Field id={id} label={label} icon={icon} className={fieldClassName}>
      <select
        id={id}
        data-slot="filter-select"
        className={cn(fieldClass, "cursor-pointer", className)}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}

/** A labelled search box. `type="search"` gives the browser's own clear affordance. */
export function FilterSearch({
  label = "Search",
  icon,
  fieldClassName,
  className,
  ...props
}: React.ComponentProps<"input"> & {
  label?: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  fieldClassName?: string;
}) {
  const id = React.useId();
  return (
    <Field id={id} label={label} icon={icon} className={fieldClassName}>
      <input
        id={id}
        type="search"
        data-slot="filter-search"
        className={cn(fieldClass, className)}
        {...props}
      />
    </Field>
  );
}

/** A labelled date field. */
export function FilterDate({
  label,
  icon,
  fieldClassName,
  className,
  ...props
}: React.ComponentProps<"input"> & {
  label: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  fieldClassName?: string;
}) {
  const id = React.useId();
  return (
    <Field
      id={id}
      label={label}
      icon={icon}
      // A date needs less room than a party name and should not claim an equal
      // share of the row.
      className={cn("max-w-[170px] flex-none", fieldClassName)}
    >
      <input
        id={id}
        type="date"
        data-slot="filter-date"
        className={cn(fieldClass, className)}
        {...props}
      />
    </Field>
  );
}

/**
 * The actions at the end of the bar — Apply, Clear.
 *
 * A slot of its own rather than loose buttons, so they sit on the controls'
 * baseline instead of on the labels'.
 */
export function FilterActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-actions"
      className={cn("flex flex-none items-center gap-2", className)}
      {...props}
    />
  );
}

/**
 * Pushes what follows to the right-hand end of the bar.
 *
 * A spacer element rather than `justify-between` on the bar, because the bar
 * wraps: with `justify-between` the last row's single item would be flung to
 * the right edge on a narrow screen, which reads as a layout bug.
 */
export function FilterSpacer() {
  return <span aria-hidden="true" className="ml-auto" />;
}

/** The result count. Muted — it is context, not a finding. */
export function FilterCount({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="filter-count"
      className={cn("pb-1.5 text-[11.5px] text-subtle", className)}
      {...props}
    />
  );
}

/**
 * A toggle in the bar — "Show turned-off", "Unmapped only".
 *
 * Not `ui/form`'s `Checkbox`: that one carries a hint slot and form-sized
 * text. This sits at the toolbar height beside the fields, bottom-aligned
 * with them, and its label reads as a sentence to its right.
 */
export function FilterCheckbox({
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label: React.ReactNode }) {
  const id = React.useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex h-control-xs flex-none cursor-pointer items-center gap-2 text-[12.5px] text-body",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        data-slot="filter-checkbox"
        className="size-4 cursor-pointer accent-brand"
        {...props}
      />
      {label}
    </label>
  );
}

/* ── The pickers a native select cannot be ─────────────────────────────── */

/**
 * A labelled multi-select — "Main Group", "Warehouses". See `ui/dropdown`
 * for what it replaces and why it is a group of real checkboxes.
 */
export function FilterMultiSelect<T extends string | number>({
  label,
  icon,
  fieldClassName,
  ...props
}: Omit<React.ComponentProps<typeof MultiSelect<T>>, "size" | "id"> & {
  label: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  fieldClassName?: string;
}) {
  const id = React.useId();
  return (
    <Field id={id} label={label} icon={icon} className={fieldClassName}>
      <MultiSelect id={id} size="xs" {...props} />
    </Field>
  );
}

/** A labelled searchable select — "User", "Party", "Variety". */
export function FilterSearchSelect<T extends string | number>({
  label,
  icon,
  fieldClassName,
  ...props
}: Omit<React.ComponentProps<typeof SearchSelect<T>>, "size" | "id"> & {
  label: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  fieldClassName?: string;
}) {
  const id = React.useId();
  return (
    <Field id={id} label={label} icon={icon} className={fieldClassName}>
      <SearchSelect id={id} size="xs" {...props} />
    </Field>
  );
}

/**
 * A labelled segmented control — the SAP company picker on the three
 * reports that read SAP directly. `flex-none`: three short words do not need
 * an equal share of the row.
 */
export function FilterSegmented<T extends string>({
  label,
  icon,
  fieldClassName,
  ...props
}: Omit<React.ComponentProps<typeof SegmentedControl<T>>, "size"> & {
  label: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  fieldClassName?: string;
}) {
  const id = React.useId();
  return (
    <Field id={id} label={label} icon={icon} className={cn("flex-none", fieldClassName)}>
      <SegmentedControl size="xs" aria-labelledby={id} {...props} />
    </Field>
  );
}
