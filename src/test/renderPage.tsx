/**
 * Render a page the way the app renders it — router, session, error boundary.
 *
 * A page rendered bare is not the page the user gets. Most of them call
 * `useNavigate` or `useLocation`, several read the session, and all of them run
 * inside an error boundary. Leaving any of those out produces a test that
 * either cannot run or passes for the wrong reason.
 */
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider, saveSession, saveTokens } from "../auth";
import type { Session } from "../auth";
import { createQueryClient } from "../lib/queryClient";

/** A signed-in billing user — the role most pages are written for. */
export const TEST_SESSION: Session = {
  userId: "1",
  username: "tester",
  name: "Tester",
  role: "admin",
  roleDisplay: "Admin",
  roles: ["admin"],
  grants: [],
  isSuperuser: true,
  isStaff: true,
  companyId: "1",
  companyName: "Test Co",
  mainGroupId: "1",
  mainGroupName: "Main",
  categories: [],
};

/**
 * A token that is valid for an hour.
 *
 * Real rather than a placeholder because `isAccessTokenValid` decodes it, and
 * `useNotifications` sends the browser to "/" when no token is present — which
 * in jsdom is a silent no-op that leaves the page half-mounted and the failure
 * unexplained.
 */
export function testToken(secondsFromNow = 3600): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + secondsFromNow };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

/**
 * Put a signed-in session in storage, through the app's own `saveSession`.
 *
 * Not by writing the keys by hand: doing that would encode this file's idea of
 * the storage layout, and a change to the real one would leave every test
 * passing against a session shape the app no longer writes.
 */
export function signInForTest(overrides: Partial<Session> = {}): Session {
  const session = { ...TEST_SESSION, ...overrides };
  saveTokens(testToken(), "test-refresh");
  saveSession(session);
  return session;
}

function Wrapper({ children, route }: { children: ReactNode; route: string }) {
  /*
   * A FRESH client per render, not the app's shared one. Two tests that both
   * ask for `["tracker","alerts"]` would otherwise share a cache entry, and
   * the second would pass on data the first fetched — the kind of cross-test
   * dependency that only surfaces when someone reorders the file.
   *
   * Retries off as well: a smoke test asserting "this mounts" should not spend
   * two backoff rounds on a request jsdom was never going to answer.
   */
  const client = createQueryClient();
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retry: false, gcTime: 0 },
  });
  return (
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

/**
 * Render a page element at a given route with a signed-in session.
 *
 * Signed in as an ADMIN on purpose. A smoke test is asking "does this component
 * mount without throwing", and a page that redirects an unauthorised visitor
 * would answer that question by rendering nothing — a pass that proves nothing.
 */
export function renderPage(
  element: ReactElement,
  { route = "/", session }: { route?: string; session?: Partial<Session> } = {},
): RenderResult {
  signInForTest(session);
  return render(element, {
    wrapper: ({ children }) => <Wrapper route={route}>{children}</Wrapper>,
  });
}
