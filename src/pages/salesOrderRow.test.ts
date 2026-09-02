/**
 * The two rules that changed, and why they are worth a test.
 *
 * Both were decisions rather than refactors: PO stopped being unconditionally
 * mandatory, and a missing pack size stopped being reported as something the
 * user forgot to type. Neither is visible to the visual suite — an alert()
 * leaves no pixels — and Add_Sales has no interaction coverage at all, so
 * without these the change is asserted rather than shown.
 *
 * `rowProblem` lives in salesOrderRow.ts and is pure, so this costs no
 * mounting of a 4,200-line page.
 */
import { describe, expect, it } from "vitest";

import { createEmptyRow, rowProblem, type SalesRow } from "./salesOrderRow";

/** A row that would confirm cleanly, so each test can break exactly one thing. */
function goodRow(over: Partial<SalesRow> = {}): SalesRow {
  return {
    ...createEmptyRow(),
    category: "Edible Oil",
    type: "1 LTR",
    item: "JIVO CANOLA OIL 1 LTR",
    pcs: "12",
    boxes: "5",
    qty: "60",
    ...over,
  };
}

describe("rowProblem", () => {
  it("passes a complete row", () => {
    expect(rowProblem(goodRow())).toBeNull();
  });

  it("names the item master when the pack size is missing", () => {
    // `pcs` comes from the product's sal_factor2 and BOTH of its inputs are
    // readOnly, so the old "must have PCS, boxes and quantity greater than 0"
    // told the user to fix a field with no keyboard path to it.
    const problem = rowProblem(goodRow({ pcs: "" }));
    expect(problem).toContain("no pack size in the item master");
    expect(problem).not.toMatch(/PCS/i);
  });

  it("treats a zero pack size the same as a blank one", () => {
    // String(0) is truthy, so a real 0 from SAP takes a different path through
    // the assignment than `null ?? ""` does — both must land here.
    expect(rowProblem(goodRow({ pcs: "0" }))).toContain("no pack size");
  });

  it("still blocks boxes and quantity, with their own message", () => {
    expect(rowProblem(goodRow({ boxes: "0" }))).toBe("Enter boxes and quantity greater than 0.");
    expect(rowProblem(goodRow({ qty: "" }))).toBe("Enter boxes and quantity greater than 0.");
  });

  it("reports the pack size before boxes, because it is the one nobody can fix here", () => {
    expect(rowProblem(goodRow({ pcs: "", boxes: "0" }))).toContain("no pack size");
  });

  it("asks for the item first when nothing is chosen", () => {
    expect(rowProblem(createEmptyRow())).toBe("Choose a category, type and item for this line.");
  });

  it("requires a scheme and a quantity on every scheme line", () => {
    expect(
      rowProblem(goodRow({ isScheme: true, schemes: [{ scheme: "7", schemeQty: "0" }] })),
    ).toContain("scheme line");
    expect(
      rowProblem(goodRow({ isScheme: true, schemes: [{ scheme: "7", schemeQty: "3" }] })),
    ).toBeNull();
  });

  it("does not reject a scheme row that arrived with no scheme lines", () => {
    // mapOrderToRows can hydrate isScheme: true with schemes: [] and
    // confirmed: true. Tightening this would reject orders that load and save
    // fine today, so .every()'s vacuous truth on [] is deliberate here.
    expect(rowProblem(goodRow({ isScheme: true, schemes: [] }))).toBeNull();
  });
});

describe("row identity", () => {
  it("gives every row a uid of its own", () => {
    const a = createEmptyRow();
    const b = createEmptyRow();

    // The scheme maps beside `rows` are keyed by this. Two rows sharing a uid
    // would share their scheme options and their engine proposals — the exact
    // failure that keying by array position produced on every delete.
    expect(a.uid).toBeTruthy();
    expect(b.uid).not.toBe(a.uid);
  });

  it("keeps a uid stable across the edits a row goes through", () => {
    const row = createEmptyRow();

    // Every handler in the form updates rows by spreading, so the uid rides
    // along untouched. If one ever rebuilt a row from scratch instead, its
    // schemes would silently detach — this is the assertion that would fail.
    const edited = { ...row, boxes: "5", confirmed: true };

    expect(edited.uid).toBe(row.uid);
  });
});
