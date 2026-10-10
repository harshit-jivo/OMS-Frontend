import { describe, expect, it } from "vitest";

import type { OpenDocument } from "./constants";
import {
  employeeToPartner,
  invoiceToDocument,
  sapAmount,
  sapTdsLabel,
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

  it("dates a bill by the date on it (Document Date), not when SAP posted it", () => {
    const bill = { ...SAP_OPEN_INVOICES[0], doc_date: "2026-09-01", document_date: "2026-08-31", due_date: "2026-09-28" };
    expect(invoiceToDocument(bill)).toMatchObject({ date: "2026-08-31", dueDate: "2026-09-28" });
    // A server that sends no Document Date yet: the posting date, as before.
    expect(invoiceToDocument({ ...bill, document_date: null }).date).toBe("2026-09-01");
  });

  it("leaves out an empty vendor reference", () => {
    expect(invoiceToDocument(SAP_OPEN_INVOICES[1]).reference).toBeUndefined();
  });

  it("carries the latest SAP attachment with what it takes to fetch it", () => {
    expect(invoiceToDocument(SAP_OPEN_INVOICES[0], "MART").attachment).toEqual({
      company: "MART",
      kind: "bill",
      docEntry: 10256,
      fileName: "DocScanner Sep 17, 2026 12-39 PM.pdf",
      count: 3,
      date: "2026-09-17",
    });
    // None in SAP, or no company to fetch it from: nothing to open.
    expect(invoiceToDocument(SAP_OPEN_INVOICES[1], "MART").attachment).toBeUndefined();
    expect(invoiceToDocument(SAP_OPEN_INVOICES[0]).attachment).toBeUndefined();
  });
});

describe("TDS in SAP", () => {
  const doc = (sapTds?: OpenDocument["sapTds"]) =>
    ({ id: "x", number: "1", date: "2026-10-01", partner: "V1", original: 0, paid: 0, open: 0, sapTds }) as OpenDocument;

  it("says what SAP withheld on a bill, or that it withheld none", () => {
    expect(sapTdsLabel(doc({ amount: 37500 }))).toBe("TDS deducted in SAP ₹37,500");
    expect(sapTdsLabel(doc({ amount: 0 }))).toBe("No TDS deducted in SAP");
  });

  it("speaks for a PO's bills — SAP never carries TDS on the PO itself", () => {
    expect(sapTdsLabel(doc({ amount: 12589, bills: 2 }))).toBe("TDS deducted in SAP ₹12,589 on its 2 bills");
    expect(sapTdsLabel(doc({ amount: 0, bills: 1 }))).toBe("No TDS deducted in SAP on its 1 bill");
    expect(sapTdsLabel(doc({ amount: 0, bills: 0 }))).toBe("Not billed yet — no TDS deducted in SAP");
  });

  it("says nothing when SAP was not asked", () => {
    expect(sapTdsLabel(doc())).toBeNull();
  });
});
