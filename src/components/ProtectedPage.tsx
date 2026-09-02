import { Suspense, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth";
import { accessFor, canAccess } from "../auth/routeAccess";
import PageLoading from "./PageLoading";
import RouteErrorBoundary from "./RouteErrorBoundary";
import Sidebar from "./Sidebar";

/**
 * The app shell, with the access check attached to it.
 *
 * Every page that renders inside the sidebar goes through here, and the rule
 * comes from `auth/routeAccess.ts` keyed on the path — so adding a route and
 * forgetting to guard it is not possible in the way it was before. It cannot
 * be forgotten because there is nothing to remember: the guard is part of the
 * shell the page already needed.
 *
 * That is deliberate. The alternative — a `<RequirePermission permission="…">`
 * around each of fifty-seven routes — puts the decision at fifty-seven call
 * sites, any one of which can be omitted silently. Exactly one was present
 * before this phase.
 *
 * Not a security boundary. Every endpoint behind every page enforces the same
 * rules server-side. This exists so a user is redirected honestly instead of
 * landing on a screen that renders and then fills with 403s.
 */
/**
 * "/Order_Status_Tracking" -> "Order Status Tracking".
 *
 * The path, not a lookup table: a table would be a second list of every route
 * to keep in step with `routeAccess.ts`, and the only thing it would buy is
 * nicer capitalisation on a screen the user should rarely see.
 */
function pageName(pathname: string): string {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  return last.replace(/[_-]+/g, " ").trim() || "requested";
}

export default function ProtectedPage({ children }: { children: ReactNode }) {
  const { status, session } = useAuth();
  const location = useLocation();

  // Still confirming who the token belongs to. Rendering would flash
  // privileged UI at someone who may not have it; redirecting would repeat the
  // bug that made the old guard unusable. Waiting is the only honest option.
  //
  // The shell renders meanwhile, so this reads as a page loading rather than
  // as a blank screen.
  if (status === "loading") return <Sidebar>{null}</Sidebar>;

  if (status === "anonymous") {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  // `pathname` is the lookup key. Safe because every route rendered through
  // this component has a static path — the only parameterised route in the app
  // (`/hais/device/:code`) is public and deliberately renders WITHOUT the
  // shell. `routeAccess.test.ts` asserts that stays true.
  if (!canAccess(session, accessFor(location.pathname))) {
    return <Navigate to="/Dashboard" replace />;
  }

  // The Suspense boundary sits INSIDE the shell, not around it.
  //
  // Pages are lazily loaded (App.tsx), so navigating to one that has not been
  // fetched yet suspends. With the boundary outside, the sidebar and header
  // would unmount and remount on every such navigation — the whole app
  // blanking for a moment, which reads as a page reload rather than a
  // navigation. Inside, only the content area waits, and the nav the user just
  // clicked stays under their cursor.
  /*
   * The error boundary sits beside the Suspense one, for the same reason and
   * with one addition: `key={pathname}`.
   *
   * A class boundary holds its error until something remounts it. Keyed on the
   * path, navigating away IS that remount — so a user who hits a broken page
   * clicks another link and is simply on another page. Without the key they
   * would carry the error screen with them, which is what the root boundary
   * does today and why both of its buttons have to reload the document.
   */
  return (
    <Sidebar>
      <RouteErrorBoundary key={location.pathname} routeName={pageName(location.pathname)}>
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </RouteErrorBoundary>
    </Sidebar>
  );
}
