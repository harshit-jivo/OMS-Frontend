/**
 * Central client-side notification event bus (Phase 3).
 *
 * Unifies three real-time sources into one subscribe API:
 *   - service-worker `postMessage` (push received / notification clicked);
 *   - `BroadcastChannel` for cross-tab sync (read-state, cleared);
 *   - manual `emit` for the local tab.
 *
 * Keeps the UI (bell, list, popup) instantly in sync across every open tab
 * without polling.
 */

export type NotificationPayload = {
  notification_id?: number | string | null;
  order_id?: number | string | null;
  event_type?: string | null;
  notification_type?: string | null;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  timestamp?: string | null;
  screen?: string | null;
};

export type NotificationBusEvent =
  | { type: "push"; data: NotificationPayload }
  | { type: "click"; data: NotificationPayload }
  | { type: "read"; id: number }
  | { type: "read-all" }
  | { type: "cleared" }
  | { type: "resubscribe"; subscription: PushSubscriptionJSON };

type Listener = (event: NotificationBusEvent) => void;

const listeners = new Set<Listener>();
const CHANNEL_NAME = "oms-notifications";

let broadcastChannel: BroadcastChannel | null = null;
let initialized = false;

const dispatch = (event: NotificationBusEvent) => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.error("notificationBus listener error:", error);
    }
  });
};

const handleServiceWorkerMessage = (event: MessageEvent) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  switch (message.type) {
    case "PUSH_RECEIVED":
      dispatch({ type: "push", data: message.data || {} });
      break;
    case "NOTIFICATION_CLICK":
      dispatch({ type: "click", data: message.data || {} });
      break;
    case "RESUBSCRIBE":
      dispatch({ type: "resubscribe", subscription: message.subscription });
      break;
    default:
      break;
  }
};

/** Wire up SW + BroadcastChannel listeners once per tab. */
export const initNotificationBus = () => {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage,
    );
  }

  if ("BroadcastChannel" in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      if (event.data && typeof event.data === "object") {
        dispatch(event.data as NotificationBusEvent);
      }
    };
  }
};

/** Subscribe to bus events; returns an unsubscribe function. */
export const onNotificationEvent = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Emit locally AND broadcast to other tabs (used for read-state sync). */
export const broadcastNotificationEvent = (event: NotificationBusEvent) => {
  dispatch(event);
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(event);
    } catch (error) {
      console.warn("BroadcastChannel post failed:", error);
    }
  }
};
