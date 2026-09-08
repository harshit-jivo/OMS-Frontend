/**
 * SegmentedControl — a few mutually exclusive options, all visible at once.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A PRIMITIVE NOW
 * ─────────────────────────────────────────────────────────────────────────
 * Invoice Report, Inventory Report and Open SO each pick a SAP company
 * (Oil / Beverage / Mart) this way, and each had written the radiogroup by
 * hand — `.invr-segment`, `.invt-segment`, `.sovi-segment`, three stylesheets
 * for one control. Invoice Report's conversion kept it local on the grounds
 * that it was the only one; it was the only CONVERTED one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A RADIOGROUP, NOT TABS
 * ─────────────────────────────────────────────────────────────────────────
 * `ui/tabs` looks the same at rest. The difference is what the choice DOES:
 * a tab swaps the panel below it, a radio sets a value the next request is
 * made with. Which company an invoice belongs to changes what a correct Doc
 * Number MEANS — that is a form value, and the screen reader should say
 * "radio, 1 of 3, checked", not "tab".
 *
 * Arrow keys move the selection, per the pattern, and only the checked radio
 * is in the Tab sequence.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "onChange"> & {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** `xs` matches the filter-bar chrome height; `md` the form-control height. */
  size?: "xs" | "md";
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const index = options.findIndex((option) => option.value === value);
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (index + (forward ? 1 : -1) + options.length) % options.length;
    event.preventDefault();
    onChange(options[next].value);
    const radios = ref.current?.querySelectorAll<HTMLElement>('[role="radio"]');
    radios?.[next]?.focus();
  };

  return (
    <div
      ref={ref}
      data-slot="segmented"
      role="radiogroup"
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex w-fit items-center gap-0.5 rounded-sm border border-line bg-surface",
        size === "xs" ? "h-control-xs p-0.5" : "h-control p-1",
        className,
      )}
      {...props}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            // `cn`, not a join: the reset's `bg-transparent` and the checked
            // state's `bg-brand` are one utility group, and left to emission
            // order the reset won — white text on a white pill.
            className={cn(
              "appearance-none border-0 bg-transparent [font-family:inherit] cursor-pointer",
              "h-full rounded-[5px] font-semibold transition-colors",
              size === "xs" ? "px-2.5 text-[12px]" : "px-3 text-[12.5px]",
              "focus-visible:outline-none focus-visible:shadow-focus",
              checked ? "bg-brand text-white" : "text-subtle hover:bg-card hover:text-body",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
