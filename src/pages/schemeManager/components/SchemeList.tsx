/**
 * The scheme list — Phase 4 split, plus row virtualization.
 *
 * Rendering is unchanged: every row, chip and detail panel below is the same
 * markup `Scheme_Manager.tsx` used to render inline via `schemes.map(...)`.
 * What changed is HOW MANY of those rows are ever mounted at once.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY `useWindowVirtualizer`, NOT a scrolling container
 * ─────────────────────────────────────────────────────────────────────────
 * `.sch-list` has never had an inner scrollbar — it sizes to its content and
 * the whole document scrolls. Giving it its own `overflow-y` + fixed height to
 * virtualize the usual way would be a real visual change (a new scrollbar
 * nested inside the page), which this split may not introduce. `useWindowVirtualizer`
 * measures against the document/window scroll position instead, so the page
 * keeps scrolling exactly as it always did — only the OFF-SCREEN rows stop
 * being mounted. Same technique as `invoiceReview/components/InvoiceTable.tsx`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY `measureElement`, NOT A FIXED ROW HEIGHT
 * ─────────────────────────────────────────────────────────────────────────
 * A collapsed row and an expanded one (the `sch-detail` accordion panel) differ
 * by a few hundred pixels, and only one row expands at a time (`expandedId`).
 * `measureElement` (a `ResizeObserver` under the hood — the same technique
 * `productStock/components/StockTable.tsx` uses for its own expand/collapse
 * row) keeps the virtualizer's notion of each row's height matched to what is
 * actually on screen, so expanding/collapsing never desyncs the scrollbar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE BORDER-TOP FIX
 * ─────────────────────────────────────────────────────────────────────────
 * `.sch-item + .sch-item` (adjacent-sibling CSS) drew the divider between
 * rows in the original, unvirtualized markup. Windowing only ever mounts a
 * contiguous slice, so that selector still matches between two rows that are
 * both on screen — but the FIRST rendered row of a given window has no
 * `.sch-item` before it in the DOM (a spacer `<div>` stands in for the
 * skipped rows instead), so it would silently lose its divider depending on
 * scroll position. The inline `borderTop` below reproduces the exact same
 * rule (`1px solid var(--sch-line)`, skipped on the very first scheme) from
 * the row's own list index instead of DOM adjacency, so the divider is
 * correct regardless of which rows happen to be mounted.
 */
import { useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

import type { Scheme } from "@/services/schemeService";
import { describeBenefit, describeScope, describeTrigger } from "@/services/schemeService";

import { CaretIcon, PencilIcon, TrashIcon } from "./icons";

// A reasonable average collapsed-row height: enough that the spacer divs keep
// the scrollbar close to accurate without measuring every row up front. Real
// visible rows always render at their true (measured) height regardless of
// this estimate — only the space standing in for UNRENDERED rows depends on it.
const ESTIMATED_ROW_HEIGHT = 66;
const ROW_OVERSCAN = 12;

const DIVIDER = { borderTop: "1px solid var(--sch-line)" } as const;

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
  // Where the list starts in the document, so the window virtualizer can
  // translate its own (list-relative) offsets into real scroll positions. A
  // ref callback rather than a measuring effect: React calls it once the div
  // is actually in the document, so `offsetTop` is read straight off the live
  // node on every render from then on — no extra render pass to converge on.
  const [wrapNode, setWrapNode] = useState<HTMLDivElement | null>(null);
  const scrollMargin = wrapNode?.offsetTop ?? 0;

  const rowVirtualizer = useWindowVirtualizer({
    count: schemes.length,
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

  return (
    <div className="sch-list" ref={setWrapNode}>
      {isLoading ? (
        <div className="sch-skeleton-wrap">
          <div className="sch-skeleton" />
          <div className="sch-skeleton" />
          <div className="sch-skeleton" />
        </div>
      ) : loadError ? (
        <div className="sch-state error">
          <h3>Could not load schemes</h3>
          <p>{loadError}</p>
          <button type="button" className="sch-btn" onClick={() => loadSchemes()}>
            Try again
          </button>
        </div>
      ) : schemes.length === 0 ? (
        <div className="sch-state">
          <h3>No schemes yet</h3>
          <p>A scheme is an offer: what a vendor has to buy, and what they get free.</p>
          <button type="button" className="sch-btn-primary" onClick={openNew}>
            + New scheme
          </button>
        </div>
      ) : (
        <>
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
            const extras =
              scheme.triggers.length + scheme.benefits.length - 2;

            return (
              <div
                key={scheme.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={virtualRow.index > 0 ? DIVIDER : undefined}
                className={[
                  "sch-item",
                  isOpen ? "is-open" : "",
                  scheme.is_active ? "" : "is-inactive",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="sch-row">
                  <button
                    type="button"
                    className="sch-row-open"
                    onClick={() => setExpandedId(isOpen ? null : scheme.id)}
                    aria-expanded={isOpen}
                  >
                    <CaretIcon />
                    <div className="sch-row-main">
                      <div className="sch-row-title">
                        <span className="sch-row-name">{scheme.name}</span>
                        {!scheme.is_active && <span className="sch-chip red">Off</span>}
                      </div>
                      {/* The whole offer as one sentence — this line is what the
                          list is for. */}
                      <div className="sch-row-sum">
                        {buy} → <strong>{get}</strong>
                        {extras > 0 ? ` · +${extras} more` : ""}
                      </div>
                    </div>
                    <div className="sch-row-side">
                      {scheme.category && <span className="sch-chip green">{scheme.category}</span>}
                      {grants.length === 0 ? (
                        <span className="sch-chip amber">Nobody yet</span>
                      ) : (
                        <span className="sch-reach">
                          {describeScope(grants[0])}
                          {grants.length > 1 ? ` +${grants.length - 1}` : ""}
                          {exclusions.length ? " *" : ""}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="sch-row-tools">
                    <button
                      type="button"
                      className="sch-icon-btn"
                      onClick={() => openEdit(scheme)}
                      title="Edit"
                      aria-label={`Edit ${scheme.code}`}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="sch-icon-btn is-danger"
                      onClick={() => deleteScheme(scheme)}
                      title="Delete"
                      aria-label={`Delete ${scheme.code}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="sch-detail">
                    <div className="sch-detail-grid">
                      <div className="sch-block">
                        <div className="sch-block-title">To earn it</div>
                        <ul>
                          {scheme.triggers.map((trigger, i) => (
                            <li key={i}>{describeTrigger(trigger, itemNameOf)}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="sch-block">
                        <div className="sch-block-title">They get</div>
                        <ul>
                          {scheme.benefits.map((benefit, i) => (
                            <li key={i} className="give">
                              {describeBenefit(benefit, itemNameOf)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="sch-block">
                        <div className="sch-block-title">Sent to</div>
                        <div className="sch-tags">
                          {grants.length === 0 && exclusions.length === 0 ? (
                            <span className="sch-chip amber">Nobody yet</span>
                          ) : (
                            <>
                              {grants.map((assignment, i) => (
                                <span key={assignment.id ?? `g${i}`} className="sch-chip blue">
                                  {describeScope(assignment)}
                                </span>
                              ))}
                              {exclusions.map((assignment, i) => (
                                <span key={assignment.id ?? `e${i}`} className="sch-chip red">
                                  not {describeScope(assignment)}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="sch-block">
                        <div className="sch-block-title">Runs</div>
                        <ul>
                          <li>
                            {scheme.valid_from || scheme.valid_to
                              ? `${scheme.valid_from || "any time"} to ${scheme.valid_to || "no end"}`
                              : "Always"}
                          </li>
                          <li className="muted">
                            {scheme.code}
                            {scheme.category ? ` · ${scheme.category}` : " · all categories"}
                            {scheme.stackable ? " · combines with others" : ""}
                          </li>
                          {scheme.description && <li className="muted">{scheme.description}</li>}
                        </ul>
                      </div>
                    </div>

                    <div className="sch-actions">
                      <button
                        type="button"
                        className="sch-btn sch-btn-sm"
                        onClick={() => openEdit(scheme)}
                      >
                        Edit
                      </button>
                      {scheme.is_active && (
                        <button
                          type="button"
                          className="sch-btn sch-btn-sm"
                          onClick={() => deactivate(scheme)}
                        >
                          Turn off
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {paddingBottom > 0 && <div aria-hidden="true" style={{ height: paddingBottom }} />}
        </>
      )}
    </div>
  );
}
