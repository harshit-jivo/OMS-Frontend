/**
 * A payment request as both pages hold it: the FORM it was raised with (so
 * it can be shown, and edited, by the same components that raised it), the
 * payout, where it stands — and the server's own record (`api`), which
 * carries the route, the history and what the viewer may do now.
 *
 * Built from the server's answer by `requestApi.fromApiRequest`.
 */
import type { ApiRequest, CreditTerms } from "../../services/advancePaymentService";
import type { FileAttachment } from "./attachments";
import { PARTNER_TYPES, PAYMENT_AGAINST_OPTIONS, RETURN_METHODS } from "./constants";
import type { PayoutDetails } from "./payout";
import {
  allocationRows,
  allocationTotals,
  expenseNet,
  expenseTotal,
  formatDate,
  resolveCase,
  type RequestForm,
} from "./rules";

/**
 * Where a request stands, in the pages' words. PENDING is the server's
 * IN_APPROVAL (waiting at a stage); APPROVED is COMPLETED (Final approved:
 * the money may go).
 */
export type ApprovalStatus = "PENDING" | "RETURNED" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface Decision {
  status: Exclude<ApprovalStatus, "PENDING">;
  by: string;
  /** ISO date-time. */
  on: string;
  remarks: string;
}

export interface AdvanceRequestEntry {
  id: string;
  /** The server's id for it. */
  serverId: number;
  requestNo: string;
  requestedBy: string;
  /** ISO date-time. */
  requestedOn: string;
  form: RequestForm;
  files: FileAttachment[];
  status: ApprovalStatus;
  /** Filled at the Payment stage — see `payout.ts`. Absent until then. */
  payout?: PayoutDetails;
  /** The last decision that settled or turned it: completed, rejected, returned, cancelled. */
  decision?: Decision;
  /** The server's record: route, history, SAP payment, and what the viewer may do. */
  api: ApiRequest;
}

/* ── How a request reads on the desk ─────────────────────────────────────── */

/** What the request asks to pay: the lines' total, or the typed amount. */
export function requestAmount(form: RequestForm): number {
  const c = resolveCase(form);
  if (c.reference) return allocationTotals(allocationRows(form)).payment;
  // An Expense: its invoice values (what it pays is that less its TDS: `expenseNet`).
  if (c.expense) return expenseTotal(form.expenseLines);
  const n = Number(form.amount);
  return Number.isFinite(n) ? n : 0;
}

/** What the payment methods pay: an Expense's invoice values less its TDS, else the request's amount. */
export function paidAmount(form: RequestForm): number {
  return resolveCase(form).expense ? expenseNet(form) : requestAmount(form);
}

/** The vendor's own numbers (SAP `NumAtCard`) of the bills / POs a request pays, each once. */
export function vendorRefs(form: RequestForm): string[] {
  return [...new Set(form.selected.flatMap((doc) => (doc.reference ? [doc.reference] : [])))];
}

/** Who is paid: the SAP partner's name, or an Expense's typed payee. */
export function payeeOf(form: RequestForm): string {
  return form.type === "EXPENSE" ? form.payee : form.partnerName || form.partner;
}

export const typeLabel = (form: RequestForm) =>
  PARTNER_TYPES.find((type) => type.value === form.type)?.label ?? "—";

/** The listed answer's label, or the requester's own typed text. */
export function paymentAgainstLabel(form: RequestForm): string {
  if (form.paymentAgainst === "OTHER") return form.paymentAgainstOther || "Other";
  return PAYMENT_AGAINST_OPTIONS.find((o) => o.value === form.paymentAgainst)?.label ?? "—";
}

/**
 * What the money is for, in one word: a BILL already received (Against Bill),
 * or an ADVANCE paid before it (Against PO, or Advance). "" for anything else
 * (a ledger refund, an expense, "All").
 */
export function billOrAdvance(form: RequestForm): "Bill" | "Advance" | "" {
  if (form.paymentAgainst === "AGAINST_BILL") return "Bill";
  if (form.paymentAgainst === "AGAINST_PO" || form.paymentAgainst === "ADVANCE") return "Advance";
  return "";
}

/** The credit period assumed where SAP has none set for the vendor. */
export const DEFAULT_CREDIT_DAYS = 30;

/**
 * The payee's credit period, as approvers read it: "NET-30 · 30 days credit",
 * or "30 days credit (default)" where SAP has no terms set for the vendor.
 */
export function creditPeriod(terms: CreditTerms | null | undefined): string {
  if (!terms) return "";
  if (!terms.set) return `${terms.credit_days ?? DEFAULT_CREDIT_DAYS} days credit (default)`;
  return terms.days ? `${terms.terms} · ${terms.days} days credit` : terms.terms;
}

/**
 * When the request's earliest bill falls due under that credit period:
 * "Due 25 Oct 2026", or "Overdue since …" once past. Null without bills.
 */
export function creditDue(
  terms: CreditTerms | null | undefined,
  today = new Date().toLocaleDateString("en-CA"),
): { label: string; overdue: boolean } | null {
  const due = terms?.due_date;
  if (!due) return null;
  const overdue = due < today;
  return { label: `${overdue ? "Overdue since" : "Due"} ${formatDate(due)}`, overdue };
}

export function returnMethodLabel(form: RequestForm): string {
  if (form.returnMethod === "CUSTOM") return form.returnMethodOther || "Other";
  return RETURN_METHODS.find((m) => m.value === form.returnMethod)?.label ?? "—";
}
