/**
 * Authentication and authorization for the web client.
 *
 * Import from here, not from the individual files — that keeps the surface
 * small enough to reason about and makes a change of storage or of the
 * permission rule a change in one place.
 *
 * `permissions.ts` explains what this is and, more importantly, what it is
 * NOT: none of it is a security boundary. The server enforces every one of
 * these rules again, because anything the browser decides can be edited by
 * whoever owns the browser.
 */
export { AuthProvider } from "./AuthProvider";
export { useAuth, useCan } from "./useAuth";
export { ACTIONS, actionAccess, canDo, useAction } from "./actions";
export type { ActionAccess, ActionName } from "./actions";
export type { AuthStatus, AuthValue } from "./context";
export {
  ADMIN_ROLE,
  can,
  canAll,
  canAny,
  hasRole,
  isAdmin,
  normalizeRole,
  roleNames,
} from "./permissions";
export type { Session } from "./permissions";
export {
  SESSION_STORAGE_KEYS,
  clearSession,
  getAccessToken,
  loadSession,
  saveSession,
  saveTokens,
  sessionFromApi,
} from "./session";
export type { ApiUser } from "./session";
