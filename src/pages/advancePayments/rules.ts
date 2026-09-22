/**
 * Advance Payments — the business rules the form follows. PURE, NO REACT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A MODULE OF ITS OWN
 * ─────────────────────────────────────────────────────────────────────────
 * The form is a cascade — Type → Payment Against → Business Partner →
 * documents → one payment line per document → total —
 * and every step decides what the next may show. Spread through JSX that is a
 * dozen `&&` conditions that drift apart; here it is one table (`CASE_RULES`)
 * and a few functions:
 *
 *   * `resolveCase`       — what the current answers make visible;
 *   * `applyChange`       — a change, plus everything it invalidates below it;
 *   * `changeAllocation`  — an edit to ONE document's payment line;
 *   * `allocationRows` / `validate` — the numbers, and what blocks submit.
 *
 * It is also the part the backend will have to agree with, so it is written
 * to be read as a specification, and `rules.test.ts` pins every case.
 *
 * THE ONE INVARIANT: state never holds a value that is not on screen. A hidden
 * field with a value in it is one the requester cannot see or correct, and it
 * would be submitted all the same. `sanitize` enforces it after every change,
 * so the explicit clears in `applyChange` are the stated behaviour and
 * `sanitize` is the net under them.
 */
import {
  EMPLOYEES,
  PAYMENT_AGAINST_OPTIONS,
  VENDOR_BILLS,
  VENDOR_OTHER_DOCUMENTS,
  VENDOR_POS,
  VENDORS,
  type Company,
  type OpenDocument,
  type Partner,
  type PartnerType,
  type PaymentAgainst,
  type PaymentMode,
  type Priority,
  type ReturnMethod,
} from "./constants";

/* ── Form state ──────────────────────────────────────────────────────────── */

/** How much of ONE document is being paid: a fixed rupee figure or a %. */
export interface Allocation {
  mode: PaymentMode;
  amount: string;
  percentage: string;
}

export const EMPTY_ALLOCATION: Allocation = { mode: "FIXED", amount: "", percentage: "" };

export interface RequestForm {
  company: Company | "";
  type: PartnerType | "";
  paymentAgainst: PaymentAgainst | "";
  /**
   * What the requester TYPED when none of the listed answers fit. Held only
   * while the answer above it is the "other" one (`OTHER` / `CUSTOM`) — the
   * rules still branch on that value, so a typed answer behaves exactly like
   * choosing "Other" did, and the text says what the other thing is.
   */
  paymentAgainstOther: string;
  partner: string;
  /**
   * The chosen documents (`OpenDocument.id`) — several bills or several POs.
   * One request can settle part of three bills; they are still one payment
   * to one partner, decided once.
   */
  references: string[];
  /**
   * One payment line per chosen document, keyed by its id. Each line has its
   * own mode, because "clear this bill, pay a quarter of that one" is the
   * normal shape of a part settlement.
   */
  allocations: Record<string, Allocation>;
  /** The typed amount of a case with no document to calculate it from. */
  amount: string;
  /** Vendor → Against PO only. */
  expectedDate: string;
  /* Employee Advance + Advance only: how and when it comes back. */
  returnMethod: ReturnMethod | "";
  returnMethodOther: string;
  /** EMI only. */
  installments: string;
  expectedFromDate: string;
  expectedToDate: string;
  /** Employee Imprest only. */
  expectedBillDate: string;
  /** Who owns this request. Free text — there is no master list to pick from. */
  ownership: string;
  paymentDate: string;
  priority: Priority;
  remarks: string;
}

export const EMPTY_FORM: RequestForm = {
  company: "",
  type: "",
  paymentAgainst: "",
  paymentAgainstOther: "",
  partner: "",
  references: [],
  allocations: {},
  amount: "",
  expectedDate: "",
  returnMethod: "",
  returnMethodOther: "",
  installments: "",
  expectedFromDate: "",
  expectedToDate: "",
  expectedBillDate: "",
  ownership: "",
  paymentDate: "",
  // Medium rather than nothing: a priority is always one of three, and an
  // unset radio group with no safe middle makes every requester choose High.
  priority: "MEDIUM",
  remarks: "",
};

/* ── The documents a payment can be made against ─────────────────────────── */

export type ReferenceKind = "VENDOR_BILL" | "VENDOR_PO" | "VENDOR_OTHER";

interface ReferenceKindDef {
  /** One of them — "Bill". The heading form. */
  label: string;
  /** The same word mid-sentence — "bill", but "PO", never "po". */
  noun: string;
  /** The field's label — "Bills". */
  pluralLabel: string;
  placeholder: string;
  /** Column heading for the document number. */
  numberLabel: string;
  dateLabel: string;
  originalLabel: string;
  paidLabel: string;
  /** A sentence under the section title, when the list needs explaining. */
  intro?: string;
  documents: OpenDocument[];
}

/**
 * The three document kinds, and the words each is described in.
 *
 * They share a shape and a calculation; only the vocabulary differs. The
 * three lists never overlap — a bill is only ever under Against Bill, a PO
 * only under Against PO, and "All" holds everything else — so no document
 * can be paid from two places in one request.
 */
export const REFERENCE_KINDS: Record<ReferenceKind, ReferenceKindDef> = {
  VENDOR_BILL: {
    label: "Bill",
    noun: "bill",
    pluralLabel: "Bills",
    placeholder: "Select Bills",
    numberLabel: "Bill Number",
    dateLabel: "Bill Date",
    originalLabel: "Original Amount",
    paidLabel: "Paid Amount",
    documents: VENDOR_BILLS,
  },
  VENDOR_PO: {
    label: "PO",
    noun: "PO",
    pluralLabel: "Purchase Orders",
    placeholder: "Select Open POs",
    numberLabel: "PO Number",
    dateLabel: "PO Date",
    originalLabel: "PO Amount",
    paidLabel: "Already Paid / Advanced",
    documents: VENDOR_POS,
  },
  VENDOR_OTHER: {
    label: "Document",
    noun: "document",
    pluralLabel: "Documents",
    placeholder: "Select Documents",
    numberLabel: "Document Number",
    dateLabel: "Document Date",
    originalLabel: "Original Amount",
    paidLabel: "Paid Amount",
    intro:
      "Every other open document for this vendor — goods receipts, work orders, " +
      "journal vouchers and contracts. Bills and POs have their own options.",
    documents: VENDOR_OTHER_DOCUMENTS,
  },
};

/* ── The case table ──────────────────────────────────────────────────────── */

interface CaseRule {
  /** Documents must be picked, and the payment is calculated from them. */
  reference?: ReferenceKind;
  /** Ask when the payment is expected to be adjusted against the documents. */
  expectedDate?: boolean;
  /** Ask how the money comes back (One Time / EMI / Other), and over what period. */
  repayment?: boolean;
  /** Ask when the bill is expected. */
  expectedBillDate?: boolean;
}

/**
 * EVERY SUPPORTED (Type, Payment Against) PAIR, AND WHAT IT ASKS.
 *
 * A pair missing from a type's row is not offered for that type. A pair with
 * `{}` is offered and asks for a plain amount, nothing more.
 *
 * EMPLOYEE IMPREST asks for the expected bill date in every pair: the date
 * belongs to the imprest itself, not to what it is against, which is also why
 * it survives a Payment Against change within Imprest and is cleared only on
 * leaving the type. Its other rules are still open — when they are settled
 * they go in this row and nowhere else: `resolveCase`, the clearing and the
 * validation all read the table, so the form follows.
 */
export const CASE_RULES: Record<PartnerType, Partial<Record<PaymentAgainst, CaseRule>>> = {
  // Against PO was Advance → Advance Against → PO; it is an answer of its own
  // now, and a vendor Advance is a plain amount like any other advance.
  VENDOR: {
    ADVANCE: {},
    AGAINST_BILL: { reference: "VENDOR_BILL" },
    AGAINST_PO: { reference: "VENDOR_PO", expectedDate: true },
    ALL: { reference: "VENDOR_OTHER" },
    OTHER: {},
  },
  // No Against Bill: an employee advance is paid ahead of expenses, and the
  // bills that follow are settled against the advance, not paid here.
  EMPLOYEE_ADVANCE: {
    ADVANCE: { repayment: true },
    OTHER: {},
  },
  EMPLOYEE_IMPREST: {
    ADVANCE: { expectedBillDate: true },
    AGAINST_BILL: { expectedBillDate: true },
    OTHER: { expectedBillDate: true },
  },
};

/* ── What the current answers make visible ───────────────────────────────── */

export interface ResolvedCase {
  paymentAgainstOptions: ReadonlyArray<{ value: PaymentAgainst; label: string }>;
  /** The document kind this case is paid against, once it is known. */
  reference: ReferenceKind | null;
  /** Vendor → Against PO: when the payment is expected to be adjusted. */
  expectedDate: boolean;
  /** Return Method and the Expected From / To period. */
  repayment: boolean;
  /** Installment count and EMI — repayment with EMI chosen. */
  installments: boolean;
  expectedBillDate: boolean;
  /** "Business Partner" for a vendor, "Employee" for either employee type. */
  partnerLabel: string;
  /** The partners this case may pick — already narrowed to those with documents. */
  partners: Partner[];
  /** The chosen partner's open documents of the case's kind. */
  documents: OpenDocument[];
  /** The chosen ones, in the partner's document order. */
  selectedDocuments: OpenDocument[];
  /** Every question above the partner is answered, so the partner can be picked. */
  decided: boolean;
  /** A decided case with no document: the requester types the amount. */
  plainAmount: boolean;
}

function basePartners(type: PartnerType | ""): Partner[] {
  if (type === "VENDOR") return VENDORS;
  if (type === "EMPLOYEE_ADVANCE" || type === "EMPLOYEE_IMPREST") return EMPLOYEES;
  return [];
}

/** The documents of `kind` belonging to `partner`. */
export function documentsFor(kind: ReferenceKind, partner: string): OpenDocument[] {
  return REFERENCE_KINDS[kind].documents.filter((doc) => doc.partner === partner);
}

export function resolveCase(form: RequestForm): ResolvedCase {
  const row = form.type ? CASE_RULES[form.type] : undefined;
  const paymentAgainstOptions = row
    ? PAYMENT_AGAINST_OPTIONS.filter((option) => option.value in row)
    : [];
  const rule = row && form.paymentAgainst ? row[form.paymentAgainst] : undefined;

  const reference: ReferenceKind | null = rule?.reference ?? null;
  const decided = Boolean(rule);

  // Only partners that HAVE a document of this kind. Offering a vendor with no
  // open bill under "Against Bill" is offering a dead end: the next dropdown
  // would be empty and the requester would have to back out and guess again.
  const base = basePartners(form.type);
  const partners = reference
    ? base.filter((partner) => documentsFor(reference, partner.value).length > 0)
    : base;

  const documents = reference && form.partner ? documentsFor(reference, form.partner) : [];
  const selectedDocuments = documents.filter((doc) => form.references.includes(doc.id));

  return {
    paymentAgainstOptions,
    reference,
    expectedDate: Boolean(rule?.expectedDate),
    repayment: Boolean(rule?.repayment),
    installments: Boolean(rule?.repayment) && form.returnMethod === "EMI",
    expectedBillDate: Boolean(rule?.expectedBillDate),
    partnerLabel: form.type === "VENDOR" || form.type === "" ? "Business Partner" : "Employee",
    partners,
    documents,
    selectedDocuments,
    decided,
    plainAmount: decided && reference === null,
  };
}

/* ── Changing an answer, and what it invalidates ─────────────────────────── */

const CLEARED_DOCUMENTS = { references: [] as string[], allocations: {} } as const;
const CLEARED_REPAYMENT = {
  returnMethod: "",
  returnMethodOther: "",
  installments: "",
  expectedFromDate: "",
  expectedToDate: "",
} as const;

/** Only the input the line's mode shows may hold a value. */
function tidyAllocation(allocation: Allocation): Allocation {
  return allocation.mode === "FIXED"
    ? { ...allocation, percentage: "" }
    : { ...allocation, amount: "" };
}

/**
 * Drop every value the current answers do not show.
 *
 * Top-down, re-resolving as it goes, because each clear can change what the
 * next level offers — clearing the partner empties the document list, which
 * empties the payment lines.
 */
export function sanitize(form: RequestForm): RequestForm {
  const next = { ...form };

  let c = resolveCase(next);
  if (!c.paymentAgainstOptions.some((option) => option.value === next.paymentAgainst)) {
    next.paymentAgainst = "";
  }
  c = resolveCase(next);
  if (!c.decided || !c.partners.some((partner) => partner.value === next.partner)) {
    next.partner = "";
  }

  c = resolveCase(next);
  // Keep only documents this partner actually has, and exactly one payment
  // line per kept document: an existing line survives (so ticking a second
  // bill does not wipe what was typed against the first), a new one starts
  // empty, and a line for a document no longer chosen is dropped.
  next.references = c.selectedDocuments.map((doc) => doc.id);
  next.allocations = Object.fromEntries(
    next.references.map((id) => [id, tidyAllocation(next.allocations[id] ?? EMPTY_ALLOCATION)]),
  );

  if (!c.plainAmount) next.amount = "";
  if (!c.expectedDate) next.expectedDate = "";
  if (!c.repayment) {
    next.returnMethod = "";
    next.expectedFromDate = "";
    next.expectedToDate = "";
  }
  if (!c.expectedBillDate) next.expectedBillDate = "";

  c = resolveCase(next);
  if (!c.installments) next.installments = "";

  // Typed answers live only as long as the "other" choice they describe.
  if (next.paymentAgainst !== "OTHER") next.paymentAgainstOther = "";
  if (next.returnMethod !== "CUSTOM") next.returnMethodOther = "";

  return next;
}

/**
 * Apply a change, then clear what it made stale.
 *
 * The explicit clears are the stated behaviour of each step — a new Type
 * starts the cascade again from the top; a new partner means the documents
 * were someone else's. `sanitize` then removes anything the new answers no
 * longer show, which is what keeps e.g. a vendor that still qualifies selected
 * across a Payment Against change, and drops one that does not.
 */
export function applyChange(form: RequestForm, patch: Partial<RequestForm>): RequestForm {
  const changed = (key: keyof RequestForm) => key in patch && patch[key] !== form[key];
  let next: RequestForm = { ...form, ...patch };

  if (changed("type")) {
    next = {
      ...next,
      paymentAgainst: "",
      partner: "",
      ...CLEARED_DOCUMENTS,
      amount: "",
      expectedDate: "",
      ...CLEARED_REPAYMENT,
      expectedBillDate: "",
    };
  }
  if (changed("paymentAgainst")) {
    // NOT the expected bill date: under Imprest it belongs to the type, so a
    // Payment Against change within Imprest keeps it, and `sanitize` removes
    // it anywhere it no longer applies.
    next = {
      ...next,
      ...CLEARED_DOCUMENTS,
      amount: "",
      expectedDate: "",
      ...CLEARED_REPAYMENT,
    };
  }
  if (changed("returnMethod")) {
    next = { ...next, installments: "" };
  }
  // Documents belong to their partner. For a plain-amount case the partner
  // has no documents, so the typed amount stands.
  if (changed("partner") && resolveCase(next).reference) {
    next = { ...next, ...CLEARED_DOCUMENTS };
  }

  return sanitize(next);
}

/**
 * Edit ONE document's payment line.
 *
 * A mode change starts the line afresh — a rupee figure is not a percentage —
 * but applies the rest of the same patch, so a quick "50%" that also switches
 * the line to Percentage lands as 50% rather than being wiped by its own
 * mode switch.
 */
export function changeAllocation(
  form: RequestForm,
  id: string,
  patch: Partial<Allocation>,
): RequestForm {
  const current = form.allocations[id];
  if (!current) return form;
  const next =
    patch.mode !== undefined && patch.mode !== current.mode
      ? { ...EMPTY_ALLOCATION, ...patch }
      : { ...current, ...patch };
  return sanitize({ ...form, allocations: { ...form.allocations, [id]: next } });
}

/* ── The numbers ─────────────────────────────────────────────────────────── */

/** Rounded to the paisa, so 33.33% of an odd balance is a payable figure. */
function toPaise(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

export interface Calculation {
  /** The payment this would make, or null while nothing valid is entered. */
  payment: number | null;
  /** What is wrong with the entry, if anything. Shown under the input. */
  error: string | null;
}

/**
 * The payment against a document.
 *
 * ALWAYS FROM THE OPEN AMOUNT. A bill of ₹2,50,000 with ₹1,00,000 already paid
 * has ₹1,50,000 left, and "pay 50%" means half of what is left — ₹75,000 —
 * not half the invoice, which would ask for ₹1,25,000 against a balance that
 * cannot take it. The original amount is shown for context and used for
 * nothing.
 */
export function calculatePayment(
  document: OpenDocument,
  mode: PaymentMode,
  amount: string,
  percentage: string,
): Calculation {
  if (mode === "FIXED") {
    const value = parseNumber(amount);
    if (value === null) return { payment: null, error: null };
    if (Number.isNaN(value) || value <= 0) {
      return { payment: null, error: "Enter an amount above zero." };
    }
    if (value > document.open) {
      return {
        payment: null,
        error: `Cannot exceed the open amount of ${formatINR(document.open)}.`,
      };
    }
    return { payment: toPaise(value), error: null };
  }

  const percent = parseNumber(percentage);
  if (percent === null) return { payment: null, error: null };
  if (Number.isNaN(percent) || percent <= 0 || percent > 100) {
    return { payment: null, error: "Enter a percentage above 0 and up to 100." };
  }
  return { payment: toPaise((document.open * percent) / 100), error: null };
}

export interface AllocationRow {
  document: OpenDocument;
  allocation: Allocation;
  calc: Calculation;
}

/** One line per chosen document, with what it comes to. */
export function allocationRows(form: RequestForm): AllocationRow[] {
  return resolveCase(form).selectedDocuments.map((document) => {
    const allocation = form.allocations[document.id] ?? EMPTY_ALLOCATION;
    return {
      document,
      allocation,
      calc: calculatePayment(document, allocation.mode, allocation.amount, allocation.percentage),
    };
  });
}

export interface AllocationTotals {
  /** Sum of the chosen documents' open amounts. */
  open: number;
  /** Sum of every line that has a valid payment — the request's Payment Amount. */
  payment: number;
  /** Every line has a valid payment, so `payment` is the whole request. */
  complete: boolean;
}

/**
 * The total is summed in PAISE, as integers, and converted back once — adding
 * rupee floats line by line is how ₹0.1 + ₹0.2 becomes ₹0.30000000000000004.
 */
export function allocationTotals(rows: AllocationRow[]): AllocationTotals {
  const paise = (value: number) => Math.round(value * 100);
  return {
    open: rows.reduce((sum, row) => sum + paise(row.document.open), 0) / 100,
    payment: rows.reduce((sum, row) => sum + paise(row.calc.payment ?? 0), 0) / 100,
    complete: rows.length > 0 && rows.every((row) => row.calc.payment !== null),
  };
}

/** A plain amount, for a case with no document to measure it against. */
export function plainAmountError(amount: string): string | null {
  const value = parseNumber(amount);
  if (value === null) return null;
  if (Number.isNaN(value) || value <= 0) return "Enter an amount above zero.";
  return null;
}

/* ── Repayment ───────────────────────────────────────────────────────────── */

export interface Emi {
  /** Per-installment amount, or null until amount and count are both valid. */
  emi: number | null;
  /** What is wrong with the installment count, if anything. */
  error: string | null;
  /** The division left a remainder, so the EMI shown is rounded. */
  rounded: boolean;
}

/**
 * EMI = Amount ÷ Number of Installments, and nothing more.
 *
 * Deliberately no interest, no schedule, no first-due date: the repayment
 * rules are not decided, and inventing them here would put numbers on screen
 * that nobody has agreed to. Rounded to the paisa, and says so when it had
 * to — ₹20,000 over 3 is not a round figure, and a requester should see that.
 */
export function calculateEmi(amount: string, installments: string): Emi {
  const count = parseNumber(installments);
  if (count === null) return { emi: null, error: null, rounded: false };
  if (Number.isNaN(count) || !Number.isInteger(count) || count < 1) {
    return { emi: null, error: "Enter a whole number of installments.", rounded: false };
  }
  const total = parseNumber(amount);
  if (total === null || Number.isNaN(total) || total <= 0) {
    return { emi: null, error: null, rounded: false };
  }
  const emi = toPaise(total / count);
  return { emi, error: null, rounded: toPaise(emi * count) !== toPaise(total) };
}

/**
 * Expected To must not be before Expected From. The same day is allowed — an
 * advance used and settled within one day is a real, if short, period.
 *
 * ISO `yyyy-mm-dd` strings compare correctly as text, so no Date parsing.
 */
export function expectedPeriodError(from: string, to: string): string | null {
  if (!from || !to) return null;
  return to < from ? "Expected To Date cannot be before Expected From Date." : null;
}

/* ── What blocks submit ──────────────────────────────────────────────────── */

export interface Validation {
  /** Visible fields still empty, by label. */
  missing: string[];
  /** Entries present but wrong. */
  problems: string[];
}

/**
 * Required means required WHILE VISIBLE. A field the case does not show is
 * never listed as missing — it cannot be filled, and `sanitize` guarantees
 * it is empty anyway.
 */
export function validate(form: RequestForm): Validation {
  const c = resolveCase(form);
  const missing: string[] = [];
  const problems: string[] = [];

  if (!form.company) missing.push("Company");
  if (!form.type) missing.push("Type");
  if (form.type && !form.paymentAgainst) missing.push("Payment Against");
  else if (form.paymentAgainst === "OTHER" && !form.paymentAgainstOther.trim()) {
    missing.push("Payment Against (what it is)");
  }
  if (c.decided && !form.partner) missing.push(c.partnerLabel);
  if (c.expectedDate && !form.expectedDate) missing.push("Expected Date");

  if (c.reference) {
    if (form.partner && form.references.length === 0) {
      missing.push(REFERENCE_KINDS[c.reference].pluralLabel);
    }
    // Every line must carry a payment. Named by document, because "Payment
    // Amount" alone does not say which of four bills is the one left blank.
    for (const row of allocationRows(form)) {
      if (row.calc.error) problems.push(`${row.document.number}: ${row.calc.error}`);
      else if (row.calc.payment === null) missing.push(`Payment for ${row.document.number}`);
    }
  }
  if (c.plainAmount) {
    const error = plainAmountError(form.amount);
    if (error) problems.push(error);
    else if (!form.amount) missing.push("Amount");
  }

  if (c.repayment) {
    if (!form.returnMethod) missing.push("Return Method");
    else if (form.returnMethod === "CUSTOM" && !form.returnMethodOther.trim()) {
      missing.push("Return Method (what it is)");
    }
    if (c.installments) {
      const emi = calculateEmi(form.amount, form.installments);
      if (emi.error) problems.push(emi.error);
      else if (!form.installments) missing.push("Number of Installments");
    }
    if (!form.expectedFromDate) missing.push("Expected From Date");
    if (!form.expectedToDate) missing.push("Expected To Date");
    const period = expectedPeriodError(form.expectedFromDate, form.expectedToDate);
    if (period) problems.push(period);
  }
  if (c.expectedBillDate && !form.expectedBillDate) missing.push("Expected Bill Date");
  if (!form.ownership.trim()) missing.push("Ownership");
  if (!form.paymentDate) missing.push("Payment Date");
  if (!form.remarks.trim()) missing.push("Remarks");

  return { missing, problems };
}

/* ── Formatting ──────────────────────────────────────────────────────────── */

const INR_WHOLE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const INR_PAISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * ₹1,50,000 — Indian grouping, as the app's Excel exports use. Paise are
 * shown only when there are some, so a round figure stays round and a
 * calculated ₹12,345.67 is not silently rounded to the rupee.
 */
export function formatINR(value: number): string {
  return Number.isInteger(value) ? INR_WHOLE.format(value) : INR_PAISE.format(value);
}

/** 04 Aug 2026. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
