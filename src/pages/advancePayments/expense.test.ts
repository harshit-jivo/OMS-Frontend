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
    // Who is paid (2026-10-20): Pay To, then the partner it names — both required.
    { expensePayee: "VENDOR" as const },
    { partner: "VENDA000101", partnerName: "ABC Technologies" },
    // The vendor's bill it pays (2026-10-20).
    { expenseCategory: "SERVICE" as const, expenseBillNumber: "INV-118", expenseBillDate: "2026-10-05" },
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
    // No partner list until Pay To says whose: vendors, or imprest accounts.
    expect([c.expense, c.plainAmount, c.reference, c.partnerSource]).toEqual([true, false, null, null]);
    expect(validate(form, TODAY).missing).toContain("Pay To");
    const vendor = resolveCase(applyChange(form, { expensePayee: "VENDOR" }));
    expect([vendor.partnerSource, vendor.partnerLabel]).toEqual(["SAP_VENDORS", "Vendor"]);
    const imprest = resolveCase(applyChange(form, { expensePayee: "IMPREST" }));
    expect([imprest.partnerSource, imprest.partnerLabel]).toEqual(["SAP_IMPREST", "Imprest Account"]);
  });

  it("needs the partner its Pay To names, and a new Pay To clears it", () => {
    expect(validate(expense({ partner: "", partnerName: "" }), TODAY).missing).toContain("Vendor");
    const switched = applyChange(expense(), { expensePayee: "IMPREST" });
    expect(switched.partner).toBe("");
    expect(validate(switched, TODAY).missing).toContain("Imprest Account");
    expect(toApiRequest(expense()).expense_payee).toBe("VENDOR");
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
    // Paid to an imprest: nothing booked as an A/P invoice.
    const imprest = expense({ expensePayee: "IMPREST", partner: "ORGV000044", partnerName: "Ziyaul" });
    const { missing } = validateExpense(imprest, { atPayment: true });
    expect(missing).toEqual(["Sub Budget", "Month", "G/L account on line 2"]);
    const set = { ...imprest, effectMonth: "10-2026", subBudget: "Accounts" };
    set.expenseLines = [set.expenseLines[0], { ...set.expenseLines[1], glAccount: "5670001" }];
    expect(validateExpense(set, { atPayment: true })).toEqual({ missing: [], problems: [] });
  });

  it("paid to a vendor, the Accounts desk also sets its A/P invoice: branch, and each line's tax code, Variety, State", () => {
    const bill = expense({ effectMonth: "10-2026", subBudget: "Accounts" });
    bill.expenseLines = bill.expenseLines.map((l) => ({ ...l, glAccount: "5670001" }));
    expect(validateExpense(bill, { atPayment: true }).missing).toEqual([
      "Branch",
      "Tax Code on line 1",
      "Variety on line 1",
      "State on line 1",
      "Tax Code on line 2",
      "Variety on line 2",
      "State on line 2",
    ]);
    const ready = {
      ...bill,
      expenseBranch: "2",
      expenseLines: bill.expenseLines.map((l) => ({ ...l, taxCode: "IGST@18", variety: "CANOLA", state: "HR" })),
    };
    expect(validateExpense(ready, { atPayment: true })).toEqual({ missing: [], problems: [] });
    // An Item bill: its GRPO, not the lines.
    const item = applyChange(bill, { expenseCategory: "ITEM", expenseBranch: "2" });
    expect(validateExpense(item, { atPayment: true }).missing).toEqual(["GRPO"]);
    expect(validateExpense({ ...item, expenseGrpoEntry: "27962" }, { atPayment: true }).missing).toEqual([]);
  });

  it("forgets the GRPO when the bill is no longer an Item one", () => {
    const item = expense({ expenseCategory: "ITEM", expenseGrpoEntry: "27962", expenseGrpoNum: "2026106669" });
    expect(item.expenseGrpoEntry).toBe("27962");
    const service = applyChange(item, { expenseCategory: "SERVICE" });
    expect([service.expenseGrpoEntry, service.expenseGrpoNum]).toEqual(["", ""]);
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
      expense_payee: "VENDOR",
      partner_code: "VENDA000101",
      partner_name: "ABC Technologies",
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
        variety: "",
        state: "",
        tax_code: "",
        location: null,
      },
      {
        amount: "3000.50",
        gst_code: "",
        gl_account: "",
        effect_month: "",
        remarks: "Penalty, G/L to confirm",
        tds_override: "",
        variety: "",
        state: "",
        tax_code: "",
        location: null,
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
        "budget_code",
        "effect_month",
        "expense_bill_date",
        "expense_bill_number",
        "expense_bpl_id",
        "expense_bpl_name",
        "expense_category",
        "expense_due_date",
        "expense_grpo_entry",
        "expense_grpo_fields",
        "expense_grpo_num",
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
    expect([back.expensePayee, back.partner, back.payee]).toEqual(["VENDOR", "VENDA000101", "ABC Technologies"]);
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

describe("an Expense paid to a vendor names its bill (2026-10-20)", () => {
  it("needs the bill number and Doc Date — not the category, the Payment desk's; an imprest none of them", () => {
    const missing = validate(expense({ expenseCategory: "", expenseBillNumber: "", expenseBillDate: "" }), TODAY).missing;
    expect(missing).toEqual(expect.arrayContaining(["Bill Number", "Doc Date"]));
    expect(missing).not.toContain("Category");
    expect(validate(expense({ expenseBillDate: "2026-12-01" }), TODAY).problems).toContain(
      "The Doc Date cannot be in the future.",
    );
    const imprest = applyChange(expense(), { expensePayee: "IMPREST" });
    expect([imprest.expenseCategory, imprest.expenseBillNumber, imprest.expenseBillDate]).toEqual(["", "", ""]);
  });

  it("goes to the API and comes back", () => {
    const input = toApiRequest(expense());
    expect(input).toMatchObject({ expense_category: "SERVICE", expense_bill_number: "INV-118", expense_bill_date: "2026-10-05" });
    const back = formFromApi(apiRequest(41, storedInput(input)));
    expect([back.expenseCategory, back.expenseBillNumber, back.expenseBillDate]).toEqual(["SERVICE", "INV-118", "2026-10-05"]);
  });
});
