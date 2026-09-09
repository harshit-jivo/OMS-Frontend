import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth";

/**
 * Route guard for a page that needs a granted permission key.
 *
 * SUPERSEDED for routes by `ProtectedPage`, which reads `auth/routeAccess.ts`
 * keyed on the path. This was applied to exactly one route out of fifty-nine
 * because the decision sat at the call site, where it could be — and was —
 * omitted fifty-eight times. Wrapping the shell removes the call site.
 *
 * Kept for the case it is still right for: a guarded region that is not a
 * whole route, on a page reached without the shell. If nothing uses it after
 * Phase 3, it should go rather than sit here as a second guard that could
 * disagree with the table.
 *
 * The sidebar already hides links a user cannot use, but hiding a link is not
 * access control — typing the URL would otherwise render the page. This is the
 * client-side half of the check.
 *
 * It is NOT the security boundary. Every endpoint behind these pages enforces
 * the same key server-side, because anything the browser decides can be edited
 * by whoever owns the browser. This exists so a user without the grant sees an
 * honest redirect rather than a page that loads and then fills with 403s.
 *
 * Why it now reads from context
 * -----------------------------
 * It used to read `localStorage` directly, and that is why it was applied to
 * exactly one route out of fifty-nine.
 *
 * `extra_pages` was never written at login — `Login.tsx` stored ten keys and
 * that was not one of them. It was written only by `Sidebar.fetchCurrentUser`,
 * which runs AFTER the Sidebar mounts, i.e. after routing has already decided
 * what to render. So on a fresh login this guard read `[]`, failed closed
 * (correctly), and bounced non-admins off every page they held a grant for.
 *
 * A guard that rejects legitimate users gets removed, not debugged. Reading
 * from `AuthProvider` fixes the cause: the provider sits above the router and
 * reports a `loading` state, so the guard can WAIT for the answer instead of
 * guessing while the profile is in flight.
 */
export default function RequirePermission({
  permission,
  children,
  redirectTo = "/Home",
  fallback = null,
}: {
  /** An `extra_pages` grant key, or several — any one of them admits. */
  permission: string | string[];
  children: ReactNode;
  redirectTo?: string;
  /** Rendered while the session is still resolving. */
  fallback?: ReactNode;
}) {
  const { status, can } = useAuth();
  const location = useLocation();

  // Still confirming who the token belongs to. Rendering the page would flash
  // privileged UI at someone who may not have it; redirecting would repeat the
  // original bug. Waiting is the only honest option.
  if (status === "loading") return <>{fallback}</>;

  // Not signed in at all. Send them to the login screen rather than to
  // `redirectTo`, which is itself a guarded page — otherwise an anonymous
  // visitor bounces between two guards.
  if (status === "anonymous") {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  const keys = Array.isArray(permission) ? permission : [permission];
  const allowed = keys.some((key) => can(key));

  return allowed ? <>{children}</> : <Navigate to={redirectTo} replace />;
}
