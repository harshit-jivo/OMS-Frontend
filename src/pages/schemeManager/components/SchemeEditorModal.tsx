/**
 * The scheme editor — a 4-step wizard (name, offer, who, review) written as a
 * sentence you fill in rather than a grid of jargon fields.
 *
 * Split out of `Scheme_Manager.tsx` (Phase 4) verbatim. Takes the whole
 * `useSchemeManager()` result the way `OrderWizard` takes the whole
 * `useSalesOrderForm()` result — this modal reads most of what the hook
 * exposes (draft, wizard step, gap-checking, save), so destructuring a curated
 * subset would just re-list nearly everything anyway.
 */
import {
  APPLIES_TO_OPTIONS,
  MATCH_TYPE_OPTIONS,
  SCOPE_TYPE_OPTIONS,
  UOM_OPTIONS,
  describeBenefit,
  describeScope,
  describeTrigger,
  emptyAssignment,
  emptyBenefit,
  emptyTrigger,
} from "@/services/schemeService";
import type { AppliesTo, MatchType, ScopeType, Uom } from "@/services/schemeService";

import { CATEGORIES } from "../schemeManagerHelpers";
import type { SchemeManagerState } from "../useSchemeManager";
import ItemPicker from "./ItemPicker";

export default function SchemeEditorModal({ sm }: { sm: SchemeManagerState }) {
  const {
    editingId,
    editingScheme,
    draft,
    isSaving,
    showAdvanced,
    setShowAdvanced,
    editorStep,
    setEditorStep,
    closeEditor,
    patchDraft,
    patchTrigger,
    patchBenefit,
    patchAssignment,
    EDITOR_STEPS,
    gapsByStep,
    missing,
    canSave,
    currentStepGaps,
    canLeaveStep,
    firstIncompleteStep,
    goToStep,
    saveScheme,
    products,
    itemNameOf,
    targetOptions,
  } = sm;

  return (
    <>
      <div className="sch-scrim" onClick={closeEditor} />
      <div className="sch-modal" role="dialog" aria-modal="true" aria-labelledby="sch-editor-title">
        <div className="sch-modal-head">
          <div>
            <h2 id="sch-editor-title">{editingId ? editingScheme?.name || "Edit scheme" : "New scheme"}</h2>
            <p>An offer, what earns it, and who gets it.</p>
          </div>
          <button type="button" className="sch-x" onClick={closeEditor} aria-label="Close">
            ×
          </button>
        </div>

        <ol className="sch-stepper">
          {EDITOR_STEPS.map((step) => {
            const done = step.n < editorStep && (gapsByStep[step.n] ?? []).length === 0;
            const reachable = step.n <= editorStep || step.n <= firstIncompleteStep;
            return (
              <li
                key={step.n}
                className={`sch-stepper-item${step.n === editorStep ? " is-current" : ""}${
                  done ? " is-done" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => goToStep(step.n)}
                  disabled={!reachable}
                  aria-current={step.n === editorStep ? "step" : undefined}
                >
                  <span className="sch-stepper-n">{done ? "✓" : step.n}</span>
                  <span className="sch-stepper-label">{step.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="sch-modal-body">
          {/* 1 — the offer -------------------------------------- */}
          <section className="sch-section" hidden={editorStep !== 1}>
            <div className="sch-step">
              <span className="sch-step-n">1</span>
              <div>
                <h3>Name it</h3>
                <p>What you will recognise it by later.</p>
              </div>
            </div>

            <div className="sch-grid">
              <div className="sch-span-2">
                <label className="sch-label">Name</label>
                <input
                  className="sch-input"
                  value={draft.name}
                  onChange={(e) => patchDraft({ name: e.target.value })}
                  placeholder="1 free piece on 10 boxes"
                />
              </div>
              <div>
                <label className="sch-label">Short code</label>
                <input
                  className="sch-input"
                  value={draft.code}
                  onChange={(e) => patchDraft({ code: e.target.value })}
                  placeholder="PB-CP1L-Q4"
                />
              </div>
              <div>
                <label className="sch-label">Applies to</label>
                <select
                  className="sch-select"
                  value={draft.category}
                  onChange={(e) => patchDraft({ category: e.target.value })}
                >
                  <option value="">Every category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c} only
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sch-label">Starts</label>
                <input
                  type="date"
                  className="sch-input"
                  value={draft.valid_from || ""}
                  onChange={(e) => patchDraft({ valid_from: e.target.value || null })}
                />
              </div>
              <div>
                <label className="sch-label">Ends</label>
                <input
                  type="date"
                  className="sch-input"
                  value={draft.valid_to || ""}
                  onChange={(e) => patchDraft({ valid_to: e.target.value || null })}
                />
              </div>
            </div>
          </section>

          {/* 2 — the rule --------------------------------------- */}
          <section className="sch-section" hidden={editorStep !== 2}>
            <div className="sch-step">
              <span className="sch-step-n">2</span>
              <div>
                <h3>Write the offer</h3>
                <p>Buy this much, get that free.</p>
              </div>
            </div>

            <div className="sch-block-title">To earn it, the vendor must buy</div>
            {draft.triggers.map((trigger, index) => (
              <div key={index} className="sch-sentence">
                <span className="sch-word">at least</span>
                <input
                  type="number"
                  min="0"
                  className="sch-input sch-w-qty"
                  value={trigger.min_qty}
                  onChange={(e) => patchTrigger(index, { min_qty: e.target.value })}
                  placeholder="0"
                />
                <select
                  className="sch-select sch-w-uom"
                  value={trigger.min_uom}
                  onChange={(e) => patchTrigger(index, { min_uom: e.target.value as Uom })}
                >
                  {UOM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="sch-word">of</span>
                <select
                  className="sch-select sch-w-match"
                  value={trigger.match_type}
                  onChange={(e) => patchTrigger(index, { match_type: e.target.value as MatchType })}
                >
                  {MATCH_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {trigger.match_type !== "ALL" && (
                  <span className="sch-w-value">
                    {trigger.match_type === "ITEM" ? (
                      <ItemPicker
                        value={trigger.match_value}
                        products={products}
                        onChange={(itemCode) => patchTrigger(index, { match_value: itemCode })}
                        placeholder="search the product..."
                      />
                    ) : (
                      <input
                        className="sch-input"
                        value={trigger.match_value}
                        onChange={(e) => patchTrigger(index, { match_value: e.target.value })}
                        placeholder="OLIVE"
                      />
                    )}
                  </span>
                )}
                {draft.triggers.length > 1 && (
                  <button
                    type="button"
                    className="sch-x sch-x-sm"
                    title="Remove"
                    onClick={() =>
                      patchDraft({ triggers: draft.triggers.filter((_, i) => i !== index) })
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="sch-add"
              onClick={() => patchDraft({ triggers: [...draft.triggers, emptyTrigger()] })}
            >
              + another way to earn it
            </button>

            <div className="sch-block-title sch-mt">And they get</div>
            {draft.benefits.map((benefit, index) => (
              <div key={index} className="sch-sentence">
                <input
                  type="number"
                  min="0"
                  className="sch-input sch-w-qty"
                  value={benefit.free_qty}
                  onChange={(e) => patchBenefit(index, { free_qty: e.target.value })}
                  placeholder="1"
                />
                <select
                  className="sch-select sch-w-uom"
                  value={benefit.free_uom}
                  onChange={(e) => patchBenefit(index, { free_uom: e.target.value as Uom })}
                >
                  {UOM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="sch-word">of</span>
                <span className="sch-w-value">
                  <ItemPicker
                    value={benefit.free_item_code ?? ""}
                    products={products}
                    onChange={(itemCode) => patchBenefit(index, { free_item_code: itemCode })}
                    placeholder="search the free product..."
                    allowClear
                    clearLabel="the same item they bought"
                  />
                </span>
                <span className="sch-word">free, for every</span>
                <input
                  type="number"
                  min="0"
                  className="sch-input sch-w-qty"
                  value={benefit.per_qty}
                  onChange={(e) => patchBenefit(index, { per_qty: e.target.value })}
                  placeholder="10"
                />
                <span className="sch-word">bought</span>
                {draft.benefits.length > 1 && (
                  <button
                    type="button"
                    className="sch-x sch-x-sm"
                    title="Remove"
                    onClick={() =>
                      patchDraft({ benefits: draft.benefits.filter((_, i) => i !== index) })
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="sch-add"
              onClick={() => patchDraft({ benefits: [...draft.benefits, emptyBenefit()] })}
            >
              + another free item
            </button>

            <div className="sch-readback">
              {draft.triggers.map((t) => describeTrigger(t, itemNameOf)).join(", or ")} →{" "}
              <strong>
                {draft.benefits.map((b) => describeBenefit(b, itemNameOf)).join(" and ")}
              </strong>
            </div>
          </section>

          {/* 3 — who gets it ------------------------------------ */}
          <section className="sch-section" hidden={editorStep !== 3}>
            <div className="sch-step">
              <span className="sch-step-n">3</span>
              <div>
                <h3>Say who gets it</h3>
                <p>Until there is a line here, the offer reaches nobody.</p>
              </div>
            </div>

            {draft.assignments.length === 0 && (
              <div className="sch-empty-inline">No one yet.</div>
            )}

            {draft.assignments.map((assignment, index) => (
              <div key={assignment.id ?? `new-${index}`} className="sch-sentence">
                <select
                  className="sch-select sch-w-mode"
                  value={assignment.is_exclusion ? "EXCLUDE" : "SEND"}
                  onChange={(e) =>
                    patchAssignment(index, { is_exclusion: e.target.value === "EXCLUDE" })
                  }
                >
                  <option value="SEND">Send to</option>
                  <option value="EXCLUDE">Except</option>
                </select>
                <select
                  className="sch-select sch-w-match"
                  value={assignment.scope_type}
                  onChange={(e) =>
                    patchAssignment(index, {
                      scope_type: e.target.value as ScopeType,
                      scope_value: "",
                    })
                  }
                >
                  {SCOPE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {assignment.scope_type !== "ALL" && (
                  <span className="sch-w-value">
                    <input
                      className="sch-input"
                      list={`targets-${assignment.scope_type}`}
                      value={assignment.scope_value}
                      onChange={(e) => patchAssignment(index, { scope_value: e.target.value })}
                      placeholder="type to search..."
                    />
                    <datalist id={`targets-${assignment.scope_type}`}>
                      {targetOptions(assignment.scope_type).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </datalist>
                  </span>
                )}
                <button
                  type="button"
                  className="sch-x sch-x-sm"
                  title="Remove"
                  onClick={() =>
                    patchDraft({
                      assignments: draft.assignments.filter((_, i) => i !== index),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="sch-add"
              onClick={() =>
                patchDraft({ assignments: [...draft.assignments, emptyAssignment()] })
              }
            >
              + who gets it
            </button>
            {draft.assignments.some((a) => a.is_exclusion) && (
              <div className="sch-hint">
                An “Except” line always wins — use one to carve a vendor out of a state-wide
                offer.
              </div>
            )}
          </section>

          {/* 4 — read it back ----------------------------------- */}
          <section className="sch-section" hidden={editorStep !== 4}>
            <div className="sch-step">
              <span className="sch-step-n">4</span>
              <div>
                <h3>Check it over</h3>
                <p>This is the whole offer. Nothing is saved until you press Create.</p>
              </div>
            </div>

            <dl className="sch-review">
              <div>
                <dt>Offer</dt>
                <dd>
                  <strong>{draft.name || "—"}</strong>
                  {draft.code ? ` · ${draft.code}` : ""}
                  {draft.category ? ` · ${draft.category} only` : " · every category"}
                </dd>
              </div>
              <div>
                <dt>Runs</dt>
                <dd>
                  {draft.valid_from || draft.valid_to
                    ? `${draft.valid_from || "any time"} to ${draft.valid_to || "no end"}`
                    : "No date limit"}
                </dd>
              </div>
              <div>
                <dt>Earns it</dt>
                <dd>{draft.triggers.map((t) => describeTrigger(t, itemNameOf)).join(", or ")}</dd>
              </div>
              <div>
                <dt>Gives</dt>
                <dd className="sch-review-gives">
                  {draft.benefits.map((b) => describeBenefit(b, itemNameOf)).join(" and ")}
                </dd>
              </div>
              <div>
                <dt>Goes to</dt>
                <dd>
                  {draft.assignments.length === 0 ? (
                    <span className="sch-review-warn">
                      Nobody yet — it will exist but never apply.
                    </span>
                  ) : (
                    draft.assignments
                      .map(
                        (a) =>
                          `${a.is_exclusion ? "except " : ""}${describeScope(a)}`,
                      )
                      .join(", ")
                  )}
                </dd>
              </div>
              {!draft.is_active && (
                <div>
                  <dt>Status</dt>
                  <dd className="sch-review-warn">Off — it will not apply until switched on.</dd>
                </div>
              )}
            </dl>

          {/* everything most people never touch ------------------ */}
          <details
            className="sch-learn"
            open={showAdvanced}
            onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
          >
            <summary>Rare settings</summary>
            <div className="sch-learn-body">
              <div className="sch-grid">
                <div className="sch-span-2">
                  <label className="sch-label">Note</label>
                  <input
                    className="sch-input"
                    value={draft.description}
                    onChange={(e) => patchDraft({ description: e.target.value })}
                    placeholder="For whoever reads this later"
                  />
                </div>
                <div>
                  <label className="sch-label">Wins over offers below</label>
                  <input
                    type="number"
                    className="sch-input"
                    value={draft.priority}
                    onChange={(e) => patchDraft({ priority: Number(e.target.value) })}
                  />
                  <div className="sch-hint">Higher number wins a clash on the same free item.</div>
                </div>
                <div>
                  <label className="sch-label">Count towards the offer</label>
                  <select
                    className="sch-select"
                    value={draft.triggers[0]?.applies_to ?? "PAID_LINE"}
                    onChange={(e) =>
                      patchDraft({
                        triggers: draft.triggers.map((t) => ({
                          ...t,
                          applies_to: e.target.value as AppliesTo,
                        })),
                      })
                    }
                  >
                    {APPLIES_TO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <div className="sch-hint">
                    {
                      APPLIES_TO_OPTIONS.find(
                        (o) => o.value === (draft.triggers[0]?.applies_to ?? "PAID_LINE"),
                      )?.hint
                    }
                  </div>
                </div>
                <div className="sch-span-2">
                  <div className="sch-toggles">
                    <label className="sch-check">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(e) => patchDraft({ is_active: e.target.checked })}
                      />
                      On
                    </label>
                    <label className="sch-check">
                      <input
                        type="checkbox"
                        checked={draft.stackable}
                        onChange={(e) => patchDraft({ stackable: e.target.checked })}
                      />
                      Can combine with other offers
                    </label>
                  </div>
                </div>
                <div className="sch-span-2">
                  <label className="sch-label">Most free items per order line</label>
                  <input
                    type="number"
                    min="0"
                    className="sch-input"
                    value={draft.benefits[0]?.max_free_qty ?? ""}
                    onChange={(e) => patchBenefit(0, { max_free_qty: e.target.value })}
                    placeholder="no limit"
                  />
                </div>
              </div>
            </div>
          </details>
          </section>
        </div>

        <div className="sch-modal-foot">
          {editorStep > 1 && (
            <button
              type="button"
              className="sch-btn"
              onClick={() => setEditorStep(editorStep - 1)}
            >
              Back
            </button>
          )}

          {editorStep < 4 ? (
            <button
              type="button"
              className="sch-btn-primary"
              disabled={!canLeaveStep}
              onClick={() => setEditorStep(editorStep + 1)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="sch-btn-primary"
              disabled={!canSave || isSaving}
              onClick={saveScheme}
            >
              {isSaving ? "Saving..." : editingId ? "Save" : "Create scheme"}
            </button>
          )}

          <button type="button" className="sch-btn" onClick={closeEditor}>
            Cancel
          </button>

          {!canLeaveStep ? (
            <span className="sch-missing">Still needs {currentStepGaps.join(", ")}.</span>
          ) : (
            editorStep === 4 &&
            !canSave && (
              <span className="sch-missing">
                Still needs {missing.join(", ")} —{" "}
                <button
                  type="button"
                  className="sch-linkish"
                  onClick={() => setEditorStep(firstIncompleteStep)}
                >
                  go fix it
                </button>
                .
              </span>
            )
          )}
        </div>
      </div>
    </>
  );
}
