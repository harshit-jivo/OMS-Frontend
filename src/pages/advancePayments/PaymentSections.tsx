/**
 * The Advance Payment Request form's sections — presentation only.
 *
 * Nothing here decides anything: which section shows, which documents are on
 * offer and what a payment comes to are all answered in `rules.ts`, and these
 * components draw the answer. That split is what lets the rules be tested
 * without rendering, and lets the backend copy them without reading JSX.
 */
import * as React from "react";
import { HiChevronRight, HiOutlineChevronDown, HiOutlineTrash } from "react-icons/hi2";

import { Button } from "../../components/ui/button";
import { DetailField, DetailGrid } from "../../components/ui/detail";
import { MultiSelect } from "../../components/ui/dropdown";
import { Field, FormGrid, Input } from "../../components/ui/form";
import { SegmentedControl } from "../../components/ui/segmented";
import { cn } from "@/lib/utils";

import { ChoiceOrText } from "./ChoiceOrText";

import {
  PAYMENT_MODES,
  QUICK_PERCENTAGES,
  RETURN_METHODS,
  type OpenDocument,
  type ReturnMethod,
} from "./constants";
import {
  REFERENCE_KINDS,
  calculateEmi,
  expectedPeriodError,
  formatDate,
  formatINR,
  type Allocation,
  type AllocationRow,
  type AllocationTotals,
  type ReferenceKind,
} from "./rules";

/* ── Section frame ───────────────────────────────────────────────────────── */

/**
 * One titled block of the form.
 *
 * A rule between sections inside the one card, rather than a card each: the
 * approved design is a single "Payment Details" card, and five stacked cards
 * would read as five forms. The first section drops its rule so the card's
 * own top edge is the only line above it.
 */
export function FormSection({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "space-y-3 border-t border-line pt-5 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <div>
        <h3 className="m-0 text-[14px] font-semibold text-ink">{title}</h3>
        {description ? (
          <p className="m-0 mt-0.5 text-[12px] text-subtle">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/* ── Affixed inputs ──────────────────────────────────────────────────────── */

type AffixInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  affix: string;
  side: "left" | "right";
};

/**
 * A number input with a fixed ₹ or % beside the value.
 *
 * An affix rather than placeholder text, so the unit stays visible once a
 * number is typed — which is exactly when it matters.
 */
function AffixInput({ affix, side, className, ...props }: AffixInputProps) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 grid w-10 place-items-center text-[13px] text-subtle",
          side === "left" ? "left-0 border-r border-line" : "right-0 border-l border-line",
        )}
      >
        {affix}
      </span>
      <Input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        className={cn(side === "left" ? "pl-12" : "pr-12", className)}
        {...props}
      />
    </div>
  );
}

export function RupeeInput(props: Omit<React.ComponentProps<"input">, "type">) {
  return <AffixInput affix="₹" side="left" {...props} />;
}

/* ── Reference Details ───────────────────────────────────────────────────── */

/**
 * Pick the bills or POs — as many as the payment covers — and say how much of
 * each is being paid.
 *
 * A checkbox list and never a text box: every document has to exist, be
 * open, and belong to this partner, and a typed number can be none of those.
 *
 * The payment is entered ON the document's row rather than in a separate
 * box below: with three bills chosen, a detached box has to ask "which
 * bill?", and a row does not. Each row's figures come from the document and
 * are read-only; the row's own detail (date, original, paid) folds out under
 * it on demand, so the list stays one line per document until it is asked
 * for more.
 */
export function ReferenceDetails({
  kind,
  documents,
  value,
  onChange,
  hasPartner,
  partnerLabel,
  rows,
  totals,
  onAllocationChange,
}: {
  kind: ReferenceKind;
  documents: OpenDocument[];
  value: string[];
  onChange: (ids: string[]) => void;
  hasPartner: boolean;
  partnerLabel: string;
  rows: AllocationRow[];
  totals: AllocationTotals;
  onAllocationChange: (id: string, patch: Partial<Allocation>) => void;
}) {
  const def = REFERENCE_KINDS[kind];
  const noun = def.pluralLabel.toLowerCase();

  return (
    <FormSection
      title="Reference Details"
      description={
        def.intro ??
        `Tick every ${def.noun} this payment covers, then enter how much of each is being paid.`
      }
    >
      <FormGrid className="md:grid-cols-3">
        <Field
          label={def.pluralLabel}
          required
          hint={hasPartner ? undefined : `Pick the ${partnerLabel.toLowerCase()} first.`}
        >
          {(c) => (
            <MultiSelect<string>
              id={c.id}
              value={value}
              onChange={onChange}
              disabled={!hasPartner}
              placeholder={def.placeholder}
              searchable
              searchPlaceholder={`Search ${def.numberLabel.toLowerCase()}…`}
              emptyText={`No open ${noun} for this ${partnerLabel.toLowerCase()}`}
              // Names read better than "2 selected" while they still fit.
              namedUpTo={2}
              options={documents.map((doc) => ({
                value: doc.id,
                label: doc.number,
                hint: doc.docType
                  ? `${doc.docType} · ${formatDate(doc.date)}`
                  : formatDate(doc.date),
                meta: `Open ${formatINR(doc.open)}`,
              }))}
            />
          )}
        </Field>
      </FormGrid>

      {rows.length > 0 ? (
        <SelectedDocuments
          kind={kind}
          rows={rows}
          totals={totals}
          onAllocationChange={onAllocationChange}
          onDelete={(id) => onChange(value.filter((selected) => selected !== id))}
        />
      ) : null}
    </FormSection>
  );
}

/* ── The selected documents, one payment line each ───────────────────────── */

/**
 * The column template, shared by the header and every row so they line up.
 *
 * A CSS grid rather than a `<table>`: on a phone each document becomes a
 * stacked card — number and delete on top, then open amount, mode and amount
 * — and a table cannot re-flow like that; it can only scroll sideways, which
 * hides the amount box the requester is there to fill in.
 */
//
// The header, every row and the totals are SEPARATE grids, so they line up
// only if each column resolves to the same width in all of them. The middle
// three are therefore fixed widths, not `auto` or `fr`: an `auto` track sizes
// to its own row's content, and the first draft's `fr` tracks let a long bill
// number or a wide screen pull the columns out of line with their headings.
// Only the number column flexes, so spare width lands where there is no
// input to stretch, and the amount box stops at a sensible size.
const LINE_GRID =
  "md:grid-cols-[minmax(9rem,1fr)_8.5rem_13.5rem_minmax(15rem,21rem)_2.5rem]";

function SelectedDocuments({
  kind,
  rows,
  totals,
  onAllocationChange,
  onDelete,
}: {
  kind: ReferenceKind;
  rows: AllocationRow[];
  totals: AllocationTotals;
  onAllocationChange: (id: string, patch: Partial<Allocation>) => void;
  onDelete: (id: string) => void;
}) {
  const def = REFERENCE_KINDS[kind];
  const one = def.noun;
  // Which rows are folded out. View state, not form state: nothing is
  // submitted from it, and it resets harmlessly when the page does.
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-line bg-surface px-3 py-2">
        <h4 className="m-0 text-[13px] font-semibold text-ink">
          Selected {def.pluralLabel} ({rows.length})
        </h4>
        <span className="text-[11.5px] text-subtle">Click a {one} to see its details.</span>
      </div>

      {/* Column headings — desktop only; on a phone each value carries its
          own small label instead. Hidden from screen readers because every
          control below is already named for its document. */}
      <div
        aria-hidden="true"
        className={cn(
          "hidden gap-x-6 border-b border-line px-3 py-2 md:grid",
          "text-[10.5px] font-semibold uppercase tracking-[0.06em] text-subtle",
          LINE_GRID,
        )}
      >
        <span>{def.numberLabel}</span>
        <span className="text-right">Open Amount</span>
        <span>Payment Mode</span>
        <span>Amount / %</span>
        <span />
      </div>

      <ul className="m-0 list-none p-0">
        {rows.map(({ document: doc, allocation, calc }) => {
          const isOpen = expanded.has(doc.id);
          const detailId = `doc-detail-${doc.id}`;
          return (
            <li
              key={doc.id}
              className={cn(
                "grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2.5 border-b border-line/60 px-3 py-3 last:border-b-0",
                LINE_GRID,
                isOpen && "bg-surface",
              )}
            >
              {/* The number opens the row's detail. */}
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={detailId}
                onClick={() => toggle(doc.id)}
                className={cn(
                  // Preflight is not imported — reset the UA button.
                  "appearance-none border-0 bg-transparent p-0 [font-family:inherit] cursor-pointer",
                  "order-1 flex items-start gap-1.5 justify-self-start rounded-sm text-left",
                  "focus-visible:outline-none focus-visible:shadow-focus",
                )}
              >
                <HiChevronRight
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0 text-subtle transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
                <span>
                  <span className="block text-[13px] font-semibold text-brand">{doc.number}</span>
                  <span className="block text-[11px] text-subtle">
                    {doc.docType ? `${doc.docType} · ` : ""}
                    {formatDate(doc.date)}
                  </span>
                </span>
              </button>

              <div className="order-3 col-span-2 flex items-baseline justify-between gap-2 md:order-2 md:col-span-1 md:block md:text-right">
                <span className="text-[11px] text-subtle md:hidden">Open Amount</span>
                <span className="text-[13px] font-medium tabular-nums text-ink">
                  {formatINR(doc.open)}
                </span>
              </div>

              <div className="order-4 col-span-2 md:order-3 md:col-span-1">
                <SegmentedControl
                  size="xs"
                  aria-label={`Payment mode for ${doc.number}`}
                  value={allocation.mode}
                  onChange={(mode) => onAllocationChange(doc.id, { mode })}
                  options={PAYMENT_MODES}
                />
              </div>

              <div className="order-5 col-span-2 md:order-4 md:col-span-1">
                <LineAmountInput
                  documentNumber={doc.number}
                  allocation={allocation}
                  payment={calc.payment}
                  error={calc.error}
                  onChange={(patch) => onAllocationChange(doc.id, patch)}
                />
              </div>

              {/* Deletes THIS row only — the other lines and everything they
                  hold are untouched. It also unticks the document above, since
                  a row is simply a ticked document: the two cannot disagree. */}
              <div className="order-2 justify-self-end md:order-5">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete this row"
                  aria-label={`Delete ${doc.number}`}
                  onClick={() => onDelete(doc.id)}
                  className="text-subtle hover:text-danger"
                >
                  <HiOutlineTrash className="size-4" aria-hidden="true" />
                </Button>
              </div>

              {isOpen ? (
                <div id={detailId} className="order-6 col-span-full">
                  <div className="rounded-sm border border-line bg-card px-3 py-2.5 md:ml-5">
                    <DetailGrid>
                      <DetailField label={def.numberLabel} value={doc.number} />
                      {doc.docType ? <DetailField label="Document Type" value={doc.docType} /> : null}
                      <DetailField label={def.dateLabel} value={formatDate(doc.date)} />
                      <DetailField label={def.originalLabel} value={formatINR(doc.original)} />
                      <DetailField label={def.paidLabel} value={formatINR(doc.paid)} />
                      <DetailField label="Open Amount" value={formatINR(doc.open)} strong />
                      {doc.note ? <DetailField label="Description" value={doc.note} /> : null}
                    </DetailGrid>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Totals: open amount under Open Amount, payment under Amount / %. */}
      <div
        className={cn(
          "grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1.5 border-t border-line bg-surface px-3 py-3",
          LINE_GRID,
        )}
      >
        <span className="text-[13px] font-semibold text-ink">
          Total
          <span className="ml-1 font-normal text-subtle">
            ({rows.length} {rows.length === 1 ? one : def.pluralLabel.toLowerCase()})
          </span>
        </span>
        <span className="text-right text-[13px] font-semibold tabular-nums text-ink">
          {formatINR(totals.open)}
        </span>
        <span className="text-[12px] text-subtle md:text-right">
          {totals.complete ? "Payment Amount" : "Payment Amount so far"}
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        </span>
        {/* `<output>` is a live region: the total changes as any line is typed
            into, and a screen reader should hear what it now is. */}
        <output
          aria-label="Total payment amount"
          className="justify-self-end text-base font-bold tabular-nums text-ink md:justify-self-start"
        >
          {formatINR(totals.payment)}
        </output>
      </div>
    </div>
  );
}

/**
 * One line's amount box — the whole payment for that document, in one field.
 *
 *   Fixed       [ ₹ | 40000                        ]
 *   Percentage  [ 10            = ₹18,000  | % ▾   ]
 *
 * In Percentage the rupee figure it comes to sits INSIDE the box, beside the
 * number that produces it, rather than in a column of its own: the two are
 * one fact, and a second column made the row twice as wide to say it. The
 * quick percentages hang off the % sign itself — a native select, so a phone
 * gets its own picker — instead of a row of buttons under every input.
 */
function LineAmountInput({
  documentNumber,
  allocation,
  payment,
  error,
  onChange,
}: {
  documentNumber: string;
  allocation: Allocation;
  payment: number | null;
  error: string | null;
  onChange: (patch: Partial<Allocation>) => void;
}) {
  const errorId = React.useId();
  const noteId = React.useId();
  const percent = allocation.mode === "PERCENT";
  const describedBy =
    [error ? errorId : null, percent && payment !== null ? noteId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          // The chrome of `ui/form`'s Input, on the group: the box is the
          // input, the number, the result and the % picker together.
          "flex h-control-sm w-full min-w-0 items-stretch overflow-hidden rounded-sm border border-line bg-surface",
          "transition-colors hover:border-line-strong",
          "focus-within:border-brand focus-within:bg-card focus-within:shadow-focus",
          error && "border-danger bg-danger-soft/40",
        )}
      >
        {!percent ? (
          <span
            aria-hidden="true"
            className="grid w-9 shrink-0 place-items-center border-r border-line text-[13px] text-subtle"
          >
            ₹
          </span>
        ) : null}

        <input
          type="number"
          min="0"
          max={percent ? 100 : undefined}
          step="0.01"
          inputMode="decimal"
          aria-label={
            percent
              ? `Payment percentage for ${documentNumber}`
              : `Payment amount for ${documentNumber}`
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          placeholder={percent ? "Enter %" : "Enter amount"}
          value={percent ? allocation.percentage : allocation.amount}
          onChange={(event) =>
            onChange(percent ? { percentage: event.target.value } : { amount: event.target.value })
          }
          className={cn(
            "min-w-[3.5rem] flex-1 border-0 bg-transparent px-3 [font-family:inherit] text-[13px] text-ink",
            "placeholder:text-subtle focus:outline-none",
          )}
        />

        {percent ? (
          <>
            {payment !== null ? (
              <span
                id={noteId}
                className="self-center whitespace-nowrap pr-2 text-[12.5px] font-semibold tabular-nums text-ink"
              >
                <span className="font-normal text-subtle">= </span>
                {formatINR(payment)}
              </span>
            ) : null}

            <div className="relative shrink-0 border-l border-line">
              <select
                aria-label={`Quick percentage for ${documentNumber}`}
                title="Pick a percentage"
                // Always shows "%": it is a menu of shortcuts, not a value of
                // its own — the chosen % goes into the input beside it.
                value=""
                onChange={(event) => {
                  if (event.target.value) onChange({ percentage: event.target.value });
                }}
                className={cn(
                  "h-full w-14 cursor-pointer appearance-none border-0 bg-transparent pl-3 pr-6",
                  "[font-family:inherit] text-[13px] font-semibold text-body",
                  "hover:bg-surface-strong focus:outline-none focus-visible:bg-brand-soft",
                )}
              >
                <option value="" hidden>
                  %
                </option>
                {QUICK_PERCENTAGES.map((quick) => (
                  <option key={quick} value={String(quick)}>
                    {quick}%
                  </option>
                ))}
              </select>
              <HiOutlineChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-subtle"
              />
            </div>
          </>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} className="m-0 text-[11.5px] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ── Repayment & Settlement ──────────────────────────────────────────────── */

/**
 * How an employee advance comes back, and over what period it is used.
 *
 * Only EMI asks anything further. The EMI itself is DERIVED — Amount ÷
 * Installments — and shown read-only, because a typed EMI could disagree with
 * the amount above it and there would be no saying which was meant.
 */
export function RepaymentDetails({
  amount,
  returnMethod,
  returnMethodOther,
  installments,
  expectedFromDate,
  expectedToDate,
  onReturnMethodChange,
  onInstallmentsChange,
  onExpectedFromChange,
  onExpectedToChange,
}: {
  amount: string;
  returnMethod: ReturnMethod | "";
  returnMethodOther: string;
  installments: string;
  expectedFromDate: string;
  expectedToDate: string;
  onReturnMethodChange: (method: ReturnMethod | "", other: string) => void;
  onInstallmentsChange: (installments: string) => void;
  onExpectedFromChange: (date: string) => void;
  onExpectedToChange: (date: string) => void;
}) {
  const emi = calculateEmi(amount, installments);
  const periodError = expectedPeriodError(expectedFromDate, expectedToDate);

  return (
    <FormSection
      title="Repayment & Settlement"
      description="How the advance comes back, and the period in which it is expected to be used and settled."
    >
      <FormGrid className="md:grid-cols-3">
        <Field label="Return Method" required>
          {(c) => (
            <ChoiceOrText<ReturnMethod>
              id={c.id}
              aria-describedby={c["aria-describedby"]}
              required
              options={RETURN_METHODS.filter((method) => method.value !== "CUSTOM")}
              otherValue="CUSTOM"
              value={returnMethod}
              text={returnMethodOther}
              onChange={onReturnMethodChange}
            />
          )}
        </Field>

        {returnMethod === "EMI" ? (
          <>
            <Field label="Number of Installments" required error={emi.error ?? undefined}>
              {(c) => (
                <Input
                  {...c}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="e.g. 4"
                  value={installments}
                  onChange={(e) => onInstallmentsChange(e.target.value)}
                />
              )}
            </Field>

            <Field
              label="EMI Amount"
              hint={
                !amount
                  ? "Enter the amount above first."
                  : emi.rounded
                    ? "Does not divide evenly — rounded to the paisa."
                    : "Amount ÷ number of installments."
              }
            >
              {(c) => (
                // Read-only and styled as a value: it is worked out, not typed.
                <Input
                  {...c}
                  readOnly
                  value={emi.emi !== null ? formatINR(emi.emi) : ""}
                  placeholder="Calculated"
                  className="bg-surface font-semibold"
                />
              )}
            </Field>
          </>
        ) : null}
      </FormGrid>

      <FormGrid className="md:grid-cols-3">
        <Field label="Expected From Date" required>
          {(c) => (
            <Input
              {...c}
              type="date"
              value={expectedFromDate}
              onChange={(e) => onExpectedFromChange(e.target.value)}
            />
          )}
        </Field>

        <Field label="Expected To Date" required error={periodError ?? undefined}>
          {(c) => (
            <Input
              {...c}
              type="date"
              // The browser's own picker refuses earlier dates too; the
              // error above still covers a typed one.
              min={expectedFromDate || undefined}
              value={expectedToDate}
              onChange={(e) => onExpectedToChange(e.target.value)}
            />
          )}
        </Field>
      </FormGrid>
    </FormSection>
  );
}
