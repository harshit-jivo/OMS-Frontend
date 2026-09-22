/**
 * advancePaymentService — the SAP lookups behind the Advance Payment form.
 *
 * Mirrors `OMS-Backend/advance_payment/` (views.py + services/sap.py): five
 * read-only GETs, each reading the company's HANA schema live. Only the three
 * this form uses are wrapped here — vendors, employees and open vendor
 * invoices. Customers and open POs exist on the server too; the form has no
 * customer type any more, and Against PO stays on sample data until its "open
 * amount" is agreed (the server returns the UNDELIVERED value, the form shows
 * total less advances).
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
  if (status === 403) return "You do not have the Advance_Payment permission.";
  if (status === 503) return message || "SAP could not be reached. Try again shortly.";
  if (message) return message;
  if (!resp) return "The server could not be reached.";
  return "Could not load from SAP. Please try again.";
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
};
