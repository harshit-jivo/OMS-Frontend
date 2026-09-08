/**
 * The Invoice Review list order.
 *
 * `newestFirst` decides what a reviewer sees at the top of all seven tabs, so
 * it is worth pinning: the two edge cases below (a shared array, and a row
 * with no timestamp) are both silent when they go wrong — one corrupts a
 * cache, the other quietly promotes a row to the front of a queue.
 */
import { describe, expect, it } from "vitest";

import { newestFirst } from "./helpers";
import type { InvoiceRecord } from "./types";

const row = (id: number, created_at?: string) => ({ id, created_at }) as InvoiceRecord;

describe("newestFirst", () => {
  it("puts the most recent invoice at the top", () => {
    const sorted = newestFirst([
      row(1, "2026-01-01T10:00:00Z"),
      row(2, "2026-03-01T10:00:00Z"),
      row(3, "2026-02-01T10:00:00Z"),
    ]);

    expect(sorted.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("orders by time, not by date string", () => {
    // Two rows on the same day. A string compare would call these equal.
    const sorted = newestFirst([
      row(1, "2026-01-01T09:00:00Z"),
      row(2, "2026-01-01T17:30:00Z"),
    ]);

    expect(sorted.map((r) => r.id)).toEqual([2, 1]);
  });

  it("does NOT mutate the array it is given", () => {
    // `extractRecords` hands back the response array itself when the body is a
    // bare array, and that body is TanStack Query's cache. Sorting it in place
    // would reorder a cache other readers share.
    const input = [row(1, "2026-01-01T10:00:00Z"), row(2, "2026-03-01T10:00:00Z")];
    const before = input.map((r) => r.id);

    newestFirst(input);

    expect(input.map((r) => r.id)).toEqual(before);
  });

  it("sends a row with no timestamp to the END, not the front", () => {
    // Falling back to 0 would date it 1970 — which sorts last only by luck of
    // the comparator's direction. Getting this backwards puts the rows we know
    // least about at the top of a work queue.
    const sorted = newestFirst([
      row(1, "2026-01-01T10:00:00Z"),
      row(2),
      row(3, "2026-03-01T10:00:00Z"),
    ]);

    expect(sorted.map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it("treats an unparseable timestamp the same as a missing one", () => {
    const sorted = newestFirst([row(1, "not a date"), row(2, "2026-01-01T10:00:00Z")]);

    expect(sorted.map((r) => r.id)).toEqual([2, 1]);
  });

  it("handles an empty list", () => {
    expect(newestFirst([])).toEqual([]);
  });
});
