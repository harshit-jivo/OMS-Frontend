/* OMS Web Push service worker (Phase 3).
 *
 * Responsibilities:
 *   - receive `push` events and either relay to open tabs (in-app popup/sound)
 *     or show a desktop notification when no tab is visible;
 *   - handle `notificationclick`: focus an existing app tab (or open a new one)
 *     and deep-link to the related Sales Order;
 *   - re-subscribe on `pushsubscriptionchange`.
 *
 * Notification handling is never duplicated: a desktop notification is shown
 * ONLY when no visible client can render the in-app popup.
 *
 * DEPLOYMENT: this file MUST be served with `Cache-Control: no-cache` (and only
 * this file) so updates roll out immediately. See docs/notification.md →
 * "Service Worker Cache Headers".
 */

const APP_ICON = "/logo.png";

self.addEventListener("install", () => {
  // Activate this worker as soon as it finishes installing.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushData(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (e) {
    try {
      return { message: event.data.text() };
    } catch (err) {
      return {};
    }
  }
}

function notificationTag(data) {
  if (data.order_id) return `oms-order-${data.order_id}`;
  if (data.notification_id) return `oms-notif-${data.notification_id}`;
  return "oms-notification";
}

self.addEventListener("push", (event) => {
  const data = parsePushData(event);

  // Validation ping from the nightly cleanup: the server only needs the HTTP
  // status of the push to know the endpoint is still alive, so we must NOT show
  // anything to the user. Handle it silently and stop.
  if (data && data.type === "__keepalive__") {
    event.waitUntil(Promise.resolve());
    return;
  }

  const title = data.title || "Order update";
  const body = data.body || data.message || "";

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Always let open tabs update their bell/list/popup in real time.
      for (const client of clients) {
        client.postMessage({ type: "PUSH_RECEIVED", data });
      }

      // Show an OS notification unless the user can ACTUALLY see the app right
      // now (in which case the in-app popup already covers it).
      //
      // "Actually see" means visible AND focused — both are required:
      //
      //   * `visibilityState` alone is not enough. Per the Page Visibility spec
      //     a tab stays "visible" when its window is merely behind another
      //     window or another application. So a user reading another site (or
      //     working in another app) with an OMS tab open in a background window
      //     still counts as "visible", and the old `||` check swallowed the OS
      //     notification entirely — the exact bug this fixes.
      //
      //   * `focused` alone is not enough either: a focused-but-hidden client
      //     isn't really on screen.
      //
      // This matches how Gmail / Slack / Teams behave: in-app UI only while you
      // are looking at the tab, OS notification in every other case.
      const hasActiveClient = clients.some(
        (client) => client.visibilityState === "visible" && client.focused,
      );
      if (hasActiveClient) return;

      // A parse failure here must never swallow the notification silently, so
      // guard the timestamp and fall back to "now" on anything unusable.
      const parsedTimestamp = data.timestamp ? Date.parse(data.timestamp) : NaN;

      try {
        await self.registration.showNotification(title, {
          body,
          tag: notificationTag(data),
          renotify: true,
          timestamp: Number.isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp,
          icon: APP_ICON,
          badge: APP_ICON,
          data,
        });
      } catch (error) {
        // Never let a malformed option (bad icon, bad timestamp, ...) drop the
        // notification: retry with the minimum guaranteed-valid set.
        await self.registration.showNotification(title, { body, data });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  const url = new URL("/", self.location.origin);
  if (data.order_id) url.searchParams.set("openOrderId", String(data.order_id));
  if (data.notification_id)
    url.searchParams.set("notificationId", String(data.notification_id));
  const target = url.pathname + url.search;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer focusing an existing app tab and letting it route in-place.
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "NOTIFICATION_CLICK", data });
          return;
        }
      }

      // Otherwise open a fresh window carrying the order id in the query string.
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const appServerKey =
          event.oldSubscription &&
          event.oldSubscription.options &&
          event.oldSubscription.options.applicationServerKey;
        if (!appServerKey) return;

        const newSubscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });

        // The SW can't authenticate to our API; ask an open tab to persist the
        // refreshed subscription against the logged-in user.
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of clients) {
          client.postMessage({
            type: "RESUBSCRIBE",
            subscription: newSubscription.toJSON(),
          });
        }
      } catch (e) {
        // Best-effort: nothing else we can safely do from the worker.
      }
    })(),
  );
});
