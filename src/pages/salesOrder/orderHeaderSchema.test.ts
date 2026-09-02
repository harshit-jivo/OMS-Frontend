/**
 * The header rules, which used to be three different sets of rules.
 *
 * The wizard's `canAdvance(1)` and `canAdvance(3)` checked the header;
 * `validateBeforeSave` checked only the PO field; the legacy form checked
 * nothing at all, because the `required` attributes covering those fields sit
 * on `type="hidden"` inputs the browser refuses to validate. These tests are
 * the single set they all now defer to.
 */
import { describe, expect, it } from "vitest";

import {
  headerIssues,
  headerProblem,
  stepOneComplete,
  stepThreeComplete,
  type OrderHeaderInput,
  type PoFieldConfig,
} from "./orderHeaderSchema";

const PO_OPTIONAL: PoFieldConfig = { canEdit: true, required: false, label: "PO Number" };
const PO_REQUIRED: PoFieldConfig = { canEdit: true, required: true, label: "PO Number" };
const PO_HIDDEN: PoFieldConfig = { canEdit: false, required: true, label: "PO Number" };

const header = (overrides: Partial<OrderHeaderInput> = {}): OrderHeaderInput => ({
  parties: "C000123",
  billAddress: "11",
  shipAddress: "21",
  dispatch: "1",
  Deliverydate: "2026-06-20",
  company: "1",
  poNumber: "",
  ...overrides,
});

describe("a complete header", () => {
  it("has nothing to say about it", () => {
    expect(headerIssues(header(), PO_OPTIONAL)).toEqual([]);
    expect(headerProblem(header(), PO_OPTIONAL)).toBeNull();
  });
});

describe("the fields that are sent as numbers", () => {
  it.each([
    ["billAddress", "bill-to address"],
    ["shipAddress", "ship-to address"],
    ["dispatch", "dispatch branch"],
    ["company", "company"],
  ])("rejects a blank %s", (field, name) => {
    const problem = headerProblem(header({ [field]: "" }), PO_OPTIONAL);
    expect(problem).toBe(`Choose a ${name}.`);
  });

  it("rejects a non-numeric id, which would be sent as null", () => {
    // `submitOrder` sends `Number(formData.billAddress)`. A label where an id
    // was expected becomes NaN, serialises to null, and the order saves
    // against no address — with no error anywhere.
    expect(headerProblem(header({ billAddress: "Head Office" }), PO_OPTIONAL)).toBe(
      "The bill-to address could not be read — choose it again.",
    );
  });
});

describe("the fields that are sent as text", () => {
  it("needs a party", () => {
    expect(headerProblem(header({ parties: "" }), PO_OPTIONAL)).toBe("Choose a party.");
  });

  it("needs a delivery date", () => {
    expect(headerProblem(header({ Deliverydate: "" }), PO_OPTIONAL)).toBe(
      "Choose a delivery date.",
    );
  });

  it("does not require the party to look like an id", () => {
    // A card code is "C000123" — text, not digits, and the one id-shaped field
    // that is not actually numeric.
    expect(headerProblem(header({ parties: "C000123" }), PO_OPTIONAL)).toBeNull();
  });
});

describe("the PO field, which is admin-controlled", () => {
  it("is optional by default", () => {
    expect(headerProblem(header({ poNumber: "" }), PO_OPTIONAL)).toBeNull();
  });

  it("is demanded only when the admin flag says so", () => {
    expect(headerProblem(header({ poNumber: "" }), PO_REQUIRED)).toBe("PO Number is required.");
    expect(headerProblem(header({ poNumber: "PO-902" }), PO_REQUIRED)).toBeNull();
  });

  it("is not demanded when the field is not even shown", () => {
    // The flag can be left on for a role that cannot edit PO at all. Demanding
    // a value nobody can type is how a form becomes unsubmittable.
    expect(headerProblem(header({ poNumber: "" }), PO_HIDDEN)).toBeNull();
  });

  it("treats whitespace as empty", () => {
    expect(headerProblem(header({ poNumber: "   " }), PO_REQUIRED)).toBe("PO Number is required.");
  });
});

describe("the wizard's step gates", () => {
  it("lets step 1 pass without the company, which lives on step 3", () => {
    expect(stepOneComplete(header({ company: "" }), PO_OPTIONAL)).toBe(true);
    expect(stepThreeComplete(header({ company: "" }), PO_OPTIONAL)).toBe(false);
  });

  it("holds step 1 until the addresses are chosen", () => {
    // `handlePartySelect` deliberately blanks both, and nothing refills them.
    expect(stepOneComplete(header({ billAddress: "", shipAddress: "" }), PO_OPTIONAL)).toBe(false);
  });

  it("never traps the user on a step that cannot fix the problem", () => {
    // A required PO is a step 3 field. If it gated step 1, the only screen
    // showing the PO input would be unreachable.
    expect(stepOneComplete(header({ poNumber: "" }), PO_REQUIRED)).toBe(true);
    expect(stepThreeComplete(header({ poNumber: "" }), PO_REQUIRED)).toBe(true);
  });
});

describe("reporting", () => {
  it("lists every problem, not just the first", () => {
    // `headerProblem` is what today's alert shows; `headerIssues` is what
    // step 7 needs to mark each field with its own message.
    const issues = headerIssues(
      header({ parties: "", billAddress: "", company: "", poNumber: "" }),
      PO_REQUIRED,
    );

    expect(issues.map((issue) => issue.field)).toEqual([
      "parties",
      "billAddress",
      "company",
      "poNumber",
    ]);
  });
});
