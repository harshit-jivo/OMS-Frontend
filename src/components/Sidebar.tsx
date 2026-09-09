import { useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import api from "../services/api";
import { webDeviceService } from "../services/webDeviceService";
import NotificationToaster from "./NotificationToaster";
import { unsubscribeFromPush } from "../services/webPushClient";
import NotificationPermissionModal from "./NotificationPermissionModal";
import { useAuth } from "../auth";
import { canOpen } from "../auth/routeAccess";
import { useNotifications } from "./sidebar/useNotifications";
import { AppHeader } from "./layout/AppHeader";
import ProfileDialog from "./layout/ProfileDialog";
import { AppSidebar } from "./layout/AppSidebar";
import { LogoutDialog } from "./layout/LogoutDialog";
import { NotificationsDialog } from "./layout/NotificationsDialog";
import "./Sidebar.css";

/**
 * The application shell: header, navigation rail, content area.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS LEFT HERE, AND WHAT MOVED
 * ─────────────────────────────────────────────────────────────────────────
 * This file used to be 677 lines: a 100-line navigation table, two dialogs
 * with 26 inline styles between them, and the shell's markup, all around the
 * ten lines of state that actually connect them. The parts came out —
 *
 *   layout/navigation.ts        the link table (and `routeAccess.test.ts`
 *                               parses it, which it could not do here)
 *   layout/AppHeader.tsx        the top bar
 *   layout/AppSidebar.tsx       the rail
 *   layout/NotificationsDialog  the bell's dialog
 *   layout/LogoutDialog         the sign-out confirm
 *
 * — leaving the state, the session-clearing logout, and the composition.
 * The component keeps its name and its `children` prop, so `App.tsx` and the
 * route tree are untouched.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THE STYLING LIVES
 * ─────────────────────────────────────────────────────────────────────────
 * `Sidebar.css` is still imported and still owns POSITION: the fixed header,
 * the rail's width and its off-canvas behaviour below 1024px, and the content
 * area's offsets. The look is Tailwind, in the three files above. That split
 * is not tidiness — five unconverted stylesheets position fixed footer bars
 * against `.content-area`'s margins, so those numbers cannot move yet, and
 * unlayered CSS beats every utility, so the two cannot both own a property.
 * See the header comment in Sidebar.css.
 */

type SidebarProps = {
  children: ReactNode;
};

export default function Sidebar({ children }: SidebarProps) {
  // The router's pathname, not `window.location` — that would ignore the
  // router's basename and its own history. Drives the active-link highlight.
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  /** Profile is a dialog now rather than the /Profile route. */
  const [profileOpen, setProfileOpen] = useState(false);
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
   * The bell, the history dialog and web push — all of it, in one hook.
   *
   * Roughly 340 lines of network calls, cross-tab bus subscriptions,
   * service-worker wiring, polling fallback and OS-permission prompting used
   * to sit interleaved with the navigation markup. It shares nothing with the
   * nav tree but the user's role, which decides where an order deep-link lands
   * and who gets asked to enable notifications.
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

  /**
   * Should this link be shown?
   *
   * Asks the SAME table the router uses (`auth/routeAccess.ts`), keyed on the
   * path the link points at. Previously the sidebar carried its own copy of
   * every rule — `canSee("Einvoice") || role === "billing"` and so on — and
   * the router carried none, so the two could not even disagree: only one of
   * them had an opinion. Now a link is visible exactly when the route behind
   * it would open.
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

  const closeSidebar = () => setMenuOpen(false);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

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
      <AppHeader
        displayName={displayName}
        roleLabel={roleLabel}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        unreadCount={unreadCount}
        onOpenNotifications={handleOpenNotifications}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        // Close this first: the confirm is a dialog too, and two stacked
        // modals asking about one action is a worse question than one.
        onLogout={() => {
          setProfileOpen(false);
          setShowLogoutModal(true);
        }}
      />

      {menuOpen && (
        // The scrim only exists in the drawer state, so it is only ever
        // clickable below 1024px.
        <div className="overlay" onClick={closeSidebar} aria-hidden="true" />
      )}

      <AppSidebar
        open={menuOpen}
        collapsed={sidebarCollapsed}
        canShow={show}
        isLinkActive={isLinkActive}
        onNavigate={closeSidebar}
        onLogout={() => setShowLogoutModal(true)}
      />

      <NotificationsDialog
        open={Boolean(showNotificationsModal)}
        onClose={handleCloseNotifications}
        items={historyItems}
        unreadCount={unreadCount}
        filter={historyFilter}
        onChangeFilter={changeHistoryFilter}
        hasMore={historyHasMore}
        loading={historyLoading}
        onLoadMore={() => fetchHistory(false)}
        onMarkAllRead={handleMarkAllRead}
        onSelect={handleNotificationClick}
        permission={notifPermission}
        submitting={permissionSubmitting}
        onEnablePush={enablePush}
      />

      <LogoutDialog
        open={showLogoutModal}
        onOpenChange={setShowLogoutModal}
        onConfirm={handleLogout}
      />

      {/* Explain first, then the OS prompt. */}
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
