/**
 * Which warehouses a user may approve invoices for.
 *
 * The counterpart to `actions.ts` for a rule that action gates cannot express.
 * `canDo(session, name)` answers from the session alone — "may this person
 * approve invoices at all" — and that is the wrong shape here: the answer
 * depends on the INVOICE, not just the user. KP approves DL-MP bills and no
 * others; Preshit approves BH-PS bills and no others. Same person, same
 * screen, different answer per row.
 *
 * NOT A SECURITY BOUNDARY — and here that warning has the same teeth it has in
 * `actions.ts`, for the same reason. `invoice.views.InvoicelogStatusUpdateView`
 * carries `permission_classes = [AllowAny]`, so the endpoint behind these
 * buttons is reachable by any caller at all, authenticated or not. Anyone who
 * can send a PATCH can approve any invoice in any warehouse regardless of what
 * this file says. This gate hides the buttons; it does not stop the request.
 * Enforcing it for real is a permission class plus a warehouse check on that
 * view — deliberately out of scope here, but the hole is real and this comment
 * stays until it is closed.
 *
 * Keyed by username because that is what the server puts on the session and
 * what the OMS user list is administered by. A username absent from the table
 * is UNRESTRICTED, which keeps every existing approver working exactly as
 * before — this table only ever narrows, and only for the names written in it.
 */
import type { Session } from "./permissions";

/**
 * username (lowercase) -> the warehouse codes that user may approve.
 *
 * Codes are the `warehouse` values carried on an InvoiceLog — 'DL-MP',
 * 'BH-PS', 'BH-FG' and so on — compared case-insensitively.
 */
export const INVOICE_APPROVAL_WAREHOUSES: Record<string, string[]> = {
  kp: ["DL-MP"],
  preshit: ["BH-PS"],
};

/** Normalised for comparison: warehouse codes vary in case across screens. */
const normalize = (value: string | null | undefined) =>
  String(value ?? "").trim().toUpperCase();

/**
 * The warehouses this session may approve, or `null` for "no restriction".
 *
 * `null` rather than "every code" on purpose: the full set of warehouses is
 * not known to the client, and an unrestricted user must stay unrestricted
 * when a new warehouse appears in SAP that nobody has listed here.
 */
export function approvableWarehouses(
  session: Session | null | undefined,
): string[] | null {
  if (!session) return null;
  const restriction = INVOICE_APPROVAL_WAREHOUSES[normalize(session.username).toLowerCase()];
  return restriction ? restriction.map(normalize) : null;
}

/**
 * May this session approve an invoice sitting in this warehouse?
 *
 * An unrestricted user passes for every warehouse, including a blank one. A
 * restricted user is refused a blank warehouse: an invoice with no warehouse
 * on it cannot be shown to be theirs, and the safe reading of "KP approves
 * DL-MP" is that anything not demonstrably DL-MP is not KP's to approve.
 */
export function canApproveWarehouse(
  session: Session | null | undefined,
  warehouse: string | null | undefined,
): boolean {
  const allowed = approvableWarehouses(session);
  if (allowed === null) return true;
  const code = normalize(warehouse);
  if (!code) return false;
  return allowed.includes(code);
}
