import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  advancePaymentService,
  type SapBillBreakdown,
  type SapPurchaseOrder,
} from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";

import { SapDocLink } from "./SapDocument";

/** Bill 626094379: copied from GRPO 2026096869, behind it PO 220926011. */
const BILL: SapBillBreakdown = {
  company: "OIL",
  header: {
    doc_entry: 27400, doc_num: 626094379, vendor_ref: "INV-77", doc_date: "2026-09-29",
    document_date: "2026-09-28", due_date: "2026-10-29", status: "Open",
    card_code: "VENDA001607", card_name: "VAISHNODEVI REFOILS",
    payable_account: "2110001", payable_account_name: "SUNDRY CREDITORS",
    taxable: "750000", freight: "0", discount: "0", gst: "135000", gross: "885000", tds: "750",
    rounding: "0", net: "884250", paid: "0", balance: "884250",
  },
  lines: [{ line: 0, item_code: "RM0001", description: "CRUDE OIL", quantity: "10", taxable: "750000",
            gst: "135000", tax_code: "IGST@18", account: "5110001", account_name: "PURCHASE RM" }],
  gst: [{ code: "IGST@18", rate: "18", base: "750000", amount: "135000", account: "2131020", account_name: "INPUT IGST" }],
  tds: [{ code: "94Q", name: "194Q PURCHASE", rate: "0.1", taxable: "750000", amount: "750", account: "2133009",
          account_name: "TDS 194Q" }],
  links: [
    { kind: "grpo", kind_label: "Goods Receipt PO", doc_entry: 27357, doc_num: 2026096869, doc_date: "2026-09-28", amount: "885000" },
    { kind: "po", kind_label: "Purchase Order", doc_entry: 13574, doc_num: 220926011, doc_date: "2026-09-02", amount: "6348507" },
  ],
};

const PO = {
  header: { doc_entry: 13574, doc_num: 220926011, status: "Open", doc_date: "2026-09-02", delivery_date: null,
            document_date: null, card_code: "VENDA001607", card_name: "VAISHNODEVI REFOILS", vendor_ref: "",
            doc_total: "6348507", tax: "0", discount: "0", freight: "0", rounding: "0", paid_to_date: "885000",
            pay_to: "GUJARAT", branch: "DELHI" },
  lines: [],
  follow_on: [],
  attachments: [],
} as unknown as SapPurchaseOrder;

afterEach(() => vi.restoreAllMocks());

describe("SAP document windows", () => {
  it("opens a bill as SAP shows it: header, tabs, totals — and follows its PO", async () => {
    const user = userEvent.setup();
    const bill = vi.spyOn(advancePaymentService, "billBreakdown").mockResolvedValue(BILL);
    const po = vi.spyOn(advancePaymentService, "purchaseOrder").mockResolvedValue(PO);
    vi.spyOn(advancePaymentService, "documentAttachments").mockResolvedValue([]);
    renderPage(<SapDocLink company="OIL" kind="bill" docEntry={27400} number="626094379" />);

    // Nothing is read until the golden arrow is followed.
    expect(bill).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Open A/P Invoice 626094379" }));

    const window = await screen.findByRole("dialog");
    expect(await within(window).findByText("VAISHNODEVI REFOILS")).toBeTruthy();
    expect(within(window).getByText("Total Payment Due")).toBeTruthy();
    expect(within(window).getAllByText("₹8,84,250")).toHaveLength(2); // Total Payment Due and Balance Due
    expect(within(window).getByText("5110001 - PURCHASE RM")).toBeTruthy(); // Contents: the G/L

    await user.click(within(window).getByRole("tab", { name: "Accounting" }));
    expect(within(window).getByText("2133009 - TDS 194Q")).toBeTruthy();

    await user.click(within(window).getByRole("tab", { name: "Linked Documents" }));
    expect(within(window).getByText("Goods Receipt PO")).toBeTruthy();
    await user.click(within(window).getByRole("button", { name: "Open Purchase Order 220926011" }));
    expect(po).toHaveBeenCalledWith("OIL", 13574);
    expect(await screen.findByText("GUJARAT")).toBeTruthy(); // the PO's Pay To, in its own window
  });

  it("opens a goods receipt and an outgoing payment, each with its attachments", async () => {
    const user = userEvent.setup();
    vi.spyOn(advancePaymentService, "goodsReceipt").mockResolvedValue({
      company: "OIL",
      header: { doc_entry: 27357, doc_num: 2026096869, vendor_ref: "", doc_date: "2026-09-28", due_date: null,
                document_date: null, status: "Closed", card_code: "VENDA001", card_name: "PIONEER PET", branch: "FACTORY",
                remarks: "", before_discount: "750000", discount: "0", freight: "0", tax: "135000", rounding: "0",
                total: "885000" },
      lines: [{ line: 0, item_code: "PM01", description: "PET PREFORM", quantity: "10", price: "75000",
                line_total: "750000", tax_code: "IGST@18", tax: "135000", warehouse: "BH-FG", account: "5120001",
                account_name: "PACKING MATERIAL" }],
      links: [],
    });
    const payment = vi.spyOn(advancePaymentService, "outgoingPayment").mockResolvedValue({
      company: "OIL",
      header: { doc_entry: 29816, doc_num: 1026466646, paid_to: "Vendor", doc_date: "2026-10-10", due_date: null,
                document_date: null, status: "Posted", card_code: "VENDA001792", card_name: "RAICON LABS",
                branch: "FACTORY", remarks: "", journal_memo: "", reference: "", trans_id: 239003,
                transfer_account: "1104107", transfer_account_name: "ICICI BANK", transfer_sum: "25000",
                transfer_date: "2026-10-10", transfer_ref: "", cash_account: "", cash_account_name: "",
                cash_sum: "0", check_sum: "0", on_account: "25000", total: "25000", payment_mode: "NEFT",
                urgency: "H", type_of_advance: "One Time Settlement", settle_by: "2026-11-09" },
      documents: [],
      accounts: [],
    });
    const attachments = vi.spyOn(advancePaymentService, "documentAttachments").mockResolvedValue([]);

    renderPage(
      <>
        <SapDocLink company="OIL" kind="grpo" docEntry={27357} number="2026096869" />
        <SapDocLink company="OIL" kind="payment" docEntry={29816} number="1026466646" />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Open Goods Receipt PO 2026096869" }));
    let window = await screen.findByRole("dialog");
    expect(await within(window).findByText("5120001 - PACKING MATERIAL")).toBeTruthy();
    await user.click(within(window).getByRole("tab", { name: "Attachments" }));
    expect(attachments).toHaveBeenCalledWith("OIL", "grpo", 27357);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Open Outgoing Payment 1026466646" }));
    window = await screen.findByRole("dialog");
    expect(payment).toHaveBeenCalledWith("OIL", 29816);
    expect(await within(window).findByText("Paid on account: applied to no document.")).toBeTruthy();
    await user.click(within(window).getByRole("tab", { name: "Payment Means" }));
    expect(within(window).getByText("1104107 - ICICI BANK")).toBeTruthy();
    await user.click(within(window).getByRole("tab", { name: "User Fields" }));
    expect(within(window).getByText("HIGH")).toBeTruthy();
  });
});
