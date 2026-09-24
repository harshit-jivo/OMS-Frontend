/**
 * "Every party this salesperson sells to" — who may be picked, and what they carry.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE ROSTER IS NARROWED
 * ─────────────────────────────────────────────────────────────────────────
 * `/auth/users/list/` is the whole active roster: auditors, rate approvers,
 * legal, tracker desks, admins. Only two roles are ever assigned parties —
 * manager and billing — so the other names are not merely noise in the
 * picker, they are entries that select nothing when chosen. A filter whose
 * options can quietly yield zero teaches people not to trust it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AND WHY IT IS SCOPED TO THE VIEWER'S CATEGORY
 * ─────────────────────────────────────────────────────────────────────────
 * A user is mapped to one or more categories (OIL, BEVERAGES, MART), and so
 * is whoever is looking. A beverages desk has no business selecting an oil
 * salesperson's book: the parties it would pull are ones they cannot assign
 * products to anyway, because `party_product_assignments` is keyed by
 * category and the server skips a mismatched pair.
 *
 * A viewer with NO categories is unscoped rather than blocked. That is what
 * an admin looks like, and it is the same reading `auth/permissions.ts` gives
 * the field: empty means "not assigned any", which on this screen has to mean
 * "sees the lot" or an administrator could not use the filter at all.
 *
 * The remaining names are ordered by category and then by name, so the list
 * reads as grouped without inventing a grouping API the picker does not have.
 */
import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { useUserList } from "@/lib/authQueries";
import { userService } from "@/services/userService";
import type { User } from "@/services/userService";

/** The only roles that are ever assigned parties. */
export const PARTY_ASSIGNABLE_ROLES = ["manager", "billing"] as const;

const clean = (value: unknown) => String(value ?? "").trim();

const roleOf = (user: User) => clean(user.role_name || user.role).toLowerCase();

/** Every category a user is mapped to, uppercased. */
export const categoriesOf = (user: User): string[] => {
  // The field is `category` on the option, not `name` — `{ id, category }`.
  const many = Array.isArray(user.categories) ? user.categories : [];
  const names = many.map((entry) => clean(entry?.category).toUpperCase()).filter(Boolean);
  if (names.length > 0) return [...new Set(names)];
  const single = clean(user.category?.category).toUpperCase();
  return single ? [single] : [];
};

export type AssignableUser = {
  id: number;
  name: string;
  username: string;
  /** Joined for the picker's second line — "OIL", or "OIL · MART". */
  category: string;
};

/**
 * The users this viewer may pull a party book from.
 *
 * Sorted by category then name. A user mapped to no category at all is kept
 * and sorted last: they exist on live, and dropping them would hide a real
 * salesperson's book behind a data-entry gap nobody on this screen can fix.
 */
export function useAssignableUsers(): {
  users: AssignableUser[];
  isLoading: boolean;
} {
  const { users, isLoading } = useUserList();
  const { session } = useAuth();
  const viewerCategories = session?.categories ?? [];

  const filtered = useMemo(() => {
    const scope = new Set(viewerCategories.map((category) => clean(category).toUpperCase()));

    return (users as User[])
      .filter((user) => (PARTY_ASSIGNABLE_ROLES as readonly string[]).includes(roleOf(user)))
      .filter((user) => {
        if (scope.size === 0) return true;
        const mine = categoriesOf(user);
        // No category on the user is not a mismatch — it is unknown, and the
        // server will decide per party when the codes are actually used.
        if (mine.length === 0) return true;
        return mine.some((category) => scope.has(category));
      })
      .map((user) => ({
        id: user.id,
        name: clean(user.name) || clean(user.username),
        username: clean(user.username),
        category: categoriesOf(user).join(" · "),
      }))
      .sort(
        (a, b) =>
          // Blank category last, so the grouping reads cleanly.
          (a.category ? 0 : 1) - (b.category ? 0 : 1) ||
          a.category.localeCompare(b.category) ||
          a.name.localeCompare(b.name),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, viewerCategories.join("|")]);

  return { users: filtered, isLoading };
}

/**
 * The card codes of every party assigned to one user.
 *
 * `category=all` matters: the same card_code can be assigned under OIL and
 * BEVERAGES, and the endpoint's default scoping returns only one of them — so
 * without it a user's book comes back short and the selection silently misses
 * parties they really do sell to.
 */
export function useUserPartyCodes() {
  return useMutation({
    mutationFn: async (userId: number) => {
      const response = await userService.getUserParties(userId, "all");
      const parties = (response?.data?.parties ?? []) as { card_code: string }[];
      return [...new Set(parties.map((party) => clean(party.card_code)).filter(Boolean))];
    },
  });
}
