/**
 * The Control Panel block of Page Permissions: four pages, each a tick-box
 * tree of its sub-tabs, plus the segment limit.
 *
 * Ticking a page ticks every sub-tab; unticking one leaves the page
 * part-ticked. Holding any sub-tab opens the page and shows just those
 * sub-tabs — that is the server's rule (backend control_panel/permissions.py),
 * this only edits the key list. Keys live in config/controlPanelAccess.ts.
 */
import { useId } from "react";

import { cn } from "@/lib/utils";
import {
  CONTROL_PANEL_PAGES,
  CONTROL_PANEL_SEGMENTS,
  type ControlPanelPage,
} from "../../config/controlPanelAccess";

type Props = {
  /** Every key currently ticked on the Permissions page. */
  selected: string[];
  /** Replace the ticked set. */
  onChange: (next: string[]) => void;
};

const SEGMENT_KEYS: string[] = CONTROL_PANEL_SEGMENTS.map((s) => s.key).filter(Boolean);

export function ControlPanelPermissions({ selected, onChange }: Props) {
  const held = new Set(selected);
  const set = (add: string[], remove: string[] = []) => {
    const next = new Set(selected);
    remove.forEach((k) => next.delete(k));
    add.forEach((k) => next.add(k));
    onChange([...next]);
  };
  const segment = SEGMENT_KEYS.find((k) => held.has(k)) ?? "";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {CONTROL_PANEL_PAGES.map((page) => (
          <PageCard key={page.label} page={page} held={held} set={set} />
        ))}
      </div>

      <fieldset className="m-0 rounded-sm border border-line p-3">
        <legend className="px-1 text-[12px] font-semibold text-ink">
          Segment — Oils Sale and Sales
        </legend>
        <p className="m-0 mb-2 text-[11.5px] text-subtle">
          Applies to every Oils Sale sub-tab and to the Sales sub-tabs built on Realise data
          (all but &ldquo;Sales&rdquo;).
        </p>
        <div className="flex flex-wrap gap-2">
          {CONTROL_PANEL_SEGMENTS.map((option) => {
            const checked = segment === option.key;
            return (
              <label
                key={option.label}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-sm border px-2.5 py-2 text-[13px] transition-colors",
                  checked
                    ? "border-brand-line bg-brand-soft"
                    : "border-line bg-card hover:border-line-strong hover:bg-surface",
                )}
              >
                <input
                  type="radio"
                  name="cp-segment"
                  className="mt-0.5 size-3.5 shrink-0 accent-brand"
                  checked={checked}
                  onChange={() => set(option.key ? [option.key] : [], SEGMENT_KEYS)}
                />
                <span className="flex flex-col gap-0.5">
                  <span className={cn("font-semibold", checked ? "text-brand" : "text-ink")}>
                    {option.label}
                  </span>
                  <span className="text-[11.5px] text-subtle">{option.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function PageCard({
  page,
  held,
  set,
}: {
  page: ControlPanelPage;
  held: Set<string>;
  set: (add: string[], remove?: string[]) => void;
}) {
  const id = useId();
  const keys = page.subTabs.map((s) => s.key);
  const count = keys.filter((k) => held.has(k)).length;
  const all = count === keys.length;
  const extras = page.extras ?? [];

  return (
    <div
      className={cn(
        "rounded-sm border p-3 transition-colors",
        count ? "border-brand-line bg-brand-soft" : "border-line bg-card",
      )}
    >
      <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px]">
        <input
          type="checkbox"
          className="size-4 shrink-0 accent-brand"
          checked={all}
          // Part-ticked when some sub-tabs are held.
          ref={(el) => {
            if (el) el.indeterminate = count > 0 && !all;
          }}
          aria-describedby={id}
          // Unticking the page also drops its extras: they open nothing alone.
          onChange={() => (all ? set([], [...keys, ...extras.map((e) => e.key)]) : set(keys))}
        />
        <span className={cn("flex-1 font-bold", count ? "text-brand" : "text-ink")}>{page.label}</span>
        <span id={id} className="text-[11.5px] font-semibold text-subtle">
          {count} of {keys.length}
        </span>
      </label>

      <ul className="m-0 mt-2 list-none space-y-0.5 border-l border-line pl-3 ml-[7px]">
        {page.subTabs.map((sub) => (
          <li key={sub.key}>
            <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-[13px] hover:bg-surface">
              <input
                type="checkbox"
                className="size-3.5 shrink-0 accent-brand"
                checked={held.has(sub.key)}
                onChange={() => (held.has(sub.key) ? set([], [sub.key]) : set([sub.key]))}
              />
              <span className={held.has(sub.key) ? "font-semibold text-ink" : "text-ink"}>
                {sub.label}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {extras.map((extra) => (
        <label
          key={extra.key}
          className={cn(
            "mt-2 flex items-start gap-2 border-t border-line pt-2 text-[13px]",
            count ? "cursor-pointer" : "cursor-not-allowed opacity-55",
          )}
        >
          <input
            type="checkbox"
            className="mt-0.5 size-3.5 shrink-0 accent-brand"
            checked={held.has(extra.key)}
            disabled={!count && !held.has(extra.key)}
            onChange={() => (held.has(extra.key) ? set([], [extra.key]) : set([extra.key]))}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold text-ink">{extra.label}</span>
            <span className="text-[11.5px] text-subtle">{extra.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
