/**
 * The approval desk's view of a request — and SAMPLE requests to review.
 *
 * UI ONLY. There is no endpoint that creates a request yet, so there are none
 * to fetch; the entries below stand in for them. They are BUILT through the
 * same `applyChange` / `changeAllocation` the form uses, so every sample is a
 * state the form could actually have produced — not a hand-written object
 * that might hold a combination the rules forbid.
 */
import type { MockAttachment } from "./attachments";
import {
  PARTNER_TYPES,
  PAYMENT_AGAINST_OPTIONS,
  RETURN_METHODS,
  type OpenDocument,
} from "./constants";
import { type PayoutDetails, newPayoutLine } from "./payout";
import {
  EMPTY_FORM,
  allocationRows,
  allocationTotals,
  applyChange,
  changeAllocation,
  resolveCase,
  type Allocation,
  type RequestForm,
} from "./rules";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Decision {
  status: Exclude<ApprovalStatus, "PENDING">;
  by: string;
  /** ISO date-time. */
  on: string;
  remarks: string;
}

export interface AdvanceRequestEntry {
  id: string;
  requestNo: string;
  requestedBy: string;
  /** ISO date-time. */
  requestedOn: string;
  form: RequestForm;
  files: MockAttachment[];
  status: ApprovalStatus;
  /** Filled by the approver — see `payout.ts`. Absent until they start. */
  payout?: PayoutDetails;
  decision?: Decision;
  /** Set when the approver changed the request itself. */
  editedBy?: { by: string; on: string };
}

/* ── How a request reads on the desk ─────────────────────────────────────── */

/** What the request asks to pay: the lines' total, or the typed amount. */
export function requestAmount(form: RequestForm): number {
  if (resolveCase(form).reference) return allocationTotals(allocationRows(form)).payment;
  const n = Number(form.amount);
  return Number.isFinite(n) ? n : 0;
}

export const typeLabel = (form: RequestForm) =>
  PARTNER_TYPES.find((type) => type.value === form.type)?.label ?? "—";

/** The listed answer's label, or the requester's own typed text. */
export function paymentAgainstLabel(form: RequestForm): string {
  if (form.paymentAgainst === "OTHER") return form.paymentAgainstOther || "Other";
  return PAYMENT_AGAINST_OPTIONS.find((o) => o.value === form.paymentAgainst)?.label ?? "—";
}

export function returnMethodLabel(form: RequestForm): string {
  if (form.returnMethod === "CUSTOM") return form.returnMethodOther || "Other";
  return RETURN_METHODS.find((m) => m.value === form.returnMethod)?.label ?? "—";
}

/* ── Sample requests ─────────────────────────────────────────────────────── */

function build(...patches: Partial<RequestForm>[]): RequestForm {
  return patches.reduce<RequestForm>((form, patch) => applyChange(form, patch), EMPTY_FORM);
}

function allocate(form: RequestForm, lines: Record<string, Partial<Allocation>>): RequestForm {
  return Object.entries(lines).reduce(
    (current, [id, patch]) => changeAllocation(current, id, patch),
    form,
  );
}

/** Two open A/P invoices of a SAP vendor, as the form snapshots them. */
const ABC_BILLS: OpenDocument[] = [
  { id: "PCH-10256", number: "10256", date: "2026-08-04", partner: "VENDA000101", original: 250000, paid: 100000, open: 150000, reference: "ABC/INV/7781", dueDate: "2026-09-03" },
  { id: "PCH-10271", number: "10271", date: "2026-08-19", partner: "VENDA000101", original: 84000, paid: 0, open: 84000, dueDate: "2026-09-18" },
];

const file = (name: string, size: number): MockAttachment => ({ id: `f-${name}`, name, size });

export const SAMPLE_REQUESTS: AdvanceRequestEntry[] = [
  {
    id: "r14",
    requestNo: "AP-2026-0014",
    requestedBy: "Neha Agarwal",
    requestedOn: "2026-09-22T10:42:00+05:30",
    status: "PENDING",
    files: [file("ABC-statement-Sep.pdf", 182_000)],
    form: allocate(
      build(
        { company: "OIL", type: "VENDOR" },
        { paymentAgainst: "AGAINST_BILL" },
        { partner: "VENDA000101", partnerName: "ABC Technologies" },
        { selected: ABC_BILLS },
        {
          ownership: "Procurement — Rajesh",
          paymentDate: "2026-09-25",
          priority: "HIGH",
          remarks: "Part settlement of August invoices; balance next cycle.",
        },
      ),
      { "PCH-10256": { mode: "PERCENT", percentage: "65" }, "PCH-10271": { amount: "40000" } },
    ),
  },
  {
    id: "r13",
    requestNo: "AP-2026-0013",
    requestedBy: "Priya Menon",
    requestedOn: "2026-09-21T16:05:00+05:30",
    status: "PENDING",
    files: [],
    form: build(
      { company: "OIL", type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "ADVANCE" },
      { partner: "1113035", partnerName: "RAVINDER SINGH SHUNTY", amount: "20000" },
      { returnMethod: "EMI" },
      { installments: "4" },
      { expectedFromDate: "2026-10-01", expectedToDate: "2026-10-15" },
      {
        ownership: "HR — Sunita",
        paymentDate: "2026-09-24",
        priority: "MEDIUM",
        remarks: "Relocation advance; recover in four monthly deductions.",
      },
    ),
  },
  {
    id: "r12",
    requestNo: "AP-2026-0012",
    requestedBy: "Vikram Singh",
    requestedOn: "2026-09-20T11:18:00+05:30",
    status: "PENDING",
    files: [file("PO-4512-signed.pdf", 96_000)],
    form: allocate(
      build(
        { company: "BEVERAGES", type: "VENDOR" },
        { paymentAgainst: "AGAINST_PO" },
        { partner: "V-1002", partnerName: "XYZ Traders", expectedDate: "2026-10-10" },
        {
          // Sample POs — Against PO is still on sample data.
          selected: [
            { id: "P-2", number: "PO-4512", date: "2026-08-08", partner: "V-1002", original: 180000, paid: 0, open: 180000 },
            { id: "P-3", number: "PO-4519", date: "2026-08-21", partner: "V-1002", original: 95000, paid: 30000, open: 65000 },
          ],
        },
        {
          ownership: "Stores — Harpreet",
          paymentDate: "2026-09-23",
          priority: "LOW",
          remarks: "Advance to release the September consignment.",
        },
      ),
      { "P-2": { mode: "PERCENT", percentage: "10" }, "P-3": { amount: "6500" } },
    ),
  },
  {
    id: "r11",
    requestNo: "AP-2026-0011",
    requestedBy: "Amit Verma",
    requestedOn: "2026-09-18T09:30:00+05:30",
    status: "APPROVED",
    files: [],
    form: build(
      { company: "MART", type: "EMPLOYEE_IMPREST" },
      { paymentAgainst: "ADVANCE" },
      {
        partner: "ORGV000901",
        partnerName: "RAHUL SHARMA IMPREST JWPL0901",
        amount: "15000",
        expectedBillDate: "2026-10-05",
      },
      {
        ownership: "Store Ops — Mart",
        paymentDate: "2026-09-19",
        priority: "MEDIUM",
        remarks: "Petty cash float for the Sector 17 store.",
      },
    ),
    payout: {
      beneficiaryName: "RAHUL SHARMA",
      toAccountNumber: "50100234567812",
      toIfsc: "HDFC0001234",
      bankAttachments: [file("cancelled-cheque-rahul.jpg", 240_000)],
      lines: [
        { ...newPayoutLine("UPI"), id: "r11-l1", amount: "15000", fromAccount: "HDFC:1104106", reference: "UTR426118823401", attachments: [file("upi-receipt.png", 88_000)] },
      ],
    },
    decision: {
      status: "APPROVED",
      by: "Finance Controller",
      on: "2026-09-19T12:10:00+05:30",
      remarks: "Approved as per imprest policy.",
    },
  },
  {
    id: "r10",
    requestNo: "AP-2026-0010",
    requestedBy: "Neha Agarwal",
    requestedOn: "2026-09-16T14:55:00+05:30",
    status: "REJECTED",
    files: [],
    form: build(
      { company: "OIL", type: "VENDOR" },
      { paymentAgainst: "OTHER", paymentAgainstOther: "Security deposit" },
      { partner: "VENDA000104", partnerName: "Shree Packaging Industries", amount: "50000" },
      {
        ownership: "Procurement — Rajesh",
        paymentDate: "2026-09-18",
        priority: "HIGH",
        remarks: "Refundable deposit for the new packaging contract.",
      },
    ),
    decision: {
      status: "REJECTED",
      by: "Finance Controller",
      on: "2026-09-17T10:02:00+05:30",
      remarks: "Deposit terms not yet signed — resubmit with the agreement.",
    },
  },
];
