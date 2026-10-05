import { describe, expect, it } from "vitest";

import { PARTY_ASSIGNABLE_ROLES, categoriesOf } from "./userParties";
import type { User } from "@/services/userService";

/**
 * Who may be picked in the "Assigned to" filter.
 *
 * The roster rules are the part worth pinning: a picker that offers a name
 * whose book is empty, or one whose parties this desk cannot act on anyway,
 * teaches people not to trust the filter. The hook itself needs React and the
 * session; these cover the two decisions it delegates.
 */
const user = (over: Partial<User> = {}): User =>
  ({
    id: 1,
    name: "Raminder",
    username: "raminder",
    role: "manager",
    role_name: "manager",
    ...over,
  }) as User;

describe("which roles are assigned parties", () => {
  it("is manager and billing, and nothing else", () => {
    // Auditors, rate approvers, legal and the tracker desks are never given a
    // party book, so offering them would be offering an empty selection.
    expect([...PARTY_ASSIGNABLE_ROLES]).toEqual(["manager", "billing"]);
  });
});

describe("the categories a user is mapped to", () => {
  it("reads the many-to-many when it has entries", () => {
    expect(
      categoriesOf(user({ categories: [{ id: 1, category: "OIL" }, { id: 2, category: "Mart" }] })),
    ).toEqual(["OIL", "MART"]);
  });

  it("falls back to the single category when the list is empty", () => {
    // The serializer exposes both; older accounts carry only the FK.
    expect(categoriesOf(user({ categories: [], category: { id: 1, category: "beverages" } }))).toEqual(
      ["BEVERAGES"],
    );
  });

  it("uppercases, so it can be compared with the session's own list", () => {
    // `auth/permissions.ts` stores the viewer's categories uppercased; a
    // case mismatch here would scope every user out and empty the picker.
    expect(categoriesOf(user({ category: { id: 1, category: "oil" } }))).toEqual(["OIL"]);
  });

  it("de-duplicates a category listed twice", () => {
    expect(
      categoriesOf(user({ categories: [{ id: 1, category: "OIL" }, { id: 2, category: "oil" }] })),
    ).toEqual(["OIL"]);
  });

  it("returns nothing for a user mapped to no category", () => {
    // Not an error: such accounts exist, and the hook keeps them rather than
    // hiding a real salesperson behind a data-entry gap.
    expect(categoriesOf(user())).toEqual([]);
    expect(categoriesOf(user({ category: null, categories: [] }))).toEqual([]);
  });

  it("ignores a blank category rather than emitting an empty string", () => {
    expect(categoriesOf(user({ categories: [{ id: 1, category: "  " }] }))).toEqual([]);
  });
});
