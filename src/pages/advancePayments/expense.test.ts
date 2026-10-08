/**
 * Expense requests: paid straight to expense G/L accounts. The form asks the
 * company, budget head, electricity, an optional vendor, remarks (optional)
 * and the lines — each an amount and its G/L, or, not knowing it, what it is
 * for. Not asked: Payment Against (follows from the G/Ls), who is paid (the
 * vendor, else whoever raises it), ownership, payment date and month (the day
 * it is raised), sub budget. The Payment desk sets the sub budget, month, GST
 * and TDS; never the amounts.
 */
import { describe, expect, it } from "vitest";

import { paidAmount, requestAmount } from "./approvalData";
import { expenseEditToApi, formFromApi, toApiRequest } from "./requestApi";
import {
  EMPTY_FORM,
  NO_TDS,
  applyChange,
  expenseNet,
  expenseTds,
  expenseTotal,
  lineGst,
  lineTaxable,
  newExpenseLine,
  resolveCase,
  validate,
  validateExpense,
  type ExpenseLineForm,
  type RequestForm,
} from "./rules";
import { TEST_TDS_RATES, apiRequest, storedInput } from "./testRequests";

const TODAY = "2026-10-08";
const rateOf = (code: string) => TEST_TDS_RATES[code] ?? null;

const line = (patch: Partial<ExpenseLineForm>): ExpenseLineForm => ({
  ...newExpenseLine(),
  ...patch,
});

function expense(patch: Partial<RequestForm> = {}): RequestForm {
  return [
    { company: "OIL" as const, type: "EXPENSE" as const },
    {
      budget: "Factory",
      budgetName: "Factory",
      isElectricity: true,
      expenseLines: [
        line({ amount: "11800", glAccount: "5680011", glName: "ELECTRICITY EXPENSES" }),
        line({ amount: "3000.50", glUnknown: true, remarks: "Penalty, G/L to confirm" }),
      ],
    },
    patch,
  ].reduce<RequestForm>((f, p) => applyChange(f, p), EMPTY_FORM);
}

describe("an Expense request", () => {
  it("is not asked Payment Against, and starts with one empty line", () => {
    const form = applyChange(applyChange(EMPTY_FORM, { company: "OIL" }), { type: "EXPENSE" });
    // Provisional: the server makes it direct when the G/L accounts are.
    expect(form.paymentAgainst).toBe("INDIRECT_EXPENSE");
    expect([form.effectMonth, form.expenseLines.length]).toEqual(["", 1]);
    const c = resolveCase(form);
    expect([c.expense, c.plainAmount, c.reference, c.partnerSource]).toEqual([
      true,
      false,
      null,
      "SAP_VENDORS",
    ]);
  });

  it("is complete without a payee, ownership, payment date, sub budget, month or remarks", () => {
    expect(validate(expense(), TODAY)).toEqual({ missing: [], problems: [] });
  });

  it("needs each line's amount, and its G/L — or, not knowing it, what it is for", () => {
    const { missing, problems } = validate(
      expense({
        expenseLines: [
          line({ amount: "0", glAccount: "5670001" }),
          line({ amount: "" }),
          line({ amount: "5", glUnknown: true }),
        ],
      }),
      TODAY,
    );
    expect(problems).toContain("Line 1: enter an amount above zero.");
    expect(missing).toEqual([
      "Amount on line 2",
      "G/L account on line 2",
      "Remarks on line 3 (what it is for)",
    ]);
  });

  it("at Payment needs every line's G/L, a month and a sub budget", () => {
    const { missing } = validateExpense(expense(), { atPayment: true });
    expect(missing).toEqual(["Sub Budget", "Month", "G/L account on line 2"]);
    const set = expense({ effectMonth: "10-2026", subBudget: "Accounts" });
    set.expenseLines[1] = { ...set.expenseLines[1], glAccount: "5670001" };
    expect(validateExpense(set, { atPayment: true })).toEqual({ missing: [], problems: [] });
  });

  it("is worth its lines' amounts; the desk's GST backs the taxable amount out", () => {
    const form = expense();
    expect(expenseTotal(form.expenseLines)).toBe(14800.5);
    expect(requestAmount(form)).toBe(14800.5);
    const taxed = line({ amount: "11800", gstCode: "CGST_SGST_18" });
    expect([lineTaxable(taxed), lineGst(taxed)]).toEqual([10000, 1800]);
    expect(lineTaxable(line({ amount: "1049.99", gstCode: "IGST_5" }))).toBe(999.99);
  });

  it("deducts TDS on the taxable amount, to the rupee — the request's code, a line's own, or none", () => {
    const form = expense({
      expenseTdsCode: "C194-2",
      expenseLines: [
        line({ amount: "11800", gstCode: "CGST_SGST_18", glAccount: "5680011" }),
        line({ amount: "2500", glAccount: "5670001", tdsOverride: "J194-10" }),
        line({ amount: "700", glAccount: "5670001", tdsOverride: NO_TDS }),
      ],
    });
    // 200 (2% of the taxable 10,000, not of 11,800) + 250 + 0
    expect(expenseTds(form, rateOf)).toBe(450);
    expect(expenseNet(form, rateOf)).toBe(15000 - 450);
  });

  it("goes to the API without what is not asked; a line without a G/L sends what it is for", () => {
    const input = toApiRequest(expense({ remarks: "" }));
    expect(input).toMatchObject({
      request_type: "EXPENSE",
      partner_code: "",
      partner_name: "",
      amount: "14800.5",
      budget_code: "Factory",
      sub_budget_code: "",
      purpose_code: "",
      effect_month: "",
      owner_label: "",
      payment_date: null,
      remarks: "",
      is_electricity: true,
      documents: [],
    });
    expect(input.expense_lines).toEqual([
      {
        amount: "11800",
        gst_code: "",
        gl_account: "5680011",
        effect_month: "",
        remarks: "",
        tds_override: "",
      },
      {
        amount: "3000.50",
        gst_code: "",
        gl_account: "",
        effect_month: "",
        remarks: "Penalty, G/L to confirm",
        tds_override: "",
      },
    ]);
  });

  it("names its vendor as who is paid", () => {
    const form = expense({ partner: "VENDA000101", partnerName: "ABC Technologies" });
    expect(toApiRequest(form)).toMatchObject({
      partner_code: "VENDA000101",
      partner_name: "ABC Technologies",
    });
  });

  it("sends the Payment desk only what it may change", () => {
    const edit = expenseEditToApi(
      expense({ subBudget: "IT", effectMonth: "09-2026", expenseTdsCode: "C194-2" }),
    );
    expect(Object.keys(edit).sort()).toEqual(
      [
        "effect_month",
        "expense_lines",
        "expense_tds_code",
        "is_electricity",
        "sub_budget_code",
      ].sort(),
    );
    expect(edit).toMatchObject({
      sub_budget_code: "IT",
      effect_month: "09-2026",
      expense_tds_code: "C194-2",
    });
  });

  it("comes back from the API as it was raised, with the server's TDS", () => {
    const form = expense({
      expenseTdsCode: "C194-2",
      effectMonth: "10-2026",
      subBudget: "Accounts",
    });
    const back = formFromApi(
      apiRequest(40, {
        ...storedInput(toApiRequest(form)),
        sub_budget_name: "Accounts",
        budget_name: "Factory",
      }),
    );
    expect(back.payee).toBe("Tester"); // no vendor: whoever raised it
    expect([back.subBudget, back.effectMonth, back.isElectricity, back.expenseTdsCode]).toEqual([
      "Accounts",
      "10-2026",
      true,
      "C194-2",
    ]);
    expect(
      back.expenseLines.map((l) => [l.amount, l.glUnknown, l.glAccount, l.remarks, l.tdsAmount]),
    ).toEqual([
      ["11800", false, "5680011", "", "236"],
      ["3000.5", true, "", "Penalty, G/L to confirm", "60"],
    ]);
    // Read back, the payment pays the amounts less the server's TDS.
    expect(paidAmount(back)).toBe(14800.5 - 296);
    expect(validate(back, TODAY)).toEqual({ missing: [], problems: [] });
  });
});
