import { describe, expect, it } from "vitest";

import { VENDOR_BILLS, VENDOR_OTHER_DOCUMENTS, VENDOR_POS } from "./constants";
import {
  EMPTY_FORM,
  allocationRows,
  allocationTotals,
  applyChange,
  calculateEmi,
  calculatePayment,
  changeAllocation,
  expectedPeriodError,
  formatINR,
  resolveCase,
  validate,
  type RequestForm,
} from "./rules";

/** Build a form by applying answers in order, the way a user would. */
function answer(...patches: Partial<RequestForm>[]): RequestForm {
  return patches.reduce<RequestForm>((form, patch) => applyChange(form, patch), EMPTY_FORM);
}

const partnerNames = (form: RequestForm) => resolveCase(form).partners.map((p) => p.label);
const docNumbers = (form: RequestForm) => resolveCase(form).documents.map((d) => d.number);

const BILL_10256 = VENDOR_BILLS.find((b) => b.number === "AP-INV-10256")!;

/** ABC Technologies, Against Bill, with both of ABC's bills ticked. */
const abcBothBills = () =>
  answer(
    { company: "OIL", type: "VENDOR" },
    { paymentAgainst: "AGAINST_BILL" },
    { partner: "V-1001" },
    { references: ["B-1", "B-2"] },
  );

describe("mock data", () => {
  it("keeps every document's open amount equal to original minus paid", () => {
    for (const doc of [...VENDOR_BILLS, ...VENDOR_POS, ...VENDOR_OTHER_DOCUMENTS]) {
      expect(doc.open, doc.number).toBe(doc.original - doc.paid);
    }
  });
});

describe("the case table", () => {
  it("offers each type its own Payment Against answers", () => {
    const offered = (type: RequestForm["type"]) =>
      resolveCase(answer({ type })).paymentAgainstOptions.map((o) => o.value);
    expect(offered("VENDOR")).toEqual(["ADVANCE", "AGAINST_BILL", "AGAINST_PO", "ALL", "OTHER"]);
    // No Against Bill for an employee advance.
    expect(offered("EMPLOYEE_ADVANCE")).toEqual(["ADVANCE", "OTHER"]);
    expect(offered("EMPLOYEE_IMPREST")).toEqual(["ADVANCE", "AGAINST_BILL", "OTHER"]);
  });

  it("Vendor + Against Bill pays against vendor bills", () => {
    const c = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_BILL" }));
    expect(c.reference).toBe("VENDOR_BILL");
    expect(c.plainAmount).toBe(false);
    expect(c.expectedDate).toBe(false);
    expect(c.repayment).toBe(false);
  });

  it("Vendor + Advance is a plain amount, with nothing further to ask", () => {
    const c = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: "ADVANCE" }));
    expect(c.decided).toBe(true);
    expect(c.reference).toBeNull();
    expect(c.expectedDate).toBe(false);
    expect(c.plainAmount).toBe(true);
  });

  it("Vendor + Against PO pays against POs and asks an Expected Date", () => {
    const c = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_PO" }));
    expect(c.reference).toBe("VENDOR_PO");
    expect(c.expectedDate).toBe(true);
    expect(c.plainAmount).toBe(false);
  });

  it("Vendor + Other is a plain amount with no documents", () => {
    const c = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: "OTHER" }));
    expect(c.reference).toBeNull();
    expect(c.expectedDate).toBe(false);
    expect(c.plainAmount).toBe(true);
  });

  it("Employee Advance + Advance asks a return method and the expected period", () => {
    const c = resolveCase(answer({ type: "EMPLOYEE_ADVANCE" }, { paymentAgainst: "ADVANCE" }));
    expect(c.repayment).toBe(true);
    expect(c.plainAmount).toBe(true);
    expect(c.expectedBillDate).toBe(false);
    expect(c.partnerLabel).toBe("Employee");
  });

  it("asks installments only once EMI is the return method", () => {
    const advance = answer({ type: "EMPLOYEE_ADVANCE" }, { paymentAgainst: "ADVANCE" });
    expect(resolveCase(advance).installments).toBe(false);
    expect(resolveCase(applyChange(advance, { returnMethod: "ONE_TIME" })).installments).toBe(false);
    expect(resolveCase(applyChange(advance, { returnMethod: "CUSTOM" })).installments).toBe(false);
    expect(resolveCase(applyChange(advance, { returnMethod: "EMI" })).installments).toBe(true);
  });

  it("Employee Advance will not hold Against Bill", () => {
    const form = answer({ type: "EMPLOYEE_ADVANCE" }, { paymentAgainst: "AGAINST_BILL" });
    expect(form.paymentAgainst).toBe("");
    expect(resolveCase(form).reference).toBeNull();
  });

  it("Vendor + All pays against the other open documents", () => {
    const c = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: "ALL" }));
    expect(c.reference).toBe("VENDOR_OTHER");
    expect(c.expectedDate).toBe(false);
    expect(c.plainAmount).toBe(false);
  });

  it("Employee Advance + Other is a plain amount and nothing else", () => {
    const c = resolveCase(answer({ type: "EMPLOYEE_ADVANCE" }, { paymentAgainst: "OTHER" }));
    expect(c.plainAmount).toBe(true);
    expect(c.reference).toBeNull();
    expect(c.repayment).toBe(false);
    expect(c.expectedBillDate).toBe(false);
  });

  it("Employee Imprest asks the expected bill date in every case, and nothing else", () => {
    for (const paymentAgainst of ["ADVANCE", "AGAINST_BILL", "OTHER"] as const) {
      const c = resolveCase(answer({ type: "EMPLOYEE_IMPREST" }, { paymentAgainst }));
      expect(c.expectedBillDate, paymentAgainst).toBe(true);
      expect(c.reference, paymentAgainst).toBeNull();
      expect(c.repayment, paymentAgainst).toBe(false);
      expect(c.expectedDate, paymentAgainst).toBe(false);
      expect(c.plainAmount, paymentAgainst).toBe(true);
    }
  });
});

describe("partner and document filtering", () => {
  it("Vendor + Against Bill offers only vendors with open bills", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_BILL" });
    expect(partnerNames(form)).toEqual(["ABC Technologies", "XYZ Traders", "PQR Suppliers"]);
  });

  it("Vendor + Against PO offers only vendors with open POs", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_PO" });
    expect(partnerNames(form)).toEqual(["ABC Technologies", "XYZ Traders", "Metro Print & Labels"]);
  });

  it("a plain-amount vendor case offers every vendor", () => {
    expect(partnerNames(answer({ type: "VENDOR" }, { paymentAgainst: "OTHER" }))).toHaveLength(6);
  });

  it("Vendor + All offers only vendors with other open documents", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "ALL" });
    expect(partnerNames(form)).toEqual([
      "ABC Technologies",
      "XYZ Traders",
      "Shree Packaging Industries",
      "Gupta Transport Carriers",
    ]);
  });

  it("shows only the selected partner's bills and POs", () => {
    const bills = answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_BILL" });
    expect(docNumbers(applyChange(bills, { partner: "V-1001" }))).toEqual([
      "AP-INV-10256",
      "AP-INV-10271",
    ]);
    const pos = answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_PO" });
    expect(docNumbers(applyChange(pos, { partner: "V-1002" }))).toEqual(["PO-4512", "PO-4519"]);
    const all = answer({ type: "VENDOR" }, { paymentAgainst: "ALL" });
    expect(docNumbers(applyChange(all, { partner: "V-1006" }))).toEqual(["WO-3107", "JV-5534"]);
  });

  it("never lists a bill or a PO under All", () => {
    // ABC has two bills, a PO and a GRN — All shows the GRN only.
    const all = answer({ type: "VENDOR" }, { paymentAgainst: "ALL" }, { partner: "V-1001" });
    expect(docNumbers(all)).toEqual(["GRN-2201"]);
    const numbers = VENDOR_OTHER_DOCUMENTS.map((d) => d.number).join(" ");
    expect(numbers).not.toMatch(/AP-INV|PO-/);
  });

  it("names each document's kind under All", () => {
    for (const doc of VENDOR_OTHER_DOCUMENTS) expect(doc.docType, doc.number).toBeTruthy();
  });

  it("will not hold a partner the case does not offer", () => {
    const form = answer(
      { type: "VENDOR" },
      { paymentAgainst: "AGAINST_BILL" },
      { partner: "V-1005" }, // Shree Packaging — no open bills
    );
    expect(form.partner).toBe("");
  });
});

describe("selecting several documents", () => {
  it("gives every ticked document its own empty payment line", () => {
    const form = abcBothBills();
    expect(form.references).toEqual(["B-1", "B-2"]);
    expect(Object.keys(form.allocations)).toEqual(["B-1", "B-2"]);
    expect(form.allocations["B-1"]).toEqual({ mode: "FIXED", amount: "", percentage: "" });
  });

  it("keeps a line's entry when another document is ticked or unticked", () => {
    let form = answer(
      { type: "VENDOR" },
      { paymentAgainst: "AGAINST_BILL" },
      { partner: "V-1001" },
      { references: ["B-1"] },
    );
    form = changeAllocation(form, "B-1", { amount: "50000" });
    form = applyChange(form, { references: ["B-1", "B-2"] });
    expect(form.allocations["B-1"].amount).toBe("50000");

    form = applyChange(form, { references: ["B-1"] });
    expect(Object.keys(form.allocations)).toEqual(["B-1"]);
    expect(form.allocations["B-1"].amount).toBe("50000");
  });

  it("refuses a document that belongs to another partner", () => {
    const form = applyChange(abcBothBills(), { references: ["B-1", "B-3"] }); // B-3 is XYZ's
    expect(form.references).toEqual(["B-1"]);
  });
});

describe("the payment calculation", () => {
  it("accepts a fixed amount within the open amount", () => {
    expect(calculatePayment(BILL_10256, "FIXED", "50000", "")).toEqual({
      payment: 50000,
      error: null,
    });
  });

  it("accepts exactly the open amount", () => {
    expect(calculatePayment(BILL_10256, "FIXED", "150000", "").payment).toBe(150000);
  });

  it("rejects a fixed amount above the open amount", () => {
    const calc = calculatePayment(BILL_10256, "FIXED", "180000", "");
    expect(calc.payment).toBeNull();
    expect(calc.error).toBe(`Cannot exceed the open amount of ${formatINR(150000)}.`);
  });

  it("rejects zero and negative amounts", () => {
    expect(calculatePayment(BILL_10256, "FIXED", "0", "").error).toMatch(/above zero/);
    expect(calculatePayment(BILL_10256, "FIXED", "-5", "").error).toMatch(/above zero/);
  });

  it("calculates a percentage from the OPEN amount — 65% of ₹1,50,000 is ₹97,500", () => {
    expect(calculatePayment(BILL_10256, "PERCENT", "", "65").payment).toBe(97500);
  });

  it("never calculates from the original bill amount", () => {
    // 50% of the ₹2,50,000 invoice would be ₹1,25,000; of what is open, ₹75,000.
    expect(calculatePayment(BILL_10256, "PERCENT", "", "50").payment).toBe(75000);
  });

  it("gives the whole open amount at 100%", () => {
    expect(calculatePayment(BILL_10256, "PERCENT", "", "100").payment).toBe(BILL_10256.open);
  });

  it("rounds a fractional percentage to the paisa", () => {
    const jv = VENDOR_OTHER_DOCUMENTS.find((d) => d.number === "JV-5534")!; // open 8,200
    expect(calculatePayment(jv, "PERCENT", "", "33.33").payment).toBe(2733.06);
  });

  it("calculates a part-paid contract from its OPEN amount — 50% of ₹50,000 is ₹25,000", () => {
    const contract = VENDOR_OTHER_DOCUMENTS.find((d) => d.number === "CT-0412")!;
    expect(contract.open).toBe(50000); // ₹2,00,000 less ₹1,50,000 already paid
    expect(calculatePayment(contract, "PERCENT", "", "50").payment).toBe(25000);
    expect(calculatePayment(contract, "FIXED", "60000", "").error).toMatch(/Cannot exceed/);
  });

  it("rejects a percentage outside (0, 100]", () => {
    expect(calculatePayment(BILL_10256, "PERCENT", "", "0").error).toMatch(/up to 100/);
    expect(calculatePayment(BILL_10256, "PERCENT", "", "120").error).toMatch(/up to 100/);
  });

  it("is silent while nothing is entered", () => {
    expect(calculatePayment(BILL_10256, "FIXED", "", "")).toEqual({ payment: null, error: null });
    expect(calculatePayment(BILL_10256, "PERCENT", "", "")).toEqual({ payment: null, error: null });
  });
});

describe("payment lines and the total", () => {
  it("totals every line — 65% of ₹1,50,000 plus a fixed ₹40,000 is ₹1,37,500", () => {
    let form = abcBothBills();
    form = changeAllocation(form, "B-1", { mode: "PERCENT", percentage: "65" });
    form = changeAllocation(form, "B-2", { amount: "40000" });

    const rows = allocationRows(form);
    expect(rows.map((r) => r.calc.payment)).toEqual([97500, 40000]);
    expect(allocationTotals(rows)).toEqual({ open: 234000, payment: 137500, complete: true });
  });

  it("reports an incomplete total while any line is blank or invalid", () => {
    let form = changeAllocation(abcBothBills(), "B-1", { amount: "10000" });
    expect(allocationTotals(allocationRows(form))).toMatchObject({ payment: 10000, complete: false });

    form = changeAllocation(form, "B-2", { amount: "999999" }); // over B-2's ₹84,000
    expect(allocationTotals(allocationRows(form))).toMatchObject({ payment: 10000, complete: false });
  });

  it("adds paise exactly, with no floating-point drift", () => {
    let form = abcBothBills();
    form = changeAllocation(form, "B-1", { amount: "0.1" });
    form = changeAllocation(form, "B-2", { amount: "0.2" });
    expect(allocationTotals(allocationRows(form)).payment).toBe(0.3);
  });

  it("a mode switch clears only that line", () => {
    let form = abcBothBills();
    form = changeAllocation(form, "B-1", { amount: "50000" });
    form = changeAllocation(form, "B-2", { amount: "20000" });
    form = changeAllocation(form, "B-1", { mode: "PERCENT" });

    expect(form.allocations["B-1"]).toEqual({ mode: "PERCENT", amount: "", percentage: "" });
    expect(form.allocations["B-2"].amount).toBe("20000");
  });

  it("a quick percentage that also switches the mode lands, rather than being wiped", () => {
    const form = changeAllocation(abcBothBills(), "B-1", { mode: "PERCENT", percentage: "50" });
    expect(form.allocations["B-1"]).toEqual({ mode: "PERCENT", amount: "", percentage: "50" });
  });

  it("ignores an edit to a line that does not exist", () => {
    const form = abcBothBills();
    expect(changeAllocation(form, "B-9", { amount: "1" })).toBe(form);
  });
});

describe("clearing dependent fields", () => {
  const billsFilled = () => changeAllocation(abcBothBills(), "B-1", { amount: "50000" });

  it("a new Type clears everything below it", () => {
    const form = applyChange(billsFilled(), { type: "EMPLOYEE_ADVANCE" });
    expect(form).toMatchObject({
      company: "OIL", // above Type — kept
      paymentAgainst: "",
      partner: "",
      references: [],
      allocations: {},
      amount: "",
      expectedDate: "",
    });
  });

  it("a new Payment Against clears the documents and their lines", () => {
    const form = applyChange(billsFilled(), { paymentAgainst: "OTHER" });
    expect(form).toMatchObject({ references: [], allocations: {} });
  });

  it("keeps a partner who still qualifies after Payment Against changes", () => {
    expect(applyChange(billsFilled(), { paymentAgainst: "OTHER" }).partner).toBe("V-1001");
  });

  it("drops a partner who no longer qualifies", () => {
    const shree = answer({ type: "VENDOR" }, { paymentAgainst: "OTHER" }, { partner: "V-1005" });
    expect(shree.partner).toBe("V-1005");
    expect(applyChange(shree, { paymentAgainst: "AGAINST_BILL" }).partner).toBe("");
  });

  it("leaving Against PO clears the POs, their lines and the Expected Date", () => {
    let po = answer(
      { type: "VENDOR" },
      { paymentAgainst: "AGAINST_PO" },
      { partner: "V-1001", expectedDate: "2026-10-20" },
      { references: ["P-1"] },
    );
    po = changeAllocation(po, "P-1", { amount: "20000" });
    expect(po.expectedDate).toBe("2026-10-20");

    const advance = applyChange(po, { paymentAgainst: "ADVANCE" });
    expect(advance).toMatchObject({
      references: [],
      allocations: {},
      expectedDate: "",
      partner: "V-1001", // ABC still qualifies for a plain advance
    });
  });

  it("never stores an Expected Date outside Vendor → Against PO", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "OTHER" }, { expectedDate: "2026-10-20" });
    expect(form.expectedDate).toBe("");
  });

  it("a new partner clears the documents and their lines", () => {
    const form = applyChange(billsFilled(), { partner: "V-1002" });
    expect(form).toMatchObject({ references: [], allocations: {} });
  });

  it("keeps a plain amount when only the partner changes", () => {
    const plain = answer(
      { type: "VENDOR" },
      { paymentAgainst: "OTHER" },
      { partner: "V-1005" },
      { amount: "12000" },
    );
    expect(applyChange(plain, { partner: "V-1006" }).amount).toBe("12000");
  });

  it("never holds a plain amount in a document case", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_BILL" }, { amount: "40" });
    expect(form.amount).toBe("");
  });

  const emiAdvance = () =>
    answer(
      { type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "ADVANCE" },
      { partner: "E-2001", amount: "20000" },
      { returnMethod: "EMI" },
      { installments: "4" },
      { expectedFromDate: "2026-10-01", expectedToDate: "2026-10-15" },
    );

  it("clears the whole repayment when leaving Employee Advance + Advance", () => {
    const form = emiAdvance();
    expect(form).toMatchObject({ returnMethod: "EMI", installments: "4" });
    const cleared = {
      returnMethod: "",
      installments: "",
      expectedFromDate: "",
      expectedToDate: "",
    };
    expect(applyChange(form, { paymentAgainst: "OTHER" })).toMatchObject(cleared);
    expect(applyChange(form, { type: "EMPLOYEE_IMPREST" })).toMatchObject(cleared);
  });

  it("clears the installments when EMI is no longer the return method", () => {
    const form = applyChange(emiAdvance(), { returnMethod: "ONE_TIME" });
    expect(form.installments).toBe("");
    // The period is not about EMI, so it stays.
    expect(form.expectedFromDate).toBe("2026-10-01");
  });

  it("never stores an Expected Bill Date for Employee Advance", () => {
    const form = answer(
      { type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "ADVANCE" },
      { expectedBillDate: "2026-10-01" },
    );
    expect(form.expectedBillDate).toBe("");
  });

  it("keeps Imprest's Expected Bill Date across Payment Against, and drops it with the type", () => {
    const imprest = answer(
      { type: "EMPLOYEE_IMPREST" },
      { paymentAgainst: "ADVANCE" },
      { expectedBillDate: "2026-10-05" },
    );
    expect(imprest.expectedBillDate).toBe("2026-10-05");
    expect(applyChange(imprest, { paymentAgainst: "OTHER" }).expectedBillDate).toBe("2026-10-05");
    expect(applyChange(imprest, { type: "EMPLOYEE_ADVANCE" }).expectedBillDate).toBe("");
  });
});

describe("repayment", () => {
  it("EMI = amount ÷ installments — ₹20,000 over 4 is ₹5,000", () => {
    expect(calculateEmi("20000", "4")).toEqual({ emi: 5000, error: null, rounded: false });
  });

  it("rounds an uneven EMI to the paisa, and says it did", () => {
    expect(calculateEmi("20000", "3")).toEqual({ emi: 6666.67, error: null, rounded: true });
  });

  it("rejects a count that is not a whole number of at least one", () => {
    expect(calculateEmi("20000", "0").error).toMatch(/whole number/);
    expect(calculateEmi("20000", "2.5").error).toMatch(/whole number/);
  });

  it("waits for the amount before showing an EMI", () => {
    expect(calculateEmi("", "4")).toEqual({ emi: null, error: null, rounded: false });
  });

  it("rejects an Expected To Date before the From Date, and allows the same day", () => {
    expect(expectedPeriodError("2026-10-15", "2026-10-01")).toMatch(/cannot be before/);
    expect(expectedPeriodError("2026-10-01", "2026-10-01")).toBeNull();
    expect(expectedPeriodError("2026-10-01", "2026-10-15")).toBeNull();
    expect(expectedPeriodError("2026-10-01", "")).toBeNull();
  });
});

describe("validation", () => {
  const COMMON = { ownership: "Finance desk", paymentDate: "2026-10-01", remarks: "Part settlement" };

  it("never asks for a field the case does not show", () => {
    const { missing } = validate(answer({ type: "VENDOR" }, { paymentAgainst: "OTHER" }));
    expect(missing).not.toContain("Bills");
    expect(missing).not.toContain("Advance Against");
    expect(missing).not.toContain("Expected Date");
    expect(missing).not.toContain("Expected Bill Date");
    expect(missing).not.toContain("Return Method");
    expect(missing).toContain("Amount");
  });

  it("asks for at least one bill once the vendor is chosen", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_BILL" }, { partner: "V-1001" });
    expect(validate(form).missing).toContain("Bills");
  });

  it("names the document whose payment line is blank", () => {
    const form = changeAllocation(abcBothBills(), "B-1", { amount: "10000" });
    expect(validate(form).missing).toContain("Payment for AP-INV-10271");
    expect(validate(form).missing).not.toContain("Payment for AP-INV-10256");
  });

  it("names the document whose amount exceeds its open balance", () => {
    let form = changeAllocation(abcBothBills(), "B-1", { amount: "180000" });
    form = changeAllocation(form, "B-2", { amount: "1000" });
    expect(validate(form).problems).toEqual([
      `AP-INV-10256: Cannot exceed the open amount of ${formatINR(150000)}.`,
    ]);
  });

  it("asks Vendor → Against PO for its Expected Date", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_PO" });
    expect(validate(form).missing).toContain("Expected Date");
  });

  it("requires Ownership, and a blank one does not count", () => {
    expect(validate(EMPTY_FORM).missing).toContain("Ownership");
    expect(validate(answer({ ownership: "   " })).missing).toContain("Ownership");
    expect(validate(answer({ ownership: "Finance desk" })).missing).not.toContain("Ownership");
  });

  it("passes a complete multi-bill Vendor + Against Bill request", () => {
    let form = applyChange(abcBothBills(), COMMON);
    form = changeAllocation(form, "B-1", { mode: "PERCENT", percentage: "65" });
    form = changeAllocation(form, "B-2", { amount: "40000" });
    expect(validate(form)).toEqual({ missing: [], problems: [] });
  });

  it("asks for the repayment fields on Employee Advance + Advance", () => {
    const { missing } = validate(answer({ type: "EMPLOYEE_ADVANCE" }, { paymentAgainst: "ADVANCE" }));
    expect(missing).toEqual(
      expect.arrayContaining(["Return Method", "Expected From Date", "Expected To Date"]),
    );
    expect(missing).not.toContain("Number of Installments"); // no EMI chosen yet
  });

  it("blocks a reversed expected period", () => {
    const form = applyChange(emiAdvanceForValidation(), {
      expectedFromDate: "2026-10-15",
      expectedToDate: "2026-10-01",
    });
    expect(validate(form).problems).toContain(
      "Expected To Date cannot be before Expected From Date.",
    );
  });

  it("passes a complete Employee Advance + Advance on EMI", () => {
    expect(validate(emiAdvanceForValidation())).toEqual({ missing: [], problems: [] });
  });

  it("asks Imprest for its Expected Bill Date", () => {
    const { missing } = validate(answer({ type: "EMPLOYEE_IMPREST" }, { paymentAgainst: "OTHER" }));
    expect(missing).toContain("Expected Bill Date");
  });
});

describe("typed answers in place of Other", () => {
  it("keeps typed text while its Other answer stands, and branches like Other", () => {
    const form = answer(
      { type: "VENDOR" },
      { paymentAgainst: "OTHER", paymentAgainstOther: "Security deposit" },
    );
    expect(form.paymentAgainstOther).toBe("Security deposit");
    expect(resolveCase(form).plainAmount).toBe(true);
  });

  it("drops the typed text once a listed answer is chosen, or the type changes", () => {
    const form = answer(
      { type: "VENDOR" },
      { paymentAgainst: "OTHER", paymentAgainstOther: "Security deposit" },
    );
    expect(applyChange(form, { paymentAgainst: "ADVANCE" }).paymentAgainstOther).toBe("");
    expect(applyChange(form, { type: "EMPLOYEE_ADVANCE" }).paymentAgainstOther).toBe("");
  });

  it("changing only the typed text does not clear what sits below it", () => {
    const form = answer(
      { type: "VENDOR" },
      { paymentAgainst: "OTHER", paymentAgainstOther: "Rent" },
      { partner: "V-1005", amount: "12000" },
    );
    const renamed = applyChange(form, { paymentAgainstOther: "Office rent" });
    expect(renamed).toMatchObject({ partner: "V-1005", amount: "12000" });
  });

  it("never holds typed text for an answer that is not Other", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "ADVANCE", paymentAgainstOther: "x" });
    expect(form.paymentAgainstOther).toBe("");
  });

  it("drops a typed Return Method when EMI is chosen", () => {
    const form = answer(
      { type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "ADVANCE" },
      { returnMethod: "CUSTOM", returnMethodOther: "Salary deduction" },
    );
    expect(form.returnMethodOther).toBe("Salary deduction");
    expect(applyChange(form, { returnMethod: "EMI" }).returnMethodOther).toBe("");
  });

  it("requires an Other answer to say what it is", () => {
    const blank = answer({ type: "VENDOR" }, { paymentAgainst: "OTHER", paymentAgainstOther: "  " });
    expect(validate(blank).missing).toContain("Payment Against (what it is)");
    const said = applyChange(blank, { paymentAgainstOther: "Rent" });
    expect(validate(said).missing).not.toContain("Payment Against (what it is)");
  });
});

function emiAdvanceForValidation(): RequestForm {
  return answer(
    { company: "OIL", type: "EMPLOYEE_ADVANCE" },
    { paymentAgainst: "ADVANCE" },
    { partner: "E-2001", amount: "20000" },
    { returnMethod: "EMI" },
    { installments: "4" },
    { expectedFromDate: "2026-10-01", expectedToDate: "2026-10-15" },
    { ownership: "HR", paymentDate: "2026-09-30", remarks: "Relocation advance" },
  );
}
