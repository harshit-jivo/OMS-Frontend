/**
 * The shared axios instance, exercised through its real interceptors.
 *
 * The helpers have their own unit tests; this file checks the WIRING, which is
 * where the interesting failures live. A correlation-ID generator that is
 * never called, or called after the retry so the two attempts disagree, passes
 * every test in `requestId.test.ts`.
 *
 * Requests are intercepted at the adapter, so nothing leaves the machine — but
 * everything above the adapter is the real code path: both interceptors, the
 * refresh single-flight, and the retry. The refresh goes to Jivo Auth through
 * its own bare client, which gets its own adapter here (`jivoReplies`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";

const BASE = "http://localhost:8000/api";
const AUTH = "https://auth.example.test/api/v1";

/** A minimal, non-expired JWT. Only `exp` is ever read. */
function token(secondsFromNow = 3600): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + secondsFromNow };
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

type Captured = InternalAxiosRequestConfig;

/** A reply: a bare status, or a status with the body it carries. */
type Reply = number | { status: number; data: unknown };

/** An adapter that records every request and replies from a queue. */
function queuedAdapter(replies: Reply[], seen: Captured[], fallbackData: unknown): AxiosAdapter {
  const queue = [...replies];
  return async (config) => {
    seen.push(config as Captured);
    const next = queue.length > 1 ? (queue.shift() as Reply) : queue[0];
    const { status, data } = typeof next === "number" ? { status: next, data: fallbackData } : next;
    const response: AxiosResponse = {
      data,
      status,
      statusText: String(status),
      headers: { "x-request-id": "server-echo" },
      config,
    };
    if (status >= 400) {
      return Promise.reject(new AxiosError(`${status}`, "ERR_BAD_RESPONSE", config, null, response));
    }
    return response;
  };
}

/**
 * Load a fresh `api` with an adapter that records every request and replies
 * with the queued statuses. Jivo Auth's client is loaded with it — the same
 * module instance `api.ts` imported — and answers nothing until a test says.
 */
async function loadApi(replies: Reply[] = [200]) {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", BASE);
  vi.stubEnv("VITE_API_VERSION", "");
  vi.stubEnv("VITE_AUTH_BASE_URL", AUTH);

  const seen: Captured[] = [];
  const mod = await import("./api");
  mod.default.defaults.adapter = queuedAdapter(replies, seen, { ok: true });

  const jivo = await import("./jivoAuth");
  const jivoSeen: Captured[] = [];
  /** What Jivo Auth answers a refresh with. */
  const jivoReplies = (...answers: Reply[]) => {
    jivo.jivoAuthClient.defaults.adapter = queuedAdapter(answers, jivoSeen, {});
  };
  jivoReplies(500);

  return { api: mod.default, mod, seen, jivoSeen, jivoReplies };
}

/** A new pair, as Jivo Auth's refresh returns it. */
const rotated = () => ({ status: 200, data: { access: token(), refresh: "rotated-refresh" } });

function headerOf(config: Captured, name: string): string {
  const value = config.headers?.get?.(name);
  return typeof value === "string" ? value : "";
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  localStorage.clear();
});

describe("every request carries a correlation ID", () => {
  it("attaches one the server will accept", async () => {
    const { api, seen } = await loadApi();
    localStorage.setItem("access", token());

    await api.get("/orders/");

    const id = headerOf(seen[0], "X-Request-ID");
    // Same alphabet the server's sanitiser enforces; anything else is silently
    // replaced server-side and the ID the browser shows matches no log line.
    expect(id).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
    expect(id.startsWith("web-")).toBe(true);
  });

  it("gives different requests different IDs", async () => {
    const { api, seen } = await loadApi();
    localStorage.setItem("access", token());

    await api.get("/orders/");
    await api.get("/parties/");

    expect(headerOf(seen[0], "X-Request-ID")).not.toBe(headerOf(seen[1], "X-Request-ID"));
  });

  it("does not overwrite an ID a caller set deliberately", async () => {
    const { api, seen } = await loadApi();
    localStorage.setItem("access", token());

    await api.get("/orders/", { headers: { "X-Request-ID": "caller-chose" } });

    expect(headerOf(seen[0], "X-Request-ID")).toBe("caller-chose");
  });
});

describe("a 401 retry stays one event in the log", () => {
  it("reuses the failed attempt's ID on the retry", async () => {
    // The reason the interceptor sets the header only when absent. A retry
    // after a token refresh is ONE action from the user's point of view; two
    // IDs would split it across two unrelated-looking log entries, and the
    // half that failed is the half nobody would find.
    const { api, seen, jivoReplies } = await loadApi([401, 200]);
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");
    jivoReplies(rotated());

    await api.get("/orders/");

    const attempts = seen.filter((c) => c.url === "/orders/");
    expect(attempts).toHaveLength(2);
    expect(headerOf(attempts[0], "X-Request-ID")).toBe(headerOf(attempts[1], "X-Request-ID"));
  });
});

describe("the token refresh goes to Jivo Auth", () => {
  it("posts the refresh token to {AUTH}/auth/refresh/", async () => {
    const { api, jivoSeen, jivoReplies } = await loadApi([401, 200]);
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");
    jivoReplies(rotated());

    await api.get("/orders/");

    expect(jivoSeen).toHaveLength(1);
    expect(jivoSeen[0].baseURL).toBe(AUTH);
    expect(jivoSeen[0].url).toBe("/auth/refresh/");
    expect(jivoSeen[0].method).toBe("post");
    expect(JSON.parse(String(jivoSeen[0].data))).toEqual({ refresh: "refresh-token" });
  });

  it("sends Jivo Auth nothing its CORS would refuse", async () => {
    // Jivo Auth allows accept, authorization, content-type, user-agent,
    // x-csrftoken and x-requested-with. One X-App-Version or X-Request-ID
    // fails the preflight, the browser never sends the refresh, and every
    // expiry looks like a network error. That is why this call has no
    // correlation ID, unlike every other request the app makes.
    const { api, mod, jivoSeen, jivoReplies } = await loadApi([401, 200]);
    mod.setDeviceHeaderProvider(() => ({ "X-App-Version": "1.0.0", "X-Device-Id": "dev-1" }));
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");
    jivoReplies(rotated());

    await api.get("/orders/");

    const sent = Object.keys(jivoSeen[0].headers.toJSON()).map((name) => name.toLowerCase());
    expect(sent.filter((name) => !["accept", "content-type"].includes(name))).toEqual([]);
    expect(jivoSeen[0].headers.get("Content-Type")).toBe("application/json");
  });

  it("stores BOTH halves of the new pair", async () => {
    // Jivo Auth rotates on every refresh; the old refresh token dies ~30s
    // later. Keeping it would sign the user out on the next refresh.
    const { api, jivoReplies } = await loadApi([401, 200]);
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");
    const fresh = token(900);
    jivoReplies({ status: 200, data: { access: fresh, refresh: "rotated-refresh" } });

    await api.get("/orders/");

    expect(localStorage.getItem("access")).toBe(fresh);
    expect(localStorage.getItem("refresh")).toBe("rotated-refresh");
  });

  it("retries with the new access token", async () => {
    const { api, seen, jivoReplies } = await loadApi([401, 200]);
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");
    const fresh = token(900);
    jivoReplies({ status: 200, data: { access: fresh, refresh: "rotated-refresh" } });

    await api.get("/orders/");

    expect(headerOf(seen[1], "Authorization")).toBe(`Bearer ${fresh}`);
  });

  it("refreshes an expired token silently at startup", async () => {
    // 15-minute tokens: a tab reopened after a coffee break is the COMMON
    // case now, not the edge one.
    const { mod, jivoReplies } = await loadApi();
    localStorage.setItem("access", token(-60));
    localStorage.setItem("refresh", "refresh-token");
    jivoReplies(rotated());

    await expect(mod.resolveStartupSession()).resolves.toBe("authenticated");
    expect(localStorage.getItem("refresh")).toBe("rotated-refresh");
  });

  it("keeps the session when Jivo Auth is throttling or down", async () => {
    // A 429 or a 5xx says nothing about the refresh token. Ending the session
    // for one would sign everybody out whenever Jivo Auth has a bad minute.
    for (const status of [429, 503]) {
      const { api, jivoReplies } = await loadApi([401, 200]);
      localStorage.setItem("access", token());
      localStorage.setItem("refresh", "refresh-token");
      jivoReplies(status);

      await expect(api.get("/orders/")).rejects.toBeDefined();
      expect(localStorage.getItem("refresh"), String(status)).toBe("refresh-token");
    }
  });
});

describe("what never refreshes", () => {
  it("a 403 never triggers a refresh", async () => {
    // "You may not" is not "who are you?". A fresh token for the same person
    // gets the same answer, and refreshing on it would rotate the pair on
    // every permission check a page makes.
    const { api, seen, jivoSeen } = await loadApi([403]);
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");

    await expect(api.get("/orders/")).rejects.toMatchObject({ response: { status: 403 } });

    expect(jivoSeen).toHaveLength(0);
    expect(seen).toHaveLength(1);
    expect(localStorage.getItem("refresh")).toBe("refresh-token");
  });

  it("a disabled OMS account's 401 is not refreshed", async () => {
    // The Jivo token is fine; OMS has switched the account off. A refresh
    // would succeed and the retry would be refused again, forever.
    const { api, seen, jivoSeen } = await loadApi([
      { status: 401, data: { detail: "User account is disabled." } },
    ]);
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");

    await expect(api.get("/auth/profile/")).rejects.toMatchObject({ response: { status: 401 } });

    expect(jivoSeen).toHaveLength(0);
    expect(seen).toHaveLength(1);
  });

  it("a 401 from a Jivo Auth path is never refreshed", async () => {
    // Should one ever be sent through `api`: a 401 there is about the
    // credentials in the request, not about the session.
    const { api, seen, jivoSeen } = await loadApi([401]);
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");

    await expect(api.post(`${AUTH}/auth/login/`, {})).rejects.toBeDefined();

    expect(jivoSeen).toHaveLength(0);
    expect(seen).toHaveLength(1);
  });

  it("refreshes once, not in a loop", async () => {
    const { api, seen, jivoSeen, jivoReplies } = await loadApi([401]);
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");
    jivoReplies(rotated());

    await expect(api.get("/orders/")).rejects.toBeDefined();

    expect(jivoSeen).toHaveLength(1);
    expect(seen).toHaveLength(2);
  });
});

describe("a refused refresh ends the session", () => {
  it("clears every session key, and only those", async () => {
    // The unified list: this path used to clear a shorter copy that left
    // extra_roles, is_superuser, is_staff and categories behind.
    const { api, jivoReplies } = await loadApi([401]);
    const { SESSION_STORAGE_KEYS } = await import("../auth/session");
    for (const key of SESSION_STORAGE_KEYS) localStorage.setItem(key, "x");
    localStorage.setItem("access", token());
    localStorage.setItem("device_id", "this-browser");
    jivoReplies({ status: 401, data: { detail: "Token is invalid or expired", code: "token_not_valid" } });

    await expect(api.get("/orders/")).rejects.toBeDefined();

    for (const key of SESSION_STORAGE_KEYS) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
    // One browser keeps one device id across sessions.
    expect(localStorage.getItem("device_id")).toBe("this-browser");
    expect(sessionStorage.getItem("session_expired")).toBeTruthy();
  });
});

describe("deprecated endpoints announce themselves", () => {
  /** Reload `api` with an adapter that replies with RFC 8594 headers. */
  async function loadWithHeaders(headers: Record<string, string>) {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", BASE);
    vi.stubEnv("VITE_API_VERSION", "");
    const mod = await import("./api");
    mod.default.defaults.adapter = async (config) => ({
      data: {}, status: 200, statusText: "OK", headers, config,
    });
    return mod.default;
  }

  it("warns once, naming the sunset date and the successor", async () => {
    const api = await loadWithHeaders({
      deprecation: "true",
      sunset: "Wed, 31 Dec 2025 23:59:59 GMT",
      link: '<https://api.example.com/api/v1/notifications/>; rel="successor-version"',
    });
    localStorage.setItem("access", token());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await api.get("/orders/notifications/");
    await api.get("/orders/notifications/");

    // Once per path per page load. An endpoint the app POLLS would otherwise
    // repeat this line until the console is muted like any other noise, which
    // is exactly the outcome the warning exists to avoid.
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("/orders/notifications/");
    expect(message).toContain("31 Dec 2025");
    expect(message).toContain("/api/v1/notifications/");
  });

  it("says nothing about an endpoint that is not deprecated", async () => {
    const api = await loadWithHeaders({ "x-request-id": "server-echo" });
    localStorage.setItem("access", token());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await api.get("/orders/");

    expect(warn).not.toHaveBeenCalled();
  });

  it("never lets a malformed header break the response", async () => {
    // A warning is the least important thing on this code path.
    const api = await loadWithHeaders({ deprecation: "true", link: "not a link" });
    localStorage.setItem("access", token());
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(api.get("/orders/broken/")).resolves.toBeDefined();
  });
});

describe("the base URL still points where it did", () => {
  it("keeps the unversioned prefix by default", async () => {
    // The default must not move. `/api/v1/` exists only in backend code that
    // is not deployed, and a build defaulting to it 404s every request.
    const { api } = await loadApi();
    expect(api.defaults.baseURL).toBe(BASE);
  });
});
