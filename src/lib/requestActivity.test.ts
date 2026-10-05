import type { AxiosAdapter, AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The in-flight counter, and the interceptor pair that feeds it.
 *
 * The store on its own is four lines and hard to get wrong. What is worth
 * pinning is the PAIRING: every request must release exactly one count, on
 * every path out — success, failure, and the refresh-and-retry, which runs the
 * request interceptor a second time for what the user sees as one call. An
 * unbalanced count leaves the app-wide bar stuck on screen (or never shows
 * it), which is a defect visible on every page at once.
 *
 * Requests are intercepted at the adapter, so nothing leaves the machine, but
 * everything above it is the real code path.
 */
const BASE = "http://api.test/api";

function token(secondsFromNow = 3600) {
  const payload = { exp: Math.floor(Date.now() / 1000) + secondsFromNow };
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

/**
 * A fresh `api` and the `requestActivity` module from the SAME module graph.
 *
 * `vi.resetModules()` gives api.ts a new copy of the store, so the test has to
 * read the counter through that same copy — a top-level import would observe a
 * different instance and never move.
 */
async function loadApi(statuses: number[] = [200]) {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", BASE);
  vi.stubEnv("VITE_API_VERSION", "");

  const queue = [...statuses];
  /** What the counter read while the server "had" each request. */
  const duringFlight: number[] = [];

  const activity = await import("./requestActivity");

  const adapter: AxiosAdapter = async (config) => {
    duringFlight.push(activity.getInFlightCount());
    const status = queue.length > 1 ? (queue.shift() as number) : queue[0];
    const response: AxiosResponse = {
      data: { ok: true },
      status,
      statusText: String(status),
      headers: {},
      config,
    };
    if (status >= 400) {
      return Promise.reject(
        Object.assign(new Error(String(status)), { response, config }),
      );
    }
    return response;
  };

  const mod = await import("../services/api");
  mod.default.defaults.adapter = adapter;
  return { api: mod.default, activity, duringFlight };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the counter", () => {
  it("counts up and down, and notifies on every change", async () => {
    const { activity } = await loadApi();
    const seen: number[] = [];
    const unsubscribe = activity.subscribeToRequestActivity((n) => seen.push(n));

    activity.requestStarted();
    activity.requestStarted();
    activity.requestSettled();
    activity.requestSettled();

    expect(seen).toEqual([1, 2, 1, 0]);
    expect(activity.getInFlightCount()).toBe(0);
    unsubscribe();
  });

  it("never goes negative", async () => {
    // A stuck bar would show on every page, so the guard is worth a test
    // rather than a promise that the interceptors stay balanced forever.
    const { activity } = await loadApi();
    activity.requestSettled();
    activity.requestSettled();
    expect(activity.getInFlightCount()).toBe(0);
  });

  it("stops notifying an unsubscribed listener", async () => {
    const { activity } = await loadApi();
    const seen: number[] = [];
    const unsubscribe = activity.subscribeToRequestActivity((n) => seen.push(n));
    unsubscribe();
    activity.requestStarted();
    expect(seen).toEqual([]);
  });
});

describe("the interceptors release exactly one count per request", () => {
  it("counts a request while it is in flight, and releases it on success", async () => {
    const { api, activity, duringFlight } = await loadApi([200]);

    await api.get("/thing/");

    expect(duringFlight, "the request should be counted while in flight").toEqual([1]);
    expect(activity.getInFlightCount()).toBe(0);
  });

  it("releases the count when the request fails", async () => {
    const { api, activity } = await loadApi([500]);

    await expect(api.get("/thing/")).rejects.toBeTruthy();

    expect(activity.getInFlightCount()).toBe(0);
  });

  it("releases both attempts of a 401 refresh-and-retry", async () => {
    // The path that can leak: the failed attempt and its retry are two trips
    // through the request interceptor for one call the user made.
    localStorage.setItem("access", token());
    localStorage.setItem("refresh", token());
    const { api, activity, duringFlight } = await loadApi([401, 200]);

    const axios = (await import("axios")).default;
    vi.spyOn(axios, "post").mockResolvedValue({ data: { access: token() } });

    await api.get("/thing/");

    expect(duringFlight, "two attempts, one counted at a time").toEqual([1, 1]);
    expect(activity.getInFlightCount()).toBe(0);
  });

  it("holds the count up until the LAST of several parallel requests lands", async () => {
    // A boolean set by the first response would hide the cover while the other
    // three were still running, which is why this is a count.
    const { api, activity, duringFlight } = await loadApi([200]);

    await Promise.all([
      api.get("/a/"),
      api.get("/b/"),
      api.get("/c/"),
    ]);

    expect(Math.max(...duringFlight)).toBe(3);
    expect(activity.getInFlightCount()).toBe(0);
  });
});
