/**
 * Permission logic — the first tests this frontend has had.
 *
 * These deserve to exist because the rules here decide what a user is shown,
 * they are pure functions (so they can be tested exactly), and the version they
 * replace was wrong in a way nobody could see: a user granted `admin` through
 * `extra_roles` was treated as having no roles at all.
 *
 * The weighting is deliberate — most of what follows is about failing CLOSED.
 * A permission check that wrongly says "no" produces a support ticket. One that
 * wrongly says "yes" renders an admin screen to whoever asked for it.
 */
import { describe, expect, it } from "vitest";

import {
  can,
  canAll,
  canAny,
  hasRole,
  isAdmin,
  normalizeRole,
  roleNames,
  type Session,
} from "./permissions";

function session(overrides: Partial<Session> = {}): Session {
  return {
    userId: "1",
    username: "u",
    name: "U",
    role: "billing",
    roleDisplay: "Billing",
    roles: ["billing"],
    grants: [],
    isSuperuser: false,
    isStaff: false,
    companyId: "",
    companyName: "",
    mainGroupId: "",
    mainGroupName: "",
    categories: [],
    ...overrides,
  };
}

describe("normalizeRole", () => {
  it("lowercases and trims", () => {
    expect(normalizeRole("  Admin ")).toBe("admin");
  });

  it("turns every empty-ish value into an empty string", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(normalizeRole(value)).toBe("");
    }
  });
});

describe("roleNames", () => {
  it("includes the primary role", () => {
    expect(roleNames(session({ role: "billing", roles: [] }))).toEqual(
      new Set(["billing"]),
    );
  });

  it("includes extra roles", () => {
    // The bug this whole module exists for. The server has always said a user's
    // roles are the primary FK PLUS extra_roles; every check here read the
    // primary alone, so an extra-role grant was invisible to the entire UI.
    const s = session({ role: "billing", roles: ["billing", "admin"] });
    expect(roleNames(s).has("admin")).toBe(true);
  });

  it("drops empty entries rather than storing a blank role", () => {
    const s = session({ role: "billing", roles: ["billing", "", "  "] });
    expect(roleNames(s)).toEqual(new Set(["billing"]));
  });

  it("returns nothing for no session", () => {
    expect(roleNames(null).size).toBe(0);
    expect(roleNames(undefined).size).toBe(0);
  });
});

describe("hasRole", () => {
  it("matches a primary or an extra role", () => {
    const s = session({ role: "billing", roles: ["billing", "legal"] });
    expect(hasRole(s, "billing")).toBe(true);
    expect(hasRole(s, "legal")).toBe(true);
    expect(hasRole(s, "hais")).toBe(false);
  });

  it("matches any of several names", () => {
    const s = session({ role: "legal", roles: ["legal"] });
    expect(hasRole(s, "hais", "legal")).toBe(true);
  });

  it("is case insensitive on both sides", () => {
    const s = session({ role: "Legal", roles: ["LEGAL"] });
    expect(hasRole(s, "legal")).toBe(true);
  });

  it("is false with no session", () => {
    expect(hasRole(null, "admin")).toBe(false);
  });
});

describe("isAdmin", () => {
  it("accepts the admin role", () => {
    expect(isAdmin(session({ role: "admin", roles: ["admin"] }))).toBe(true);
  });

  it("accepts admin held as an EXTRA role", () => {
    expect(
      isAdmin(session({ role: "billing", roles: ["billing", "admin"] })),
    ).toBe(true);
  });

  it("accepts a superuser", () => {
    // Honoured by the server and by nothing here, so a superuser with no
    // explicit admin role saw a stripped-down UI over an API that would have
    // allowed them everything.
    expect(isAdmin(session({ isSuperuser: true }))).toBe(true);
  });

  it("accepts staff", () => {
    expect(isAdmin(session({ isStaff: true }))).toBe(true);
  });

  it("rejects an ordinary user", () => {
    expect(isAdmin(session())).toBe(false);
  });

  it("rejects no session", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it("is not fooled by a role that merely contains 'admin'", () => {
    // `tracker_admin` is a tracker sub-role with no OMS admin rights. A
    // substring test would hand it the entire application.
    for (const role of ["tracker_admin", "administrator", "subadmin"]) {
      expect(isAdmin(session({ role, roles: [role] }))).toBe(false);
    }
  });
});

describe("can", () => {
  it("allows a granted key", () => {
    expect(can(session({ grants: ["Sap_Sync"] }), "Sap_Sync")).toBe(true);
  });

  it("denies an ungranted key", () => {
    expect(can(session({ grants: ["Sap_Sync"] }), "App_User")).toBe(false);
  });

  it("lets an admin through implicitly", () => {
    // Matches `granted_keys()` on the server. If this diverged, an admin would
    // see a sidebar missing pages the API would happily serve them.
    expect(can(session({ role: "admin", roles: ["admin"] }), "anything")).toBe(
      true,
    );
  });

  it("denies with no session", () => {
    expect(can(null, "Sap_Sync")).toBe(false);
  });

  it("denies when grants are missing entirely", () => {
    // The shape that actually occurred: storage written by an older build, or
    // a payload that predates the field.
    const broken = { ...session(), grants: undefined } as unknown as Session;
    expect(can(broken, "Sap_Sync")).toBe(false);
  });

  it("is exact, not a prefix match", () => {
    // `Payments_Approve` must not be implied by holding `Payments_Create`.
    const s = session({ grants: ["Payments_Create"] });
    expect(can(s, "Payments_Approve")).toBe(false);
  });

  it("is case sensitive, matching the server's stored keys", () => {
    // The keys are identifiers the server stores verbatim, not user input.
    // Loosening this here would let the UI show something the API refuses.
    expect(can(session({ grants: ["Sap_Sync"] }), "sap_sync")).toBe(false);
  });
});

describe("canAll / canAny", () => {
  const s = session({ grants: ["A", "B"] });

  it("canAll requires every key", () => {
    expect(canAll(s, ["A", "B"])).toBe(true);
    expect(canAll(s, ["A", "C"])).toBe(false);
  });

  it("canAny requires one", () => {
    expect(canAny(s, ["C", "B"])).toBe(true);
    expect(canAny(s, ["C", "D"])).toBe(false);
  });

  it("an empty list is vacuously true for canAll and false for canAny", () => {
    // Stated because both are load-bearing at a call site that computes its
    // key list: `canAll(s, [])` guarding a page would show it to everyone, so
    // callers must not pass an empty list by accident.
    expect(canAll(s, [])).toBe(true);
    expect(canAny(s, [])).toBe(false);
  });
});
