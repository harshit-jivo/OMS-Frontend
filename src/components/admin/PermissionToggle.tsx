/**
 * The permission tick-box row, and the grid it sits in.
 *
 * Three identical copies of this existed — `ToggleRow` in Page_Permissions,
 * Role_Permissions and Order_Flow_Settings, each a `<button role="checkbox">`
 * with a hand-drawn tick span. They were byte-for-byte the same, which is the
 * cheapest kind of duplication to remove and the easiest to let drift.
 *
 * It is a real `<input type="checkbox">` inside a `<label>` now rather than a
 * button wearing `role="checkbox"`. The ARIA was correct, but a native control
 * brings Space, the form-control focus ring, `disabled` and the accessible
 * name for free, and cannot get out of step with its own `aria-checked`.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export function PermissionToggle({
  title,
  subtitle,
  checked,
  disabled = false,
  onChange,
  className,
}: {
  title: React.ReactNode;
  /** The key, the route, or one line on what the permission lets someone do. */
  subtitle?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-sm border p-2.5 text-[13px] transition-colors",
        checked
          ? "border-brand-line bg-brand-soft"
          : "border-line bg-card hover:border-line-strong hover:bg-surface",
        disabled && "cursor-not-allowed opacity-55 hover:border-line hover:bg-card",
        className,
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-3.5 shrink-0 accent-brand"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("font-semibold", checked ? "text-brand" : "text-ink")}>{title}</span>
        {subtitle ? (
          <span className="break-words text-[11.5px] font-normal text-subtle">{subtitle}</span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * The grid the toggles sit in. Auto-fit rather than a fixed column count: the
 * three pages that use it have 3, 5 and 20-odd permissions respectively, and a
 * fixed grid leaves the short ones with empty columns.
 */
export function PermissionGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2", className)}
      {...props}
    />
  );
}
