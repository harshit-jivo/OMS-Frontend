/**
 * Utilities and insurance (user, 2026-10-17): the requester types the Bill
 * Due Date, a vendor may be paid On Account for them only, and a bill due
 * within 2 days skips the approvals. The server applies the same rules
 * (`purposes.needs_bill_due_date`, `hierarchy.BILL_DUE_SOON`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toApiRequest } from "./requestApi";
import {
  EMPTY_FORM,
  applyChange,
  dueSoon,
  needsBillDueDate,
  needsDepartmentHead,
  paymentDateIsToday,
  paysToday,
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
    // Any purpose since 2026-10-21.
    expect(c.dueDatePurposesOnly).toBe(false);
  });

  it("takes any purpose, through the Department Head picked", () => {
    expect(electricityOnAccount().purpose).toBe("UTILITIES");
    const rent = electricityOnAccount(RENT);
    expect(rent.purpose).toBe("RENT");
    expect(needsDepartmentHead(rent)).toBe(true);
    // A fixed owner's purpose too: on account, the head is asked.
    const material = { ...rent, purpose: "RAW_MATERIAL", purposeNeedsHead: false };
    expect(needsDepartmentHead(material)).toBe(true);
    expect(needsDepartmentHead({ ...material, paymentAgainst: "AGAINST_PO" })).toBe(false);
    // Freight keeps its own route: Navdeep.
    expect(needsDepartmentHead({ ...material, purpose: "FREIGHT_IN" })).toBe(false);
  });

  it("leaves Against Bill free to take any purpose", () => {
    const form = applyChange(electricityOnAccount(), { paymentAgainst: "AGAINST_BILL" });
    expect(resolveCase(form).dueDatePurposesOnly).toBe(false);
    expect(applyChange(form, RENT).purpose).toBe("RENT");
  });
});

describe("the Bill Due Date", () => {
  it("is asked for utilities and insurance in every company, on a vendor", () => {
    expect(needsBillDueDate(electricityOnAccount())).toBe(true);
    // Mart too, since 2026-10-21; and Beverages as Oil.
    expect(needsBillDueDate({ ...electricityOnAccount(), company: "MART" })).toBe(true);
    expect(needsBillDueDate({ ...electricityOnAccount(), company: "BEVERAGES" })).toBe(true);
    // Any other purpose: never, in any company — picking it clears the date.
    for (const company of ["OIL", "BEVERAGES", "MART"] as const) {
      const rent = applyChange({ ...electricityOnAccount(), company }, RENT);
      expect(needsBillDueDate(rent)).toBe(false);
      expect(rent.billDueDate).toBe("");
    }
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

describe("due in 2 days or less", () => {
  // Due 20 Oct: raised on the 17th or before, the full route; the 18th or later, straight to Payment.
  it.each([
    ["2026-10-16", false],
    ["2026-10-17", false],
    ["2026-10-18", true],
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

describe("due soon: straight to the Payment desk (user, 2026-10-19)", () => {
  // Today is 19 Oct 2026, India.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 19, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  it.each(["2026-10-21", "2026-10-20", "2026-10-19", "2026-10-02"])(
    "due %s: no Department Head, paid the day it is raised",
    (billDueDate) => {
      const form = electricityOnAccount({ billDueDate });
      expect(paysToday(form)).toBe(true);
      expect(needsDepartmentHead(form)).toBe(false);
      expect(form.departmentHead).toBe("");
      expect(form.paymentDate).toBe("2026-10-19");
      expect(validate(form).missing).toEqual([]);
      const input = toApiRequest(form);
      expect(input.department_head_code).toBeNull();
      expect(input.payment_date).toBe("2026-10-19");
    },
  );

  it("due in more than 2 days: the chosen Department Head; on account, still paid the day it is raised", () => {
    const form = electricityOnAccount({ billDueDate: "2026-10-22", paymentDate: "2026-10-21" });
    expect(paysToday(form)).toBe(false);
    expect(needsDepartmentHead(form)).toBe(true);
    expect(form.departmentHead).toBe("TEMP0001");
    expect(paymentDateIsToday(form)).toBe(true);
    expect(form.paymentDate).toBe("2026-10-19");
  });

  it("against a bill, a far-off due date keeps the Payment Date the requester types", () => {
    const form = electricityOnAccount({ paymentAgainst: "AGAINST_BILL" });
    const typed = applyChange({ ...form, ...UTILITIES }, { billDueDate: "2026-11-30", paymentDate: "2026-11-25" });
    expect(paymentDateIsToday(typed)).toBe(false);
    expect(typed.paymentDate).toBe("2026-11-25");
  });

  it("moving the date out again asks for a head once more", () => {
    const soon = electricityOnAccount({ billDueDate: "2026-10-20" });
    const later = applyChange(soon, { billDueDate: "2026-11-30" });
    expect(needsDepartmentHead(later)).toBe(true);
    expect(validate(later).missing).toContain("Department Head");
  });
});
