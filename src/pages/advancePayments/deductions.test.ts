import { describe, expect, it } from "vitest";

import type { OpenDocument } from "./constants";
import { deductionTargets, deductionsOf } from "./deductions";

const doc = (id: string) => ({ id }) as OpenDocument;

describe("what SAP already took off a request's documents", () => {
  it("asks about the bills, else the POs, else nothing", () => {
    expect(deductionTargets([doc("PCH-7"), doc("PCH-8")])).toEqual({ kind: "bill", entries: [7, 8] });
    expect(deductionTargets([doc("POR-5")])).toEqual({ kind: "po", entries: [5] });
    expect(deductionTargets([doc("LDG-30-1-0")])).toBeNull();
  });

  it("keys each bill by its id and totals the TDS and debit notes", () => {
    const out = deductionsOf("bill", [
      { doc_entry: 7, tds: "23695.00", bills: null, debits: { amount: "8140.00", notes: [725025903] } },
      { doc_entry: 8, tds: "14870", bills: null, debits: { amount: "0", notes: [] } },
      { doc_entry: 9, tds: "0", bills: null, debits: null },
    ]);
    expect(out.byId.get("PCH-7")).toEqual({ tds: 23695, bills: null, debit: 8140, notes: [725025903] });
    expect(out.byId.get("PCH-9")?.debit).toBe(0);
    expect(out.tds).toBe(38565);
    expect(out.debit).toBe(8140);
  });

  it("keys a PO's figures by the PO", () => {
    const out = deductionsOf("po", [{ doc_entry: 5, tds: "500", bills: 2, debits: { amount: "0", notes: [] } }]);
    expect(out.byId.get("POR-5")).toMatchObject({ tds: 500, bills: 2 });
  });
});
