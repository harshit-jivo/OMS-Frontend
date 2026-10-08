/**
 * Expense requests: paid straight to expense G/L accounts, with no SAP
 * partner required. Direct or indirect (one kind per request), routed by
 * budget head (no Payment Purpose). Each line: a taxable amount and its GST
 * (for the record) make the invoice value; the G/L is optional (remarks then
 * required); the month and the TDS are the Payment desk's.
 */
import { describe, expect, it } from "vitest";

import { paidAmount, payeeOf, requestAmount } from "./approvalData";
import { formFromApi, toApiRequest } from "./requestApi";
import {
  EMPTY_FORM,
  NO_TDS,
  applyChange,
  expenseNet,
  expenseTds,
  expenseTotal,
  lineGst,
  lineInvoice,
  newExpenseLine,
  resolveCase,
  validate,
  validateExpense,
  type ExpenseLineForm,
  type RequestForm,
} from "./rules";
import { TEST_TDS_RATES, apiRequest, storedInput } from "./testRequests";

const TODAY = "2026-10-07";
const rateOf = (code: string) => TEST_TDS_RATES[code] ?? null;

const line = (patch: Partial<ExpenseLineForm>): ExpenseLineForm => ({
  ...newExpenseLine(),
  ...patch,
});

function expense(patch: Partial<RequestForm> = {}): RequestForm {
  return [
    { company: "OIL" as const, type: "EXPENSE" as const },
    { paymentAgainst: "INDIRECT_EXPENSE" as const },
    {
      payee: "PSPCL",
      budget: "Factory",
      budgetName: "Factory",
      subBudget: "Accounts",
      subBudgetName: "Accounts",
      isElectricity: true,
      expenseLines: [
        line({
          taxableAmount: "10000",
          gstCode: "CGST_SGST_18",
          glAccount: "5680011",
          glName: "ELECTRICITY EXPENSES",
        }),
        line({ taxableAmount: "3000.50", remarks: "Penalty, G/L to confirm" }),
      ],
      ownership: "Preshit Singh (JWPL0030)",
      paymentDate: "2026-10-08",
      remarks: "Factory power bill",
    },
    patch,
  ].reduce<RequestForm>((f, p) => applyChange(f, p), EMPTY_FORM);
}

describe("an Expense request", () => {
  it("is direct or indirect — the requester picks — and starts with one empty line and no month", () => {
    const form = applyChange(applyChange(EMPTY_FORM, { company: "OIL" }), { type: "EXPENSE" });
    expect(form.paymentAgainst).toBe("");
    expect(resolveCase(form).paymentAgainstOptions.map((o) => o.value)).toEqual([
      "DIRECT_EXPENSE",
      "INDIRECT_EXPENSE",
    ]);
    const indirect = applyChange(form, { paymentAgainst: "INDIRECT_EXPENSE" });
    expect([indirect.effectMonth, indirect.expenseLines.length]).toEqual(["", 1]);
    const c = resolveCase(indirect);
    expect([c.expense, c.plainAmount, c.reference, c.partnerSource]).toEqual([
      true,
      false,
      null,
      "SAP_VENDORS",
    ]);
  });

  it("drops the lines' G/L accounts when it changes between direct and indirect", () => {
    const direct = applyChange(expense(), { paymentAgainst: "DIRECT_EXPENSE" });
    expect(direct.expenseLines.map((l) => l.glAccount)).toEqual(["", ""]);
    expect(direct.expenseLines[0].taxableAmount).toBe("10000");
  });

  it("is complete without a partner, a purpose or a month", () => {
    expect(validate(expense(), TODAY)).toEqual({ missing: [], problems: [] });
  });

  it("asks for who is paid, sub budget and lines — not a partner, purpose or month", () => {
    const { missing } = validate(expense({ payee: " ", subBudget: "", expenseLines: [] }), TODAY);
    expect(missing).toEqual(expect.arrayContaining(["Pay To", "Sub Budget", "Expense lines"]));
    expect(missing).not.toContain("Payment Purpose");
    expect(missing).not.toContain("Vendor");
    expect(missing).not.toContain("Month");
  });

  it("needs each line's taxable amount, and remarks only where it has no G/L", () => {
    const { missing, problems } = validate(
      expense({
        expenseLines: [
          line({ taxableAmount: "0", glAccount: "5670001" }),
          line({ taxableAmount: "" }),
          line({ taxableAmount: "5", glAccount: "5670001" }),
        ],
      }),
      TODAY,
    );
    expect(problems).toContain("Line 1: enter a taxable amount above zero.");
    expect(missing).toEqual(["Taxable amount on line 2", "Remarks on line 2 (it has no G/L)"]);
  });

  it("at Payment needs every line's G/L and a month", () => {
    const { missing } = validateExpense(expense(), { atPayment: true });
    expect(missing).toEqual(["Month", "G/L account on line 2"]);
    const set = expense({ effectMonth: "10-2026" });
    set.expenseLines[1] = { ...set.expenseLines[1], glAccount: "5670001" };
    expect(validateExpense(set, { atPayment: true })).toEqual({ missing: [], problems: [] });
  });

  it("is worth its lines' invoice values: taxable + GST", () => {
    const form = expense();
    expect([lineGst(form.expenseLines[0]), lineInvoice(form.expenseLines[0])]).toEqual([
      1800, 11800,
    ]);
    expect(lineGst(line({ taxableAmount: "999.99", gstCode: "IGST_5" }))).toBe(50);
    expect(expenseTotal(form.expenseLines)).toBe(14800.5);
    expect(requestAmount(form)).toBe(14800.5);
    expect(payeeOf(form)).toBe("PSPCL");
  });

  it("deducts TDS on the taxable amount, to the rupee — the request's code, a line's own, or none", () => {
    const form = expense({
      expenseTdsCode: "C194-2",
      expenseLines: [
        line({ taxableAmount: "10000", gstCode: "CGST_SGST_18", glAccount: "5680011" }),
        line({ taxableAmount: "2500", glAccount: "5670001", tdsOverride: "J194-10" }),
        line({ taxableAmount: "700", glAccount: "5670001", tdsOverride: NO_TDS }),
        line({ taxableAmount: "1234.50", glAccount: "5670001" }),
      ],
    });
    // 200 (2% of 10000, not of 11800) + 250 + 0 + 25 (24.69 to the rupee)
    expect(expenseTds(form, rateOf)).toBe(475);
    expect(expenseNet(form, rateOf)).toBe(16234.5 - 475);
  });

  it("drops its fields when the type changes, and a company change drops the budget and sub budget", () => {
    const vendor = applyChange(expense({ expenseTdsCode: "C194-2" }), { type: "VENDOR" });
    expect([
      vendor.payee,
      vendor.subBudget,
      vendor.expenseTdsCode,
      vendor.isElectricity,
      vendor.expenseLines,
    ]).toEqual(["", "", "", false, []]);
    const bev = applyChange(expense(), { company: "BEVERAGES" });
    expect([bev.budget, bev.subBudget]).toEqual(["", ""]);
    expect(bev.expenseLines).toHaveLength(2);
  });

  it("goes to the API as its lines, with the payee as the partner name", () => {
    const input = toApiRequest(expense());
    expect(input).toMatchObject({
      request_type: "EXPENSE",
      payment_against: "INDIRECT_EXPENSE",
      partner_code: "",
      partner_name: "PSPCL",
      amount: "14800.5",
      budget_code: "Factory",
      sub_budget_code: "Accounts",
      purpose_code: "",
      effect_month: "",
      is_electricity: true,
      department_head_code: null,
      documents: [],
    });
    expect(input.expense_lines).toEqual([
      {
        taxable_amount: "10000",
        gst_code: "CGST_SGST_18",
        gl_account: "5680011",
        effect_month: "",
        remarks: "",
        tds_override: "",
      },
      {
        taxable_amount: "3000.50",
        gst_code: "",
        gl_account: "",
        effect_month: "",
        remarks: "Penalty, G/L to confirm",
        tds_override: "",
      },
    ]);
  });

  it("comes back from the API as it was raised, with the server's TDS", () => {
    const form = expense({ expenseTdsCode: "C194-2", effectMonth: "10-2026" });
    const back = formFromApi(
      apiRequest(40, {
        ...storedInput(toApiRequest(form)),
        sub_budget_name: "Accounts",
        budget_name: "Factory",
      }),
    );
    expect(back.payee).toBe("PSPCL");
    expect([back.partner, back.partnerName, back.amount]).toEqual(["", "", ""]);
    expect([back.subBudget, back.effectMonth, back.isElectricity, back.expenseTdsCode]).toEqual([
      "Accounts",
      "10-2026",
      true,
      "C194-2",
    ]);
    expect(
      back.expenseLines.map((l) => [
        l.taxableAmount,
        l.gstCode,
        l.glAccount,
        l.remarks,
        l.tdsAmount,
      ]),
    ).toEqual([
      ["10000", "CGST_SGST_18", "5680011", "", "200"],
      ["3000.5", "", "", "Penalty, G/L to confirm", "60"],
    ]);
    // Read back, the payment pays the invoice values less the server's TDS.
    expect(paidAmount(back)).toBe(14800.5 - 260);
    expect(validate(back, TODAY)).toEqual({ missing: [], problems: [] });
  });
});
