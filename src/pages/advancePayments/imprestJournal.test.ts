import { describe, expect, it } from "vitest";

import { applyChange, EMPTY_FORM, resolveCase, splitByPartner, validate, type RequestForm } from "./rules";
import { toApiRequest } from "./requestApi";
import { ledgerToDocument } from "./sapMapping";
import type { SapLedgerDocument } from "../../services/advancePaymentService";

/** The August TA/DA journal entry, as SAP lists it on Raminder Singh's staff account. */
const TA_DA_AUGUST: SapLedgerDocument = {
  trans_id: 236357,
  line_id: 12,
  doc_type_code: 30,
  doc_type: "Journal Entry",
  doc_entry: 236357,
  doc_num: "236357",
  party_ref: "",
  document_date: "2026-09-01",
  posting_date: "2026-09-01",
  due_date: "2026-09-01",
  direction: "CREDIT",
  total_amount: "26290",
  open_amount: "26290",
  settled_amount: "0",
  currency: "INR",
  remarks: "TA DA MONTH OF AUGUST AMOUNT 228815/-",
};

const answer = (...patches: Partial<RequestForm>[]) =>
  patches.reduce<RequestForm>((form, patch) => applyChange(form, patch), EMPTY_FORM);

describe("an Employee Imprest against journal entries (TA/DA, incentive)", () => {
  it("is offered to Employee Imprest only, and lists journal entries", () => {
    const imprest = resolveCase(answer({ company: "OIL", type: "EMPLOYEE_IMPREST" }, { paymentAgainst: "AGAINST_JOURNAL" }));
    expect(imprest.reference).toBe("IMPREST_JOURNAL");
    const vendor = resolveCase(answer({ company: "OIL", type: "VENDOR" }));
    expect(vendor.paymentAgainstOptions.map((o) => o.value)).not.toContain("AGAINST_JOURNAL");
  });

  it("sends each chosen entry by its journal number and line", () => {
    const doc = ledgerToDocument(TA_DA_AUGUST, "ORGV000015", "employee")!;
    expect(doc.note).toBe("Owed to the employee");
    const form = answer(
      { company: "OIL", type: "EMPLOYEE_IMPREST" },
      { paymentAgainst: "AGAINST_JOURNAL" },
      { partner: "ORGV000015", partnerName: "RAMINDER SINGH ASM GT PB IMPREST JWPL0197" },
      { selected: [doc] },
    );
    const [sent] = toApiRequest(form).documents;
    expect(sent).toMatchObject({ kind: "LEDGER", sap_doc_entry: 236357, sap_line: 12, sap_object: 30, direction: "CREDIT" });
  });
});

describe("several employees on one Employee Imprest form", () => {
  const entry = (trans: number, partner: string, amount: string) =>
    ledgerToDocument({ ...TA_DA_AUGUST, trans_id: trans, doc_entry: trans, doc_num: String(trans), open_amount: amount, total_amount: amount }, partner, "employee")!;
  const RAMINDER = entry(236357, "ORGV000015", "26290");
  const SANDEEP = entry(236358, "ORGV000009", "5300");

  const twoEmployees = () =>
    answer(
      { company: "OIL", type: "EMPLOYEE_IMPREST" },
      { paymentAgainst: "AGAINST_JOURNAL" },
      { partner: "ORGV000015", partnerName: "RAMINDER SINGH", morePartners: [{ code: "ORGV000009", name: "SANDEEP DUGGAL" }] },
      { selected: [RAMINDER, SANDEEP] },
    );

  it("keeps each employee's entries", () => {
    expect(twoEmployees().selected.map((d) => d.partner)).toEqual(["ORGV000015", "ORGV000009"]);
  });

  it("drops an employee's entries when they are taken off", () => {
    const form = applyChange(twoEmployees(), { morePartners: [] });
    expect(form.selected.map((d) => d.partner)).toEqual(["ORGV000015"]);
  });

  it("asks for an entry for every employee chosen", () => {
    const form = applyChange(twoEmployees(), { selected: [RAMINDER] });
    expect(validate(form, "2026-10-14").missing).toContain("Journal Entries for SANDEEP DUGGAL");
  });

  it("is split into one request per employee, each with only their own entries", () => {
    const [first, second] = splitByPartner(twoEmployees());
    expect([first.partner, first.selected.map((d) => d.id), first.morePartners]).toEqual(["ORGV000015", [RAMINDER.id], []]);
    expect([second.partner, second.partnerName, second.selected.map((d) => d.id)]).toEqual([
      "ORGV000009",
      "SANDEEP DUGGAL",
      [SANDEEP.id],
    ]);
    expect(Object.keys(second.allocations)).toEqual([SANDEEP.id]);
  });

  it("is offered only to Employee Imprest against documents", () => {
    const advance = answer({ company: "OIL", type: "EMPLOYEE_IMPREST" }, { paymentAgainst: "ADVANCE" });
    expect(resolveCase(advance).multiplePartners).toBe(false);
    const withOthers = applyChange(advance, { partner: "ORGV000015", morePartners: [{ code: "ORGV000009", name: "X" }] });
    expect(withOthers.morePartners).toEqual([]);
  });
});
