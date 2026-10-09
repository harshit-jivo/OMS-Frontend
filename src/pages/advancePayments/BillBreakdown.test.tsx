import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService, type SapBillBreakdown } from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";

import { BillBreakdown } from "./BillBreakdown";

/** Bill 624104114 as SAP booked it: rent, CGST + SGST at 9%, TDS 194I at 10%. */
const BILL: SapBillBreakdown = {
  company: "OIL",
  header: {
    doc_entry: 188, doc_num: 624104114, vendor_ref: "7/2024-25", doc_date: "2024-10-01", status: "Open",
    card_code: "VENDA000869", card_name: "GEETA GUPTA",
    payable_account: "2110004", payable_account_name: "SUNDRY CREDITOR SERVICE",
    taxable: "375000", freight: "0", discount: "0", gst: "67500", gross: "442500", tds: "37500",
    rounding: "0", net: "405000", paid: "305000", balance: "100000",
  },
  lines: [{ line: 0, item_code: "", description: "", quantity: "0", taxable: "375000", gst: "67500",
            tax_code: "CG+SG@18", account: "5660002", account_name: "RENT" }],
  gst: [
    { code: "CGST@9", rate: "9", base: "375000", amount: "33750", account: "2131012", account_name: "INPUT CGST @ 9 %" },
    { code: "SGST@9", rate: "9", base: "375000", amount: "33750", account: "2131011", account_name: "INPUT SGST @ 9 %" },
  ],
  tds: [{ code: "94IB", name: "194I TDS ON RENT", rate: "10", taxable: "375000", amount: "37500",
          account: "2133001", account_name: "TDS ON RENT 194I" }],
};

afterEach(() => vi.restoreAllMocks());

function open(container: HTMLElement) {
  const details = container.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

describe("BillBreakdown", () => {
  it("reads nothing from SAP until it is opened", () => {
    const load = vi.spyOn(advancePaymentService, "billBreakdown").mockResolvedValue(BILL);
    renderPage(<BillBreakdown company="OIL" docEntry={188} label="624104114 in SAP" />);
    expect(screen.getByText("624104114 in SAP")).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
  });

  it("shows taxable, GST, TDS, net and every account once opened", async () => {
    const load = vi.spyOn(advancePaymentService, "billBreakdown").mockResolvedValue(BILL);
    const { container } = renderPage(<BillBreakdown company="OIL" docEntry={188} label="624104114 in SAP" />);
    open(container);

    expect(await screen.findByText("5660002 · RENT")).toBeTruthy();
    expect(load).toHaveBeenCalledWith("OIL", 188);
    expect(screen.getByText("₹3,75,000", { selector: "dd *, dd" })).toBeTruthy();
    expect(screen.getByText("₹4,05,000")).toBeTruthy(); // net payable
    expect(screen.getByText("2131012 · INPUT CGST @ 9 %")).toBeTruthy();
    expect(screen.getByText("2133001 · TDS ON RENT 194I")).toBeTruthy();
    expect(screen.getByText("2110004 · SUNDRY CREDITOR SERVICE")).toBeTruthy();
    expect(screen.getByText(/TDS 94IB @ 10%/)).toBeTruthy();
  });
});
