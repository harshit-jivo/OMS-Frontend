/**
 * The street printed under a Bill To / Ship To label on Add Sales.
 *
 * The label itself is `address_name || full_address || address_id`, which is
 * the whole reason this needs a rule rather than just rendering
 * `full_address`: for an address with no name the label IS the street, and
 * printing it again underneath is the same line twice in two sizes.
 */
import { describe, expect, it } from "vitest";

import { addressStreet } from "./useSalesOrderForm";

describe("the street under an address label", () => {
  it("is the full address when the label is a name", () => {
    expect(
      addressStreet({
        address_name: "Head Office",
        full_address: "12 Mall Road, Ludhiana, Punjab 141001",
      }),
    ).toBe("12 Mall Road, Ludhiana, Punjab 141001");
  });

  it("is empty when the address has no name, because the label is already the street", () => {
    expect(
      addressStreet({ address_name: "", full_address: "12 Mall Road, Ludhiana" }),
    ).toBe("");
  });

  it("is empty when the name and the street are the same text", () => {
    // Real on live: some CRD1 rows carry the street as the Address name too.
    expect(
      addressStreet({ address_name: "12 Mall Road", full_address: "12 Mall Road" }),
    ).toBe("");
  });

  it("is empty when SAP recorded no street", () => {
    expect(addressStreet({ address_name: "Head Office", full_address: null })).toBe("");
    expect(addressStreet({ address_name: "Head Office", full_address: "   " })).toBe("");
  });

  it("survives a missing address rather than throwing", () => {
    // The pickers render before a party is chosen.
    expect(addressStreet(undefined)).toBe("");
    expect(addressStreet({})).toBe("");
  });
});
