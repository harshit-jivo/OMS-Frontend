/**
 * Route access — the table, and the guarantee that it covers every route.
 *
 * The coverage test is the important one. A permission table is only worth
 * anything if it is complete, and the way it stops being complete is that
 * someone adds a route and does not think about access. Reading the real
 * `App.tsx` and failing on anything missing turns that from an invisible hole
 * into a failing test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Session } from "./permissions";
import {
  REDIRECT_ROUTES,
  ROUTE_ACCESS,
  accessFor,
  canAccess,
  canOpen,
} from "./routeAccess";

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
    ...overrides,
  };
}

const admin = session({ role: "admin", roles: ["admin"] });

/**
 * Every `path="…"` in the real router.
 *
 * Resolved from `process.cwd()`, not from `import.meta.url`. Under Vitest the
 * latter is an http:// URL rather than a file:// one, so `readFileSync` throws
 * "The URL must be of scheme file" — which is at least loud. The quieter risk
 * is a read that succeeds and matches nothing, which would make the coverage
 * test below pass while checking an empty list; hence the sanity check on the
 * count.
 */
/**
 * Read a source file with its comments stripped.
 *
 * Without this, anything inside a `{/* ... *\/}` block counts as live code.
 * Both scanners below were affected: a commented-out route counted as a real
 * route, so the access table was required to carry a rule for a page nobody
 * can reach — and a rule for an unreachable page is worse than a missing one,
 * because it reads as protection. `/Sales_Quotation` was exactly that.
 */
function codeOf(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function routesInApp(): string[] {
  return [...codeOf("src/App.tsx").matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

describe("coverage", () => {
  it("every route in App.tsx has an access rule", () => {
    // The whole point of the table. Without this, a route added later renders
    // for anyone who types the URL — which is the state this phase found the
    // app in, for 58 routes out of 59.
    const missing = routesInApp().filter(
      (path) => !REDIRECT_ROUTES.has(path) && !(path in ROUTE_ACCESS),
    );
    expect(missing).toEqual([]);
  });

  it("every rule in the table corresponds to a real route", () => {
    // The other direction: a rule for a path that no longer exists is dead
    // weight that reads as protection.
    const live = new Set(routesInApp());
    const stale = Object.keys(ROUTE_ACCESS).filter((p) => !live.has(p));
    expect(stale).toEqual([]);
  });

  it("finds a realistic number of routes, so the regex has not silently broken", () => {
    // A test that parses source can pass by matching nothing at all.
    expect(routesInApp().length).toBeGreaterThan(50);
  });
});

describe("the sidebar and the router agree", () => {
  function sidebarLinks(): string[] {
    // Comment-stripped for the same reason as the router scan: a link inside a
    // `{/* ... *\/}` block is not a link, and requiring a rule for where it
    // points keeps a dead entry alive in the table.
    return [...codeOf("src/components/Sidebar.tsx").matchAll(/to="(\/[^"]*)"/g)]
      .map((m) => m[1]);
  }

  it("every sidebar link points at a route with an access rule", () => {
    // The drift this phase exists to end. The sidebar used to carry its own
    // copy of every rule and the router carried none, so the two could not
    // even disagree — only one of them had an opinion. Now a link is shown
    // exactly when the route behind it would open, and a link to a path with
    // no rule would silently render an admin-only page for nobody.
    const unknown = [...new Set(sidebarLinks())].filter(
      (path) => !(path in ROUTE_ACCESS),
    );
    expect(unknown).toEqual([]);
  });

  it("finds a realistic number of sidebar links", () => {
    expect(sidebarLinks().length).toBeGreaterThan(30);
  });

  it("the sidebar decides visibility only through the table", () => {
    // `canSee`, `canSeeTracker` and the `role === "..."` comparisons that used
    // to gate links are gone. Their absence is what proves every gate moved:
    // TypeScript reported both helpers as unused once the last one was
    // converted.
    const source = readFileSync(
      resolve(process.cwd(), "src/components/Sidebar.tsx"),
      "utf-8",
    );
    expect(source).not.toContain("canSeeTracker(");
    expect(source).not.toMatch(/\{canSee\(/);
    // Link visibility must not compare a role string directly any more.
    expect(source).not.toMatch(/\{\(?userRole\?\.toLowerCase\(\) ===/);
  });
});

describe("canAccess", () => {
  it("lets anyone into a public route", () => {
    expect(canAccess(null, { public: true })).toBe(true);
  });

  it("refuses everything else without a session", () => {
    expect(canAccess(null, {})).toBe(false);
    expect(canAccess(null, { roles: ["billing"] })).toBe(false);
  });

  it("lets an admin into everything", () => {
    // Including rules that name a role the admin does not hold — otherwise a
    // `roles` entry would lock admins out of a page they administer.
    expect(canAccess(admin, { roles: ["legal"] })).toBe(true);
    expect(canAccess(admin, { permissions: ["Sap_Sync"] })).toBe(true);
    expect(canAccess(admin, { trackerPage: "Tracker_Admin" })).toBe(true);
  });

  it("admits on a matching permission", () => {
    const s = session({ grants: ["Sap_Sync"] });
    expect(canAccess(s, { permissions: ["Sap_Sync"] })).toBe(true);
  });

  it("admits on a matching role", () => {
    expect(canAccess(session({ role: "legal", roles: ["legal"] }), { roles: ["legal"] })).toBe(true);
  });

  it("admits on EITHER the permission or the role", () => {
    // The shape several sidebar entries used: `canSee("Einvoice") || billing`.
    const rule = { permissions: ["Einvoice"], roles: ["billing"] };
    expect(canAccess(session({ grants: ["Einvoice"], role: "x", roles: ["x"] }), rule)).toBe(true);
    expect(canAccess(session({ role: "billing", roles: ["billing"] }), rule)).toBe(true);
    expect(canAccess(session({ role: "x", roles: ["x"] }), rule)).toBe(false);
  });

  it("admits on an EXTRA role, not just the primary", () => {
    const s = session({ role: "clerk", roles: ["clerk", "legal"] });
    expect(canAccess(s, { roles: ["legal"] })).toBe(true);
  });

  it("denies a rule that names no way in", () => {
    // The first draft treated "no constraints" as any-signed-in-user, so an
    // unknown path — which resolved to `{}` — was open to everyone signed in.
    // Exactly what the fallback was supposed to prevent. Now both `anyUser`
    // and `adminOnly` are explicit and the fallback is denial, so a typo in a
    // key name locks a page rather than unlocking it.
    expect(canAccess(session(), {})).toBe(false);
    expect(canAccess(session(), { note: "a comment is not a grant" })).toBe(false);
  });

  it("admits any signed-in user only when that is stated", () => {
    expect(canAccess(session(), { anyUser: true })).toBe(true);
    expect(canAccess(null, { anyUser: true })).toBe(false);
  });

  it("adminOnly excludes a non-admin however many grants they hold", () => {
    const s = session({ grants: ["App_User", "Sap_Sync"], roles: ["billing"] });
    expect(canAccess(s, { adminOnly: true })).toBe(false);
    expect(canAccess(admin, { adminOnly: true })).toBe(true);
  });
});

describe("the table itself", () => {
  it("an unknown path is admin-only, not open", () => {
    // Fails closed. A route added without a decision should be noticed, not
    // inherit the old default of "everyone".
    expect(canAccess(session(), accessFor("/Not_A_Route"))).toBe(false);
    expect(canAccess(admin, accessFor("/Not_A_Route"))).toBe(true);
  });

  it("keeps the login screen and the device QR page public", () => {
    // The QR page is opened by scanning a sticker, by someone who may have no
    // account at all. Gating it would break the feature.
    expect(canOpen(null, "/")).toBe(true);
    expect(canOpen(null, "/hais/device/:code")).toBe(true);
  });

  it("keeps the Dashboard open to any signed-in user", () => {
    // It is the redirect target for every denied route. Gating it would put a
    // denied user into a redirect loop.
    expect(canOpen(session({ role: "nobody", roles: ["nobody"] }), "/Dashboard")).toBe(true);
    expect(canOpen(null, "/Dashboard")).toBe(false);
  });

  it("no guarded route has a URL parameter", () => {
    // `ProtectedPage` looks the rule up by `useLocation().pathname`, so a
    // parameterised path like `/order/:id` would never match its own table
    // entry — it would fall through to the admin-only default and lock the
    // page for everyone else. The one parameterised route in the app is
    // public and renders without the shell, and this keeps it that way.
    const parameterised = Object.entries(ROUTE_ACCESS)
      .filter(([path, rule]) => path.includes(":") && !rule.public)
      .map(([path]) => path);
    expect(parameterised).toEqual([]);
  });

  it("no route other than login and the QR page is public", () => {
    const publicPaths = Object.entries(ROUTE_ACCESS)
      .filter(([, rule]) => rule.public)
      .map(([path]) => path);
    expect(publicPaths.sort()).toEqual(["/", "/hais/device/:code"]);
  });

  it("every any-signed-in-user route explains itself", () => {
    // An unconstrained rule is indistinguishable from a forgotten one, so the
    // table requires a reason to be written down.
    const unexplained = Object.entries(ROUTE_ACCESS)
      .filter(([, r]) => r.anyUser && !r.note)
      .map(([path]) => path);
    expect(unexplained).toEqual([]);
  });
});

describe("behaviour preserved from the sidebar", () => {
  const cases: Array<[string, Partial<Session>, boolean]> = [
    ["/Label_Checker", { role: "legal", roles: ["legal"] }, true],
    ["/Label_Checker", { role: "billing", roles: ["billing"] }, false],
    ["/Sales_Invoice", { role: "billing", roles: ["billing"] }, true],
    ["/Sales_Invoice", { role: "manager", roles: ["manager"] }, false],
    ["/Add_Sales", { role: "manager", roles: ["manager"] }, true],
    ["/Auditor_orders", { role: "auditor", roles: ["auditor"] }, true],
    ["/Auditor_orders", { role: "billing", roles: ["billing"] }, false],
    ["/HAIS", { role: "hais", roles: ["hais"] }, true],
    ["/Distributor", { role: "distributor", roles: ["distributor"] }, true],
    ["/Mart_Approval", { role: "mart_approval", roles: ["mart_approval"] }, true],
    ["/Daily_Report", { role: "billing", roles: ["billing"] }, true],
    ["/Daily_Report", { role: "x", roles: ["x"], grants: ["Reports"] }, true],
    ["/Daily_Report", { role: "x", roles: ["x"] }, false],
  ];

  it.each(cases)("%s for %o -> %s", (path, who, expected) => {
    expect(canOpen(session(who), path)).toBe(expected);
  });

  it("accepts every spelling of the rate-approver role", () => {
    // The sidebar normalised `_` and `-` to spaces before comparing, which
    // accepted three spellings. They are listed explicitly in the table so the
    // set is visible rather than a side effect of a string transform.
    for (const role of ["rate approver", "rate_approver", "rateapprover", "approver"]) {
      expect(canOpen(session({ role, roles: [role] }), "/Rate_Approver_orders")).toBe(true);
    }
  });

  it("gives a tracker sub-role only its own pages", () => {
    const entry = session({ role: "tracker_entry", roles: ["tracker_entry"] });
    expect(canOpen(entry, "/Tracker_Entry")).toBe(true);
    expect(canOpen(entry, "/Tracker_Queue")).toBe(true);
    expect(canOpen(entry, "/Tracker_Alerts")).toBe(false);
    expect(canOpen(entry, "/Tracker_Admin")).toBe(false);
  });

  it("gives the AP sub-role only the AP page", () => {
    const ap = session({ role: "tracker_ap", roles: ["tracker_ap"] });
    expect(canOpen(ap, "/Ap_Invoice_Entry")).toBe(true);
    expect(canOpen(ap, "/Tracker_Queue")).toBe(false);
  });

  it("does not let a tracker sub-role into the wider app", () => {
    const t = session({ role: "tracker_user", roles: ["tracker_user"] });
    expect(canOpen(t, "/Sap_Sync")).toBe(false);
    expect(canOpen(t, "/App_User")).toBe(false);
    expect(canOpen(t, "/Sales_Invoice")).toBe(false);
  });
});
