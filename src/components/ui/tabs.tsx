/**
 * Tabs — a tablist that a keyboard can actually drive.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE THREE HAND-ROLLED TABLISTS ARE MISSING
 * ─────────────────────────────────────────────────────────────────────────
 * Sap_Sync, ApprovalManagement and Label_Checker all get the easy half right:
 * `role="tablist"`, `role="tab"`, `aria-selected`. None of them implements the
 * half that makes those roles mean anything.
 *
 *   * **Arrow keys do nothing.** The ARIA tabs pattern is that Left/Right (or
 *     Home/End) move between tabs; Tab moves *out* of the tablist. Announcing
 *     `role="tablist"` tells a screen-reader user those keys will work — so
 *     getting the roles right and the keys wrong is worse than plain buttons,
 *     because it promises an interaction that is not there.
 *   * **Every tab is a tab stop.** Five tabs means five presses of Tab to get
 *     past the strip. The pattern is a roving tabindex: the selected tab is
 *     the only one in the sequence.
 *   * **Nothing connects a tab to its panel.** No `aria-controls`, no
 *     `id`/`aria-labelledby` pair, so the content below is not announced as
 *     belonging to the tab that was just chosen.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY NOT RADIX TABS
 * ─────────────────────────────────────────────────────────────────────────
 * Radix owns the panels as well as the strip, and all three of these pages
 * render their panel with a `switch` on their own state — Sap_Sync mounts one
 * of five whole page components that way. Adopting Radix means restructuring
 * three pages to get a behaviour that is a keydown handler and a tabindex.
 * `Dialog` was the opposite case: a focus trap is genuinely hard, so it was
 * worth the dependency. This is not.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export function TabList({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label: string }) {
  const ref = React.useRef<HTMLDivElement>(null);

  /**
   * Arrow keys move focus AND selection, which is the "automatic activation"
   * form of the pattern. It is the right one here: every panel these tabs
   * switch to is already mounted or cheap to mount, so there is no reason to
   * make the user press Enter as well.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const tabs = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])') ?? [],
    );
    if (!tabs.length) return;

    const from = tabs.indexOf(document.activeElement as HTMLElement);
    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : // Wraps, per the pattern: Right on the last tab goes to the first.
            (Math.max(0, from) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;

    event.preventDefault();
    tabs[to].focus();
    tabs[to].click();
  };

  return (
    <div
      ref={ref}
      data-slot="tab-list"
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("flex items-center gap-1", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Tab({
  selected,
  className,
  ...props
}: React.ComponentProps<"button"> & { selected: boolean }) {
  return (
    <button
      type="button"
      data-slot="tab"
      role="tab"
      aria-selected={selected}
      // The roving tabindex: only the selected tab is in the Tab sequence.
      tabIndex={selected ? 0 : -1}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2",
        "text-[13px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:shadow-focus",
        selected
          ? "bg-brand text-white"
          : "text-subtle hover:bg-surface hover:text-body",
        className,
      )}
      {...props}
    />
  );
}
