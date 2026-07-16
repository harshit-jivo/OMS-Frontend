import axios from "axios";
import type { AxiosRequestConfig } from "axios";

export const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is not configured. Add it to your .env file.");
}

// Used for backend-served media paths (for example, sale-invoice SKU images).
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/i, "");

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Auth endpoints must never be auto-retried / refreshed (Task 10).
const AUTH_PATHS = ["/auth/login/", "/auth/refresh/", "/auth/logout/"];
const isAuthPath = (url?: string) =>
  !!url && AUTH_PATHS.some((p) => url.includes(p));

// localStorage keys cleared on session end (mirror of what Login sets).
//
// NOTE: `device_id` (and `device_last_sync`) are deliberately ABSENT from this
// list and must stay that way. One browser must keep ONE device id across
// logins — clearing it would mint a brand-new "device" on every logout/login
// and fill the backend with phantom rows. See webDeviceService.
const AUTH_STORAGE_KEYS = [
  "access",
  "refresh",
  "user_id",
  "username",
  "name",
  "role",
  "role_display",
  "company_id",
  "company_name",
  "main_group_id",
  "main_group_name",
  "extra_pages",
];

/* ------------------------------------------------------------------ *
 * Device/version metadata hooks (inversion of control).
 *
 * webDeviceService registers a synchronous header provider here, so version
 * and device headers ride on EVERY request from the single interceptor below.
 * This file never imports webDeviceService — that would be a cycle (the service
 * imports this module to POST) and would drag device concerns into the API
 * layer. Same shape is used for the post-refresh hook.
 * ------------------------------------------------------------------ */
let deviceHeaderProvider: (() => Record<string, string>) | null = null;
export const setDeviceHeaderProvider = (
  fn: (() => Record<string, string>) | null,
) => {
  deviceHeaderProvider = fn;
};

// Fired after a SUCCESSFUL token refresh, letting device registration retry on
// the next authenticated event without this layer knowing what it is.
let authenticatedHandler: (() => void) | null = null;
export const setAuthenticatedHandler = (fn: (() => void) | null) => {
  authenticatedHandler = fn;
};

/* ------------------------------------------------------------------ *
 * Request interceptor — attach the CURRENT access token to every
 * authenticated request. Reading localStorage on every request means a
 * token refreshed in this (or another) tab is picked up automatically.
 * ------------------------------------------------------------------ */
api.interceptors.request.use((config) => {
  // Attach device/version metadata to every request from this one place.
  // Applied BEFORE the token so a provider can never clobber Authorization,
  // and guarded so metadata can never break a real request.
  if (deviceHeaderProvider) {
    try {
      const metadata = deviceHeaderProvider();
      Object.entries(metadata).forEach(([key, value]) => {
        config.headers.set(key, value);
      });
    } catch {
      /* metadata headers are best-effort only */
    }
  }

  const token = localStorage.getItem("access");
  if (token && config.url !== "/auth/login/") {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* ------------------------------------------------------------------ *
 * Refresh plumbing
 * ------------------------------------------------------------------ */

// Outcome of a refresh attempt. `invalid` = the refresh token was rejected
// (401/400) → real session end. `network` = timeout/offline/DNS/5xx → the
// session MUST be kept (Task 4).
type RefreshResult =
  | { ok: true; access: string }
  | { ok: false; reason: "invalid" | "network" };

// Per-tab single-flight guard (used when the Web Locks API is unavailable).
let refreshPromise: Promise<RefreshResult> | null = null;

const bearerOf = (header: unknown): string | null => {
  if (typeof header !== "string") return null;
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

/** True when the access token exists and is not expired (5s skew buffer). */
export const isAccessTokenValid = (token: string | null): boolean => {
  if (!token) return false;
  try {
    const part = token.split(".")[1];
    if (!part) return false;
    const payload = JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 > Date.now() + 5000;
  } catch {
    return false;
  }
};

// Call POST /auth/refresh/ with a BARE axios call so this request never
// re-enters the interceptors below (no recursion). Never logs tokens.
const doRefresh = async (): Promise<RefreshResult> => {
  const refresh = localStorage.getItem("refresh");
  if (!refresh) return { ok: false, reason: "invalid" };
  try {
    const res = await axios.post(
      `${API_BASE_URL}/auth/refresh/`,
      { refresh },
      { headers: { "Content-Type": "application/json" } },
    );
    const newAccess: string | undefined = res.data?.access;
    const newRefresh: string | undefined = res.data?.refresh;
    if (!newAccess) return { ok: false, reason: "invalid" };
    localStorage.setItem("access", newAccess);
    if (newRefresh) localStorage.setItem("refresh", newRefresh); // rotation
    // Successful (re)authentication — let device registration retry if an
    // earlier attempt hadn't succeeded. Fire-and-forget; never affects refresh.
    try {
      authenticatedHandler?.();
    } catch {
      /* the device hook must never impact the auth path */
    }
    return { ok: true, access: newAccess };
  } catch (error: any) {
    const status = error?.response?.status;
    // ONLY a genuine auth rejection ends the session. Anything without a 401/400
    // response (timeout, offline, DNS, 5xx) is transient → keep the tokens.
    if (status === 401 || status === 400) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "network" };
  }
};

/**
 * Obtain a fresh access token, ensuring only ONE refresh runs across all tabs
 * (single-flight + cross-tab). `failedToken` is the access token the failing
 * request used — if localStorage already holds a newer one (e.g. another tab
 * just refreshed), we reuse it instead of calling /refresh again, which is
 * critical because rotation would otherwise blacklist a token mid-flight.
 */
const refreshAccessToken = async (
  failedToken: string | null,
): Promise<RefreshResult> => {
  const current = localStorage.getItem("access");
  if (current && current !== failedToken) return { ok: true, access: current };

  // Cross-tab mutex via the Web Locks API when supported.
  const locks = (navigator as any).locks;
  if (locks && typeof locks.request === "function") {
    return locks.request("oms-token-refresh", async () => {
      const latest = localStorage.getItem("access");
      if (latest && latest !== failedToken) {
        return { ok: true, access: latest } as RefreshResult;
      }
      return doRefresh();
    });
  }

  // Fallback: per-tab single-flight.
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

/**
 * Startup gate (Task 3). Resolves whether the app currently has a usable
 * session, refreshing silently if the access token is expired:
 *   • access valid                 → "authenticated"
 *   • expired but refresh works    → "authenticated" (rotated tokens stored)
 *   • expired + network failure    → "authenticated" (tokens kept, retry later)
 *   • refresh rejected (401/400)   → "unauthenticated"
 *   • no tokens at all             → "unauthenticated"
 * It NEVER clears tokens on a network failure.
 */
export const resolveStartupSession = async (): Promise<
  "authenticated" | "unauthenticated"
> => {
  const access = localStorage.getItem("access");
  const refresh = localStorage.getItem("refresh");
  if (isAccessTokenValid(access)) return "authenticated";
  if (!refresh) return "unauthenticated";

  const result = await refreshAccessToken(access);
  if (result.ok) return "authenticated";
  if (result.reason === "network") return "authenticated"; // keep session
  return "unauthenticated"; // invalid refresh
};

let sessionEnding = false;

/** Clear auth + bounce to login exactly once (Task 5). Other tabs follow via
 * the `storage` event listener below. */
const endSession = () => {
  if (sessionEnding) return;
  sessionEnding = true;
  try {
    AUTH_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
    sessionStorage.setItem(
      "session_expired",
      "Your session has expired. Please login again.",
    );
  } catch {
    /* ignore */
  }
  if (window.location.pathname !== "/") {
    window.location.href = "/";
  }
};

/* ------------------------------------------------------------------ *
 * Response interceptor — automatic refresh on 401 (Task 3)
 * ------------------------------------------------------------------ */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const response = error?.response;
    const config = error?.config as
      | (AxiosRequestConfig & { _retry?: boolean })
      | undefined;

    // Only handle 401s on normal authenticated APIs, once.
    if (
      !response ||
      response.status !== 401 ||
      !config ||
      config._retry ||
      isAuthPath(config.url)
    ) {
      return Promise.reject(error);
    }

    config._retry = true;
    const failedToken = bearerOf(config.headers?.Authorization);
    const result = await refreshAccessToken(failedToken);

    if (result.ok) {
      // Retry the ORIGINAL request; the request interceptor re-attaches the
      // now-current token. The caller never notices.
      return api(config);
    }

    // ONLY a rejected refresh token ends the session. A network failure keeps
    // the tokens and simply lets this request fail — the user stays logged in
    // and the next call (or a later retry) succeeds when connectivity returns.
    if (result.reason === "invalid") {
      endSession();
    }
    return Promise.reject(error);
  },
);

/* ------------------------------------------------------------------ *
 * Multi-tab synchronisation (Task 9) — no extra deps, uses storage events.
 *   • another tab refreshed → it wrote a new `access`; our request
 *     interceptor already reads the latest value, so nothing to do.
 *   • another tab logged out / expired → `access` was removed → follow it.
 * ------------------------------------------------------------------ */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "access" && event.newValue === null) {
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }
  });
}

export default api;
