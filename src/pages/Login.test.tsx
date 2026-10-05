/**
 * The sign-in screen, signed OUT — the state `renderPage` cannot give, since
 * it seeds a session and Login's own "already signed in" effect would then
 * navigate away before the form could be touched.
 *
 * What is pinned is the wiring the service tests cannot see: the form asks for
 * an EMAIL, sends it to Jivo Auth, shows the sentence the service chose, and
 * offers no reset link (production Jivo Auth sends no email).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { AuthProvider } from "../auth";
import { createQueryClient } from "../lib/queryClient";
import { jivoAuthClient } from "../services/jivoAuth";
import Login from "./Login";

const originalJivoAdapter = jivoAuthClient.defaults.adapter;

afterEach(() => {
  jivoAuthClient.defaults.adapter = originalJivoAdapter;
});

/** Jivo Auth answers every request with `status` and `data`. */
function jivoAnswers(status: number, data: unknown, seen: InternalAxiosRequestConfig[] = []) {
  jivoAuthClient.defaults.adapter = async (config) => {
    seen.push(config);
    const response: AxiosResponse = {
      data,
      status,
      statusText: String(status),
      headers: {},
      config,
    };
    if (status >= 400) {
      throw new AxiosError(String(status), "ERR_BAD_REQUEST", config, null, response);
    }
    return response;
  };
  return seen;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("Login", () => {
  it("asks for an email, the way a password manager can fill", () => {
    renderLogin();

    const email = screen.getByPlaceholderText("name@company.com");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("username");
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.queryByText("Username")).toBeNull();
  });

  it("offers no reset link, and says who resets a password", () => {
    renderLogin();

    expect(screen.getByText("Forgot your password? Ask your administrator.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /forgot|reset/i })).toBeNull();
  });

  it("signs in at Jivo Auth with the email typed", async () => {
    const seen = jivoAnswers(401, { detail: "No active account", code: "authentication_failed" });
    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("name@company.com"), "amit@jivo.in");
    await user.type(screen.getByPlaceholderText("••••••••"), "wrong");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Wrong email or password.")).toBeTruthy();
    expect(seen[0].url).toBe("/auth/login/");
    expect(JSON.parse(String(seen[0].data))).toMatchObject({
      email: "amit@jivo.in",
      device_name: "OMS web",
    });
    expect(localStorage.getItem("access")).toBeNull();
  });

  it("shows Jivo Auth's unverified-email refusal as it is worded for the form", async () => {
    jivoAnswers(401, { detail: "x", code: "email_not_verified", messages: [] });
    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("name@company.com"), "new@jivo.in");
    await user.type(screen.getByPlaceholderText("••••••••"), "pw");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByText("Your email address isn't verified yet. Ask your administrator."),
    ).toBeTruthy();
  });
});
