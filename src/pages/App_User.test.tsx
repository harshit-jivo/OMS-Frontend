/**
 * App Users, now that people live in Jivo Auth.
 *
 * Creating an OMS user means picking a Jivo Auth person who has OMS access and
 * no OMS user yet, and sending their `auth_id` with the OMS fields — no name,
 * email, username or password. Editing shows name and email read-only and
 * never sends them, nor a password. Requests stop at the `api` adapter.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "../services/api";
import { renderPage } from "../test/renderPage";
import App_User from "./App_User";

const JIVO_USERS = [
  {
    auth_id: "jv-new",
    email: "new@jivo.in",
    name: "New Person",
    is_active: true,
    oms_user_id: null,
  },
  { auth_id: "jv-old", email: "old@jivo.in", name: "Old Person", is_active: true, oms_user_id: 7 },
];

const AMIT = {
  id: 7,
  auth_id: "jv-old",
  name: "Old Person",
  username: "old.person",
  email: "old@jivo.in",
  role: "billing",
  role_name: "billing",
  is_active: true,
  phone: "9876543210",
  company: 1,
  category: { id: 1, category: "OIL" },
  categories: [{ id: 1, category: "OIL" }],
  main_groups: [],
  states: [],
};

const originalAdapter = api.defaults.adapter;
let seen: InternalAxiosRequestConfig[];

beforeEach(() => {
  seen = [];
  api.defaults.adapter = async (config) => {
    seen.push(config);
    const url = config.url ?? "";
    const reply = (data: unknown): AxiosResponse => ({
      data,
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    });
    if (url.startsWith("/auth/users/list/")) return reply({ success: true, data: [AMIT] });
    if (url.startsWith("/auth/jivo-users/")) return reply({ success: true, data: JIVO_USERS });
    if (url.startsWith("/auth/roles/")) return reply([{ id: 1, name: "billing" }]);
    if (url.startsWith("/auth/companies/")) return reply([{ id: 1, name: "Jivo Wellness" }]);
    if (url.startsWith("/auth/categories/")) return reply([{ id: 1, category: "OIL" }]);
    if (url === "/auth/users/create/" || /^\/auth\/users\/\d+\/$/.test(url)) {
      return reply({ success: true, message: "Saved", data: {} });
    }
    return reply([]);
  };
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

const sent = (method: string, url: string | RegExp) =>
  seen.filter(
    (config) =>
      config.method === method &&
      (typeof url === "string" ? config.url === url : url.test(config.url ?? "")),
  );

describe("App_User", () => {
  it("creates a user from a picked Jivo Auth person, sending auth_id and no credentials", async () => {
    renderPage(<App_User />, { route: "/App_User" });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByText(
        "People are added to Jivo Auth by an administrator first; pick them here to give them OMS access and roles.",
      ),
    ).toBeTruthy();
    for (const gone of ["Full name", "Username", "Password", "Email address"]) {
      expect(within(dialog).queryByText(gone)).toBeNull();
    }

    // Only people without an OMS user are offered.
    // Named by its field label, as every control in these forms is.
    await user.click(await within(dialog).findByRole("button", { name: /^Person/ }));
    expect(await within(dialog).findByRole("option", { name: /New Person/ })).toBeTruthy();
    expect(within(dialog).getByText("new@jivo.in")).toBeTruthy();
    expect(within(dialog).queryByRole("option", { name: /Old Person/ })).toBeNull();
    await user.click(within(dialog).getByRole("option", { name: /New Person/ }));

    await user.type(within(dialog).getByLabelText(/Contact number/), "9000000000");
    await user.click(within(dialog).getByRole("button", { name: /^User role/ }));
    await user.click(await within(dialog).findByRole("option", { name: "billing" }));
    await user.click(within(dialog).getByRole("radio", { name: "Jivo Wellness" }));
    await user.click(within(dialog).getByRole("button", { name: /^Category/ }));
    await user.click(await within(dialog).findByRole("checkbox", { name: "OIL" }));

    await user.click(within(dialog).getByRole("button", { name: "Create user" }));

    // The toaster lives in the app shell, which a page rendered alone does
    // not have — so the request is the thing to wait for.
    await vi.waitFor(() => expect(sent("post", "/auth/users/create/")).toHaveLength(1));
    const [create] = sent("post", "/auth/users/create/");
    const body = JSON.parse(String(create.data));
    expect(body).toMatchObject({
      auth_id: "jv-new",
      phone: "9000000000",
      role: 1,
      company: 1,
      category: 1,
      categories: [1],
    });
    for (const key of ["username", "password", "name", "email"]) {
      expect(body, key).not.toHaveProperty(key);
    }
  });

  it("will not create without a person picked", async () => {
    renderPage(<App_User />, { route: "/App_User" });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");

    const create = within(dialog).getByRole("button", { name: "Create user" });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    expect(create.getAttribute("title")).toContain("person");
  });

  it("edits with name and email read-only, and never sends them or a password", async () => {
    renderPage(<App_User />, { route: "/App_User" });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Edit Old Person" }));
    const dialog = await screen.findByRole("dialog");

    const name = within(dialog).getByLabelText("Full name") as HTMLInputElement;
    const email = within(dialog).getByLabelText("Email address") as HTMLInputElement;
    expect(name.value).toBe("Old Person");
    expect(name.readOnly).toBe(true);
    expect(email.value).toBe("old@jivo.in");
    expect(email.readOnly).toBe(true);
    expect(within(dialog).getAllByText("Name and email are managed in Jivo Auth.")).toHaveLength(2);
    expect(within(dialog).queryByText(/password/i)).toBeNull();

    // Username stays editable: other OMS features key on it.
    const username = within(dialog).getByLabelText(/Username/) as HTMLInputElement;
    expect(username.readOnly).toBe(false);
    await user.clear(username);
    await user.type(username, "op");

    await user.click(within(dialog).getByRole("button", { name: "Update user" }));

    await vi.waitFor(() => expect(sent("put", /^\/auth\/users\/7\/$/)).toHaveLength(1));
    const [update] = sent("put", /^\/auth\/users\/7\/$/);
    const body = JSON.parse(String(update.data));
    expect(body).toMatchObject({ username: "op", role: 1, company: 1, category: 1 });
    for (const key of ["password", "name", "email"]) {
      expect(body, key).not.toHaveProperty(key);
    }
  });
});
