import { describe, expect, it } from "vitest";

import { paymentAccountToPartner } from "./sapMapping";
import {
  EMPTY_FORM,
  applyChange,
  needsDepartmentHead,
  paysGlAccount,
  resolveCase,
  suggestedAccountPurpose,
  typesFor,
  type RequestForm,
} from "./rules";

const fill = (...patches: Array<Partial<RequestForm>>) =>
  patches.reduce<RequestForm>((form, patch) => applyChange(form, patch), EMPTY_FORM);

describe("Account Payment: one G/L account that is no business partner", () => {
  it("is offered only where SAP has accounts to pay — Mart", () => {
    expect(typesFor("MART").map((t) => t.value)).toContain("ACCOUNT");
    for (const company of ["OIL", "BEVERAGES", ""]) {
      expect(typesFor(company).map((t) => t.value)).not.toContain("ACCOUNT");
    }
    // Moving the request to a company without any drops the type.
    expect(fill({ company: "MART" }, { type: "ACCOUNT" }, { company: "OIL" }).type).toBe("");
  });

  it("is a typed amount On Account, picked from SAP's accounts, with no Department Head", () => {
    const form = fill({ company: "MART" }, { type: "ACCOUNT" });
    expect(form.paymentAgainst).toBe("ON_ACCOUNT");
    const c = resolveCase(form);
    expect(c.partnerSource).toBe("SAP_ACCOUNTS");
    expect(c.livePartners).toBe(true);
    expect(c.partnerLabel).toBe("Account");
    expect(c.plainAmount).toBe(true);
    expect(c.reference).toBeNull();
    expect(needsDepartmentHead({ ...form, company: "OIL", purposeNeedsHead: true })).toBe(false);
    // Paid to a G/L: no SAP bank accounts or partner ledger to show.
    expect(paysGlAccount("ACCOUNT")).toBe(true);
    expect(paysGlAccount("VENDOR")).toBe(false);
  });

  it("shows an account by its name, with its code and group", () => {
    expect(
      paymentAccountToPartner({
        code: "2120014",
        name: "KATEBAA RURAL SERVICES & FOUNDATION",
        group: "CREDITORS MART",
        balance: "-31459549",
      }),
    ).toEqual({
      value: "2120014",
      label: "KATEBAA RURAL SERVICES & FOUNDATION",
      code: "2120014 · CREDITORS MART",
    });
  });

  it("suggests the purpose from the account", () => {
    expect(suggestedAccountPurpose("2120014", "KATEBAA RURAL SERVICES & FOUNDATION")).toBe(
      "INTERCOMPANY",
    );
    expect(suggestedAccountPurpose("2120019", "Katebaa Rural Services & Solution - PB")).toBe(
      "INTERCOMPANY",
    );
    expect(suggestedAccountPurpose("1110401", "JIVO MART PVT. LTD.-TPT")).toBe("INTERCOMPANY");
    expect(suggestedAccountPurpose("1110403", "JIVO MART PVT LTD - BSU")).toBe("INTERCOMPANY");
    expect(suggestedAccountPurpose("2120023", "G P Stationery Mart")).toBe("FINISHED_GOODS");
    expect(suggestedAccountPurpose("", "")).toBe("");
  });
});
