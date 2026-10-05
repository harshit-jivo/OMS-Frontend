/**
 * Jivo Auth — the central sign-in service (auth.jivo.in) OMS now signs in with.
 *
 * OMS no longer has a login, refresh or logout of its own: Jivo Auth issues the
 * token pair, OMS accepts its access token as the Bearer on every call, and
 * `/auth/profile/` is how OMS says who that token belongs to here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEPARATE, BARE CLIENT
 * ─────────────────────────────────────────────────────────────────────────
 * The shared `api` instance stamps every request with OMS's device and
 * correlation headers (X-App-Version, X-Device-Id, X-Request-ID, …). Jivo
 * Auth's CORS allows only accept, authorization, content-type, user-agent,
 * x-csrftoken and x-requested-with, so a single one of those headers fails
 * the preflight and the browser never sends the request at all — which reads
 * as "the sign-in service is down" when it is not.
 *
 * So this client has no interceptors and sends `Content-Type` and nothing
 * else. Do not route these calls through `api`, and do not add headers here
 * without checking them against that CORS list first.
 *
 * NOTHING HERE MAY LOG. A request error carries its request body, and for a
 * sign-in that body is the password. Failures leave this module as a
 * `JivoAuthError`, which holds the status and Jivo Auth's code and nothing
 * from the request.
 */
import axios from "axios";

/** Where Jivo Auth lives. Not a secret; differs only between environments. */
export const AUTH_BASE_URL = String(
  import.meta.env.VITE_AUTH_BASE_URL || "https://auth.jivo.in/api/v1",
)
  .trim()
  .replace(/\/+$/, "");

/**
 * The bare client. Exported so the test setup can give it an adapter — it is
 * a different instance from `api`, so `api.defaults.adapter` does not cover it.
 */
export const jivoAuthClient = axios.create({
  baseURL: AUTH_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export interface TokenPair {
  access: string;
  refresh: string;
}

/**
 * A failed Jivo Auth call, reduced to what a caller can act on.
 *
 * Deliberately NOT the axios error: that object holds the request config, and
 * the request body of a sign-in is the password. Anything that logs one of
 * these logs a status and a code.
 */
export class JivoAuthError extends Error {
  /** HTTP status, or 0 when no response arrived (offline, DNS, CORS, timeout). */
  readonly status: number;
  /** Jivo Auth's machine-readable `code` (e.g. `email_not_verified`), or "". */
  readonly code: string;
  /** Seconds to wait before trying again, on a 429 that said so. */
  readonly retryAfter: number | null;

  constructor(status: number, code = "", retryAfter: number | null = null) {
    super(`Jivo Auth request failed (${status || "no response"}${code ? `, ${code}` : ""})`);
    this.name = "JivoAuthError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/**
 * Seconds from a `Retry-After` header — delta-seconds or an HTTP date.
 *
 * Falls back to the number in DRF's throttle sentence ("Expected available in
 * 30 seconds."), because `Retry-After` is not a CORS-safelisted response
 * header: unless Jivo Auth lists it in `Access-Control-Expose-Headers`, the
 * browser hides it from a cross-origin caller and the body is all there is.
 */
function retryAfterOf(headers: unknown, data: unknown): number | null {
  let raw: unknown;
  try {
    const h = headers as { get?: (name: string) => unknown } & Record<string, unknown>;
    raw = typeof h?.get === "function" ? h.get("retry-after") : h?.["retry-after"];
  } catch {
    raw = undefined;
  }
  const text = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
  if (/^\d+$/.test(text)) return Number(text);
  if (text) {
    const at = Date.parse(text);
    if (!Number.isNaN(at)) return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }

  const detail = (data as { detail?: unknown } | null | undefined)?.detail;
  const match = typeof detail === "string" ? /(\d+)\s*seconds?/i.exec(detail) : null;
  return match ? Number(match[1]) : null;
}

/**
 * Any thrown request, as a `JivoAuthError`. Read by shape rather than by
 * `isAxiosError`, as the refresh path always has been: what matters is
 * whether a response with a status came back, not which class carried it.
 */
function toJivoError(error: unknown): JivoAuthError {
  if (error instanceof JivoAuthError) return error;
  const response = (
    error as { response?: { status?: unknown; data?: unknown; headers?: unknown } } | null
  )?.response;
  if (!response || typeof response.status !== "number") return new JivoAuthError(0);
  const { status, data, headers } = response as { status: number; data: unknown; headers: unknown };
  const code = (data as { code?: unknown } | null | undefined)?.code;
  return new JivoAuthError(
    status,
    typeof code === "string" ? code : "",
    status === 429 ? retryAfterOf(headers, data) : null,
  );
}

/** `{access, refresh}` from a response body, or null when it is not that. */
function pairOf(data: unknown): TokenPair | null {
  const body = data as { access?: unknown; refresh?: unknown } | null | undefined;
  if (typeof body?.access !== "string" || !body.access) return null;
  if (typeof body.refresh !== "string" || !body.refresh) return null;
  return { access: body.access, refresh: body.refresh };
}

/**
 * Exchange an email and password for a token pair.
 *
 * `deviceName` is what Jivo Auth lists the session as — "OMS web" for a real
 * sign-in, something else for a one-off check like the payment confirmation,
 * so a person looking at their sessions can tell the two apart.
 */
export async function jivoLogin(
  email: string,
  password: string,
  deviceName: string,
): Promise<TokenPair> {
  let data: unknown;
  let status = 0;
  try {
    const res = await jivoAuthClient.post("/auth/login/", {
      email,
      password,
      device_name: deviceName,
    });
    data = res.data;
    status = res.status;
  } catch (error) {
    throw toJivoError(error);
  }
  const pair = pairOf(data);
  if (!pair) throw new JivoAuthError(status, "malformed_response");
  return pair;
}

/**
 * A NEW token pair for a refresh token. Jivo Auth rotates on every refresh,
 * so both halves must be stored; the old refresh token stays usable for about
 * 30 seconds, which is what lets requests already in flight finish.
 *
 * Resolves null when Jivo Auth answered 2xx without a pair, which the caller
 * treats the same as a rejected token.
 */
export async function jivoRefresh(refresh: string): Promise<TokenPair | null> {
  try {
    const res = await jivoAuthClient.post("/auth/refresh/", { refresh });
    return pairOf(res.data);
  } catch (error) {
    throw toJivoError(error);
  }
}

/**
 * End a Jivo Auth session. No Authorization header — the refresh token in the
 * body is the credential. Best-effort by design: it never throws, so a slow
 * or offline network can delay sign-out by `timeout` at most and never block it.
 */
export async function jivoLogout(refresh: string, timeout = 3000): Promise<void> {
  try {
    await jivoAuthClient.post("/auth/logout/", { refresh }, { timeout });
  } catch {
    /* best-effort */
  }
}

/* ------------------------------------------------------------------ *
 * What to tell a person
 * ------------------------------------------------------------------ */

const UNREACHABLE = "Can't reach the sign-in service. Try again.";
const UNEXPECTED = "The sign-in service had a problem. Try again.";

function tooManyAttempts(retryAfter: number | null): string {
  if (retryAfter === null) return "Too many attempts. Try again in a little while.";
  return `Too many attempts. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`;
}

/** The sign-in screen's sentence for a failed `jivoLogin`. */
export function signInErrorMessage(error: unknown): string {
  if (!(error instanceof JivoAuthError)) return UNEXPECTED;
  if (error.status === 0) return UNREACHABLE;
  if (error.status === 401) {
    return error.code === "email_not_verified"
      ? "Your email address isn't verified yet. Ask your administrator."
      : "Wrong email or password.";
  }
  if (error.status === 429) return tooManyAttempts(error.retryAfter);
  return UNEXPECTED;
}

/**
 * The same, for re-entering a password to confirm a sensitive action. The
 * person is already signed in, so "wrong email" would point at the wrong
 * thing — the email is theirs and was not typed.
 */
export function passwordCheckErrorMessage(error: unknown): string {
  if (!(error instanceof JivoAuthError)) return UNEXPECTED;
  if (error.status === 0) return UNREACHABLE;
  if (error.status === 401) return "That password is not right.";
  if (error.status === 429) return tooManyAttempts(error.retryAfter);
  return UNEXPECTED;
}
