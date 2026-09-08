import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Form controls — the primitive set `ui/` was missing.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS ARRIVED LATE, AND WHY IT HAD TO
 * ─────────────────────────────────────────────────────────────────────────
 * Phase 2 built Table, Badge, Dialog, Button, Card, Detail and FilterBar —
 * everything needed to READ a record. Every screen that WRITES one was still
 * hand-rolling `<label class="xx-field"><span class="xx-label">…`, which is
 * `.cr-field`, `.nm-field`, `.ofs-field`, `.asg-field` and a dozen more: the
 * same three elements with a different prefix per stylesheet.
 *
 * `FilterBar` already had a private `Field` doing exactly this. That was the
 * signal it belonged here; a toolbar filter and a form field are the same
 * object at different sizes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE THREE THINGS THESE GET RIGHT THAT HAND-ROLLED FIELDS DO NOT
 * ─────────────────────────────────────────────────────────────────────────
 *  1. **The label is really attached.** `useId` wires `htmlFor`/`id`, so
 *     clicking the label focuses the control and a screen reader announces
 *     the two together. Several existing forms wrap the input in the label,
 *     which works, and several put them side by side, which does not.
 *  2. **The hint is announced too.** `aria-describedby` points at it. A hint
 *     that only sighted users get is the half of the form that explains
 *     itself.
 *  3. **They are not bare controls.** Preflight is not imported, so an
 *     `<input>` keeps the UA's border, background and — the one that catches
 *     people — FONT, because `font-family` is not inherited by form controls.
 *     Every control here sets `[font-family:inherit]` explicitly, spelled
 *     that way rather than `font-[inherit]`, which is ambiguous enough that
 *     tailwind-merge drops it against a font-weight class.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SIZE
 * ─────────────────────────────────────────────────────────────────────────
 * `--spacing-control` (40px), NOT the 32px chrome height the filter bar uses.
 * A field you type into is a different thing from a toolbar you glance at,
 * and a button beside an input has to line up with it — which is the whole
 * reason that token is 40px.
 */

/** Shared control chrome, so an input and a textarea cannot drift apart. */
const controlClass = [
  "w-full min-w-0 rounded-sm border border-line bg-surface px-3",
  "[font-family:inherit] text-[13px] text-ink",
  "transition-colors hover:border-line-strong",
  "placeholder:text-subtle",
  "focus-visible:border-brand focus-visible:bg-white focus-visible:shadow-focus focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-subtle",
  // A field that is wrong says so with a colour AND the message below it;
  // colour alone is not a signal everyone receives.
  "aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft/40",
].join(" ");

type FieldOwnProps = {
  label: React.ReactNode;
  /** Explanatory text under the control. Announced with it. */
  hint?: React.ReactNode;
  /** Replaces `hint` and marks the control invalid. */
  error?: React.ReactNode;
  /** Adds the conventional marker AND the `required` semantics to the child. */
  required?: boolean;
  /** `full` makes the field span every column of a `FormGrid`. */
  span?: "full";
};

/**
 * A labelled control.
 *
 * `children` is a render prop taking the id and describedby to spread onto
 * the control — the alternative (cloning a single child) breaks the moment a
 * field holds two controls or a wrapper, which several of these forms do.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  span,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> &
  FieldOwnProps & {
    children: (control: {
      id: string;
      "aria-describedby": string | undefined;
      "aria-invalid": boolean | undefined;
      required: boolean;
    }) => React.ReactNode;
  }) {
  const id = React.useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;

  return (
    <div
      data-slot="field"
      className={cn("flex min-w-0 flex-col gap-1.5", span === "full" && "col-span-full", className)}
      {...props}
    >
      <label htmlFor={id} className="text-[12px] font-medium text-body">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children({
        id,
        "aria-describedby": note ? noteId : undefined,
        "aria-invalid": error ? true : undefined,
        required,
      })}

      {note ? (
        <p
          id={noteId}
          className={cn("text-[11.5px] leading-snug", error ? "text-danger" : "text-subtle")}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(controlClass, "h-control", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClass, "min-h-[80px] py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(controlClass, "h-control cursor-pointer", className)}
      {...props}
    />
  );
}

/**
 * A checkbox with its label beside it, not above it.
 *
 * Deliberately NOT a `Field`: a checkbox's label goes to its right and reads
 * as a sentence ("Active"), where a text input's sits above and reads as a
 * name. Forcing both through one component is what produces forms with a
 * floating "Active" caption over a lone tick box, which is what several of
 * these pages currently do.
 */
export function Checkbox({
  label,
  hint,
  className,
  id: idProp,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  label: React.ReactNode;
  hint?: React.ReactNode;
}) {
  const generated = React.useId();
  const id = idProp ?? generated;
  const noteId = `${id}-note`;

  return (
    <div data-slot="checkbox-field" className={cn("flex min-w-0 gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={hint ? noteId : undefined}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand"
        {...props}
      />
      <span className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[13px] font-medium text-ink">
          {label}
        </label>
        {hint ? (
          <p id={noteId} className="mt-0.5 text-[11.5px] leading-snug text-subtle">
            {hint}
          </p>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The field grid.
 *
 * `auto-fit` with a 220px floor, like `DetailGrid` — so a form is one column
 * in a narrow dialog and two or three on a page, without either being told
 * how many it has.
 */
export function FormGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-grid"
      className={cn(
        "grid gap-x-5 gap-y-4",
        "grid-cols-[repeat(auto-fit,minmax(220px,1fr))]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A named group of fields inside a form — the `<fieldset>` these pages want.
 *
 * A real `fieldset`/`legend`, so the group name is announced with every
 * control inside it. That matters most for the optional groups these forms
 * have, where "Critical" means nothing without "OCR cross-check" above it.
 */
export function FieldGroup({
  legend,
  hint,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"fieldset">, "children"> & {
  legend: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      data-slot="field-group"
      className={cn("m-0 rounded-md border border-line p-4", className)}
      {...props}
    >
      <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
        {legend}
      </legend>
      {hint ? <p className="mb-3 text-[12px] leading-snug text-subtle">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

/**
 * The row a form's buttons sit in.
 *
 * `justify-end` and reversed source order are deliberate: the confirming
 * action is last in the DOM AND on the right, which is what a keyboard user
 * tabbing forward expects to reach last.
 */
export function FormActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-actions"
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4",
        className,
      )}
      {...props}
    />
  );
}
