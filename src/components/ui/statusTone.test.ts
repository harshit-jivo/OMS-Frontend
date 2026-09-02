/**
 * The status→tone map, checked on the disagreements it was written to end.
 *
 * These are not tests of a lookup table working. They are the record of what
 * the app used to do differently on different screens, written so that undoing
 * any of it fails rather than ships.
 */
import { describe, expect, it } from "vitest";

import { STATUS_TONE, hasTone, toneForStatus } from "./statusTone";

describe("the same word means the same thing everywhere", () => {
  it("gives `billed` one tone, not green here and blue there", () => {
    // The finding this file exists for. `.dr-badge-billed` in Daily_Report was
    // #2563eb (blue, "informational"); `.vo-badge-billed`, `.ot-badge-billed`
    // and `.bo-badge-billed` were green ("settled"). Same status, opposite
    // reading, on screens the same person moves between.
    expect(toneForStatus("BILLED")).toBe("ok");
    expect(toneForStatus("BILLED")).toBe(toneForStatus("APPROVED"));
  });

  it("gives `pending` one tone, not amber, brown and grey", () => {
    // Three different colours across the stylesheets, one of them GREY — which
    // reads as "nothing is happening here" for a status that means the exact
    // opposite.
    expect(toneForStatus("PENDING")).toBe("hold");
    expect(toneForStatus("PENDING")).not.toBe("neutral");
  });

  it("keeps `needs approval` distinct from `pending approval`", () => {
    // NOT consolidation for its own sake. View_Orders draws both on the same
    // screen, in amber and violet, and the difference is real: someone is
    // dealing with it, versus nothing moves until you act. Flattening them
    // would be losing information while calling it consistency.
    expect(toneForStatus("PENDING_APPROVAL")).toBe("hold");
    expect(toneForStatus("NEED_APPROVAL")).toBe("note");
  });
});

describe("normalising what the API actually sends", () => {
  it.each([
    ["APPROVED", "ok"],
    ["approved", "ok"],
    ["Approved", "ok"],
    ["  approved  ", "ok"],
    ["IN_PROGRESS", "hold"],
    ["in progress", "hold"],
    ["In-Progress", "hold"],
    ["Pending Approval", "hold"],
  ] as const)("reads %s as %s", (input, tone) => {
    expect(toneForStatus(input)).toBe(tone);
  });

  it("accepts both spellings of cancelled", () => {
    // Both are in the codebase today. Neither is worth a data migration, and a
    // badge that renders grey because of a doubled L would be a silly bug.
    expect(toneForStatus("CANCELLED")).toBe("bad");
    expect(toneForStatus("CANCELED")).toBe("bad");
  });
});

describe("the default", () => {
  it("is neutral for a status nobody has classified", () => {
    // Neutral rather than a loud colour on purpose: an unmapped status is a gap
    // in that file, not a problem with the record. Colouring it red would tell
    // the reader something untrue about their own data.
    expect(toneForStatus("SOME_NEW_BACKEND_STATE")).toBe("neutral");
  });

  it("is neutral for nothing at all", () => {
    // These fields are nullable on several endpoints and are rendered straight
    // into a badge, so this is a real input, not a defensive flourish.
    expect(toneForStatus(null)).toBe("neutral");
    expect(toneForStatus(undefined)).toBe("neutral");
    expect(toneForStatus("")).toBe("neutral");
  });
});

describe("coverage of the statuses actually in the codebase", () => {
  it("has a tone for every status literal the app renders", () => {
    // Counted out of the source with a grep, not invented: REJECTED (26 uses),
    // APPROVED (22), PENDING (18), COMPLETED (11), FAILED (9), PARTIAL (5),
    // CANCELLED (5), OPEN (4), IN_PROGRESS (3), PAID (2), BILLED (2), plus the
    // single-use ones.
    //
    // A fixed list rather than a scan of the source: a scan would sweep up
    // every capitalised string in the app and need an allowlist longer than
    // this. The cost is that a status added later is not caught here — which is
    // exactly why the fallback is a readable neutral chip and not a throw.
    const inUse = [
      "REJECTED", "APPROVED", "PENDING", "COMPLETED", "FAILED", "PARTIAL",
      "CANCELLED", "CANCELED", "OPEN", "IN_PROGRESS", "PAID", "BILLED",
      "ACTIVE", "INACTIVE", "DRAFT",
      "online", "idle", "offline", "inactive",
    ];

    expect(inUse.filter((s) => !hasTone(s))).toEqual([]);
  });

  it("uses only tones the Badge component can draw", () => {
    // A typo in a tone name is a silent grey chip: `cva` falls back to its
    // default variant rather than failing, so nothing warns.
    const drawable = ["neutral", "info", "ok", "hold", "bad", "note"];
    const unknown = [...new Set(Object.values(STATUS_TONE))].filter(
      (t) => !drawable.includes(t),
    );
    expect(unknown).toEqual([]);
  });
});
