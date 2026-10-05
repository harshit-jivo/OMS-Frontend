import { describe, expect, it } from "vitest";

import { canDo } from "./actions";
import { approvableWarehouses, canApproveWarehouse } from "./invoiceWarehouses";
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

const kp = session({ username: "kp", name: "Kp Sandhu" });
const preshit = session({ username: "preshit", name: "Preshit", role: "Billing Admin" });
const unlisted = session({ username: "someone_else" });

describe("approvableWarehouses", () => {
  it("restricts KP to DL-MP", () => {
    expect(approvableWarehouses(kp)).toEqual(["DL-MP"]);
  });

  it("restricts Preshit to BH-PS", () => {
    expect(approvableWarehouses(preshit)).toEqual(["BH-PS"]);
  });

  it("returns null — not an empty list — for anyone unlisted", () => {
    // The distinction matters: [] would refuse every warehouse and quietly
    // lock out every existing approver the moment this table shipped.
    expect(approvableWarehouses(unlisted)).toBeNull();
  });
});

describe("canApproveWarehouse", () => {
  it("lets KP approve a DL-MP invoice", () => {
    expect(canApproveWarehouse(kp, "DL-MP")).toBe(true);
  });

  it("refuses KP every other warehouse", () => {
    for (const code of ["BH-PS", "BH-FG", "BH-BT", "GP-FG"]) {
      expect(canApproveWarehouse(kp, code)).toBe(false);
    }
  });

  it("lets Preshit approve BH-PS and nothing else", () => {
    expect(canApproveWarehouse(preshit, "BH-PS")).toBe(true);
    expect(canApproveWarehouse(preshit, "DL-MP")).toBe(false);
    expect(canApproveWarehouse(preshit, "BH-FG")).toBe(false);
  });

  it("leaves an unlisted user unrestricted", () => {
    for (const code of ["DL-MP", "BH-PS", "BH-FG", "A-NEW-WAREHOUSE"]) {
      expect(canApproveWarehouse(unlisted, code)).toBe(true);
    }
  });

  it("compares codes case- and whitespace-insensitively", () => {
    expect(canApproveWarehouse(kp, " dl-mp ")).toBe(true);
    expect(canApproveWarehouse(preshit, "bh-ps")).toBe(true);
  });

  it("refuses a restricted user an invoice with no warehouse on it", () => {
    // Cannot be shown to be theirs, so it is not theirs to approve.
    for (const blank of ["", "   ", null, undefined]) {
      expect(canApproveWarehouse(kp, blank)).toBe(false);
    }
  });

  it("still lets an unrestricted user approve one with no warehouse", () => {
    expect(canApproveWarehouse(unlisted, "")).toBe(true);
  });

  it("treats a missing session as unrestricted, leaving the role gate to decide", () => {
    // `canApproveReject` is what refuses a signed-out user; this function only
    // ever narrows an allowed approver and must not be the thing that answers.
    expect(canApproveWarehouse(null, "BH-FG")).toBe(true);
  });
});

/**
 * The two real accounts, with the session each one actually resolves to in
 * production as of this change: their live role, plus the
 * `invoices.review.decide` grant added to `extra_pages`.
 *
 * Both halves have to hold for a button to appear, and neither is enough on
 * its own — which is the whole point of the pair, so they are asserted
 * together here rather than only in isolation above.
 */
describe("the real accounts, end to end", () => {
  const showsApprove = (s: Session, warehouse: string) =>
    canDo(s, "invoice.approve") && canApproveWarehouse(s, warehouse);

  const kpLive = session({
    username: "kp",
    name: "Kp Sandhu",
    role: "billing",
    roles: ["billing"],
    grants: ["Party_Product_Assignment", "invoices.review.decide"],
  });

  const preshitLive = session({
    username: "preshit",
    name: "Preshit",
    role: "billing admin",
    roles: ["billing admin"],
    grants: ["invoices.review.decide"],
  });

  it("KP approves DL-MP and nothing else", () => {
    expect(showsApprove(kpLive, "DL-MP")).toBe(true);
    expect(showsApprove(kpLive, "BH-PS")).toBe(false);
    expect(showsApprove(kpLive, "BH-FG")).toBe(false);
  });

  it("Preshit approves BH-PS and nothing else", () => {
    expect(showsApprove(preshitLive, "BH-PS")).toBe(true);
    expect(showsApprove(preshitLive, "DL-MP")).toBe(false);
    expect(showsApprove(preshitLive, "BH-FG")).toBe(false);
  });

  it("the grant alone is what admits them — the role does not", () => {
    // Both roles fail the `factory_approver` arm of `invoice.approve`. Drop
    // the grant and neither account can approve anywhere, which is exactly the
    // state they were in before this change.
    const kpNoGrant = { ...kpLive, grants: ["Party_Product_Assignment"] };
    const preshitNoGrant = { ...preshitLive, grants: [] };
    expect(showsApprove(kpNoGrant, "DL-MP")).toBe(false);
    expect(showsApprove(preshitNoGrant, "BH-PS")).toBe(false);
  });

  it("an unrestricted approver is untouched by the warehouse table", () => {
    // The regression that would hurt most: this change must not narrow anyone
    // who could already approve.
    const other = session({
      username: "some_approver",
      grants: ["invoices.review.decide"],
    });
    for (const code of ["DL-MP", "BH-PS", "BH-FG", "GP-FG"]) {
      expect(showsApprove(other, code)).toBe(true);
    }
  });
});
