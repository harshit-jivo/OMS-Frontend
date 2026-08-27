/**
 * Where the API lives, and how an app-relative path becomes a real URL.
 *
 * One module owns this because there were three answers to it and they were
 * coupled by string surgery on the same env var:
 *
 *   * `API_BASE_URL` — the env value, trailing slashes trimmed
 *   * `API_ORIGIN`   — the same value with a trailing `/api` chopped off,
 *                      used for media paths that are NOT under /api
 *   * `resolveApiUrl` — living in `pages/SalesInvoice/useSalesInvoice.ts`,
 *                      of all places, and testing `/\/api$/` to decide whether
 *                      to strip an `/api` prefix from the caller's path
 *
 * That last one is why this file exists. The backend now serves the whole API
 * at `/api/v1/` as well as `/api/` (see `OMS/urls.py`), and pointing the env
 * var at the versioned prefix breaks `/\/api$/` — it stops matching, the `/api`
 * in `apiFetch("/api/orders/")` stops being stripped, and every such call goes
 * to `/api/v1/api/orders/` and 404s. Silently, and only for the callers using
 * that one of the app's two URL conventions.
 *
 * So the version is modelled explicitly instead of being smuggled into a
 * string, and the origin is derived rather than assumed.
 *
 * The two conventions
 * -------------------
 * Both are in use and both keep working:
 *
 *   api.get("/orders/")           relative to the axios baseURL
 *   apiFetch("/api/orders/")      carries the prefix, which is stripped here
 *
 * Unifying them is a mechanical change across ~40 call sites with no behaviour
 * to verify it by, so it is deliberately not part of this phase.
 */

const RAW_BASE = String(import.meta.env.VITE_API_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");

if (!RAW_BASE) {
  throw new Error("VITE_API_BASE_URL is not configured. Add it to your .env file.");
}

/**
 * The API version segment, or "" for the unversioned prefix.
 *
 * DEFAULTS TO UNVERSIONED, deliberately. The `/api/v1/` mount exists only in
 * backend code that has not been deployed yet, and a web build that defaults to
 * v1 would 404 every request against any server that has not taken it. The
 * frontend cannot be the thing that decides when the backend shipped.
 *
 * To adopt it, set `VITE_API_VERSION=v1` in `.env.production` AFTER the backend
 * is live, and rebuild. Rolling back is the same edit in reverse — the routes
 * are the same views either way, so nothing else changes.
 */
export const API_VERSION = String(import.meta.env.VITE_API_VERSION || "")
  .trim()
  .replace(/^\/+|\/+$/g, "");

if (API_VERSION && !/^v\d+$/.test(API_VERSION)) {
  // Fail at startup rather than 404 every request. A typo here is otherwise
  // indistinguishable from the backend being down.
  throw new Error(
    `VITE_API_VERSION must look like "v1" (got "${API_VERSION}"). ` +
      "Leave it unset for the unversioned /api/ prefix.",
  );
}

/**
 * The server root, with no `/api` and no version on it.
 *
 * Derived by stripping a trailing `/api` OR `/api/v<n>`, so it stays correct
 * whichever of the two an environment file points at. Used for things the API
 * prefix does not cover — media files, the HAIS QR link.
 */
export const API_ORIGIN = RAW_BASE.replace(/\/api(\/v\d+)?$/i, "");

/**
 * The prefix every API path hangs off: `/api`, or `/api/v1` when versioned.
 *
 * Built from `API_ORIGIN` rather than from the env value, so an env file that
 * already names a version cannot produce `/api/v1/v1`.
 */
export const API_BASE_URL = `${API_ORIGIN}/api${API_VERSION ? `/${API_VERSION}` : ""}`;

/** The leading `/api` (with or without a version) that a caller may have written. */
const CALLER_PREFIX = /^\/api(\/v\d+)?(?=\/|$)/i;

/**
 * Turn an app URL into an absolute one.
 *
 * Accepts either convention and an already-absolute URL, which is returned
 * untouched. A caller-supplied `/api` or `/api/v1` prefix is REPLACED by the
 * configured one — not merely stripped — so a hardcoded version in a call site
 * cannot outvote the environment it is deployed into.
 */
export function resolveApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;

  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE_URL}${normalized.replace(CALLER_PREFIX, "")}`;
}

/**
 * The same, as a path relative to the axios instance's `baseURL`.
 *
 * Returns "/" rather than "" for a bare prefix: axios treats an empty url as
 * "use the baseURL as-is", which happens to work, but "/" is what every other
 * caller in the app produces and is worth not having to know.
 */
export function toBasePath(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return normalized.replace(CALLER_PREFIX, "") || "/";
}
