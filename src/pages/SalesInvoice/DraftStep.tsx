/**
 * Step 4 — the draft: header, contents, totals, and the post to SAP.
 */
import { useState } from "react";
import { HiOutlineCheckCircle, HiOutlinePlus, HiOutlineXMark } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form";
import { Card, Notice, SectionHeading } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import ContentsTab from "./ContentsTab";
import InteractiveLoader from "./InteractiveLoader";
import { formatDateDisplay, formatMoney, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
  onReset: () => void;
  onCreateNew: () => void;
  onAddItems?: () => void;
  onChangeBranch?: () => void;
};

// Small branch pill shown inside the party header, with a Change action that
// returns to the branch gate (clearing the current invoice).
export function BranchBadge({
  branch,
  onChange,
}: {
  branch: SalesInvoiceState["branch"];
  onChange?: () => void;
}) {
  if (!branch) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-strong py-0.5 pl-2.5 pr-1 text-[11.5px] text-ink">
      Branch: <strong className="font-semibold">{branch === "OIL" ? "Oil" : "Beverage"}</strong>
      {onChange && (
        <Button variant="ghost" size="inline" className="px-1.5 text-[11px]" onClick={onChange}>
          Change
        </Button>
      )}
    </span>
  );
}

/**
 * A date that stays read-only until double-clicked.
 *
 * Deliberate friction: the posting date drives the due and document dates and
 * lands in SAP, so it must not change because someone tabbed through it.
 */
function EditableDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [editable, setEditable] = useState(false);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-body">
        {label}
        <span className="ml-1.5 text-[11px] font-normal text-subtle">
          {editable ? "editing" : "double-click to edit"}
        </span>
      </span>
      <Input
        type="date"
        value={value}
        readOnly={!editable}
        className={cn("max-w-[190px]", !editable && "cursor-default bg-surface-strong")}
        onDoubleClick={(event) => {
          // Capture the element now — React nulls event.currentTarget once the
          // handler returns, so the deferred callback can't read it.
          const input = event.currentTarget;
          setEditable(true);
          window.requestAnimationFrame(() => {
            input.focus();
            try {
              input.showPicker?.();
            } catch {
              /* showPicker needs a mutable input + user gesture; ignore if it can't open */
            }
          });
        }}
        onBlur={() => setEditable(false)}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export default function DraftStep({
  state,
  onReset,
  onCreateNew,
  onAddItems,
  onChangeBranch,
}: Props) {
  const [totalsModalOpen, setTotalsModalOpen] = useState(false);
  // The error and success banners are not independent state — they are open
  // whenever the hook is reporting an error or a success the user has not
  // dismissed yet. Storing what was DISMISSED instead of what is OPEN keeps
  // that a render-time derivation. `submitForReview` below clears both markers
  // as it starts a post, which is what makes a repeat of the identical error
  // message show again rather than stay dismissed.
  const [dismissedPostError, setDismissedPostError] = useState<string | null>(null);
  const [dismissedPostSuccess, setDismissedPostSuccess] = useState<string | null>(null);
  const postErrorNotificationOpen =
    Boolean(state.postError) && state.postError !== dismissedPostError;
  const successModalOpen =
    Boolean(state.postSuccess) && state.postSuccess !== dismissedPostSuccess;
  const customerName = state.customerDetails?.CardName || state.selectedParty?.CardName || "—";
  const postDisabledReason = state.selectedLineBatchError;
  // What this customer still owes, straight off their SAP account balance.
  // `null` when SAP did not report one — better a missing tile than a
  // confident zero that isn't true.
  const parsedBalance = Number(state.customerDetails?.Balance);
  const outstanding = Number.isFinite(parsedBalance) ? parsedBalance : null;

  const addFreightRow = () => {
    state.addFreightRow();
    setTotalsModalOpen(true);
  };

  const closeSuccessModal = () => {
    setDismissedPostSuccess(state.postSuccess);
    onCreateNew();
  };

  /* `postInvoice` has exactly one caller — the Submit button in the totals
     modal — so closing that modal here is the same thing the third effect did
     when `state.posting` went true, minus the extra render. */
  const submitForReview = () => {
    setTotalsModalOpen(false);
    setDismissedPostError(null);
    setDismissedPostSuccess(null);
    state.postInvoice();
  };

  return (
    <div className="space-y-4">
      <InteractiveLoader
        isOpen={state.posting}
        summary={{
          totalItems: state.selectedLineList.length,
          selectedStation: state.form.shipTo,
          dispatchType: state.form.shippingType,
          estimatedTime: "~30 seconds",
        }}
      />

      {state.loadingDraftDetails && (
        <Card>
          <Skeleton className="h-5 w-64" aria-label="Loading customer and salesperson details" />
        </Card>
      )}
      {state.draftError && <Notice tone="bad">{state.draftError}</Notice>}

      <Card className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <BranchBadge branch={state.branch} onChange={onChangeBranch} />
          <p className="m-0 mt-1.5 text-[11px] uppercase tracking-wide text-subtle">Party</p>
          <strong className="block text-[16px] font-semibold text-ink">{customerName}</strong>
          <div className="mt-2 flex flex-wrap gap-2">
            {onAddItems && (
              <Button size="xs" onClick={onAddItems}>
                Add items
              </Button>
            )}
            <Button size="xs" onClick={onReset}>
              Change party
            </Button>
          </div>
        </div>

        <EditableDate
          label="Posting date"
          value={state.form.postingDate}
          onChange={(postingDate) =>
            // One date drives all three: SAP rejects a due date before its
            // posting date, and nobody was setting them apart deliberately.
            state.updateForm({ postingDate, dueDate: postingDate, documentDate: postingDate })
          }
        />
      </Card>

      <ContentsTab state={state} />

      <details className="text-[12px]">
        <summary className="cursor-pointer text-subtle hover:text-ink">
          Draft payload — dates display as {formatDateDisplay(state.form.postingDate)}
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-sm border border-line bg-surface p-2 font-mono text-[11px] text-body">
          {JSON.stringify(state.payload, null, 2)}
        </pre>
      </details>

      {/* The SAP error, in full. It is the only place the raw message appears,
          and support asks for it verbatim — so it is a <pre>, not a summary. */}
      {state.postError && postErrorNotificationOpen && (
        <Notice tone="bad" title="Unable to submit invoice for review">
          <span className="flex items-start justify-between gap-3">
            <pre className="m-0 max-h-48 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11.5px]">
              {state.postError}
            </pre>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss SAP error"
              onClick={() => setDismissedPostError(state.postError)}
            >
              <HiOutlineXMark />
            </Button>
          </span>
        </Notice>
      )}

      {/* ── Posted ── */}
      <Dialog
        open={successModalOpen}
        onOpenChange={(next) => {
          if (!next) closeSuccessModal();
        }}
      >
        {successModalOpen && (
          <DialogContent title="Invoice submitted" size="sm">
            <DialogHeader>
              <span
                aria-hidden="true"
                className="mb-2 flex size-11 items-center justify-center rounded-full bg-ok-soft text-[22px] text-ok"
              >
                <HiOutlineCheckCircle />
              </span>
              <DialogTitle>Invoice submitted for review</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-2">
              {state.postedDocNum && (
                <p className="m-0 font-mono text-[13px] font-semibold text-ink">
                  Draft #{state.postedDocNum}
                </p>
              )}
              <p className="m-0 text-[13px] text-body">{state.postSuccess}</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={closeSuccessModal}>
                Create new invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Totals and freight, then post ── */}
      <Dialog
        open={totalsModalOpen}
        onOpenChange={(next) => {
          if (!next) setTotalsModalOpen(false);
        }}
      >
        {totalsModalOpen && (
          <DialogContent title="Invoice total" size="lg">
            <DialogHeader>
              <DialogTitle>
                <span className="flex flex-col">
                  <span className="text-[11px] font-normal uppercase tracking-wide text-subtle">
                    Invoice total
                  </span>
                  {formatMoney(state.totals.grandTotal)}
                </span>
              </DialogTitle>
            </DialogHeader>

            <DialogBody className="space-y-5">
              <section className="space-y-2">
                <SectionHeading>Totals</SectionHeading>
                <dl className="m-0 space-y-1.5 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-subtle">Taxable amount</dt>
                    <dd className="m-0 tabular-nums text-ink">
                      {formatMoney(state.totals.taxable)}
                    </dd>
                  </div>
                  {state.totals.discountAmount > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-subtle">Discount</dt>
                      <dd className="m-0 tabular-nums text-ink">
                        − {formatMoney(state.totals.discountAmount)}
                      </dd>
                    </div>
                  )}
                  {state.totals.freight > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-subtle">Freight</dt>
                      <dd className="m-0 tabular-nums text-ink">
                        {formatMoney(state.totals.freight)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-subtle">Tax amount</dt>
                    <dd className="m-0 tabular-nums text-ink">{formatMoney(state.totals.tax)}</dd>
                  </div>
                  {Math.abs(state.totals.roundOff) >= 0.005 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-subtle">Round off</dt>
                      <dd className="m-0 tabular-nums text-ink">
                        {formatMoney(state.totals.roundOff)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 border-t border-line pt-1.5">
                    <dt className="font-semibold text-ink">Grand total</dt>
                    <dd className="m-0 text-[15px] font-bold tabular-nums text-ink">
                      {formatMoney(state.totals.grandTotal)}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <SectionHeading>Freight</SectionHeading>
                  <Button size="xs" onClick={addFreightRow}>
                    <HiOutlinePlus aria-hidden="true" />
                    Add
                  </Button>
                </div>

                {state.freightRows.length === 0 ? (
                  <p className="m-0 rounded-sm border border-line bg-surface px-3 py-3 text-center text-[12px] text-subtle">
                    No freight expenses added.
                  </p>
                ) : (
                  <ul className="m-0 list-none space-y-2 p-0">
                    {state.freightRows.map((row, index) => (
                      <li
                        className="flex flex-wrap items-end gap-2 rounded-sm border border-line bg-surface p-2.5"
                        key={row.expenseCode + "-" + index}
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-strong text-[11px] font-bold text-subtle">
                          {index + 1}
                        </span>

                        <label className="flex min-w-[160px] flex-1 flex-col gap-0.5">
                          <span className="text-[11px] text-subtle">Expense</span>
                          <Select
                            value={row.expenseCode}
                            aria-label={"Freight expense " + (index + 1)}
                            className="h-control-sm"
                            onChange={(event) => {
                              const selected = state.freightOptions.find(
                                (option) => String(option.ExpnsCode) === event.target.value,
                              );
                              state.updateFreightRow(index, {
                                expenseCode: event.target.value,
                                expenseName: selected?.ExpnsName || "",
                              });
                            }}
                          >
                            <option value="">Select freight</option>
                            {state.freightOptions.map((option) => (
                              <option key={option.ExpnsCode} value={option.ExpnsCode}>
                                {option.ExpnsName}
                              </option>
                            ))}
                          </Select>
                        </label>

                        <label className="flex w-32 flex-col gap-0.5">
                          <span className="text-[11px] text-subtle">Amount (₹)</span>
                          <Input
                            type="number"
                            min="0"
                            value={row.lineTotal}
                            aria-label={"Freight amount " + (index + 1)}
                            className="h-control-sm text-right tabular-nums"
                            onChange={(event) =>
                              state.updateFreightRow(index, {
                                lineTotal: toNumber(event.target.value),
                              })
                            }
                          />
                        </label>

                        <label className="flex w-36 flex-col gap-0.5">
                          <span className="text-[11px] text-subtle">Tax code</span>
                          <Input
                            value={row.taxCode}
                            aria-label={"Freight tax code " + (index + 1)}
                            placeholder="GST exempt code"
                            className="h-control-sm"
                            onChange={(event) =>
                              state.updateFreightRow(index, { taxCode: event.target.value })
                            }
                          />
                        </label>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => state.removeFreightRow(index)}
                          aria-label={"Remove freight row " + (index + 1)}
                        >
                          <HiOutlineXMark />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </DialogBody>

            <DialogFooter>
              <span className="mr-auto text-[13px]">
                <span className="text-subtle">Grand total </span>
                <strong className="font-bold tabular-nums text-ink">
                  {formatMoney(state.totals.grandTotal)}
                </strong>
              </span>
              <Button onClick={() => setTotalsModalOpen(false)} disabled={state.posting}>
                Close
              </Button>
              <Button
                variant="primary"
                disabled={state.posting || Boolean(postDisabledReason)}
                title={postDisabledReason || undefined}
                onClick={submitForReview}
              >
                {state.posting ? "Submitting…" : "Submit for review"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── The action bar ── */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5">
          <span>
            <span className="block text-[11px] uppercase tracking-wide text-subtle">Total</span>
            <strong className="text-[17px] font-bold tabular-nums text-ink">
              {formatMoney(state.totals.grandTotal)}
            </strong>
          </span>

          {outstanding !== null && (
            <span title={"Account balance for " + (state.selectedParty?.CardCode || customerName)}>
              <span className="block text-[11px] uppercase tracking-wide text-subtle">
                Outstanding
              </span>
              <strong
                className={cn(
                  "text-[17px] font-bold tabular-nums",
                  outstanding > 0 ? "text-bad" : "text-ink",
                )}
              >
                {formatMoney(outstanding)}
              </strong>
            </span>
          )}

          {postDisabledReason && <Badge tone="bad">{postDisabledReason}</Badge>}
        </div>

        <Button variant="primary" onClick={() => setTotalsModalOpen(true)}>
          Review &amp; post
        </Button>
      </Card>
    </div>
  );
}
