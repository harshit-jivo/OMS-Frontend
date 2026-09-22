import { describe, expect, it } from "vitest";

import {
  EMPTY_INVOICE_FILTERS,
  activeFilterCount,
  applyInvoiceFilters,
  statusOptionsOf,
  tabSupportsFilters,
  tabSupportsStatusFilter,
  warehouseOptionsOf,
  type InvoiceFilters,
} from "./filters";
import type { InvoiceRecord } from "./types";

/**
 * Narrowing the Invoice Review archive.
 *
 * Every case here is a way a reviewer can be shown the wrong set: a search
 * that only matches one field, a date range that quietly drops rows, a status
 * chosen on one tab still narrowing another. The list is the record of what
 * went to SAP, so "showed too few" is as wrong as "showed too many".
 */
const record = (over: Partial<InvoiceRecord> = {}): InvoiceRecord => ({
  id: 1,
  so_number: "SO-9001",
  party_name: "Northern Traders",
  warehouse: "GP-FGM",
  status: "POSTED_TO_SAP",
  created_at: "2026-06-15T10:24:00+05:30",
  created_by_name: "Amit Kumar",
  sap_doc_num: "5150",
  total_amount: 6420,
  ...over,
});

const withFilters = (over: Partial<InvoiceFilters>): InvoiceFilters => ({
  ...EMPTY_INVOICE_FILTERS,
  ...over,
});

const numbers = (rows: InvoiceRecord[]) => rows.map((row) => row.so_number);

describe("which tabs carry a filter bar", () => {
  it("gives one to the two archive tabs", () => {
    expect(tabSupportsFilters("ALL")).toBe(true);
    expect(tabSupportsFilters("POSTED_TO_SAP")).toBe(true);
  });

  it("leaves the work queues alone", () => {
    // They are opened to be cleared, are short by definition, and a filter bar
    // over eleven rows is furniture.
    for (const tab of ["PENDING", "APPROVED", "REJECTED", "EDITED", "ERROR", "CL_RAISED"] as const) {
      expect(tabSupportsFilters(tab), tab).toBe(false);
    }
  });

  it("offers the status picker only where the tab has not already fixed it", () => {
    expect(tabSupportsStatusFilter("ALL")).toBe(true);
    expect(tabSupportsStatusFilter("POSTED_TO_SAP")).toBe(false);
  });
});

describe("the omni-search", () => {
  const rows = [
    record({ so_number: "SO-9001", party_name: "Northern Traders" }),
    record({ id: 2, so_number: "SO-9002", party_name: "Southern Supply", sap_doc_num: "7788" }),
    record({ id: 3, so_number: "SO-9003", party_name: "Eastern Foods", created_by_name: "Priya" }),
  ];

  it("returns everything for an empty query", () => {
    expect(applyInvoiceFilters(rows, EMPTY_INVOICE_FILTERS)).toBe(rows);
  });

  it("finds a row by its SO number", () => {
    expect(numbers(applyInvoiceFilters(rows, withFilters({ search: "9002" })))).toEqual(["SO-9002"]);
  });

  it("finds a row by party name", () => {
    expect(numbers(applyInvoiceFilters(rows, withFilters({ search: "eastern" })))).toEqual([
      "SO-9003",
    ]);
  });

  it("finds a row by the SAP document number", () => {
    // The number billing quotes when SAP disagrees with us about an invoice.
    expect(numbers(applyInvoiceFilters(rows, withFilters({ search: "7788" })))).toEqual(["SO-9002"]);
  });

  it("finds a row by who submitted it", () => {
    expect(numbers(applyInvoiceFilters(rows, withFilters({ search: "priya" })))).toEqual([
      "SO-9003",
    ]);
  });

  it("matches tokens across different fields, in any order", () => {
    // One box over several columns is the whole point of "omni" — typing the
    // party and the SO number together must not come back empty because no
    // single field holds both.
    expect(numbers(applyInvoiceFilters(rows, withFilters({ search: "9001 northern" })))).toEqual([
      "SO-9001",
    ]);
    expect(numbers(applyInvoiceFilters(rows, withFilters({ search: "northern 9001" })))).toEqual([
      "SO-9001",
    ]);
  });

  it("ignores case and stray spacing", () => {
    expect(
      numbers(applyInvoiceFilters(rows, withFilters({ search: "  NORTHERN   traders " }))),
    ).toEqual(["SO-9001"]);
  });

  it("keeps the list newest-first rather than ranking by relevance", () => {
    // The table is deliberately ordered; a search that reshuffled it would
    // answer a question nobody asked.
    const matched = applyInvoiceFilters(rows, withFilters({ search: "so-900" }));
    expect(numbers(matched)).toEqual(["SO-9001", "SO-9002", "SO-9003"]);
  });
});

describe("the warehouse and status pickers", () => {
  const rows = [
    record({ so_number: "A", warehouse: "GP-FGM", status: "POSTED_TO_SAP" }),
    record({ id: 2, so_number: "B", warehouse: "DL-MP", status: "ERROR" }),
    record({ id: 3, so_number: "C", warehouse: "GP-FGM", status: "PENDING" }),
  ];

  it("offers only the warehouses actually present, sorted", () => {
    // Offering one that yields nothing is a filter that looks broken when it
    // is merely empty.
    expect(warehouseOptionsOf(rows)).toEqual(["DL-MP", "GP-FGM"]);
  });

  it("leaves blank warehouses out of the options", () => {
    expect(warehouseOptionsOf([record({ warehouse: "" }), record({ id: 2 })])).toEqual(["GP-FGM"]);
  });

  it("offers only the statuses actually present", () => {
    expect(statusOptionsOf(rows)).toEqual(["ERROR", "PENDING", "POSTED_TO_SAP"]);
  });

  it("narrows to the chosen warehouses", () => {
    expect(numbers(applyInvoiceFilters(rows, withFilters({ warehouses: ["GP-FGM"] })))).toEqual([
      "A",
      "C",
    ]);
  });

  it("treats several chosen warehouses as OR", () => {
    expect(
      numbers(applyInvoiceFilters(rows, withFilters({ warehouses: ["GP-FGM", "DL-MP"] }))),
    ).toEqual(["A", "B", "C"]);
  });

  it("narrows to the chosen statuses", () => {
    expect(numbers(applyInvoiceFilters(rows, withFilters({ statuses: ["ERROR"] })))).toEqual(["B"]);
  });

  it("ANDs the pickers with each other", () => {
    expect(
      numbers(
        applyInvoiceFilters(rows, withFilters({ warehouses: ["GP-FGM"], statuses: ["PENDING"] })),
      ),
    ).toEqual(["C"]);
  });
});

describe("the submitted-date range", () => {
  const rows = [
    record({ so_number: "JUN-14", created_at: "2026-06-14T18:00:00+05:30" }),
    record({ id: 2, so_number: "JUN-15", created_at: "2026-06-15T10:24:00+05:30" }),
    record({ id: 3, so_number: "JUN-16", created_at: "2026-06-16T09:00:00+05:30" }),
  ];

  it("includes both ends of the range", () => {
    expect(
      numbers(applyInvoiceFilters(rows, withFilters({ from: "2026-06-14", to: "2026-06-15" }))),
    ).toEqual(["JUN-14", "JUN-15"]);
  });

  it("accepts a start with no end", () => {
    expect(numbers(applyInvoiceFilters(rows, withFilters({ from: "2026-06-16" })))).toEqual([
      "JUN-16",
    ]);
  });

  it("accepts an end with no start", () => {
    expect(numbers(applyInvoiceFilters(rows, withFilters({ to: "2026-06-14" })))).toEqual([
      "JUN-14",
    ]);
  });

  it("files an invoice under the local day it was submitted", () => {
    // `toISOString()` would convert to UTC first, so an invoice submitted at
    // 01:00 IST would land on the previous day and fall outside a range the
    // reviewer drew around the day they actually saw it.
    const earlyMorning = [record({ so_number: "EARLY", created_at: "2026-06-15T01:00:00+05:30" })];
    expect(
      numbers(applyInvoiceFilters(earlyMorning, withFilters({ from: "2026-06-15", to: "2026-06-15" }))),
    ).toEqual(["EARLY"]);
  });

  it("drops a row whose date is missing or unreadable", () => {
    // It cannot be shown to be inside the range, and keeping it would make the
    // range a suggestion rather than a filter.
    const odd = [record({ so_number: "NONE", created_at: "" }), record({ id: 2, so_number: "JUNK", created_at: "not a date" })];
    expect(applyInvoiceFilters(odd, withFilters({ from: "2026-06-01" }))).toEqual([]);
  });

  it("keeps those rows when no range is set", () => {
    const odd = [record({ so_number: "NONE", created_at: "" })];
    expect(numbers(applyInvoiceFilters(odd, EMPTY_INVOICE_FILTERS))).toEqual(["NONE"]);
  });
});

describe("activeFilterCount", () => {
  it("is zero for an untouched bar", () => {
    expect(activeFilterCount(EMPTY_INVOICE_FILTERS)).toBe(0);
  });

  it("does not count a search of only spaces", () => {
    expect(activeFilterCount(withFilters({ search: "   " }))).toBe(0);
  });

  it("counts each kind of filter once", () => {
    expect(
      activeFilterCount(
        withFilters({
          search: "x",
          warehouses: ["GP-FGM", "DL-MP"],
          statuses: ["ERROR"],
          from: "2026-06-01",
          to: "2026-06-30",
        }),
      ),
    ).toBe(5);
  });
});

describe("combining everything", () => {
  it("ANDs the search, the pickers and the dates", () => {
    const rows = [
      record({ so_number: "HIT", warehouse: "GP-FGM", party_name: "Northern Traders", created_at: "2026-06-15T10:00:00+05:30" }),
      record({ id: 2, so_number: "WRONG-WH", warehouse: "DL-MP", party_name: "Northern Traders", created_at: "2026-06-15T10:00:00+05:30" }),
      record({ id: 3, so_number: "WRONG-DAY", warehouse: "GP-FGM", party_name: "Northern Traders", created_at: "2026-07-01T10:00:00+05:30" }),
      record({ id: 4, so_number: "WRONG-PARTY", warehouse: "GP-FGM", party_name: "Southern Supply", created_at: "2026-06-15T10:00:00+05:30" }),
    ];

    expect(
      numbers(
        applyInvoiceFilters(
          rows,
          withFilters({
            search: "northern",
            warehouses: ["GP-FGM"],
            from: "2026-06-01",
            to: "2026-06-30",
          }),
        ),
      ),
    ).toEqual(["HIT"]);
  });
});
