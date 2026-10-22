import { describe, expect, it } from "vitest";

import { EMPTY_FORM, needsDepartmentHead, type RequestForm } from "./rules";

const form = (over: Partial<RequestForm>): RequestForm =>
  ({ ...EMPTY_FORM, company: "OIL", type: "VENDOR", paymentAgainst: "AGAINST_BILL", ...over }) as RequestForm;

describe("E-commerce purpose (ASSPL)", () => {
  it("asks no Department Head under the ECOM head: Prabhjot approves", () => {
    expect(needsDepartmentHead(form({ purpose: "ASSPL", budget: "ECOM" }))).toBe(false);
    expect(needsDepartmentHead(form({ purpose: "ASSPL", budget: "ECOM", paymentAgainst: "ON_ACCOUNT" }))).toBe(false);
  });

  it("asks the Department Head under any other head, bills included", () => {
    expect(needsDepartmentHead(form({ purpose: "ASSPL", budget: "Sales" }))).toBe(true);
    expect(needsDepartmentHead(form({ purpose: "ASSPL", budget: "Factory", type: "EMPLOYEE_IMPREST" }))).toBe(true);
  });

  it("asks nothing in Mart, where Prabhjot approves everything", () => {
    expect(needsDepartmentHead(form({ company: "MART", purpose: "ASSPL", budget: "Sales" }))).toBe(false);
  });
});
