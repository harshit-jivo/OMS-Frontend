/**
 * The PO in full from SAP, as the desk shows it from the Payment stage on.
 */
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { advancePaymentService, type SapPurchaseOrder } from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";

import { PurchaseOrderDetails } from "./PurchaseOrderDetails";
import { fromApiRequest } from "./requestApi";
import { apiRequest } from "./testRequests";

const PO: SapPurchaseOrder = {
  header: {
    doc_entry: 12556, doc_num: 220726044, status: "Closed", doc_date: "2026-07-01", delivery_date: "2026-07-01",
    document_date: "2026-07-01", created_on: "2026-07-11", card_code: "VENDA000657", card_name: "INFINITE SOLUTIONS",
    vendor_ref: "", currency: "INR", rate: "1", doc_total: "15340", tax: "2340", discount_percent: "0",
    discount: "0", freight: "0", rounding: "0", tds: "0", paid_to_date: "15340", down_payment: "0",
    branch: "DELHI", pay_to: "NEW DELHI-110058\nIN", ship_to: "A-35/1\nNew Delhi\nIN",
    payment_terms: "ADVANCE/CASH/0 DAYS", buyer: "", owner: "", created_by: "HARSH", remarks: "",
    journal_memo: "Purchase Orders - VENDA000657",
  },
  lines: [{
    line: 0, item_code: "CG0000008", description: "COMPUTER AND HARDWARE", quantity: "1", open_quantity: "0",
    unit: "PCS", price_before_discount: "13000", discount_percent: "0", price: "13000", line_total: "13000",
    tax_code: "CG+SG@18", tax_percent: "18", tax: "2340", gross_total: "15340", warehouse: "DL-FA",
    delivery_date: "2026-07-01", status: "Closed", account: "5680022", budget: "BackOff", sub_budget: "IT", note: "",
  }],
  follow_on: [
    { kind: "grpo", kind_label: "Goods receipt PO", doc_entry: 24675, doc_num: 2026076587, doc_date: "2026-07-02",
      doc_total: "15340", status: "Closed", vendor_ref: "IS-GST-2627-0175" },
    { kind: "bill", kind_label: "A/P invoice", doc_entry: 48410, doc_num: 726074106, doc_date: "2026-07-02",
      doc_total: "15340", status: "Open", vendor_ref: "IS-GST-2627-0175" },
  ],
  attachments: [],
};

vi.mock("../../services/advancePaymentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/advancePaymentService")>();
  return {
    ...actual,
    advancePaymentService: {
      purchaseOrder: vi.fn(async () => PO),
      documentAttachments: vi.fn(async () => [
        { kind: "po", kind_label: "Purchase order", doc_entry: 12556, doc_num: 220726044, line: 1,
          file_name: "quotation.pdf", date: "2026-07-01", note: "" },
      ]),
    },
  };
});

function poRequest() {
  return fromApiRequest(apiRequest(40, {
    payment_against: "AGAINST_PO",
    documents: [{
      id: 1, kind: "PO", sap_doc_entry: 12556, sap_doc_num: "220726044", vendor_ref: "", doc_date: "2026-07-01",
      due_date: null, original_amount: "15340", paid_amount: "0", open_amount: "15340", mode: "FIXED",
      percentage: null, amount: "15340.00", attachment_file: "", attachment_count: 0, attachment_date: null,
    }],
  }));
}

describe("the purchase order in full", () => {
  it("shows the header, every line, what was made from it, and its attachments", async () => {
    renderPage(<PurchaseOrderDetails entry={poRequest()} />);

    const card = await screen.findByRole("region", { name: "Purchase order 220726044 in SAP" });
    await within(card).findByText("INFINITE SOLUTIONS (VENDA000657)");
    expect(advancePaymentService.purchaseOrder).toHaveBeenCalledWith("OIL", 12556);
    expect(within(card).getByText("ADVANCE/CASH/0 DAYS")).toBeTruthy();

    const lines = within(card).getByRole("table", { name: "Lines of purchase order 220726044" });
    expect(within(lines).getByText("COMPUTER AND HARDWARE")).toBeTruthy();
    expect(within(lines).getByText("CG+SG@18")).toBeTruthy();
    expect(within(lines).getByText("BackOff / IT")).toBeTruthy();

    const made = within(card).getByRole("table", { name: "Documents made from purchase order 220726044" });
    expect(within(made).getByText("2026076587")).toBeTruthy();
    expect(within(made).getByText("726074106")).toBeTruthy();

    expect(await within(card).findByRole("button", { name: "Open SAP attachment quotation.pdf" })).toBeTruthy();
  });

  it("shows nothing for a request that pays no PO", () => {
    const bills = fromApiRequest(apiRequest(41));
    const { container } = renderPage(<PurchaseOrderDetails entry={bills} />);
    expect(container.textContent).toBe("");
  });
});
