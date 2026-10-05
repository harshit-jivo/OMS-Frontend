/**
 * The "confirm your password" dialog, end to end through both of its calls.
 *
 * OMS no longer holds passwords, so the check is two requests: a Jivo Auth
 * sign-in as the current user (by their email), then OMS's confirm-password
 * with the access token that proves it. Both are stopped at their adapters —
 * the Jivo Auth client and the shared `api` — so the dialog, the service and
 * the request shapes are all the real code.
 *
 * The page tests mock the whole service and cannot see any of this.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "../../services/api";
import { jivoAuthClient } from "../../services/jivoAuth";
import { renderPage } from "../../test/renderPage";
import { ManualAccountPassword } from "./ManualAccountPassword";

type Reply = { status: number; data: unknown; headers?: Record<string, string> };

function adapter(
  route: (config: InternalAxiosRequestConfig) => Reply,
  seen: InternalAxiosRequestConfig[],
): AxiosAdapter {
  return async (config) => {
    seen.push(config);
    const { status, data, headers = {} } = route(config);
    const response: AxiosResponse = { data, status, statusText: String(status), headers, config };
    if (status >= 400)
      throw new AxiosError(String(status), "ERR_BAD_REQUEST", config, null, response);
    return response;
  };
}

const originalApiAdapter = api.defaults.adapter;
const originalJivoAdapter = jivoAuthClient.defaults.adapter;

let omsSeen: InternalAxiosRequestConfig[];
let jivoSeen: InternalAxiosRequestConfig[];

/** OMS answers confirm-password with its usual envelope; anything else, `[]`. */
function omsAnswers() {
  api.defaults.adapter = adapter(
    (config) =>
      config.url?.endsWith("/confirm-password/")
        ? { status: 200, data: { success: true, data: { token: "manual-tok", expires_in: 600 } } }
        : // `[]` for the provider's profile refresh, which then keeps the
          // stored session — the one this test set up.
          { status: 200, data: [] },
    omsSeen,
  );
}

function jivoAnswers(reply: Reply) {
  jivoAuthClient.defaults.adapter = adapter(() => reply, jivoSeen);
}

beforeEach(() => {
  omsSeen = [];
  jivoSeen = [];
  omsAnswers();
});

afterEach(() => {
  api.defaults.adapter = originalApiAdapter;
  jivoAuthClient.defaults.adapter = originalJivoAdapter;
});

function renderDialog(session: { email?: string } = {}) {
  const onConfirmed = vi.fn();
  renderPage(
    <ManualAccountPassword requestId={14} open onClose={() => {}} onConfirmed={onConfirmed} />,
    { session },
  );
  return onConfirmed;
}

const confirmPasswordCalls = () =>
  omsSeen.filter((config) => config.url?.endsWith("/confirm-password/"));

describe("ManualAccountPassword", () => {
  it("signs in to Jivo Auth as the current user, then hands OMS the access token", async () => {
    jivoAnswers({ status: 200, data: { access: "check-access", refresh: "check-refresh" } });
    const onConfirmed = renderDialog();
    const sessionAccess = localStorage.getItem("access");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Your password"), "secret");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalledWith("manual-tok"));

    // (a) Jivo Auth: the session's email, the typed password, and a device
    // name that says what this sign-in was for.
    expect(jivoSeen).toHaveLength(1);
    expect(jivoSeen[0].url).toBe("/auth/login/");
    expect(JSON.parse(String(jivoSeen[0].data))).toEqual({
      email: "tester@example.com",
      password: "secret",
      device_name: "OMS payment confirmation",
    });

    // (b) OMS: the access token from (a), and NOT the password.
    const [confirm] = confirmPasswordCalls();
    expect(confirm.url).toBe("/advance-payments/requests/14/confirm-password/");
    expect(JSON.parse(String(confirm.data))).toEqual({ access: "check-access" });

    // The check's tokens are dropped: the real session is exactly as it was.
    expect(localStorage.getItem("access")).toBe(sessionAccess);
    expect(localStorage.getItem("refresh")).toBe("test-refresh");
  });

  it("says the password is not right on Jivo Auth's 401, and never asks OMS", async () => {
    jivoAnswers({
      status: 401,
      data: { detail: "No active account", code: "authentication_failed", messages: [] },
    });
    const onConfirmed = renderDialog();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Your password"), "guess");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("That password is not right.")).toBeTruthy();
    expect(confirmPasswordCalls()).toHaveLength(0);
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("says too many attempts on a 429", async () => {
    jivoAnswers({
      status: 429,
      data: { detail: "Request was throttled." },
      headers: { "retry-after": "30" },
    });
    renderDialog();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Your password"), "secret");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Too many attempts. Try again in 30 seconds.")).toBeTruthy();
    expect(confirmPasswordCalls()).toHaveLength(0);
  });

  it("shows OMS's own refusal when the second step fails", async () => {
    jivoAnswers({ status: 200, data: { access: "check-access", refresh: "check-refresh" } });
    api.defaults.adapter = adapter(
      (config) =>
        config.url?.endsWith("/confirm-password/")
          ? {
              status: 403,
              data: { success: false, message: "Only the Payment stage can do this." },
            }
          : { status: 200, data: [] },
      omsSeen,
    );
    const onConfirmed = renderDialog();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Your password"), "secret");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Only the Payment stage can do this.")).toBeTruthy();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("calls nothing when the OMS account has no email", async () => {
    jivoAnswers({ status: 200, data: { access: "check-access", refresh: "check-refresh" } });
    const onConfirmed = renderDialog({ email: "" });
    const user = userEvent.setup();

    expect(
      await screen.findByText("Your OMS account has no email address; ask your administrator."),
    ).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(jivoSeen).toHaveLength(0);
    expect(confirmPasswordCalls()).toHaveLength(0);
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
