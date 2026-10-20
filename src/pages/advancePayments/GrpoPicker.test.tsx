/**
 * An Item bill's GRPO (2026-10-20): the one whose vendor ref is the bill
 * number is picked by itself; with none matching, the desk picks one of the
 * vendor's open GRPOs by hand.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService, type SapOpenGrpo } from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";
import { GrpoPicker } from "./GrpoPicker";
import { EMPTY_FORM, applyChange, newExpenseLine, type RequestForm } from "./rules";

function grpo(docNum: number, vendorRef: string, matches: boolean, amount = "10800"): SapOpenGrpo {
  return {
    doc_entry: docNum - 2026100000, doc_num: docNum, doc_date: "2026-10-16", vendor_ref: vendorRef,
    doc_total: amount, open_amount: amount, bpl_id: 2, bpl_name: "FACTORY", attachment_entry: null,
    matches, category: "ITEM",
    lines: [{ line_num: 0, item_code: "PM0001", description: "Carton", open_qty: "100", price: "108",
              open_amount: amount, tax_code: "IGST@18", warehouse: "BH-PM" }],
  };
}

function itemBill(patch: Partial<RequestForm> = {}): RequestForm {
  return [
    { company: "OIL" as const, type: "EXPENSE" as const },
    { expensePayee: "VENDOR" as const },
    { partner: "VENDA000636", partnerName: "Box Makers", payee: "Box Makers" },
    { expenseCategory: "ITEM" as const, expenseBillNumber: "13468", expenseBillDate: "2026-10-15" },
    { expenseLines: [{ ...newExpenseLine(), amount: "10800" }] },
    patch,
  ].reduce<RequestForm>((f, p) => applyChange(f, p), EMPTY_FORM);
}

afterEach(() => vi.restoreAllMocks());

describe("an Item bill's GRPO", () => {
  it("picks the GRPO whose vendor ref is the bill number, and its branch", async () => {
    vi.spyOn(advancePaymentService, "openGrpos").mockResolvedValue([
      grpo(2026106669, "13468", true),
      grpo(2026106001, "99", false),
    ]);
    const onChange = vi.fn();
    renderPage(<GrpoPicker company="OIL" form={itemBill()} onChange={onChange} />);
    expect(await screen.findByText("Bill number matches")).toBeTruthy();
    expect(advancePaymentService.openGrpos).toHaveBeenCalledWith("OIL", "VENDA000636", "13468");
    expect(onChange).toHaveBeenCalledWith({
      expenseGrpoEntry: "6669", expenseGrpoNum: "2026106669", expenseBranch: "2", expenseBranchName: "FACTORY",
    });
    // Only the matching GRPO is offered.
    expect(screen.queryByLabelText("GRPO 2026106001")).toBeNull();
  });

  it("with none matching the bill number, offers every open GRPO to pick by hand", async () => {
    vi.spyOn(advancePaymentService, "openGrpos").mockResolvedValue([
      grpo(2026106669, "13-468/A", false),
      grpo(2026106001, "99", false, "500"),
    ]);
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderPage(<GrpoPicker company="OIL" form={itemBill({ expenseBranch: "1" })} onChange={onChange} />);
    expect(await screen.findByText(/^No GRPO matches the bill number/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText("GRPO 2026106669"));
    // The branch already chosen stays.
    expect(onChange).toHaveBeenCalledWith({ expenseGrpoEntry: "6669", expenseGrpoNum: "2026106669" });
  });

  it("shows the chosen GRPO's lines, and says when its amount differs from the request's", async () => {
    vi.spyOn(advancePaymentService, "openGrpos").mockResolvedValue([grpo(2026106001, "13468", true, "500")]);
    renderPage(
      <GrpoPicker company="OIL" form={itemBill({ expenseGrpoEntry: "6001", expenseGrpoNum: "2026106001" })} onChange={vi.fn()} />,
    );
    expect(await screen.findByRole("table", { name: "GRPO 2026106001 lines" })).toBeTruthy();
    expect(screen.getByText("Carton")).toBeTruthy();
    expect(screen.getByText(/^The amounts differ/)).toBeTruthy();
  });

  it("says so when the vendor has no open GRPO", async () => {
    vi.spyOn(advancePaymentService, "openGrpos").mockResolvedValue([]);
    renderPage(<GrpoPicker company="OIL" form={itemBill()} onChange={vi.fn()} />);
    expect(await screen.findByText(/^No open GRPO:/)).toBeTruthy();
  });
});
