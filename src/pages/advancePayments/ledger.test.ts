/**
 * What OMS already holds caps a line; a customer's ledger items net, and go to
 * the API and back as SAP addresses them.
 */
import { describe, expect, it } from "vitest";

import type { ApiRequest } from "../../services/advancePaymentService";
import type { OpenDocument } from "./constants";
import { formFromApi, toApiRequest } from "./requestApi";
import { EMPTY_FORM, allocationRows, allocationTotals, applyChange, calculatePayment, changeAllocation } from "./rules";
import { ledgerToDocument } from "./sapMapping";
import { CUSTOMER_LEDGER } from "./testData";
import { apiRequest } from "./testRequests";

const PO: OpenDocument = {
  id: "POR-14008", number: "126226600", date: "2026-09-01", partner: "VENDA000101",
  original: 100, paid: 0, open: 100, oms: { tracked: true, reserved: 25, paid: 40, unadjusted: 40, available: 35, requests: 2 },
};

describe("what OMS already holds", () => {
  it("caps a line at what is still available", () => {
    expect(calculatePayment(PO, "FIXED", "35", "").payment).toBe(35);
    expect(calculatePayment(PO, "FIXED", "36", "").error).toBe(
      "Only ₹35 is available: ₹65 of it is already held by other OMS requests.",
    );
    // A share of what is still to come is held to the same.
    expect(calculatePayment(PO, "PERCENT", "", "50").error).toMatch(/Only ₹35 is available/);
  });
});

describe("a customer refund against the ledger", () => {
  const [receipt, invoice, held, paidOut] = CUSTOMER_LEDGER.results.map((r) => ledgerToDocument(r, "CUSTA000846"));

  it("keeps only what a refund can be applied to, keyed as SAP keys it", () => {
    expect(receipt?.ledger).toEqual({ object: 24, entry: 210827, line: 1, direction: "CREDIT" });
    expect(invoice?.ledger).toEqual({ object: 13, entry: 74506, line: 0, direction: "DEBIT" });
    expect(held?.oms?.available).toBe(0);
    expect(paidOut).toBeNull(); // a payment made out to them is not refunded against
  });

  function refundForm() {
    let form = [
      { company: "OIL" as const, type: "CUSTOMER" as const },
      { paymentAgainst: "AGAINST_LEDGER" as const },
      { partner: "CUSTA000846", partnerName: "ISHWER CHAND & SONS" },
      { selected: [receipt!, invoice!] },
    ].reduce((f, patch) => applyChange(f, patch), EMPTY_FORM);
    form = changeAllocation(form, receipt!.id, { amount: "100" });
    return changeAllocation(form, invoice!.id, { amount: "80" });
  }

  it("nets the invoices off the credits", () => {
    expect(allocationTotals(allocationRows(refundForm())).payment).toBe(20);
  });

  it("goes to the API as SAP addresses each item, and comes back the same", () => {
    const input = toApiRequest(refundForm());
    expect(input.amount).toBe("20");
    expect(input.documents.map((d) => [d.kind, d.sap_doc_entry, d.sap_line, d.sap_object, d.direction, d.amount]))
      .toEqual([
        ["LEDGER", 210827, 1, 24, "CREDIT", "100"],
        ["LEDGER", 74506, 0, 13, "DEBIT", "80"],
      ]);
    const stored: ApiRequest = apiRequest(50, {
      ...input,
      department: null,
      sub_department: null,
      documents: input.documents.map((d, i) => ({ ...d, id: i + 1, amount: `${d.amount}.00` })),
    });
    const back = formFromApi(stored);
    expect(back.selected.map((d) => d.ledger)).toEqual([receipt!.ledger, invoice!.ledger]);
    expect(allocationTotals(allocationRows(back)).payment).toBe(20);
  });
});
