import { describe, expect, it } from "vitest";

import {
  employeeToPartner,
  invoiceToDocument,
  sapAmount,
  vendorToPartner,
  withCodePrefix,
} from "./sapMapping";
import { SAP_EMPLOYEES, SAP_OPEN_INVOICES, SAP_VENDORS } from "./testData";

describe("SAP rows → form data", () => {
  it("parses SAP's string money, to the paisa, and never yields NaN", () => {
    expect(sapAmount("150000.000000")).toBe(150000);
    expect(sapAmount("1234.567")).toBe(1234.57);
    expect(sapAmount(null)).toBe(0);
    expect(sapAmount("not a number")).toBe(0);
  });

  it("keeps only codes that START with the prefix — never a name that contains it", () => {
    const codes = (prefix?: string) => withCodePrefix(SAP_VENDORS, prefix).map((v) => v.card_code);
    expect(codes("VENDA")).toEqual([
      "VENDA000101",
      "VENDA000102",
      "VENDA000103",
      "VENDA000104",
      "VENDA000105", // "ORGVALE LOGISTICS" — a vendor, despite its name
    ]);
    expect(codes("ORGV")).toEqual(["ORGV000901", "ORGV000902"]);
    expect(codes("orgv")).toEqual(["ORGV000901", "ORGV000902"]);
    expect(codes(undefined)).toHaveLength(SAP_VENDORS.length);
  });

  it("keys a vendor by its CardCode", () => {
    expect(vendorToPartner(SAP_VENDORS[0])).toEqual({
      value: "VENDA000101",
      label: "ABC Technologies",
      code: "VENDA000101",
    });
  });

  it("keys an employee by the advance GL account, and shows the payroll code beside it", () => {
    expect(employeeToPartner(SAP_EMPLOYEES[0])).toEqual({
      value: "1113035",
      label: "RAVINDER SINGH SHUNTY",
      code: "JWPL0035 · 1113035",
    });
  });

  it("falls back to the account name when no employee name was parsed", () => {
    const partner = employeeToPartner({
      ...SAP_EMPLOYEES[0],
      employee_name: "",
      employee_code: "",
    });
    expect(partner.label).toBe("RAVINDER SINGH SHUNTY ADVANCE JWPL0035");
    expect(partner.code).toBe("1113035");
  });

  it("turns an open A/P invoice into a document whose open amount is SAP's balance due", () => {
    expect(invoiceToDocument(SAP_OPEN_INVOICES[0])).toMatchObject({
      id: "PCH-10256",
      number: "10256",
      partner: "VENDA000101",
      original: 250000,
      paid: 100000,
      open: 150000,
      reference: "ABC/INV/7781",
      dueDate: "2026-09-03",
    });
  });

  it("leaves out an empty vendor reference", () => {
    expect(invoiceToDocument(SAP_OPEN_INVOICES[1]).reference).toBeUndefined();
  });
});
