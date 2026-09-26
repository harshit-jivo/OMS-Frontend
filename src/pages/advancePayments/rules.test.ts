import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { VENDOR_OTHER_DOCUMENTS, VENDOR_POS, type OpenDocument } from "./constants";
import {
  CASE_RULES,
  REFERENCE_KINDS,
  balanceSide,
  addMonths,
  dueFirst,
  dueLabel,
  dueState,
  allocationRows,
  allocationTotals,
  applyChange,
  calculateEmi,
  calculatePayment,
  changeAllocation,
  EMPTY_FORM,
  expectedPeriodError,
  formatINR,
  installmentsFromEmi,
  PARTNER_CODE_PREFIX,
  partnerSourceFor,
  resolveCase,
  todayIso,
  validate,
  type RequestForm,
} from "./rules";
import { BILL_10256, BILL_10263, BILL_10271 } from "./testData";

// `validate` rejects forward-looking dates before today, and the sample dates
// in this file are in October 2026. Pin the calendar so they stay in the
// future — only Date is faked, so nothing that waits on a timer is affected.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0));
});
afterAll(() => vi.useRealTimers());

/** Build a form by applying answers in order, the way a user would. */
function answer(...patches: Partial<RequestForm>[]): RequestForm {
  return patches.reduce<RequestForm>((form, patch) => applyChange(form, patch), EMPTY_FORM);
}

const ids = (form: RequestForm) => form.selected.map((doc) => doc.id);

/** ABC Technologies (a SAP vendor), Against Bill, with both of ABC's bills ticked. */
const abcBothBills = () =>
  answer(
    { company: "OIL", type: "VENDOR" },
    { paymentAgainst: "AGAINST_BILL" },
    { partner: "VENDA000101", partnerName: "ABC Technologies" },
    { selected: [BILL_10256, BILL_10271] },
  );

describe("sample data", () => {
  it("keeps every sample document's open amount equal to original minus paid", () => {
    for (const doc of [...VENDOR_POS, ...VENDOR_OTHER_DOCUMENTS]) {
      expect(doc.open, doc.number).toBe(doc.original - doc.paid);
    }
  });
});

describe("the case table", () => {
  it("offers each type its own Payment Against answers", () => {
    const offered = (type: RequestForm["type"]) =>
      resolveCase(answer({ type })).paymentAgainstOptions.map((o) => o.value);
    // A vendor advance is always against a document: a bill or a PO. "All" is
    // switched off.
    expect(offered("VENDOR")).toEqual(["AGAINST_BILL", "AGAINST_PO"]);
    // No Against Bill for an employee advance.
    expect(offered("EMPLOYEE_ADVANCE")).toEqual(["ADVANCE", "OTHER"]);
    expect(offered("EMPLOYEE_IMPREST")).toEqual(["ADVANCE", "AGAINST_BILL", "OTHER"]);
  });

  it("a vendor has no answer that is not a document", () => {
    // ADVANCE and OTHER are not offered to a vendor. `resolveCase` must treat
    // them as undecided rather than falling through to a plain amount, or the
    // form would show an amount box for an answer that is not on the dropdown.
    for (const gone of ["ADVANCE", "OTHER"] as const) {
      const c = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: gone }));
      expect(c.decided, gone).toBe(false);
      expect(c.reference, gone).toBeNull();
      expect(c.plainAmount, gone).toBe(false);
    }
  });

  it("Vendor + Against Bill pays against vendor bills", () => {
    const c = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_BILL" }));
    expect(c.reference).toBe("VENDOR_BILL");
    expect(c.plainAmount).toBe(false);
    expect(c.expectedDate).toBe(false);
    expect(c.repayment).toBe(false);
  });


  it("Vendor + Against PO pays against POs and asks an Expected Date", () => {
    const c = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_PO" }));
    expect(c.reference).toBe("VENDOR_PO");
    expect(c.expectedDate).toBe(true);
    expect(c.plainAmount).toBe(false);
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

  it("Employee Advance + Other is a plain amount and nothing else", () => {
    const c = resolveCase(answer({ type: "EMPLOYEE_ADVANCE" }, { paymentAgainst: "OTHER" }));
    expect(c.plainAmount).toBe(true);
    expect(c.reference).toBeNull();
    expect(c.repayment).toBe(false);
    expect(c.expectedBillDate).toBe(false);
  });

  it("Employee Imprest asks the expected bill date in every case", () => {
    for (const paymentAgainst of ["ADVANCE", "AGAINST_BILL", "OTHER"] as const) {
      const c = resolveCase(answer({ type: "EMPLOYEE_IMPREST" }, { paymentAgainst }));
      expect(c.expectedBillDate, paymentAgainst).toBe(true);
      expect(c.repayment, paymentAgainst).toBe(false);
      expect(c.expectedDate, paymentAgainst).toBe(false);
    }
    // Advance and a typed answer are a plain amount…
    for (const paymentAgainst of ["ADVANCE", "OTHER"] as const) {
      const c = resolveCase(answer({ type: "EMPLOYEE_IMPREST" }, { paymentAgainst }));
      expect(c.reference, paymentAgainst).toBeNull();
      expect(c.plainAmount, paymentAgainst).toBe(true);
    }
  });

  it("Employee Imprest + Against Bill pays against the imprest account's own open bills", () => {
    const c = resolveCase(answer({ type: "EMPLOYEE_IMPREST" }, { paymentAgainst: "AGAINST_BILL" }));
    expect(c).toMatchObject({
      reference: "VENDOR_BILL",
      liveDocuments: true,
      partnerSource: "SAP_IMPREST",
      plainAmount: false,
    });
  });
});

describe("where each case's data comes from", () => {
  it("names the code series each SAP partner list is narrowed to", () => {
    expect(PARTNER_CODE_PREFIX).toEqual({ SAP_VENDORS: "VENDA", SAP_IMPREST: "ORGV" });
  });

  it("reads SAP for every vendor case, the imprest accounts and Employee", () => {
    expect(partnerSourceFor("VENDOR", null)).toBe("SAP_VENDORS");
    expect(partnerSourceFor("VENDOR", "VENDOR_BILL")).toBe("SAP_VENDORS");
    expect(partnerSourceFor("VENDOR", "VENDOR_PO")).toBe("SAP_VENDORS");
    expect(partnerSourceFor("VENDOR", "VENDOR_OTHER")).toBe("SAP_VENDORS");
    expect(partnerSourceFor("EMPLOYEE_ADVANCE", null)).toBe("SAP_EMPLOYEES");
    expect(partnerSourceFor("EMPLOYEE_IMPREST", null)).toBe("SAP_IMPREST");
  });

  it("says when the page must fetch the partner list and the documents", () => {
    const bills = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_BILL" }));
    expect(bills).toMatchObject({ livePartners: true, liveDocuments: true, partners: [] });

    // POs are SAP's too: the page fetches that list.
    for (const against of ["AGAINST_PO"] as const) {
      const c = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: against }));
      expect(c, against).toMatchObject({ livePartners: true, liveDocuments: true, partners: [] });
      expect(c.documents, against).toEqual([]);
    }
  });

  it("keeps a SAP partner it cannot check against a list", () => {
    const form = answer(
      { company: "OIL", type: "VENDOR" },
      { paymentAgainst: "AGAINST_BILL" },
      { partner: "VENDA000999", partnerName: "Any SAP Vendor" },
    );
    expect(form).toMatchObject({ partner: "VENDA000999", partnerName: "Any SAP Vendor" });
  });
});

describe("Against PO and All (live from SAP)", () => {
  const XYZ_PO: OpenDocument = {
    id: "POR-4512",
    number: "4512",
    date: "2026-08-08",
    partner: "VENDA000102",
    original: 180000,
    paid: 0,
    open: 180000,
  };

  it("Vendor + Against PO asks for the Expected Date and pays against POs", () => {
    const c = resolveCase(answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_PO" }));
    expect(c).toMatchObject({ reference: "VENDOR_PO", expectedDate: true, plainAmount: false });
  });

  it("no longer offers Vendor + All", () => {
    expect(CASE_RULES.VENDOR.ALL).toBeUndefined();
  });

  it("keeps a chosen PO, as the snapshot the requester saw", () => {
    const form = answer(
      { company: "OIL", type: "VENDOR" },
      { paymentAgainst: "AGAINST_PO" },
      { partner: "VENDA000102" },
      { selected: [XYZ_PO] },
    );
    expect(ids(form)).toEqual(["POR-4512"]);
  });

  it("refuses a PO that belongs to another vendor", () => {
    const form = answer(
      { company: "OIL", type: "VENDOR" },
      { paymentAgainst: "AGAINST_PO" },
      { partner: "VENDA000101" },
      { selected: [XYZ_PO] },
    );
    expect(ids(form)).toEqual([]);
  });

  it("names the PO's paid column for what SAP means by it: received, not advanced", () => {
    expect(REFERENCE_KINDS.VENDOR_PO.paidLabel).toBe("Already Received");
  });
});

describe("selecting several documents", () => {
  it("gives every ticked document its own empty payment line", () => {
    const form = abcBothBills();
    expect(ids(form)).toEqual(["PCH-10256", "PCH-10271"]);
    expect(Object.keys(form.allocations)).toEqual(["PCH-10256", "PCH-10271"]);
    expect(form.allocations["PCH-10256"]).toEqual({ mode: "FIXED", amount: "", percentage: "" });
  });

  it("keeps a line's entry when another document is ticked or unticked", () => {
    let form = answer(
      { company: "OIL", type: "VENDOR" },
      { paymentAgainst: "AGAINST_BILL" },
      { partner: "VENDA000101" },
      { selected: [BILL_10256] },
    );
    form = changeAllocation(form, "PCH-10256", { amount: "50000" });
    form = applyChange(form, { selected: [BILL_10256, BILL_10271] });
    expect(form.allocations["PCH-10256"].amount).toBe("50000");

    form = applyChange(form, { selected: [BILL_10256] });
    expect(Object.keys(form.allocations)).toEqual(["PCH-10256"]);
    expect(form.allocations["PCH-10256"].amount).toBe("50000");
  });

  it("refuses a document that belongs to another partner", () => {
    const form = applyChange(abcBothBills(), { selected: [BILL_10256, BILL_10263] }); // 10263 is XYZ's
    expect(ids(form)).toEqual(["PCH-10256"]);
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
    expect(contract.open).toBe(50000);
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
  it("totals every line — ₹97,500 plus ₹40,000 is ₹1,37,500", () => {
    let form = abcBothBills();
    form = changeAllocation(form, "PCH-10256", { amount: "97500" });
    form = changeAllocation(form, "PCH-10271", { amount: "40000" });

    const rows = allocationRows(form);
    expect(rows.map((r) => r.calc.payment)).toEqual([97500, 40000]);
    expect(allocationTotals(rows)).toEqual({ open: 234000, payment: 137500, complete: true });
  });

  it("reports an incomplete total while any line is blank or invalid", () => {
    let form = changeAllocation(abcBothBills(), "PCH-10256", { amount: "10000" });
    expect(allocationTotals(allocationRows(form))).toMatchObject({ payment: 10000, complete: false });

    form = changeAllocation(form, "PCH-10271", { amount: "999999" }); // over ₹84,000
    expect(allocationTotals(allocationRows(form))).toMatchObject({ payment: 10000, complete: false });
  });

  it("adds paise exactly, with no floating-point drift", () => {
    let form = abcBothBills();
    form = changeAllocation(form, "PCH-10256", { amount: "0.1" });
    form = changeAllocation(form, "PCH-10271", { amount: "0.2" });
    expect(allocationTotals(allocationRows(form)).payment).toBe(0.3);
  });

  it("pays a bill by AMOUNT only — a percentage is not taken", () => {
    let form = changeAllocation(abcBothBills(), "PCH-10271", { amount: "20000" });
    form = changeAllocation(form, "PCH-10256", { mode: "PERCENT", percentage: "50" });
    expect(form.allocations["PCH-10256"]).toEqual({ mode: "FIXED", amount: "", percentage: "" });
    // …and the other line is untouched.
    expect(form.allocations["PCH-10271"].amount).toBe("20000");
  });

  it("pays a PO by percentage OR amount, starting on percentage", () => {
    const XYZ_PO: OpenDocument = {
      id: "POR-4512", number: "4512", date: "2026-08-08", partner: "VENDA000102",
      original: 180000, paid: 0, open: 180000,
    };
    let form = answer(
      { company: "OIL", type: "VENDOR" },
      { paymentAgainst: "AGAINST_PO" },
      { partner: "VENDA000102" },
      { selected: [XYZ_PO] },
    );
    expect(form.allocations["POR-4512"].mode).toBe("PERCENT");
    form = changeAllocation(form, "POR-4512", { percentage: "10" });
    expect(allocationRows(form)[0].calc.payment).toBe(18000);

    // A switch to amount starts the line afresh — 10 is not ₹10.
    form = changeAllocation(form, "POR-4512", { mode: "FIXED", amount: "5000" });
    expect(form.allocations["POR-4512"]).toEqual({ mode: "FIXED", amount: "5000", percentage: "" });
    expect(allocationRows(form)[0].calc.payment).toBe(5000);
  });

  it("names the modes each document kind may be paid in", () => {
    expect(REFERENCE_KINDS.VENDOR_PO.modes).toEqual(["PERCENT", "FIXED"]);
    expect(REFERENCE_KINDS.VENDOR_BILL.modes).toEqual(["FIXED"]);
    expect(REFERENCE_KINDS.VENDOR_OTHER.modes).toEqual(["FIXED"]);
  });

  it("ignores an edit to a line that does not exist", () => {
    const form = abcBothBills();
    expect(changeAllocation(form, "PCH-1", { amount: "1" })).toBe(form);
  });
});

describe("clearing dependent fields", () => {
  const billsFilled = () => changeAllocation(abcBothBills(), "PCH-10256", { amount: "50000" });

  it("a new company clears the partner and the documents — each company is its own SAP", () => {
    const form = applyChange(billsFilled(), { company: "MART" });
    expect(form).toMatchObject({
      type: "VENDOR",
      paymentAgainst: "AGAINST_BILL",
      partner: "",
      partnerName: "",
      selected: [],
      allocations: {},
    });
  });

  it("a new Type clears everything below it", () => {
    const form = applyChange(billsFilled(), { type: "EMPLOYEE_ADVANCE" });
    expect(form).toMatchObject({
      company: "OIL", // above Type — kept
      paymentAgainst: "",
      partner: "",
      partnerName: "",
      selected: [],
      allocations: {},
      amount: "",
      expectedDate: "",
    });
  });

  it("a new Payment Against clears the documents and their lines", () => {
    const form = applyChange(billsFilled(), { paymentAgainst: "OTHER" });
    expect(form).toMatchObject({ selected: [], allocations: {} });
  });

  it("keeps a SAP partner across a Payment Against change that still lists the same source", () => {
    // Employee Imprest, not Vendor: a vendor's two answers are now Against
    // Bill (SAP vendors) and Against PO (sample vendors), so every vendor
    // change crosses sources and there is no "stays" case left to show there.
    const imprest = answer(
      { company: "OIL", type: "EMPLOYEE_IMPREST" },
      { paymentAgainst: "ADVANCE" },
      { partner: "ORGV000012", partnerName: "Gurnam Singh Imprest" },
    );
    const form = applyChange(imprest, { paymentAgainst: "AGAINST_BILL" });
    expect(form).toMatchObject({ partner: "ORGV000012", partnerName: "Gurnam Singh Imprest" });
  });

  it("keeps the vendor across Bill and PO, and drops the documents", () => {
    // Both list SAP's vendors, so the vendor is the same person under each —
    // but a bill is not a PO, so what was ticked goes.
    for (const to of ["AGAINST_PO"] as const) {
      const form = applyChange(billsFilled(), { paymentAgainst: to });
      expect(form, to).toMatchObject({ partner: "VENDA000101", partnerName: "ABC Technologies" });
      expect(form.selected, to).toEqual([]);
      expect(form.allocations, to).toEqual({});
    }
  });

  it("leaving Against PO clears the POs, their lines and the Expected Date", () => {
    let po = answer(
      { type: "VENDOR" },
      { paymentAgainst: "AGAINST_PO" },
      { partner: "V-1001", expectedDate: "2026-10-20" },
      { selected: [VENDOR_POS.find((d) => d.id === "P-1")!] },
    );
    po = changeAllocation(po, "P-1", { amount: "20000" });
    expect(po.expectedDate).toBe("2026-10-20");

    const advance = applyChange(po, { paymentAgainst: "ADVANCE" });
    expect(advance).toMatchObject({ selected: [], allocations: {}, expectedDate: "" });
  });

  it("never stores an Expected Date outside Vendor → Against PO", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "OTHER" }, { expectedDate: "2026-10-20" });
    expect(form.expectedDate).toBe("");
  });

  it("a new partner clears the documents and their lines", () => {
    const form = applyChange(billsFilled(), { partner: "VENDA000102" });
    expect(form).toMatchObject({ selected: [], allocations: {} });
  });

  it("keeps a plain amount when only the partner changes", () => {
    // Employee Advance: the plain-amount case now that a vendor always pays
    // against a document.
    const plain = answer(
      { company: "OIL", type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "OTHER", paymentAgainstOther: "Freight" },
      { partner: "1113035" },
      { amount: "12000" },
    );
    expect(applyChange(plain, { partner: "1113036" }).amount).toBe("12000");
  });

  it("never holds a plain amount in a document case", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_BILL" }, { amount: "40" });
    expect(form.amount).toBe("");
  });

  const emiAdvance = () =>
    answer(
      { company: "OIL", type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "ADVANCE" },
      { partner: "1113035", amount: "20000" },
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

  it("clears the installments, the EMI and the dates when EMI is no longer the return method", () => {
    const form = applyChange(emiAdvance(), { returnMethod: "ONE_TIME" });
    expect(form).toMatchObject({ installments: "", emiAmount: "" });
    // The dates meant "EMI starts / last EMI clears". One Time asks a single
    // Return Date, and carrying the EMI start into it would be a guess.
    expect(form).toMatchObject({ expectedFromDate: "", expectedToDate: "" });
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
  const COMMON = {
    department: "35", departmentName: "Finance", subDepartment: "92", subDepartmentName: "AP",
    hasSubDepartments: true,
    budget: "BackOff", budgetName: "Back Office", subBudget: "Accounts", subBudgetName: "Accounts",
    ownership: "Finance desk", paymentDate: "2026-10-01", remarks: "Part settlement",
  };

  it("never asks for a field the case does not show", () => {
    const { missing } = validate(
      answer({ type: "EMPLOYEE_ADVANCE" }, { paymentAgainst: "OTHER" }),
    );
    expect(missing).not.toContain("Bills");
    expect(missing).not.toContain("Expected Date");
    expect(missing).not.toContain("Expected Bill Date");
    expect(missing).not.toContain("Return Method");
    expect(missing).toContain("Amount");
  });

  it("asks for at least one bill once the vendor is chosen", () => {
    const form = answer(
      { company: "OIL", type: "VENDOR" },
      { paymentAgainst: "AGAINST_BILL" },
      { partner: "VENDA000101" },
    );
    expect(validate(form).missing).toContain("Bills");
  });

  it("names the document whose payment line is blank", () => {
    const form = changeAllocation(abcBothBills(), "PCH-10256", { amount: "10000" });
    expect(validate(form).missing).toContain("Payment for 10271");
    expect(validate(form).missing).not.toContain("Payment for 10256");
  });

  it("names the document whose amount exceeds its open balance", () => {
    let form = changeAllocation(abcBothBills(), "PCH-10256", { amount: "180000" });
    form = changeAllocation(form, "PCH-10271", { amount: "1000" });
    expect(validate(form).problems).toEqual([
      `10256: Cannot exceed the open amount of ${formatINR(150000)}.`,
    ]);
  });

  it("asks Vendor → Against PO for its Expected Bill Date", () => {
    const form = answer({ type: "VENDOR" }, { paymentAgainst: "AGAINST_PO" });
    expect(validate(form).missing).toContain("Expected Bill Date");
  });

  it("requires a Department, and a Sub-department only where the department has them", () => {
    expect(validate(EMPTY_FORM).missing).toContain("Department");
    const finance = answer({ department: "35", departmentName: "Finance", hasSubDepartments: true });
    expect(validate(finance).missing).not.toContain("Department");
    expect(validate(finance).missing).toContain("Sub-department");
    expect(validate(answer({ ...finance, subDepartment: "92" })).missing).not.toContain("Sub-department");
    // Cyber Security has no sub-departments: none is asked.
    const cyber = answer({ department: "40", departmentName: "Cyber Security", hasSubDepartments: false });
    expect(validate(cyber).missing).not.toContain("Sub-department");
  });

  it("requires Ownership, and a blank one does not count", () => {
    expect(validate(EMPTY_FORM).missing).toContain("Ownership");
    expect(validate(answer({ ownership: "   " })).missing).toContain("Ownership");
    expect(validate(answer({ ownership: "Finance desk" })).missing).not.toContain("Ownership");
  });

  it("passes a complete multi-bill Vendor + Against Bill request", () => {
    let form = applyChange(abcBothBills(), COMMON);
    form = changeAllocation(form, "PCH-10256", { amount: "97500" });
    form = changeAllocation(form, "PCH-10271", { amount: "40000" });
    expect(validate(form)).toEqual({ missing: [], problems: [] });
  });

  it("asks for the repayment fields on Employee Advance + Advance", () => {
    const { missing } = validate(answer({ type: "EMPLOYEE_ADVANCE" }, { paymentAgainst: "ADVANCE" }));
    // Until a method is chosen there is nothing to date: each method asks its own.
    expect(missing).toContain("Return Method");
    expect(missing).not.toContain("Expected From Date");
    expect(missing).not.toContain("Number of Installments");
  });

  it("blocks a reversed expected period under Other / Custom", () => {
    // EMI no longer has a typed To date to reverse; the typed method does.
    const custom = applyChange(emiAdvanceForValidation(), {
      returnMethod: "CUSTOM",
      returnMethodOther: "Adjust against bonus",
    });
    const form = applyChange(custom, {
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
      { type: "EMPLOYEE_ADVANCE" },
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
      { company: "OIL", type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "OTHER", paymentAgainstOther: "Rent" },
      { partner: "1113035", amount: "12000" },
    );
    const renamed = applyChange(form, { paymentAgainstOther: "Office rent" });
    expect(renamed).toMatchObject({ partner: "1113035", amount: "12000" });
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
    const blank = answer(
      { type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "OTHER", paymentAgainstOther: "  " },
    );
    expect(validate(blank).missing).toContain("Payment Against (what it is)");
    const said = applyChange(blank, { paymentAgainstOther: "Rent" });
    expect(validate(said).missing).not.toContain("Payment Against (what it is)");
  });
});

function emiAdvanceForValidation(): RequestForm {
  return answer(
    { company: "OIL", type: "EMPLOYEE_ADVANCE" },
    { paymentAgainst: "ADVANCE" },
    { partner: "1113035", partnerName: "RAVINDER SINGH SHUNTY", amount: "20000" },
    { returnMethod: "EMI" },
    { installments: "4" },
    { expectedFromDate: "2026-10-01", expectedToDate: "2026-10-15" },
    {
      department: "24", departmentName: "HR", subDepartment: "56", subDepartmentName: "HR Payroll",
      hasSubDepartments: true,
      budget: "BackOff", budgetName: "Back Office", subBudget: "Accounts", subBudgetName: "Accounts",
      ownership: "HR", paymentDate: "2026-09-30", remarks: "Relocation advance",
    },
  );
}

/* ── EMI: installments and EMI amount, both ways ─────────────────────────── */

describe("EMI, linked both ways", () => {
  const emiForm = (patch: Partial<RequestForm> = {}) =>
    answer(
      { company: "OIL", type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "ADVANCE" },
      { partner: "1113035", amount: "20000" },
      { returnMethod: "EMI" },
      patch,
    );

  it("works out the EMI from the number of installments", () => {
    const form = applyChange(emiForm(), { installments: "4" });
    expect(form.emiAmount).toBe("5000");
  });

  it("works out the number of installments from the EMI", () => {
    const form = applyChange(emiForm(), { emiAmount: "5000" });
    expect(form.installments).toBe("4");
  });

  it("rounds the count UP when the EMI does not divide the amount", () => {
    // 20,000 at 6,000 = three full EMIs and a last one of 2,000.
    const form = applyChange(emiForm(), { emiAmount: "6000" });
    expect(form.installments).toBe("4");
    expect(installmentsFromEmi("20000", "6000")).toEqual({
      installments: 4,
      error: null,
      lastInstallment: 2000,
    });
  });

  it("keeps a typed EMI exactly as typed", () => {
    // Not rewritten to the 5,000 that 4 installments would imply.
    const form = applyChange(emiForm(), { emiAmount: "6000" });
    expect(form.emiAmount).toBe("6000");
  });

  it("keeps the count and moves the EMI when the amount changes", () => {
    const four = applyChange(emiForm(), { installments: "4" });
    const bigger = applyChange(four, { amount: "24000" });
    expect(bigger).toMatchObject({ installments: "4", emiAmount: "6000" });
  });

  it("refuses an EMI above the amount, or of nothing", () => {
    expect(installmentsFromEmi("20000", "25000").error).toBe("EMI cannot be more than the amount.");
    expect(installmentsFromEmi("20000", "0").error).toBe("EMI must be more than zero.");
  });

  it("does not stumble on an EMI that divides exactly", () => {
    // 20000 / 5000 is 4, not 4.0000000001 rounded up to 5.
    expect(installmentsFromEmi("20000", "5000").installments).toBe(4);
    expect(installmentsFromEmi("1000", "333.34").installments).toBe(3);
  });
});

/* ── EMI: the derived end date ───────────────────────────────────────────── */

describe("EMI Start Date and the derived Expected To Date", () => {
  const started = () =>
    answer(
      { company: "OIL", type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "ADVANCE" },
      { partner: "1113035", amount: "20000" },
      { returnMethod: "EMI" },
      { installments: "4" },
      { expectedFromDate: "2026-10-01" },
    );

  it("is the start date plus one month per installment", () => {
    expect(started().expectedToDate).toBe("2027-02-01");
  });

  it("follows the count when it changes, from either field", () => {
    expect(applyChange(started(), { installments: "2" }).expectedToDate).toBe("2026-12-01");
    // An EMI of 10,000 on 20,000 is 2 installments, so the same end date.
    expect(applyChange(started(), { emiAmount: "10000" }).expectedToDate).toBe("2026-12-01");
  });

  it("cannot be typed over — it is worked out every time", () => {
    const typed = applyChange(started(), { expectedToDate: "2030-01-01" });
    expect(typed.expectedToDate).toBe("2027-02-01");
  });

  it("is empty until there is both a start and a count", () => {
    const noStart = applyChange(started(), { expectedFromDate: "" });
    expect(noStart.expectedToDate).toBe("");
    const noCount = applyChange(started(), { installments: "" });
    expect(noCount.expectedToDate).toBe("");
  });

  it("clamps to the end of a shorter month", () => {
    // Not 3 March, which is what bumping a Date's month would give.
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("asks for the start only — the end is not the requester's to fill", () => {
    const blank = applyChange(started(), { expectedFromDate: "" });
    const { missing } = validate(blank, "2026-09-23");
    expect(missing).toContain("EMI Start Date");
    expect(missing).not.toContain("Expected To Date");
    expect(missing).not.toContain("Expected From Date");
  });
});

/* ── One Time: one date ──────────────────────────────────────────────────── */

describe("One Time repayment", () => {
  const oneTime = () =>
    answer(
      { company: "OIL", type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "ADVANCE" },
      { partner: "1113035", amount: "20000" },
      { returnMethod: "ONE_TIME" },
    );

  it("asks a single Return Date, and no period", () => {
    const { missing } = validate(oneTime(), "2026-09-23");
    expect(missing).toContain("Return Date");
    expect(missing).not.toContain("Expected From Date");
    expect(missing).not.toContain("Expected To Date");
  });

  it("holds the return date and no start date", () => {
    const form = applyChange(oneTime(), { expectedToDate: "2026-11-15", expectedFromDate: "2026-10-01" });
    expect(form).toMatchObject({ expectedToDate: "2026-11-15", expectedFromDate: "" });
  });
});

/* ── Nothing dated before today ──────────────────────────────────────────── */

describe("forward-looking dates cannot be before today", () => {
  const TODAY = "2026-09-23";

  it("refuses a past EMI Start Date", () => {
    const form = answer(
      { company: "OIL", type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "ADVANCE" },
      { partner: "1113035", amount: "20000" },
      { returnMethod: "EMI" },
      { installments: "4", expectedFromDate: "2026-09-22" },
    );
    expect(validate(form, TODAY).problems).toContain("EMI Start Date cannot be before today.");
    const onTheDay = applyChange(form, { expectedFromDate: TODAY });
    expect(validate(onTheDay, TODAY).problems).not.toContain("EMI Start Date cannot be before today.");
  });

  it("refuses a past Expected Bill Date on an Imprest", () => {
    const form = answer(
      { company: "OIL", type: "EMPLOYEE_IMPREST" },
      { paymentAgainst: "ADVANCE" },
      { expectedBillDate: "2026-09-01" },
    );
    expect(validate(form, TODAY).problems).toContain("Expected Bill Date cannot be before today.");
  });

  it("refuses a past Expected Bill Date on a vendor PO", () => {
    const form = answer(
      { type: "VENDOR" },
      { paymentAgainst: "AGAINST_PO" },
      { expectedDate: "2026-01-01" },
    );
    expect(validate(form, TODAY).problems).toContain("Expected Bill Date cannot be before today.");
  });

  it("refuses a past Payment Date, and takes today", () => {
    const past = answer({ type: "EMPLOYEE_ADVANCE" }, { paymentDate: "2026-09-22" });
    expect(validate(past, TODAY).problems).toContain("Payment Date cannot be before today.");
    const onTheDay = answer({ type: "EMPLOYEE_ADVANCE" }, { paymentDate: TODAY });
    expect(validate(onTheDay, TODAY).problems).not.toContain("Payment Date cannot be before today.");
  });

  it("refuses a past Return Date", () => {
    const form = answer(
      { company: "OIL", type: "EMPLOYEE_ADVANCE" },
      { paymentAgainst: "ADVANCE" },
      { partner: "1113035", amount: "20000" },
      { returnMethod: "ONE_TIME" },
      { expectedToDate: "2026-09-01" },
    );
    expect(validate(form, TODAY).problems).toContain("Return Date cannot be before today.");
  });

  it("reads today off the requester's own calendar, not UTC", () => {
    // 00:30 on 24 Sep in India is still 23 Sep in UTC; the requester's
    // calendar says the 24th, and that is the day they cannot go before.
    const lateNight = new Date(2026, 8, 24, 0, 30);
    expect(todayIso(lateNight)).toBe("2026-09-24");
  });
});


describe("a vendor's balance, as SAP holds it (debit minus credit)", () => {
  it("reads a negative balance as Cr: payable to the vendor", () => {
    expect(balanceSide("-689875.000000")).toEqual({
      amount: 689875, side: "Cr", meaning: "Payable to the vendor",
    });
  });

  it("reads a positive balance as Dr: the vendor owes us", () => {
    expect(balanceSide("192543.5")).toMatchObject({ amount: 192543.5, side: "Dr" });
  });

  it("has no side at zero", () => {
    expect(balanceSide("0.000000")).toEqual({ amount: 0, side: "", meaning: "Nothing outstanding" });
  });
});

describe("due documents", () => {
  const doc = (id: string, dueDate?: string): OpenDocument => ({
    id, number: id, date: "2026-08-01", partner: "V", original: 100, paid: 0, open: 100, dueDate,
  });
  const TODAY = "2026-09-23";

  it("calls a document due on or after its due date", () => {
    expect(dueState(doc("a", "2026-09-01"), TODAY)).toBe("OVERDUE");
    expect(dueState(doc("b", TODAY), TODAY)).toBe("DUE_TODAY");
    expect(dueState(doc("c", "2026-10-01"), TODAY)).toBeNull();
    expect(dueState(doc("d"), TODAY)).toBeNull();
    expect(dueLabel(doc("a", "2026-09-01"), TODAY)).toBe("Overdue since 01 Sept 2026");
    expect(dueLabel(doc("b", TODAY), TODAY)).toBe("Due today");
  });

  it("puts due documents first, the longest overdue at the top, the rest in their order", () => {
    const docs = [doc("later", "2026-10-01"), doc("today", TODAY), doc("none"), doc("old", "2026-08-15")];
    expect(dueFirst(docs, (d) => d, TODAY).map((d) => d.id)).toEqual(["old", "today", "later", "none"]);
  });

  it("asks for the Payment Purpose", () => {
    const missing = validate(EMPTY_FORM).missing;
    expect(missing).toContain("Payment Purpose (Budget)");
    expect(missing).toContain("Payment Purpose (Sub Budget)");
  });

  it("clears the Payment Purpose when the company changes: each company has its own budgets", () => {
    const form = applyChange({ ...EMPTY_FORM, company: "OIL", budget: "BackOff", subBudget: "IT" }, { company: "MART" });
    expect([form.budget, form.subBudget]).toEqual(["", ""]);
  });
});

