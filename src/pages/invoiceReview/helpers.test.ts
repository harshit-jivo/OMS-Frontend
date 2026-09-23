/**
 * The Invoice Review list order.
 *
 * `newestFirst` decides what a reviewer sees at the top of all seven tabs, so
 * it is worth pinning: the two edge cases below (a shared array, and a row
 * with no timestamp) are both silent when they go wrong — one corrupts a
 * cache, the other quietly promotes a row to the front of a queue.
 */
import { describe, expect, it } from "vitest";

import {
  isCreditLimitError,
  newestFirst,
  STATUS_FILTERS,
  visibleStatusFilters,
} from "./helpers";
import type { InvoiceRecord, InvoiceStatus } from "./types";

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

/**
 * Whether a row offers "Raise CL".
 *
 * Every message below is a real one taken from `invoice_log.error_message` on
 * production. They are all the SAME SAP check — transaction-notification code
 * 13000316 — reworded between releases, and only the newest of the three ever
 * said "credit limit". Keying on the phrase meant an invoice blocked by an
 * older message showed no way to raise the request, leaving the reviewer to
 * repost into the same block forever.
 */
describe("isCreditLimitError", () => {
  const withError = (error_message?: string) => ({ id: 1, error_message }) as InvoiceRecord;

  it("matches the current wording", () => {
    expect(
      isCreditLimitError(
        withError("(13000316) Credit Limit Exceeded! Current Limit is 10.00, Balance Amount is 5,379.00"),
      ),
    ).toBe(true);
  });

  it("matches the older wordings that never say 'credit limit'", () => {
    expect(
      isCreditLimitError(withError("(13000316) Limit is Over, Current Limit is 10.00 Balance Amount Is 9022.00")),
    ).toBe(true);
    expect(
      isCreditLimitError(
        withError("(13000316) Limit if Over By, Current Limit is 45000.00 Balance Amount Is 46000.00"),
      ),
    ).toBe(true);
  });

  it("matches on the code alone, whatever SAP renames the message to next", () => {
    expect(isCreditLimitError(withError("(13000316) Something nobody has written yet"))).toBe(true);
  });

  it("does NOT offer the action on an unrelated SAP failure", () => {
    // These are the other real ERROR messages on the same table. Offering
    // "Raise CL" here would raise a JSAP document for a stock problem.
    expect(
      isCreditLimitError(withError("10001153 - Insufficient quantity for item FG0000324 with batch NM0308 in warehouse")),
    ).toBe(false);
    expect(isCreditLimitError(withError("Cannot add row without complete selection of batch/serial numbers"))).toBe(false);
    expect(isCreditLimitError(withError("(130001) Please Select the corrrect Godown"))).toBe(false);
    expect(isCreditLimitError(withError("(13204583) YOU CANNOT MAKE BILL WITHOUST GST MORE THAN 49999"))).toBe(false);
  });

  it("does NOT offer the action on a row with no message at all", () => {
    expect(isCreditLimitError(withError(undefined))).toBe(false);
    expect(isCreditLimitError(withError(""))).toBe(false);
  });
});

/**
 * Which tabs each desk sees: all of them.
 *
 * Worth pinning because the failure is silent in the worst direction. A tab
 * that is missing does not look broken, it looks like there is no work — which
 * is how a whole desk lost sight of Posted to SAP and Error at once, and why
 * this is a guard rather than a preference.
 */
describe("visibleStatusFilters", () => {
  const keys = () => visibleStatusFilters().map((f) => f.key);

  it("renders every tab in STATUS_FILTERS, in order", () => {
    expect(keys()).toEqual(STATUS_FILTERS.map((f) => f.key));
  });

  it("includes the tabs the approver-only strip used to drop", () => {
    for (const key of ["POSTED_TO_SAP", "ERROR", "CL_RAISED", "ALL"]) {
      expect(keys()).toContain(key);
    }
  });

  it("offers a tab for every invoice status the screen can show", () => {
    // STATUS_FILTERS is FilterKey[] = InvoiceStatus | "ALL". If a status is
    // ever added to the union without a tab, its rows become unreachable on
    // every tab but All — so pin the count as well as the members.
    const statuses: InvoiceStatus[] = [
      "PENDING",
      "APPROVED",
      "REJECTED",
      "EDITED",
      "ERROR",
      "POSTED_TO_SAP",
      "CL_RAISED",
      "POSTING",
    ];
    for (const status of statuses) expect(keys()).toContain(status);
    expect(keys()).toHaveLength(statuses.length + 1); // + "ALL"
  });
});
