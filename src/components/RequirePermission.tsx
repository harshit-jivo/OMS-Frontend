import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

/**
 * Route guard for a page that needs a granted permission key.
 *
 * The sidebar already hides links a user cannot use, but hiding a link is not
 * access control — typing the URL would otherwise render the page. This is the
 * client-side half of the check.
 *
 * It is NOT the security boundary. Every endpoint behind these pages enforces
 * the same key server-side (payments/permissions.py), because anything the
 * browser decides can be edited by whoever owns the browser. This exists so a
 * user without the grant sees an honest redirect rather than a page that loads
 * and then fills with permission errors.
 *
 * Admins pass implicitly, matching `granted_keys()` on the server and `canSee`
 * in the sidebar — three places that must agree on what "admin" means.
 */
export default function RequirePermission({
  permission,
  children,
  redirectTo = "/Dashboard",
}: {
  permission: string;
  children: ReactNode;
  redirectTo?: string;
}) {
  const role = (localStorage.getItem("role") || "").toLowerCase().trim();
  if (role === "admin") return <>{children}</>;

  let granted: string[] = [];
  try {
    const stored = JSON.parse(localStorage.getItem("extra_pages") || "[]");
    granted = Array.isArray(stored) ? stored.map(String) : [];
  } catch {
    // Corrupt storage means no proof of a grant, so deny. Failing open here
    // would turn a parse bug into an access-control hole.
    granted = [];
  }

  return granted.includes(permission) ? (
    <>{children}</>
  ) : (
    <Navigate to={redirectTo} replace />
  );
}
