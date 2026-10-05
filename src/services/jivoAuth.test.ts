/**
 * The Jivo Auth client: what it sends, and what a person is told when it fails.
 *
 * Requests stop at the client's adapter, so nothing reaches auth.jivo.in, but
 * everything above it — axios's header and body handling included — is the
 * real code path. That matters for the header test: the CORS rule it guards
 * is about what axios actually puts on the wire, not what the call site asked
 * for.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

const AUTH = "https://auth.example.test/api/v1";

/** Load a fresh client whose adapter answers with `status`, `data`, `headers`. */
async function loadWith(status: number, data: unknown = {}, headers: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("VITE_AUTH_BASE_URL", AUTH);
  const mod = await import("./jivoAuth");
  const seen: InternalAxiosRequestConfig[] = [];
  mod.jivoAuthClient.defaults.adapter = async (config) => {
    seen.push(config);
    const response: AxiosResponse = { data, status, statusText: String(status), headers, config };
    if (status >= 400) {
      throw new AxiosError(String(status), "ERR_BAD_REQUEST", config, null, response);
    }
    return response;
  };
  return { ...mod, seen };
}

/** Load a fresh client whose every request fails without a response. */
async function loadUnreachable() {
  vi.resetModules();
  vi.stubEnv("VITE_AUTH_BASE_URL", AUTH);
  const mod = await import("./jivoAuth");
  mod.jivoAuthClient.defaults.adapter = async (config) => {
    throw new AxiosError("Network Error", "ERR_NETWORK", config);
  };
  return mod;
}

/** The error a call threw, so its fields can be asserted on. */
async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("sign-in request", () => {
  it("posts email, password and the device name to {AUTH}/auth/login/", async () => {
    const { jivoLogin, seen } = await loadWith(200, { access: "a1", refresh: "r1" });

    await expect(jivoLogin("amit@jivo.in", "pw", "OMS web")).resolves.toEqual({
      access: "a1",
      refresh: "r1",
    });

    expect(seen[0].baseURL).toBe(AUTH);
    expect(seen[0].url).toBe("/auth/login/");
    expect(JSON.parse(String(seen[0].data))).toEqual({
      email: "amit@jivo.in",
      password: "pw",
      device_name: "OMS web",
    });
  });

  it("sends only headers Jivo Auth's CORS allows", async () => {
    // accept, authorization, content-type, user-agent, x-csrftoken,
    // x-requested-with. Anything else — OMS's X-App-Version, X-Request-ID —
    // fails the preflight and the browser never sends the sign-in at all.
    const { jivoLogin, seen } = await loadWith(200, { access: "a1", refresh: "r1" });

    await jivoLogin("amit@jivo.in", "pw", "OMS web");

    const sent = Object.keys(seen[0].headers.toJSON()).map((name) => name.toLowerCase());
    expect(sent.filter((name) => !["accept", "content-type"].includes(name))).toEqual([]);
    expect(seen[0].headers.get("Content-Type")).toBe("application/json");
  });

  it("does not carry the password in what it throws", async () => {
    // The axios error holds the request body. Anything that logged it would
    // log the password, so it never leaves this module.
    const { jivoLogin } = await loadWith(401, { detail: "No active account", code: "x" });

    const error = await failureOf(jivoLogin("amit@jivo.in", "hunter2", "OMS web"));

    expect(JSON.stringify(error)).not.toContain("hunter2");
    expect(String((error as Error).message)).not.toContain("hunter2");
    expect(error).not.toHaveProperty("config");
    expect(error).not.toHaveProperty("response");
  });

  it("treats a 200 without a token pair as a failure", async () => {
    const { jivoLogin, signInErrorMessage } = await loadWith(200, { detail: "ok" });

    const error = await failureOf(jivoLogin("amit@jivo.in", "pw", "OMS web"));

    expect(signInErrorMessage(error)).toBe("The sign-in service had a problem. Try again.");
  });
});

describe("what the sign-in screen says", () => {
  it("names an unverified email, from Jivo Auth's code", async () => {
    const { jivoLogin, signInErrorMessage } = await loadWith(401, {
      detail: "Email address is not verified.",
      code: "email_not_verified",
      messages: [],
    });

    const error = await failureOf(jivoLogin("new@jivo.in", "pw", "OMS web"));

    expect(signInErrorMessage(error)).toBe(
      "Your email address isn't verified yet. Ask your administrator.",
    );
  });

  it("says wrong email or password for any other 401", async () => {
    const { jivoLogin, signInErrorMessage } = await loadWith(401, {
      detail: "No active account found with the given credentials",
      code: "authentication_failed",
      messages: [],
    });

    const error = await failureOf(jivoLogin("amit@jivo.in", "wrong", "OMS web"));

    expect(signInErrorMessage(error)).toBe("Wrong email or password.");
  });

  it("gives the wait from Retry-After on a 429", async () => {
    const { jivoLogin, signInErrorMessage } = await loadWith(
      429,
      { detail: "Request was throttled." },
      { "retry-after": "42" },
    );

    const error = await failureOf(jivoLogin("amit@jivo.in", "pw", "OMS web"));

    expect(signInErrorMessage(error)).toBe("Too many attempts. Try again in 42 seconds.");
  });

  it("falls back to DRF's throttle sentence when Retry-After is hidden", async () => {
    // Retry-After is not CORS-safelisted. Unless Jivo Auth exposes it, the
    // browser hides it from this origin and the body is all there is.
    const { jivoLogin, signInErrorMessage } = await loadWith(429, {
      detail: "Request was throttled. Expected available in 17 seconds.",
    });

    const error = await failureOf(jivoLogin("amit@jivo.in", "pw", "OMS web"));

    expect(signInErrorMessage(error)).toBe("Too many attempts. Try again in 17 seconds.");
  });

  it("still says too many attempts when no wait is given at all", async () => {
    const { jivoLogin, signInErrorMessage } = await loadWith(429, {});

    const error = await failureOf(jivoLogin("amit@jivo.in", "pw", "OMS web"));

    expect(signInErrorMessage(error)).toMatch(/^Too many attempts\. Try again/);
  });

  it("says the service cannot be reached when nothing answers", async () => {
    const { jivoLogin, signInErrorMessage } = await loadUnreachable();

    const error = await failureOf(jivoLogin("amit@jivo.in", "pw", "OMS web"));

    expect(signInErrorMessage(error)).toBe("Can't reach the sign-in service. Try again.");
  });
});

describe("what the password re-check says", () => {
  it("says the password is not right for every 401", async () => {
    // The person is signed in already and did not type the email, so "wrong
    // email or password" would point at the wrong thing.
    const { jivoLogin, passwordCheckErrorMessage } = await loadWith(401, {
      code: "authentication_failed",
    });

    const error = await failureOf(jivoLogin("amit@jivo.in", "wrong", "OMS payment confirmation"));

    expect(passwordCheckErrorMessage(error)).toBe("That password is not right.");
  });

  it("says too many attempts on a 429", async () => {
    const { jivoLogin, passwordCheckErrorMessage } = await loadWith(
      429,
      {},
      { "retry-after": "1" },
    );

    const error = await failureOf(jivoLogin("amit@jivo.in", "pw", "OMS payment confirmation"));

    expect(passwordCheckErrorMessage(error)).toBe("Too many attempts. Try again in 1 second.");
  });
});

describe("refresh and sign-out", () => {
  it("returns the NEW pair from a refresh", async () => {
    const { jivoRefresh, seen } = await loadWith(200, { access: "a2", refresh: "r2" });

    await expect(jivoRefresh("r1")).resolves.toEqual({ access: "a2", refresh: "r2" });
    expect(seen[0].url).toBe("/auth/refresh/");
    expect(JSON.parse(String(seen[0].data))).toEqual({ refresh: "r1" });
  });

  it("reports a refused refresh with its status", async () => {
    const { jivoRefresh } = await loadWith(401, { code: "token_not_valid" });

    await expect(jivoRefresh("r1")).rejects.toMatchObject({ status: 401, code: "token_not_valid" });
  });

  it("signs out with the refresh token and no Authorization header", async () => {
    const { jivoLogout, seen } = await loadWith(200, {});
    localStorage.setItem("access", "still-here");

    await jivoLogout("r1", 3000);

    expect(seen[0].url).toBe("/auth/logout/");
    expect(JSON.parse(String(seen[0].data))).toEqual({ refresh: "r1" });
    expect(seen[0].headers.get("Authorization")).toBeFalsy();
    expect(seen[0].timeout).toBe(3000);
  });

  it("never lets a failed sign-out throw", async () => {
    const offline = await loadUnreachable();
    await expect(offline.jivoLogout("r1")).resolves.toBeUndefined();

    const refused = await loadWith(500, {});
    await expect(refused.jivoLogout("r1")).resolves.toBeUndefined();
  });
});
