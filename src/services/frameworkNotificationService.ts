/**
 * The OTHER notification feed.
 *
 * There are two tables. `orders.Notification` holds Sales Order notifications
 * and is served at `/orders/notifications/`; `notifications.Notification` —
 * the reusable framework every newer module publishes through — holds
 * Payments, Deposits, BackDate, Production, Credit Limit and payment requests,
 * and is served here, at `/notifications/`.
 *
 * WHY THIS FILE EXISTS. The bell read only the Orders feed, so a user with
 * three payment-request notifications waiting saw an empty bell and a zero
 * badge: the rows were there, in the other table, and nothing on the web ever
 * asked for them. Push was the only way one of these reached anybody, and only
 * for browsers whose subscription predated the current VAPID keys.
 *
 * The list is the latest 50, unpaginated and unfiltered — the server offers no
 * limit/offset here, which is why the bell pages the Orders feed and merges
 * this one whole (see `useNotifications`).
 *
 * Every row is scoped to the caller server-side; the client adds no visibility
 * rule of its own.
 */
import api from "./api";

export interface FrameworkNotification {
  id: number;
  event_type: string;
  title: string;
  message: string;
  /** The Django model name, e.g. "advancerequest" — what the row is about. */
  entity_type: string | null;
  entity_id: number | null;
  /**
   * Coarse module label.
   *
   * NOT TO BE TRUSTED for anything but Payments and Deposits: the server's
   * `_ENTITY_MODULE` names only those two, so every other module arrives as
   * "other". Route by `event_type` / `entity_type` instead.
   */
  module: string;
  company_id: number | null;
  is_read: boolean;
  created_at: string;
}

const asList = (data: unknown): FrameworkNotification[] => {
  if (Array.isArray(data)) return data as FrameworkNotification[];
  const results = (data as { results?: unknown })?.results;
  return Array.isArray(results) ? (results as FrameworkNotification[]) : [];
};

export const frameworkNotificationService = {
  /** The latest 50, newest first. */
  async list(): Promise<FrameworkNotification[]> {
    const res = await api.get("/notifications/");
    return asList(res.data ?? res);
  },

  async unreadCount(): Promise<number> {
    const res = await api.get("/notifications/unread-count/");
    const value = (res.data ?? res)?.unread;
    return typeof value === "number" ? value : 0;
  },

  async markRead(id: number): Promise<void> {
    await api.patch(`/notifications/${id}/`, {});
  },

  async markAllRead(): Promise<void> {
    await api.post("/notifications/", {});
  },
};

export default frameworkNotificationService;
