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
 * refresh single-flight, and the retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";

const BASE = "http://localhost:8000/api";

/** A minimal, non-expired JWT. Only `exp` is ever read. */
function token(secondsFromNow = 3600): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + secondsFromNow };
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

type Captured = InternalAxiosRequestConfig;

/**
 * Load a fresh `api` with an adapter that records every request and replies
 * with the queued statuses.
 */
async function loadApi(statuses: number[] = [200]) {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", BASE);
  vi.stubEnv("VITE_API_VERSION", "");

  const seen: Captured[] = [];
  const queue = [...statuses];

  const adapter: AxiosAdapter = async (config) => {
    seen.push(config as Captured);
    const status = queue.length > 1 ? (queue.shift() as number) : queue[0];
    const response: AxiosResponse = {
      data: { ok: true },
      status,
      statusText: String(status),
      headers: { "x-request-id": "server-echo" },
      config,
    };
    if (status >= 400) return Promise.reject(Object.assign(new Error(`${status}`), { response, config }));
    return response;
  };

  const mod = await import("./api");
  mod.default.defaults.adapter = adapter;
  return { api: mod.default, seen };
}

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
    const { api, seen } = await loadApi([401, 200]);
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");

    // The refresh itself is a bare axios call, so stub it at the network edge.
    const axios = (await import("axios")).default;
    vi.spyOn(axios, "post").mockResolvedValue({ data: { access: token() } });

    await api.get("/orders/");

    const attempts = seen.filter((c) => c.url === "/orders/");
    expect(attempts).toHaveLength(2);
    expect(headerOf(attempts[0], "X-Request-ID")).toBe(headerOf(attempts[1], "X-Request-ID"));
  });

  it("sends a correlation ID on the token refresh too", async () => {
    // The refresh bypasses the interceptors by design (no recursion), which
    // would otherwise make it the one uncorrelated call the app makes — and a
    // refresh failure is exactly the kind worth correlating.
    const { api } = await loadApi([401, 200]);
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", "refresh-token");

    const axios = (await import("axios")).default;
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { access: token() } });

    await api.get("/orders/");

    const headers = post.mock.calls[0]?.[2]?.headers as Record<string, string>;
    expect(headers["X-Request-ID"]).toMatch(/^web-[a-f0-9]{32}$/);
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
