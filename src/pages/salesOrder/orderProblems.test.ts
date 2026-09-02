/**
 * What the form says is wrong, and where it says it.
 *
 * These are the rules the six `alert()` calls used to encode. An alert cannot
 * be asserted without stubbing `window.alert` and taking the page's word for
 * what it meant; a map from field to message can be asserted directly, which is
 * most of the reason for the change.
 */
import { describe, expect, it } from "vitest";

import { createEmptyRow, type SalesRow } from "../salesOrderRow";
import type { OrderHeaderInput, PoFieldConfig } from "./orderHeaderSchema";
import { firstProblem, hasProblems, orderProblems } from "./orderProblems";

const PO: PoFieldConfig = { canEdit: true, required: false, label: "PO Number" };

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

const goodRow = (overrides: Partial<SalesRow> = {}): SalesRow => ({
  ...createEmptyRow(),
  category: "Edible Oil",
  type: "1 LTR",
  item: "JIVO CANOLA OIL 1 LTR",
  pcs: "12",
  boxes: "5",
  qty: "60",
  confirmed: true,
  ...overrides,
});

describe("an order with nothing wrong", () => {
  it("reports nothing", () => {
    const problems = orderProblems(header(), PO, [goodRow()]);

    expect(hasProblems(problems)).toBe(false);
    expect(firstProblem(problems)).toBeNull();
  });
});

describe("the item list", () => {
  it("asks for an item when there are none confirmed", () => {
    expect(orderProblems(header(), PO, [createEmptyRow()]).items).toBe(
      "Add at least one item, and confirm it, before saving.",
    );
  });

  it("asks for the half-entered row to be confirmed", () => {
    // A row with an item chosen but not confirmed looks finished on screen.
    const problems = orderProblems(header(), PO, [goodRow(), goodRow({ confirmed: false })]);

    expect(problems.items).toBe("Confirm the item you are still editing before saving.");
  });

  it("says nothing about a blank row sitting after a good one", () => {
    // The form always keeps one empty row to type into. Treating that as an
    // unconfirmed item would make every order unsaveable.
    const problems = orderProblems(header(), PO, [goodRow(), createEmptyRow()]);

    expect(problems.items).toBeNull();
  });
});

describe("rows", () => {
  it("keys each message by the row's uid, not its position", () => {
    // Keyed by position, deleting the first row would move this message onto
    // the second one — the failure mode the whole uid change exists to stop.
    const bad = goodRow({ pcs: "0" });
    const problems = orderProblems(header(), PO, [goodRow(), bad]);

    expect(Object.keys(problems.rows)).toEqual([bad.uid]);
    expect(problems.rows[bad.uid]).toContain("no pack size in the item master");
  });

  it("re-checks rows that arrived already confirmed", () => {
    // `mapOrderToRows` hydrates a loaded order with `confirmed: true`, so those
    // rows never pass the confirm gate. This is the only thing that looks at
    // them.
    const problems = orderProblems(header(), PO, [goodRow({ boxes: "0", qty: "0" })]);

    expect(Object.values(problems.rows)[0]).toBe("Enter boxes and quantity greater than 0.");
  });

  it("reports every bad row, not just the first", () => {
    const problems = orderProblems(header(), PO, [goodRow({ pcs: "0" }), goodRow({ qty: "0" })]);

    expect(Object.keys(problems.rows)).toHaveLength(2);
  });
});

describe("the header", () => {
  it("reports each field under its own name", () => {
    const problems = orderProblems(header({ shipAddress: "", company: "" }), PO, [goodRow()]);

    expect(problems.header.shipAddress).toBe("Choose a ship-to address.");
    expect(problems.header.company).toBe("Choose a company.");
    expect(problems.header.parties).toBeUndefined();
  });
});

describe("everything at once", () => {
  it("collects all of it in one pass", () => {
    // The point of the change: six empty fields used to mean six submits, each
    // answered by one dialog.
    const problems = orderProblems(header({ parties: "", shipAddress: "", company: "" }), PO, [
      createEmptyRow(),
    ]);

    expect(Object.keys(problems.header)).toEqual(["parties", "shipAddress", "company"]);
    expect(problems.items).toBeTruthy();
    expect(hasProblems(problems)).toBe(true);
  });

  it("leads with the item list, which is what the old alert chain did first", () => {
    const problems = orderProblems(header({ parties: "" }), PO, [createEmptyRow()]);

    expect(firstProblem(problems)).toBe("Add at least one item, and confirm it, before saving.");
  });
});
