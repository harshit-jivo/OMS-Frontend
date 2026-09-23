/**
 * Latest first, in one list.
 *
 * The approval desk merges two endpoints — the pending queue and the decided
 * history — and concatenating them ordered each part while leaving the whole
 * unordered.
 */
import { describe, expect, it } from "vitest";

import type { BackDateRequest } from "../../services/backdateService";
import { newestFirst } from "./ordering";

/** Only the fields the ordering reads; the rest never enters into it. */
const req = (id: number, createdAt = "2026-01-01T00:00:00Z") =>
  ({ id, created_at: createdAt }) as BackDateRequest;

describe("newestFirst", () => {
  it("puts the highest id first", () => {
    expect(newestFirst([req(3), req(1), req(2)]).map((r) => r.id)).toEqual([
      3, 2, 1,
    ]);
  });

  it("orders a merged queue and history as ONE list", () => {
    // THE BUG. The queue (pending) was concatenated ahead of the history
    // (decided), so under "All" every pending request sat above every decided
    // one whatever its age — and #271, the newest, appeared below #100.
    const queue = [req(264), req(266)];
    const history = [req(271), req(100)];
    expect(newestFirst([...queue, ...history]).map((r) => r.id)).toEqual([
      271, 266, 264, 100,
    ]);
  });

  it("ignores created_at, which can disagree with the serial", () => {
    // The id is the one key that always means "latest": every date on a
    // request is typed by a person and can point anywhere.
    const rows = [
      req(1, "2026-09-30T00:00:00Z"),
      req(2, "2026-01-01T00:00:00Z"),
    ];
    expect(newestFirst(rows).map((r) => r.id)).toEqual([2, 1]);
  });

  it("does not mutate the list it was given", () => {
    // The caller holds it in state; sorting in place would reorder a rendered
    // array without React being told.
    const rows = [req(1), req(3), req(2)];
    newestFirst(rows);
    expect(rows.map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it("copes with an empty list and a single row", () => {
    expect(newestFirst([])).toEqual([]);
    expect(newestFirst([req(7)]).map((r) => r.id)).toEqual([7]);
  });

  it("is stable enough to be idempotent", () => {
    const once = newestFirst([req(2), req(5), req(1)]);
    expect(newestFirst(once).map((r) => r.id)).toEqual(
      once.map((r) => r.id),
    );
  });
});
