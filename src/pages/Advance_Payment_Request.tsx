/**
 * Advance Payments — New Request. UI ONLY.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS PAGE TALKS TO NOTHING
 * ─────────────────────────────────────────────────────────────────────────
 * No query, no mutation, no service import. Every list it offers comes from
 * `advancePayments/constants.ts`, and Submit does exactly one thing: it shows
 * a banner saying the submission was not sent. That is deliberate and it is
 * the whole scope — the module has no endpoint, no model, no approval route
 * and no SAP posting yet, and a form that half-writes somewhere is worse than
 * one that visibly writes nowhere.
 *
 * Attachments are the same story: files are held in component state so the
 * strip can be filled and emptied, and are dropped the moment the page
 * unmounts. Nothing is uploaded or read.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE PAGE DRAWS; `advancePayments/rules.ts` DECIDES
 * ─────────────────────────────────────────────────────────────────────────
 * The form is a cascade — Type → Payment Against → (Advance Against) →
 * partner → document → open amount → mode → amount or % → payment — and which
 * sections appear, which partners and documents are offered, and what each
 * change clears are all answered there, in one table and a few pure
 * functions that `rules.test.ts` pins case by case. This file asks
 * `resolveCase` what to show and sends every edit through `applyChange`; it
 * holds no business rule of its own.
 */
import * as React from "react";
import { useRef, useState } from "react";
import {
  HiOutlineArrowUpTray,
  HiOutlineBanknotes,
  HiOutlineDocumentText,
  HiOutlineXMark,
} from "react-icons/hi2";

import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import { SearchSelect } from "../components/ui/dropdown";
import { Field, FormActions, FormGrid, Input, Select, Textarea } from "../components/ui/form";
import { Card, Notice, Page, PageHeader } from "../components/ui/page";
import { cn } from "@/lib/utils";

import {
  ACCEPTED_FILE_TYPES,
  COMPANIES,
  MAX_FILE_SIZE_MB,
  PARTNER_TYPES,
  PRIORITIES,
  type Company,
  type PartnerType,
  type PaymentAgainst,
  type Priority,
} from "./advancePayments/constants";
import { ChoiceOrText } from "./advancePayments/ChoiceOrText";
import {
  FormSection,
  ReferenceDetails,
  RepaymentDetails,
  RupeeInput,
} from "./advancePayments/PaymentSections";
import {
  EMPTY_FORM,
  REFERENCE_KINDS,
  allocationRows,
  allocationTotals,
  applyChange,
  changeAllocation,
  documentsFor,
  plainAmountError,
  resolveCase,
  validate,
  type Allocation,
  type RequestForm,
} from "./advancePayments/rules";

/** A file the user dropped in, held in memory only. */
interface MockAttachment {
  id: string;
  name: string;
  size: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Priority selector ───────────────────────────────────────────────────── */

/**
 * Three cards, not a `SegmentedControl`.
 *
 * The segmented control is the right control for a filter — a compact strip
 * where one pill is filled. This is a form field standing beside other
 * inputs, and it carries a colour per option; rendered as a segment strip the
 * dots vanish and the row no longer lines up with the inputs either side of
 * it. It is a real `radiogroup` with arrow-key movement, so the semantics are
 * the segmented control's even though the skin is not.
 */
function PrioritySelector({
  value,
  onChange,
  labelledBy,
}: {
  value: Priority;
  onChange: (next: Priority) => void;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const index = PRIORITIES.findIndex((option) => option.value === value);
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? PRIORITIES.length - 1
          : (index + (forward ? 1 : -1) + PRIORITIES.length) % PRIORITIES.length;
    event.preventDefault();
    onChange(PRIORITIES[next].value);
    ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className="grid grid-cols-3 gap-2.5"
    >
      {PRIORITIES.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              // Preflight is not imported in this app, so a bare <button>
              // keeps the UA's outset border and grey face — hence the reset.
              "appearance-none [font-family:inherit] cursor-pointer",
              "flex h-control items-center justify-center gap-2 rounded-sm border",
              "text-[13px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:shadow-focus",
              checked
                ? "border-brand bg-brand-soft text-ink"
                : "border-line bg-card text-body hover:border-line-strong",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-3.5 shrink-0 place-items-center rounded-full border-2 border-current",
                option.dot,
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Pick …" hint for the partner field while the questions above it are open. */
function partnerHint(form: RequestForm) {
  if (!form.type) return "Pick a type first.";
  if (!form.paymentAgainst) return "Pick what the payment is against first.";
  return undefined;
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function Advance_Payment_Request() {
  const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
  const [files, setFiles] = useState<MockAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const priorityLabelId = React.useId();

  // What the current answers make visible. Cheap enough to derive per render,
  // and deriving it is what keeps it from ever disagreeing with `form`.
  const c = resolveCase(form);
  const kind = c.reference ? REFERENCE_KINDS[c.reference] : null;

  /**
   * EVERY edit goes through here. `applyChange` clears whatever the edit made
   * stale, so no handler below has to remember what sits beneath its field.
   */
  const change = (patch: Partial<RequestForm>) => {
    setForm((current) => applyChange(current, patch));
    setError("");
    setSubmitted(false);
  };

  /** An edit to ONE bill's or PO's payment line. */
  const changeLine = (id: string, patch: Partial<Allocation>) => {
    setForm((current) => changeAllocation(current, id, patch));
    setError("");
    setSubmitted(false);
  };

  const rows = allocationRows(form);
  const totals = allocationTotals(rows);

  /* ── Attachments (local only — nothing is uploaded) ────────────────────── */

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const accepted: MockAttachment[] = [];
    const rejected: string[] = [];

    Array.from(incoming).forEach((file) => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        rejected.push(file.name);
        return;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        name: file.name,
        size: file.size,
      });
    });

    if (accepted.length > 0) setFiles((current) => [...current, ...accepted]);
    setError(
      rejected.length > 0
        ? `Over the ${MAX_FILE_SIZE_MB} MB limit and not added: ${rejected.join(", ")}`
        : "",
    );
  };

  const removeFile = (id: string) =>
    setFiles((current) => current.filter((file) => file.id !== id));

  /* ── Actions ───────────────────────────────────────────────────────────── */

  const reset = () => {
    setForm(EMPTY_FORM);
    setFiles([]);
    setError("");
    setSubmitted(false);
  };

  const submit = () => {
    const { missing, problems } = validate(form);
    const messages = [
      ...(missing.length > 0 ? [`Still needed: ${missing.join(", ")}.`] : []),
      ...problems,
    ];

    if (messages.length > 0) {
      setError(messages.join(" "));
      setSubmitted(false);
      return;
    }

    // MOCK: this is where the request would be posted. Nothing is sent.
    setError("");
    setSubmitted(true);
  };

  const plainError = c.plainAmount ? plainAmountError(form.amount) : null;

  return (
    <Page>
      {/* The parent crumb is a plain label, not a link: the Advance Payments
          list screen does not exist yet, and a crumb pointing at a route the
          router would bounce is worse than one that simply names where this
          sits. It becomes a `to` the day that page lands. */}
      <Breadcrumbs items={[{ label: "Advance Payments" }, { label: "New Request" }]} />

      <PageHeader
        eyebrow="Payments"
        title={
          <span className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-white">
              <HiOutlineBanknotes className="size-4" aria-hidden="true" />
            </span>
            New Advance Payment Request
          </span>
        }
        description="Create a request for advance payment to vendors, employees or other business partners."
      />

      <Card className="mt-4 p-4 md:p-5">
        <div className="space-y-5">
          {/* Stated on the page, not only in this file: anyone clicking
              through a review build should know it writes nowhere. */}
          <Notice tone="info" title="Preview">
            This screen is the interface only — the lists are sample data and
            Submit does not send anything.
          </Notice>

          {error ? (
            <Notice tone="bad" title="Check the form">
              {error}
            </Notice>
          ) : null}

          {submitted ? (
            <Notice tone="ok" title="Looks complete">
              Nothing was submitted — this page has no backend behind it yet.
            </Notice>
          ) : null}

          {/* ── Payment Details ───────────────────────────────────────── */}
          <FormSection title="Payment Details">
            <FormGrid className="md:grid-cols-3">
              <Field label="Company" required>
                {(f) => (
                  <Select
                    {...f}
                    value={form.company}
                    onChange={(e) => change({ company: e.target.value as Company | "" })}
                  >
                    {/* Hidden placeholder: shown while nothing is chosen, but not
                        offered in the open list. Without an empty option the
                        control would DISPLAY its first choice while the form
                        holds nothing — and picking that choice would not fire. */}
                    <option value="" disabled hidden>
                      Select Company
                    </option>
                    {COMPANIES.map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Type" required>
                {(f) => (
                  <Select
                    {...f}
                    value={form.type}
                    onChange={(e) => change({ type: e.target.value as PartnerType | "" })}
                  >
                    <option value="" disabled hidden>
                      Select Type
                    </option>
                    {PARTNER_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label="Payment Against"
                required
                hint={form.type ? undefined : "Pick a type first."}
              >
                {(f) => (
                  // Pick Advance / Against Bill, or TYPE what else it is —
                  // no separate "Other" to choose first. A typed answer is
                  // stored as OTHER plus the text, so the rules are unchanged.
                  <ChoiceOrText<PaymentAgainst>
                    id={f.id}
                    aria-describedby={f["aria-describedby"]}
                    required
                    disabled={!form.type}
                    options={c.paymentAgainstOptions.filter((option) => option.value !== "OTHER")}
                    otherValue="OTHER"
                    value={form.paymentAgainst}
                    text={form.paymentAgainstOther}
                    onChange={(paymentAgainst, paymentAgainstOther) =>
                      change({ paymentAgainst, paymentAgainstOther })
                    }
                  />
                )}
              </Field>
            </FormGrid>

            <FormGrid className="md:grid-cols-3">
              <Field
                label={c.partnerLabel}
                required
                hint={
                  partnerHint(form) ??
                  (kind
                    ? `Only ${c.partnerLabel.toLowerCase()}s with an open ${kind.noun} are listed.`
                    : undefined)
                }
              >
                {(f) => (
                  <SearchSelect<string>
                    id={f.id}
                    value={form.partner}
                    onChange={(next) => change({ partner: next })}
                    disabled={!c.decided}
                    placeholder={`Select ${c.partnerLabel}`}
                    searchPlaceholder="Search name or code…"
                    options={c.partners.map((partner) => ({
                      value: partner.value,
                      label: partner.label,
                      // The count tells the requester what the next dropdown
                      // will hold before they commit to this partner.
                      hint: c.reference
                        ? `${partner.code} · ${documentsFor(c.reference, partner.value).length} open`
                        : partner.code,
                    }))}
                  />
                )}
              </Field>

              {/* A plain amount only where there is no document to take it
                  from. Where there is one, the amount is worked out in
                  Payment Calculation and is never typed free-hand here. */}
              {c.plainAmount ? (
                <Field label="Amount" required error={plainError ?? undefined}>
                  {(f) => (
                    <RupeeInput
                      {...f}
                      placeholder="Enter amount"
                      value={form.amount}
                      onChange={(e) => change({ amount: e.target.value })}
                    />
                  )}
                </Field>
              ) : null}

              {/* Vendor → Against PO only: when the payment is expected to be
                  adjusted against the PO(s). Sits beside the partner, in the
                  slot a PO case leaves free — its amount is worked out per PO
                  below rather than typed here. */}
              {c.expectedDate ? (
                <Field label="Expected Date" required>
                  {(f) => (
                    <Input
                      {...f}
                      type="date"
                      value={form.expectedDate}
                      onChange={(e) => change({ expectedDate: e.target.value })}
                    />
                  )}
                </Field>
              ) : null}

              {/* Imprest only. It belongs to the TYPE, not to what the
                  payment is against — so it stays through a Payment Against
                  change within Imprest and goes only when the type does. */}
              {c.expectedBillDate ? (
                <Field
                  label="Expected Bill Date"
                  required
                  hint="When the bills against this imprest are expected."
                >
                  {(f) => (
                    <Input
                      {...f}
                      type="date"
                      value={form.expectedBillDate}
                      onChange={(e) => change({ expectedBillDate: e.target.value })}
                    />
                  )}
                </Field>
              ) : null}
            </FormGrid>
          </FormSection>

          {/* ── Repayment & Settlement (Employee Advance + Advance) ──── */}
          {c.repayment ? (
            <RepaymentDetails
              amount={form.amount}
              returnMethod={form.returnMethod}
              returnMethodOther={form.returnMethodOther}
              installments={form.installments}
              expectedFromDate={form.expectedFromDate}
              expectedToDate={form.expectedToDate}
              onReturnMethodChange={(returnMethod, returnMethodOther) =>
                change({ returnMethod, returnMethodOther })
              }
              onInstallmentsChange={(installments) => change({ installments })}
              onExpectedFromChange={(expectedFromDate) => change({ expectedFromDate })}
              onExpectedToChange={(expectedToDate) => change({ expectedToDate })}
            />
          ) : null}

          {/* ── Reference Details: the documents, one payment line each ─ */}
          {c.reference ? (
            <ReferenceDetails
              kind={c.reference}
              documents={c.documents}
              value={form.references}
              onChange={(references) => change({ references })}
              hasPartner={form.partner !== ""}
              partnerLabel={c.partnerLabel}
              rows={rows}
              totals={totals}
              onAllocationChange={changeLine}
            />
          ) : null}

          {/* ── Additional Information ────────────────────────────────── */}
          <FormSection title="Additional Information">
            <FormGrid className="md:grid-cols-3">
              {/* Free text: who owns this request. There is no master list of
                  owners to pick from, so a dropdown would only be a guess. */}
              <Field label="Ownership" required>
                {(f) => (
                  <Input
                    {...f}
                    placeholder="Enter ownership"
                    maxLength={120}
                    value={form.ownership}
                    onChange={(e) => change({ ownership: e.target.value })}
                  />
                )}
              </Field>

              <Field label="Payment Date" required>
                {(f) => (
                  <Input
                    {...f}
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => change({ paymentDate: e.target.value })}
                  />
                )}
              </Field>

              <div className="flex min-w-0 flex-col gap-1.5">
                {/* Not a `Field`: a radiogroup is labelled by an element, not by
                    a `for`/`id` pair pointing at one control. */}
                <span id={priorityLabelId} className="text-[12px] font-medium text-body">
                  Priority
                  <span className="ml-0.5 text-danger" aria-hidden="true">
                    *
                  </span>
                </span>
                <PrioritySelector
                  value={form.priority}
                  onChange={(priority) => change({ priority })}
                  labelledBy={priorityLabelId}
                />
              </div>
            </FormGrid>

            <Field label="Remarks" required>
              {(f) => (
                <Textarea
                  {...f}
                  rows={4}
                  placeholder="Enter remarks"
                  value={form.remarks}
                  onChange={(e) => change({ remarks: e.target.value })}
                />
              )}
            </Field>
          </FormSection>

          {/* ── Attachments ─────────────────────────────────────────────── */}
          <FormSection title="Attachments">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3",
                "rounded-card border border-dashed px-4 py-6 transition-colors",
                dragging ? "border-brand bg-brand-soft" : "border-line-strong bg-surface",
              )}
            >
              <div onClick={() => fileRef.current?.click()} className="flex cursor-pointer min-w-0 flex-1 flex-col items-center gap-1 text-center">
                <HiOutlineArrowUpTray className="size-5 text-brand" aria-hidden="true" />
                <p className="m-0 text-[13px] text-body">
                  Drag and drop files here or{" "}
                  <Button
                    variant="link"
                    size="inline"
                    className="font-medium text-brand"
                    // The whole zone already opens the picker, so this must
                    // NOT bubble — two `click()` calls in one gesture is two
                    // file dialogs queued on some browsers. It stays a real
                    // button so the zone is reachable by keyboard, which a
                    // div with an onClick is not.
                    onClick={(e) => {
                      e.stopPropagation();
                      fileRef.current?.click();
                    }}
                  >
                    click to browse
                  </Button>
                </p>
                <p className="m-0 text-[11.5px] text-subtle">
                  Supported formats: PDF, JPG, PNG, DOC, DOCX (Max size:{" "}
                  {MAX_FILE_SIZE_MB} MB per file)
                </p>
              </div>

              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES}
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  // Cleared so picking the same file again still fires
                  // `change` — otherwise a removed file cannot be re-added.
                  e.target.value = "";
                }}
              />
            </div>

            {files.length > 0 ? (
              <ul className="m-0 list-none space-y-1.5 p-0">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2"
                  >
                    <HiOutlineDocumentText
                      className="size-4 shrink-0 text-subtle"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                      {file.name}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-subtle">
                      {formatSize(file.size)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => removeFile(file.id)}
                    >
                      <HiOutlineXMark className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </FormSection>

          <FormActions>
            <Button variant="secondary" onClick={reset}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit}>
              Submit Request
            </Button>
          </FormActions>
        </div>
      </Card>
    </Page>
  );
}
