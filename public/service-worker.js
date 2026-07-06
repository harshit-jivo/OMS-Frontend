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

      // Show an OS desktop notification only when NO tab is visible — the
      // in-app popup covers the visible case, so this avoids duplicates.
      const hasVisibleClient = clients.some(
        (client) => client.visibilityState === "visible" || client.focused,
      );
      if (hasVisibleClient) return;

      await self.registration.showNotification(title, {
        body,
        tag: notificationTag(data),
        renotify: true,
        timestamp: data.timestamp ? Date.parse(data.timestamp) : Date.now(),
        icon: APP_ICON,
        badge: APP_ICON,
        data,
      });
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
