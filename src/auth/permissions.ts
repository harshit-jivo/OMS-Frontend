/**
 * The one definition of "who is this user allowed to be" on the web client.
 *
 * This mirrors `OMS-Backend/core/permissions.py`, deliberately and closely. The
 * backend module exists because five places each answered "is this user an
 * admin" and none of them agreed; the same thing had happened here, in four:
 *
 *     components/Sidebar.tsx        role === "admin"        (extra_roles ignored)
 *     components/RequirePermission  role === "admin"        (extra_roles ignored)
 *     config/pageAccess.ts          normalizeRole(role)     (extra_roles ignored)
 *     pages/*.tsx                   ad-hoc localStorage reads
 *
 * All four read the primary role ALONE, while the backend states the rule:
 *
 *     "A user's roles are the primary FK plus any extra_roles. Every 'does this
 *      user hold role X' check must consult BOTH, or a user granted a function
 *      role through extra_roles would be invisible to half the codebase."
 *
 * They were invisible here. A user given `admin` through `extra_roles` saw an
 * almost-empty sidebar and was redirected off every page they could actually
 * use, because the server said yes and the browser said no.
 *
 * NOT A SECURITY BOUNDARY
 * -----------------------
 * Nothing in this file protects data. Every endpoint behind every page enforces
 * the same rules server-side, because anything the browser decides can be
 * edited by whoever owns the browser. This exists so a user sees an honest UI —
 * links they can use, pages that load — instead of a screen that renders and
 * then fills with 403s.
 *
 * The practical consequence: when this disagrees with the server, the server is
 * right. Fail closed here and let the server be the one to say no.
 */

/** Everything the client knows about the signed-in user. */
export interface Session {
  userId: string;
  username: string;
  name: string;
  /** The primary role name, lowercased. */
  role: string;
  roleDisplay: string;
  /** Primary + extra roles, lowercased. See `roleNames`. */
  roles: string[];
  /** Granted page and action keys (`User.extra_pages` on the server). */
  grants: string[];
  isSuperuser: boolean;
  isStaff: boolean;
  companyId: string;
  companyName: string;
  mainGroupId: string;
  mainGroupName: string;
  /**
   * The product categories this user is assigned, uppercased — OIL,
   * BEVERAGES, MART.
   *
   * Empty means "not assigned any", which is a real and different state from
   * "assigned all": the Sales Invoice branch gate shows the full choice only
   * when this is empty, and otherwise picks from it.
   */
  categories: string[];
}

export const ADMIN_ROLE = "admin";

/** Lowercase and trim, so callers can compare against literals safely. */
export function normalizeRole(role?: string | null): string {
  return String(role ?? "").trim().toLowerCase();
}

/**
 * Every role the user holds — primary plus extras — lowercased and deduped.
 *
 * Tolerates the several shapes the API has used for a role over time: a bare
 * string, `{name}`, `{role_name}`. A role that arrives in an unrecognised shape
 * is DROPPED rather than coerced to something like "[object Object]", which
 * would silently never match and be very hard to see.
 */
export function roleNames(session: Session | null | undefined): Set<string> {
  if (!session) return new Set();
  const names = [session.role, ...(session.roles ?? [])]
    .map(normalizeRole)
    .filter(Boolean);
  return new Set(names);
}

/** True when the user holds any of `names`, as a primary OR extra role. */
export function hasRole(
  session: Session | null | undefined,
  ...names: string[]
): boolean {
  const held = roleNames(session);
  return names.some((n) => held.has(normalizeRole(n)));
}

/**
 * The one definition of "administrator", matching `core.permissions.is_admin`.
 *
 * Three ways in, equivalent by design: the `admin` role held as primary or
 * extra, `is_superuser`, or `is_staff`. The last two were honoured by the
 * server and by nothing here, so a superuser with no explicit `admin` role saw
 * a stripped-down UI over an API that would have allowed them everything.
 */
export function isAdmin(session: Session | null | undefined): boolean {
  if (!session) return false;
  if (session.isSuperuser || session.isStaff) return true;
  return roleNames(session).has(ADMIN_ROLE);
}

/**
 * Can this user open this page / take this action?
 *
 * `key` is an `extra_pages` grant key — the same string the server stores and
 * checks. Admins pass implicitly, matching `granted_keys()` on the server.
 *
 * Fails closed on a missing session. During the moment between "app started"
 * and "profile loaded" there is no proof of a grant, and inventing one would
 * flash privileged UI to someone who may not have it. Callers that need to tell
 * "denied" from "not loaded yet" should read `status` from `useAuth()`.
 */
export function can(
  session: Session | null | undefined,
  key: string,
): boolean {
  if (!session) return false;
  if (isAdmin(session)) return true;
  return (session.grants ?? []).includes(key);
}

/** True when the user holds every one of `keys`. */
export function canAll(
  session: Session | null | undefined,
  keys: string[],
): boolean {
  return keys.every((k) => can(session, k));
}

/** True when the user holds at least one of `keys`. */
export function canAny(
  session: Session | null | undefined,
  keys: string[],
): boolean {
  return keys.some((k) => can(session, k));
}
