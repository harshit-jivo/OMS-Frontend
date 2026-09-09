/**
 * Action permissions — the rules, and the guarantee that they stay in one place.
 *
 * As with `routeAccess.test.ts`, the structural tests at the bottom are the
 * ones that earn their keep: the failure mode for this table is not a wrong
 * rule, it is a call site that quietly stops asking it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ACTIONS, actionAccess, canDo } from "./actions";
import type { Session } from "./permissions";

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

const admin = session({ role: "admin", roles: ["admin"] });

describe("invoice review — two desks, opposite halves", () => {
  const approver = session({ role: "factory_approver", roles: ["factory_approver"] });
  const billing = session({ role: "billing", roles: ["billing"] });

  it("only the factory approver approves", () => {
    expect(canDo(approver, "invoice.approve")).toBe(true);
    expect(canDo(billing, "invoice.approve")).toBe(false);
  });

  it("only billing posts to SAP", () => {
    expect(canDo(billing, "invoice.postToSap")).toBe(true);
    expect(canDo(approver, "invoice.postToSap")).toBe(false);
  });

  it("an admin does both", () => {
    // Preserved from the old code, where `!isFactoryApprover` happened to give
    // an admin the SAP half. The approve half is new to them and follows from
    // the app-wide rule that an administrator passes every gate.
    expect(canDo(admin, "invoice.approve")).toBe(true);
    expect(canDo(admin, "invoice.postToSap")).toBe(true);
  });

  it("honours a desk held through extra_roles", () => {
    // The whole reason this moved. The old check read the primary role alone,
    // so a user given `factory_approver` as an extra role saw a review screen
    // with no Approve button on it.
    const both = session({ role: "billing", roles: ["billing", "factory_approver"] });
    expect(canDo(both, "invoice.approve")).toBe(true);
    expect(canDo(both, "invoice.postToSap")).toBe(true);
  });

  it("gives a user with neither desk neither action", () => {
    const other = session({ role: "auditor", roles: ["auditor"] });
    expect(canDo(other, "invoice.approve")).toBe(false);
    expect(canDo(other, "invoice.postToSap")).toBe(false);
  });
});

describe("mart.manageSap mirrors the server, including where the server is odd", () => {
  it("admits the mart approver and the admin role", () => {
    expect(canDo(session({ role: "mart_approval", roles: ["mart_approval"] }), "mart.manageSap")).toBe(true);
    expect(canDo(admin, "mart.manageSap")).toBe(true);
  });

  it("admits a staff account, which the server accepts", () => {
    expect(canDo(session({ isStaff: true, role: "x", roles: ["x"] }), "mart.manageSap")).toBe(true);
  });

  it("does NOT admit a superuser who is not staff", () => {
    // Deliberate, and the reason this entry uses `match`. The server's
    // `_is_mart_approver` checks `is_staff` and the primary role, and never
    // calls `core.permissions.is_admin` — so admitting a bare superuser here
    // would render an Edit button that 403s on click. When the backend is
    // fixed this test should be inverted, not deleted.
    const superuser = session({ isSuperuser: true, isStaff: false, role: "x", roles: ["x"] });
    expect(canDo(superuser, "mart.manageSap")).toBe(false);
  });

  it("refuses everyone else", () => {
    expect(canDo(session({ role: "distributor", roles: ["distributor"] }), "mart.manageSap")).toBe(false);
  });
});

describe("approvals.configure", () => {
  it("admits an admin or a Payments_Dashboard holder", () => {
    expect(canDo(admin, "approvals.configure")).toBe(true);
    expect(canDo(session({ grants: ["Payments_Dashboard"] }), "approvals.configure")).toBe(true);
  });

  it("admits an admin held through extra_roles, which the old check missed", () => {
    expect(canDo(session({ role: "billing", roles: ["billing", "admin"] }), "approvals.configure")).toBe(true);
  });

  it("admits a superuser, which the old check also missed", () => {
    // Here the server DOES use `core.permissions.is_admin`, so this widening
    // matches it rather than outrunning it.
    expect(canDo(session({ isSuperuser: true, role: "x", roles: ["x"] }), "approvals.configure")).toBe(true);
  });

  it("refuses a user with an unrelated grant", () => {
    expect(canDo(session({ grants: ["Reports"] }), "approvals.configure")).toBe(false);
  });
});

describe("failing closed", () => {
  it("refuses everything without a session", () => {
    for (const name of Object.keys(ACTIONS)) {
      expect(canDo(null, name)).toBe(false);
    }
  });

  it("treats an unknown action as admin-only", () => {
    expect(canDo(session(), "invoice.deleteEverything")).toBe(false);
    expect(canDo(admin, "invoice.deleteEverything")).toBe(true);
  });

  it("a rule naming no way in grants no way in", () => {
    expect(actionAccess("nope").adminOnly).toBe(true);
  });
});

describe("the table documents its own enforcement", () => {
  it("every action records how the server enforces it", () => {
    // `satisfies` already makes a missing `server` a compile error; this
    // catches the softer failure of writing an empty string to satisfy it.
    const silent = Object.entries(ACTIONS)
      .filter(([, rule]) => !rule.server || rule.server.trim().length < 10)
      .map(([name]) => name);
    expect(silent).toEqual([]);
  });

  it("every `match` escape hatch explains itself", () => {
    // A predicate is opaque where the declarative fields are not, so the note
    // is the only thing that says why it exists.
    const unexplained = Object.entries(ACTIONS)
      .filter(([, rule]) => "match" in rule && !("note" in rule))
      .map(([name]) => name);
    expect(unexplained).toEqual([]);
  });

  it("flags the actions the server does not actually enforce", () => {
    // Not a rule, a REPORT — this test exists to keep the hole visible and to
    // fail loudly when it is fixed, so the comments in InvoiceReview.tsx get
    // updated at the same time. If this list shrinks, that is good news and
    // this expectation should shrink with it.
    const unenforced = Object.entries(ACTIONS)
      .filter(([, rule]) => rule.server.startsWith("NOT ENFORCED"))
      .map(([name]) => name)
      .sort();
    expect(unenforced).toEqual(["invoice.approve", "invoice.postToSap"]);
  });
});

describe("no call site decides permissions on its own any more", () => {
  const PAGES = [
    "src/pages/InvoiceReview.tsx",
    "src/pages/Distributor/Order_Tracking.tsx",
    "src/pages/Payments/useApprovalAdmin.ts",
    "src/pages/Ap_Invoice_Entry.tsx",
    "src/pages/Invoice_Report.tsx",
    "src/pages/Inventory_Report.tsx",
    "src/pages/SO_Invoice_Report.tsx",
  ];

  /** Source with `//` and `/* *\/` comments stripped, so the commented-out
   *  originals kept for reference do not trip these checks. */
  function code(path: string): string {
    return readFileSync(resolve(process.cwd(), path), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  it.each(PAGES)("%s reads no role or grant out of localStorage", (path) => {
    // The pattern this phase existed to end. Every one of these files decided
    // an action or a redirect from a raw storage string that ignored
    // `extra_roles`, `is_superuser` and `is_staff` — and could answer before
    // the profile had loaded.
    const source = code(path);
    expect(source).not.toMatch(/localStorage\.getItem\(\s*["'](role|extra_pages|extra_roles|is_superuser|is_staff)["']\s*\)/);
  });

  it.each(PAGES)("%s no longer runs its own route redirect", (path) => {
    // Route access belongs to `ProtectedPage` alone. A second guard here would
    // be free to disagree with the table — and the ones removed did, bouncing
    // administrators off pages the sidebar showed them.
    expect(code(path)).not.toMatch(/<Navigate to="\/(Home|Dashboard|Sales_Dashboard)"/);
  });

  it("the comment-stripper does not defeat the test above", () => {
    // A stripper that returned "" would make every assertion pass.
    expect(code("src/pages/InvoiceReview.tsx")).toContain("useAction(");
    expect(code("src/pages/InvoiceReview.tsx").length).toBeGreaterThan(1000);
  });
});
