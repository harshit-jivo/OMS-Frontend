/**
 * Session state for the whole app, resolved BEFORE any guard runs.
 *
 * The ordering is the point. Previously the only thing that loaded the user's
 * grants was `Sidebar.fetchCurrentUser`, which runs after the Sidebar mounts —
 * so a route guard reading those grants ran against storage nothing had
 * written yet. This provider sits above the router and exposes a `status`, so
 * a guard can wait rather than guess.
 *
 * Three states, and the middle one is the whole reason this exists:
 *
 *     "loading"        we have a token and are confirming who it belongs to
 *     "authenticated"
 *     "anonymous"
 *
 * Collapsing "loading" into "anonymous" is what made the old guard redirect
 * legitimate users; collapsing it into "authenticated" would flash privileged
 * UI at someone who may not have it. It has to be its own state.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getCurrentUser } from "../services/authService";
import { AuthContext, type AuthStatus, type AuthValue } from "./context";
import {
  can as canWith,
  hasRole as hasRoleWith,
  isAdmin as isAdminWith,
  type Session,
} from "./permissions";
import {
  clearSession,
  loadSession,
  saveSession,
  sessionFromApi,
  type ApiUser,
} from "./session";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seeded from storage so a reload renders the right thing on the first
  // paint, rather than flashing the login screen while the profile loads.
  // Read ONCE — two `loadSession()` calls in two initializers could disagree
  // if storage changed between them.
  const [initial] = useState(() => loadSession());
  const [session, setSession] = useState<Session | null>(initial);
  const [status, setStatus] = useState<AuthStatus>(
    initial ? "loading" : "anonymous",
  );

  // Guards against a `setState` on an unmounted provider, and against a slow
  // in-flight refresh overwriting a newer sign-in or sign-out.
  const alive = useRef(true);
  const generation = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++generation.current;

    // No stored session means there is nothing to confirm, and state already
    // says so — set by the initializer on mount, by `signOut`, or by the
    // cross-tab listener below. Returning rather than calling setState here
    // also keeps this function free of any SYNCHRONOUS state update, which is
    // what lets it be called straight from an effect without cascading
    // renders.
    if (!loadSession()) return;

    try {
      const user = await getCurrentUser();
      if (!alive.current || mine !== generation.current) return;
      const next = sessionFromApi(user as ApiUser);
      saveSession(next);
      setSession(next);
      setStatus("authenticated");
    } catch {
      if (!alive.current || mine !== generation.current) return;
      // Deliberately NOT a sign-out. A 401 is handled by the api interceptor,
      // which refreshes the token or clears the session itself; every other
      // failure here is the network or the server being briefly unavailable,
      // and signing someone out for that is worse than carrying on with the
      // stored session the API is still willing to accept.
      const stored = loadSession();
      setSession(stored);
      setStatus(stored ? "authenticated" : "anonymous");
    }
  }, []);

  // `refresh` sets state only AFTER awaiting the profile request — the
  // "subscribe to an external system and setState in the callback" case the
  // rule's own documentation allows. It cannot see past the `await`, so it
  // flags the call rather than the pattern. `refresh` returns early and
  // touches no state when there is no stored session, precisely so this stays
  // true; see the comment there.
  //
  // The directive must sit on the line IMMEDIATELY before the code. Written
  // with its explanation trailing over several `//` lines it silently targets
  // the next comment instead, and reports itself as an unused directive while
  // the original error stands.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // A sign-out in another tab must not leave this one showing a signed-in UI.
  // `storage` fires only in OTHER tabs, which is exactly the case that needs
  // handling — this tab already knows about its own changes. A null `key`
  // means storage was cleared wholesale, so that counts too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== "access") return;
      const stored = loadSession();
      setSession(stored);
      setStatus(stored ? "authenticated" : "anonymous");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback((user: ApiUser) => {
    generation.current += 1;
    const next = sessionFromApi(user);
    saveSession(next);
    setSession(next);
    setStatus("authenticated");
    return next;
  }, []);

  const signOut = useCallback(() => {
    generation.current += 1;
    clearSession();
    setSession(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      status,
      ready: status !== "loading",
      isAdmin: isAdminWith(session),
      can: (key: string) => canWith(session, key),
      hasRole: (...names: string[]) => hasRoleWith(session, ...names),
      refresh,
      signIn,
      signOut,
    }),
    [session, status, refresh, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
