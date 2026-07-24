// Centralized Document-Tracker page access — MUST mirror the backend rule in
// OMS-Backend/tracker/permissions.py. Access is decided purely by the user's
// role; the sidebar, login-landing and (server-side) the APIs all read from
// this single source. To change who sees what, change a user's role — never
// page code.

export const TRACKER_PAGES: Record<string, { path: string; label: string }> = {
  Tracker_Entry: { path: "/Tracker_Entry", label: "Invoice Entry" },
  Tracker_Queue: { path: "/Tracker_Queue", label: "My Stage Queue" },
  Tracker_Invoices: { path: "/Tracker_Invoices", label: "All Invoices" },
  Tracker_Alerts: { path: "/Tracker_Alerts", label: "Stuck Alerts" },
  Tracker_Reports: { path: "/Tracker_Reports", label: "Tracker Reports" },
  Tracker_Admin: { path: "/Tracker_Admin", label: "Tracker Config" },
};

// The three tracker sub-roles -> the pages each one sees.
// Stuck Alerts and All Invoices are admin-only.
export const TRACKER_ROLE_PAGES: Record<string, string[]> = {
  tracker_admin: ["Tracker_Entry", "Tracker_Queue", "Tracker_Invoices", "Tracker_Alerts", "Tracker_Reports", "Tracker_Admin"],
  tracker_entry: ["Tracker_Entry", "Tracker_Queue"],
  tracker_user: ["Tracker_Queue"],
};

// Display labels for the three sub-roles (for the user-management dropdown).
export const TRACKER_ROLE_LABELS: Record<string, string> = {
  tracker_admin: "Tracker Admin",
  tracker_entry: "Invoice Entry",
  tracker_user: "Tracker User",
};

const ALL_TRACKER_PAGES = Object.keys(TRACKER_PAGES);

export function normalizeRole(role?: string | null): string {
  return (role || "").toLowerCase().trim();
}

/** True for the three tracker sub-roles (not OMS admin, not other OMS roles). */
export function isTrackerRole(role?: string | null): boolean {
  return normalizeRole(role) in TRACKER_ROLE_PAGES;
}

/** The set of tracker page keys a user may see. Superusers / OMS admins see all. */
export function trackerPagesFor(role?: string | null, isAdmin = false): Set<string> {
  const r = normalizeRole(role);
  if (isAdmin || r === "admin") return new Set(ALL_TRACKER_PAGES);
  return new Set(TRACKER_ROLE_PAGES[r] || []);
}

// Where a tracker user lands after login, by priority of what they can access.
const LANDING_ORDER = ["Tracker_Queue", "Tracker_Entry", "Tracker_Reports", "Tracker_Alerts", "Tracker_Admin"];

export function trackerLandingPath(pages: Set<string>): string | null {
  for (const key of LANDING_ORDER) {
    if (pages.has(key)) return TRACKER_PAGES[key].path;
  }
  return null;
}

/**
 * The landing path for ANY role, after a fresh login or a restored session:
 *   • tracker sub-roles -> their highest-priority tracker page
 *   • legal reviewers   -> their own workspace
 *   • everyone else     -> the Dashboard
 *
 * Both entry points in `pages/Login.tsx` (the login submit and the
 * already-authenticated startup redirect) call this, so the two can never drift
 * apart again. Callers append `window.location.search` themselves to preserve
 * notification deep-link params.
 */
export function landingPathFor(role?: string | null): string {
  if (isTrackerRole(role)) {
    return trackerLandingPath(trackerPagesFor(role)) || TRACKER_PAGES.Tracker_Queue.path;
  }
  if (normalizeRole(role) === "legal") return "/Label_Checker";
  return "/Dashboard";
}
