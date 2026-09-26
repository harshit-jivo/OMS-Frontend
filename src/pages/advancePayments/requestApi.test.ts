/**
 * The form and the API, each way: what is raised is what is read back, so an
 * edit starts where the creator left it and the approvers see what was asked.
 */
import { describe, expect, it } from "vitest";

import type { ApiRequest } from "../../services/advancePaymentService";
import type { OpenDocument } from "./constants";
import { newPayoutLine, type PayoutDetails } from "./payout";
import { formFromApi, fromApiRequest, payoutFileChanges, payoutFromApi, payoutToApi, toApiRequest } from "./requestApi";
import { EMPTY_FORM, applyChange, changeAllocation, type RequestForm } from "./rules";
import { apiRequest } from "./testRequests";

const COMMON: Partial<RequestForm> = {
  department: "35",
  departmentName: "Finance",
  subDepartment: "92",
  subDepartmentName: "AP",
  hasSubDepartments: true,
  budget: "BackOff",
  budgetName: "Back Office",
  subBudget: "Accounts",
  subBudgetName: "Accounts",
  ownership: "Preshit Singh (JWPL0030)",
  paymentDate: "2026-10-01",
  priority: "HIGH",
  remarks: "Part settlement",
};

const BILLS: OpenDocument[] = [
  {
    id: "PCH-10256", number: "10256", date: "2026-08-04", partner: "VENDA000101", original: 250000, paid: 100000,
    open: 150000, reference: "ABC/INV/7781", dueDate: "2026-09-03",
    attachment: { company: "OIL", kind: "bill", docEntry: 10256, fileName: "scan.pdf", count: 3, date: "2026-09-17" },
  },
  { id: "PCH-10271", number: "10271", date: "2026-08-19", partner: "VENDA000101", original: 84000, paid: 0, open: 84000 },
];

function vendorBills(): RequestForm {
  let form = [
    { company: "OIL" as const, type: "VENDOR" as const },
    { paymentAgainst: "AGAINST_BILL" as const },
    { partner: "VENDA000101", partnerName: "ABC Technologies" },
    { selected: BILLS },
    COMMON,
  ].reduce<RequestForm>((f, patch) => applyChange(f, patch), EMPTY_FORM);
  form = changeAllocation(form, "PCH-10256", { amount: "97500" });
  return changeAllocation(form, "PCH-10271", { amount: "40000" });
}

/** What the server would answer for `input`: the input, stored. */
function stored(form: RequestForm): ApiRequest {
  const { department_id, sub_department_id, ...fields } = toApiRequest(form);
  return apiRequest(30, {
    ...fields,
    department: { id: department_id!, name: form.departmentName },
    sub_department: sub_department_id ? { id: sub_department_id, name: form.subDepartmentName } : null,
    documents: fields.documents.map((d, i) => ({ ...d, id: i + 1, amount: `${d.amount}.00` })),
    amount: `${fields.amount}.00`,
  });
}

describe("the request, to the API and back", () => {
  it("sends a bill request as its lines, each by its SAP entry", () => {
    const input = toApiRequest(vendorBills());
    expect(input).toMatchObject({
      company: "OIL",
      request_type: "VENDOR",
      payment_against: "AGAINST_BILL",
      partner_code: "VENDA000101",
      amount: "137500",
      department_id: 35,
      sub_department_id: 92,
      owner_label: "Preshit Singh (JWPL0030)",
      payment_date: "2026-10-01",
      expected_date: null,
      budget_code: "BackOff",
      sub_budget_code: "Accounts",
    });
    expect(input.documents.map((d) => [d.sap_doc_entry, d.amount, d.mode])).toEqual([
      [10256, "97500", "FIXED"],
      [10271, "40000", "FIXED"],
    ]);
    expect(input.documents[0]).toMatchObject({ attachment_file: "scan.pdf", attachment_count: 3, vendor_ref: "ABC/INV/7781" });
  });

  it("reads back the form it was raised with", () => {
    const form = vendorBills();
    const back = formFromApi(stored(form));
    expect(back.selected).toEqual(form.selected);
    expect(back.allocations).toEqual(form.allocations);
    expect({ ...back, selected: [], allocations: {} }).toEqual({ ...form, selected: [], allocations: {} });
  });

  it("sends each document's attachment reading, and reads it back", () => {
    const reading = { error: "The OCR service could not be reached." };
    const form = { ...vendorBills(), selected: vendorBills().selected.map((d, i) => (i === 0 ? { ...d, reading } : d)) };
    const input = toApiRequest(form);
    expect(input.documents.map((d) => d.attachment_check)).toEqual([reading, null]);
    expect(formFromApi(stored(form)).selected[0].reading).toEqual(reading);
  });

  it("sends a PO line by its percentage, and reads the percentage back", () => {
    let form = [
      { company: "OIL" as const, type: "VENDOR" as const },
      { paymentAgainst: "AGAINST_PO" as const },
      { partner: "VENDA000101", partnerName: "ABC Technologies", expectedDate: "2026-11-01" },
      { selected: [{ id: "POR-14008", number: "126226600", date: "2026-08-08", partner: "VENDA000101", original: 180000, paid: 0, open: 180000 }] },
      COMMON,
    ].reduce<RequestForm>((f, patch) => applyChange(f, patch), EMPTY_FORM);
    form = changeAllocation(form, "POR-14008", { mode: "PERCENT", percentage: "10" });
    const input = toApiRequest(form);
    expect(input.documents[0]).toMatchObject({ kind: "PO", sap_doc_entry: 14008, mode: "PERCENT", percentage: "10", amount: "18000" });
    expect(input.expected_date).toBe("2026-11-01");
    expect(formFromApi(stored(form)).allocations["POR-14008"]).toEqual(form.allocations["POR-14008"]);
  });

  it("sends a typed amount where there are no documents", () => {
    const form = [
      { company: "OIL" as const, type: "EMPLOYEE_ADVANCE" as const },
      { paymentAgainst: "ADVANCE" as const },
      { partner: "NOSAP:JWPL0999", partnerName: "NEW JOINER", amount: "20000" },
      { returnMethod: "ONE_TIME" as const },
      { expectedToDate: "2026-12-01" },
      COMMON,
    ].reduce<RequestForm>((f, patch) => applyChange(f, patch), EMPTY_FORM);
    const input = toApiRequest(form);
    expect(input).toMatchObject({ amount: "20000", documents: [], partner_code: "NOSAP:JWPL0999", return_method: "ONE_TIME" });
    expect(formFromApi(stored(form)).amount).toBe("20000");
  });

  it("reads the server's statuses in the pages' words", () => {
    expect(fromApiRequest(apiRequest(1, { status: "IN_APPROVAL" })).status).toBe("PENDING");
    expect(fromApiRequest(apiRequest(1, { status: "COMPLETED" })).status).toBe("APPROVED");
    expect(fromApiRequest(apiRequest(1, { status: "RETURNED" })).status).toBe("RETURNED");
  });
});

describe("the payment details, to the API and back", () => {
  const payout: PayoutDetails = {
    beneficiaryName: "ABC TECHNOLOGIES",
    toAccountNumber: "50100234567812",
    toIfsc: "HDFC0001234",
    toAccountManual: false,
    bankAttachments: [{ id: "a", name: "cheque.jpg", size: 10, file: new File(["x"], "cheque.jpg") }],
    lines: [
      { ...newPayoutLine("NEFT"), amount: "130000", fromAccount: "1104106" },
      {
        ...newPayoutLine("CASH"),
        amount: "7500",
        fromAccount: "1105001",
        noteRows: [{ id: "n", denomination: 500, quantity: "15" }, { id: "m", denomination: null, quantity: "" }],
        attachments: [{ id: "b", name: "slip.png", size: 5, file: new File(["y"], "slip.png") }],
      },
    ],
  };

  it("sends each line in the API's words, cash notes without the blank rows", () => {
    const api = payoutToApi(payout);
    expect(api.lines).toEqual([
      expect.objectContaining({ method: "NEFT", amount: "130000", from_account: "1104106", cash_notes: [] }),
      expect.objectContaining({ method: "CASH", amount: "7500", cash_notes: [{ denomination: 500, quantity: 15 }] }),
    ]);
  });

  it("uploads the new files against the lines the server saved, by position", () => {
    const saved = { ...payoutToApi(payout), lines: payoutToApi(payout).lines.map((l, i) => ({ ...l, id: 70 + i })) };
    const { upload, remove } = payoutFileChanges(payout, saved, undefined);
    expect(upload.map((u) => [u.file.name, u.purpose, u.lineId])).toEqual([
      ["cheque.jpg", "BANK_PROOF", undefined],
      ["slip.png", "PAYMENT_PROOF", 71],
    ]);
    expect(remove).toEqual([]);
  });

  it("removes the saved files taken off, and keeps a line's id through a read", () => {
    const read = payoutFromApi(
      { ...payoutToApi(payout), lines: [{ ...payoutToApi(payout).lines[0], id: 70 }] },
      [
        { id: 5, name: "old.pdf", size: 1, purpose: "PAYMENT_PROOF", payout_line_id: 70, uploaded_by: null, uploaded_on: null },
        { id: 6, name: "bank.pdf", size: 1, purpose: "BANK_PROOF", payout_line_id: null, uploaded_by: null, uploaded_on: null },
      ],
    );
    expect(read.lines[0].serverId).toBe(70);
    expect(read.lines[0].attachments.map((a) => a.serverId)).toEqual([5]);
    expect(read.bankAttachments.map((a) => a.serverId)).toEqual([6]);

    const edited = { ...read, lines: [{ ...read.lines[0], attachments: [] }] };
    expect(payoutFileChanges(edited, payoutToApi(edited), read).remove).toEqual([5]);
  });
});
