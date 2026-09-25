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
  SapCashAccount,
  SapEmployee,
  SapHouseBank,
  SapLedgerDocument,
  SapOpenInvoice,
  SapOpenPurchaseOrder,
  SapPartnerBankAccount,
  SapVendor,
} from "../../services/advancePaymentService";

import type { OpenDocument } from "./constants";

const vendor = (card_code: string, card_name: string, balance = "0"): SapVendor => ({
  card_code,
  card_name,
  gstin: "",
  currency: "INR",
  balance,
  phone: "",
  email: "",
});

/**
 * SAP's supplier list, as it really is: vendors (VENDA) AND employee imprest
 * accounts (ORGV) in one table. One vendor has "ORGV" in its NAME, to prove
 * the prefix is matched on the code alone.
 */
export const SAP_VENDORS: SapVendor[] = [
  vendor("VENDA000101", "ABC Technologies", "-689875.000000"),
  vendor("VENDA000102", "XYZ Traders", "192543.000000"),
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
  attachment: null,
  ...extra,
});

/** Open A/P invoices by vendor. Shree Packaging has none. */
export const SAP_OPEN_INVOICES: SapOpenInvoice[] = [
  invoice(10256, "VENDA000101", "250000.000000", "100000.000000", {
    party_ref: "ABC/INV/7781",
    attachment: { file_name: "DocScanner Sep 17, 2026 12-39 PM.pdf", count: 3, date: "2026-09-17" },
  }),
  invoice(10271, "VENDA000101", "84000.000000", "0.000000", { doc_date: "2026-08-19" }),
  invoice(10263, "VENDA000102", "120000.000000", "45000.000000", { doc_date: "2026-08-11" }),
  // An employee's imprest account carries open bills of its own.
  invoice(10290, "ORGV000901", "6400.000000", "0.000000", { doc_date: "2026-09-02" }),
];

const po = (
  doc_entry: number,
  card_code: string,
  doc_total: string,
  received_amount: string,
  extra: Partial<SapOpenPurchaseOrder> = {},
): SapOpenPurchaseOrder => ({
  doc_entry,
  doc_num: doc_entry,
  card_code,
  card_name: "",
  vendor_ref: "",
  doc_date: "2026-08-08",
  due_date: "2026-09-30",
  currency: "INR",
  doc_total,
  tax_amount: "0",
  received_amount,
  open_amount: String(Number(doc_total) - Number(received_amount)),
  remarks: "",
  attachment: null,
  ...extra,
});

/**
 * Open POs by vendor, as `/open-purchase-orders/` returns them: `open_amount`
 * is what is still to be RECEIVED. XYZ has two, ABC one part-received.
 */
export const SAP_OPEN_POS: SapOpenPurchaseOrder[] = [
  po(4512, "VENDA000102", "180000.000000", "0.000000"),
  po(4519, "VENDA000102", "65000.000000", "0.000000", { doc_date: "2026-08-20" }),
  po(4501, "VENDA000101", "500000.000000", "150000.000000", { doc_date: "2026-07-22" }),
];

const other = (
  doc_type_code: number,
  doc_type: string,
  doc_entry: number,
  direction: "DEBIT" | "CREDIT",
  total: string,
  open: string,
): SapLedgerDocument => ({
  trans_id: null,
  doc_type_code,
  doc_type,
  doc_entry,
  doc_num: String(doc_entry),
  party_ref: "",
  document_date: "2026-08-12",
  posting_date: "2026-08-12",
  due_date: "2026-09-11",
  direction,
  total_amount: total,
  open_amount: open,
  settled_amount: String(Number(total) - Number(open)),
  currency: "INR",
  remarks: "",
});

/**
 * Everything but bills and POs, for VENDA000104 (Shree Packaging, who has
 * no bills and no POs) — a goods receipt not yet
 * billed (owed TO them) and a credit memo (owed BY them).
 */
export const SAP_OTHER_DOCUMENTS: SapLedgerDocument[] = [
  other(20, "Goods Receipt PO", 2201, "CREDIT", "80000.000000", "80000.000000"),
  other(19, "A/P Credit Memo", 5534, "DEBIT", "8200.000000", "8200.000000"),
];

/** A company's bank accounts, as `/advance-payments/house-banks/` returns them. */
export const SAP_HOUSE_BANKS: SapHouseBank[] = [
  {
    key: "1104106",
    gl_account: "1104106",
    gl_name: "HDFC BANK-50200012345678",
    bank_code: "HDFC",
    bank_name: "HDFC Bank",
    account_number: "50200012345678",
    branch: "",
    ifsc: "HDFC0000123",
    house_bank: true,
  },
  {
    key: "1104110",
    gl_account: "1104110",
    gl_name: "SBI-38912345670",
    bank_code: "SBI",
    bank_name: "State Bank of India",
    account_number: "38912345670",
    branch: "",
    ifsc: "SBIN0000456",
    house_bank: true,
  },
  // A bank G/L with no house bank set up in SAP — most of them are like this.
  {
    key: "1104107",
    gl_account: "1104107",
    gl_name: "ICICI BANK- 629305042549",
    bank_code: "",
    bank_name: "",
    account_number: "629305042549",
    branch: "",
    ifsc: "",
    house_bank: false,
  },
];

/** A company's cash G/L accounts, as `/advance-payments/cash-accounts/` returns them. */
export const SAP_CASH_ACCOUNTS: SapCashAccount[] = [
  { acct_code: "1105001", acct_name: "CASH SALE", balance: "0.000000" },
  { acct_code: "1105002", acct_name: "CASH IN HAND", balance: "125000.000000" },
];

const payeeAccount = (
  account_number: string,
  ifsc: string,
  bank_name: string,
  is_default: boolean,
  account_name = "ABC TECHNOLOGIES PVT LTD",
): SapPartnerBankAccount => ({
  id: null,
  bank_code: bank_name.slice(0, 4).toUpperCase(),
  bank_name,
  account_number,
  ifsc,
  ifsc_valid: true,
  branch: "",
  account_name,
  is_default,
});

/** ABC Technologies' accounts in SAP: a default, and one other. */
export const SAP_PAYEE_ACCOUNTS: Record<string, SapPartnerBankAccount[]> = {
  VENDA000101: [
    payeeAccount("50100234567812", "HDFC0001234", "HDFC BANK", true),
    payeeAccount("208601000040254", "IOBA0002086", "INDIAN OVERSEAS BANK", false),
  ],
};

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
