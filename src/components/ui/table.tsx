/**
 * The table primitive — Phase 2.1.
 *
 * 77 tables across 49 pages, each with its own stylesheet block. This replaces
 * the styling, one page at a time; `data-table.tsx` beside it adds sorting and
 * pagination for the tables that want them. Most do not, so the two are kept
 * separate: adopting the look should not cost a rewrite into a column model.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THERE ARE TWO DENSITIES AND NOT ONE
 * ─────────────────────────────────────────────────────────────────────────
 * Reading the existing stylesheets, the 77 tables are not 77 designs. They are
 * two, repeated:
 *
 *     .au-table th  padding: 14px 20px   .nic-table th  padding: 10px 14px
 *     .au-table td  padding: 15px 20px   .nic-table td  padding:  9px 14px
 *
 * A record list people scan, and a dense grid people read down a column of.
 * Collapsing both into one padding would restyle roughly half the app on the
 * pretext of consolidating it, so `density` is a prop. Everything else — the
 * uppercase header, the hairline row rule, the hover tint — really is common,
 * and is not configurable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PREFLIGHT IS NOT LOADED (see styles/tailwind.css)
 * ─────────────────────────────────────────────────────────────────────────
 * So `border-collapse` is still the browser's `separate`, and a `th` is still
 * centred and bold by default. Tailwind's own table styles would normally come
 * from preflight; here they have to be stated. That is why `border-collapse`
 * and `text-left` appear below rather than being inherited — remove them and
 * every row grows a double border.
 *
 * The same note explains why a converted page must DROP its old class name.
 * Existing CSS is unlayered and beats every utility here regardless of
 * specificity, so `<Table className="…" />` left on an element that still
 * carries `au-table` renders the old design and looks like the primitive did
 * nothing.
 */
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Density
 * ---------------------------------------------------------------------- */

/**
 * Padding is set on the cells, not the table, so it cannot be inherited into a
 * nested table — several pages render one inside an expanded row.
 * `data-density` carries the choice down; the cells read it off the ancestor.
 */
const tableVariants = cva("w-full border-collapse text-left", {
  variants: {
    density: {
      /** Record lists: App_User, Distributor, Mart_Approval. */
      comfortable: "text-[13px]",
      /** Dense grids: Einvoice, Ewaybill, the line-item tables. */
      compact: "text-[12px]",
    },
  },
  defaultVariants: { density: "comfortable" },
});

export type TableDensity = NonNullable<
  VariantProps<typeof tableVariants>["density"]
>;

const DensityContext = React.createContext<TableDensity>("comfortable");

/* -------------------------------------------------------------------------
 * Parts
 * ---------------------------------------------------------------------- */

/**
 * The scroll container is part of the primitive rather than the caller's job.
 * Twenty-eight of the existing tables sit in a hand-written `*-table-wrap` div
 * that exists only to set `overflow-x: auto`, and the ones that forgot it are
 * the ones that scroll the whole page sideways on a laptop.
 */
export function Table({
  className,
  density,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> &
  VariantProps<typeof tableVariants> & { containerClassName?: string }) {
  const resolved: TableDensity = density ?? "comfortable";
  return (
    <DensityContext.Provider value={resolved}>
      <div
        data-slot="table-container"
        className={cn("relative w-full overflow-x-auto", containerClassName)}
      >
        <table
          data-slot="table"
          data-density={resolved}
          className={cn(tableVariants({ density: resolved }), className)}
          {...props}
        />
      </div>
    </DensityContext.Provider>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-line", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      // The last row's rule is the card's own bottom edge, drawn twice.
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

export function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-line bg-surface font-medium text-ink-soft [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-line/60 transition-colors",
        "hover:bg-surface data-[state=selected]:bg-brand-soft",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  const density = React.useContext(DensityContext);
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-left align-middle font-semibold uppercase tracking-[0.06em]",
        "whitespace-nowrap text-[11px] text-subtle",
        density === "compact" ? "px-3.5 py-2.5" : "px-5 py-3.5",
        // Checkbox columns: the cell should not be wider than the control.
        "[&:has([role=checkbox])]:w-px [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  const density = React.useContext(DensityContext);
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "align-middle text-body",
        density === "compact" ? "px-3.5 py-2.5" : "px-5 py-4",
        "[&:has([role=checkbox])]:w-px [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-[13px] text-subtle", className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------
 * Empty state
 * ---------------------------------------------------------------------- */

/**
 * The "no rows" row.
 *
 * Every page hand-rolls this, and most roll it OUTSIDE the table — a sibling
 * div rendered instead of the `<table>`, which drops the header along with the
 * rows, so the reader loses the columns exactly when they are trying to work
 * out what is missing. Keeping it inside a `<tr>` keeps the header.
 *
 * `colSpan` is required rather than defaulted: a wrong span silently
 * left-aligns the message under column one, which reads as a rendering bug.
 */
export function TableEmpty({
  colSpan,
  className,
  children = "No records found",
  ...props
}: React.ComponentProps<"td"> & { colSpan: number }) {
  return (
    <tr data-slot="table-empty">
      <td
        colSpan={colSpan}
        className={cn("px-5 py-10 text-center text-[13px] text-subtle", className)}
        {...props}
      >
        {children}
      </td>
    </tr>
  );
}
