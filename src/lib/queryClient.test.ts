/**
 * The defaults in `createQueryClient` are decisions, so they get assertions.
 *
 * Without these the file reads as configuration and drifts as configuration —
 * someone bumps `retry` back to the library default and nothing anywhere says
 * that a 403 must not be asked for three times.
 */
import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { createQueryClient } from "./queryClient";

/** An axios error with a given status, or none at all for a transport failure. */
function axiosError(status?: number): AxiosError {
  const error = new AxiosError("boom");
  if (status !== undefined) {
    error.response = {
      status,
      statusText: "",
      data: null,
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
  }
  return error;
}

function retryFn() {
  const options = createQueryClient().getDefaultOptions().queries;
  const retry = options?.retry;
  if (typeof retry !== "function") throw new Error("retry is not a predicate");
  return retry as (failureCount: number, error: unknown) => boolean;
}

describe("createQueryClient", () => {
  it("does not retry the statuses that will never change", () => {
    const retry = retryFn();
    // Three round trips before telling someone they lack permission, and three
    // attempts to submit a payload the server has already rejected.
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(retry(0, axiosError(status)), `retried ${status}`).toBe(false);
    }
  });

  it("retries server errors and dropped connections", () => {
    const retry = retryFn();
    expect(retry(0, axiosError(500))).toBe(true);
    expect(retry(0, axiosError(502))).toBe(true);
    // No `response` at all — a timeout or a dead network.
    expect(retry(0, axiosError())).toBe(true);
  });

  it("gives up after two attempts", () => {
    const retry = retryFn();
    expect(retry(1, axiosError(500))).toBe(true);
    expect(retry(2, axiosError(500))).toBe(false);
  });

  it("does not retry a non-axios throw", () => {
    // A TypeError from our own mapping code is a bug, not a flaky network.
    expect(retryFn()(0, new TypeError("cannot read properties of null"))).toBe(false);
  });

  it("never retries a mutation", () => {
    // A mutation is a write. Repeating one that failed at the server is how an
    // order gets submitted twice.
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });

  it("does not refetch everything when the tab regains focus", () => {
    // Eight queries on a dashboard means eight requests for alt-tabbing to
    // Excel and back. Live screens opt in with `refetchInterval` instead.
    expect(createQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus).toBe(
      false,
    );
  });

  it("keeps a response fresh for half a minute, and no longer", () => {
    // Long enough that navigating to a detail page and back does not refire
    // the list; short enough that two people working the same queue are not
    // acting on each other's stale rows.
    expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(30_000);
  });
});
