import api from "./api";

/**
 * Browser Web Push client (Phase 3).
 *
 * Handles service-worker registration, notification permission, and push
 * subscribe/unsubscribe. Everything is feature-detected and degrades quietly:
 * Web Push needs a secure context (HTTPS, or http://localhost), so on a plain
 * `http://<ip>` origin `isWebPushSupported()` returns false and callers fall
 * back to polling.
 */

const SERVICE_WORKER_URL = "/service-worker.js";
const PERMISSION_STORAGE_KEY = "oms_web_push_permission";

export type WebPushPermission = NotificationPermission | "unsupported";

export const isSecureContextForPush = (): boolean =>
  typeof window !== "undefined" &&
  (window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

export const isWebPushSupported = (): boolean =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window &&
  isSecureContextForPush();

export const getStoredPermission = (): string | null =>
  typeof localStorage !== "undefined"
    ? localStorage.getItem(PERMISSION_STORAGE_KEY)
    : null;

const storePermission = (value: string) => {
  try {
    localStorage.setItem(PERMISSION_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
};

export const getCurrentPermission = (): WebPushPermission =>
  isWebPushSupported() ? Notification.permission : "unsupported";

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export const registerServiceWorker =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (!isWebPushSupported()) return null;
    if (!registrationPromise) {
      registrationPromise = navigator.serviceWorker
        .register(SERVICE_WORKER_URL)
        .catch((error) => {
          console.warn("Service worker registration failed:", error);
          registrationPromise = null;
          return null;
        });
    }
    return registrationPromise;
  };

const fetchPublicKey = async (): Promise<string | null> => {
  try {
    const response = await api.get("/orders/web-push/public-key/");
    return (response.data && response.data.public_key) || null;
  } catch (error) {
    console.warn("Failed to fetch VAPID public key:", error);
    return null;
  }
};

/**
 * Ask for notification permission (call only after the user opts in — never on
 * first load). Returns the resulting permission and persists it so we don't
 * prompt repeatedly.
 */
export const requestPermission = async (): Promise<WebPushPermission> => {
  if (!isWebPushSupported()) return "unsupported";
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  storePermission(permission);
  return permission;
};

/**
 * Ensure this browser is subscribed to Web Push and the subscription is stored
 * against the logged-in user. Safe to call multiple times (idempotent).
 */
export const subscribeToPush = async (): Promise<boolean> => {
  if (!isWebPushSupported()) return false;
  if (Notification.permission !== "granted") return false;

  const registration = await registerServiceWorker();
  if (!registration) return false;

  try {
    const ready = await navigator.serviceWorker.ready;
    let subscription = await ready.pushManager.getSubscription();

    if (!subscription) {
      const publicKey = await fetchPublicKey();
      if (!publicKey) return false;
      subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    await persistSubscription(subscription);
    return true;
  } catch (error) {
    console.warn("Web push subscription failed:", error);
    return false;
  }
};

/** Persist a PushSubscription (or its JSON) against the current user. */
export const persistSubscription = async (
  subscription: PushSubscription | PushSubscriptionJSON,
): Promise<void> => {
  const json =
    typeof (subscription as PushSubscription).toJSON === "function"
      ? (subscription as PushSubscription).toJSON()
      : (subscription as PushSubscriptionJSON);
  await api.post("/orders/web-push/subscribe/", { subscription: json });
};

/** Remove this browser's subscription (call on logout). Best-effort. */
export const unsubscribeFromPush = async (): Promise<void> => {
  if (!isWebPushSupported()) return;
  try {
    const ready = await navigator.serviceWorker.ready;
    const subscription = await ready.pushManager.getSubscription();
    if (!subscription) return;

    try {
      await api.delete("/orders/web-push/subscribe/", {
        data: { subscription: subscription.toJSON() },
      });
    } catch {
      /* backend cleanup is best-effort */
    }
    await subscription.unsubscribe();
  } catch (error) {
    console.warn("Web push unsubscribe failed:", error);
  }
};
