/**
 * Who may open which page — one table, read by both the router and the sidebar.
 *
 * Before this, the answer lived in two places that had no way to agree: the
 * sidebar decided which LINKS to show, and the router decided nothing at all.
 * Fifty-eight of fifty-nine routes rendered for anyone who typed the URL.
 *
 * Hiding a link is not access control. This table is the client-side half of
 * the check; the server enforces the same rules again on every endpoint behind
 * every page, because anything the browser decides can be edited by whoever
 * owns the browser. What this buys is an honest UI — a user is redirected
 * instead of landing on a screen that renders and then fills with 403s.
 *
 * How the entries were derived
 * ----------------------------
 * Every gate below was read off the sidebar's existing conditions, not
 * invented. This phase is meant to make the router agree with what the sidebar
 * already believed, so a route that was reachable from a link stays reachable
 * for exactly the same people. Where the sidebar had no opinion, that is
 * called out in a comment rather than guessed quietly.
 */
import { normalizeRole, type Session } from "./permissions";
import { can, isAdmin } from "./permissions";
import { trackerPagesFor } from "../config/pageAccess";

export interface RouteAccess {
  /** No session required at all. */
  public?: boolean;
  /** Any signed-in user. Must be stated, never inferred — see below. */
  anyUser?: boolean;
  /** Administrators only. */
  adminOnly?: boolean;
  /** `extra_pages` grant keys — holding ANY one admits. Admins pass always. */
  permissions?: string[];
  /** Role names — holding ANY one admits. */
  roles?: string[];
  /** A tracker page key, resolved through `config/pageAccess`. */
  trackerPage?: string;
  /** Why this rule is what it is. Required for `anyUser`. */
  note?: string;
}

/*
 * `anyUser` and `adminOnly` are both explicit on purpose.
 *
 * The first draft used a bare `{}` for admin-only and let "no constraints"
 * fall through to any-signed-in-user. That is one object meaning two opposite
 * things depending on how it was reached, and the tests caught it immediately:
 * an unknown path resolved to `{}` and was therefore open to every signed-in
 * user, which is the exact failure the fallback existed to prevent.
 *
 * Access rules are not the place for a default that reads two ways.
 */

/**
 * `rate approver` is stored several ways.
 *
 * The sidebar normalised the role by replacing `_` and `-` with spaces before
 * comparing, which quietly accepted three spellings. Rather than reproduce
 * that transformation — which would also silently accept spellings nobody
 * intended — the accepted values are listed. If a fourth appears in the
 * database, it belongs here, visibly.
 */
const RATE_APPROVER_ROLES = [
  "rate approver",
  "rate_approver",
  "rate-approver",
  "rateapprover",
  "approver",
];

const BILLING_OR_MANAGER = ["billing", "manager"];

/** Reports share one gate: the billing role, or the `Reports` grant. */
const REPORTS: RouteAccess = { permissions: ["Reports"], roles: ["billing"] };

/**
 * Path -> who may open it.
 *
 * A path MISSING from this table is treated as admin-only by `accessFor`.
 * That is deliberate: a new route added without a decision about access should
 * fail closed and be noticed, not inherit the old default of "everyone".
 */
export const ROUTE_ACCESS: Record<string, RouteAccess> = {
  // --- Open to the world --------------------------------------------------
  "/": { public: true, note: "The login screen." },
  "/hais/device/:code": {
    public: true,
    note:
      "Opened by scanning a device QR sticker, by someone who may not have an " +
      "account. Renders without the sidebar. The endpoint behind it returns " +
      "only the asset's public fields.",
  },

  // --- Any signed-in user -------------------------------------------------
  "/Dashboard": {
    anyUser: true,
    note:
      "The landing page and the redirect target for every denied route, so " +
      "gating it would strand users in a redirect loop. Its widgets are " +
      "individually scoped server-side.",
  },
  "/Profile": { anyUser: true, note: "Your own account." },

  // --- Administration -----------------------------------------------------
  "/App_User": { permissions: ["App_User"] },
  "/Page_Permissions": { adminOnly: true },
  "/Role_Permissions": { adminOnly: true },
  "/UI_Labels": { adminOnly: true },
  // "/Sales_Quotation": { adminOnly: true },
  //
  // Commented out with the route itself (App.tsx, DISABLED 2026-08-27 — the
  // quotation flow is closed and its backend routes are commented out too).
  //
  // It survived here because the coverage test scanned App.tsx for `path="…"`
  // WITHOUT stripping comments, so a route inside a `{/* … */}` block counted
  // as live and the table was required to carry a rule for it. A rule for a
  // page nobody can reach is worse than a missing one — it reads as protection.
  // The test strips comments now, which is what surfaced this.
  "/Device_Management": { permissions: ["Device_Management"] },
  "/Sap_Sync": { permissions: ["Sap_Sync"] },
  "/Party_Assignment": { permissions: ["Party_Assignment"] },
  "/Party_Product_Assignment": { permissions: ["Party_Product_Assignment"] },
  "/Order_Flow_Settings": { permissions: ["Order_Flow_Settings"] },

  // --- Schemes ------------------------------------------------------------
  "/Add_Scheme": { permissions: ["Add_Scheme"] },
  "/Scheme_Manager": { permissions: ["Scheme_Manager"] },
  "/Combo_Mapping": { permissions: ["Combo_Mapping"], roles: ["billing"] },

  // --- Stock --------------------------------------------------------------
  "/Product_Stock": { permissions: ["Product_Stock"] },
  "/Order_Stock_Check": {
    permissions: ["Product_Stock"],
    note:
      "A five-line alias that renders Product_Stock, so it carries the same " +
      "gate. Nothing links to it.",
  },

  // --- Compliance ---------------------------------------------------------
  "/Einvoice": { permissions: ["Einvoice"], roles: ["billing"] },
  "/Ewaybill": { permissions: ["Ewaybill"] },

  // --- Modules with their own role ----------------------------------------
  "/HAIS": { permissions: ["HAIS"], roles: ["hais"] },
  "/Distributor": { permissions: ["Distributor"], roles: ["distributor"] },
  "/Distributor_Order_Tracking": {
    permissions: ["Distributor"],
    roles: ["distributor"],
  },
  "/Mart_Approval": { permissions: ["Mart_Approval"], roles: ["mart_approval"] },
  "/Payments_Dashboard": { permissions: ["Payments_Dashboard"] },

  // --- Document tracker ---------------------------------------------------
  // Gated centrally by role, mirroring tracker/permissions.py.
  "/Tracker_Entry": { trackerPage: "Tracker_Entry" },
  "/Tracker_Queue": { trackerPage: "Tracker_Queue" },
  "/Tracker_Invoices": { trackerPage: "Tracker_Invoices" },
  "/Tracker_Alerts": { trackerPage: "Tracker_Alerts" },
  "/Tracker_Reports": { trackerPage: "Tracker_Reports" },
  "/Tracker_Admin": { trackerPage: "Tracker_Admin" },
  "/Ap_Invoice_Entry": { trackerPage: "Ap_Invoice_Entry" },

  // --- Legal --------------------------------------------------------------
  // One `Legal` grant covers the whole module (it is one desk); the role is
  // the transitional fallback, mirroring the backend's HasKeyOrRole gate on
  // every legal/ endpoint (legal/views.py). Compliance_Rules edits what the
  // checker enforces, so it is the same grant rather than a tighter one:
  // splitting them would mean a reviewer who cannot fix the rule they just
  // watched misfire.
  "/Label_Checker": { permissions: ["Legal"], roles: ["legal"] },
  "/Nutrition_Manager": { permissions: ["Legal"], roles: ["legal"] },
  "/Compliance_Rules": { permissions: ["Legal"], roles: ["legal"] },
  "/Label_History": { permissions: ["Legal"], roles: ["legal"] },

  // --- Sales --------------------------------------------------------------
  // Phase 4: these carry BOTH a registry permission key and the legacy role
  // list, mirroring the backend's transitional HasKeyOrRole gates on the
  // order endpoints. A user granted `orders.sales.create` (via role bundle or
  // the Permissions page) reaches Add_Sales without holding billing/manager;
  // the role halves go when the backend's fallback goes — same cleanup
  // contract, both sides together.
  "/Add_Sales": { permissions: ["orders.sales.create"], roles: BILLING_OR_MANAGER },
  "/FOC": { permissions: ["orders.sales.create"], roles: BILLING_OR_MANAGER },
  "/View_Orders": { permissions: ["orders.sales.view"], roles: BILLING_OR_MANAGER },
  "/Drafts": {
    permissions: ["orders.sales.create"],
    roles: BILLING_OR_MANAGER,
    note:
      "The sidebar link is commented out, but Add_Sales still navigates here " +
      "after saving a draft, so it must stay reachable for the same people.",
  },
  "/Sales_Invoice": { permissions: ["invoices.sales.create"], roles: ["billing"] },
  "/Sales_Invoice/SKU_Images": {
    permissions: ["invoices.sales.create"],
    roles: ["billing"],
    note: "Opened from the Sales Invoice screen, so it carries the same gate.",
  },
  "/Invoice_Review": {
    permissions: ["invoices.review.decide"],
    roles: ["billing", "factory_approver"],
  },

  // --- Order workflow, by desk -------------------------------------------
  "/Auditor_orders": { roles: ["auditor"] },
  "/Auditor_status_tracking": { roles: ["auditor"] },
  "/Billing_orders": { roles: ["billing"] },
  "/Billing_status_tracking": { roles: ["billing"] },
  "/Rate_Approver_orders": { roles: RATE_APPROVER_ROLES },
  "/Rate_Approver_status_tracking": { roles: RATE_APPROVER_ROLES },
  "/Order_Tracking": { roles: BILLING_OR_MANAGER },
  "/Invoice_Report": { permissions: ["invoices.report.view"], roles: ["billing"] },

  // --- Reports ------------------------------------------------------------
  "/Daily_Report": REPORTS,
  "/PersonWise_Report": REPORTS,
  "/Sales_Report": REPORTS,
  "/StateWise_Report": REPORTS,
  "/Inventory_Report": REPORTS,
  "/SO_Invoice_Report": REPORTS,

  // --- No sidebar link, and nothing navigates here ------------------------
  // Both are real pages (956 and 412 lines) that are currently reachable ONLY
  // by typing the URL. The sidebar has no opinion about them, so there was no
  // existing intent to preserve and admin-only is the conservative reading.
  // Flagged rather than guessed: if these are meant to be used, they need a
  // link and a considered gate.
  "/Staff": { adminOnly: true },
  "/Staff_Rate_Assignment": { adminOnly: true },
};

/**
 * Routes that are pure redirects. They carry no gate of their own — whatever
 * they redirect TO is guarded, and gating both would just redirect twice.
 */
export const REDIRECT_ROUTES = new Set(["/Approval_Management", "*"]);

/** The access rule for a path. Unknown paths are admin-only — see the table. */
export function accessFor(path: string): RouteAccess {
  return ROUTE_ACCESS[path] ?? { adminOnly: true };
}

/**
 * Can this session open this route?
 *
 * Order matters: `public` first (no session needed), then admin (who passes
 * everything), then the specific grants. An admin must not be blocked by a
 * `roles` entry they happen not to hold.
 *
 * Ends in `false`. A rule that names no way in grants no way in — so a typo in
 * a key name denies rather than admits.
 */
export function canAccess(
  session: Session | null | undefined,
  access: RouteAccess,
): boolean {
  if (access.public) return true;
  if (!session) return false;
  if (isAdmin(session)) return true;
  if (access.adminOnly) return false;
  if (access.anyUser) return true;

  if (access.trackerPage) {
    // Registry fold: a tracker page can now also be granted as a permission
    // key (role bundle or personal grant) — the server unions both sources in
    // `tracker_pages_for`, and this mirrors it. The tracker page keys ARE
    // registry keys, so `can()` checks the same string.
    return (
      trackerPagesFor(session.role, false).has(access.trackerPage) ||
      can(session, access.trackerPage)
    );
  }

  if ((access.permissions ?? []).some((key) => can(session, key))) return true;

  const held = new Set(
    [session.role, ...(session.roles ?? [])].map(normalizeRole).filter(Boolean),
  );
  if ((access.roles ?? []).some((role) => held.has(normalizeRole(role)))) {
    return true;
  }

  return false;
}

/** Convenience for the sidebar: can this session open this path? */
export function canOpen(
  session: Session | null | undefined,
  path: string,
): boolean {
  return canAccess(session, accessFor(path));
}
