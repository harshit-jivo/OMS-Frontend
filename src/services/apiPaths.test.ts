/**
 * API path resolution across every base-URL / version combination.
 *
 * The module reads `import.meta.env` at import time, so each case stubs the
 * environment and re-imports rather than calling a function with arguments.
 * That is deliberate: the thing being tested IS the import-time derivation —
 * the bug this module exists to prevent was a regex evaluated once, at module
 * load, against a base URL that had quietly changed shape.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type Paths = typeof import("./apiPaths");

/** Load a fresh copy of the module under a given environment. */
async function load(base: string, version?: string): Promise<Paths> {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", base);
  vi.stubEnv("VITE_API_VERSION", version ?? "");
  return import("./apiPaths");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("unversioned — what every deployed server serves today", () => {
  it("keeps the base URL and origin as they were", async () => {
    const m = await load("http://localhost:8000/api");
    expect(m.API_BASE_URL).toBe("http://localhost:8000/api");
    expect(m.API_ORIGIN).toBe("http://localhost:8000");
    expect(m.API_VERSION).toBe("");
  });

  it("resolves both of the app's URL conventions to the same place", async () => {
    const m = await load("http://localhost:8000/api");
    // `apiFetch("/api/orders/")` and `api.get("/orders/")` must agree.
    expect(m.resolveApiUrl("/api/orders/")).toBe("http://localhost:8000/api/orders/");
    expect(m.resolveApiUrl("/orders/")).toBe("http://localhost:8000/api/orders/");
  });

  it("trims trailing slashes off the configured base", async () => {
    const m = await load("http://localhost:8000/api///");
    expect(m.API_BASE_URL).toBe("http://localhost:8000/api");
  });
});

describe("versioned — the regression this module was written for", () => {
  it("does NOT double the prefix on a caller that wrote /api", async () => {
    // The whole point. The old resolver tested `/\/api$/` against the base and
    // stopped stripping the moment a version appeared, sending every
    // `apiFetch("/api/...")` call to `/api/v1/api/...` — a 404 that would have
    // hit only one of the app's two conventions, and only in production.
    const m = await load("http://localhost:8000/api", "v1");
    expect(m.API_BASE_URL).toBe("http://localhost:8000/api/v1");
    expect(m.resolveApiUrl("/api/orders/")).toBe("http://localhost:8000/api/v1/orders/");
    expect(m.resolveApiUrl("/orders/")).toBe("http://localhost:8000/api/v1/orders/");
  });

  it("derives the same result whether or not the env names the version", async () => {
    // An env file may reasonably be written either way, and both must work —
    // otherwise adopting v1 means editing two variables in agreement, which is
    // an invitation to /api/v1/v1.
    const viaVar = await load("http://localhost:8000/api", "v1");
    const viaUrl = await load("http://localhost:8000/api/v1", "v1");
    expect(viaUrl.API_BASE_URL).toBe(viaVar.API_BASE_URL);
    expect(viaUrl.API_ORIGIN).toBe("http://localhost:8000");
  });

  it("lets the environment overrule a version hardcoded in a call site", async () => {
    const m = await load("http://localhost:8000/api", "v1");
    expect(m.resolveApiUrl("/api/v1/orders/")).toBe("http://localhost:8000/api/v1/orders/");

    const unversioned = await load("http://localhost:8000/api");
    // Rolling back to the unversioned prefix must actually roll back, even if
    // a call site was edited to name v1 in the meantime.
    expect(unversioned.resolveApiUrl("/api/v1/orders/")).toBe("http://localhost:8000/api/orders/");
  });

  it("keeps API_ORIGIN free of the version, so media paths still resolve", async () => {
    // SKU images and the HAIS QR link hang off the origin, not off /api. The
    // old derivation stripped a trailing `/api` only, so a versioned base left
    // `/api/v1` glued to every image URL.
    const m = await load("https://oms.example.com/api", "v1");
    expect(m.API_ORIGIN).toBe("https://oms.example.com");
    expect(`${m.API_ORIGIN}/media/sku/x.png`).toBe("https://oms.example.com/media/sku/x.png");
  });
});

describe("edge cases", () => {
  it("returns an absolute URL untouched", async () => {
    const m = await load("http://localhost:8000/api", "v1");
    const external = "https://crystal.example.com/report?doc=1";
    expect(m.resolveApiUrl(external)).toBe(external);
    expect(m.toBasePath(external)).toBe(external);
  });

  it("accepts a path with no leading slash", async () => {
    const m = await load("http://localhost:8000/api");
    expect(m.resolveApiUrl("orders/")).toBe("http://localhost:8000/api/orders/");
  });

  it("does not strip a path that merely STARTS with the letters api", async () => {
    // `/api-keys/` is not the `/api` prefix. A `startsWith` check would eat it.
    const m = await load("http://localhost:8000/api");
    expect(m.resolveApiUrl("/api-keys/")).toBe("http://localhost:8000/api/api-keys/");
  });

  it("returns / rather than an empty path for a bare prefix", async () => {
    const m = await load("http://localhost:8000/api");
    expect(m.toBasePath("/api")).toBe("/");
  });

  it("refuses a malformed version rather than 404ing every request", async () => {
    // A typo here is otherwise indistinguishable from the server being down.
    await expect(load("http://localhost:8000/api", "version1")).rejects.toThrow(
      /VITE_API_VERSION/,
    );
  });

  it("refuses to start with no base URL configured", async () => {
    await expect(load("")).rejects.toThrow(/VITE_API_BASE_URL/);
  });
});

/**
 * The QR base.
 *
 * A HAIS sticker is PHYSICAL. Getting this wrong does not show up as a failing
 * request — it shows up months later as a laptop with a dead QR on it, which
 * is why it is pinned rather than left to the next reader's judgement.
 */
describe("APP_ORIGIN", () => {
  it("is not the API origin", async () => {
    // The bug this replaces: the QR was built from API_ORIGIN, so every
    // sticker pointed at the Django host, where /hais/device/:code is not a
    // route and the server answers its own 404.
    const { API_ORIGIN, APP_ORIGIN } = await import("./apiPaths");
    if (API_ORIGIN) {
      expect(APP_ORIGIN).not.toBe(API_ORIGIN);
    }
  });

  it("carries no trailing slash, so a path can be appended directly", async () => {
    const { APP_ORIGIN } = await import("./apiPaths");
    expect(APP_ORIGIN).not.toMatch(/\/$/);
  });
});
