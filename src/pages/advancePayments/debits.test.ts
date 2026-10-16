import { describe, expect, it } from "vitest";

import {
  billDebit,
  invoiceToDocument,
  paidWithoutDebit,
  purchaseOrderToDocument,
  sapDebitLabel,
} from "./sapMapping";
import { SAP_OPEN_INVOICES } from "./testData";

describe("debit notes against a bill or a PO", () => {
  it("carries SAP's debit notes on a bill and says them before it is paid", () => {
    const bill = invoiceToDocument({
      ...SAP_OPEN_INVOICES[0],
      debits: { amount: "21982.25", notes: [725025903] },
    });
    expect(bill.sapDebit).toEqual({ amount: 21982.25, notes: ["725025903"] });
    expect(sapDebitLabel(bill)).toBe("Debit note ₹21,982.25 (725025903)");
  });

  it("names several, and says nothing when there are none or SAP could not say", () => {
    const po = purchaseOrderToDocument({
      doc_entry: 5,
      doc_num: 220926075,
      card_code: "VENDA000001",
      card_name: "V",
      vendor_ref: "",
      doc_date: "2026-10-01",
      document_date: "2026-10-01",
      due_date: "2026-10-30",
      currency: "INR",
      doc_total: "100000",
      tax_amount: "0",
      received_amount: "0",
      open_amount: "100000",
      remarks: "",
      created_on: "2026-10-01",
      attachment: null,
      debits: { amount: "2383.15", notes: [626095047, 626095052] },
    } as never);
    expect(sapDebitLabel(po)).toBe("2 debit notes ₹2,383.15 (626095047, 626095052)");
    expect(
      sapDebitLabel(
        invoiceToDocument({ ...SAP_OPEN_INVOICES[0], debits: { amount: "0", notes: [] } }),
      ),
    ).toBeNull();
    expect(invoiceToDocument({ ...SAP_OPEN_INVOICES[0], debits: null }).sapDebit).toBeUndefined();
  });
});

describe("a bill's open amount: Original − Debit note − Paid", () => {
  it("takes the debit notes out of SAP's paid, which counts them", () => {
    // SAP: ₹17,48,570 bill, ₹1,58,903 debit note, nothing paid -> PaidToDate 1,58,903, open 15,89,667.
    const bill = invoiceToDocument({
      ...SAP_OPEN_INVOICES[0],
      doc_total: "1748570",
      paid_to_date: "158903",
      balance_due: "1589667",
      debits: { amount: "158903.00", notes: [626095037] },
    });
    expect(billDebit(bill)).toBe(158903);
    expect(paidWithoutDebit(bill)).toBe(0);
    expect(bill.original - billDebit(bill) - paidWithoutDebit(bill)).toBe(bill.open);
  });

  it("a bill OMS tracks: the server took the debit off its open, and paid is what OMS paid", () => {
    // AP 626094417: total 2,13,141, debit 2,116, nothing paid via OMS -> open 2,11,025.
    const bill = invoiceToDocument({
      ...SAP_OPEN_INVOICES[0],
      doc_total: "213141",
      paid_to_date: "0",
      balance_due: "211025.00",
      debits: { amount: "2116.00", notes: [626095053] },
      oms: { tracked: true, reserved: "0", paid: "0", available: "211025.00", requests: 0 },
    });
    expect(paidWithoutDebit(bill)).toBe(0);
    expect(bill.original - billDebit(bill) - paidWithoutDebit(bill)).toBe(bill.open);
  });

  it("leaves a PO's open amount alone: its debit notes are against its bills", () => {
    const po = purchaseOrderToDocument({
      doc_entry: 5,
      doc_num: 1,
      card_code: "V",
      card_name: "V",
      vendor_ref: "",
      doc_date: "2026-10-01",
      document_date: "2026-10-01",
      due_date: "2026-10-30",
      currency: "INR",
      doc_total: "100000",
      tax_amount: "0",
      received_amount: "40000",
      open_amount: "60000",
      remarks: "",
      created_on: "2026-10-01",
      attachment: null,
      debits: { amount: "2000", notes: [9] },
    } as never);
    expect(billDebit(po)).toBe(0);
    expect(paidWithoutDebit(po)).toBe(40000);
  });
});
