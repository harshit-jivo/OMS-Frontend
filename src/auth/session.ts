/**
 * Reading and writing the signed-in session.
 *
 * `localStorage` stays the store — the API interceptor reads the token from it
 * on every request, and changing that is not this phase's job. What changes is
 * that exactly one module reads and writes those keys, so the shape cannot
 * drift between the six places that used to do it by hand.
 *
 * The bug this fixes
 * ------------------
 * `extra_pages` was NEVER written at login. `Login.tsx` stored ten keys and
 * that was not one of them; it was written only by `Sidebar.fetchCurrentUser`,
 * which runs after the Sidebar mounts — i.e. AFTER routing has already decided
 * what to render.
 *
 * So `RequirePermission` read `[]` on a fresh login and redirected a non-admin
 * away from every page they held a grant for, until the fetch landed and they
 * navigated again. The guard was correct and its data was not there yet.
 *
 * That is almost certainly why it ended up on 1 route out of 59: a guard that
 * bounces legitimate users gets removed, not debugged.
 *
 * `saveSession` now writes the whole session in one go, and `AuthProvider`
 * refreshes it from `/auth/profile/` before rendering any guarded route.
 */
import type { Session } from "./permissions";
import { normalizeRole } from "./permissions";

const KEYS = {
  access: "access",
  refresh: "refresh",
  userId: "user_id",
  username: "username",
  name: "name",
  role: "role",
  roleDisplay: "role_display",
  roles: "extra_roles",
  grants: "extra_pages",
  isSuperuser: "is_superuser",
  isStaff: "is_staff",
  companyId: "company_id",
  companyName: "company_name",
  mainGroupId: "main_group_id",
  mainGroupName: "main_group_name",
  categories: "categories",
} as const;

/**
 * Every key a session owns. `api.ts` clears these on logout.
 *
 * `device_id` and `device_last_sync` are deliberately ABSENT and must stay
 * that way: one browser keeps one device id across logins, and clearing it
 * would mint a phantom device row on every logout.
 */
export const SESSION_STORAGE_KEYS: string[] = Object.values(KEYS);

function readString(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    // Private mode, or storage disabled entirely. Treated as "no session",
    // which sends the user to the login screen rather than crashing the app.
    return "";
  }
}

function readList(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    // Corrupt storage means no proof of a grant, so deny. Failing open here
    // would turn a JSON parse bug into an access-control hole.
    return [];
  }
}

function readBool(key: string): boolean {
  return readString(key) === "true";
}

export function getAccessToken(): string {
  return readString(KEYS.access);
}

/**
 * The session as stored, or null when nobody is signed in.
 *
 * "Signed in" means a token AND a user id. A token alone is not enough: a
 * half-written session — the tab closed mid-login, or a partial clear — would
 * otherwise present as a signed-in user with no identity, and every permission
 * check would then quietly answer "no" for a reason nobody could see.
 */
export function loadSession(): Session | null {
  const token = getAccessToken();
  const userId = readString(KEYS.userId);
  if (!token || !userId) return null;

  return {
    userId,
    username: readString(KEYS.username),
    name: readString(KEYS.name),
    role: normalizeRole(readString(KEYS.role)),
    roleDisplay: readString(KEYS.roleDisplay),
    roles: readList(KEYS.roles),
    grants: readList(KEYS.grants),
    isSuperuser: readBool(KEYS.isSuperuser),
    isStaff: readBool(KEYS.isStaff),
    companyId: readString(KEYS.companyId),
    companyName: readString(KEYS.companyName),
    mainGroupId: readString(KEYS.mainGroupId),
    mainGroupName: readString(KEYS.mainGroupName),
    categories: readList(KEYS.categories),
  };
}

/** One role, whatever shape the API sent it in. Unrecognised shapes drop. */
function roleNameOf(value: unknown): string {
  if (typeof value === "string") return normalizeRole(value);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const name = obj.name ?? obj.role_name ?? obj.display_name;
    if (typeof name === "string") return normalizeRole(name);
  }
  return "";
}

/** The API's user payload, in the several shapes it has actually used. */
export interface ApiUser {
  id?: number | string;
  username?: string;
  name?: string;
  full_name?: string;
  role?: unknown;
  role_name?: unknown;
  role_display?: string;
  roles?: unknown[];
  extra_roles?: unknown[];
  extra_pages?: unknown[];
  /** Server-computed effective permission keys (Phase 4): union of role
   *  bundles and extra_pages, admin already expanded. Preferred over
   *  extra_pages when present. */
  permissions?: unknown[];
  is_superuser?: boolean;
  is_staff?: boolean;
  company?: { id?: number | string; name?: string } | null;
  main_group?: { id?: number | string; name?: string } | null;
  /** `{id, category}` — the primary category, or null. */
  category?: { id?: number | string; category?: string } | null;
  /** The full m2m. The server falls back to `[category]` when it is empty. */
  categories?: Array<{ id?: number | string; category?: string } | string> | null;
}

/**
 * Category names from either shape the API uses, uppercased and deduped.
 *
 * `categories` is the m2m and is preferred; `category` is the single FK and
 * the fallback for payloads that predate it. The server already falls back
 * one way (see `UserSerializer.get_categories`), so this is belt and braces
 * for an older cached payload.
 */
function categoryNames(user: ApiUser): string[] {
  const fromList = (user.categories ?? []).map((entry) =>
    typeof entry === "string" ? entry : (entry?.category ?? ""),
  );
  const primary = user.category?.category ?? "";
  const all = [...fromList, primary]
    .map((name) => String(name).trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(all));
}

/**
 * Normalise an API user payload into a `Session`.
 *
 * Both `/auth/login/` and `/auth/profile/` come through here, so the two can
 * never populate the session differently — which is exactly how `extra_pages`
 * came to exist on one path and not the other.
 */
export function sessionFromApi(user: ApiUser): Omit<Session, "userId"> & {
  userId: string;
} {
  const primary = roleNameOf(user.role) || roleNameOf(user.role_name);

  // `roles` (server-computed, already the union) is preferred; `extra_roles`
  // is the fallback for payloads that predate it. Either way the primary role
  // is included, so a caller reading `roles` alone still sees everything.
  const extras = (user.roles ?? user.extra_roles ?? [])
    .map(roleNameOf)
    .filter(Boolean);

  return {
    userId: String(user.id ?? ""),
    username: user.username ?? "",
    name: user.full_name || user.name || user.username || "",
    role: primary,
    roleDisplay: user.role_display || primary,
    roles: Array.from(new Set([primary, ...extras].filter(Boolean))),
    // `permissions` (server-computed: role bundles ∪ extra_pages, admin
    // pre-expanded) is preferred; `extra_pages` is the fallback for payloads
    // that predate it. Same shape either way, so `can()` needs no change —
    // roles just start counting once the server sends the richer field.
    grants: (user.permissions ?? user.extra_pages ?? []).map(String),
    isSuperuser: Boolean(user.is_superuser),
    isStaff: Boolean(user.is_staff),
    companyId: String(user.company?.id ?? ""),
    companyName: user.company?.name ?? "",
    mainGroupId: String(user.main_group?.id ?? ""),
    mainGroupName: user.main_group?.name ?? "",
    categories: categoryNames(user),
  };
}

/** Persist a session. Writes every key, so none can be left stale. */
export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEYS.userId, session.userId);
    localStorage.setItem(KEYS.username, session.username);
    localStorage.setItem(KEYS.name, session.name);
    localStorage.setItem(KEYS.role, session.role);
    localStorage.setItem(KEYS.roleDisplay, session.roleDisplay);
    localStorage.setItem(KEYS.roles, JSON.stringify(session.roles));
    localStorage.setItem(KEYS.grants, JSON.stringify(session.grants));
    localStorage.setItem(KEYS.isSuperuser, String(session.isSuperuser));
    localStorage.setItem(KEYS.isStaff, String(session.isStaff));
    localStorage.setItem(KEYS.companyId, session.companyId);
    localStorage.setItem(KEYS.companyName, session.companyName);
    localStorage.setItem(KEYS.mainGroupId, session.mainGroupId);
    localStorage.setItem(KEYS.mainGroupName, session.mainGroupName);
    localStorage.setItem(KEYS.categories, JSON.stringify(session.categories));
  } catch {
    // Storage full or unavailable. The in-memory session still works for this
    // tab; only persistence across a reload is lost, which is a far better
    // outcome than failing the login that just succeeded.
  }
}

export function saveTokens(access: string, refresh: string): void {
  try {
    localStorage.setItem(KEYS.access, access);
    localStorage.setItem(KEYS.refresh, refresh);
  } catch {
    /* see saveSession */
  }
}

/** Clear everything this module owns. Device identity is left alone. */
export function clearSession(): void {
  try {
    SESSION_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* nothing to clear if storage is unavailable */
  }
}
