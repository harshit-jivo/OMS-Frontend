/**
 * The scheme editor — a 4-step wizard (name, offer, who, review) written as a
 * sentence you fill in rather than a grid of jargon fields.
 *
 * Takes the whole `useSchemeManager()` result the way `OrderWizard` takes the
 * whole `useSalesOrderForm()` result — this modal reads most of what the hook
 * exposes (draft, wizard step, gap-checking, save), so destructuring a curated
 * subset would just re-list nearly everything anyway.
 *
 * The "sentence" rows — `at least [10] [boxes] of [this item] [Jivo Canola]`
 * — are kept: a scheme reads as an offer, and a grid of labelled fields does
 * not. Each control in a sentence is sized to its content rather than to the
 * grid, which is the one place a form on this page departs from `FormGrid`.
 */
import {
  HiOutlineCheck,
  HiOutlineExclamationTriangle,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchSelect } from "@/components/ui/dropdown";
import { Checkbox, Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/page";
import { cn } from "@/lib/utils";
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
import { PRODUCT_PICKER_LIMIT } from "./productOptions";

const WORD = "text-[13px] text-body";
const SENTENCE = "flex flex-wrap items-center gap-2";
const BLOCK_TITLE = "mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle";

function StepHeading({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
        {n}
      </span>
      <div>
        <h4 className="m-0 text-[15px] font-semibold text-ink">{title}</h4>
        <p className="m-0 text-[12.5px] text-subtle">{hint}</p>
      </div>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" title="Remove" aria-label="Remove" onClick={onClick}>
      <HiOutlineXMark aria-hidden="true" />
    </Button>
  );
}

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
    itemOptions: items,
    itemNameOf,
    targetOptions,
  } = sm;
  const title = editingId ? editingScheme?.name || "Edit scheme" : "New scheme";

  return (
    <Dialog open={editingId !== null} onOpenChange={(next) => !next && closeEditor()}>
      <DialogContent title={title} size="lg">
        <DialogHeader className="items-start">
          <div className="min-w-0">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>An offer, what earns it, and who gets it.</DialogDescription>
          </div>
        </DialogHeader>

        {/* The stepper. Steps ahead of the first incomplete one are disabled:
            a half-built offer cannot be reviewed. */}
        <ol className="m-0 flex list-none gap-1 border-b border-line bg-surface px-4 py-2">
          {EDITOR_STEPS.map((step) => {
            const current = step.n === editorStep;
            const done = step.n < editorStep && (gapsByStep[step.n] ?? []).length === 0;
            const reachable = step.n <= editorStep || step.n <= firstIncompleteStep;
            return (
              <li key={step.n} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => goToStep(step.n)}
                  disabled={!reachable}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "appearance-none border-0 bg-transparent [font-family:inherit] cursor-pointer",
                    "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[12.5px] font-medium",
                    "transition-colors focus-visible:outline-none focus-visible:shadow-focus",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    current ? "bg-card text-ink shadow-card" : "text-subtle hover:text-body",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      done
                        ? "bg-ok text-white"
                        : current
                          ? "bg-brand text-white"
                          : "bg-surface-strong text-subtle",
                    )}
                  >
                    {done ? <HiOutlineCheck aria-hidden="true" className="size-3" /> : step.n}
                  </span>
                  <span className="truncate">{step.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <DialogBody>
          {/* 1 — name it ------------------------------------------------ */}
          <section hidden={editorStep !== 1}>
            <StepHeading n={1} title="Name it" hint="What you will recognise it by later." />
            <FormGrid>
              <Field label="Name" span="full">
                {(control) => (
                  <Input
                    {...control}
                    value={draft.name}
                    onChange={(e) => patchDraft({ name: e.target.value })}
                    placeholder="1 free piece on 10 boxes"
                  />
                )}
              </Field>
              <Field label="Short code">
                {(control) => (
                  <Input
                    {...control}
                    value={draft.code}
                    onChange={(e) => patchDraft({ code: e.target.value })}
                    placeholder="PB-CP1L-Q4"
                  />
                )}
              </Field>
              <Field label="Applies to">
                {(control) => (
                  <Select
                    {...control}
                    value={draft.category}
                    onChange={(e) => patchDraft({ category: e.target.value })}
                  >
                    <option value="">Every category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c} only
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Starts">
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={draft.valid_from || ""}
                    onChange={(e) => patchDraft({ valid_from: e.target.value || null })}
                  />
                )}
              </Field>
              <Field label="Ends">
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={draft.valid_to || ""}
                    onChange={(e) => patchDraft({ valid_to: e.target.value || null })}
                  />
                )}
              </Field>
            </FormGrid>
          </section>

          {/* 2 — the rule ----------------------------------------------- */}
          <section hidden={editorStep !== 2}>
            <StepHeading n={2} title="Write the offer" hint="Buy this much, get that free." />

            <div className={BLOCK_TITLE}>To earn it, the vendor must buy</div>
            <div className="space-y-2">
              {draft.triggers.map((trigger, index) => (
                <div key={index} className={SENTENCE}>
                  <span className={WORD}>at least</span>
                  <Input
                    type="number"
                    min="0"
                    className="w-24"
                    aria-label="Minimum quantity"
                    value={trigger.min_qty}
                    onChange={(e) => patchTrigger(index, { min_qty: e.target.value })}
                    placeholder="0"
                  />
                  <Select
                    className="w-32"
                    aria-label="Unit"
                    value={trigger.min_uom}
                    onChange={(e) => patchTrigger(index, { min_uom: e.target.value as Uom })}
                  >
                    {UOM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <span className={WORD}>of</span>
                  <Select
                    className="w-44"
                    aria-label="Match on"
                    value={trigger.match_type}
                    onChange={(e) =>
                      patchTrigger(index, { match_type: e.target.value as MatchType })
                    }
                  >
                    {MATCH_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  {trigger.match_type !== "ALL" && (
                    <span className="min-w-[220px] flex-1">
                      {trigger.match_type === "ITEM" ? (
                        <SearchSelect
                          value={trigger.match_value}
                          onChange={(itemCode) => patchTrigger(index, { match_value: itemCode })}
                          options={items}
                          placeholder="search the product…"
                          searchPlaceholder="Product name or code"
                          maxShown={PRODUCT_PICKER_LIMIT}
                        />
                      ) : (
                        <Input
                          aria-label="Match value"
                          value={trigger.match_value}
                          onChange={(e) => patchTrigger(index, { match_value: e.target.value })}
                          placeholder="OLIVE"
                        />
                      )}
                    </span>
                  )}
                  {draft.triggers.length > 1 && (
                    <RemoveButton
                      onClick={() =>
                        patchDraft({ triggers: draft.triggers.filter((_, i) => i !== index) })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="link"
              size="inline"
              className="mt-2 text-[13px]"
              onClick={() => patchDraft({ triggers: [...draft.triggers, emptyTrigger()] })}
            >
              <HiOutlinePlus aria-hidden="true" /> another way to earn it
            </Button>

            <div className={cn(BLOCK_TITLE, "mt-6")}>And they get</div>
            <div className="space-y-2">
              {draft.benefits.map((benefit, index) => (
                <div key={index} className={SENTENCE}>
                  <Input
                    type="number"
                    min="0"
                    className="w-24"
                    aria-label="Free quantity"
                    value={benefit.free_qty}
                    onChange={(e) => patchBenefit(index, { free_qty: e.target.value })}
                    placeholder="1"
                  />
                  <Select
                    className="w-32"
                    aria-label="Free unit"
                    value={benefit.free_uom}
                    onChange={(e) => patchBenefit(index, { free_uom: e.target.value as Uom })}
                  >
                    {UOM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <span className={WORD}>of</span>
                  <span className="min-w-[220px] flex-1">
                    <SearchSelect
                      value={benefit.free_item_code ?? ""}
                      onChange={(itemCode) => patchBenefit(index, { free_item_code: itemCode })}
                      options={items}
                      placeholder="the same item they bought"
                      searchPlaceholder="Product name or code"
                      clearLabel="the same item they bought"
                      maxShown={PRODUCT_PICKER_LIMIT}
                    />
                  </span>
                  <span className={WORD}>free, for every</span>
                  <Input
                    type="number"
                    min="0"
                    className="w-24"
                    aria-label="Per quantity"
                    value={benefit.per_qty}
                    onChange={(e) => patchBenefit(index, { per_qty: e.target.value })}
                    placeholder="10"
                  />
                  <span className={WORD}>bought</span>
                  {draft.benefits.length > 1 && (
                    <RemoveButton
                      onClick={() =>
                        patchDraft({ benefits: draft.benefits.filter((_, i) => i !== index) })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="link"
              size="inline"
              className="mt-2 text-[13px]"
              onClick={() => patchDraft({ benefits: [...draft.benefits, emptyBenefit()] })}
            >
              <HiOutlinePlus aria-hidden="true" /> another free item
            </Button>

            <div className="mt-5 rounded-sm border border-brand-line bg-brand-soft/60 px-4 py-3 text-[13px] text-body">
              {draft.triggers.map((t) => describeTrigger(t, itemNameOf)).join(", or ")} →{" "}
              <strong className="font-semibold text-ink">
                {draft.benefits.map((b) => describeBenefit(b, itemNameOf)).join(" and ")}
              </strong>
            </div>
          </section>

          {/* 3 — who gets it -------------------------------------------- */}
          <section hidden={editorStep !== 3}>
            <StepHeading
              n={3}
              title="Say who gets it"
              hint="Until there is a line here, the offer reaches nobody."
            />

            {draft.assignments.length === 0 && (
              <p className="m-0 mb-3 text-[13px] text-subtle">No one yet.</p>
            )}

            <div className="space-y-2">
              {draft.assignments.map((assignment, index) => (
                <div key={assignment.id ?? `new-${index}`} className={SENTENCE}>
                  <Select
                    className="w-32"
                    aria-label="Send or exclude"
                    value={assignment.is_exclusion ? "EXCLUDE" : "SEND"}
                    onChange={(e) =>
                      patchAssignment(index, { is_exclusion: e.target.value === "EXCLUDE" })
                    }
                  >
                    <option value="SEND">Send to</option>
                    <option value="EXCLUDE">Except</option>
                  </Select>
                  <Select
                    className="w-44"
                    aria-label="Kind of target"
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
                  </Select>
                  {assignment.scope_type !== "ALL" && (
                    <span className="min-w-[220px] flex-1">
                      <SearchSelect
                        value={assignment.scope_value}
                        onChange={(value) => patchAssignment(index, { scope_value: value })}
                        options={targetOptions(assignment.scope_type)}
                        placeholder="type to search…"
                        maxShown={PRODUCT_PICKER_LIMIT}
                      />
                    </span>
                  )}
                  <RemoveButton
                    onClick={() =>
                      patchDraft({
                        assignments: draft.assignments.filter((_, i) => i !== index),
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <Button
              variant="link"
              size="inline"
              className="mt-2 text-[13px]"
              onClick={() =>
                patchDraft({ assignments: [...draft.assignments, emptyAssignment()] })
              }
            >
              <HiOutlinePlus aria-hidden="true" /> who gets it
            </Button>
            {draft.assignments.some((a) => a.is_exclusion) && (
              <Notice tone="info" className="mt-4">
                An “Except” line always wins — use one to carve a vendor out of a state-wide
                offer.
              </Notice>
            )}
          </section>

          {/* 4 — read it back ------------------------------------------- */}
          <section hidden={editorStep !== 4}>
            <StepHeading
              n={4}
              title="Check it over"
              hint="This is the whole offer. Nothing is saved until you press Create."
            />

            <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2.5 text-[13px]">
              <dt className="font-medium text-subtle">Offer</dt>
              <dd className="m-0 text-body">
                <strong className="font-semibold text-ink">{draft.name || "—"}</strong>
                {draft.code ? ` · ${draft.code}` : ""}
                {draft.category ? ` · ${draft.category} only` : " · every category"}
              </dd>
              <dt className="font-medium text-subtle">Runs</dt>
              <dd className="m-0 text-body">
                {draft.valid_from || draft.valid_to
                  ? `${draft.valid_from || "any time"} to ${draft.valid_to || "no end"}`
                  : "No date limit"}
              </dd>
              <dt className="font-medium text-subtle">Earns it</dt>
              <dd className="m-0 text-body">
                {draft.triggers.map((t) => describeTrigger(t, itemNameOf)).join(", or ")}
              </dd>
              <dt className="font-medium text-subtle">Gives</dt>
              <dd className="m-0 font-semibold text-ok">
                {draft.benefits.map((b) => describeBenefit(b, itemNameOf)).join(" and ")}
              </dd>
              <dt className="font-medium text-subtle">Goes to</dt>
              <dd className="m-0 text-body">
                {draft.assignments.length === 0 ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-hold">
                    <HiOutlineExclamationTriangle aria-hidden="true" className="size-4" />
                    Nobody yet — it will exist but never apply.
                  </span>
                ) : (
                  draft.assignments
                    .map((a) => `${a.is_exclusion ? "except " : ""}${describeScope(a)}`)
                    .join(", ")
                )}
              </dd>
              {!draft.is_active && (
                <>
                  <dt className="font-medium text-subtle">Status</dt>
                  <dd className="m-0 font-medium text-hold">
                    Off — it will not apply until switched on.
                  </dd>
                </>
              )}
            </dl>

            {/* everything most people never touch ------------------------ */}
            <details
              className="mt-6 rounded-md border border-line"
              open={showAdvanced}
              onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer select-none px-4 py-2.5 text-[12.5px] font-semibold text-body">
                Rare settings
              </summary>
              <div className="border-t border-line px-4 py-4">
                <FormGrid>
                  <Field label="Note" span="full">
                    {(control) => (
                      <Input
                        {...control}
                        value={draft.description}
                        onChange={(e) => patchDraft({ description: e.target.value })}
                        placeholder="For whoever reads this later"
                      />
                    )}
                  </Field>
                  <Field
                    label="Wins over offers below"
                    hint="Higher number wins a clash on the same free item."
                  >
                    {(control) => (
                      <Input
                        {...control}
                        type="number"
                        value={draft.priority}
                        onChange={(e) => patchDraft({ priority: Number(e.target.value) })}
                      />
                    )}
                  </Field>
                  <Field
                    label="Count towards the offer"
                    hint={
                      APPLIES_TO_OPTIONS.find(
                        (o) => o.value === (draft.triggers[0]?.applies_to ?? "PAID_LINE"),
                      )?.hint
                    }
                  >
                    {(control) => (
                      <Select
                        {...control}
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
                      </Select>
                    )}
                  </Field>
                  <div className="col-span-full flex flex-wrap gap-6">
                    <Checkbox
                      label="On"
                      checked={draft.is_active}
                      onChange={(e) => patchDraft({ is_active: e.target.checked })}
                    />
                    <Checkbox
                      label="Can combine with other offers"
                      checked={draft.stackable}
                      onChange={(e) => patchDraft({ stackable: e.target.checked })}
                    />
                  </div>
                  <Field label="Most free items per order line" span="full">
                    {(control) => (
                      <Input
                        {...control}
                        type="number"
                        min="0"
                        value={draft.benefits[0]?.max_free_qty ?? ""}
                        onChange={(e) => patchBenefit(0, { max_free_qty: e.target.value })}
                        placeholder="no limit"
                      />
                    )}
                  </Field>
                </FormGrid>
              </div>
            </details>
          </section>
        </DialogBody>

        <DialogFooter className="flex-wrap">
          {/* What is still missing sits left, apart from the buttons; the
              buttons keep Back / Cancel / Next in reading order. */}
          <span className="mr-auto min-w-0 text-[12.5px] text-hold">
            {!canLeaveStep ? (
              <>Still needs {currentStepGaps.join(", ")}.</>
            ) : editorStep === 4 && !canSave ? (
              <>
                Still needs {missing.join(", ")} —{" "}
                <Button
                  variant="link"
                  size="inline"
                  onClick={() => setEditorStep(firstIncompleteStep)}
                >
                  go fix it
                </Button>
                .
              </>
            ) : null}
          </span>
          {editorStep > 1 && (
            <Button onClick={() => setEditorStep(editorStep - 1)}>Back</Button>
          )}
          <Button variant="ghost" onClick={closeEditor}>
            Cancel
          </Button>
          {editorStep < 4 ? (
            <Button
              variant="primary"
              disabled={!canLeaveStep}
              onClick={() => setEditorStep(editorStep + 1)}
            >
              Next
            </Button>
          ) : (
            <Button variant="primary" disabled={!canSave || isSaving} onClick={saveScheme}>
              {isSaving ? "Saving…" : editingId ? "Save" : "Create scheme"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
