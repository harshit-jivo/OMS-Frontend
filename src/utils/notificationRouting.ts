/**
 * Where a notification takes you when you click it.
 *
 * Until now the answer was always "a Sales Order". Every click path — the bell
 * list, the toast action, the service worker's `notificationclick` — ended in
 * `goToOrder(notification.order_id)`, because Sales Orders were the only module
 * that sent notifications. Modules on the reusable `notifications` framework
 * (BackDate today, others behind it) carry no `order_id`, so clicking one
 * landed the user on their orders page: not an error, just the wrong screen,
 * which reads as "notifications are broken" the moment people rely on them.
 *
 * The framework's canonical payload identifies its subject GENERICALLY, as
 * `entity_type` + `entity_id`, and deliberately knows nothing about routes.
 * Turning that pair into a URL is the client's job, and this module is the one
 * place on the web client that does it. The mobile app has its own copy of the
 * same idea in `OMS/src/utils/notificationRouting.ts`; they are separate
 * because the two clients genuinely have different screens, not by oversight.
 *
 * ADDING A MODULE is two steps: a row in `ENTITY_ROUTES`, and a page that
 * reads the id back out of the query string. Miss the second and the link
 * opens the right page on the wrong (or no) record, silently — which is the
 * failure this module exists to stop, so it is worth doing both at once.
 *
 * `entity_type` is the BACKEND's `content_type.model` value, lower-case, and
 * must be copied from the payload rather than guessed. `backdate` below was
 * read off `ContentType.objects.get_for_model(BackDate)`.
 */

/** The three query params the service worker uses to hand an entity to the app.
 *
 * `public/service-worker.js` is plain, un-bundled JavaScript and cannot import
 * this module, so it writes these names literally. They are declared here so
 * that the app side reads them from one definition — and so that anyone
 * renaming them finds the worker via this comment. The worker stays generic:
 * it copies the payload's entity through, and never decides a route itself.
 */
export const ENTITY_PARAMS = {
  type: "entityType",
  id: "entityId",
  event: "eventType",
} as const;

/** A resolved destination, ready for `navigate(pathname + search)`. */
export interface NotificationLink {
  pathname: string;
  search: string;
}

/** The parts of a notification this module routes on. */
export interface RoutableNotification {
  entity_type?: string | null;
  entity_id?: number | string | null;
  event_type?: string | null;
}

/**
 * BackDate is two pages, not one, and which of them is right depends on WHY
 * the person was notified:
 *
 *   - "awaiting approval" reaches the approver, whose screen is the approval
 *     desk — the only place the Approve and Reject buttons exist;
 *   - approved / rejected reaches the requester, whose screen is their own
 *     list of requests.
 *
 * Sending an approver to the requester page would show them a request they
 * cannot act on and no explanation of why the buttons are missing, so the
 * event type decides rather than the entity alone.
 */
const BACKDATE_APPROVER_EVENTS = new Set(["BACKDATE_AWAITING_APPROVAL"]);

/**
 * Production Orders splits the same way, for the same reason: the approval
 * desk is the only place the Approve and Reject buttons exist, so the person
 * being asked to decide belongs there and everyone else belongs on the list.
 */
const PRODUCTION_APPROVER_EVENTS = new Set(["PRDO_AWAITING_APPROVAL"]);

type RouteResolver = (
  id: string,
  notification: RoutableNotification,
) => NotificationLink;

const ENTITY_ROUTES: Record<string, RouteResolver> = {
  backdate: (id, notification) => ({
    pathname: BACKDATE_APPROVER_EVENTS.has(notification.event_type ?? "")
      ? "/BackDate_Approval"
      : "/BackDate",
    // Read back by `useDeepLinkedRequest`, which opens the detail dialog for
    // this request once the page's rows have loaded.
    search: `?requestId=${encodeURIComponent(id)}`,
  }),
  // `productionorder` — one word, no underscore. Read off
  // ContentType.objects.get_for_model(ProductionOrder) rather than guessed.
  productionorder: (id, notification) => ({
    pathname: PRODUCTION_APPROVER_EVENTS.has(notification.event_type ?? "")
      ? "/Production_Approval"
      : "/Production_Orders",
    search: `?orderId=${encodeURIComponent(id)}`,
  }),
};

/**
 * The destination for a notification, or `null` if this client has no screen
 * for it.
 *
 * `null` is a real answer, not a failure: the caller falls back to its existing
 * behaviour, so a notification from a module the web app has not adopted yet
 * behaves exactly as it does today instead of navigating somewhere wrong.
 */
export function routeForNotification(
  notification: RoutableNotification | null | undefined,
): NotificationLink | null {
  if (!notification) return null;

  const entity = (notification.entity_type ?? "").trim().toLowerCase();
  const resolve = ENTITY_ROUTES[entity];
  if (!resolve) return null;

  // An entity type with no id points at a page but not at a record. Refusing
  // here keeps the caller's fallback, which is a better outcome than opening a
  // list and leaving the user to guess which row the alert was about.
  const rawId = notification.entity_id;
  if (rawId == null || String(rawId).trim() === "") return null;

  return resolve(String(rawId).trim(), notification);
}

/**
 * The destination encoded in a URL's query string by the service worker.
 *
 * This covers the cold-start case: with no tab already open the worker cannot
 * ask the app to navigate, so it opens `/` carrying the entity in the query
 * string and the app resolves it on mount. Returns `null` when the params are
 * absent, which is every ordinary page load.
 */
export function routeFromSearchParams(
  search: string | URLSearchParams,
): NotificationLink | null {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;

  return routeForNotification({
    entity_type: params.get(ENTITY_PARAMS.type),
    entity_id: params.get(ENTITY_PARAMS.id),
    event_type: params.get(ENTITY_PARAMS.event),
  });
}
