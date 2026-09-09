/**
 * Bill prints over axios.
 *
 * The error path carries most of the risk here. With `responseType: "blob"`,
 * axios hands back the server's JSON error body as a Blob — so the ordinary
 * `error.response.data.error` read yields a Blob object and renders to the
 * user as "[object Blob]". That is a message that looks like a bug report
 * about our own code rather than "no invoice with that number".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosAdapter, AxiosResponse } from "axios";

const BASE = "http://localhost:8000/api";

function token(): string {
  return `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.s`;
}

/** Load a fresh module graph with an adapter that records the request. */
async function load(reply: (url: string) => Partial<AxiosResponse> | Error) {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", BASE);
  vi.stubEnv("VITE_API_VERSION", "");

  const seen: Array<{ url?: string; params?: unknown; responseType?: string; auth?: unknown }> = [];

  const adapter: AxiosAdapter = async (config) => {
    seen.push({
      url: config.url,
      params: config.params,
      responseType: config.responseType,
      auth: config.headers?.get?.("Authorization"),
    });
    const outcome = reply(config.url ?? "");
    const response = {
      data: undefined, status: 200, statusText: "OK", headers: {}, config,
      ...(outcome instanceof Error ? {} : outcome),
    } as AxiosResponse;
    if (outcome instanceof Error) {
      return Promise.reject(Object.assign(outcome, { config, response: { ...response, ...(outcome as unknown as { response?: object }).response } }));
    }
    return response;
  };

  const api = (await import("./api")).default;
  api.defaults.adapter = adapter;
  return { mod: await import("./invoicePrint"), seen };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  localStorage.clear();
});

describe("billPrintParams", () => {
  it("sends only the values that are present", async () => {
    const { mod } = await load(() => ({}));
    expect(mod.billPrintParams({ docNum: "123", branch: "BEVERAGE" })).toEqual({
      docNum: "123",
      branch: "BEVERAGE",
    });
  });

  it("drops blank and whitespace-only values rather than sending them empty", async () => {
    const { mod } = await load(() => ({}));
    expect(mod.billPrintParams({ docNum: "123", party: "   ", docEntry: "" })).toEqual({
      docNum: "123",
    });
  });

  it("keeps the branch, which selects the company database", async () => {
    // Oil, Beverage and Mart are SEPARATE SAP databases — the same DocNum is a
    // different document in each, and the backend defaults to OIL when the
    // branch is missing. Dropping it prints the wrong invoice, silently.
    const { mod } = await load(() => ({}));
    expect(mod.billPrintParams({ docNum: "1", branch: "MART" }).branch).toBe("MART");
  });
});

describe("fetchBillPrint", () => {
  it("goes through the shared instance, so the token is attached", async () => {
    // The bug this whole module exists for: an <iframe src> is a browser
    // navigation and carries no Authorization header, and this project
    // authenticates with JWT alone — no session cookie to fall back on.
    const { mod, seen } = await load(() => ({ data: new Blob(["%PDF-1.4"]) }));
    localStorage.setItem("access", token());

    await mod.fetchBillPrint({ docNum: "5", branch: "OIL" });

    expect(seen[0].url).toBe("/invoice/crystal/");
    expect(seen[0].params).toEqual({ docNum: "5", branch: "OIL" });
    expect(String(seen[0].auth)).toMatch(/^Bearer /);
  });

  it("asks for a blob, so axios does not try to parse the PDF as JSON", async () => {
    const { mod, seen } = await load(() => ({ data: new Blob(["%PDF-1.4"]) }));
    localStorage.setItem("access", token());

    await mod.fetchBillPrint({ docNum: "5" });

    expect(seen[0].responseType).toBe("blob");
  });
});

describe("billPrintError", () => {
  it("reads the server's message back out of a Blob body", async () => {
    // Without this the user is shown "[object Blob]".
    const { mod } = await load(() => ({}));
    const error = {
      response: { status: 404, data: new Blob([JSON.stringify({ error: "DocNum 999 not found" })]) },
    };
    expect(await mod.billPrintError(error)).toBe("DocNum 999 not found");
  });

  it("accepts detail and message as well as error", async () => {
    const { mod } = await load(() => ({}));
    for (const body of [{ detail: "nope" }, { message: "nope" }]) {
      const error = { response: { status: 400, data: new Blob([JSON.stringify(body)]) } };
      expect(await mod.billPrintError(error)).toBe("nope");
    }
  });

  it("falls back to a status message when the body is not JSON", async () => {
    const { mod } = await load(() => ({}));
    const error = { response: { status: 404, data: new Blob(["<html>oops</html>"]) } };
    // Non-JSON: the raw text is unhelpful markup, so the status wins.
    const message = await mod.billPrintError(error);
    expect(message).toContain("No invoice found");
  });

  it("explains a Crystal service outage distinctly from a missing invoice", async () => {
    const { mod } = await load(() => ({}));
    expect(await mod.billPrintError({ response: { status: 502, data: new Blob([""]) } }))
      .toContain("Crystal report service");
  });

  it("says the server was unreachable when there is no response at all", async () => {
    const { mod } = await load(() => ({}));
    expect(await mod.billPrintError(new Error("Network Error"))).toContain("connection");
  });

  it("never throws, whatever it is handed", async () => {
    const { mod } = await load(() => ({}));
    for (const input of [null, undefined, "string", 42, {}, { response: {} }]) {
      await expect(mod.billPrintError(input)).resolves.toBeTypeOf("string");
    }
  });
});

describe("billPrintFilename", () => {
  it("names the file after the invoice and party", async () => {
    const { mod } = await load(() => ({}));
    expect(mod.billPrintFilename({ docNum: "123", party: "Acme Foods" })).toBe("123 Acme Foods.pdf");
  });

  it("strips characters a filesystem refuses", async () => {
    const { mod } = await load(() => ({}));
    expect(mod.billPrintFilename({ docNum: "9", party: 'A/B:C*D' })).toBe("9 A B C D.pdf");
  });

  it("still produces a usable name with nothing to work from", async () => {
    const { mod } = await load(() => ({}));
    expect(mod.billPrintFilename({})).toBe("invoice.pdf");
  });
});
