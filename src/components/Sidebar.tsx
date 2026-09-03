import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  HiArrowPath,
  HiArrowRightOnRectangle,
  HiChartPie,
  HiCalendarDays,
  HiChartBar,
  HiClock,
  HiCog6Tooth,
  HiClipboardDocumentList,
  HiComputerDesktop,
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
  HiClipboardDocumentCheck,
} from "react-icons/hi2";
import api from "../services/api";
import { webDeviceService } from "../services/webDeviceService";
import NotificationToaster from "./NotificationToaster";
import { isWebPushSupported, unsubscribeFromPush } from "../services/webPushClient";
import NotificationPermissionModal from "./NotificationPermissionModal";
import { isTrackerRole } from "../config/pageAccess";
import { useAuth } from "../auth";
import { canOpen } from "../auth/routeAccess";
import { groupNotifications } from "./sidebar/notificationGrouping";
import { useNotifications } from "./sidebar/useNotifications";
import "./Sidebar.css";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type SidebarProps = {
  children: ReactNode;
};

const SidebarIcon = ({ children }: { children: ReactNode }) => (
  <span className="sb-nav-icon" aria-hidden="true">
    {children}
  </span>
);

/* -- Data-driven navigation (the EXIM pattern) ------------------------------
 *
 * One table, not six hundred lines of hand-written JSX. Each link names its
 * route; visibility is `canOpen(session, path)` -- the same routeAccess table
 * the router enforces -- so a link renders exactly when the route behind it
 * would open. A section auto-hides when none of its links are visible, which
 * is how a mart user ends up with a two-section sidebar without any
 * role-specific markup.
 *
 * `gate` overrides the visibility path for the two SAP reports that are
 * billing-only even though their routes sit under the Reports grant -- the
 * pages themselves bounce anyone else, so the links follow /Sales_Invoice.
 *
 * To add a page: add a route + routeAccess entry, then one line here.
 */
type IconComponent = React.ComponentType;

interface SidebarLinkDef {
  to: string;
  label: string;
  icon: IconComponent;
  /** Visibility path when it differs from `to`. */
  gate?: string;
}

interface SidebarSectionDef {
  label: string;
  links: SidebarLinkDef[];
}

const SIDEBAR_SECTIONS: SidebarSectionDef[] = [
  {
    label: "Orders",
    links: [
      { to: "/Add_Sales", label: "Add Sales", icon: HiPlusCircle },
      { to: "/FOC", label: "FOC", icon: HiGift },
      { to: "/View_Orders", label: "View Orders", icon: HiEye },
      { to: "/Order_Tracking", label: "Order Tracker", icon: HiPresentationChartLine },
      { to: "/Auditor_orders", label: "Auditor Queue", icon: HiClipboardDocumentList },
      { to: "/Auditor_status_tracking", label: "Auditor Tracking", icon: HiClock },
      { to: "/Billing_orders", label: "Billing Queue", icon: HiClipboardDocumentList },
      { to: "/Billing_status_tracking", label: "Billing Tracking", icon: HiClock },
      { to: "/Rate_Approver_orders", label: "Approver Queue", icon: HiClipboardDocumentList },
      { to: "/Rate_Approver_status_tracking", label: "Approver Tracking", icon: HiClock },
      { to: "/Mart_Approval", label: "Mart Approval", icon: HiShoppingCart },
    ],
  },
  {
    label: "Invoices",
    links: [
      { to: "/Sales_Invoice", label: "Sales Invoice", icon: HiDocumentText },
      { to: "/Invoice_Review", label: "Invoice Review", icon: HiDocumentCheck },
      { to: "/Invoice_Report", label: "Invoice Report", icon: HiDocumentText },
      { to: "/Einvoice", label: "e-Invoice (IRN)", icon: HiReceiptPercent },
      { to: "/Ewaybill", label: "e-Way Bill", icon: HiTruck },
    ],
  },
  {
    label: "Payments",
    links: [
      { to: "/Payments_Dashboard", label: "Payments Dashboard", icon: HiChartPie },
    ],
  },
  {
    label: "Reports",
    links: [
      { to: "/Daily_Report", label: "Daily Report", icon: HiCalendarDays },
      { to: "/PersonWise_Report", label: "Person Wise", icon: HiUserCircle },
      { to: "/Sales_Report", label: "Sales Report", icon: HiChartBar },
      { to: "/StateWise_Report", label: "State Wise", icon: HiMap },
      { to: "/Inventory_Report", label: "Inventory Report", icon: HiCube, gate: "/Sales_Invoice" },
      { to: "/SO_Invoice_Report", label: "Open SO", icon: HiClipboardDocumentCheck, gate: "/Sales_Invoice" },
    ],
  },
  {
    label: "Stock",
    links: [{ to: "/Product_Stock", label: "Stock", icon: HiCube }],
  },
  {
    label: "Schemes",
    links: [
      { to: "/Add_Scheme", label: "Add Scheme", icon: HiGift },
      { to: "/Scheme_Manager", label: "Schemes", icon: HiTag },
      { to: "/Combo_Mapping", label: "Combo Mapping", icon: HiCube },
    ],
  },
  {
    label: "Distributor",
    links: [
      { to: "/Distributor", label: "Distributor", icon: HiTruck },
      { to: "/Distributor_Order_Tracking", label: "Order Tracking", icon: HiClock },
    ],
  },
  {
    label: "Legal",
    links: [
      { to: "/Label_Checker", label: "Label Checker", icon: HiDocumentCheck },
      { to: "/Nutrition_Manager", label: "Nutrition Manager", icon: HiClipboardDocumentList },
    ],
  },
  {
    label: "HAIS",
    links: [{ to: "/HAIS", label: "Hardware Assets", icon: HiComputerDesktop }],
  },
  {
    label: "Tracker",
    links: [
      { to: "/Tracker_Entry", label: "Invoice Entry", icon: HiPlusCircle },
      { to: "/Ap_Invoice_Entry", label: "AP Invoice Entry", icon: HiDocumentText },
      { to: "/Tracker_Queue", label: "My Stage Queue", icon: HiClipboardDocumentList },
      { to: "/Tracker_Invoices", label: "All Invoices", icon: HiEye },
      { to: "/Tracker_Alerts", label: "Stuck Alerts", icon: HiClock },
      { to: "/Tracker_Reports", label: "Reports", icon: HiChartBar },
      { to: "/Tracker_Admin", label: "Administration", icon: HiCog6Tooth },
    ],
  },
  {
    label: "Administration",
    links: [
      { to: "/App_User", label: "App User", icon: HiUsers },
      { to: "/Page_Permissions", label: "Permissions", icon: HiShieldCheck },
      { to: "/Role_Permissions", label: "Role Permissions", icon: HiShieldCheck },
      { to: "/Party_Assignment", label: "Party Assignment", icon: HiUserGroup },
      { to: "/Party_Product_Assignment", label: "Party Products", icon: HiTag },
      { to: "/Order_Flow_Settings", label: "Order Flow Settings", icon: HiCog6Tooth },
      { to: "/Sap_Sync", label: "SAP Sync", icon: HiArrowPath },
      { to: "/Device_Management", label: "Device Management", icon: HiDevicePhoneMobile },
      { to: "/UI_Labels", label: "UI Labels", icon: HiTag },
    ],
  },
];

export default function Sidebar({ children }: SidebarProps) {
  // The router's pathname, not `window.location` — that would ignore the
  // router's basename and its own history. Drives the active-link highlight.
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    localStorage.getItem("sidebar_collapsed") === "true",
  );
  // Role, name and grants come from AuthProvider, not from three separate
  // localStorage reads kept in local state. The Sidebar used to be the ONLY
  // thing that loaded the user's grants — which is why route guards, running
  // earlier, had nothing to read. It is now a consumer like everything else.
  const { session } = useAuth();
  const userRole = session?.role ?? "";
  const userName = session?.name || session?.username || "";
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const roleLabel = userRole ? userRole.toUpperCase() : "USER";
  const displayName = userName || "User";
  const normalizedRole = userRole?.toLowerCase().replace(/[_-]+/g, " ").trim() || "";
  const isRateApprover =
    normalizedRole === "rate approver" ||
    normalizedRole === "rateapprover" ||
    normalizedRole === "approver";
  /**
   * The bell, the history modal and web push — all of it, in one hook.
   *
   * Roughly 340 lines of network calls, cross-tab bus subscriptions,
   * service-worker wiring, polling fallback and OS-permission prompting used
   * to sit interleaved with the navigation markup below. It shares nothing
   * with the nav tree but the user's role, which decides where an order
   * deep-link lands and who gets asked to enable notifications.
   */
  const {
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
  } = useNotifications({ normalizedRole, isRateApprover });

  // `isAdmin` and `canSee` now come from the auth module, which counts
  // `extra_roles`, `is_superuser` and `is_staff` — the local version compared
  // the primary role string alone, so a user granted admin through
  // `extra_roles` saw an almost-empty sidebar over an API that allowed them
  // everything. See src/auth/permissions.ts.

  /**
   * Should this link be shown?
   *
   * Asks the SAME table the router uses (`auth/routeAccess.ts`), keyed on the
   * path the link points at. Previously the sidebar carried its own copy of
   * every rule — `canSee("Einvoice") || role === "billing"` and so on — and
   * the router carried none, so the two could not even disagree: only one of
   * them had an opinion.
   *
   * Now a link is visible exactly when the route behind it would open. Adding
   * a page in one place and forgetting the other is no longer possible,
   * because there is only one place.
   */
  const show = (path: string) => canOpen(session, path);

  /**
   * A link is active on its own path and on any route nested under it, so a
   * detail page like /Sales_Invoice/SKU_Images keeps its parent highlighted.
   * Exact-or-prefix is enough here because no sidebar path is a prefix of
   * another sidebar path.
   */
  const isLinkActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(`${to}/`);

  // Tracker access is centralized by role (see config/pageAccess.ts), and is
  // reached through `show()` like everything else — the table's `trackerPage`
  // rules resolve to the same `trackerPagesFor` call.
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

  // `fetchCurrentUser` lived here and was the only thing in the app that
  // loaded the user's grants. AuthProvider now does it, above the router, so
  // the data exists before any guard runs — see src/auth/AuthContext.tsx.
  // Removing it from here is what makes one source of truth possible; leaving
  // a second fetch would just recreate the drift more quietly.


  // NOTE: `device_id` / `device_last_sync` are deliberately ABSENT from this
  // list and must stay that way — one browser keeps ONE device id across
  // logins. Clearing it would create a phantom device on every logout/login.
  const clearSessionStorage = () => {
    [
      "access",
      "refresh",
      "user_id",
      "username",
      "name",
      "role",
      "role_display",
      "extra_pages",
      "company_id",
      "company_name",
      "main_group_id",
      "main_group_name",
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

  return (
    <>
      <header className="header">
        <div className="logo-area">
          <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
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
        <div className="header-right">
          {(["auditor", "billing", "manager"].includes(normalizedRole) || isRateApprover) && (
            <button
              className="header-bell-btn"
              onClick={handleOpenNotifications}
            >
              <svg
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
                className="sb-bell-icon"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="sb-bell-badge">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          )}
          <Link
            to="/Profile"
            className="header-profile"
            title="View profile and application information"
          >
            <span className="header-profile-name">{displayName}</span>
            <span className="header-profile-role">{roleLabel}</span>
          </Link>
        </div>
      </header>

      {menuOpen && <div className="overlay" onClick={closeSidebar}></div>}

      <aside className={`sidebar ${menuOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}>
        <ul>
          {!trackerOnly && (
            <li className={isLinkActive("/Dashboard") ? "active" : ""}>
              <Link to="/Dashboard" onClick={closeSidebar}>
                <SidebarIcon>
                  <HiHome />
                </SidebarIcon>
                Dashboard
              </Link>
            </li>
          )}

          {SIDEBAR_SECTIONS.map((section) => {
            const visible = section.links.filter((link) => show(link.gate ?? link.to));
            if (visible.length === 0) return null;
            return (
              <Fragment key={section.label}>
                <li className="sidebar-section">{section.label}</li>
                {visible.map((link) => {
                  const Icon = link.icon;
                  return (
                    <li key={link.to} className={isLinkActive(link.to) ? "active" : ""}>
                      <Link to={link.to} onClick={closeSidebar}>
                        <SidebarIcon>
                          <Icon />
                        </SidebarIcon>
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </Fragment>
            );
          })}
        </ul>

        <div className="sb-logout-wrap">
          <button className="sb-logout" onClick={() => setShowLogoutModal(true)}>
            <SidebarIcon>
              <HiArrowRightOnRectangle />
            </SidebarIcon>
            Logout
          </button>
        </div>
      </aside>

      {/* ── NOTIFICATIONS MODAL ── */}
      <Dialog
        open={Boolean(showNotificationsModal)}
        onOpenChange={(next) => {
          if (!next) handleCloseNotifications();
        }}
      >
        {showNotificationsModal && (
          <DialogContent
            title="Notifications"
            variant="bare"
            size="auto"
            showClose={false}
            className="sb-modal"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <h3 className="sb-modal-title sb-notif-title">
                Notifications
              </h3>
              <div className="sb-notif-head-actions">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="sb-notif-markall"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={handleCloseNotifications}
                  className="sb-notif-close"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Unread / All filter (Task 9) */}
            <div className="sb-notif-filters">
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => changeHistoryFilter(f)}
                  className={`sb-notif-chip${historyFilter === f ? " is-active" : ""}`}
                >
                  {f === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
                </button>
              ))}
            </div>

            {/* ── NOTIFICATION SETTINGS (status + enable) ── */}
            <div className="sb-notif-settings">
              <span
                className={`sb-notif-dot${notifPermission === "granted" ? " is-on" : ""}`}
              />
              <div className="sb-notif-grow">
                <p className="sb-notif-settings-title">
                  Desktop notifications: {notifPermission === "granted" ? "Enabled" : "Disabled"}
                </p>
                {notifPermission === "denied" && (
                  <p className="sb-notif-hint">
                    Blocked in this browser. Click the lock icon in the address bar → Notifications
                    → Allow, then reload.
                  </p>
                )}
                {notifPermission === "unsupported" && (
                  <p className="sb-notif-hint">
                    Requires HTTPS (or localhost) to enable desktop notifications.
                  </p>
                )}
              </div>
              {notifPermission === "default" && isWebPushSupported() && (
                <button
                  onClick={enablePush}
                  disabled={permissionSubmitting}
                  className="sb-notif-enable"
                >
                  {permissionSubmitting ? "…" : "Enable"}
                </button>
              )}
            </div>

            <div className="sb-notif-list">
              {historyItems.length === 0 ? (
                <p className="sb-notif-empty">
                  {historyLoading ? "Loading..." : "No notifications."}
                </p>
              ) : (
                <>
                  {groupNotifications(historyItems).map((group) => (
                    <div key={group.label} className="sb-notif-group">
                      <p className="sb-notif-group-label">
                        {group.label}
                      </p>
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleNotificationClick(item)}
                          className={`sb-notif-item${!item.is_read ? " is-unread" : ""}`}
                        >
                          {!item.is_read && (
                            <span className="sb-notif-item-dot" />
                          )}
                          <div className="sb-notif-grow">
                            <p className="sb-notif-message">
                              {item.message}
                            </p>
                            <span className="sb-notif-time">
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                  {historyHasMore && (
                    <button
                      onClick={() => fetchHistory(false)}
                      disabled={historyLoading}
                      className="sb-notif-more"
                    >
                      {historyLoading ? "Loading..." : "Load more"}
                    </button>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* ── LOGOUT CONFIRM MODAL ── */}
      <Dialog
        open={Boolean(showLogoutModal)}
        onOpenChange={(next) => {
          if (!next) (() => setShowLogoutModal(false))();
        }}
      >
        {showLogoutModal && (
          <DialogContent
            title="Sign out"
            variant="bare"
            size="auto"
            showClose={false}
            className="sb-modal"
          >
            <div className="sb-modal-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"
                />
              </svg>
            </div>
            <h3 className="sb-modal-title">Logout</h3>
            <p className="sb-modal-msg">Are you sure you want to logout?</p>
            <div className="sb-modal-actions">
              <button className="sb-modal-cancel" onClick={() => setShowLogoutModal(false)}>
                Cancel
              </button>
              <button className="sb-modal-confirm" onClick={handleLogout}>
                Yes, Logout
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* ── CUSTOM PERMISSION MODAL (explain first, then OS prompt) ── */}
      <NotificationPermissionModal
        open={showPushPrompt}
        submitting={permissionSubmitting}
        onAllow={enablePush}
        onDismiss={dismissPushPrompt}
      />

      <NotificationToaster />

      <main className={`content-area ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {children}
      </main>
    </>
  );
}
