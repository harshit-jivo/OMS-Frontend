/**
 * Notification bucketing and envelope handling.
 *
 * None of this was reachable from a test before: it lived inside a 1,291-line
 * component, so the only way to exercise a midnight boundary or a malformed
 * timestamp was to render the whole sidebar with a mocked API. Date logic that
 * is only ever verified by looking at it is date logic that is wrong at
 * month-end.
 *
 * Every case passes an explicit `now`, so the suite does not change behaviour
 * depending on what time it runs.
 */
import { describe, expect, it } from "vitest";

import {
  REFRESH_EVENT_NAMES,
  dateGroupLabel,
  extractNotifications,
  groupNotifications,
  type Notification,
} from "./notificationGrouping";

/** Local midday on 2026-03-01, so a "yesterday" crosses a month boundary. */
const NOW = new Date(2026, 2, 1, 12, 0, 0);

function at(year: number, month: number, day: number, hour = 12, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function note(created: string, overrides: Partial<Notification> = {}): Notification {
  return { id: 1, message: "m", is_read: false, created_at: created, ...overrides };
}

describe("dateGroupLabel", () => {
  it("buckets by LOCAL midnight, not by a rolling 24 hours", () => {
    // What a reader means by "yesterday". 00:05 today is Today even though it
    // is only twelve hours ago; 23:55 yesterday is Yesterday even though it is
    // twelve hours ago too.
    expect(dateGroupLabel(at(2026, 3, 1, 0, 5), NOW)).toBe("Today");
    expect(dateGroupLabel(at(2026, 2, 28, 23, 55), NOW)).toBe("Yesterday");
  });

  it("handles a month boundary", () => {
    // 2026-03-01's yesterday is 2026-02-28. Arithmetic on the day number alone
    // would produce 2026-03-00.
    expect(dateGroupLabel(at(2026, 2, 28), NOW)).toBe("Yesterday");
    expect(dateGroupLabel(at(2026, 2, 27), NOW)).toBe("Older");
  });

  it("handles a leap-year boundary", () => {
    // 2024 is a leap year: the day before 2024-03-01 is 2024-02-29.
    const leapNow = new Date(2024, 2, 1, 12, 0, 0);
    expect(dateGroupLabel(at(2024, 2, 29), leapNow)).toBe("Yesterday");
    expect(dateGroupLabel(at(2024, 2, 28), leapNow)).toBe("Older");
  });

  it("calls the exact start of today Today", () => {
    expect(dateGroupLabel(at(2026, 3, 1, 0, 0), NOW)).toBe("Today");
  });

  it("falls back to Older for an unparseable timestamp", () => {
    // A bad date on one row must not throw and empty the whole list.
    expect(dateGroupLabel("", NOW)).toBe("Older");
    expect(dateGroupLabel("not a date", NOW)).toBe("Older");
  });

  it("does not call a future timestamp Older", () => {
    // Clock skew between the server and the browser is normal, and a
    // notification stamped a few minutes ahead should not sink to the bottom.
    expect(dateGroupLabel(at(2026, 3, 1, 23, 59), NOW)).toBe("Today");
  });
});

describe("groupNotifications", () => {
  it("keeps a fixed order and drops empty buckets", () => {
    // Fixed rather than derived from the data, so the list does not reshuffle
    // as notifications arrive.
    const groups = groupNotifications(
      [note(at(2026, 2, 20)), note(at(2026, 3, 1)), note(at(2026, 2, 28))],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Older"]);
  });

  it("omits a bucket with nothing in it", () => {
    const groups = groupNotifications([note(at(2026, 3, 1))], NOW);
    expect(groups.map((g) => g.label)).toEqual(["Today"]);
  });

  it("returns nothing at all for an empty list", () => {
    expect(groupNotifications([], NOW)).toEqual([]);
  });

  it("preserves input order within a group", () => {
    // The server already sorts newest-first; re-sorting here would be a second
    // opinion about something it has already decided.
    const items = [
      note(at(2026, 3, 1, 9), { id: 1 }),
      note(at(2026, 3, 1, 17), { id: 2 }),
      note(at(2026, 3, 1, 13), { id: 3 }),
    ];
    expect(groupNotifications(items, NOW)[0].items.map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it("places every item in exactly one bucket", () => {
    const items = [
      note(at(2026, 3, 1)), note(at(2026, 2, 28)),
      note(at(2026, 1, 1)), note("garbage"),
    ];
    const total = groupNotifications(items, NOW).reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(items.length);
  });
});

describe("extractNotifications", () => {
  const items = [note(at(2026, 3, 1))];

  it("accepts every envelope the endpoint has used", () => {
    // Four shapes are in play because the endpoint predates the project's
    // pagination settings and has been wrapped more than once.
    expect(extractNotifications(items)).toEqual(items);
    expect(extractNotifications({ data: items })).toEqual(items);
    expect(extractNotifications({ results: items })).toEqual(items);
    expect(extractNotifications({ notifications: items })).toEqual(items);
  });

  it("returns an empty list rather than throwing on anything else", () => {
    // An unrecognised shape should show an empty bell, not crash inside a
    // `.filter` and take the whole sidebar down with it.
    expect(extractNotifications(null)).toEqual([]);
    expect(extractNotifications(undefined)).toEqual([]);
    expect(extractNotifications("nope")).toEqual([]);
    expect(extractNotifications({})).toEqual([]);
    expect(extractNotifications({ data: "not an array" })).toEqual([]);
  });

  it("prefers `data` when more than one envelope key is present", () => {
    expect(extractNotifications({ data: items, results: [] })).toEqual(items);
  });
});

describe("REFRESH_EVENT_NAMES", () => {
  it("still carries both spellings", () => {
    // Order pages dispatch the hyphenated name while `ordersService` dispatches
    // the camelCase one. Only the latter was ever listened for, so those pages'
    // badge refreshes silently did nothing. Dropping either name here would
    // reintroduce that, invisibly.
    expect([...REFRESH_EVENT_NAMES].sort()).toEqual([
      "refresh-notifications",
      "refreshNotifications",
    ]);
  });
});
