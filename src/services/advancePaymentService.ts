/**
 * advancePaymentService — the SAP lookups behind the Advance Payment form.
 *
 * Mirrors `OMS-Backend/advance_payment/` (views.py + services/sap.py): five
 * read-only GETs, each reading the company's HANA schema live. Wrapped here:
 * vendors, employees, and the three document lists a vendor is paid against —
 * open bills (Against Bill), open POs (Against PO) and every other open
 * document (All). Customers exist on the server too; the form has no customer
 * type.
 *
 * Every call takes a company, and the server REQUIRES it — the three company
 * databases reuse document numbers, so there is no safe default. Errors keep
 * their meaning: 400 is the request, 403 is the permission, 503 is SAP.
 *
 * Amounts arrive as STRINGS (SAP money is numeric(19,6)); they are converted
 * at the one place they are turned into form data, `advancePayments/sapMapping`.
 */
import api from "./api";

const BASE = "/advance-payments";

/** How many rows a picker asks for. The server caps at 500. */
const PICKER_LIMIT = 100;
/** The server's own cap — for a caller that filters what comes back. */
export const SAP_MAX_ROWS = 500;
const DOCUMENT_LIMIT = 500;

export type AdvancePaymentCompany = "OIL" | "MART" | "BEVERAGES";

/* ------------------------------------------------------------------ *
 * Types — mirror advance_payment/services/sap.py
 * ------------------------------------------------------------------ */

export interface SapVendor {
  card_code: string;
  card_name: string;
  gstin: string;
  currency: string;
  /** SAP's sign convention, passed through. */
  balance: string;
  phone: string;
  email: string;
}

/**
 * An employee, as the server finds them: a postable GL account under
 * `1113000 EMPLOYEES ADVANCES`, with the name and payroll code parsed out of
 * the account name. `acct_code` is what an advance is posted to.
 */
export interface SapEmployee {
  employee_code: string;
  employee_name: string;
  acct_code: string;
  acct_name: string;
  /** Outstanding advance on the account. */
  balance: string;
}

/**
 * A document's LATEST SAP attachment (its last ATC1 line), as the open PO and
 * open invoice lists carry it. `count` is how many the document has in all.
 */
export interface SapAttachment {
  file_name: string;
  count: number;
  date: string;
}

/** A check on a payment proof: matches, shows something else, or cannot tell. */
export type ProofCheck = boolean | null;

/** What `/payment-proof/` found in an uploaded statement or advice. */
export interface PaymentProofResult {
  /** "advice" (one payment) or "statement" (many). */
  kind: "advice" | "statement";
  utr: string | null;
  channel: string | null;
  amount: number | null;
  date: string;
  /** The row the UTR was on, as read. */
  row_text: string;
  score: number;
  checks: {
    amount: ProofCheck;
    account: ProofCheck;
    /** A different SAP account of the same payee, when that is what it shows. */
    account_other: string | null;
    invoice: ProofCheck;
  };
  candidates: Array<{ utr: string; channel: string; amount: number | null; date: string; row_text: string; score: number }>;
  references_found: number;
  file_name: string;
  /** pdf-text | ocr | pdf-text+ocr | excel | csv */
  source: string;
  pages: number;
  ocr_pages: number;
  rows_read: number;
}

export interface PaymentProofQuery {
  company: AdvancePaymentCompany;
  amount: string;
  toAccount: string;
  cardCode: string;
  invoices: string[];
}

/** An employee in OMS's employee master (`/employee-master/`, admins only). */
export interface MasterEmployee {
  id: number;
  /** JSAP's EmployeeId; null for an employee added in OMS. */
  employee_id: number | null;
  employee_code: string;
  employee_name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  /** 1 HOD, 2 Sub-HOD, 3 Executive. */
  role: 1 | 2 | 3;
  role_label: string;
  gender: "M" | "F" | null;
  is_active: boolean;
  created_on: string;
}

export type NewMasterEmployee = Omit<MasterEmployee, "id" | "role_label" | "created_on">;

/** A department, with its sub-departments (OMS's own list, copied from JSAP). */
export interface OmsDepartment {
  id: number;
  name: string;
  sub_departments: Array<{ id: number; name: string }>;
}

/** One active employee from the master, as the request form's pickers read it. */
export interface DirectoryEmployee {
  employee_code: string;
  employee_name: string;
  role: 1 | 2 | 3;
  role_label: string;
  designation: string | null;
}

export interface DirectoryQuery {
  /** Only these roles: 1 HOD, 2 Sub-HOD, 3 Executive. */
  roles?: Array<1 | 2 | 3>;
  search?: string;
  /** Only employees with NO employee-advance account in SAP for this company. */
  notInSapFor?: AdvancePaymentCompany;
}

/** One field read off an attachment: its value, SAP's, and whether they agree. */
export interface ReadField<T = string> {
  value: T | null;
  sap: T | string | null;
  /** true agrees with SAP, false differs, null not found / nothing to compare. */
  match: boolean | null;
}

/** What `/document-attachment/read/` found on a PO's / bill's attachment. */
export interface AttachmentReading {
  file_name: string;
  attachment_count: number;
  /** pdf-text | ocr | pdf-text+ocr | excel | csv */
  source: string;
  pages: number;
  fields: {
    invoice_number: ReadField;
    invoice_date: ReadField;
    amount: ReadField<number>;
    party_name: ReadField;
    account_number: ReadField;
    ifsc: ReadField;
  };
}

/**
 * A document's attachment reading as saved with the request: what
 * `/document-attachment/read/` answered when it was raised, or why it could
 * not be read. Shown to the approvers from Payment on.
 */
export type AttachmentCheck = AttachmentReading | { error: string };

/** The document kinds `/document-attachment/` reads. */
export type SapAttachmentKind = "po" | "bill";

export interface SapOpenInvoice {
  doc_entry: number;
  doc_num: number | null;
  card_code: string;
  card_name: string;
  /** The vendor's own invoice number (`NumAtCard`). */
  party_ref: string;
  doc_date: string;
  due_date: string;
  currency: string;
  doc_total: string;
  paid_to_date: string;
  balance_due: string;
  attachment: SapAttachment | null;
}

/**
 * An open purchase order. All three amounts are tax-inclusive and add up:
 * `doc_total = received_amount + open_amount`.
 *
 * `received_amount` is SAP's `PaidToDate` on a PO, which is the value of goods
 * already RECEIVED — not advances. SAP holds no advances against POs at all
 * (no A/P down payments, no payments applied to a PO), so there is nothing to
 * net off here yet.
 */
export interface SapOpenPurchaseOrder {
  doc_entry: number;
  doc_num: number | null;
  card_code: string;
  card_name: string;
  /** The vendor's own reference for the order (`NumAtCard`). */
  vendor_ref: string;
  doc_date: string;
  due_date: string;
  currency: string;
  doc_total: string;
  tax_amount: string;
  received_amount: string;
  open_amount: string;
  remarks: string;
  attachment: SapAttachment | null;
}

/**
 * One open document from a partner's ledger or receipts — the row shape of
 * `/open-documents/` and `/open-other-documents/`.
 *
 * `direction` is from the ledger: CREDIT is owed TO the vendor (a goods
 * receipt, like the bill it will become); DEBIT is owed BY them (a credit
 * memo, a payment already made on account, a goods return).
 */
export interface SapLedgerDocument {
  trans_id: number | null;
  doc_type_code: number | null;
  /** "Goods Receipt PO", "A/P Credit Memo", "Outgoing Payment", … */
  doc_type: string;
  doc_entry: number | null;
  doc_num: string;
  party_ref: string;
  document_date: string | null;
  posting_date: string | null;
  due_date: string | null;
  direction: "DEBIT" | "CREDIT";
  total_amount: string;
  open_amount: string;
  settled_amount: string;
  currency: string;
  remarks: string;
}

/**
 * One of the payee's bank accounts, as SAP holds it (OCRB, with the default
 * named on the partner). IFSC is SAP's SWIFT field, which is where this
 * installation keeps it. Values arrive cleaned of the spreadsheet apostrophe.
 */
export interface SapPartnerBankAccount {
  id: number | null;
  bank_code: string;
  bank_name: string;
  account_number: string;
  ifsc: string;
  ifsc_valid: boolean;
  branch: string;
  /** The account holder's name — "as per bank records". */
  account_name: string;
  is_default: boolean;
}

/**
 * One of OUR bank accounts, one per bank G/L (current accounts and CC / OD).
 * `key` is the G/L code. `house_bank` says whether SAP also has it set up as
 * a house bank; only then are `bank_code`, `bank_name` and `ifsc` known.
 */
export interface SapHouseBank {
  key: string;
  gl_account: string;
  gl_name: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  branch: string;
  ifsc: string;
  house_bank: boolean;
}

/** One of OUR cash G/L accounts (children of 1105000 CASH IN HAND). */
export interface SapCashAccount {
  acct_code: string;
  acct_name: string;
  balance: string;
}

interface LookupPage<T> {
  company: string;
  count: number;
  results: T[];
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "success" in (payload as object)) {
    return ((payload as { data: T }).data ?? null) as T;
  }
  return payload as T;
}

function results<T>(payload: unknown): T[] {
  return unwrap<LookupPage<T> | null>(payload)?.results ?? [];
}

/**
 * A readable sentence from a lookup failure.
 *
 * The server's message is passed through when there is one — for a 503 it
 * names the company and what could not be read, which is what someone
 * chasing an outage needs.
 */
export function advancePaymentError(err: unknown): string {
  const resp = (err as { response?: { status?: number; data?: unknown } })?.response;
  const status = resp?.status;
  const message = (resp?.data as { message?: string } | undefined)?.message;

  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return message || "You do not have the Advance_Payment permission.";
  if (status === 503) return message || "SAP could not be reached. Try again shortly.";
  if (message) return message;
  if (!resp) return "The server could not be reached.";
  return "Could not load from SAP. Please try again.";
}

/* ------------------------------------------------------------------ *
 * Payment requests — mirror advance_payment/serializers.py `request_data`
 * ------------------------------------------------------------------ */

/** The server's request statuses. */
export type ApiRequestStatus = "IN_APPROVAL" | "RETURNED" | "COMPLETED" | "REJECTED" | "CANCELLED";

/**
 * What a stage does, from its name in the Workflows page: any stage before
 * Payment is an APPROVAL (named freely, as many as the route needs); the
 * last three are Payment, Audit and Final by name.
 */
export type StageRole = "APPROVAL" | "PAYMENT" | "AUDIT" | "FINAL";

export interface ApiUser {
  id: number;
  name: string;
  username: string;
}

export interface ApiRequestDocument {
  id?: number;
  kind: "BILL" | "PO";
  sap_doc_entry: number;
  sap_doc_num: string;
  vendor_ref: string;
  doc_date: string | null;
  due_date: string | null;
  original_amount: string;
  paid_amount: string;
  open_amount: string;
  mode: "FIXED" | "PERCENT";
  percentage: string | null;
  amount: string;
  attachment_file: string;
  attachment_count: number;
  attachment_date: string | null;
  attachment_check?: AttachmentCheck | null;
}

export interface ApiRequestFile {
  id: number;
  name: string;
  size: number;
  purpose: "SUPPORTING" | "BANK_PROOF" | "PAYMENT_PROOF";
  payout_line_id: number | null;
  uploaded_by: ApiUser | null;
  uploaded_on: string | null;
}

export interface ApiPayoutLine {
  id?: number;
  method: "UPI" | "NEFT" | "RTGS" | "IMPS" | "CHEQUE" | "CASH";
  amount: string;
  from_account: string;
  from_account_label?: string;
  cheque_number: string;
  cheque_bank: string;
  cheque_date: string | null;
  cash_notes: Array<{ denomination: number; quantity: number }>;
  utr?: string;
  utr_proof?: Record<string, unknown> | null;
  utr_recorded_by?: ApiUser | null;
  utr_recorded_on?: string | null;
}

export interface ApiPayout {
  beneficiary_name: string;
  to_account_number: string;
  to_ifsc: string;
  to_account_manual: boolean;
  lines: ApiPayoutLine[];
  updated_by?: ApiUser | null;
  updated_on?: string | null;
}

export interface ApiVoucher {
  id: number;
  version: number;
  status: "POSTED" | "FAILED" | "CANCELLED";
  sap_doc_entry: number | null;
  sap_doc_num: number | null;
  error: string;
  posted_by: ApiUser | null;
  posted_on: string | null;
  cancelled_by: ApiUser | null;
  cancelled_on: string | null;
}

export interface ApiRequestLog {
  id: number;
  action: string;
  label: string;
  cycle: number;
  stage_name: string;
  actor: ApiUser | null;
  on_behalf_of: ApiUser | null;
  from_status: string;
  to_status: string;
  remarks: string;
  data: Record<string, unknown> | null;
  created_on: string;
}

export interface ApiStage {
  stage_id: number;
  name: string;
  role: StageRole | "";
  sequence: number;
  /** CURRENT, UPCOMING, or what was done there this round: APPROVED, REJECTED, RETURNED, SENT_BACK. */
  state: string;
  user_id: number | null;
  user_name: string;
  acted_by_id: number | null;
  acted_on: string | null;
}

/** What the caller may do to the request now: the buttons to show. */
export interface RequestAbilities {
  edit: boolean;
  cancel: boolean;
  resubmit: boolean;
  approve: boolean;
  reject: boolean;
  return_to_creator: boolean;
  send_back: boolean;
  edit_payout: boolean;
  record_utr: boolean;
  /**
   * The payee's account — payment details, proofs, their change log, the SAP
   * balance and ledger — is sent to Payment and later stages only.
   */
  see_account: boolean;
}

/** A Payment Purpose choice: SAP's Budget (dimension 3) or Sub Budget (4) cost centre. */
export interface SapBudget {
  kind: "BUDGET" | "SUB_BUDGET";
  code: string;
  name: string;
}

/** A partner's open ledger (`/open-documents/`), with its totals. */
export interface SapPartnerLedger {
  summary: {
    open_count: number;
    open_debit: string;
    open_credit: string;
    net_open: string;
    net_open_means: string;
    overdue_count: number;
  };
  results: Array<SapLedgerDocument & { days_overdue: number | null }>;
}

export interface ApiRequestFields {
  company: AdvancePaymentCompany;
  request_type: "VENDOR" | "EMPLOYEE_ADVANCE" | "EMPLOYEE_IMPREST";
  payment_against: string;
  payment_against_other: string;
  partner_code: string;
  partner_name: string;
  amount: string;
  expected_date: string | null;
  expected_bill_date: string | null;
  return_method: string;
  return_method_other: string;
  installments: number | null;
  emi_amount: string | null;
  expected_from_date: string | null;
  expected_to_date: string | null;
  payment_date: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  remarks: string;
  owner_label: string;
  /** Payment Purpose: SAP's Budget and Sub Budget cost-centre codes. */
  budget_code: string;
  sub_budget_code: string;
}

/** What the form sends to raise or edit a request. */
export interface ApiRequestInput extends ApiRequestFields {
  department_id: number | null;
  sub_department_id: number | null;
  documents: ApiRequestDocument[];
}

export interface ApiRequest extends ApiRequestFields {
  id: number;
  request_no: string;
  department: { id: number; name: string };
  sub_department: { id: number; name: string } | null;
  partner_not_in_sap: boolean;
  currency: string;
  owner_employee_id: number | null;
  budget_name: string;
  sub_budget_name: string;
  status: ApiRequestStatus;
  created_by: ApiUser;
  created_on: string;
  updated_on: string;
  documents: ApiRequestDocument[];
  files: ApiRequestFile[];
  payout: ApiPayout | null;
  flow: {
    status: string;
    workflow: string;
    current_stage: string;
    current_role: StageRole | "";
    current_user: ApiUser | null;
    cycle: number;
    version: number;
    total_stages: number;
    awaiting_me: boolean;
  } | null;
  can: RequestAbilities;
  /** The SAP outgoing payment, once Final's approval has posted it. */
  voucher: ApiVoucher | null;
  /** The latest return, send-back or rejection: what someone must act on. */
  last_decision: ApiRequestLog | null;
  /**
   * The viewer's OWN latest approve / reject / return / send-back on it, or
   * null. What the desk files a request under — never another approver's.
   */
  my_decision?: ApiRequestLog | null;
  /* Detail only. */
  vouchers?: ApiVoucher[];
  logs?: ApiRequestLog[];
  stages?: ApiStage[];
}

export type RequestScope = "mine" | "desk";
export type StageAction = "approve" | "reject" | "return" | "send-back" | "cancel" | "resubmit";

/** The problems a refused action lists, beside its message. */
export function advancePaymentProblems(err: unknown): string[] {
  const data = (err as { response?: { data?: { errors?: { problems?: string[] } } } })?.response?.data;
  return data?.errors?.problems ?? [];
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export const advancePaymentService = {
  /**
   * Active, unfrozen suppliers matching `search` (code OR name, contains).
   * `limit` up to the server's 500 — a caller that narrows the rows further
   * after they arrive asks for more, so the narrowing has enough to work on.
   */
  async vendors(
    company: AdvancePaymentCompany,
    search = "",
    limit = PICKER_LIMIT,
  ): Promise<SapVendor[]> {
    const res = await api.get(`${BASE}/vendors/`, {
      params: { company, search: search || undefined, limit },
    });
    return results<SapVendor>(res.data);
  },

  /** Employee advance accounts matching `search`. */
  async employees(company: AdvancePaymentCompany, search = ""): Promise<SapEmployee[]> {
    const res = await api.get(`${BASE}/employees/`, {
      params: { company, search: search || undefined, limit: PICKER_LIMIT },
    });
    return results<SapEmployee>(res.data);
  },

  /**
   * One vendor's open purchase orders — only those with something still to
   * receive — newest first. `card_code` is what narrows it to the vendor.
   */
  async openVendorPurchaseOrders(
    company: AdvancePaymentCompany,
    cardCode: string,
  ): Promise<SapOpenPurchaseOrder[]> {
    const res = await api.get(`${BASE}/open-purchase-orders/`, {
      params: { company, card_code: cardCode, limit: DOCUMENT_LIMIT },
    });
    return results<SapOpenPurchaseOrder>(res.data);
  },

  /**
   * The vendor's "All": every open document except its bills and POs — goods
   * receipts not yet billed, goods returns, credit memos, payments on account
   * and journals. Oldest due first.
   */
  async openOtherDocuments(
    company: AdvancePaymentCompany,
    cardCode: string,
  ): Promise<SapLedgerDocument[]> {
    const res = await api.get(`${BASE}/open-other-documents/`, {
      params: { company, card_code: cardCode, limit: DOCUMENT_LIMIT },
    });
    return results<SapLedgerDocument>(res.data);
  },

  /** The company's Budget and Sub Budget cost centres, for Payment Purpose. */
  async budgets(company: AdvancePaymentCompany): Promise<SapBudget[]> {
    const res = await api.get(`${BASE}/budgets/`, { params: { company } });
    return results<SapBudget>(res.data);
  },

  /** A partner's whole open ledger (JDT1, as SAP's ageing reads it), oldest due first. */
  async partnerLedger(company: AdvancePaymentCompany, cardCode: string): Promise<SapPartnerLedger> {
    const res = await api.get(`${BASE}/open-documents/`, {
      params: { company, card_code: cardCode, limit: DOCUMENT_LIMIT },
    });
    return unwrap<SapPartnerLedger>(res.data);
  },

  /** Every house bank account of the company, postable or not. */
  async houseBanks(company: AdvancePaymentCompany): Promise<SapHouseBank[]> {
    const res = await api.get(`${BASE}/house-banks/`, { params: { company } });
    return results<SapHouseBank>(res.data);
  },

  /** The company's cash accounts, from the chart of accounts. */
  async cashAccounts(company: AdvancePaymentCompany): Promise<SapCashAccount[]> {
    const res = await api.get(`${BASE}/cash-accounts/`, { params: { company } });
    return results<SapCashAccount>(res.data);
  },

  /** A payee's bank accounts in SAP, the default first. */
  async partnerBankAccounts(
    company: AdvancePaymentCompany,
    cardCode: string,
  ): Promise<SapPartnerBankAccount[]> {
    const res = await api.get(`${BASE}/partner-bank-accounts/`, {
      params: { company, card_code: cardCode },
    });
    return results<SapPartnerBankAccount>(res.data);
  },

  /**
   * A document's latest SAP attachment, the FILE itself (unzipped by the
   * server). The server reads the file name from SAP by document; it is never
   * sent from here.
   */
  async documentAttachment(
    company: AdvancePaymentCompany,
    kind: SapAttachmentKind,
    docEntry: number,
  ): Promise<Blob> {
    const res = await api.get(`${BASE}/document-attachment/`, {
      params: { company, kind, doc_entry: docEntry },
      responseType: "blob",
    });
    return res.data as Blob;
  },

  /**
   * Read a payment's proof (statement, advice or screenshot; PDF, Excel/CSV
   * or photo) and find its UTR, checked against this payment. Nothing is
   * stored server-side; the screen decides whether to keep the UTR.
   */
  async readPaymentProof(file: File, query: PaymentProofQuery): Promise<PaymentProofResult> {
    const body = new FormData();
    body.append("file", file);
    body.append("company", query.company);
    body.append("amount", query.amount);
    body.append("to_account", query.toAccount);
    body.append("card_code", query.cardCode);
    for (const invoice of query.invoices) body.append("invoices", invoice);
    // OCR of a photo or a scanned statement can take a while.
    const res = await api.post(`${BASE}/payment-proof/`, body, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 180_000,
    });
    return (res.data?.data ?? res.data) as PaymentProofResult;
  },

  /** The employee master, by name. Admins only. */
  async masterEmployees(search = ""): Promise<MasterEmployee[]> {
    const res = await api.get(`${BASE}/employee-master/`, {
      params: search ? { search } : {},
    });
    return results<MasterEmployee>(res.data);
  },

  /** Active departments with their sub-departments, by name. */
  async departments(): Promise<OmsDepartment[]> {
    const res = await api.get(`${BASE}/departments/`);
    return results<OmsDepartment>(res.data);
  },

  /** Active employees from the master, for the request form's pickers. */
  async employeeDirectory(query: DirectoryQuery = {}): Promise<DirectoryEmployee[]> {
    const params: Record<string, string> = {};
    if (query.roles?.length) params.roles = query.roles.join(",");
    if (query.search) params.search = query.search;
    if (query.notInSapFor) {
      params.not_in_sap = "1";
      params.company = query.notInSapFor;
    }
    const res = await api.get(`${BASE}/employee-directory/`, { params });
    return results<DirectoryEmployee>(res.data);
  },

  /** Add one employee to the master. Admins only. */
  async addMasterEmployee(employee: NewMasterEmployee): Promise<MasterEmployee> {
    const res = await api.post(`${BASE}/employee-master/`, employee);
    return (res.data?.data ?? res.data) as MasterEmployee;
  },

  /**
   * Read a PO's / bill's latest SAP attachment (OCR where it is a scan or a
   * photo) and check its invoice fields against SAP. Can take ~10 s a page.
   */
  async readDocumentAttachment(
    company: AdvancePaymentCompany,
    kind: SapAttachmentKind,
    docEntry: number,
  ): Promise<AttachmentReading> {
    const res = await api.get(`${BASE}/document-attachment/read/`, {
      params: { company, kind, doc_entry: docEntry },
      timeout: 180_000,
    });
    return (res.data?.data ?? res.data) as AttachmentReading;
  },

  /** One vendor's open A/P invoices (OPCH), oldest due first. */
  async openVendorInvoices(
    company: AdvancePaymentCompany,
    cardCode: string,
  ): Promise<SapOpenInvoice[]> {
    const res = await api.get(`${BASE}/open-invoices/`, {
      params: { company, party_type: "vendor", card_code: cardCode, limit: DOCUMENT_LIMIT },
    });
    return results<SapOpenInvoice>(res.data);
  },
  /* ── Payment requests ─────────────────────────────────────────────── */

  /** Your own requests (`mine`), or the approval desk's (`desk`), newest first. */
  async requests(scope: RequestScope): Promise<ApiRequest[]> {
    const res = await api.get(`${BASE}/requests/`, { params: { scope } });
    return results<ApiRequest>(res.data);
  },

  /** One request, with its history and its route. */
  async request(id: number): Promise<ApiRequest> {
    const res = await api.get(`${BASE}/requests/${id}/`);
    return unwrap<ApiRequest>(res.data);
  },

  /** Raise a request: saved and routed to its first approver in one step. */
  async createRequest(input: ApiRequestInput, files: File[]): Promise<ApiRequest> {
    const body = new FormData();
    body.append("data", JSON.stringify(input));
    files.forEach((file) => body.append("files", file));
    const res = await api.post(`${BASE}/requests/`, body, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return unwrap<ApiRequest>(res.data);
  },

  /** The creator's edit; `resubmit` sends a returned request on again. */
  async editRequest(
    id: number,
    input: ApiRequestInput,
    options: { files: File[]; removeFileIds: number[]; resubmit: boolean; version?: number },
  ): Promise<ApiRequest> {
    const body = new FormData();
    body.append("data", JSON.stringify(input));
    options.files.forEach((file) => body.append("files", file));
    body.append("remove_file_ids", JSON.stringify(options.removeFileIds));
    body.append("resubmit", options.resubmit ? "true" : "false");
    if (options.version !== undefined) body.append("version", String(options.version));
    const res = await api.post(`${BASE}/requests/${id}/edit/`, body, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return unwrap<ApiRequest>(res.data);
  },

  /** Approve, reject, return, send back, cancel or resubmit. */
  async act(id: number, action: StageAction, remarks = "", version?: number): Promise<ApiRequest> {
    // Posting to SAP happens on Audit's approval, which can take a while.
    const res = await api.post(
      `${BASE}/requests/${id}/${action}/`,
      { remarks, version },
      { timeout: 120_000 },
    );
    return unwrap<ApiRequest>(res.data);
  },

  /**
   * The Payment stage's payment and bank details. `manualToken`, from
   * `confirmManualPassword`, is needed when the payee's account is typed by
   * hand rather than picked from their SAP accounts.
   */
  async savePayout(
    id: number,
    payout: ApiPayout,
    version?: number,
    manualToken?: string | null,
  ): Promise<ApiRequest> {
    const res = await api.put(`${BASE}/requests/${id}/payout/`, {
      ...payout,
      version,
      ...(manualToken ? { manual_token: manualToken } : {}),
    });
    return unwrap<ApiRequest>(res.data);
  },

  /** The Payment user's password, before typing a payee account by hand. Returns the token. */
  async confirmManualPassword(id: number, password: string): Promise<string> {
    const res = await api.post(`${BASE}/requests/${id}/confirm-password/`, { password });
    return unwrap<{ token: string }>(res.data).token;
  },

  /** After paying: one transfer line's UTR, and the proof it was read from. */
  async recordUtr(
    id: number,
    lineId: number,
    utr: string,
    proof: unknown,
  ): Promise<ApiRequest> {
    const res = await api.post(`${BASE}/requests/${id}/payout-lines/${lineId}/utr/`, { utr, proof });
    return unwrap<ApiRequest>(res.data);
  },

  /** A bank proof, or a payment method's proof (`payoutLineId`). */
  async addRequestFile(
    id: number,
    file: File,
    purpose: "BANK_PROOF" | "PAYMENT_PROOF",
    payoutLineId?: number,
  ): Promise<ApiRequest> {
    const body = new FormData();
    body.append("file", file);
    body.append("purpose", purpose);
    if (payoutLineId) body.append("payout_line_id", String(payoutLineId));
    const res = await api.post(`${BASE}/requests/${id}/files/`, body, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return unwrap<ApiRequest>(res.data);
  },

  async removeRequestFile(id: number, fileId: number): Promise<ApiRequest> {
    const res = await api.delete(`${BASE}/requests/${id}/files/${fileId}/`);
    return unwrap<ApiRequest>(res.data);
  },

  /** A request's file, for opening in a new tab. */
  async requestFile(id: number, fileId: number): Promise<Blob> {
    const res = await api.get(`${BASE}/requests/${id}/files/${fileId}/`, { responseType: "blob" });
    return res.data as Blob;
  },
};
