/**
 * The routing of 2026-10-19 as the form shows it: a bill goes straight to the
 * Payment desk and freight to Navdeep first, so neither asks for a Department
 * Head. The server applies the same rules (`purposes.needs_department_head`).
 */
import { describe, expect, it } from "vitest";

import { toApiRequest } from "./requestApi";
import { EMPTY_FORM, applyChange, needsBillDueDate, needsDepartmentHead, validate, type RequestForm } from "./rules";

const answer = (...patches: Partial<RequestForm>[]) =>
  patches.reduce<RequestForm>((form, patch) => applyChange(form, patch), EMPTY_FORM);

const RENT = { purpose: "RENT", purposeLabel: "Rent", purposeNeedsHead: true, purposeDueDate: false };
const FREIGHT_IN = { purpose: "FREIGHT_IN", purposeLabel: "Freight – Inward", purposeNeedsHead: false, purposeDueDate: false };
const UTILITIES = { purpose: "UTILITIES", purposeLabel: "Utilities", purposeNeedsHead: true, purposeDueDate: true };

describe("against a bill", () => {
  it("asks no Department Head, whatever the purpose", () => {
    const bill = answer({ company: "OIL" }, { type: "VENDOR" }, { paymentAgainst: "AGAINST_BILL" }, RENT);
    expect(needsDepartmentHead(bill)).toBe(false);
    expect(validate(bill).missing).not.toContain("Department Head");
    expect(toApiRequest(bill).department_head_code).toBeNull();
  });

  it("an Employee Imprest against bills asks none either", () => {
    const imprest = answer({ company: "OIL" }, { type: "EMPLOYEE_IMPREST" }, { paymentAgainst: "AGAINST_BILL" });
    expect(needsDepartmentHead(imprest)).toBe(false);
  });

  it("a utility bill asks no Bill Due Date: it goes straight to Payment whenever it is due", () => {
    const bill = answer({ company: "OIL" }, { type: "VENDOR" }, { paymentAgainst: "AGAINST_BILL" }, UTILITIES);
    expect(needsBillDueDate(bill)).toBe(false);
    expect(needsDepartmentHead(bill)).toBe(false);
  });

  it("a PO advance still goes to the Department Head", () => {
    const po = answer({ company: "OIL" }, { type: "VENDOR" }, { paymentAgainst: "AGAINST_PO" }, RENT);
    expect(needsDepartmentHead(po)).toBe(true);
  });
});

describe("freight", () => {
  it("asks no Department Head on a vendor, bill or PO", () => {
    for (const paymentAgainst of ["AGAINST_PO", "AGAINST_BILL"] as const) {
      const form = answer({ company: "BEVERAGES" }, { type: "VENDOR" }, { paymentAgainst }, FREIGHT_IN);
      expect(needsDepartmentHead(form)).toBe(false);
    }
  });

  it("an Employee Imprest for freight keeps its Department Head", () => {
    const imprest = answer({ company: "OIL" }, { type: "EMPLOYEE_IMPREST" }, { paymentAgainst: "ADVANCE" }, FREIGHT_IN);
    expect(needsDepartmentHead(imprest)).toBe(true);
  });
});
