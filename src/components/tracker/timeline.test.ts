/**
 * The timeline's grouping and ordering, on the shape production actually has.
 *
 * Both fixtures are traced from real rows: invoice 052, whose Pre-Audit desk
 * appeared five times because every NOTE became its own stop, and whose NOTE
 * ties with its RETURN on `entered_at`.
 */
import { describe, expect, it } from "vitest";

import { railFor, toLegs, toneFor } from "./timeline";
import type { StageEvent } from "@/services/trackerService";

const ev = (p: Partial<StageEvent> & { id: number }): StageEvent => ({
  stage: 3,
  stage_name: "Pre-Audit",
  stage_code: "pre_audit",
  event_type: "ADVANCE",
  stage_status: "",
  hold_type: "",
  amount: null,
  receiving_note: "",
  remarks: "",
  acted_by: null,
  acted_by_name: null,
  entered_at: "2026-08-11T17:36:51Z",
  exited_at: "2026-08-11T17:38:00Z",
  days_spent: "0.01",
  ...p,
});

describe("toLegs", () => {
  it("folds a note into the visit it annotates instead of making it a stop", () => {
    const legs = toLegs([
      ev({ id: 746, event_type: "RETURN", stage_status: "REJECTED" }),
      ev({ id: 747, event_type: "NOTE", stage_status: "REJECTED", exited_at: null }),
    ]);
    expect(legs).toHaveLength(1);
    expect(legs[0].visit.id).toBe(746);
    expect(legs[0].notes.map((n) => n.id)).toEqual([747]);
  });

  it("matches a note to its visit on stage AND entered_at, not stage alone", () => {
    const legs = toLegs([
      ev({ id: 1, entered_at: "2026-08-01T10:00:00Z", exited_at: "2026-08-02T10:00:00Z" }),
      ev({ id: 2, entered_at: "2026-08-05T10:00:00Z", exited_at: "2026-08-06T10:00:00Z" }),
      ev({ id: 3, event_type: "NOTE", stage_status: "HOLD",
           entered_at: "2026-08-05T10:00:00Z", exited_at: null }),
    ]);
    expect(legs).toHaveLength(2);
    expect(legs[0].notes).toHaveLength(0);
    expect(legs[1].notes.map((n) => n.id)).toEqual([3]);
  });

  it("keeps an orphan note as its own entry rather than dropping it", () => {
    const legs = toLegs([
      ev({ id: 9, event_type: "NOTE", stage_status: "HOLD", exited_at: null }),
    ]);
    expect(legs).toHaveLength(1);
    expect(legs[0].visit.id).toBe(9);
  });

  it("breaks entered_at ties by id, so the order cannot change between openings", () => {
    // Every skipped visit an automatic progression writes shares one instant.
    const same = "2026-09-14T15:56:51Z";
    const legs = toLegs([
      ev({ id: 4882, stage: 9, stage_name: "Payment", entered_at: same, exited_at: null }),
      ev({ id: 4881, stage: 8, stage_name: "Save in SAP", entered_at: same }),
      ev({ id: 392, stage: 7, stage_name: "JSAP Approval",
           entered_at: "2026-08-07T12:38:59Z", exited_at: same }),
    ]);
    expect(legs.map((l) => l.visit.id)).toEqual([392, 4881, 4882]);
  });

  it("orders by entered_at first", () => {
    const legs = toLegs([
      ev({ id: 2, entered_at: "2026-08-09T10:00:00Z" }),
      ev({ id: 1, entered_at: "2026-08-10T10:00:00Z" }),
    ]);
    expect(legs.map((l) => l.visit.id)).toEqual([2, 1]);
  });

  it("does not mutate the array it is given", () => {
    const input = [ev({ id: 2 }), ev({ id: 1, entered_at: "2026-08-01T10:00:00Z" })];
    const before = input.map((e) => e.id);
    toLegs(input);
    expect(input.map((e) => e.id)).toEqual(before);
  });
});

describe("railFor", () => {
  const leg = (p: Partial<StageEvent> & { id: number }) => ({
    visit: ev(p),
    notes: [] as StageEvent[],
  });

  it("leaves the last leg's rail alone — there is nothing below it", () => {
    expect(railFor(leg({ id: 1 }), undefined)).toBe("idle");
  });

  it("marks ground the invoice actually covered", () => {
    expect(railFor(leg({ id: 1, event_type: "ADVANCE" }), leg({ id: 2 }))).toBe("covered");
  });

  it("dashes the leg out of a desk that was fast-forwarded past", () => {
    expect(railFor(leg({ id: 1, stage_status: "SKIPPED" }), leg({ id: 2 }))).toBe("skipped");
  });

  it("flags a step backwards from the RETURN itself", () => {
    expect(railFor(leg({ id: 1, event_type: "RETURN" }), leg({ id: 2 }))).toBe("back");
  });

  it("prefers skipped over back when a skipped visit is also a RETURN", () => {
    // A bypassed desk never decided anything, so "skipped" is the truer label.
    expect(
      railFor(leg({ id: 1, event_type: "RETURN", stage_status: "SKIPPED" }), leg({ id: 2 })),
    ).toBe("skipped");
  });
});

describe("toneFor", () => {
  const leg = (p: Partial<StageEvent> & { id: number }) => ({
    visit: ev(p),
    notes: [] as StageEvent[],
  });

  it("fills a covered desk blue, so the trail reads as one run", () => {
    expect(toneFor(leg({ id: 1 }), { here: false })).toBe("info");
  });

  it("fills a plain OK blue too — ordinary progress is not worth a colour stop", () => {
    expect(toneFor(leg({ id: 1, stage_status: "OK" }), { here: false })).toBe("info");
    expect(toneFor(leg({ id: 2, stage_status: "APPROVED" }), { here: false })).toBe("info");
  });

  it("keeps a hold amber", () => {
    expect(toneFor(leg({ id: 1, stage_status: "HOLD" }), { here: false })).toBe("hold");
  });

  it("keeps anything adverse red", () => {
    for (const status of ["RETURN", "REJECTED", "DEBIT"]) {
      expect(toneFor(leg({ id: 1, stage_status: status }), { here: false })).toBe("bad");
    }
  });

  it("leaves a skipped desk neutral — nobody saw it, so do not fill it in", () => {
    expect(toneFor(leg({ id: 1, stage_status: "SKIPPED" }), { here: false })).toBe("neutral");
  });

  it("marks an orphan note as a note, not as a place the invoice has been", () => {
    expect(toneFor(leg({ id: 1, event_type: "NOTE" }), { here: false })).toBe("note");
  });

  it("the current stop is blue whatever it decided", () => {
    expect(toneFor(leg({ id: 1, stage_status: "HOLD" }), { here: true })).toBe("info");
  });
});
