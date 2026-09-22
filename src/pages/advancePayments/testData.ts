/**
 * TEST FIXTURES ONLY — imported by `*.test.ts(x)`, never by the app.
 *
 * SAP-shaped rows for the three live lookups, as the server returns them
 * (strings for money, `card_code` / `doc_entry`), and the same bills already
 * converted by `invoiceToDocument` for the pure rules tests. The figures are
 * the ones the form was designed around — AP 10256 is ₹2,50,000 with
 * ₹1,00,000 paid, so ₹1,50,000 open — so the examples in the specs still hold.
 */
import type {
  SapEmployee,
  SapOpenInvoice,
  SapVendor,
} from "../../services/advancePaymentService";

import type { OpenDocument } from "./constants";

const vendor = (card_code: string, card_name: string): SapVendor => ({
  card_code,
  card_name,
  gstin: "",
  currency: "INR",
  balance: "0",
  phone: "",
  email: "",
});

/**
 * SAP's supplier list, as it really is: vendors (VENDA) AND employee imprest
 * accounts (ORGV) in one table. One vendor has "ORGV" in its NAME, to prove
 * the prefix is matched on the code alone.
 */
export const SAP_VENDORS: SapVendor[] = [
  vendor("VENDA000101", "ABC Technologies"),
  vendor("VENDA000102", "XYZ Traders"),
  vendor("VENDA000103", "PQR Suppliers"),
  vendor("VENDA000104", "Shree Packaging Industries"),
  vendor("VENDA000105", "ORGVALE LOGISTICS"),
  vendor("ORGV000901", "RAHUL SHARMA IMPREST JWPL0901"),
  vendor("ORGV000902", "NEHA SINGH IMPREST JWPL0902"),
];

const invoice = (
  doc_entry: number,
  card_code: string,
  doc_total: string,
  paid_to_date: string,
  extra: Partial<SapOpenInvoice> = {},
): SapOpenInvoice => ({
  doc_entry,
  doc_num: doc_entry,
  card_code,
  card_name: "",
  party_ref: "",
  doc_date: "2026-08-04",
  due_date: "2026-09-03",
  currency: "INR",
  doc_total,
  paid_to_date,
  balance_due: String(Number(doc_total) - Number(paid_to_date)),
  ...extra,
});

/** Open A/P invoices by vendor. Shree Packaging has none. */
export const SAP_OPEN_INVOICES: SapOpenInvoice[] = [
  invoice(10256, "VENDA000101", "250000.000000", "100000.000000", { party_ref: "ABC/INV/7781" }),
  invoice(10271, "VENDA000101", "84000.000000", "0.000000", { doc_date: "2026-08-19" }),
  invoice(10263, "VENDA000102", "120000.000000", "45000.000000", { doc_date: "2026-08-11" }),
];

export const SAP_EMPLOYEES: SapEmployee[] = [
  {
    employee_code: "JWPL0035",
    employee_name: "RAVINDER SINGH SHUNTY",
    acct_code: "1113035",
    acct_name: "RAVINDER SINGH SHUNTY ADVANCE JWPL0035",
    balance: "12000.000000",
  },
  {
    employee_code: "JWPL0041",
    employee_name: "AMIT VERMA",
    acct_code: "1113041",
    acct_name: "AMIT VERMA ADVANCE JWPL0041",
    balance: "0.000000",
  },
];

/** The same bills as `invoiceToDocument` produces them, for the rules tests. */
export const BILL_10256: OpenDocument = {
  id: "PCH-10256",
  number: "10256",
  date: "2026-08-04",
  partner: "VENDA000101",
  original: 250000,
  paid: 100000,
  open: 150000,
  reference: "ABC/INV/7781",
};
export const BILL_10271: OpenDocument = {
  id: "PCH-10271",
  number: "10271",
  date: "2026-08-19",
  partner: "VENDA000101",
  original: 84000,
  paid: 0,
  open: 84000,
};
export const BILL_10263: OpenDocument = {
  id: "PCH-10263",
  number: "10263",
  date: "2026-08-11",
  partner: "VENDA000102",
  original: 120000,
  paid: 45000,
  open: 75000,
};
