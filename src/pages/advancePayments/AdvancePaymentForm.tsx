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
 *   * Vendor → Against Bill: the chosen vendor's open A/P invoices;
 *   * Vendor → Against PO: their open POs, with what is still to receive;
 *   * Vendor → All: every other open document (receipts, returns, credit
 *     memos, payments on account, journals);
 *   * Employee's employees — their advance GL accounts. `rules.ts` (`partnerSourceFor`, `REFERENCE_KINDS[].live`) decides
 * which is which; this file only fetches what it is told is live.
 *   * Expense: no partner — who is paid is typed — plus the Sub Budget, and
 *     `ExpenseDetails` (Month, Electricity, the lines to expense G/Ls).
 *
 * The form saves nothing itself: `onSubmit` hands a validated form to the page,
 * which sends it to the server and says how that went.
 */
import * as React from "react";
import { useEffect, useRef, useState } from "react";

import { showToast } from "@/lib/toastStore";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  HiOutlineArrowUpTray,
  HiOutlineDocumentText,
  HiOutlineXMark,
} from "react-icons/hi2";

import { Button } from "../../components/ui/button";
import { MultiSelect, SearchSelect } from "../../components/ui/dropdown";
import { Field, FormActions, FormGrid, Input, Select, Textarea } from "../../components/ui/form";
import { Notice } from "../../components/ui/page";
import { cn } from "@/lib/utils";
import {
  SAP_MAX_ROWS,
  advancePaymentError,
  advancePaymentService,
  DOCUMENT_LIMIT,
  type AdvancePaymentCompany,
} from "../../services/advancePaymentService";

import { ChoiceOrText } from "./ChoiceOrText";
import {
  ACCEPTED_FILE_TYPES,
  COMPANIES,
  MAX_FILE_SIZE_MB,
  type Company,
  type OpenDocument,
  type Partner,
  type PartnerType,
  type PaymentAgainst,
  isNotInSap,
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
  suggestedAccountPurpose,
  typesFor,
  EXPENSE_PAYEES,
  type ExpensePayee,
  REFERENCE_KINDS,
  allocationRows,
  allocationTotals,
  applyChange,
  availableOf,
  changeAllocation,
  departmentHeadLoginError,
  documentsFor,
  dueSoon,
  DUE_SOON_DAYS,
  needsBillDueDate,
  needsDepartmentHead,
  needsProof,
  vendorExpense,
  paymentDateIsToday,
  plainAmountError,
  pastDateError,
  partnerCodes,
  resolveCase,
  todayIso,
  expenseTotal,
  parseNumber,
  validate,
  type Allocation,
  type RequestForm,
} from "./rules";
import {
  employeeToPartner,
  invoiceToDocument,
  ledgerToDocument,
  notInSapEmployeeToPartner,
  ownerLabel,
  otherToDocument,
  paymentAccountToPartner,
  purchaseOrderToDocument,
  vendorToPartner,
  withCodePrefix,
} from "./sapMapping";
import { attachFile, formatSize, type FileAttachment } from "./attachments";
import { VendorExpenseBill } from "./VendorExpenseBill";
import { VendorOnAccount } from "./VendorOnAccount";
import { SapPartnerLink } from "./SapDocument";
import { ExpenseDetails } from "./ExpenseDetails";
import { docEntryOf } from "./requestApi";
import { FactoryLimitStrip } from "./FactoryLimit";
import { factoryLimitError, useFactoryLimit } from "./factoryLimitData";


/** `value`, once it has stopped changing for `ms` — for search-as-you-type. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/* ── The form ────────────────────────────────────────────────────────────── */

export interface AdvancePaymentFormProps {
  /** Start from an existing entry — the approver's edit. Blank by default. */
  initial?: RequestForm;
  initialFiles?: FileAttachment[];
  submitLabel?: string;
  /**
   * Called with a form that has PASSED validation, to save it. Resolve with a
   * sentence to show as a success notice, or nothing (the page moves on);
   * throw with the server's message, and it is shown above the buttons.
   */
  onSubmit: (form: RequestForm, files: FileAttachment[]) => Promise<string | void> | string | void;
  /** A second way to save — "Save & Resubmit" on a returned request. */
  secondarySubmit?: {
    label: string;
    onSubmit: (form: RequestForm, files: FileAttachment[]) => Promise<string | void> | string | void;
  };
  /** Without it, Cancel clears the form back to `initial`. */
  onCancel?: () => void;
  /** Shown above the fields — the request page's "Preview" note. */
  intro?: React.ReactNode;
  /**
   * A NEW request may name several employees (Employee Imprest against
   * documents); the page then raises one request each. Off when editing:
   * an edit is one request.
   */
  multiplePartners?: boolean;
  /**
   * A NEW request: show Ziyaul's Factory daily limit while a Factory request
   * is raised, and refuse Submit past it. Off when editing — an edit counts
   * against the day it was raised, which the server checks.
   */
  dailyLimit?: boolean;
  /**
   * Which page raises it (user, 2026-10-20): Payments offers every type but
   * Expense; Expenses offers Expense only. Unset (an edit, the desk): every
   * type, so a saved request always finds its own.
   */
  section?: RequestSection;
}

/** The two pages that raise requests: Payments, and Expenses (2026-10-20). */
export type RequestSection = "payments" | "expenses";

export function AdvancePaymentForm({
  initial = EMPTY_FORM,
  initialFiles = [],
  submitLabel = "Submit Request",
  onSubmit,
  secondarySubmit,
  onCancel,
  intro,
  multiplePartners = false,
  section,
  dailyLimit = false,
}: AdvancePaymentFormProps) {
  const [form, setForm] = useState<RequestForm>(initial);
  const [files, setFiles] = useState<FileAttachment[]>(initialFiles);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // What the current answers make visible. Cheap enough to derive per render,
  // and deriving it is what keeps it from ever disagreeing with `form`.
  const c = resolveCase(form);
  const kind = c.reference ? REFERENCE_KINDS[c.reference] : null;
  // The earliest day the forward-looking dates accept: Expected Bill Date (PO),
  // Expected Bill Date (Imprest), EMI Start Date and Return Date. Per render
  // rather than once, so a form left open past midnight moves with the day.
  const today = todayIso();
  const company = (form.company || null) as AdvancePaymentCompany | null;
  // Several employees, one request each: a new Employee Imprest against documents.
  const multi = multiplePartners && c.multiplePartners;

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
        // SAP's advance accounts, then the employee master's people who have
        // none, marked "Not in SAP". The second list failing must not take
        // the SAP list with it.
        const [inSap, notInSap] = await Promise.all([
          advancePaymentService.employees(company!, search),
          advancePaymentService
            .employeeDirectory({ notInSapFor: company!, search })
            .catch(() => []),
        ]);
        return [...inSap.map(employeeToPartner), ...notInSap.map(notInSapEmployeeToPartner)];
      }
      // The G/L accounts an Account Payment may pay (Katebaa, TPT, BSU…).
      if (c.partnerSource === "SAP_ACCOUNTS") {
        return (await advancePaymentService.paymentAccounts(company!, search)).map(paymentAccountToPartner);
      }
      // SAP's customers (CardType C): who a refund is paid to.
      if (c.partnerSource === "SAP_CUSTOMERS") {
        return (await advancePaymentService.customers(company!, search, SAP_MAX_ROWS)).map(vendorToPartner);
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

  /* ── Department: the company's budget heads, from SAP ───────────────── */

  const budgetsQuery = useQuery({
    queryKey: ["advance-payments", "budgets", company],
    queryFn: () => advancePaymentService.budgets(company!),
    enabled: company !== null,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const departmentOptions = (budgetsQuery.data ?? [])
    .filter((b) => b.kind === "BUDGET")
    .map((b) => ({ value: b.code, label: b.name, hint: b.code === b.name ? "" : b.code }));
  // A request saved with a budget head SAP no longer lists keeps showing it.
  if (form.budget && !departmentOptions.some((o) => o.value === form.budget)) {
    departmentOptions.unshift({ value: form.budget, label: form.budgetName || form.budget, hint: "" });
  }
  const departmentHint = !company
    ? "Choose the company first."
    : budgetsQuery.isError
      ? undefined
      : c.expense
        ? undefined
        : "SAP's budget heads.";

  /* ── Payment Purpose: the Payment Desk's list ───────────────────────── */

  const purposesQuery = useQuery({
    queryKey: ["advance-payments", "payment-purposes"],
    queryFn: () => advancePaymentService.paymentPurposes(),
    staleTime: 60 * 60_000,
    retry: 1,
  });
  // A case may limit its purposes to those paid by a due date (none does since
  // 2026-10-21: a Vendor On Account takes any purpose).
  const purposeOptions = (purposesQuery.data ?? [])
    .filter((p) => !c.dueDatePurposesOnly || p.due_date)
    .map((p) => ({
      value: p.code,
      label: p.label,
      hint: p.group,
    }));
  // A request saved with a purpose since retired keeps showing it.
  if (form.purpose && !purposeOptions.some((o) => o.value === form.purpose)) {
    purposeOptions.unshift({ value: form.purpose, label: form.purposeLabel || form.purpose, hint: "" });
  }
  const purposeNeedsHead = (code: string) =>
    Boolean(purposesQuery.data?.find((p) => p.code === code)?.needs_head);
  const purposeDueDate = (code: string) =>
    Boolean(purposesQuery.data?.find((p) => p.code === code)?.due_date);
  // As with the head: an edited request learns from the list whether its purpose takes a due date.
  const listedDueDate = purposesQuery.data ? purposeDueDate(form.purpose) : null;
  useEffect(() => {
    if (listedDueDate !== null && listedDueDate !== form.purposeDueDate) {
      setForm((current) => applyChange(current, { purposeDueDate: listedDueDate }));
    }
  }, [listedDueDate, form.purposeDueDate]);
  // An edited request learns from the list whether its purpose is approved by
  // department: the saved request only says whether a head was named.
  const listedNeedsHead = purposesQuery.data ? purposeNeedsHead(form.purpose) : null;
  useEffect(() => {
    if (listedNeedsHead !== null && listedNeedsHead !== form.purposeNeedsHead) {
      setForm((current) => applyChange(current, { purposeNeedsHead: listedNeedsHead }));
    }
  }, [listedNeedsHead, form.purposeNeedsHead]);

  /* ── Department Head: an HOD of the employee master, with their login ─ */

  const askHead = needsDepartmentHead(form);
  const [headSearch, setHeadSearch] = useState("");
  const settledHeadSearch = useDebounced(headSearch, 250);
  const headsQuery = useQuery({
    queryKey: ["advance-payments", "department-heads", settledHeadSearch],
    queryFn: () => advancePaymentService.departmentHeads(settledHeadSearch),
    enabled: askHead,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 1,
  });
  const headChoices = headsQuery.data ?? [];
  // Each HOD says which login approves for them, or that they have none.
  const headOptions = headChoices.map((h) => ({
    value: h.employee_code,
    label: h.employee_name,
    hint: h.user ? `${h.employee_code} · approves as ${h.user.username}` : `${h.employee_code} · No OMS login`,
  }));
  // The head already picked stays shown while a search lists other people.
  if (form.departmentHead && !headOptions.some((o) => o.value === form.departmentHead)) {
    headOptions.unshift({ value: form.departmentHead, label: form.departmentHeadName || form.departmentHead, hint: "" });
  }
  const headLoginError =
    form.departmentHead && !form.departmentHeadLogin ? departmentHeadLoginError(form.departmentHeadName) : undefined;

  /* ── Owners: the employee master's HODs and Sub-HODs ─────────────────── */

  const ownersQuery = useQuery({
    queryKey: ["advance-payments", "owners"],
    queryFn: () => advancePaymentService.employeeDirectory({ roles: [1, 2] }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const ownerOptions = (ownersQuery.data ?? []).map((employee) => ({
    value: ownerLabel(employee),
    label: ownerLabel(employee),
    hint: employee.role_label,
  }));
  // A request saved before owners were picked from the list keeps its owner.
  if (form.ownership && !ownerOptions.some((o) => o.value === form.ownership)) {
    ownerOptions.unshift({ value: form.ownership, label: form.ownership, hint: "" });
  }

  /* ── Live documents: the vendor's bills, POs, or everything else ─────── */

  // One query, keyed on the KIND as well as the vendor, so switching Payment
  // Against between Bill, PO and All never shows one list under another's
  // heading while the next one loads.
  const partnersShown = multi ? partnerCodes(form) : [form.partner];
  const documentsQuery = useQuery({
    queryKey: ["advance-payments", "documents", c.reference, company, ...partnersShown],
    queryFn: async (): Promise<OpenDocument[]> => {
      const fetchFor = async (partner: string): Promise<OpenDocument[]> => {
        if (c.reference === "VENDOR_PO") {
          return (await advancePaymentService.openVendorPurchaseOrders(company!, partner)).map(
            (po) => purchaseOrderToDocument(po, company!),
          );
        }
        if (c.reference === "CUSTOMER_LEDGER") {
          // The customer's open ledger items a refund can be applied to, less
          // any that other OMS requests already hold in full.
          const ledger = await advancePaymentService.partnerLedger(company!, partner);
          return ledger.results
            .map((doc) => ledgerToDocument(doc, partner))
            .filter((doc): doc is OpenDocument => doc !== null && availableOf(doc) > 0);
        }
        if (c.reference === "IMPREST_JOURNAL") {
          // The journal entries crediting the staff account (TA/DA, incentive),
          // less any other OMS requests already hold in full.
          const ledger = await advancePaymentService.partnerLedger(company!, partner);
          return ledger.results
            .filter((doc) => doc.doc_type_code === 30 && doc.direction === "CREDIT")
            .map((doc) => ledgerToDocument(doc, partner, "employee"))
            .filter((doc): doc is OpenDocument => doc !== null && availableOf(doc) > 0);
        }
        if (c.reference === "VENDOR_OTHER") {
          return (await advancePaymentService.openOtherDocuments(company!, partner)).map(
            (doc) => otherToDocument(doc, partner),
          );
        }
        return (await advancePaymentService.openVendorInvoices(company!, partner)).map(
          (invoice) => invoiceToDocument(invoice, company!),
        );
      };
      const lists = await Promise.all(partnersShown.map(fetchFor));
      if (lists.length < 2) return lists[0] ?? [];
      // Several employees: say whose each document is.
      const names = new Map([
        [form.partner, form.partnerName],
        ...form.morePartners.map((p) => [p.code, p.name] as const),
      ]);
      return lists.flat().map((doc) => ({
        ...doc,
        note: [names.get(doc.partner) || doc.partner, doc.note].filter(Boolean).join(" — "),
      }));
    },
    enabled: c.liveDocuments && company !== null && form.partner !== "",
    staleTime: 60_000,
    retry: 1,
  });
  // A vendor with more open bills / POs than one list holds (Reliance Retail,
  // Jivo Wellness): the picker's search asks SAP too, so an old one is found
  // by its number or vendor ref, and what it finds is offered with the rest.
  const [docSearch, setDocSearch] = useState("");
  const searchTerm = useDebounced(docSearch.trim(), 300);
  const searchable = !multi && (c.reference === "VENDOR_PO" || c.reference === "VENDOR_BILL");
  const capped = (documentsQuery.data?.length ?? 0) >= DOCUMENT_LIMIT;
  const searchQuery = useQuery({
    queryKey: ["advance-payments", "documents-search", c.reference, company, form.partner, searchTerm],
    queryFn: async (): Promise<OpenDocument[]> =>
      c.reference === "VENDOR_PO"
        ? (await advancePaymentService.openVendorPurchaseOrders(company!, form.partner, searchTerm)).map((po) =>
            purchaseOrderToDocument(po, company!),
          )
        : (await advancePaymentService.openVendorInvoices(company!, form.partner, searchTerm)).map((invoice) =>
            invoiceToDocument(invoice, company!),
          ),
    enabled: searchable && capped && searchTerm.length >= 2 && company !== null && form.partner !== "",
    staleTime: 60_000,
    retry: 1,
  });
  const documentOptions: OpenDocument[] = c.liveDocuments
    ? [
        ...(documentsQuery.data ?? []),
        ...(searchQuery.data ?? []).filter((doc) => !(documentsQuery.data ?? []).some((d) => d.id === doc.id)),
      ]
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

  // What the request will ask for: its lines, its documents, or the typed amount.
  const requestAmount = c.expense
    ? expenseTotal(form.expenseLines)
    : c.reference
      ? totals.payment
      : parseNumber(form.amount) || 0; // blank (null) or half-typed (NaN): nothing yet
  const factoryLimit = useFactoryLimit(form.company, form.budget, form.purpose, dailyLimit);

  // The chosen documents' SAP attachments are NOT read (OCR) any more — not in
  // the background here, not on the desk (removed 2026-10-07). Approvers open
  // the attachments themselves.

  /* ── Attachments (local only — nothing is uploaded) ────────────────────── */

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const accepted: FileAttachment[] = [];
    const rejected: string[] = [];

    Array.from(incoming).forEach((file) => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        rejected.push(file.name);
        return;
      }
      accepted.push(attachFile(file));
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

  const submit = async (
    save: (form: RequestForm, files: FileAttachment[]) => Promise<string | void> | string | void = onSubmit,
  ) => {
    const { missing, problems } = validate(form, today);
    // The Payment desk checks the bill (or policy) against what is entered.
    if (needsProof(form) && files.length === 0) missing.push("Attachment (the bill or policy)");
    const overLimit = factoryLimit.counts ? factoryLimitError(factoryLimit.query.data, requestAmount) : null;
    const messages = [
      ...(missing.length > 0 ? [`Still needed: ${missing.join(", ")}.`] : []),
      ...problems,
      ...(overLimit ? [overLimit] : []),
    ];

    if (messages.length > 0) {
      setError(messages.join(" "));
      setSuccess("");
      showToast({ title: "Not submitted", message: messages.join(" "), tone: "bad" });
      return;
    }

    setError("");
    setSaving(true);
    try {
      setSuccess((await save(form, files)) || "");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setSuccess("");
      showToast({ title: "Not saved", message, tone: "bad" });
    } finally {
      setSaving(false);
    }
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
  const partnerNotInSap = form.partner !== "" && isNotInSap(form.partner);
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

          {/* The Expenses page raises Expenses only: no type to show (2026-10-20). */}
          {section === "expenses" ? null : (
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
                  {typesFor(form.company)
                    // Payments: every type but Expense, which has its own page.
                    .filter((type) => section !== "payments" || type.value !== "EXPENSE")
                    .map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          )}

          {/* An Expense is not asked Payment Against (its G/L accounts decide
              direct or indirect): it is asked who is paid (2026-10-20). */}
          {c.expense ? (
            <Field label="Pay To" required>
              {(f) => (
                <Select
                  {...f}
                  value={form.expensePayee}
                  onChange={(e) => change({ expensePayee: e.target.value as ExpensePayee | "" })}
                >
                  <option value="" disabled hidden>
                    Vendor or Imprest
                  </option>
                  {EXPENSE_PAYEES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
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
          )}
        </FormGrid>

        <FormGrid className="md:grid-cols-3">
          <Field
            label={c.partnerLabel}
            required
            error={partnerError}
            hint={
              partnerError || c.expense
                ? undefined
                : multi
                  ? "Choose one or more — one request is raised for each employee, with their own entries."
                  : c.livePartners && form.company && form.partner && !partnerNotInSap
                  ? (
                      <span className="inline-flex items-center gap-1">
                        Ledger in SAP:{" "}
                        <SapPartnerLink
                          company={form.company as AdvancePaymentCompany}
                          cardCode={form.partner}
                          name={form.partnerName || form.partner}
                        />
                      </span>
                    )
                  : partnerHint
            }
          >
            {(f) =>
              multi ? (
                <MultiSelect<string>
                  id={f.id}
                  value={partnerCodes(form)}
                  onChange={(codes) => {
                    const known = new Map([
                      ...shownPartners.map((p) => [p.value, p.label] as const),
                      [form.partner, form.partnerName] as const,
                      ...form.morePartners.map((p) => [p.code, p.name] as const),
                    ]);
                    const [first = "", ...rest] = codes;
                    change({
                      partner: first,
                      partnerName: known.get(first) ?? "",
                      morePartners: rest.map((code) => ({ code, name: known.get(code) ?? code })),
                    });
                  }}
                  disabled={!c.decided || (c.livePartners && !form.company)}
                  placeholder={`Select ${c.partnerLabel}s`}
                  searchable
                  selectAll={false}
                  namedUpTo={3}
                  multiline
                  searchPlaceholder="Search name or code…"
                  emptyText={c.livePartners ? "No match in SAP" : "No matches"}
                  onSearch={c.livePartners ? setPartnerQuery : undefined}
                  options={[
                    ...form.morePartners
                      .filter((p) => !shownPartners.some((sp) => sp.value === p.code))
                      .map((p) => ({ value: p.code, label: p.name, hint: p.code })),
                    ...shownPartners.map((partner) => ({
                      value: partner.value,
                      label: partner.notInSap ? `${partner.label} (Not in SAP)` : partner.label,
                      hint: partner.code,
                    })),
                  ]}
                />
              ) : (
              <SearchSelect<string>
                id={f.id}
                value={form.partner}
                onChange={(next) => {
                  const partnerName = shownPartners.find((p) => p.value === next)?.label ?? "";
                  const patch: Partial<RequestForm> = { partner: next, partnerName };
                  // An Account Payment's purpose follows from its account: suggested,
                  // unless the requester already chose another than the last suggestion.
                  const suggested = suggestedAccountPurpose(form.partner, form.partnerName);
                  if (form.type === "ACCOUNT" && (!form.purpose || form.purpose === suggested)) {
                    const purpose = suggestedAccountPurpose(next, partnerName);
                    Object.assign(patch, {
                      purpose,
                      purposeLabel: purposeOptions.find((o) => o.value === purpose)?.label ?? "",
                      purposeNeedsHead: purposeNeedsHead(purpose),
                      purposeDueDate: purposeDueDate(purpose),
                    });
                  }
                  change(patch);
                }}
                disabled={!c.decided || (c.livePartners && !form.company) || (c.expense && !form.expensePayee)}
                placeholder={c.expense && !form.expensePayee ? "Choose Pay To first" : `Select ${c.partnerLabel}`}
                searchPlaceholder="Search name or code…"
                // A vendor's full name, wrapped — never cut off on a narrow screen.
                multiline
                emptyText={c.livePartners ? "No match in SAP" : "No matches"}
                onQueryChange={c.livePartners ? setPartnerQuery : undefined}
                loading={c.livePartners && partnersQuery.isFetching}
                options={shownPartners.map((partner) => ({
                  value: partner.value,
                  label: partner.notInSap ? `${partner.label} (Not in SAP)` : partner.label,
                  // For sample documents, the count says what the next
                  // dropdown will hold before the requester commits.
                  hint:
                    c.reference && !c.liveDocuments
                      ? `${partner.code} · ${documentsFor(c.reference, partner.value).length} open`
                      : partner.code,
                }))}
              />
              )
            }
          </Field>
          {partnerNotInSap ? (
            <Notice
              tone="hold"
              title="Not in SAP"
              className="md:col-span-3"
              data-slot="partner-not-in-sap"
            >
              {form.partnerName || "This employee"} has no employee advance account in SAP. Create
              their employee master in SAP (an advance account under 1113000 EMPLOYEES ADVANCES)
              before this advance can be paid.
            </Notice>
          ) : null}

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
              adjusted against the PO(s). Optional. */}
          {c.expectedDate ? (
            <Field label="Expected Bill Date" hint="Optional.">
              {(f) => (
                <Input
                  {...f}
                  type="date"
                  min={today}
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
                  min={today}
                  value={form.expectedBillDate}
                  onChange={(e) => change({ expectedBillDate: e.target.value })}
                />
              )}
            </Field>
          ) : null}

          {/* An Expense to a vendor: the bill it pays, and how SAP books it. */}
          {vendorExpense(form) ? (
            <VendorExpenseBill company={company} form={form} onChange={change} today={today} />
          ) : null}
        </FormGrid>
      </FormSection>

      {/* ── Expense: Month, Electricity, the lines ─────────────────── */}
      {c.expense ? <ExpenseDetails company={company} form={form} onChange={change} /> : null}

      {/* ── Repayment & Settlement (Employee Advance + Advance) ──── */}
      {c.repayment ? (
        <RepaymentDetails
          amount={form.amount}
          returnMethod={form.returnMethod}
          returnMethodOther={form.returnMethodOther}
          installments={form.installments}
          emiAmount={form.emiAmount}
          expectedFromDate={form.expectedFromDate}
          expectedToDate={form.expectedToDate}
          today={today}
          onReturnMethodChange={(returnMethod, returnMethodOther) =>
            change({ returnMethod, returnMethodOther })
          }
          onInstallmentsChange={(installments) => change({ installments })}
          onEmiAmountChange={(emiAmount) => change({ emiAmount })}
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
          company={form.company}
          onSearch={searchable ? setDocSearch : undefined}
        />
      ) : null}

      {/* Against PO: what the vendor's ledger says we already paid on account,
          which no PO's open amount reflects (shown, never deducted). */}
      {c.reference === "VENDOR_PO" && form.partner ? (
        <VendorOnAccount
          company={form.company}
          cardCode={form.partner}
          poEntries={form.selected.map(docEntryOf)}
        />
      ) : null}

      {/* ── Additional Information ────────────────────────────────── */}
      <FormSection title="Additional Information">
        <FormGrid className="md:grid-cols-3">
          {/* The Department is SAP's budget head, and it decides the approval
              route: the workflow queries match on its code. */}
          <Field
            label="Department"
            required
            hint={departmentHint}
            error={budgetsQuery.isError ? advancePaymentError(budgetsQuery.error) : undefined}
          >
            {(f) => (
              <SearchSelect<string>
                id={f.id}
                value={form.budget}
                onChange={(next) =>
                  change({
                    budget: next,
                    budgetName: departmentOptions.find((o) => o.value === next)?.label ?? "",
                  })
                }
                disabled={!company}
                placeholder="Select department"
                searchPlaceholder="Search department…"
                emptyText="No department matches"
                loading={budgetsQuery.isFetching}
                options={departmentOptions}
              />
            )}
          </Field>

          {/* An Expense has no purpose (its budget head routes it); the Accounts desk sets its Sub Budget. */}
          {c.expense ? null : (
            /* What the money is for: the Payment Desk's purpose list. */
            <Field
              label="Payment Purpose"
              required
              error={purposesQuery.isError ? advancePaymentError(purposesQuery.error) : undefined}
            >
              {(f) => (
                <SearchSelect<string>
                  id={f.id}
                  value={form.purpose}
                  onChange={(next) =>
                    change({
                      purpose: next,
                      purposeLabel: purposeOptions.find((o) => o.value === next)?.label ?? "",
                      purposeNeedsHead: purposeNeedsHead(next),
                      purposeDueDate: purposeDueDate(next),
                    })
                  }
                  placeholder="Select payment purpose"
                  searchPlaceholder="Search payment purpose…"
                  emptyText="No payment purpose matches"
                  loading={purposesQuery.isFetching}
                  options={purposeOptions}
                />
              )}
            </Field>
          )}

          {/* Utilities and insurance: the date on the bill or policy decides the route. */}
          {needsBillDueDate(form) ? (
            <Field
              label="Bill Due Date"
              required
              hint={
                form.billDueDate && dueSoon(form.billDueDate, today)
                  ? `Due in ${DUE_SOON_DAYS} days or less, or overdue: no Department Head or Director — it goes straight to the Payment desk, paid today.`
                  : `The due date printed on the bill, or the policy's renewal date. More than ${DUE_SOON_DAYS} days away: your Department Head, then the Director. Attach the bill or policy below.`
              }
            >
              {(f) => (
                <Input
                  {...f}
                  type="date"
                  value={form.billDueDate}
                  onChange={(e) => change({ billDueDate: e.target.value })}
                />
              )}
            </Field>
          ) : null}

          {/* Approved "by department": the requester names the HOD who
              approves it, from the employee master. The route's Department
              Head stage goes to that HOD's OMS login. */}
          {askHead ? (
            <Field
              label="Department Head"
              required
              hint={headsQuery.isError || headLoginError ? undefined : "The HOD who approves this request."}
              error={headsQuery.isError ? advancePaymentError(headsQuery.error) : headLoginError}
            >
              {(f) => (
                <SearchSelect<string>
                  id={f.id}
                  value={form.departmentHead}
                  onChange={(next) => {
                    const chosen = headChoices.find((h) => h.employee_code === next);
                    change({
                      departmentHead: next,
                      departmentHeadName: chosen?.employee_name ?? "",
                      departmentHeadLogin: chosen?.user?.username ?? "",
                    });
                  }}
                  onQueryChange={setHeadSearch}
                  placeholder="Select department head"
                  searchPlaceholder="Search HOD name or code…"
                  emptyText="No HOD matches"
                  loading={headsQuery.isFetching}
                  options={headOptions}
                />
              )}
            </Field>
          ) : null}

          {/* Not asked on an Expense: dated the day it is raised. */}
          {c.expense ? null : (
            <>
              {/* Who owns this request: a HOD or Sub-HOD from the employee master. */}
              <Field
                label="Ownership"
                required
                error={ownersQuery.isError ? advancePaymentError(ownersQuery.error) : undefined}
                hint={ownersQuery.isError ? undefined : "HODs and Sub-HODs from the employee master."}
              >
                {(f) => (
                  <SearchSelect<string>
                    id={f.id}
                    value={form.ownership}
                    onChange={(next) => change({ ownership: next })}
                    placeholder="Select owner"
                    searchPlaceholder="Search name or code…"
                    emptyText="No HOD or Sub-HOD matches"
                    loading={ownersQuery.isFetching}
                    options={ownerOptions}
                  />
                )}
              </Field>

              {/* Not asked for a vendor On Account or a bill due soon: the day it is raised. */}
              {paymentDateIsToday(form, today) ? null : (
                <Field
                  label="Payment Date"
                  required
                  error={pastDateError("Payment Date", form.paymentDate, today) ?? undefined}
                >
                  {(f) => (
                    <Input
                      {...f}
                      type="date"
                      // No past dates: the picker offers none, and `validate` refuses
                      // a typed one.
                      min={today}
                      value={form.paymentDate}
                      onChange={(e) => change({ paymentDate: e.target.value })}
                    />
                  )}
                </Field>
              )}
            </>
          )}
        </FormGrid>

        <Field label="Remarks" required={!c.expense}>
          {(f) => (
            <Textarea
              {...f}
              rows={c.expense ? 2 : 4}
              placeholder={c.expense ? "Optional" : "Enter remarks"}
              value={form.remarks}
              onChange={(e) => change({ remarks: e.target.value })}
            />
          )}
        </Field>
      </FormSection>

      {/* ── Attachments ─────────────────────────────────────────────── */}
      <FormSection
        title="Attachments"
        description={
          vendorExpense(form)
            ? "Required: the vendor's bill this expense pays."
            : needsBillDueDate(form)
              ? "Required: the bill or the insurance policy that shows the Bill Due Date."
              : undefined
        }
      >
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
            "rounded-card border border-dashed px-4 transition-colors",
            c.expense ? "py-3" : "py-6",
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

      <FactoryLimitStrip {...factoryLimit} amount={requestAmount} />

      <FormActions>
        <Button variant="secondary" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
        {secondarySubmit ? (
          <Button
            variant="secondary"
            onClick={() => void submit(secondarySubmit.onSubmit)}
            disabled={saving}
          >
            {secondarySubmit.label}
          </Button>
        ) : null}
        <Button variant="primary" onClick={() => void submit()} disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
      </FormActions>
    </div>
  );
}
