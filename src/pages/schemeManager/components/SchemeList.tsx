/**
 * The scheme list — one accordion row per scheme, virtualized.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SCROLL CONTAINER IS `document.body`
 * ─────────────────────────────────────────────────────────────────────────
 * The list has never had an inner scrollbar — it sizes to its content and the
 * page scrolls. It used `useWindowVirtualizer` for that, which reads
 * `window.scrollY` — and `window.scrollY` is ALWAYS 0 here: `index.css` gives
 * `html, body, #root` `height: 100%` and `overflow-x: hidden` on html and
 * body, which makes BODY the scrolling box rather than the viewport. So the
 * virtualizer's idea of "where am I in the list" never moved, and every
 * scheme past the first screenful was unreachable. `e2e/virtualization.spec.ts`
 * pins the Invoice Review half of the same defect.
 *
 * `useVirtualizer` with an explicit `getScrollElement` measures the box that
 * actually scrolls.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY `measureElement`, NOT A FIXED ROW HEIGHT
 * ─────────────────────────────────────────────────────────────────────────
 * A collapsed row and an expanded one differ by a few hundred pixels, and only
 * one row expands at a time (`expandedId`). `measureElement` (a
 * `ResizeObserver` under the hood) keeps the virtualizer's notion of each
 * row's height matched to what is on screen, so expanding never desyncs the
 * scrollbar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE DIVIDER
 * ─────────────────────────────────────────────────────────────────────────
 * Windowing only ever mounts a contiguous slice, with a spacer `<div>`
 * standing in for the rows above it — so an adjacent-sibling rule
 * (`.row + .row`) would drop the first mounted row's divider depending on
 * scroll position. The divider is decided from the row's own list index
 * instead (`index > 0`), which is right regardless of which rows are mounted.
 */
import { useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  HiOutlineChevronRight,
  HiOutlinePencilSquare,
  HiOutlineTag,
  HiOutlineTrash,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Scheme } from "@/services/schemeService";
import { describeBenefit, describeScope, describeTrigger } from "@/services/schemeService";

// A reasonable average collapsed-row height: enough that the spacer divs keep
// the scrollbar close to accurate without measuring every row up front. Real
// visible rows always render at their true (measured) height regardless.
const ESTIMATED_ROW_HEIGHT = 66;
const ROW_OVERSCAN = 12;

const BLOCK_TITLE = "mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle";
const BLOCK_LIST = "m-0 list-none space-y-1 p-0 text-[13px] text-body";

export default function SchemeList({
  schemes,
  isLoading,
  loadError,
  expandedId,
  setExpandedId,
  itemNameOf,
  openNew,
  openEdit,
  deleteScheme,
  deactivate,
  loadSchemes,
}: {
  schemes: Scheme[];
  isLoading: boolean;
  loadError: string;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  itemNameOf: (itemCode: string) => string;
  openNew: () => void;
  openEdit: (scheme: Scheme) => void;
  deleteScheme: (scheme: Scheme) => void;
  deactivate: (scheme: Scheme) => void;
  loadSchemes: () => void;
}) {
  // Where the list starts in the document, so the virtualizer can translate
  // its own (list-relative) offsets into real scroll positions. A ref
  // callback rather than a measuring effect: React calls it once the div is
  // in the document, so `offsetTop` is read off the live node on every render.
  const [wrapNode, setWrapNode] = useState<HTMLDivElement | null>(null);
  const scrollMargin = wrapNode?.offsetTop ?? 0;

  const rowVirtualizer = useVirtualizer({
    count: schemes.length,
    getScrollElement: () => (typeof document === "undefined" ? null : document.body),
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    scrollMargin,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMargin : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  if (isLoading) {
    return (
      <Card className="space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <EmptyState
          icon={HiOutlineTag}
          title="Could not load schemes"
          hint={loadError}
          action={<Button onClick={loadSchemes}>Try again</Button>}
        />
      </Card>
    );
  }

  if (schemes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={HiOutlineTag}
          title="No schemes yet"
          hint="A scheme is an offer: what a vendor has to buy, and what they get free."
          action={
            <Button variant="primary" onClick={openNew}>
              New scheme
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div ref={setWrapNode}>
        {paddingTop > 0 && <div aria-hidden="true" style={{ height: paddingTop }} />}
        {virtualRows.map((virtualRow) => {
          const scheme = schemes[virtualRow.index];
          if (!scheme) return null;
          const isOpen = expandedId === scheme.id;
          const grants = scheme.assignments.filter((a) => !a.is_exclusion);
          const exclusions = scheme.assignments.filter((a) => a.is_exclusion);
          const buy = scheme.triggers[0]
            ? describeTrigger(scheme.triggers[0], itemNameOf)
            : "no rule set";
          const get = scheme.benefits[0]
            ? describeBenefit(scheme.benefits[0], itemNameOf)
            : "nothing set";
          const extras = scheme.triggers.length + scheme.benefits.length - 2;

          return (
            <div
              key={scheme.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className={cn(
                virtualRow.index > 0 && "border-t border-line",
                !scheme.is_active && "bg-surface/60",
              )}
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : scheme.id)}
                  aria-expanded={isOpen}
                  className={cn(
                    "appearance-none border-0 bg-transparent [font-family:inherit] cursor-pointer",
                    "flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left",
                    "transition-colors hover:bg-surface focus-visible:outline-none focus-visible:shadow-focus",
                  )}
                >
                  <HiOutlineChevronRight
                    aria-hidden="true"
                    className={cn(
                      "size-4 shrink-0 text-subtle transition-transform",
                      isOpen && "rotate-90",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "text-[13.5px] font-semibold",
                          scheme.is_active ? "text-ink" : "text-subtle line-through",
                        )}
                      >
                        {scheme.name}
                      </span>
                      {!scheme.is_active && <Badge tone="bad">Off</Badge>}
                    </span>
                    {/* The whole offer as one sentence — this line is what the
                        list is for. */}
                    <span className="mt-0.5 block text-[12.5px] text-subtle">
                      {buy} → <strong className="font-semibold text-ink">{get}</strong>
                      {extras > 0 ? ` · +${extras} more` : ""}
                    </span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-2 sm:flex">
                    {scheme.category && <Badge tone="ok">{scheme.category}</Badge>}
                    {grants.length === 0 ? (
                      <Badge tone="hold">Nobody yet</Badge>
                    ) : (
                      <span className="text-[12px] text-subtle">
                        {describeScope(grants[0])}
                        {grants.length > 1 ? ` +${grants.length - 1}` : ""}
                        {exclusions.length ? " *" : ""}
                      </span>
                    )}
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-0.5 pr-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(scheme)}
                    title="Edit"
                    aria-label={`Edit ${scheme.code}`}
                  >
                    <HiOutlinePencilSquare aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-danger hover:bg-danger-soft hover:text-danger"
                    onClick={() => deleteScheme(scheme)}
                    title="Delete"
                    aria-label={`Delete ${scheme.code}`}
                  >
                    <HiOutlineTrash aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-line bg-surface px-4 py-4">
                  <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                    <div>
                      <div className={BLOCK_TITLE}>To earn it</div>
                      <ul className={BLOCK_LIST}>
                        {scheme.triggers.map((trigger, i) => (
                          <li key={i}>{describeTrigger(trigger, itemNameOf)}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className={BLOCK_TITLE}>They get</div>
                      <ul className={BLOCK_LIST}>
                        {scheme.benefits.map((benefit, i) => (
                          <li key={i} className="font-semibold text-ok">
                            {describeBenefit(benefit, itemNameOf)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className={BLOCK_TITLE}>Sent to</div>
                      <div className="flex flex-wrap gap-1.5">
                        {grants.length === 0 && exclusions.length === 0 ? (
                          <Badge tone="hold">Nobody yet</Badge>
                        ) : (
                          <>
                            {grants.map((assignment, i) => (
                              <Badge key={assignment.id ?? `g${i}`} tone="info">
                                {describeScope(assignment)}
                              </Badge>
                            ))}
                            {exclusions.map((assignment, i) => (
                              <Badge key={assignment.id ?? `e${i}`} tone="bad">
                                not {describeScope(assignment)}
                              </Badge>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className={BLOCK_TITLE}>Runs</div>
                      <ul className={BLOCK_LIST}>
                        <li>
                          {scheme.valid_from || scheme.valid_to
                            ? `${scheme.valid_from || "any time"} to ${scheme.valid_to || "no end"}`
                            : "Always"}
                        </li>
                        <li className="text-subtle">
                          {scheme.code}
                          {scheme.category ? ` · ${scheme.category}` : " · all categories"}
                          {scheme.stackable ? " · combines with others" : ""}
                        </li>
                        {scheme.description && (
                          <li className="text-subtle">{scheme.description}</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button size="sm" onClick={() => openEdit(scheme)}>
                      <HiOutlinePencilSquare aria-hidden="true" /> Edit
                    </Button>
                    {scheme.is_active && (
                      <Button size="sm" onClick={() => deactivate(scheme)}>
                        Turn off
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {paddingBottom > 0 && <div aria-hidden="true" style={{ height: paddingBottom }} />}
      </div>
    </Card>
  );
}
