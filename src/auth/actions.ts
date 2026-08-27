/**
 * Who may take which ACTION — the counterpart to `routeAccess.ts`.
 *
 * A route rule answers "can you open this screen". These answer "can you press
 * this button once you are on it", which is a different question with a
 * different answer: every desk that reviews an invoice can open Invoice Review,
 * but only one of them approves and only the other one posts to SAP.
 *
 * Before this, each answer was computed inline at its call site from a raw
 * `localStorage.getItem("role")` string — the same pattern that made the route
 * guards wrong, for the same three reasons:
 *
 *   1. it reads the PRIMARY role only, so a role held through `extra_roles` is
 *      invisible (see the header of `permissions.ts`);
 *   2. it ignores `is_superuser` / `is_staff`, which the server honours;
 *   3. it reads storage directly rather than the resolved session, so it
 *      answers before the profile has loaded and cannot tell "no" from
 *      "not yet".
 *
 * NOT A SECURITY BOUNDARY — and here that warning has teeth. See `server:`.
 */
import { useAuth } from "./useAuth";
import { can, isAdmin, normalizeRole, roleNames, type Session } from "./permissions";

export interface ActionAccess {
  /** Any signed-in user. Must be stated, never inferred. */
  anyUser?: boolean;
  /** Administrators only. */
  adminOnly?: boolean;
  /** `extra_pages` grant keys — holding ANY one admits. Admins pass always. */
  permissions?: string[];
  /** Role names — holding ANY one admits, primary or extra. */
  roles?: string[];
  /**
   * Escape hatch for a server rule that does NOT follow the standard admin
   * definition. Every use of this is a backend inconsistency worth fixing, and
   * carrying it here rather than hiding it in a call site is the point: it is
   * one grep away instead of invisible.
   */
  match?: (session: Session) => boolean;
  /**
   * How the SERVER enforces this action. Required, with no exception.
   *
   * A UI gate with no server rule behind it is not access control, it is a
   * hidden button — and the way you discover that is by being made to write
   * down what enforces it. Writing "NOT ENFORCED" here is allowed; leaving it
   * out is not. The one action below that carries that value is a real hole,
   * found by filling this field in.
   */
  server: string;
  note?: string;
}

/**
 * Action name -> who may take it.
 *
 * Names are `subject.verb`, not permission keys: the point is that a call site
 * says what it is guarding, and this file decides who passes. An unknown name
 * is admin-only, like an unknown route.
 */
export const ACTIONS = {
  /**
   * Approve or reject a submitted sales invoice on the Invoice Review screen.
   */
  "invoice.approve": {
    roles: ["factory_approver"],
    server: "NOT ENFORCED — invoice.views.InvoicelogStatusUpdateView carries "
      + "only the project-wide IsAuthenticated. Any signed-in user can PATCH "
      + "/api/invoice/<id>/update-status/ to APPROVED. This gate is the ONLY "
      + "thing standing in front of it, which makes it the one place in the "
      + "app where the client-side check is load-bearing. It should not be: "
      + "the fix is a permission class on that view, not a better button.",
  },

  /**
   * Post an approved invoice to SAP, repost a failed one, raise a credit-limit
   * request.
   */
  "invoice.postToSap": {
    roles: ["billing"],
    server: "NOT ENFORCED as a role — the SAP posting endpoints require "
      + "authentication only. Same caveat as invoice.approve.",
    note:
      "Was `!isFactoryApprover`. Stated positively because the route table "
      + "already limits /Invoice_Review to billing, factory_approver and "
      + "admins, so 'not the approver' and 'billing or admin' describe the "
      + "same set — and a positive rule does not silently admit a fourth role "
      + "if one is ever added to that route.",
  },

  /**
   * Edit a failed distributor order or resend it to SAP, from the Mart queue.
   */
  "mart.manageSap": {
    match: (session) =>
      session.isStaff || roleNames(session).has("mart_approval")
      || roleNames(session).has("admin"),
    server: "orders/views/mart.py:_is_mart_approver — is_staff, OR the "
      + "PRIMARY role in {mart_approval, admin}.",
    note:
      "Uses `match` because the server rule predates core.permissions.is_admin "
      + "and does not use it: it accepts is_staff but NOT is_superuser, and "
      + "reads the primary role only. Mirrored faithfully rather than "
      + "'corrected' here, because widening the client past the server just "
      + "renders a button that 403s. The real fix is one line of backend — "
      + "have _is_mart_approver call core.permissions.is_admin, as "
      + "approvals/permissions.py already does — after which this entry "
      + "becomes a plain `roles: ['mart_approval']`.",
  },

  /**
   * Edit approval workflows, levels, approvers and the payments masters — the
   * four configuration tabs on the Payments Dashboard.
   */
  "approvals.configure": {
    permissions: ["Payments_Dashboard"],
    server: "approvals/permissions.py:IsApprovalAdmin — core.permissions."
      + "is_admin, OR the Payments_Dashboard key. Mirrored exactly.",
    note:
      "Payments_Dashboard confers WRITE access to approval routing, not just "
      + "the analytics view its name suggests; the server docstring says so "
      + "explicitly. Treated as a privileged grant on both sides.",
  },
// `satisfies` rather than a type annotation: it checks every entry against
// `ActionAccess` — so a missing `server` is a compile error — while keeping the
// literal key set, which is what makes `ActionName` a real union instead of
// `string`. No `as const`, which would make each `roles` array readonly and
// stop it satisfying `string[]`.
} satisfies Record<string, ActionAccess>;

export type ActionName = keyof typeof ACTIONS;

/**
 * The rule for an action. Unknown names are admin-only, matching `accessFor`.
 *
 * `ActionName` makes an unknown name a compile error, so this fallback exists
 * for the runtime edge — a name arriving from data — rather than for typos.
 */
export function actionAccess(name: string): ActionAccess {
  return (ACTIONS as Record<string, ActionAccess>)[name] ?? { adminOnly: true, server: "unknown action" };
}

/**
 * May this session take this action?
 *
 * Same order as `canAccess`: admins first (so a `roles` entry cannot lock an
 * administrator out of something they administer), then the specific rules,
 * then denial. `match` runs INSTEAD of the admin shortcut, because the only
 * reason to write a `match` is that the standard admin rule does not apply.
 */
export function canDo(
  session: Session | null | undefined,
  name: string,
): boolean {
  const access = actionAccess(name);
  if (!session) return false;

  if (access.match) return access.match(session);

  if (isAdmin(session)) return true;
  if (access.adminOnly) return false;
  if (access.anyUser) return true;

  if ((access.permissions ?? []).some((key) => can(session, key))) return true;

  const held = roleNames(session);
  return (access.roles ?? []).some((role) => held.has(normalizeRole(role)));
}

/**
 * `const canApprove = useAction("invoice.approve")`
 *
 * Returns false while the session is still loading, which is correct for
 * showing a button: a control that appears a beat late is a smaller problem
 * than one that appears for someone who may not be allowed to press it.
 */
export function useAction(name: ActionName): boolean {
  return canDo(useAuth().session, name);
}
