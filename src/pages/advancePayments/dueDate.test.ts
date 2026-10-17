/**
 * Utilities and insurance (user, 2026-10-17): the requester types the Bill
 * Due Date, a vendor may be paid On Account for them only, and a bill due
 * within 2 days skips the approvals. The server applies the same rules
 * (`purposes.needs_bill_due_date`, `hierarchy.BILL_DUE_SOON`).
 */
import { describe, expect, it } from "vitest";

import { toApiRequest } from "./requestApi";
import {
  EMPTY_FORM,
  applyChange,
  dueSoon,
  needsBillDueDate,
  resolveCase,
  validate,
  type RequestForm,
} from "./rules";

const UTILITIES = { purpose: "UTILITIES", purposeLabel: "Electricity, Water & Utilities", purposeNeedsHead: true, purposeDueDate: true };
const RENT = { purpose: "RENT", purposeLabel: "Rent", purposeNeedsHead: true, purposeDueDate: false };

/** A vendor paid on account for electricity, every answer given. */
function electricityOnAccount(patch: Partial<RequestForm> = {}): RequestForm {
  let form = applyChange(EMPTY_FORM, { company: "OIL" });
  form = applyChange(form, { type: "VENDOR" });
  form = applyChange(form, { paymentAgainst: "ON_ACCOUNT" });
  form = applyChange(form, { partner: "VENDA000521", partnerName: "UTTAR HARYANA BIJLI VITRAN NIGAM LIMITED" });
  form = applyChange(form, {
    ...UTILITIES,
    amount: "45886",
    budget: "FACT_COM",
    budgetName: "Factory Common",
    departmentHead: "TEMP0001",
    departmentHeadName: "Gagan",
    departmentHeadLogin: "gagan",
    ownership: "Gagan (TEMP0001)",
    paymentDate: "2026-12-01",
    remarks: "October electricity",
    billDueDate: "2026-12-05",
  });
  return applyChange(form, patch);
}

describe("Vendor On Account", () => {
  it("is a typed amount, with no documents", () => {
    const c = resolveCase(electricityOnAccount());
    expect(c.decided).toBe(true);
    expect(c.plainAmount).toBe(true);
    expect(c.reference).toBeNull();
    expect(c.dueDatePurposesOnly).toBe(true);
  });

  it("keeps only a purpose paid by a due date", () => {
    expect(electricityOnAccount().purpose).toBe("UTILITIES");
    const rent = electricityOnAccount(RENT);
    expect(rent.purpose).toBe("");
    expect(rent.purposeLabel).toBe("");
  });

  it("leaves Against Bill free to take any purpose", () => {
    const form = applyChange(electricityOnAccount(), { paymentAgainst: "AGAINST_BILL" });
    expect(resolveCase(form).dueDatePurposesOnly).toBe(false);
    expect(applyChange(form, RENT).purpose).toBe("RENT");
  });
});

describe("the Bill Due Date", () => {
  it("is asked for utilities and insurance outside Mart, on a vendor", () => {
    expect(needsBillDueDate(electricityOnAccount())).toBe(true);
    expect(needsBillDueDate({ ...electricityOnAccount(), company: "MART" })).toBe(false);
    expect(needsBillDueDate({ ...electricityOnAccount(), type: "EMPLOYEE_IMPREST" })).toBe(false);
    expect(needsBillDueDate({ ...electricityOnAccount(), purposeDueDate: false })).toBe(false);
  });

  it("is required, and an overdue date is allowed", () => {
    expect(validate(electricityOnAccount({ billDueDate: "" })).missing).toContain("Bill Due Date");
    const overdue = validate(electricityOnAccount({ billDueDate: "2026-01-10" }));
    expect(overdue.missing).toEqual([]);
    expect(overdue.problems).toEqual([]);
  });

  it("is cleared with the purpose that asked it", () => {
    const form = applyChange(electricityOnAccount({ paymentAgainst: "AGAINST_BILL" }), RENT);
    expect(form.billDueDate).toBe("");
  });

  it("is sent only where it is asked", () => {
    expect(toApiRequest(electricityOnAccount()).bill_due_date).toBe("2026-12-05");
    expect(toApiRequest(electricityOnAccount()).payment_against).toBe("ON_ACCOUNT");
    expect(toApiRequest({ ...electricityOnAccount(), purposeDueDate: false }).bill_due_date).toBeNull();
  });
});

describe("due within 2 days", () => {
  // Due 20 Oct: raised on the 18th or before, the full route; the 19th or later, straight to Payment.
  it.each([
    ["2026-10-17", false],
    ["2026-10-18", false],
    ["2026-10-19", true],
    ["2026-10-20", true],
    ["2026-10-22", true],
  ])("raised %s: skips the approvals = %s", (today, skips) => {
    expect(dueSoon("2026-10-20", today)).toBe(skips);
  });

  it("needs a date to decide", () => {
    expect(dueSoon("", "2026-10-19")).toBe(false);
  });
});
