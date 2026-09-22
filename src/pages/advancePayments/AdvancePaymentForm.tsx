/**
 * The Advance Payment request form — the fields, the SAP lookups behind them,
 * and validation. Used twice:
 *
 *   * `/Advance_Payment_Request` — a requester raising a new request;
 *   * `/Advance_Payment_Approval` — an approver correcting one before deciding.
 *
 * One component rather than two copies, because the second copy is where the
 * rules would start to drift: an approver must not be able to save an entry
 * the requester could not have submitted.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS LIVE, AND WHAT IS STILL SAMPLE DATA
 * ─────────────────────────────────────────────────────────────────────────
 * Read from SAP (via `services/advancePaymentService`), per company:
 *   * the vendor list — searched on the server, it runs to thousands;
 *   * Vendor → Against Bill's open A/P invoices for the chosen vendor;
 *   * Employee Advance's employees — their advance GL accounts.
 * Still sample data, by decision: Against PO, "All", and Employee Imprest's
 * employees. `rules.ts` (`partnerSourceFor`, `REFERENCE_KINDS[].live`) decides
 * which is which; this file only fetches what it is told is live.
 *
 * Nothing is SUBMITTED anywhere: `onSubmit` hands a validated form to the page.
 */
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  HiOutlineArrowUpTray,
  HiOutlineDocumentText,
  HiOutlineXMark,
} from "react-icons/hi2";

import { Button } from "../../components/ui/button";
import { SearchSelect } from "../../components/ui/dropdown";
import { Field, FormActions, FormGrid, Input, Select, Textarea } from "../../components/ui/form";
import { Notice } from "../../components/ui/page";
import { cn } from "@/lib/utils";
import {
  SAP_MAX_ROWS,
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
} from "../../services/advancePaymentService";

import { ChoiceOrText } from "./ChoiceOrText";
import {
  ACCEPTED_FILE_TYPES,
  COMPANIES,
  MAX_FILE_SIZE_MB,
  PARTNER_TYPES,
  PRIORITIES,
  type Company,
  type OpenDocument,
  type Partner,
  type PartnerType,
  type PaymentAgainst,
  type Priority,
} from "./constants";
import {
  FormSection,
  ReferenceDetails,
  RepaymentDetails,
  RupeeInput,
} from "./PaymentSections";
import {
  EMPTY_FORM,
  PARTNER_CODE_PREFIX,
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
} from "./rules";
import {
  employeeToPartner,
  invoiceToDocument,
  vendorToPartner,
  withCodePrefix,
} from "./sapMapping";
import { formatSize, type MockAttachment } from "./attachments";


/** `value`, once it has stopped changing for `ms` — for search-as-you-type. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
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
              "text-[13px] transition-colors",
              "focus-visible:outline-none focus-visible:shadow-focus",
              // Chosen: the tone's colour, filled, bolder, with a ring.
              // Not chosen: no colour at all — see PRIORITIES in constants.
              checked
                ? cn("font-semibold ring-2", option.active)
                : "border-line bg-card font-medium text-subtle hover:border-line-strong hover:text-body",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-full border-2",
                checked ? "border-current bg-current" : "border-line-strong",
              )}
            >
              {checked ? <span className="size-1.5 rounded-full bg-card" /> : null}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── The form ────────────────────────────────────────────────────────────── */

export interface AdvancePaymentFormProps {
  /** Start from an existing entry — the approver's edit. Blank by default. */
  initial?: RequestForm;
  initialFiles?: MockAttachment[];
  submitLabel?: string;
  /**
   * Called with a form that has PASSED validation. Return a sentence to show
   * as a success notice, or nothing (the approval page closes the editor).
   */
  onSubmit: (form: RequestForm, files: MockAttachment[]) => string | void;
  /** Without it, Cancel clears the form back to `initial`. */
  onCancel?: () => void;
  /** Shown above the fields — the request page's "Preview" note. */
  intro?: React.ReactNode;
}

export function AdvancePaymentForm({
  initial = EMPTY_FORM,
  initialFiles = [],
  submitLabel = "Submit Request",
  onSubmit,
  onCancel,
  intro,
}: AdvancePaymentFormProps) {
  const [form, setForm] = useState<RequestForm>(initial);
  const [files, setFiles] = useState<MockAttachment[]>(initialFiles);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const priorityLabelId = React.useId();

  // What the current answers make visible. Cheap enough to derive per render,
  // and deriving it is what keeps it from ever disagreeing with `form`.
  const c = resolveCase(form);
  const kind = c.reference ? REFERENCE_KINDS[c.reference] : null;
  const company = (form.company || null) as AdvancePaymentCompany | null;

  /**
   * EVERY edit goes through here. `applyChange` clears whatever the edit made
   * stale, so no handler below has to remember what sits beneath its field.
   */
  const change = (patch: Partial<RequestForm>) => {
    setForm((current) => applyChange(current, patch));
    setError("");
    setSuccess("");
  };

  /** An edit to ONE bill's or PO's payment line. */
  const changeLine = (id: string, patch: Partial<Allocation>) => {
    setForm((current) => changeAllocation(current, id, patch));
    setError("");
    setSuccess("");
  };

  /* ── Live partners (SAP vendors / employee advance accounts) ───────────── */

  const [partnerQuery, setPartnerQuery] = useState("");
  const search = useDebounced(partnerQuery.trim(), 300);
  const codePrefix = c.partnerSource ? PARTNER_CODE_PREFIX[c.partnerSource] : undefined;
  const partnersQuery = useQuery({
    queryKey: ["advance-payments", "partners", c.partnerSource, company, search],
    queryFn: async (): Promise<Partner[]> => {
      if (c.partnerSource === "SAP_EMPLOYEES") {
        return (await advancePaymentService.employees(company!, search)).map(employeeToPartner);
      }
      // Vendors (VENDA) and imprest accounts (ORGV) share SAP's supplier
      // list. With nothing typed, SEARCH FOR THE PREFIX — the server returns
      // only that series; with a term, search the term. Either way keep only
      // codes that START with the prefix, and ask for the server's full page
      // so there is enough left after the narrowing.
      const rows = await advancePaymentService.vendors(
        company!,
        search || codePrefix || "",
        SAP_MAX_ROWS,
      );
      return withCodePrefix(rows, codePrefix).map(vendorToPartner);
    },
    enabled: c.livePartners && c.decided && company !== null,
    // Typing a letter should not blank the list while the next page loads.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 1,
  });

  const partnerOptions: Partner[] = c.livePartners ? (partnersQuery.data ?? []) : c.partners;
  // The chosen partner stays in the list even when the current search page no
  // longer holds it — otherwise the picker would show a bare code.
  const shownPartners =
    form.partner && !partnerOptions.some((partner) => partner.value === form.partner)
      ? [
          { value: form.partner, label: form.partnerName || form.partner, code: form.partner },
          ...partnerOptions,
        ]
      : partnerOptions;

  /* ── Live documents (SAP open A/P invoices) ───────────────────────────── */

  const documentsQuery = useQuery({
    queryKey: ["advance-payments", "open-invoices", company, form.partner],
    queryFn: async (): Promise<OpenDocument[]> =>
      (await advancePaymentService.openVendorInvoices(company!, form.partner)).map(
        invoiceToDocument,
      ),
    enabled: c.liveDocuments && company !== null && form.partner !== "",
    staleTime: 60_000,
    retry: 1,
  });
  const documentOptions: OpenDocument[] = c.liveDocuments
    ? (documentsQuery.data ?? [])
    : c.documents;

  /** Ticked ids → the documents themselves, snapshotted into the form. */
  const pickDocuments = (ids: string[]) => {
    const known = new Map(
      [...form.selected, ...documentOptions].map((doc) => [doc.id, doc] as const),
    );
    change({
      selected: ids.map((id) => known.get(id)).filter((doc): doc is OpenDocument => !!doc),
    });
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

  const cancel = () => {
    if (onCancel) return onCancel();
    setForm(initial);
    setFiles(initialFiles);
    setError("");
    setSuccess("");
  };

  const submit = () => {
    const { missing, problems } = validate(form);
    const messages = [
      ...(missing.length > 0 ? [`Still needed: ${missing.join(", ")}.`] : []),
      ...problems,
    ];

    if (messages.length > 0) {
      setError(messages.join(" "));
      setSuccess("");
      return;
    }

    setError("");
    setSuccess(onSubmit(form, files) || "");
  };

  const plainError = c.plainAmount ? plainAmountError(form.amount) : null;

  /* ── What the partner field says under itself ──────────────────────────── */

  const partnerHint = (() => {
    if (!form.type) return "Pick a type first.";
    if (!form.paymentAgainst) return "Pick what the payment is against first.";
    if (c.livePartners && !form.company) {
      return "Pick a company first — each company is its own SAP database.";
    }
    if (c.livePartners && codePrefix) {
      return `Live from SAP — codes starting ${codePrefix}. Type to search by name or code.`;
    }
    if (c.livePartners) return "Live from SAP — type to search by name or code.";
    if (kind) {
      return `Only ${c.partnerLabel.toLowerCase()}s with an open ${kind.noun} are listed. Sample data — not yet connected to SAP.`;
    }
    return "Sample data — not yet connected to SAP.";
  })();
  const partnerError =
    c.livePartners && partnersQuery.isError ? advancePaymentError(partnersQuery.error) : undefined;
  const documentsError =
    c.liveDocuments && documentsQuery.isError
      ? advancePaymentError(documentsQuery.error)
      : undefined;

  return (
    <div className="space-y-5">
      {intro}

      {error ? (
        <Notice tone="bad" title="Check the form">
          {error}
        </Notice>
      ) : null}

      {success ? (
        <Notice tone="ok" title="Looks complete">
          {success}
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
                {COMPANIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
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
              // Pick a listed answer, or TYPE what else it is — no separate
              // "Other" to choose first. A typed answer is stored as OTHER plus
              // the text, so the rules are unchanged.
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
            error={partnerError}
            hint={partnerError ? undefined : partnerHint}
          >
            {(f) => (
              <SearchSelect<string>
                id={f.id}
                value={form.partner}
                onChange={(next) =>
                  change({
                    partner: next,
                    partnerName: shownPartners.find((p) => p.value === next)?.label ?? "",
                  })
                }
                disabled={!c.decided || (c.livePartners && !form.company)}
                placeholder={`Select ${c.partnerLabel}`}
                searchPlaceholder="Search name or code…"
                emptyText={c.livePartners ? "No match in SAP" : "No matches"}
                onQueryChange={c.livePartners ? setPartnerQuery : undefined}
                loading={c.livePartners && partnersQuery.isFetching}
                options={shownPartners.map((partner) => ({
                  value: partner.value,
                  label: partner.label,
                  // For sample documents, the count says what the next
                  // dropdown will hold before the requester commits.
                  hint:
                    c.reference && !c.liveDocuments
                      ? `${partner.code} · ${documentsFor(c.reference, partner.value).length} open`
                      : partner.code,
                }))}
              />
            )}
          </Field>

          {/* A plain amount only where there is no document to take it
              from. Where there is one, the amount is worked out per
              document below and is never typed free-hand here. */}
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
              adjusted against the PO(s). */}
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

          {/* Imprest only. It belongs to the TYPE, not to what the payment is
              against — so it stays through a Payment Against change within
              Imprest and goes only when the type does. */}
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
          documents={documentOptions}
          value={form.selected.map((doc) => doc.id)}
          onChange={pickDocuments}
          hasPartner={form.partner !== ""}
          partnerLabel={c.partnerLabel}
          live={c.liveDocuments}
          loading={c.liveDocuments && documentsQuery.isFetching}
          error={documentsError}
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
            {/* Not a `Field`: a radiogroup is labelled by an element, not by a
                `for`/`id` pair pointing at one control. */}
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
          <div
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer min-w-0 flex-1 flex-col items-center gap-1 text-center"
          >
            <HiOutlineArrowUpTray className="size-5 text-brand" aria-hidden="true" />
            <p className="m-0 text-[13px] text-body">
              Drag and drop files here or{" "}
              <Button
                variant="link"
                size="inline"
                className="font-medium text-brand"
                // The whole zone already opens the picker, so this must NOT
                // bubble — two `click()` calls in one gesture is two file
                // dialogs queued on some browsers. It stays a real button so
                // the zone is reachable by keyboard, which a div is not.
                onClick={(e) => {
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                click to browse
              </Button>
            </p>
            <p className="m-0 text-[11.5px] text-subtle">
              Supported formats: PDF, JPG, PNG, DOC, DOCX (Max size: {MAX_FILE_SIZE_MB} MB per
              file)
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
              // Cleared so picking the same file again still fires `change` —
              // otherwise a removed file cannot be re-added.
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
                <HiOutlineDocumentText className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{file.name}</span>
                <span className="shrink-0 text-[11.5px] text-subtle">{formatSize(file.size)}</span>
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
        <Button variant="secondary" onClick={cancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit}>
          {submitLabel}
        </Button>
      </FormActions>
    </div>
  );
}
