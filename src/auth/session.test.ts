/**
 * Session storage and API normalisation.
 *
 * `sessionFromApi` is where the two entry points — login and profile refresh —
 * are forced to agree. They did not agree before: login wrote ten keys and the
 * profile fetch wrote three different ones, and `extra_pages` existed on only
 * one path. Both now go through this function, so a field can no longer be
 * populated on one route and missing on the other.
 *
 * The role-shape handling is defensive because the API has genuinely returned
 * a role as a bare string, as `{name}`, and as `{role_name}` at different
 * points, and the Sidebar carried `typeof role === "object" ? role.name : role`
 * to cope.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isAdmin, can } from "./permissions";
import { clearSession, loadSession, saveSession, sessionFromApi } from "./session";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("sessionFromApi", () => {
  it("reads a role given as a plain string", () => {
    const s = sessionFromApi({ id: 1, role: "Billing" });
    expect(s.role).toBe("billing");
  });

  it("reads a role given as an object", () => {
    const s = sessionFromApi({ id: 1, role: { name: "Admin" } });
    expect(s.role).toBe("admin");
  });

  it("falls back to role_name", () => {
    const s = sessionFromApi({ id: 1, role_name: "legal" });
    expect(s.role).toBe("legal");
  });

  it("drops a role in an unrecognised shape rather than stringifying it", () => {
    // `String({})` is "[object Object]", which would never match any check and
    // would be very hard to see in storage.
    const s = sessionFromApi({ id: 1, role: { unexpected: "shape" } });
    expect(s.role).toBe("");
    expect(s.roles).toEqual([]);
  });

  it("merges extra_roles into roles, with the primary included", () => {
    const s = sessionFromApi({
      id: 1,
      role: "billing",
      extra_roles: [{ name: "admin" }],
    });
    expect(new Set(s.roles)).toEqual(new Set(["billing", "admin"]));
  });

  it("prefers the server-computed roles list when present", () => {
    const s = sessionFromApi({
      id: 1,
      role: "billing",
      roles: [{ name: "billing" }, { name: "legal" }],
      extra_roles: [{ name: "ignored" }],
    });
    expect(s.roles).not.toContain("ignored");
    expect(new Set(s.roles)).toEqual(new Set(["billing", "legal"]));
  });

  it("does not duplicate the primary role", () => {
    const s = sessionFromApi({ id: 1, role: "admin", extra_roles: ["admin"] });
    expect(s.roles).toEqual(["admin"]);
  });

  it("carries extra_pages through as grants", () => {
    // The field login never stored. Its absence is what made route guards
    // reject users who did have the grant.
    const s = sessionFromApi({ id: 1, extra_pages: ["Sap_Sync", "App_User"] });
    expect(s.grants).toEqual(["Sap_Sync", "App_User"]);
  });

  it("defaults every field on a minimal payload", () => {
    const s = sessionFromApi({ id: 7 });
    expect(s.userId).toBe("7");
    expect(s.roles).toEqual([]);
    expect(s.grants).toEqual([]);
    expect(s.isSuperuser).toBe(false);
  });

  it("carries the superuser and staff flags", () => {
    const s = sessionFromApi({ id: 1, is_superuser: true });
    expect(isAdmin({ ...s })).toBe(true);
  });

  /*
   * Categories decide which branch Sales Invoice runs against, so the shapes
   * the API has actually returned all have to land in the same place. The
   * serializer exposes both a single `category` FK and a `categories` m2m, and
   * an older cached payload can carry only the first.
   */
  it("reads categories from the m2m list", () => {
    const s = sessionFromApi({
      id: 1,
      categories: [{ id: 1, category: "Oil" }, { id: 2, category: "Beverages" }],
    });
    expect(s.categories).toEqual(["OIL", "BEVERAGES"]);
  });

  it("falls back to the single category when the list is absent", () => {
    const s = sessionFromApi({ id: 1, category: { id: 1, category: "oil" } });
    expect(s.categories).toEqual(["OIL"]);
  });

  it("does not repeat the primary category already in the list", () => {
    const s = sessionFromApi({
      id: 1,
      category: { id: 1, category: "Oil" },
      categories: [{ id: 1, category: "Oil" }],
    });
    expect(s.categories).toEqual(["OIL"]);
  });

  it("reads a category list of bare strings", () => {
    const s = sessionFromApi({ id: 1, categories: [" mart "] });
    expect(s.categories).toEqual(["MART"]);
  });

  it("has no categories on a payload that carries none", () => {
    // The state that means "assigned nothing", which the branch gate treats
    // differently from "assigned one".
    expect(sessionFromApi({ id: 1 }).categories).toEqual([]);
  });
});

describe("saveSession / loadSession", () => {
  it("round-trips a session", () => {
    const s = sessionFromApi({
      id: 3,
      username: "amit",
      role: "billing",
      extra_roles: [{ name: "admin" }],
      extra_pages: ["Sap_Sync"],
      category: { id: 1, category: "Oil" },
    });
    localStorage.setItem("access", "token");
    saveSession(s);

    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.username).toBe("amit");
    expect(loaded!.grants).toEqual(["Sap_Sync"]);
    expect(loaded!.categories).toEqual(["OIL"]);
    expect(isAdmin(loaded)).toBe(true);
    expect(can(loaded, "Sap_Sync")).toBe(true);
  });

  it("returns null without a token", () => {
    saveSession(sessionFromApi({ id: 3 }));
    expect(loadSession()).toBeNull();
  });

  it("returns null with a token but no user id", () => {
    // A half-written session — a tab closed mid-login, or a partial clear.
    // Treating it as signed-in would give a user with no identity, and every
    // permission check would then answer "no" for a reason nobody could see.
    localStorage.setItem("access", "token");
    expect(loadSession()).toBeNull();
  });

  it("treats corrupt grants as no grants, never as a wildcard", () => {
    localStorage.setItem("access", "token");
    localStorage.setItem("user_id", "1");
    localStorage.setItem("extra_pages", "{not json");
    const loaded = loadSession();
    expect(loaded!.grants).toEqual([]);
    expect(can(loaded, "Sap_Sync")).toBe(false);
  });

  it("treats corrupt roles as no roles", () => {
    localStorage.setItem("access", "token");
    localStorage.setItem("user_id", "1");
    localStorage.setItem("extra_roles", "null");
    expect(loadSession()!.roles).toEqual([]);
  });

  it("does not read a non-array JSON value as a grant list", () => {
    // `JSON.parse('"Sap_Sync"')` is a string, and `"Sap_Sync".includes(...)`
    // would be TRUE — a substring test standing in for membership. Storage is
    // user-editable, so this is reachable on purpose.
    localStorage.setItem("access", "token");
    localStorage.setItem("user_id", "1");
    localStorage.setItem("extra_pages", '"Sap_Sync_And_More"');
    expect(can(loadSession(), "Sap_Sync")).toBe(false);
  });
});

describe("clearSession", () => {
  it("removes the session", () => {
    localStorage.setItem("access", "token");
    saveSession(sessionFromApi({ id: 1, username: "amit" }));
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("leaves the device identity alone", () => {
    // One browser keeps ONE device id across logins. Clearing it would mint a
    // brand-new device row on every logout and fill the backend with phantoms.
    localStorage.setItem("device_id", "abc-123");
    localStorage.setItem("access", "token");
    saveSession(sessionFromApi({ id: 1 }));
    clearSession();
    expect(localStorage.getItem("device_id")).toBe("abc-123");
  });
});
