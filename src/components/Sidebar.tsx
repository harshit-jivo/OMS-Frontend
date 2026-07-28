import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HiArrowPath,
  HiArrowRightOnRectangle,
  HiBanknotes,
  HiCalendarDays,
  HiChartBar,
  HiChevronDown,
  // HiClipboardDocumentCheck,
  HiClock,
  HiCog6Tooth,
  HiClipboardDocumentList,
  HiCube,
  HiDevicePhoneMobile,
  HiDocumentCheck,
  HiDocumentText,
  HiEye,
  HiGift,
  HiHome,
  HiMap,
  HiPlusCircle,
  HiPresentationChartLine,
  HiReceiptPercent,
  HiShieldCheck,
  HiShoppingCart,
  HiTag,
  HiTruck,
  HiUserCircle,
  HiUserGroup,
  HiUsers,
  HiClipboardDocumentCheck
} from "react-icons/hi2";
import { getCurrentUser } from "../services/authService";
import api from "../services/api";
import { webDeviceService } from "../services/webDeviceService";
import { loadUILabels } from "../services/uiConfig";
import NotificationToaster, { showToast } from "./NotificationToaster";
import {
  initNotificationBus,
  onNotificationEvent,
  broadcastNotificationEvent,
} from "../services/notificationBus";
import type { NotificationPayload } from "../services/notificationBus";
import {
  initNotificationSound,
  playNotificationSound,
} from "../utils/notificationSound";
import {
  getCurrentPermission,
  isWebPushSupported,
  persistSubscription,
  registerServiceWorker,
  requestPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from "../services/webPushClient";
import {
  getPromptState,
  savePromptState,
  shouldShowPrompt,
} from "../utils/notificationPermission";
import NotificationPermissionModal from "./NotificationPermissionModal";
import { isTrackerRole, trackerPagesFor } from "../config/pageAccess";
import "./Sidebar.css";


type SidebarProps = {
  children: ReactNode;
};

type Notification = {
  id: number;
  message: string;
  is_read: boolean;
  order_id?: number;
  created_at: string;
};

const SidebarIcon = ({ children }: { children: ReactNode }) => (
  <span className="sb-nav-icon" aria-hidden="true">
    {children}
  </span>
);

// Bucket a notification's timestamp into Today / Yesterday / Older (Task 9).
const dateGroupLabel = (isoDate: string): "Today" | "Yesterday" | "Older" => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Older";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  return "Older";
};

const groupNotifications = (items: Notification[]) => {
  const groups: { label: string; items: Notification[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Older", items: [] },
  ];
  for (const item of items) {
    const label = dateGroupLabel(item.created_at);
    const bucket = groups.find((g) => g.label === label);
    if (bucket) bucket.items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
};

export default function Sidebar({ children }: SidebarProps) {

  const [salesOpen, setSalesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    localStorage.getItem("sidebar_collapsed") === "true"
  );
  const [userRole, setUserRole] = useState(localStorage.getItem("role") || "");
  const [userName, setUserName] = useState(localStorage.getItem("name") || localStorage.getItem("username") || "");
  const [extraPages, setExtraPages] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("extra_pages") || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  const [reportsOpen, setReportsOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const roleLabel = userRole ? userRole.toUpperCase() : "USER";
  const displayName = userName || "User";
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  // Web Push + real-time state (Phase 3).
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [permissionSubmitting, setPermissionSubmitting] = useState(false);
  // OS permission for the Settings section: "default" | "granted" | "denied" | "unsupported".
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
  const normalizedRole = userRole?.toLowerCase().replace(/[_-]+/g, " ").trim() || "";
  const isRateApprover =
    normalizedRole === "rate approver" ||
    normalizedRole === "rateapprover" ||
    normalizedRole === "approver";
  const isAdmin = userRole?.toLowerCase() === "admin";
  // An admin page link shows for admins, or for any user explicitly granted it
  // on the Permissions page.
  const canSee = (pageKey: string) => isAdmin || extraPages.includes(pageKey);

  // Tracker access is centralized by role (see config/pageAccess.ts).
  const trackerPages = trackerPagesFor(userRole, isAdmin);
  const canSeeTracker = (pageKey: string) => trackerPages.has(pageKey);
  // Pure tracker users (the three tracker sub-roles) get a trimmed sidebar —
  // no OMS Dashboard.
  const trackerOnly = isTrackerRole(userRole);

  const closeSidebar = () => {
    setMenuOpen(false);
  };

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const data = await getCurrentUser();
      const role = data.role || data.role_name || data.role_display || "";
      const roleName = typeof role === "object" ? role.name : role;
      const name = data.full_name || data.name || data.username || "";
      const grantedPages = Array.isArray(data.extra_pages) ? data.extra_pages : [];
      setUserRole(roleName);
      setUserName(name);
      setExtraPages(grantedPages);
      localStorage.setItem("role", roleName);
      localStorage.setItem("name", name);
      localStorage.setItem("extra_pages", JSON.stringify(grantedPages));
    } catch (error) {
      console.error("Failed to fetch user:", error);
    }
  };

  const authConfig = () => {
    const token = localStorage.getItem("access");
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  };

  // Lightweight unread snapshot for the bell badge (also the polling fallback).
  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get("/orders/notifications/", authConfig());
      let data = response.data ?? response;
      if (data && !Array.isArray(data)) {
        if (Array.isArray(data.data)) data = data.data;
        else if (Array.isArray(data.results)) data = data.results;
        else if (Array.isArray(data.notifications)) data = data.notifications;
      }
      if (Array.isArray(data)) {
        const unreadOnly = data.filter((n: any) => !n.is_read);
        setUnreadCount(unreadOnly.length);
      }
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
      const navState = orderId
        ? { state: { openOrderId: Number(orderId) } }
        : {};
      navigate(routeForRole(), navState as any);
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
      await api.patch(`/orders/notifications/${id}/`, {}, authConfig());
    } catch (error) {
      console.error("Error marking as read:", error);
    }
    broadcastNotificationEvent({ type: "read", id });
  }, []);

  // Paginated history for the modal (Task 9): unread/read + Today/Yesterday/
  // Older grouping (grouped client-side), with "load more".
  const fetchHistory = useCallback(
    async (reset: boolean, filterOverride?: "all" | "unread") => {
      setHistoryLoading(true);
      try {
        const offset = reset ? 0 : historyOffset;
        const filter = filterOverride ?? historyFilter;
        const response = await api.get("/orders/notifications/history/", {
          ...authConfig(),
          params: { limit: 20, offset, filter },
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
    const token = localStorage.getItem("access");
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

    initNotificationBus();
    initNotificationSound();
    fetchNotifications();

    let interval: number | undefined;
    const startFallbackPolling = () => {
      if (interval) return;
      interval = window.setInterval(() => fetchNotifications(), 30000);
    };

    const off = onNotificationEvent((event) => {
      if (event.type === "push") {
        const data: NotificationPayload = event.data || {};
        fetchNotifications();
        playNotificationSound();
        showToast({
          title: data.title || "New notification",
          message: data.message || data.body || "",
          orderNumber:
            (data as any).order_number != null
              ? String((data as any).order_number)
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
    window.addEventListener("refreshNotifications", handleRefresh);
    window.addEventListener("focus", handleFocus);

    (async () => {
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
      window.removeEventListener("refreshNotifications", handleRefresh);
      window.removeEventListener("focus", handleFocus);
      if (interval) window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle a cold open from a service-worker notification tap (new tab carries
  // ?openOrderId=). Focused-tab taps arrive via the bus "click" event instead.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openOrderId = params.get("openOrderId");
    const notificationId = params.get("notificationId");
    if (!openOrderId) return;

    if (notificationId) markNotificationRead(Number(notificationId));
    goToOrder(openOrderId);

    params.delete("openOrderId");
    params.delete("notificationId");
    const clean =
      window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", clean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show OUR modal as soon as the app is actually loaded — no arbitrary wait.
  // Only when appropriate: never asked, or 7 days since last dismissal.
  // Already-granted and denied users are skipped by shouldShowPrompt().
  useEffect(() => {
    if (!isWebPushSupported()) return;
    const eligible =
      ["auditor", "billing", "manager"].includes(normalizedRole) ||
      isRateApprover;
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
  const enablePush = async () => {
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
  };

  const dismissPushPrompt = () => {
    setShowPushPrompt(false);
    const current = getPromptState();
    savePromptState({
      status: "dismissed",
      lastPromptAt: Date.now(),
      dismissCount: current.dismissCount + 1,
    });
  };

  useEffect(() => {
    setSalesOpen(
      location.pathname === "/Add_Sales" ||
        // location.pathname === "/Drafts" ||
        location.pathname === "/View_Orders" ||
        location.pathname === "/FOC" ||
        location.pathname === "/Sales_Invoice"
    );
    setReportsOpen(
      location.pathname === "/Daily_Report" ||
        location.pathname === "/PersonWise_Report" ||
        location.pathname === "/Sales_Report" ||
        location.pathname === "/StateWise_Report"
    );
  }, [location.pathname]);

  const handleOpenNotifications = () => {
    setShowNotificationsModal(true);
    fetchHistory(true);
  };

  const handleCloseNotifications = () => {
    setShowNotificationsModal(false);
  };

  // NOTE: `device_id` / `device_last_sync` are deliberately ABSENT from this
  // list and must stay that way — one browser keeps ONE device id across
  // logins. Clearing it would create a phantom device on every logout/login.
  const clearSessionStorage = () => {
    [
      "access", "refresh", "user_id", "username", "name", "role",
      "role_display", "extra_pages", "company_id", "company_name",
      "main_group_id", "main_group_name",
    ].forEach((key) => localStorage.removeItem(key));
    // Per-session device state only; the persistent id above is untouched.
    webDeviceService.reset();
  };

  const handleLogout = async () => {
    // Invalidate the refresh token server-side (blacklist) so it can't be
    // reused after sign-out. Awaited with a short timeout so a slow/offline
    // network never blocks logout, and before we navigate (which would cancel
    // an in-flight request). Best-effort — failure must never block sign-out.
    try {
      const refresh = localStorage.getItem("refresh");
      if (refresh) {
        await api.post("/auth/logout/", { refresh }, { timeout: 3000 });
      }
    } catch {
      /* best-effort */
    }

    // Remove this browser's web-push subscription while the token is still
    // present, so we stop pushing to a signed-out device.
    try {
      await unsubscribeFromPush();
    } catch {
      /* best-effort */
    }
    clearSessionStorage();
    window.location.href = "/";
  };

  const changeHistoryFilter = (filter: "all" | "unread") => {
    setHistoryFilter(filter);
    setHistoryOffset(0);
    fetchHistory(true, filter);
  };

  const handleMarkAllRead = async () => {
    if (unreadCount <= 0) return;
    try {
      await api.post("/orders/notifications/", {}, authConfig());
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
    // Single update path: the bus listener updates this tab and every other.
    broadcastNotificationEvent({ type: "read-all" });
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      // Always mark read on open — regardless of role (fixes the bug where
      // actionable roles left notifications unread).
      await markNotificationRead(notification.id);
    }
    setShowNotificationsModal(false);
    goToOrder(notification.order_id);
  };

  return (
    <>
      <header className="header">
        <div className="logo-area">
          <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <button
            className="sidebar-collapse-btn"
            type="button"
            onClick={toggleSidebarCollapsed}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              {sidebarCollapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
              )}
            </svg>
          </button>
          <div className="logo-mark" aria-hidden="true">
            <img src="/logo.png" alt="OMS logo" className="logo-mark-img" />
          </div>
          <span className="logo-text">OMS</span>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center' }}>
          {(["auditor", "billing", "manager"].includes(normalizedRole) || isRateApprover) && (
            <button 
              className="header-bell-btn" 
              onClick={handleOpenNotifications}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                marginRight: '12px',
                color: '#475569'
              }}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" style={{ width: '24px', height: '24px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          )}
          <Link
            to="/Profile"
            className="header-profile"
            title="View profile and application information"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: '16px', textDecoration: 'none' }}
          >
            <span className="header-profile-name" style={{ fontWeight: '600', fontSize: '0.9rem', color: '#0f172a' }}>{displayName}</span>
            <span className="header-profile-role" style={{ fontSize: '0.75rem', color: '#64748b' }}>{roleLabel}</span>
          </Link>
        </div>
      </header>

      {menuOpen && <div className="overlay" onClick={closeSidebar}></div>}

      <aside className={`sidebar ${menuOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}>
        <ul>
          {!trackerOnly && (
            <li className={location.pathname === "/Dashboard" ? "active" : ""}>
              <Link to="/Dashboard" onClick={closeSidebar}>
                <SidebarIcon><HiHome /></SidebarIcon>
                Dashboard
              </Link>
            </li>
          )}

          {(userRole?.toLowerCase() === "billing" || userRole?.toLowerCase() === "factory_approver") && (
            <li className={location.pathname === "/Invoice_Review" ? "active" : ""}>
              <Link to="/Invoice_Review" onClick={closeSidebar}>
                <SidebarIcon><HiClipboardDocumentCheck /></SidebarIcon>
                Invoice Review
              </Link>
            </li>
          )} 

          {userRole?.toLowerCase() === "legal" && (
            <>
              <li className={location.pathname === "/Label_Checker" ? "active" : ""}>
                <Link to="/Label_Checker" onClick={closeSidebar}>
                  <SidebarIcon><HiTag /></SidebarIcon>
                  Label Checker
                </Link>
              </li>
              <li className={location.pathname === "/Nutrition_Manager" ? "active" : ""}>
                <Link to="/Nutrition_Manager" onClick={closeSidebar}>
                  <SidebarIcon><HiClipboardDocumentList /></SidebarIcon>
                  Nutrition Manager
                </Link>
              </li>
            </>
          )}

          {canSee("App_User") && (
            <li className={location.pathname === "/App_User" ? "active" : ""}>
              <Link to="/App_User" onClick={closeSidebar}>
                <SidebarIcon><HiUsers /></SidebarIcon>
                App User
              </Link>
            </li>
          )}

          {isAdmin && (
            <li className={location.pathname === "/Page_Permissions" ? "active" : ""}>
              <Link to="/Page_Permissions" onClick={closeSidebar}>
                <SidebarIcon><HiShieldCheck /></SidebarIcon>
                Permissions
              </Link>
            </li>
          )}

          {isAdmin && (
            <li className={location.pathname === "/Sales_Quotation" ? "active" : ""}>
              <Link to="/Sales_Quotation" onClick={closeSidebar}>
                <SidebarIcon><HiReceiptPercent /></SidebarIcon>
                Sales Quotation
              </Link>
            </li>
          )}

          {/* Payments */}
          {isAdmin && <li className="sidebar-section">Payments</li>}

          {isAdmin && (
            <li className={location.pathname === "/Make_Payment" ? "active" : ""}>
              <Link to="/Make_Payment" onClick={closeSidebar}>
                <SidebarIcon><HiBanknotes /></SidebarIcon>
                Make Payment
              </Link>
            </li>
          )}

          {/* Settings — admin-only configuration screens. */}
          {isAdmin && <li className="sidebar-section">Settings</li>}

          {isAdmin && (
            <li className={location.pathname === "/UI_Labels" ? "active" : ""}>
              <Link to="/UI_Labels" onClick={closeSidebar}>
                <SidebarIcon><HiTag /></SidebarIcon>
                UI Labels
              </Link>
            </li>
          )}

          {/* System — one screen: live device activity and version analytics.
              Gated by the same canSee() grant mechanism as every other admin
              page. */}
          {canSee("Device_Management") && (
            <li className="sidebar-section">System</li>
          )}

          {canSee("Device_Management") && (
            <li className={location.pathname === "/Device_Management" ? "active" : ""}>
              <Link to="/Device_Management" onClick={closeSidebar}>
                <SidebarIcon><HiDevicePhoneMobile /></SidebarIcon>
                Devices
              </Link>
            </li>
          )}

          {canSee("Sap_Sync") && (
            <li className={location.pathname === "/Sap_Sync" ? "active" : ""}>
              <Link to="/Sap_Sync" onClick={closeSidebar}>
                <SidebarIcon><HiArrowPath /></SidebarIcon>
                SAP Sync
              </Link>
            </li>
          )}

          {canSee("Party_Assignment") && (
            <li className={location.pathname === "/Party_Assignment" ? "active" : ""}>
              <Link to="/Party_Assignment" onClick={closeSidebar}>
                <SidebarIcon><HiUserGroup /></SidebarIcon>
                Party Assignment
              </Link>
            </li>
          )}

          {canSee("Party_Product_Assignment") && (
            <li className={location.pathname === "/Party_Product_Assignment" ? "active" : ""}>
              <Link to="/Party_Product_Assignment" onClick={closeSidebar}>
                <SidebarIcon><HiCube /></SidebarIcon>
                 Party Product Assignment
              </Link>
            </li>
          )}

          {canSee("Add_Scheme") && (
            <li className={location.pathname === "/Add_Scheme" ? "active" : ""}>
              <Link to="/Add_Scheme" onClick={closeSidebar}>
                <SidebarIcon><HiReceiptPercent /></SidebarIcon>
                Add Scheme
              </Link>
            </li>
          )}

          {canSee("Order_Flow_Settings") && (
            <li className={location.pathname === "/Order_Flow_Settings" ? "active" : ""}>
              <Link to="/Order_Flow_Settings" onClick={closeSidebar}>
                <SidebarIcon><HiCog6Tooth /></SidebarIcon>
                Order Flow Settings
              </Link>
            </li>
          )}

          {canSee("Product_Stock") && (
            <li className={location.pathname === "/Product_Stock" ? "active" : ""}>
              <Link to="/Product_Stock" onClick={closeSidebar}>
                <SidebarIcon><HiClipboardDocumentList /></SidebarIcon>
                Stock
              </Link>
            </li>
          )}

          {canSee("Einvoice") && (
            <li className={location.pathname === "/Einvoice" ? "active" : ""}>
              <Link to="/Einvoice" onClick={closeSidebar}>
                <SidebarIcon><HiDocumentCheck /></SidebarIcon>
                e-Invoice
              </Link>
            </li>
          )}

          {canSee("Ewaybill") && (
            <li className={location.pathname === "/Ewaybill" ? "active" : ""}>
              <Link to="/Ewaybill" onClick={closeSidebar}>
                <SidebarIcon><HiTruck /></SidebarIcon>
                e-Way Bill
              </Link>
            </li>
          )}

          {canSeeTracker("Tracker_Entry") && (
            <li className={location.pathname === "/Tracker_Entry" ? "active" : ""}>
              <Link to="/Tracker_Entry" onClick={closeSidebar}>
                <SidebarIcon><HiDocumentText /></SidebarIcon>
                Invoice Entry
              </Link>
            </li>
          )}

          {canSeeTracker("Tracker_Queue") && (
            <li className={location.pathname === "/Tracker_Queue" ? "active" : ""}>
              <Link to="/Tracker_Queue" onClick={closeSidebar}>
                <SidebarIcon><HiClipboardDocumentCheck /></SidebarIcon>
                My Stage Queue
              </Link>
            </li>
          )}

          {canSeeTracker("Tracker_Invoices") && (
            <li className={location.pathname === "/Tracker_Invoices" ? "active" : ""}>
              <Link to="/Tracker_Invoices" onClick={closeSidebar}>
                <SidebarIcon><HiClipboardDocumentList /></SidebarIcon>
                All Invoices
              </Link>
            </li>
          )}

          {canSeeTracker("Tracker_Alerts") && (
            <li className={location.pathname === "/Tracker_Alerts" ? "active" : ""}>
              <Link to="/Tracker_Alerts" onClick={closeSidebar}>
                <SidebarIcon><HiClock /></SidebarIcon>
                Stuck Alerts
              </Link>
            </li>
          )}

          {canSeeTracker("Tracker_Reports") && (
            <li className={location.pathname === "/Tracker_Reports" ? "active" : ""}>
              <Link to="/Tracker_Reports" onClick={closeSidebar}>
                <SidebarIcon><HiChartBar /></SidebarIcon>
                Tracker Reports
              </Link>
            </li>
          )}

          {canSeeTracker("Tracker_Admin") && (
            <li className={location.pathname === "/Tracker_Admin" ? "active" : ""}>
              <Link to="/Tracker_Admin" onClick={closeSidebar}>
                <SidebarIcon><HiCog6Tooth /></SidebarIcon>
                Tracker Config
              </Link>
            </li>
          )}

          {(userRole?.toLowerCase() === "manager" || userRole?.toLowerCase() == "billing") && (
            <li>
              <div className="dropdown-toggle" onClick={() => setSalesOpen(!salesOpen)}>
                <SidebarIcon><HiShoppingCart /></SidebarIcon>
                Sales
                <HiChevronDown className={`sb-chevron ${salesOpen ? "open" : ""}`} />
              </div>
              {salesOpen && (
                <ul className="dropdown-list">
                  <li><Link to="/Add_Sales" onClick={closeSidebar}><SidebarIcon><HiPlusCircle /></SidebarIcon>Add Sales</Link></li>
                  {/* <li><Link to="/Drafts" onClick={closeSidebar}><SidebarIcon><HiDocumentText /></SidebarIcon>Drafts</Link></li> */}
                  {(userRole?.toLowerCase() === "manager" || userRole?.toLowerCase() == "billing") && (
                    <li><Link to="/FOC" onClick={closeSidebar}><SidebarIcon><HiGift /></SidebarIcon>FOC</Link></li>
                  )}
                   {userRole?.toLowerCase() === "billing" && (
                    <li><Link to="/Sales_Invoice" onClick={closeSidebar}><SidebarIcon><HiDocumentText /></SidebarIcon>Sales Invoice</Link></li>
                  )} 
               
                  <li><Link to="/View_Orders" onClick={closeSidebar}><SidebarIcon><HiEye /></SidebarIcon>View Orders</Link></li>
                </ul>
              )}
            </li>
          )}

          {(userRole?.toLowerCase() ===  "auditor") && (
            <>
              <li className={location.pathname === "/Auditor_orders" ? "active" : ""}>
                <Link to="/Auditor_orders" onClick={closeSidebar}>
                  <SidebarIcon><HiClipboardDocumentList /></SidebarIcon>
                  Pending Orders
                </Link>
              </li>
              <li className={location.pathname === "/Auditor_status_tracking" ? "active" : ""}>
                <Link to="/Auditor_status_tracking" onClick={closeSidebar}>
                  <SidebarIcon><HiClock /></SidebarIcon>
                  Status Tracking
                </Link>
              </li>
            </>
          )}

          {(userRole?.toLowerCase() ===  "billing" ) && (
            <>
              <li className={location.pathname === "/Billing_orders" ? "active" : ""}>
                <Link to="/Billing_orders" onClick={closeSidebar}>
                  <SidebarIcon><HiClipboardDocumentList /></SidebarIcon>
                  Pending Orders
                </Link>
              </li>
              <li className={location.pathname === "/Billing_status_tracking" ? "active" : ""}>
                <Link to="/Billing_status_tracking" onClick={closeSidebar}>
                  <SidebarIcon><HiClock /></SidebarIcon>
                  Status Tracking
                </Link>
              </li>
              <li className={location.pathname === "/Order_Tracking" ? "active" : ""}>
                <Link to="/Order_Tracking" onClick={closeSidebar}>
                  <SidebarIcon><HiPresentationChartLine /></SidebarIcon>
                  Order Tracker
                </Link>
              </li>
              <li className={location.pathname === "/Invoice_Report" ? "active" : ""}>
                <Link to="/Invoice_Report" onClick={closeSidebar}>
                  <SidebarIcon><HiDocumentText /></SidebarIcon>
                  Invoice Report
                </Link>
              </li>
            </>
          )}

          {isRateApprover && (
            <>
              <li className={location.pathname === "/Rate_Approver_orders" ? "active" : ""}>
                <Link to="/Rate_Approver_orders" onClick={closeSidebar}>
                  <SidebarIcon><HiClipboardDocumentList /></SidebarIcon>
                  Pending Orders
                </Link>
              </li>
              <li className={location.pathname === "/Rate_Approver_status_tracking" ? "active" : ""}>
                <Link to="/Rate_Approver_status_tracking" onClick={closeSidebar}>
                  <SidebarIcon><HiClock /></SidebarIcon>
                  Status Tracking
                </Link>
              </li>
            </>
          )}

          {(userRole?.toLowerCase() ===  "manager" ) && (
            <>
              <li className={location.pathname === "/Order_Tracking" ? "active" : ""}>
                <Link to="/Order_Tracking" onClick={closeSidebar}>
                  <SidebarIcon><HiPresentationChartLine /></SidebarIcon>
                  Order Tracker
                </Link>
              </li>
            </>
          )}

          {(userRole?.toLowerCase() ===  "billing" || canSee("Reports")) && (
            <li>
              <div className="dropdown-toggle" onClick={() => setReportsOpen(!reportsOpen)}>
                <SidebarIcon><HiChartBar /></SidebarIcon>
                Reports
                <HiChevronDown className={`sb-chevron ${reportsOpen ? "open" : ""}`} />
              </div>
              {reportsOpen && (
                <ul className="dropdown-list">
                  <li><Link to="/Daily_Report" onClick={closeSidebar}><SidebarIcon><HiCalendarDays /></SidebarIcon>Daily Report</Link></li>
                  <li><Link to="/PersonWise_Report" onClick={closeSidebar}><SidebarIcon><HiUserCircle /></SidebarIcon>Person Wise Report</Link></li>
                  <li><Link to="/Sales_Report" onClick={closeSidebar}><SidebarIcon><HiChartBar /></SidebarIcon>Sales Report</Link></li>
                  <li><Link to="/StateWise_Report" onClick={closeSidebar}><SidebarIcon><HiMap /></SidebarIcon>State Wise Report</Link></li>
                  
                </ul>
              )}
            </li>
          )}

         
        </ul>

        <div className="sb-logout-wrap">
          <button
            className="sb-logout"
            onClick={() => setShowLogoutModal(true)}
          >
            <SidebarIcon><HiArrowRightOnRectangle /></SidebarIcon>
            Logout
          </button>
        </div>
      </aside>

      {/* ── NOTIFICATIONS MODAL ── */}
      {showNotificationsModal && (
        <div className="sb-modal-overlay" onClick={handleCloseNotifications} style={{ zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="sb-modal" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '420px', padding: '24px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 className="sb-modal-title" style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Notifications</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#3b82f6', fontWeight: '500', padding: 0 }}>Mark all read</button>
                )}
                <button onClick={handleCloseNotifications} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: '#64748b', lineHeight: 1, padding: 0 }}>&times;</button>
              </div>
            </div>

            {/* Unread / All filter (Task 9) */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => changeHistoryFilter(f)}
                  style={{
                    border: '1px solid',
                    borderColor: historyFilter === f ? '#2563eb' : '#e2e8f0',
                    background: historyFilter === f ? '#2563eb' : '#fff',
                    color: historyFilter === f ? '#fff' : '#475569',
                    borderRadius: '999px',
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {f === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
                </button>
              ))}
            </div>

            {/* ── NOTIFICATION SETTINGS (status + enable) ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: notifPermission === 'granted' ? '#22c55e' : '#94a3b8', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                  Desktop notifications: {notifPermission === 'granted' ? 'Enabled' : 'Disabled'}
                </p>
                {notifPermission === 'denied' && (
                  <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
                    Blocked in this browser. Click the lock icon in the address bar → Notifications → Allow, then reload.
                  </p>
                )}
                {notifPermission === 'unsupported' && (
                  <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
                    Requires HTTPS (or localhost) to enable desktop notifications.
                  </p>
                )}
              </div>
              {notifPermission === 'default' && isWebPushSupported() && (
                <button
                  onClick={enablePush}
                  disabled={permissionSubmitting}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                >
                  {permissionSubmitting ? '…' : 'Enable'}
                </button>
              )}
            </div>

            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
              {historyItems.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', padding: '30px 0', margin: 0 }}>
                  {historyLoading ? "Loading..." : "No notifications."}
                </p>
              ) : (
                <>
                  {groupNotifications(historyItems).map((group) => (
                    <div key={group.label} style={{ marginBottom: '8px' }}>
                      <p style={{ margin: '8px 4px', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{group.label}</p>
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleNotificationClick(item)}
                          style={{
                            padding: '14px',
                            borderRadius: '10px',
                            backgroundColor: !item.is_read ? '#f0f9ff' : '#f8fafc',
                            border: `1px solid ${!item.is_read ? '#bae6fd' : '#e2e8f0'}`,
                            marginBottom: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'flex-start',
                          }}>
                          {!item.is_read && (
                            <span style={{ marginTop: '6px', flexShrink: 0, width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb' }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#0f172a', lineHeight: '1.5' }}>{item.message}</p>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(item.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                  {historyHasMore && (
                    <button
                      onClick={() => fetchHistory(false)}
                      disabled={historyLoading}
                      style={{
                        width: '100%',
                        marginTop: '6px',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        color: '#2563eb',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: historyLoading ? 'default' : 'pointer',
                      }}
                    >
                      {historyLoading ? "Loading..." : "Load more"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── LOGOUT CONFIRM MODAL ── */}
      {showLogoutModal && (
        <div className="sb-modal-overlay" onClick={() => setShowLogoutModal(false)}>
          <div className="sb-modal" onClick={e => e.stopPropagation()}>
            <div className="sb-modal-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/>
              </svg>
            </div>
            <h3 className="sb-modal-title">Logout</h3>
            <p className="sb-modal-msg">Are you sure you want to logout?</p>
            <div className="sb-modal-actions">
              <button className="sb-modal-cancel" onClick={() => setShowLogoutModal(false)}>Cancel</button>
              <button className="sb-modal-confirm" onClick={handleLogout}>Yes, Logout</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOM PERMISSION MODAL (explain first, then OS prompt) ── */}
      <NotificationPermissionModal
        open={showPushPrompt}
        submitting={permissionSubmitting}
        onAllow={enablePush}
        onDismiss={dismissPushPrompt}
      />

      <NotificationToaster />

      <main className={`content-area ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>{children}</main>
    </>
  );
}
