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

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DetailField, DetailGrid } from "../../components/ui/detail";
import { MultiSelect } from "../../components/ui/dropdown";
import { Field, FormGrid, Input } from "../../components/ui/form";
import { SegmentedControl } from "../../components/ui/segmented";
import { cn } from "@/lib/utils";

import { ChoiceOrText } from "./ChoiceOrText";
import { SapAttachmentLink } from "./SapAttachmentLink";

import {
  PAYMENT_MODES,
  QUICK_PERCENTAGES,
  RETURN_METHODS,
  type OpenDocument,
  type ReturnMethod,
} from "./constants";
import {
  calculateEmi,
  dueFirst,
  dueLabel,
  expectedPeriodError,
  formatDate,
  formatINR,
  installmentsFromEmi,
  pastDateError,
  REFERENCE_KINDS,
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
  live = false,
  loading = false,
  error,
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
  /** The list is read from SAP — said under the section title. */
  live?: boolean;
  loading?: boolean;
  /** SAP could not be read; replaces the hint and marks the field. */
  error?: string;
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
        <>
          {def.intro ??
            `Tick every ${def.noun} this payment covers, then enter how much of each is being paid.`}{" "}
          <span className={live ? "font-medium text-ok" : "font-medium text-hold"}>
            {live ? "Live from SAP." : "Sample data — not yet connected to SAP."}
          </span>
        </>
      }
    >
      <FormGrid className="md:grid-cols-3">
        <Field
          label={def.pluralLabel}
          required
          error={error}
          hint={
            error
              ? undefined
              : !hasPartner
                ? `Pick the ${partnerLabel.toLowerCase()} first.`
                : loading
                  ? `Loading ${noun} from SAP…`
                  : undefined
          }
        >
          {(c) => (
            <MultiSelect<string>
              id={c.id}
              value={value}
              onChange={onChange}
              disabled={!hasPartner || loading}
              placeholder={loading ? "Loading…" : def.placeholder}
              searchable
              searchPlaceholder={`Search ${def.numberLabel.toLowerCase()}…`}
              emptyText={`No open ${noun} for this ${partnerLabel.toLowerCase()}`}
              // Names read better than "2 selected" while they still fit.
              namedUpTo={2}
              // Due ones first, and marked: they are what is most likely owed.
              options={dueFirst(documents, (doc) => doc).map((doc) => {
                const due = dueLabel(doc);
                return {
                  value: doc.id,
                  label: doc.number,
                  hint: documentSubtitle(doc),
                  keywords: due,
                  meta: due ? (
                    <span className="font-semibold text-bad">
                      {due} · Open {formatINR(doc.open)}
                    </span>
                  ) : (
                    `Open ${formatINR(doc.open)}`
                  ),
                };
              })}
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

/**
 * The small line under a document number: what kind it is (under "All"), the
 * vendor's own reference (on a SAP bill), and its date.
 */
function documentSubtitle(doc: OpenDocument): string {
  // The note is on the picker line, not only in the expanded row: under "All"
  // it is what marks a credit memo or a payment already made as money owed TO
  // us, and that has to be seen before it is ticked, not after.
  return [
    doc.docType,
    doc.note,
    doc.reference ? `Ref ${doc.reference}` : null,
    formatDate(doc.date),
  ]
    .filter(Boolean)
    .join(" · ");
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
        {dueFirst(rows, (row) => row.document).map(({ document: doc, allocation, calc }) => {
          const isOpen = expanded.has(doc.id);
          const detailId = `doc-detail-${doc.id}`;
          const due = dueLabel(doc);
          return (
            <li
              key={doc.id}
              data-due={due ? "true" : undefined}
              className={cn(
                "grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2.5 border-b border-line/60 px-3 py-3 last:border-b-0",
                LINE_GRID,
                isOpen && "bg-surface",
                // A due document stands out: a red rule down its left edge.
                due && "border-l-[3px] border-l-bad bg-bad-soft/40",
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
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-brand">{doc.number}</span>
                    {due ? <Badge tone="bad">{due}</Badge> : null}
                  </span>
                  <span className="block text-[11px] text-subtle">{documentSubtitle(doc)}</span>
                </span>
              </button>

              <div className="order-3 col-span-2 flex items-baseline justify-between gap-2 md:order-2 md:col-span-1 md:block md:text-right">
                <span className="text-[11px] text-subtle md:hidden">Open Amount</span>
                <span className="text-[13px] font-medium tabular-nums text-ink">
                  {formatINR(doc.open)}
                </span>
              </div>

              <div className="order-4 col-span-2 md:order-3 md:col-span-1">
                {/* A choice only where the kind allows more than one mode (a
                    PO); elsewhere (a bill: amount only) it just names it. */}
                {def.modes.length > 1 ? (
                  <SegmentedControl
                    size="xs"
                    aria-label={`Payment mode for ${doc.number}`}
                    value={allocation.mode}
                    onChange={(mode) => onAllocationChange(doc.id, { mode })}
                    options={PAYMENT_MODES.filter((m) => def.modes.includes(m.value))}
                  />
                ) : (
                  <span
                    data-slot="payment-mode"
                    className="inline-flex h-control-xs items-center rounded-sm bg-surface px-2.5 text-[12px] font-medium text-subtle"
                  >
                    {PAYMENT_MODES.find((m) => m.value === allocation.mode)?.label}
                  </span>
                )}
              </div>

              <div className="order-5 col-span-2 md:order-4 md:col-span-1">
                <LineAmountInput
                  documentNumber={doc.number}
                  allocation={allocation}
                  payment={calc.payment}
                  error={calc.error}
                  openAmount={doc.open}
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
                      {doc.reference ? (
                        <DetailField label="Vendor Ref." value={doc.reference} />
                      ) : null}
                      {doc.dueDate ? (
                        <DetailField label="Due Date" value={formatDate(doc.dueDate)} />
                      ) : null}
                      <DetailField label={def.originalLabel} value={formatINR(doc.original)} />
                      <DetailField label={def.paidLabel} value={formatINR(doc.paid)} />
                      <DetailField label="Open Amount" value={formatINR(doc.open)} strong />
                      {doc.note ? <DetailField label="Description" value={doc.note} /> : null}
                      <DetailField
                        label="SAP Attachment"
                        span="full"
                        value={
                          doc.attachment ? (
                            <SapAttachmentLink attachment={doc.attachment} />
                          ) : (
                            <span className="text-subtle">None in SAP</span>
                          )
                        }
                      />
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
  openAmount,
  onChange,
}: {
  documentNumber: string;
  allocation: Allocation;
  payment: number | null;
  error: string | null;
  /** The most this line may pay. A keystroke that would go past it is refused. */
  openAmount: number;
  onChange: (patch: Partial<Allocation>) => void;
}) {
  const errorId = React.useId();
  const noteId = React.useId();
  const percent = allocation.mode === "PERCENT";
  /*
   * REFUSE, do not warn. A figure above the document's open amount (or a
   * percentage above 100, which is the same thing — the percentage is of the
   * OPEN amount) is never a valid answer, so the keystroke that would make it
   * is simply not taken: the input keeps its previous value. The error from
   * `rules.calculateLine` stays as the net for anything that arrives another
   * way, such as a snapshot whose open amount has since fallen.
   */
  const withinOpen = (raw: string) => {
    if (raw.trim() === "") return true;
    const n = Number(raw);
    if (!Number.isFinite(n)) return true; // half-typed: let the number input hold it
    return percent ? n <= 100 : n <= openAmount;
  };
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
          max={percent ? 100 : openAmount}
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
          onChange={(event) => {
            const next = event.target.value;
            if (!withinOpen(next)) return;
            onChange(percent ? { percentage: next } : { amount: next });
          }}
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
 * How an employee advance comes back.
 *
 * Each method asks for exactly the dates it has:
 *
 *   EMI        Number of Installments <-> EMI Amount, linked BOTH ways (type
 *              either, the other is worked out), an EMI Start Date, and an
 *              Expected To Date that is DERIVED and read-only.
 *   One Time   a single Return Date.
 *   Other      the typed method, with a From / To period.
 *
 * The linking itself lives in `rules.applyChange`, not here, so the form and
 * the approver's copy of it cannot compute it differently.
 *
 * `today` is the earliest date the EMI start and the return date accept —
 * the picker refuses earlier days, and `validate` catches a typed one.
 */
export function RepaymentDetails({
  amount,
  returnMethod,
  returnMethodOther,
  installments,
  emiAmount,
  expectedFromDate,
  expectedToDate,
  today,
  onReturnMethodChange,
  onInstallmentsChange,
  onEmiAmountChange,
  onExpectedFromChange,
  onExpectedToChange,
}: {
  amount: string;
  returnMethod: ReturnMethod | "";
  returnMethodOther: string;
  installments: string;
  emiAmount: string;
  expectedFromDate: string;
  expectedToDate: string;
  today: string;
  onReturnMethodChange: (method: ReturnMethod | "", other: string) => void;
  onInstallmentsChange: (installments: string) => void;
  onEmiAmountChange: (emiAmount: string) => void;
  onExpectedFromChange: (date: string) => void;
  onExpectedToChange: (date: string) => void;
}) {
  const fromCount = calculateEmi(amount, installments);
  const fromEmi = installmentsFromEmi(amount, emiAmount);
  const periodError = expectedPeriodError(expectedFromDate, expectedToDate);
  const startError = pastDateError("EMI Start Date", expectedFromDate, today);
  const returnError = pastDateError("Return Date", expectedToDate, today);

  // What the EMI box says under itself. The short last installment is the
  // one thing a requester would otherwise work out on a calculator.
  const emiHint = !amount
    ? "Enter the amount above first."
    : fromEmi.lastInstallment !== null
      ? `Last installment ${formatINR(fromEmi.lastInstallment)}.`
      : fromCount.rounded
        ? "Does not divide evenly, rounded to the paisa."
        : "Type the EMI, or the number of installments.";

  return (
    <FormSection
      title="Repayment & Settlement"
      description="How the advance comes back, and when."
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
            <Field
              label="Number of Installments"
              required
              error={fromCount.error ?? undefined}
            >
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

            <Field label="EMI Amount" required hint={emiHint} error={fromEmi.error ?? undefined}>
              {(c) => (
                <Input
                  {...c}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="e.g. 5000"
                  value={emiAmount}
                  onChange={(e) => onEmiAmountChange(e.target.value)}
                />
              )}
            </Field>
          </>
        ) : null}
      </FormGrid>

      {returnMethod === "EMI" ? (
        <FormGrid className="md:grid-cols-3">
          <Field label="EMI Start Date" required error={startError ?? undefined}>
            {(c) => (
              <Input
                {...c}
                type="date"
                min={today}
                value={expectedFromDate}
                onChange={(e) => onExpectedFromChange(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="Expected To Date"
            hint="EMI start date plus one month per installment."
          >
            {(c) => (
              // Read-only and styled as a value: it is worked out, not typed.
              <Input
                {...c}
                type="date"
                readOnly
                tabIndex={-1}
                value={expectedToDate}
                className="bg-surface font-semibold"
              />
            )}
          </Field>
        </FormGrid>
      ) : returnMethod === "ONE_TIME" ? (
        <FormGrid className="md:grid-cols-3">
          <Field
            label="Return Date"
            required
            hint="The day the full amount comes back."
            error={returnError ?? undefined}
          >
            {(c) => (
              <Input
                {...c}
                type="date"
                min={today}
                value={expectedToDate}
                onChange={(e) => onExpectedToChange(e.target.value)}
              />
            )}
          </Field>
        </FormGrid>
      ) : returnMethod ? (
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
                min={expectedFromDate || undefined}
                value={expectedToDate}
                onChange={(e) => onExpectedToChange(e.target.value)}
              />
            )}
          </Field>
        </FormGrid>
      ) : null}
    </FormSection>
  );
}
