/**
 * Hooks for reading the session. See `AuthProvider.tsx` for what fills it.
 */
import { useContext } from "react";

import { AuthContext, type AuthValue } from "./context";

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    // A thrown error, not a permissive default. A component rendering outside
    // the provider would otherwise silently see "no permissions" and hide
    // itself — a blank screen with no explanation, in a bug that only appears
    // once someone moves a route.
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return value;
}

/** `const canApprove = useCan("Payments_Approve")` */
export function useCan(key: string): boolean {
  return useAuth().can(key);
}
