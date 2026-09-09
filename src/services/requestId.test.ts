/**
 * Correlation IDs — generation, and reading one back off whatever axios hands
 * us.
 *
 * The generator test that matters is the alphabet one: an ID the server
 * rejects is silently replaced, and the browser then shows the user a
 * reference that appears nowhere in the log. That failure is invisible from
 * either side on its own.
 */
import { describe, expect, it, vi } from "vitest";

import { REQUEST_ID_PATTERN, newRequestId, requestIdOf } from "./requestId";

describe("newRequestId", () => {
  it("stays inside the alphabet the server accepts", () => {
    // `core/request_context.py` accepts /\A[A-Za-z0-9._-]{1,64}\Z/ and replaces
    // anything else — because a caller-supplied value reaching a log file is a
    // log-forgery primitive. An ID outside it is discarded server-side, and the
    // reference we then show the user matches nothing.
    for (let i = 0; i < 200; i += 1) {
      expect(newRequestId()).toMatch(REQUEST_ID_PATTERN);
    }
  });

  it("marks the web client as the origin of the ID", () => {
    expect(newRequestId().startsWith("web-")).toBe(true);
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 500 }, newRequestId));
    expect(ids.size).toBe(500);
  });

  it("still produces a valid ID without crypto.randomUUID", () => {
    // Non-secure origins and older engines. The fallback must not produce
    // something the server will throw away.
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
      throw new Error("unavailable");
    });
    // `randomUUID` is probed with typeof, so replace it outright.
    const original = globalThis.crypto.randomUUID;
    // @ts-expect-error — deliberately removing an API to exercise the fallback.
    globalThis.crypto.randomUUID = undefined;
    try {
      for (let i = 0; i < 50; i += 1) {
        expect(newRequestId()).toMatch(REQUEST_ID_PATTERN);
      }
    } finally {
      globalThis.crypto.randomUUID = original;
    }
  });
});

describe("requestIdOf", () => {
  it("reads an AxiosHeaders-style response", () => {
    const response = { headers: { get: (name: string) => (name === "X-Request-ID" ? "web-abc" : null) } };
    expect(requestIdOf(response)).toBe("web-abc");
  });

  it("reads a plain-object response, case-insensitively", () => {
    // A browser lowercases response header names; our outgoing config does not.
    expect(requestIdOf({ headers: { "x-request-id": "web-abc" } })).toBe("web-abc");
    expect(requestIdOf({ headers: { "X-Request-ID": "web-abc" } })).toBe("web-abc");
  });

  it("reads it off an axios error's response", () => {
    const error = { response: { headers: { "x-request-id": "web-err" } } };
    expect(requestIdOf(error)).toBe("web-err");
  });

  it("falls back to the ID that was SENT when there is no response", () => {
    // The common case for the errors most worth correlating: offline, DNS
    // failure, a cancelled CORS preflight. There is no response at all, but the
    // ID we sent is still the one the server would have logged against — and
    // the one to quote when asking whether the request ever arrived.
    const error = { config: { headers: { "X-Request-ID": "web-sent" } } };
    expect(requestIdOf(error)).toBe("web-sent");
  });

  it("prefers the response's ID over the one we sent", () => {
    // They normally match. When they do not, the server's value is the one
    // written to the log — ours was rejected by the sanitiser or overwritten
    // by a proxy, and the log will not contain it.
    const error = {
      config: { headers: { "X-Request-ID": "web-sent" } },
      response: { headers: { "x-request-id": "server-chose" } },
    };
    expect(requestIdOf(error)).toBe("server-chose");
  });

  it("returns an empty string rather than throwing on anything unexpected", () => {
    // Callers must treat "" as normal: a browser hides every response header
    // not named in Access-Control-Expose-Headers, so this genuinely happens.
    expect(requestIdOf(null)).toBe("");
    expect(requestIdOf(undefined)).toBe("");
    expect(requestIdOf({})).toBe("");
    expect(requestIdOf({ headers: {} })).toBe("");
    expect(requestIdOf({ headers: { get: () => null } })).toBe("");
    expect(requestIdOf(new Error("boom"))).toBe("");
  });

  it("ignores a header present but empty", () => {
    expect(requestIdOf({ headers: { "x-request-id": "" } })).toBe("");
  });
});
