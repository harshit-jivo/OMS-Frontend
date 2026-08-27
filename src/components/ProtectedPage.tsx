import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth";
import { accessFor, canAccess } from "../auth/routeAccess";
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

  return <Sidebar>{children}</Sidebar>;
}
