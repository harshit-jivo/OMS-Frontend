import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  HiArrowPath,
  HiArrowRightOnRectangle,
  HiChartPie,
  HiCalendarDays,
  HiChartBar,
  HiChevronDown,
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
  HiClipboardDocumentCheck
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


type SidebarProps = {
  children: ReactNode;
};


const SidebarIcon = ({ children }: { children: ReactNode }) => (
  <span className="sb-nav-icon" aria-hidden="true">
    {children}
  </span>
);


export default function Sidebar({ children }: SidebarProps) {

  const [salesOpen, setSalesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    localStorage.getItem("sidebar_collapsed") === "true"
  );
  // Role, name and grants come from AuthProvider, not from three separate
  // localStorage reads kept in local state. The Sidebar used to be the ONLY
  // thing that loaded the user's grants — which is why route guards, running
  // earlier, had nothing to read. It is now a consumer like everything else.
  const { session, isAdmin } = useAuth();
  const userRole = session?.role ?? "";
  const userName = session?.name || session?.username || "";
  const [reportsOpen, setReportsOpen] = useState(false);
  const [distributorOpen, setDistributorOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const location = useLocation();
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
    setDistributorOpen(
      location.pathname === "/Distributor" ||
        location.pathname === "/Distributor_Order_Tracking"
    );
  }, [location.pathname]);


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

          {show("/Invoice_Review") && (
            <li className={location.pathname === "/Invoice_Review" ? "active" : ""}>
              <Link to="/Invoice_Review" onClick={closeSidebar}>
                <SidebarIcon><HiClipboardDocumentCheck /></SidebarIcon>
                Invoice Review
              </Link>
            </li>
          )} 

          {show("/Label_Checker") && (
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

          {show("/App_User") && (
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

          {/* Sales Quotation — DISABLED 2026-08-27, the flow is closed.
          {isAdmin && (
            <li className={location.pathname === "/Sales_Quotation" ? "active" : ""}>
              <Link to="/Sales_Quotation" onClick={closeSidebar}>
                <SidebarIcon><HiReceiptPercent /></SidebarIcon>
                Sales Quotation
              </Link>
            </li>
          )}
          */}

          {/* Payments — visible to admins and to anyone granted the
              Payments_Dashboard permission. The server enforces the same key
              on every analytics endpoint; this only decides the menu. */}
          {show("/Payments_Dashboard") && (
            <li className="sidebar-section">Payments</li>
          )}

          {show("/Payments_Dashboard") && (
            <li className={location.pathname === "/Payments_Dashboard" ? "active" : ""}>
              <Link to="/Payments_Dashboard" onClick={closeSidebar}>
                <SidebarIcon><HiChartPie /></SidebarIcon>
                Payments Dashboard
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
              Gated through the shared route table like every other link. */}
          {show("/Device_Management") && (
            <li className="sidebar-section">System</li>
          )}

          {show("/Device_Management") && (
            <li className={location.pathname === "/Device_Management" ? "active" : ""}>
              <Link to="/Device_Management" onClick={closeSidebar}>
                <SidebarIcon><HiDevicePhoneMobile /></SidebarIcon>
                Devices
              </Link>
            </li>
          )}

          {show("/Sap_Sync") && (
            <li className={location.pathname === "/Sap_Sync" ? "active" : ""}>
              <Link to="/Sap_Sync" onClick={closeSidebar}>
                <SidebarIcon><HiArrowPath /></SidebarIcon>
                SAP Sync
              </Link>
            </li>
          )}

          {show("/Party_Assignment") && (
            <li className={location.pathname === "/Party_Assignment" ? "active" : ""}>
              <Link to="/Party_Assignment" onClick={closeSidebar}>
                <SidebarIcon><HiUserGroup /></SidebarIcon>
                Party Assignment
              </Link>
            </li>
          )}

          {show("/Party_Product_Assignment") && (
            <li className={location.pathname === "/Party_Product_Assignment" ? "active" : ""}>
              <Link to="/Party_Product_Assignment" onClick={closeSidebar}>
                <SidebarIcon><HiCube /></SidebarIcon>
                 Party Product Assignment
              </Link>
            </li>
          )}

          {show("/Add_Scheme") && (
            <li className={location.pathname === "/Add_Scheme" ? "active" : ""}>
              <Link to="/Add_Scheme" onClick={closeSidebar}>
                <SidebarIcon><HiReceiptPercent /></SidebarIcon>
                Add Scheme
              </Link>
            </li>
          )}

          {show("/Scheme_Manager") && (
            <li className={location.pathname === "/Scheme_Manager" ? "active" : ""}>
              <Link to="/Scheme_Manager" onClick={closeSidebar}>
                <SidebarIcon><HiReceiptPercent /></SidebarIcon>
                Schemes
              </Link>
            </li>
          )}

          {show("/Combo_Mapping") && (
            <li className={location.pathname === "/Combo_Mapping" ? "active" : ""}>
              <Link to="/Combo_Mapping" onClick={closeSidebar}>
                <SidebarIcon><HiGift /></SidebarIcon>
                Combo Mapping
              </Link>
            </li>
          )}

          {show("/Order_Flow_Settings") && (
            <li className={location.pathname === "/Order_Flow_Settings" ? "active" : ""}>
              <Link to="/Order_Flow_Settings" onClick={closeSidebar}>
                <SidebarIcon><HiCog6Tooth /></SidebarIcon>
                Order Flow Settings
              </Link>
            </li>
          )}

          {show("/Product_Stock") && (
            <li className={location.pathname === "/Product_Stock" ? "active" : ""}>
              <Link to="/Product_Stock" onClick={closeSidebar}>
                <SidebarIcon><HiClipboardDocumentList /></SidebarIcon>
                Stock
              </Link>
            </li>
          )}

          

          
          {show("/Einvoice") && (
            <li className={location.pathname === "/Einvoice" ? "active" : ""}>
              <Link to="/Einvoice" onClick={closeSidebar}>
                <SidebarIcon><HiDocumentCheck /></SidebarIcon>
                e-Invoice
              </Link>
            </li>
          )}

          {show("/Ewaybill") && (
            <li className={location.pathname === "/Ewaybill" ? "active" : ""}>
              <Link to="/Ewaybill" onClick={closeSidebar}>
                <SidebarIcon><HiTruck /></SidebarIcon>
                e-Way Bill
              </Link>
            </li>
          )}

          {/* Visible to admins, users granted the "HAIS" page, and the HAIS role. */}
          {show("/HAIS") && (
            <li className={location.pathname === "/HAIS" ? "active" : ""}>
              <Link to="/HAIS" onClick={closeSidebar}>
                <SidebarIcon><HiComputerDesktop /></SidebarIcon>
                Hardware Assets
              </Link>
            </li>
          )}

          {/* Distributor — a collapsible group with two sub-pages: Create Order
              (the line-item form) and Order Tracker (view + track own orders, no
              staff edit flow). Visible to admins, users granted the "Distributor"
              page, and the Distributor role. */}
          {show("/Distributor") && (
            <li>
              <div className="dropdown-toggle" onClick={() => setDistributorOpen(!distributorOpen)}>
                <SidebarIcon><HiTruck /></SidebarIcon>
                Distributor
                <HiChevronDown className={`sb-chevron ${distributorOpen ? "open" : ""}`} />
              </div>
              {distributorOpen && (
                <ul className="dropdown-list">
                  <li className={location.pathname === "/Distributor" ? "active" : ""}>
                    <Link to="/Distributor" onClick={closeSidebar}>
                      <SidebarIcon><HiPlusCircle /></SidebarIcon>
                      Create Order
                    </Link>
                  </li>
                  <li className={location.pathname === "/Distributor_Order_Tracking" ? "active" : ""}>
                    <Link to="/Distributor_Order_Tracking" onClick={closeSidebar}>
                      <SidebarIcon><HiPresentationChartLine /></SidebarIcon>
                      Order Tracker
                    </Link>
                  </li>
                </ul>
              )}
            </li>
          )}

          {/* Visible to admins, users granted the "Mart_Approval" page, and the Mart Approval role. */}
          {show("/Mart_Approval") && (
            <li className={location.pathname === "/Mart_Approval" ? "active" : ""}>
              <Link to="/Mart_Approval" onClick={closeSidebar}>
                <SidebarIcon><HiClipboardDocumentCheck /></SidebarIcon>
                Mart Approval
              </Link>
            </li>
          )}

          {show("/Tracker_Entry") && (
            <li className={location.pathname === "/Tracker_Entry" ? "active" : ""}>
              <Link to="/Tracker_Entry" onClick={closeSidebar}>
                <SidebarIcon><HiDocumentText /></SidebarIcon>
                Invoice Entry
              </Link>
            </li>
          )}

          {show("/Ap_Invoice_Entry") && (
            <li className={location.pathname === "/Ap_Invoice_Entry" ? "active" : ""}>
              <Link to="/Ap_Invoice_Entry" onClick={closeSidebar}>
                <SidebarIcon><HiDocumentText /></SidebarIcon>
                AP Invoice Entry
              </Link>
            </li>
          )}

          {show("/Tracker_Queue") && (
            <li className={location.pathname === "/Tracker_Queue" ? "active" : ""}>
              <Link to="/Tracker_Queue" onClick={closeSidebar}>
                <SidebarIcon><HiClipboardDocumentCheck /></SidebarIcon>
                My Stage Queue
              </Link>
            </li>
          )}

          {show("/Tracker_Invoices") && (
            <li className={location.pathname === "/Tracker_Invoices" ? "active" : ""}>
              <Link to="/Tracker_Invoices" onClick={closeSidebar}>
                <SidebarIcon><HiClipboardDocumentList /></SidebarIcon>
                All Invoices
              </Link>
            </li>
          )}

          {show("/Tracker_Alerts") && (
            <li className={location.pathname === "/Tracker_Alerts" ? "active" : ""}>
              <Link to="/Tracker_Alerts" onClick={closeSidebar}>
                <SidebarIcon><HiClock /></SidebarIcon>
                Stuck Alerts
              </Link>
            </li>
          )}

          {show("/Tracker_Reports") && (
            <li className={location.pathname === "/Tracker_Reports" ? "active" : ""}>
              <Link to="/Tracker_Reports" onClick={closeSidebar}>
                <SidebarIcon><HiChartBar /></SidebarIcon>
                Tracker Reports
              </Link>
            </li>
          )}

          {show("/Tracker_Admin") && (
            <li className={location.pathname === "/Tracker_Admin" ? "active" : ""}>
              <Link to="/Tracker_Admin" onClick={closeSidebar}>
                <SidebarIcon><HiCog6Tooth /></SidebarIcon>
                Tracker Config
              </Link>
            </li>
          )}

          {show("/Add_Sales") && (
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
                  {show("/Add_Sales") && (
                    <li><Link to="/FOC" onClick={closeSidebar}><SidebarIcon><HiGift /></SidebarIcon>FOC</Link></li>
                  )}
                   {show("/Sales_Invoice") && (
                    <li><Link to="/Sales_Invoice" onClick={closeSidebar}><SidebarIcon><HiDocumentText /></SidebarIcon>Sales Invoice</Link></li>
                  )} 
               
                  <li><Link to="/View_Orders" onClick={closeSidebar}><SidebarIcon><HiEye /></SidebarIcon>View Orders</Link></li>
                </ul>
              )}
            </li>
          )}

          {show("/Auditor_orders") && (
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

          {show("/Billing_orders") && (
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

          {show("/Rate_Approver_orders") && (
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

          {show("/Order_Tracking") && (
            <>
              <li className={location.pathname === "/Order_Tracking" ? "active" : ""}>
                <Link to="/Order_Tracking" onClick={closeSidebar}>
                  <SidebarIcon><HiPresentationChartLine /></SidebarIcon>
                  Order Tracker
                </Link>
              </li>
            </>
          )}

          {show("/Daily_Report") && (
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
                  {/* Both SAP reports are billing-only (the pages themselves
                      bounce anyone else), so they are not shown to a user who
                      merely holds the "Reports" grant. */}
                  {show("/Sales_Invoice") && (
                    <>
                      <li><Link to="/Inventory_Report" onClick={closeSidebar}><SidebarIcon><HiCube /></SidebarIcon>Inventory Report</Link></li>
                      <li><Link to="/SO_Invoice_Report" onClick={closeSidebar}><SidebarIcon><HiClipboardDocumentCheck /></SidebarIcon>Open SO</Link></li>
                    </>
                  )}
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
