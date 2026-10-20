/**
 * The Payment desk's Expense editor (2026-10-20): the budget head is the
 * desk's to change; paid to a vendor, so is the bill — its category, number
 * and Doc Date. No expense type (the G/L decides it) and no posting date (the
 * day it is posted to SAP).
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";
import { ExpenseEditor } from "./ExpenseEditor";
import { EMPTY_FORM, applyChange, type RequestForm } from "./rules";

const TDS = { codes: [], rateOf: () => null, loading: false };

function vendorExpense(patch: Partial<RequestForm> = {}): RequestForm {
  return [
    { company: "OIL" as const, type: "EXPENSE" as const },
    { expensePayee: "VENDOR" as const },
    { partner: "VENDA000101", partnerName: "ABC Technologies", payee: "ABC Technologies" },
    { budget: "Factory", budgetName: "Factory", expenseCategory: "SERVICE" as const,
      expenseBillNumber: "INV-118", expenseBillDate: "2026-09-01" },
    patch,
  ].reduce<RequestForm>((f, p) => applyChange(f, p), EMPTY_FORM);
}

afterEach(() => vi.restoreAllMocks());

describe("the Payment desk's Expense editor", () => {
  it("changes the budget head and the bill: category, number, Doc Date", async () => {
    vi.spyOn(advancePaymentService, "budgets").mockResolvedValue([]);
    vi.spyOn(advancePaymentService, "expenseAccounts").mockResolvedValue([]);
    vi.spyOn(advancePaymentService, "expenseMonths").mockResolvedValue({ company: "OIL", months: [], variety: "" });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderPage(<ExpenseEditor form={vendorExpense()} onChange={onChange} tds={TDS} />);

    expect(screen.getByLabelText(/^Department/)).toBeTruthy();
    const category = screen.getByLabelText(/^Category/) as HTMLSelectElement;
    expect(category.value).toBe("SERVICE");
    expect((screen.getByLabelText(/^Bill Number/) as HTMLInputElement).value).toBe("INV-118");
    expect((screen.getByLabelText(/^Doc Date/) as HTMLInputElement).value).toBe("2026-09-01");
    expect(screen.queryByLabelText(/^Expense Type/)).toBeNull();
    expect(screen.queryByLabelText(/^Posting Date/)).toBeNull();

    await user.selectOptions(category, "ITEM");
    expect((onChange.mock.calls.at(-1)![0] as RequestForm).expenseCategory).toBe("ITEM");
  });

  it("an imprest has no bill to set", async () => {
    vi.spyOn(advancePaymentService, "budgets").mockResolvedValue([]);
    vi.spyOn(advancePaymentService, "expenseAccounts").mockResolvedValue([]);
    vi.spyOn(advancePaymentService, "expenseMonths").mockResolvedValue({ company: "OIL", months: [], variety: "" });
    const imprest = vendorExpense({ expensePayee: "IMPREST" });
    renderPage(<ExpenseEditor form={imprest} onChange={vi.fn()} tds={TDS} />);
    expect(screen.queryByLabelText(/^Category/)).toBeNull();
    expect(screen.queryByLabelText(/^Bill Number/)).toBeNull();
  });
});
