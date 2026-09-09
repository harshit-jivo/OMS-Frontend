/**
 * Correlation IDs — one string that ties a screen the user is looking at to
 * the lines the server wrote about it.
 *
 * The backend (`core/middleware.py`) reads `X-Request-ID` from the request,
 * puts it on every log line for the life of that request, and echoes it back
 * on the response. It also generates one when the client does not send one —
 * so this file is not what makes correlation work. What it adds is that the
 * ID is known to the BROWSER, which means it can be shown to the user and
 * quoted in a bug report, instead of only being discoverable by grepping the
 * server log for the right timestamp.
 *
 * The server sanitises whatever arrives (`request_context.sanitize_request_id`,
 * `[A-Za-z0-9._-]{1,64}`) and replaces anything else, because a caller-supplied
 * value that reaches a log file is a log-forgery primitive. This generator
 * stays inside that alphabet on purpose: an ID the server has to discard is an
 * ID the browser and the log no longer agree on, which is the one thing this
 * whole mechanism exists to prevent.
 */

/** Matches the server's accepted alphabet exactly. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

const HEADER = "X-Request-ID";
export const REQUEST_ID_HEADER = HEADER;

/**
 * A fresh ID, `web-<32 hex chars>`.
 *
 * Prefixed so a line in the server log says at a glance that the web client
 * chose the ID rather than the server minting one — which distinguishes "the
 * browser made this call" from "something else did", and is free.
 *
 * `crypto.randomUUID` where available, falling back to `getRandomValues` and
 * then to `Math.random`. The fallbacks matter less than they look: this is a
 * correlation tag, not a token or a key, so a collision costs a confusing log
 * search and nothing else. It must never be used for anything that needs to be
 * unguessable.
 */
export function newRequestId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (c && typeof c.randomUUID === "function") {
    return `web-${c.randomUUID().replace(/-/g, "")}`;
  }

  if (c && typeof c.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    let hex = "";
    for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
    return `web-${hex}`;
  }

  // Last resort. Reached only on a browser with no Web Crypto at all, which in
  // practice means a non-secure origin on an old engine.
  let hex = "";
  while (hex.length < 32) hex += Math.floor(Math.random() * 16).toString(16);
  return `web-${hex.slice(0, 32)}`;
}

/**
 * Read the ID the server reported, from a response or an error.
 *
 * Returns "" when it is not there, and it often will not be: a browser hides
 * every response header from JavaScript unless the server lists it in
 * `Access-Control-Expose-Headers` (the backend lists `x-request-id`), and a
 * request that never reached the server — offline, DNS failure, a cancelled
 * preflight — has no response to read at all. Callers must treat "" as normal.
 *
 * Falls back to the ID that was SENT, which is the more useful value anyway:
 * it is the one the server logged against, and it exists even when the
 * response does not.
 */
export function requestIdOf(source: unknown): string {
  const anySource = source as
    | {
        headers?: unknown;
        config?: { headers?: unknown };
        response?: { headers?: unknown; config?: { headers?: unknown } };
      }
    | null
    | undefined;
  if (!anySource) return "";

  const fromResponse =
    readHeader(anySource.headers) || readHeader(anySource.response?.headers);
  if (fromResponse) return fromResponse;

  return (
    readHeader(anySource.config?.headers)
    || readHeader(anySource.response?.config?.headers)
    || ""
  );
}

/**
 * Pull the header out of any of the three shapes axios hands back: an
 * `AxiosHeaders` instance (has `.get`), a plain object from a mocked
 * response, or nothing.
 */
function readHeader(headers: unknown): string {
  if (!headers) return "";

  const withGet = headers as { get?: (name: string) => unknown };
  if (typeof withGet.get === "function") {
    const value = withGet.get(HEADER);
    if (typeof value === "string" && value) return value;
  }

  const plain = headers as Record<string, unknown>;
  // Header names are case-insensitive, and which case arrives depends on
  // whether this is a real response (lowercased by the browser) or an
  // outgoing config (whatever we set).
  for (const key of Object.keys(plain)) {
    if (key.toLowerCase() === HEADER.toLowerCase()) {
      const value = plain[key];
      if (typeof value === "string" && value) return value;
    }
  }
  return "";
}
