/**
 * The notification bell, its history modal, and web push — all of it.
 *
 * Extracted whole from `Sidebar.tsx`, where roughly 340 lines of network calls,
 * cross-tab bus subscriptions, service-worker wiring, polling fallback and
 * OS-permission prompting sat interleaved with the navigation markup. Nothing
 * about the behaviour changes here; what changes is that a person reading the
 * sidebar's nav tree no longer has to scroll past push subscription logic to
 * find it, and vice versa.
 *
 * The two concerns share almost nothing. The only thing the sidebar needs from
 * this hook is a handful of values to render, and the only thing this hook
 * needs from the sidebar is the user's role — which decides where an order
 * deep-link should land and who gets asked to enable notifications.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";
import {
  broadcastNotificationEvent,
  initNotificationBus,
  onNotificationEvent,
} from "../../services/notificationBus";
import type { NotificationPayload } from "../../services/notificationBus";
import { loadUIFields, loadUILabels } from "../../services/uiConfig";
import { webDeviceService } from "../../services/webDeviceService";
import {
  getCurrentPermission,
  isWebPushSupported,
  persistSubscription,
  registerServiceWorker,
  requestPermission,
  subscribeToPush,
} from "../../services/webPushClient";
import {
  getPromptState,
  savePromptState,
  shouldShowPrompt,
} from "../../utils/notificationPermission";
import {
  initNotificationSound,
  playNotificationSound,
} from "../../utils/notificationSound";
import { showToast } from "@/lib/toastStore";
import {
  REFRESH_EVENT_NAMES,
  extractNotifications,
  type Notification,
} from "./notificationGrouping";
import { getAccessToken } from "@/auth";

/** Roles that are offered the browser notification prompt. */
const PROMPTED_ROLES = ["auditor", "billing", "manager"];

const HISTORY_PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 30_000;

export interface UseNotificationsOptions {
  /** Lowercased, separator-normalised primary role. */
  normalizedRole: string;
  isRateApprover: boolean;
}

export function useNotifications({
  normalizedRole,
  isRateApprover,
}: UseNotificationsOptions) {
  const navigate = useNavigate();

  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  // Web Push state.
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [permissionSubmitting, setPermissionSubmitting] = useState(false);
  // "default" | "granted" | "denied" | "unsupported".
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    getCurrentPermission(),
  );

  // Full history (modal): grouped/paginated, not just unread.
  const [historyItems, setHistoryItems] = useState<Notification[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | "unread">("all");
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Latest order-navigation fn, so long-lived bus handlers always route with
  // the current role without needing to re-subscribe.
  const goToOrderRef = useRef<(orderId?: number | string | null) => void>(
    () => {},
  );

  // Lightweight unread snapshot for the bell badge (also the polling fallback).
  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get("/orders/notifications/");
      const items = extractNotifications(response.data ?? response);
      setUnreadCount(items.filter((n) => !n.is_read).length);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  }, []);

  // Resolve the correct role route for a Sales Order deep-link (unchanged
  // routing — reused by clicks, toasts, and service-worker taps).
  const routeForRole = useCallback((): string => {
    if (normalizedRole === "auditor") return "/Auditor_orders";
    if (normalizedRole === "billing") return "/Billing_orders";
    if (isRateApprover) return "/Rate_Approver_orders";
    if (normalizedRole === "manager") return "/Order_Tracking";
    return "/View_Orders";
  }, [normalizedRole, isRateApprover]);

  const goToOrder = useCallback(
    (orderId?: number | string | null) => {
      navigate(routeForRole(), orderId ? { state: { openOrderId: Number(orderId) } } : {});
    },
    [navigate, routeForRole],
  );

  useEffect(() => {
    goToOrderRef.current = goToOrder;
  }, [goToOrder]);

  // Apply a single read to the badge + history list. Called only from the bus
  // listener so there is exactly one update path (no double-decrement).
  const applyRead = useCallback((id: number) => {
    setUnreadCount((c) => Math.max(0, c - 1));
    setHistoryItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
  }, []);

  // Marks read on the server, then broadcasts so THIS tab and every other tab
  // update through the single bus path. Only call for a currently-unread item.
  const markNotificationRead = useCallback(async (id: number) => {
    try {
      await api.patch(`/orders/notifications/${id}/`, {});
    } catch (error) {
      console.error("Error marking as read:", error);
    }
    broadcastNotificationEvent({ type: "read", id });
  }, []);

  // Paginated history for the modal: unread/read + Today/Yesterday/Older
  // grouping (grouped client-side), with "load more".
  const fetchHistory = useCallback(
    async (reset: boolean, filterOverride?: "all" | "unread") => {
      setHistoryLoading(true);
      try {
        const offset = reset ? 0 : historyOffset;
        const filter = filterOverride ?? historyFilter;
        const response = await api.get("/orders/notifications/history/", {
          params: { limit: HISTORY_PAGE_SIZE, offset, filter },
        });
        const payload = response.data ?? response;
        const results: Notification[] = Array.isArray(payload.results)
          ? payload.results
          : [];
        setHistoryItems((prev) => (reset ? results : [...prev, ...results]));
        setHistoryOffset(offset + results.length);
        setHistoryHasMore(payload.next_offset != null);
        if (typeof payload.unread_count === "number") {
          setUnreadCount(payload.unread_count);
        }
      } catch (error) {
        console.error("Error loading notification history:", error);
      } finally {
        setHistoryLoading(false);
      }
    },
    [historyOffset, historyFilter],
  );

  // --- Real-time wiring (replaces 30s polling) ------------------------------
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      window.location.href = "/";
      return;
    }

    // An authenticated session is active on this page load (fresh login or a
    // restored session). Register/refresh this browser in the background — a
    // no-op if it already succeeded, so route changes don't re-POST.
    void webDeviceService.onAuthenticated("startup");

    // Load dynamic UI labels once per authenticated session (covers a page
    // reload / restored session where Login didn't run). De-duped internally.
    void loadUILabels();
    void loadUIFields();

    initNotificationBus();
    initNotificationSound();
    void fetchNotifications();

    let interval: number | undefined;
    const startFallbackPolling = () => {
      if (interval) return;
      interval = window.setInterval(() => fetchNotifications(), POLL_INTERVAL_MS);
    };

    const off = onNotificationEvent((event) => {
      if (event.type === "push") {
        const data: NotificationPayload = event.data || {};
        void fetchNotifications();
        playNotificationSound();
        const orderNumber = (data as { order_number?: unknown }).order_number;
        showToast({
          title: data.title || "New notification",
          message: data.message || data.body || "",
          orderNumber:
            orderNumber != null
              ? String(orderNumber)
              : data.order_id != null
                ? String(data.order_id)
                : null,
          onAction: () => goToOrderRef.current(data.order_id ?? null),
        });
      } else if (event.type === "click") {
        goToOrderRef.current(event.data?.order_id ?? null);
      } else if (event.type === "read") {
        applyRead(event.id);
      } else if (event.type === "read-all" || event.type === "cleared") {
        setUnreadCount(0);
        setHistoryItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      } else if (event.type === "resubscribe") {
        persistSubscription(event.subscription).catch(() => undefined);
      }
    });

    const handleRefresh = () => fetchNotifications();
    const handleFocus = () => fetchNotifications();
    // Both spellings are honoured deliberately — see REFRESH_EVENT_NAMES.
    REFRESH_EVENT_NAMES.forEach((name) =>
      window.addEventListener(name, handleRefresh),
    );
    window.addEventListener("focus", handleFocus);

    void (async () => {
      if (isWebPushSupported()) {
        await registerServiceWorker();
        if (getCurrentPermission() === "granted") {
          // Already granted (incl. existing users): subscribe silently and
          // record it so our modal is never shown.
          savePromptState({ status: "granted" });
          const ok = await subscribeToPush();
          if (!ok) startFallbackPolling();
        } else {
          startFallbackPolling();
        }
      } else {
        // Insecure http (non-localhost) or unsupported browser: only here do we
        // fall back to polling.
        startFallbackPolling();
      }
    })();

    return () => {
      off();
      REFRESH_EVENT_NAMES.forEach((name) =>
        window.removeEventListener(name, handleRefresh),
      );
      window.removeEventListener("focus", handleFocus);
      if (interval) window.clearInterval(interval);
    };
    // Deliberately once per mount. `fetchNotifications` and `applyRead` are
    // stable (`useCallback` with no deps) and the role-dependent navigation is
    // reached through `goToOrderRef`, precisely so this does not re-subscribe.
    // Re-running it would tear down the bus subscription and the service-worker
    // registration on every role or route change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle a cold open from a service-worker notification tap (new tab carries
  // ?openOrderId=). Focused-tab taps arrive via the bus "click" event instead.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openOrderId = params.get("openOrderId");
    const notificationId = params.get("notificationId");
    if (!openOrderId) return;

    if (notificationId) void markNotificationRead(Number(notificationId));
    goToOrder(openOrderId);

    params.delete("openOrderId");
    params.delete("notificationId");
    const clean =
      window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", clean);
    // Once, on the initial load. This reads the URL the tab was OPENED with;
    // re-running it after a navigation would re-handle a deep link that has
    // already been consumed and stripped from the address bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show OUR modal as soon as the app is actually loaded — no arbitrary wait.
  // Only when appropriate: never asked, or 7 days since last dismissal.
  // Already-granted and denied users are skipped by shouldShowPrompt().
  useEffect(() => {
    if (!isWebPushSupported()) return;
    const eligible = PROMPTED_ROLES.includes(normalizedRole) || isRateApprover;
    if (!eligible) return;
    if (!shouldShowPrompt(getCurrentPermission())) return;

    // Wait for "app is interactive", not a fixed timer: the role is resolved by
    // now (this effect depends on it), so we only need to clear the first paint
    // so the modal never lands on the splash screen. A double rAF fires right
    // after the browser has committed that paint — typically a few ms, versus
    // the 3s hardcoded delay this replaces.
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setShowPushPrompt(true));
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [normalizedRole, isRateApprover]);

  // "Allow Notifications" → request the OS permission, then subscribe. Persists
  // the outcome so we never prompt again once granted, and back off if denied.
  const enablePush = useCallback(async () => {
    setPermissionSubmitting(true);
    try {
      const permission = await requestPermission();
      setNotifPermission(permission);
      if (permission === "granted") {
        savePromptState({ status: "granted", lastPromptAt: Date.now() });
        await subscribeToPush();
      } else if (permission === "denied") {
        savePromptState({ status: "denied", lastPromptAt: Date.now() });
      } else {
        savePromptState({ lastPromptAt: Date.now() });
      }
    } finally {
      setPermissionSubmitting(false);
      setShowPushPrompt(false);
    }
  }, []);

  const dismissPushPrompt = useCallback(() => {
    setShowPushPrompt(false);
    const current = getPromptState();
    savePromptState({
      status: "dismissed",
      lastPromptAt: Date.now(),
      dismissCount: current.dismissCount + 1,
    });
  }, []);

  const handleOpenNotifications = useCallback(() => {
    setShowNotificationsModal(true);
    void fetchHistory(true);
  }, [fetchHistory]);

  const handleCloseNotifications = useCallback(() => {
    setShowNotificationsModal(false);
  }, []);

  const changeHistoryFilter = useCallback(
    (filter: "all" | "unread") => {
      setHistoryFilter(filter);
      setHistoryOffset(0);
      void fetchHistory(true, filter);
    },
    [fetchHistory],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (unreadCount <= 0) return;
    try {
      await api.post("/orders/notifications/", {});
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
    // Single update path: the bus listener updates this tab and every other.
    broadcastNotificationEvent({ type: "read-all" });
  }, [unreadCount]);

  const handleNotificationClick = useCallback(
    async (notification: Notification) => {
      if (!notification.is_read) {
        // Always mark read on open — regardless of role (fixes the bug where
        // actionable roles left notifications unread).
        await markNotificationRead(notification.id);
      }
      setShowNotificationsModal(false);
      goToOrder(notification.order_id);
    },
    [markNotificationRead, goToOrder],
  );

  return {
    unreadCount,
    showNotificationsModal,
    historyItems,
    historyFilter,
    historyHasMore,
    historyLoading,
    notifPermission,
    showPushPrompt,
    permissionSubmitting,
    fetchHistory,
    handleOpenNotifications,
    handleCloseNotifications,
    handleMarkAllRead,
    handleNotificationClick,
    changeHistoryFilter,
    enablePush,
    dismissPushPrompt,
  };
}
