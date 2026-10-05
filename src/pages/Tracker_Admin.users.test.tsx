/**
 * Tracker Admin's own users, now that people live in Jivo Auth.
 *
 * Create picks a Jivo Auth person with no OMS user and sends `auth_id`, role
 * and phone — no username, password, name or email. Edit sends only role,
 * phone and active, and shows name and email read-only. Requests stop at the
 * `api` adapter.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "../services/api";
import { renderPage } from "../test/renderPage";
import Tracker_Admin from "./Tracker_Admin";

const TRACKER_USER = {
  id: 31,
  auth_id: "jv-old",
  username: "old.person",
  name: "Old Person",
  email: "old@jivo.in",
  phone: "",
  role: "tracker_user",
  role_display: null,
  is_active: true,
};

const originalAdapter = api.defaults.adapter;
let seen: InternalAxiosRequestConfig[];

beforeEach(() => {
  seen = [];
  api.defaults.adapter = async (config) => {
    seen.push(config);
    const url = config.url ?? "";
    const reply = (data: unknown, status = 200): AxiosResponse => ({
      data,
      status,
      statusText: String(status),
      headers: {},
      config,
    });
    if (url === "/tracker/admin/jivo-users/") {
      // A bare array here, unlike /auth/jivo-users/.
      return reply([
        {
          auth_id: "jv-new",
          email: "new@jivo.in",
          name: "New Person",
          is_active: true,
          oms_user_id: null,
        },
        {
          auth_id: "jv-old",
          email: "old@jivo.in",
          name: "Old Person",
          is_active: true,
          oms_user_id: 31,
        },
      ]);
    }
    if (url === "/tracker/admin/tracker-users/" && config.method === "post") {
      return reply({ ...TRACKER_USER, id: 32, auth_id: "jv-new", name: "New Person" }, 201);
    }
    if (url === "/tracker/admin/tracker-users/") return reply([TRACKER_USER]);
    if (url === "/tracker/admin/tracker-users/31/") return reply(TRACKER_USER);
    return reply([]);
  };
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

const sent = (method: string, url: string) =>
  seen.filter((config) => config.method === method && config.url === url);

async function openUsersTab() {
  renderPage(<Tracker_Admin />, { route: "/Tracker_Admin" });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name: "Tracker Users" }));
  await screen.findByText("old.person");
  return user;
}

describe("Tracker Admin users", () => {
  it("creates from a picked Jivo Auth person, with auth_id and role only", async () => {
    const user = await openUsersTab();

    await user.click(screen.getByRole("button", { name: /Add user/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/Password/)).toBeNull();
    expect(within(dialog).queryByLabelText(/Username/)).toBeNull();
    expect(within(dialog).queryByLabelText(/^Email/)).toBeNull();

    await user.click(await within(dialog).findByRole("button", { name: /^Person/ }));
    expect(within(dialog).queryByRole("option", { name: /Old Person/ })).toBeNull();
    await user.click(await within(dialog).findByRole("option", { name: /New Person/ }));
    await user.click(within(dialog).getByRole("button", { name: /Create user/ }));

    await vi.waitFor(() => expect(sent("post", "/tracker/admin/tracker-users/")).toHaveLength(1));
    const body = JSON.parse(String(sent("post", "/tracker/admin/tracker-users/")[0].data));
    expect(body).toEqual({ auth_id: "jv-new", role: "tracker_user" });
  });

  it("edits only role, phone and status, showing name and email read-only", async () => {
    const user = await openUsersTab();

    await user.click(screen.getByRole("button", { name: /Edit/ }));
    const dialog = await screen.findByRole("dialog");

    const name = within(dialog).getByLabelText("Full name") as HTMLInputElement;
    const email = within(dialog).getByLabelText("Email") as HTMLInputElement;
    expect(name.value).toBe("Old Person");
    expect(name.readOnly).toBe(true);
    expect(email.value).toBe("old@jivo.in");
    expect(email.readOnly).toBe(true);
    expect(within(dialog).queryByLabelText(/password/i)).toBeNull();

    await user.type(within(dialog).getByLabelText(/Phone/), "9000000000");
    await user.click(within(dialog).getByRole("button", { name: /Save changes/ }));

    await vi.waitFor(() =>
      expect(sent("patch", "/tracker/admin/tracker-users/31/")).toHaveLength(1),
    );
    const body = JSON.parse(String(sent("patch", "/tracker/admin/tracker-users/31/")[0].data));
    expect(body).toEqual({ role: "tracker_user", phone: "9000000000", is_active: true });
  });
});
