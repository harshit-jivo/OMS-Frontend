/**
 * Signing in: Jivo Auth's login, then OMS's profile, and the undo when the
 * second half refuses.
 *
 * Both clients are stopped at their adapters — `api` for OMS, the bare Jivo
 * Auth client for auth.jivo.in — so the two-call sequence and its storage
 * writes are the real code, and nothing leaves the machine.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";

const BASE = "http://localhost:8000/api";
const AUTH = "https://auth.example.test/api/v1";

/** A minimal, non-expired JWT. Only `exp` is ever read client-side. */
function token(secondsFromNow = 900): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + secondsFromNow };
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

type Route = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

function adapterFor(route: Route, seen: InternalAxiosRequestConfig[]): AxiosAdapter {
  return async (config) => {
    seen.push(config);
    const { status, data } = route(config);
    const response: AxiosResponse = {
      data,
      status,
      statusText: String(status),
      headers: {},
      config,
    };
    if (status >= 400)
      throw new AxiosError(String(status), "ERR_BAD_REQUEST", config, null, response);
    return response;
  };
}

const ADMIN = {
  id: 1,
  auth_id: "jv-1",
  username: "amit",
  full_name: "Amit Kumar",
  email: "amit@jivo.in",
  role: "admin",
};

/**
 * Load the services fresh. `jivo` answers Jivo Auth (login and logout), `oms`
 * answers the OMS API (the profile).
 */
async function load({ jivo, oms }: { jivo: Route; oms: Route }) {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", BASE);
  vi.stubEnv("VITE_API_VERSION", "");
  vi.stubEnv("VITE_AUTH_BASE_URL", AUTH);

  const apiModule = await import("./api");
  const jivoModule = await import("./jivoAuth");
  const auth = await import("./authService");

  const omsSeen: InternalAxiosRequestConfig[] = [];
  const jivoSeen: InternalAxiosRequestConfig[] = [];
  apiModule.default.defaults.adapter = adapterFor(oms, omsSeen);
  jivoModule.jivoAuthClient.defaults.adapter = adapterFor(jivo, jivoSeen);
  return { ...auth, omsSeen, jivoSeen };
}

/** Jivo Auth signs in successfully, and answers sign-out with 205. */
const jivoSignsIn =
  (access = token(), refresh = "jivo-refresh"): Route =>
  (config) =>
    config.url === "/auth/login/"
      ? { status: 200, data: { access, refresh } }
      : { status: 205, data: {} };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("signInWithJivo", () => {
  it("signs in at Jivo Auth, stores the pair, and returns the OMS profile", async () => {
    const access = token();
    const { signInWithJivo, jivoSeen, omsSeen } = await load({
      jivo: jivoSignsIn(access),
      oms: () => ({ status: 200, data: { success: true, data: ADMIN } }),
    });

    const user = await signInWithJivo("amit@jivo.in", "pw");

    expect(user).toMatchObject({ id: 1, email: "amit@jivo.in", auth_id: "jv-1" });
    expect(localStorage.getItem("access")).toBe(access);
    expect(localStorage.getItem("refresh")).toBe("jivo-refresh");

    expect(jivoSeen).toHaveLength(1);
    expect(JSON.parse(String(jivoSeen[0].data))).toMatchObject({ device_name: "OMS web" });
    // The profile was asked for WITH the Jivo token — which is the point of
    // storing the pair between the two calls.
    expect(omsSeen[0].url).toBe("/auth/profile/");
    expect(omsSeen[0].headers.get("Authorization")).toBe(`Bearer ${access}`);
  });

  it("never asks the old OMS login", async () => {
    const { signInWithJivo, omsSeen } = await load({
      jivo: jivoSignsIn(),
      oms: () => ({ status: 200, data: { success: true, data: ADMIN } }),
    });

    await signInWithJivo("amit@jivo.in", "pw");

    expect(omsSeen.map((c) => c.url)).toEqual(["/auth/profile/"]);
  });

  it("passes Jivo Auth's refusal through, and stores nothing", async () => {
    const { signInWithJivo, omsSeen } = await load({
      jivo: () => ({ status: 401, data: { detail: "No account", code: "authentication_failed" } }),
      oms: () => ({ status: 200, data: { success: true, data: ADMIN } }),
    });

    await expect(signInWithJivo("amit@jivo.in", "wrong")).rejects.toThrow(
      "Wrong email or password.",
    );
    expect(localStorage.getItem("access")).toBeNull();
    expect(omsSeen).toHaveLength(0);
  });

  it("names an unverified email", async () => {
    const { signInWithJivo } = await load({
      jivo: () => ({
        status: 401,
        data: { detail: "x", code: "email_not_verified", messages: [] },
      }),
      oms: () => ({ status: 200, data: {} }),
    });

    await expect(signInWithJivo("new@jivo.in", "pw")).rejects.toThrow(
      "Your email address isn't verified yet. Ask your administrator.",
    );
  });

  it("on a profile 403: says no OMS access, ends the Jivo session, clears the tokens", async () => {
    // Signed in to Jivo Auth fine; the account just has no access to OMS. The
    // pair is useless here and must not stay alive at auth.jivo.in either.
    const { signInWithJivo, jivoSeen } = await load({
      jivo: jivoSignsIn(token(), "jivo-refresh"),
      oms: () => ({ status: 403, data: { detail: "You do not have access to OMS." } }),
    });

    await expect(signInWithJivo("amit@jivo.in", "pw")).rejects.toThrow(
      "Your account doesn't have access to OMS. Ask your administrator.",
    );

    expect(localStorage.getItem("access")).toBeNull();
    expect(localStorage.getItem("refresh")).toBeNull();
    const logout = jivoSeen.find((c) => c.url === "/auth/logout/");
    expect(logout).toBeDefined();
    expect(JSON.parse(String(logout!.data))).toEqual({ refresh: "jivo-refresh" });
    expect(logout!.headers.get("Authorization")).toBeFalsy();
  });

  it("does not refresh on a profile 403", async () => {
    const { signInWithJivo, jivoSeen } = await load({
      jivo: jivoSignsIn(),
      oms: () => ({ status: 403, data: {} }),
    });

    await expect(signInWithJivo("amit@jivo.in", "pw")).rejects.toThrow();

    expect(jivoSeen.some((c) => c.url === "/auth/refresh/")).toBe(false);
  });

  it("on a disabled OMS account: says so and clears the tokens", async () => {
    const { signInWithJivo, jivoSeen } = await load({
      jivo: jivoSignsIn(),
      oms: () => ({ status: 401, data: { detail: "User account is disabled." } }),
    });

    await expect(signInWithJivo("amit@jivo.in", "pw")).rejects.toThrow(
      "Your OMS account is disabled.",
    );

    expect(localStorage.getItem("access")).toBeNull();
    expect(localStorage.getItem("refresh")).toBeNull();
    // A new token would not un-disable the account, so none was asked for.
    expect(jivoSeen.some((c) => c.url === "/auth/refresh/")).toBe(false);
  });

  it("does not leave a half session when the profile is empty", async () => {
    const { signInWithJivo } = await load({
      jivo: jivoSignsIn(),
      oms: () => ({ status: 200, data: [] }),
    });

    await expect(signInWithJivo("amit@jivo.in", "pw")).rejects.toThrow(
      "OMS could not load your account. Try again.",
    );
    expect(localStorage.getItem("access")).toBeNull();
  });
});
