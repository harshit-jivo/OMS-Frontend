/**
 * Notification shapes and the Today / Yesterday / Older bucketing.
 *
 * Pure functions with no React and no network, split out of `Sidebar.tsx` so
 * they can be tested directly. Date bucketing is the kind of logic that is
 * quietly wrong at midnight, across a month boundary, or for a malformed
 * timestamp, and none of that was reachable from a test while it lived inside
 * a 1,291-line component.
 */

export type Notification = {
  id: number;
  message: string;
  is_read: boolean;
  order_id?: number;
  created_at: string;
};

export type NotificationGroup = { label: string; items: Notification[] };

/**
 * Window events that ask the bell to re-count.
 *
 * Two spellings exist in the codebase and both are dispatched in practice:
 * `ordersService` uses the camelCase name, while the auditor / billing /
 * rate-approver pages use the hyphenated one. Only camelCase was ever
 * listened for, so those pages' refreshes were silently lost. Accepting both
 * is the smallest correct fix and removes the chance of the same mismatch
 * recurring.
 */
export const REFRESH_EVENT_NAMES = [
  "refreshNotifications",
  "refresh-notifications",
] as const;

/**
 * Bucket a timestamp into Today / Yesterday / Older.
 *
 * Boundaries are LOCAL midnight, not 24-hour windows, which is what a reader
 * means by "yesterday". An unparseable timestamp falls to "Older" rather than
 * throwing — a bad date on one row must not empty the whole list.
 */
export const dateGroupLabel = (
  isoDate: string,
  now: Date = new Date(),
): "Today" | "Yesterday" | "Older" => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Older";

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  return "Older";
};

/**
 * Group in fixed Today / Yesterday / Older order, dropping empty buckets.
 *
 * Order is fixed rather than derived from the data so the list does not
 * reshuffle as notifications arrive. Within a group, input order is preserved —
 * the server already sorts newest-first and re-sorting here would be a second
 * opinion about something it has already decided.
 */
export const groupNotifications = (
  items: Notification[],
  now: Date = new Date(),
): NotificationGroup[] => {
  const groups: NotificationGroup[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Older", items: [] },
  ];
  for (const item of items) {
    const label = dateGroupLabel(item.created_at, now);
    const bucket = groups.find((g) => g.label === label);
    if (bucket) bucket.items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
};

/**
 * Pull an array out of whichever envelope the notifications endpoint used.
 *
 * Four shapes are in play — a bare array, `{data}`, `{results}` and
 * `{notifications}` — because the endpoint predates the project's pagination
 * settings and has been wrapped more than once. Returns [] for anything else,
 * so an unrecognised shape shows an empty bell rather than throwing inside a
 * `.filter`.
 */
export const extractNotifications = (payload: unknown): Notification[] => {
  if (Array.isArray(payload)) return payload as Notification[];
  if (!payload || typeof payload !== "object") return [];

  const envelope = payload as Record<string, unknown>;
  for (const key of ["data", "results", "notifications"]) {
    if (Array.isArray(envelope[key])) return envelope[key] as Notification[];
  }
  return [];
};
