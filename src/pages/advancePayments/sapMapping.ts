/**
 * SAP rows → the form's own shapes. The ONE place server data is converted.
 *
 * The form was built against `Partner` and `OpenDocument`; the server speaks
 * `card_code` / `doc_entry` / string amounts. Converting here, once, keeps the
 * rules module ignorant of where a row came from — a live SAP invoice and a
 * sample PO are the same `OpenDocument` to it, so the calculation, the rows
 * and the total need no second path.
 */
import type {
  SapEmployee,
  SapOpenInvoice,
  SapVendor,
} from "../../services/advancePaymentService";

import type { OpenDocument, Partner } from "./constants";

/**
 * SAP money arrives as a string (`numeric(19,6)`). Parsed here and rounded to
 * the paisa; anything unparseable becomes 0 rather than NaN, because NaN
 * poisons every sum it touches and would show as "₹NaN" in the total.
 */
export function sapAmount(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Only the partners whose CardCode STARTS with `prefix` — VENDA for vendors,
 * ORGV for imprest accounts (see `PARTNER_CODE_PREFIX` in rules.ts).
 *
 * Applied to whatever the server returned, because its search is "contains"
 * on code OR name: searching "ORGV" would also return a vendor whose NAME
 * held those letters. Case-insensitive, like SAP's own codes are compared.
 */
export function withCodePrefix(vendors: SapVendor[], prefix: string | undefined): SapVendor[] {
  if (!prefix) return vendors;
  const want = prefix.toUpperCase();
  return vendors.filter((vendor) => vendor.card_code.toUpperCase().startsWith(want));
}

export function vendorToPartner(vendor: SapVendor): Partner {
  return {
    value: vendor.card_code,
    label: vendor.card_name || vendor.card_code,
    code: vendor.card_code,
  };
}

/**
 * An employee is their ADVANCE ACCOUNT: `value` is the GL account code, since
 * that is what an advance is posted to and what the server keys them by.
 * The payroll code, when the account name carries one, is shown beside it.
 */
export function employeeToPartner(employee: SapEmployee): Partner {
  const code = [employee.employee_code, employee.acct_code].filter(Boolean).join(" · ");
  return {
    value: employee.acct_code,
    label: employee.employee_name || employee.acct_name || employee.acct_code,
    code,
  };
}

/**
 * An open A/P invoice as a payable document.
 *
 * `balance_due` is the server's `DocTotal - PaidToDate`, which is exactly the
 * form's "open amount"; it is taken as given rather than recomputed, so the
 * figure on screen is SAP's. The id is namespaced (`PCH-<DocEntry>`) because
 * DocEntry is only unique within one table of one company.
 */
export function invoiceToDocument(invoice: SapOpenInvoice): OpenDocument {
  return {
    id: `PCH-${invoice.doc_entry}`,
    number: invoice.doc_num != null ? String(invoice.doc_num) : String(invoice.doc_entry),
    date: invoice.doc_date,
    partner: invoice.card_code,
    original: sapAmount(invoice.doc_total),
    paid: sapAmount(invoice.paid_to_date),
    open: sapAmount(invoice.balance_due),
    reference: invoice.party_ref || undefined,
    dueDate: invoice.due_date || undefined,
    currency: invoice.currency || undefined,
  };
}
