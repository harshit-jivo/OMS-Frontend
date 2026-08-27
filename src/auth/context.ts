/**
 * The context object and its value type.
 *
 * Separate from the provider component and from the hooks so that each file
 * exports one kind of thing. React Fast Refresh can only preserve state for a
 * module that exports components alone — a file mixing a provider with its
 * hooks silently loses state on every edit during development.
 */
import { createContext } from "react";

import type { Session } from "./permissions";
import type { ApiUser } from "./session";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthValue {
  session: Session | null;
  status: AuthStatus;
  /** True once the session is settled — guards should wait on this. */
  ready: boolean;
  isAdmin: boolean;
  can: (key: string) => boolean;
  hasRole: (...names: string[]) => boolean;
  /** Re-read the profile from the server (after a permission change). */
  refresh: () => Promise<void>;
  /** Adopt a session produced by the login call, without a round trip. */
  signIn: (user: ApiUser) => Session;
  signOut: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);
