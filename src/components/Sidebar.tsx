import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HiArrowPath,
  HiArrowRightOnRectangle,
  HiCalendarDays,
  HiChartBar,
  HiChevronDown,
  HiClock,
  HiCog6Tooth,
  HiClipboardDocumentList,
  HiCube,
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
  HiUserCircle,
  HiUserGroup,
  HiUsers,
} from "react-icons/hi2";
import { getCurrentUser } from "../services/authService";
import api from "../services/api";
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const normalizedRole = userRole?.toLowerCase().replace(/[_-]+/g, " ").trim() || "";
  const isRateApprover =
    normalizedRole === "rate approver" ||
    normalizedRole === "rateapprover" ||
    normalizedRole === "approver";
  const isAdmin = userRole?.toLowerCase() === "admin";
  // An admin page link shows for admins, or for any user explicitly granted it
  // on the Permissions page.
  const canSee = (pageKey: string) => isAdmin || extraPages.includes(pageKey);

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

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem("access");
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await api.get('/orders/notifications/', config);
      let data = response.data ?? response;
      
      if (data && !Array.isArray(data)) {
        if (Array.isArray(data.data)) data = data.data;
        else if (Array.isArray(data.results)) data = data.results;
        else if (Array.isArray(data.notifications)) data = data.notifications;
      }

      if (Array.isArray(data)) {
        const unreadOnly = data.filter((n: any) => !n.is_read);
        setNotifications(unreadOnly);
        setUnreadCount(unreadOnly.length);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("access");

    if (!token) {
      window.location.href = "/";
    }

    const timer = setTimeout(() => fetchNotifications(), 500);
    const interval = setInterval(() => fetchNotifications(), 30000); 
    
    const handleRefresh = () => fetchNotifications();
    window.addEventListener("refreshNotifications", handleRefresh);

    return () => { 
      clearTimeout(timer); 
      clearInterval(interval); 
      window.removeEventListener("refreshNotifications", handleRefresh);
    };
  }, []);

  useEffect(() => {
    setSalesOpen(
      location.pathname === "/Add_Sales" ||
        location.pathname === "/Drafts" ||
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

  const handleCloseNotifications = () => {
    setShowNotificationsModal(false);
  };

  const handleClearAllNotifications = async () => {
    if (unreadCount > 0) {
      try {
        const token = localStorage.getItem("access");
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
        await api.post('/orders/notifications/', {}, config);
        setUnreadCount(0);
        setNotifications([]);
      } catch (error) {
        console.error("Error clearing notifications:", error);
      }
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    const role = normalizedRole;
    const isActionableRole = role === "auditor" || role === "billing" || isRateApprover;

    if (!isActionableRole) {
      if (!notification.is_read) {
        try {
          const token = localStorage.getItem("access");
          const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
          await api.patch(`/orders/notifications/${notification.id}/`, {}, config);
          setNotifications((prev) => prev.filter(n => n.id !== notification.id));
          setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch (error) {
          console.error("Error marking as read:", error);
        }
      } else {
        setNotifications((prev) => prev.filter(n => n.id !== notification.id));
      }
    }

    setShowNotificationsModal(false);
    
    const navState = notification.order_id ? { state: { openOrderId: notification.order_id } } : {};
    if (role === "auditor") navigate("/Auditor_orders", navState);
    else if (role === "billing") navigate("/Billing_orders", navState);
    else if (isRateApprover) navigate("/Rate_Approver_orders", navState);
    else if (role === "manager") navigate("/Order_Tracking", navState);
    else navigate("/View_Orders", navState);
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
              onClick={() => setShowNotificationsModal(true)}
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
          <div className="header-profile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: '16px' }}>
            <span className="header-profile-name" style={{ fontWeight: '600', fontSize: '0.9rem', color: '#0f172a' }}>{displayName}</span>
            <span className="header-profile-role" style={{ fontSize: '0.75rem', color: '#64748b' }}>{roleLabel}</span>
          </div>
        </div>
      </header>

      {menuOpen && <div className="overlay" onClick={closeSidebar}></div>}

      <aside className={`sidebar ${menuOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}>
        <ul>
          <li className={location.pathname === "/Dashboard" ? "active" : ""}>
            <Link to="/Dashboard" onClick={closeSidebar}>
              <SidebarIcon><HiHome /></SidebarIcon>
              Dashboard
            </Link>
          </li>

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
                  <li><Link to="/Drafts" onClick={closeSidebar}><SidebarIcon><HiDocumentText /></SidebarIcon>Drafts</Link></li>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 className="sb-modal-title" style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Notifications</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {notifications.length > 0 && (
                  <button onClick={handleClearAllNotifications} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#3b82f6', fontWeight: '500', padding: 0 }}>Clear All</button>
                )}
                <button onClick={handleCloseNotifications} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: '#64748b', lineHeight: 1, padding: 0 }}>&times;</button>
              </div>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
              {notifications.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', padding: '30px 0', margin: 0 }}>No new notifications.</p>
              ) : (
                notifications.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => handleNotificationClick(item)}
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      backgroundColor: !item.is_read ? '#f0f9ff' : '#f8fafc',
                      border: `1px solid ${!item.is_read ? '#bae6fd' : '#e2e8f0'}`,
                      marginBottom: '10px',
                      cursor: 'pointer'
                    }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#0f172a', lineHeight: '1.5' }}>{item.message}</p>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                ))
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
              <button className="sb-modal-confirm" onClick={() => {
                localStorage.removeItem("access");
                localStorage.removeItem("refresh");
                localStorage.removeItem("user_id");
                localStorage.removeItem("username");
                localStorage.removeItem("name");
                localStorage.removeItem("role");
                localStorage.removeItem("role_display");
                localStorage.removeItem("extra_pages");
                localStorage.removeItem("company_id");
                localStorage.removeItem("company_name");
                localStorage.removeItem("main_group_id");
                localStorage.removeItem("main_group_name");
                window.location.href = "/";
              }}>Yes, Logout</button>
            </div>
          </div>
        </div>
      )}

      <main className={`content-area ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>{children}</main>
    </>
  );
}
