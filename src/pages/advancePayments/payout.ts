/**
 * How an approved advance is PAID OUT — the part only the approver fills in.
 * PURE, NO REACT.
 *
 * The requester says what is owed and to whom; they do not know which of the
 * company's accounts it leaves from, by what instrument, or the payee's bank
 * details as finance has verified them. The approver does, so these fields
 * exist only on the approval desk.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SAME SHAPE AS RECEIVE PAYMENT, THE OTHER WAY ROUND
 * ─────────────────────────────────────────────────────────────────────────
 * Mirrors the mobile app's Receive Payment method card
 * (`OMS/app/(main)/payments/_components/PaymentMethodCard.tsx`) so a person
 * who records money coming in records money going out the same way:
 *
 *   * one or more METHOD LINES — UPI, Cheque or Cash — each with its amount;
 *   * Cash carries a NOTE BREAKDOWN (₹10…₹500) that must equal the amount;
 *   * UPI carries the transaction reference / UTR (optional, ≤ 50 chars);
 *   * Cheque carries number, bank and date;
 *   * every line names OUR account — a house bank for UPI/cheque, a cash
 *     drawer for cash — which here is the account paid FROM, where receipts
 *     name the one paid INTO;
 *   * every non-cash line carries proof (the cheque, the payment screenshot).
 *
 * Added for the outgoing side: the PAYEE — name, account number, IFSC — and
 * attachments for those bank details (a cancelled cheque, a bank letter).
 *
 * The house banks and cash drawers below are SAMPLE lists. In the app they are
 * `/payments/banks/` and `/payments/cash-accounts/`; this desk is UI only.
 */
import type { MockAttachment } from "./attachments";
import { formatINR } from "./rules";

export type PayoutMethod = "UPI" | "CHEQUE" | "CASH";

export const PAYOUT_METHODS: ReadonlyArray<{ value: PayoutMethod; label: string }> = [
  { value: "UPI", label: "UPI" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
];

/** The receive-payment screen's notes, unchanged. */
export const NOTE_DENOMINATIONS = [10, 20, 50, 100, 200, 500] as const;

/** Matches the receive-payment rule (and the server's, in payments/serializers.py). */
export const UPI_REFERENCE_MAX = 50;

/** SAMPLE house banks — `BANKCODE:GL`, the key shape `/payments/banks/` uses. */
export const HOUSE_BANKS = [
  { value: "HDFC:1104106", label: "HDFC Bank — A/c 50200012345678" },
  { value: "SBI:1104110", label: "State Bank of India — A/c 38912345670" },
  { value: "ICICI:1104121", label: "ICICI Bank — A/c 002105012345" },
] as const;

/** SAMPLE cash drawers — the G/L, the key shape `/payments/cash-accounts/` uses. */
export const CASH_ACCOUNTS = [
  { value: "1105001", label: "Head Office Cash — 1105001" },
  { value: "1105004", label: "Factory Cash — 1105004" },
] as const;

export interface CashNoteRow {
  id: string;
  denomination: number | null;
  quantity: string;
}

export interface PayoutLine {
  id: string;
  method: PayoutMethod;
  amount: string;
  /** OUR account the money leaves from — a house bank, or a drawer for cash. */
  fromAccount: string;
  /** Cash only. */
  noteRows: CashNoteRow[];
  /** Cheque only. */
  chequeNumber: string;
  /** The bank the cheque is drawn on — ours, since we are paying. */
  chequeBank: string;
  chequeDate: string;
  /** UPI only — the transaction reference / UTR. */
  reference: string;
  /** Proof — every method but cash. */
  attachments: MockAttachment[];
}

export interface PayoutDetails {
  /** Who receives it, as their bank knows them. */
  beneficiaryName: string;
  toAccountNumber: string;
  toIfsc: string;
  lines: PayoutLine[];
  /** Supporting the payee's bank details — a cancelled cheque, a bank letter. */
  bankAttachments: MockAttachment[];
}

let lineSeq = 0;

export function newPayoutLine(method: PayoutMethod = "UPI"): PayoutLine {
  lineSeq += 1;
  return {
    id: `line-${lineSeq}-${Date.now()}`,
    method,
    amount: "",
    fromAccount: "",
    noteRows: [],
    chequeNumber: "",
    chequeBank: "",
    chequeDate: "",
    reference: "",
    attachments: [],
  };
}

export const EMPTY_PAYOUT: PayoutDetails = {
  beneficiaryName: "",
  toAccountNumber: "",
  toIfsc: "",
  lines: [],
  bankAttachments: [],
};

/** A fresh payout with one line, pre-filled with the whole amount. */
export function startPayout(amount: number, beneficiaryName = ""): PayoutDetails {
  return {
    ...EMPTY_PAYOUT,
    beneficiaryName,
    lines: [{ ...newPayoutLine("UPI"), amount: amount > 0 ? String(amount) : "" }],
  };
}

/** Which account list a line picks from. */
export const accountsFor = (method: PayoutMethod) =>
  method === "CASH" ? CASH_ACCOUNTS : HOUSE_BANKS;

/**
 * A method change keeps the amount and drops everything that belonged to the
 * old method — including the FROM account, because a cash drawer is not a
 * valid source for a UPI transfer and a house bank is not one for cash. The
 * receive-payment card does the same (`methodChangePatch`).
 */
export function changeMethod(line: PayoutLine, method: PayoutMethod): PayoutLine {
  if (method === line.method) return line;
  return { ...newPayoutLine(method), id: line.id, amount: line.amount };
}

/* ── Money ───────────────────────────────────────────────────────────────── */

const paise = (value: number) => Math.round(value * 100);

function amountOf(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export function noteRowsTotal(rows: CashNoteRow[]): number {
  return rows.reduce(
    (sum, row) => sum + (row.denomination ?? 0) * (Number(row.quantity) || 0),
    0,
  );
}

/** The receive-payment rule, word for word: the notes must add up exactly. */
export function cashBreakdownError(line: PayoutLine): string | null {
  if (line.method !== "CASH") return null;
  const amount = Number(line.amount) || 0;
  if (amount <= 0) return null;
  const breakdown = noteRowsTotal(line.noteRows);
  if (line.noteRows.length === 0 || breakdown === 0) {
    return `Add the cash denominations for ${formatINR(amount)}. The note breakdown is required for a cash payment.`;
  }
  if (paise(breakdown) === paise(amount)) return null;
  const difference = breakdown - amount;
  return difference < 0
    ? `Denominations are short by ${formatINR(Math.abs(difference))}. They must equal the amount entered.`
    : `Denominations exceed the amount by ${formatINR(difference)}. They must equal the amount entered.`;
}

/** Sum of every line with a valid amount, in paise then back. */
export function payoutTotal(payout: PayoutDetails): number {
  return (
    payout.lines.reduce((sum, line) => {
      const n = amountOf(line.amount);
      return sum + (Number.isNaN(n) || n <= 0 ? 0 : paise(n));
    }, 0) / 100
  );
}

/* ── Validation ──────────────────────────────────────────────────────────── */

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^\d{9,18}$/;

export interface PayoutValidation {
  missing: string[];
  problems: string[];
}

/**
 * What stops an approval.
 *
 * The payee's account and IFSC are asked only when some line is not cash — a
 * cash payment has no account to send to. Every line must name its source
 * account and carry its method's details; the lines together must come to
 * EXACTLY the request's payment amount, or the approval pays something other
 * than what was approved.
 */
export function validatePayout(payout: PayoutDetails, requestAmount: number): PayoutValidation {
  const missing: string[] = [];
  const problems: string[] = [];

  if (!payout.beneficiaryName.trim()) missing.push("Beneficiary Name");

  const needsAccount = payout.lines.some((line) => line.method !== "CASH");
  if (needsAccount) {
    if (!payout.toAccountNumber.trim()) missing.push("To Account Number");
    else if (!ACCOUNT.test(payout.toAccountNumber.trim())) {
      problems.push("To Account Number must be 9 to 18 digits.");
    }
    if (!payout.toIfsc.trim()) missing.push("IFSC");
    else if (!IFSC.test(payout.toIfsc.trim().toUpperCase())) {
      problems.push("IFSC must look like HDFC0001234 — 4 letters, a 0, then 6 letters or digits.");
    }
  }

  if (payout.lines.length === 0) missing.push("at least one payment method");

  payout.lines.forEach((line, index) => {
    const n = index + 1;
    const amount = amountOf(line.amount);
    if (!line.amount.trim()) missing.push(`Amount (method ${n})`);
    else if (Number.isNaN(amount) || amount <= 0) {
      problems.push(`Method ${n}: enter an amount above zero.`);
    }
    if (!line.fromAccount) missing.push(`From Account (method ${n})`);

    if (line.method === "CHEQUE") {
      if (!line.chequeNumber.trim()) missing.push(`Cheque Number (method ${n})`);
      if (!line.chequeDate) missing.push(`Cheque Date (method ${n})`);
    }
    if (line.method === "UPI" && line.reference.length > UPI_REFERENCE_MAX) {
      problems.push(`Method ${n}: the UPI reference is longer than ${UPI_REFERENCE_MAX} characters.`);
    }
    const cash = cashBreakdownError(line);
    if (cash) problems.push(`Method ${n}: ${cash}`);
  });

  if (payout.lines.length > 0 && requestAmount > 0) {
    const total = payoutTotal(payout);
    if (paise(total) !== paise(requestAmount)) {
      problems.push(
        `The payment methods add up to ${formatINR(total)}, but the request is for ${formatINR(requestAmount)}.`,
      );
    }
  }

  return { missing, problems };
}
