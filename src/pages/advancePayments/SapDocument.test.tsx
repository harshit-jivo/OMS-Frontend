import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  advancePaymentService,
  type SapBillBreakdown,
  type SapPurchaseOrder,
} from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";

import { SapDocLink, SapPartnerLink } from "./SapDocument";

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

  it("shows a bill's relationship map and its journal entry, as SAP does", async () => {
    const user = userEvent.setup();
    vi.spyOn(advancePaymentService, "billBreakdown").mockResolvedValue({
      ...BILL,
      header: { ...BILL.header, trans_id: 239031 },
    });
    vi.spyOn(advancePaymentService, "relationshipMap").mockResolvedValue({
      company: "OIL",
      focus: { kind: "bill", doc_entry: 27400 },
      nodes: [
        { key: "po:13574", kind: "po", kind_label: "Purchase Order", doc_entry: 13574, doc_num: 220926011,
          date: "2026-09-02", total: "6348507", status: "Open", ref: "", trans_id: null, parents: [], oms: "" },
        { key: "grpo:27357", kind: "grpo", kind_label: "Goods Receipt PO", doc_entry: 27357, doc_num: 2026096869,
          date: "2026-09-28", total: "885000", status: "Closed", ref: "", trans_id: 236715, parents: ["po:13574"], oms: "" },
        { key: "bill:27400", kind: "bill", kind_label: "A/P Invoice", doc_entry: 27400, doc_num: 626094379,
          date: "2026-09-29", total: "884250", status: "Open", ref: "", trans_id: 239031, parents: ["grpo:27357"], oms: "" },
        { key: "credit_memo:9", kind: "credit_memo", kind_label: "A/P Credit Memo", doc_entry: 9, doc_num: 5550001,
          date: "2026-10-01", total: "1000", status: "Closed", ref: "", trans_id: 240000, parents: ["bill:27400"], oms: "" },
        { key: "payment:30001", kind: "payment", kind_label: "Outgoing Payment", doc_entry: 30001, doc_num: 1026466700,
          date: "2026-10-09", total: "500000", status: "Closed", ref: "", trans_id: 240100, parents: ["po:13574"],
          oms: "AP-2026-0021" },
      ],
    });
    const je = vi.spyOn(advancePaymentService, "journalEntry").mockResolvedValue({
      company: "OIL",
      header: { trans_id: 239031, number: 926302500, posting_date: "2026-09-29", document_date: null,
                memo: "A/P Invoices - VENDA001607", trans_type: 18, base_ref: "626094379", ref1: "", ref2: "",
                debit: "884250", credit: "884250" },
      lines: [
        { line: 0, account: "2110005", account_name: "SUNDRY CREDITOR DOMESTIC", partner: "VENDA001607",
          partner_name: "VAISHNODEVI REFOILS", debit: "0", credit: "884250", memo: "" },
        { line: 1, account: "2140001", account_name: "GOODS RECEIVED BUT NOT INVOICED", partner: "",
          partner_name: "", debit: "884250", credit: "0", memo: "" },
      ],
    });
    renderPage(<SapDocLink company="OIL" kind="bill" docEntry={27400} number="626094379" />);
    await user.click(screen.getByRole("button", { name: "Open A/P Invoice 626094379" }));
    const window = await screen.findByRole("dialog");

    await user.click(await within(window).findByRole("tab", { name: "Relationship Map" }));
    const map = await within(window).findByLabelText("Relationship map");
    expect(within(map).getByText("from Goods Receipt PO 2026096869")).toBeTruthy();
    expect(within(map).getByText("Advance (OMS)")).toBeTruthy();
    expect(within(map).getByText("AP-2026-0021")).toBeTruthy();
    // A debit note has no form here: its arrow opens its journal entry.
    expect(within(map).getByRole("button", { name: "Open the journal entry of A/P Credit Memo 5550001" })).toBeTruthy();

    await user.click(within(window).getByRole("tab", { name: "Journal Entry" }));
    expect(je).toHaveBeenCalledWith("OIL", 239031);
    const lines = await within(window).findByRole("table", { name: "Journal entry 926302500" });
    expect(within(lines).getByText("GOODS RECEIVED BUT NOT INVOICED")).toBeTruthy();
    expect(within(lines).getByText("VAISHNODEVI REFOILS")).toBeTruthy();
  });

  it("shows the vendor's whole ledger with a running balance, and a bill's own ledger", async () => {
    const user = userEvent.setup();
    vi.spyOn(advancePaymentService, "partnerLedger").mockResolvedValue({
      summary: { open_count: 1, open_debit: "0", open_credit: "4635", net_open: "4635", net_open_means: "payable",
                 overdue_count: 1 },
      results: [],
    } as never);
    const full = vi.spyOn(advancePaymentService, "fullLedger").mockResolvedValue({
      company: "BEVERAGES", opening: "0", closing: "-4635", truncated: false,
      rows: [
        { trans_id: 1, line_id: 0, doc_type_code: 18, doc_type: "A/P Invoice", doc_entry: 188, doc_num: "625119145",
          ref: "", posting_date: "2025-11-13", due_date: "2025-11-13", debit: "0", credit: "184209",
          balance: "-184209", memo: "" },
        { trans_id: 2, line_id: 0, doc_type_code: 46, doc_type: "Outgoing Payment", doc_entry: 900, doc_num: "1025000001",
          ref: "", posting_date: "2025-12-01", due_date: null, debit: "179574", credit: "0", balance: "-4635", memo: "" },
      ],
    });
    renderPage(<SapPartnerLink company="BEVERAGES" cardCode="VENDA000948" name="ARNAV TRANSPORT SERVICE" />);
    await user.click(screen.getByRole("button", { name: "Open the ledger of ARNAV TRANSPORT SERVICE" }));
    const window = await screen.findByRole("dialog");
    await user.click(within(window).getByRole("tab", { name: "All Transactions" }));
    const grid = await within(window).findByRole("table", { name: "All transactions" });
    expect(within(grid).getByText("₹1,84,209 Cr")).toBeTruthy();
    expect(within(window).getAllByText("₹4,635 Cr").length).toBeGreaterThan(0); // running and closing
    expect(full).toHaveBeenCalledWith("BEVERAGES", "VENDA000948", "", "");
  });

  it("settles a bill in its own ledger, down to SAP's balance due", async () => {
    const user = userEvent.setup();
    vi.spyOn(advancePaymentService, "billBreakdown").mockResolvedValue(BILL);
    vi.spyOn(advancePaymentService, "billLedger").mockResolvedValue({
      company: "OIL",
      bill: { doc_entry: 27400, doc_num: 626094379, vendor_ref: "INV-77", card_code: "VENDA001607", date: null,
              due_date: null, total: "405000" },
      rows: [
        { kind: "bill", doc_type: "A/P Invoice", doc_type_code: 18, doc_num: "626094379", doc_entry: 27400,
          trans_id: 50, date: "2024-10-01", posted: "2024-10-01", debit: "0", credit: "405000", open: "405000" },
        { kind: "settlement", doc_type: "Outgoing Payment", doc_type_code: 46, doc_num: "1024466623", doc_entry: 197,
          trans_id: 60, date: "2025-02-13", posted: "2024-10-14", debit: "305000", credit: "0", open: "100000" },
      ],
      open: "100000",
      sap_open: "100000",
    });
    renderPage(<SapDocLink company="OIL" kind="bill" docEntry={27400} number="626094379" />);
    await user.click(screen.getByRole("button", { name: "Open A/P Invoice 626094379" }));
    const window = await screen.findByRole("dialog");
    await user.click(await within(window).findByRole("tab", { name: "Bill Ledger" }));
    const grid = await within(window).findByRole("table", { name: "Bill ledger" });
    expect(within(grid).getByText("1024466623")).toBeTruthy();
    expect(within(window).getAllByText("₹1,00,000").length).toBeGreaterThan(0);
  });
});
