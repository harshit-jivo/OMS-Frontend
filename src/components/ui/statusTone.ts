/**
 * One status word, one colour — everywhere in the app.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE PROBLEM THIS FILE EXISTS FOR
 * ─────────────────────────────────────────────────────────────────────────
 * Before this, each page decided its own badge colours in its own stylesheet.
 * Read together, they disagree:
 *
 *     billed    GREEN in View_Orders, Order_Tracking, Billing_Order
 *               BLUE  in Daily_Report (`.dr-badge-billed`, #2563eb)
 *     pending   amber #d97706 · brown #a16207 · and GREY #64748b
 *     rejected  #991b1b · #dc2626 · #b91c1c
 *
 * The shades are drift. `billed` is not: green reads as "settled, done" and
 * blue reads as "informational" — and someone moving between Daily Report and
 * View Orders has no way to tell whether the change means anything. It does
 * not.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE RULE: TONE IS THE OUTCOME, THE LABEL IS THE DETAIL
 * ─────────────────────────────────────────────────────────────────────────
 * Several statuses deliberately share a tone. `approved` and `posted_to_sap`
 * are both green; `rejected` and `error` are both red. Invoice_Review drew
 * those four in four different hues — green, blue, red, orange.
 *
 * Collapsing them is the point rather than a compromise. A colour answers "is
 * this fine, waiting, or wrong?" at a glance; the WORD answers "why". Giving
 * every distinct cause its own hue means seven colours on one screen and none
 * of them meaning anything on any other screen, which is the state this file
 * was written to end.
 *
 * The exception is where the app itself draws a distinction people act on —
 * `pending_approval` (someone is dealing with it) versus `need_approval`
 * (nothing moves until you act). That is not two causes of one outcome; it is
 * two different asks.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A MAP AND NOT A UNION TYPE
 * ─────────────────────────────────────────────────────────────────────────
 * These strings arrive from the API — several different endpoints, in several
 * spellings ("CANCELLED" and "CANCELED" are both in the codebase today) — and
 * are rendered straight into a badge. A union type would be a promise this
 * layer cannot keep, and an unlisted status must degrade to a readable neutral
 * chip rather than throw at the top of a page. When plan item 3.2 generates
 * types from the backend schema, the keys here become checkable against them.
 */
import type { BadgeTone } from "./badge";

/**
 * Status -> tone. Keys are normalised (see `normalise`), so one entry covers
 * `PENDING`, `pending`, `Pending`, `pending_approval` and `Pending Approval`.
 *
 * Grouped by what the tone MEANS, because that is the decision being recorded.
 * Adding a status is a one-line change; changing a group is a design decision.
 */
const STATUS_TONE: Record<string, BadgeTone> = {
  // ---- Settled, and settled well -----------------------------------------
  approved: "ok",
  accepted: "ok",
  completed: "ok",
  billed: "ok", // Was blue in Daily_Report alone. Green is the majority and
                // the honest reading: the invoice is raised, the work is done.
  paid: "ok",
  active: "ok",
  online: "ok",
  success: "ok",
  confirmed: "ok",

  // ---- Waiting on someone ------------------------------------------------
  pending: "hold",
  pending_approval: "hold",
  submitted: "hold",
  in_progress: "hold",
  processing: "hold",
  partial: "hold",
  partially_paid: "hold",
  on_hold: "hold",
  idle: "hold",
  open: "hold",

  // ---- Waiting on YOU ----------------------------------------------------
  // Violet, not amber. View_Orders already draws this distinction on the same
  // screen as `pending_approval`, and it is the difference between "someone is
  // dealing with it" and "nothing moves until you act".
  need_approval: "note",
  needs_approval: "note",
  awaiting_action: "note",
  action_required: "note",
  // Reworked and back in the queue. Violet here matches `.ir-badge-edited`
  // exactly, and it sits next to `pending`'s amber in Invoice_Review's history
  // trail — the same "someone is on it" vs "this one is different" split the
  // two approval states above draw.
  edited: "note",

  // ---- Stopped, badly ----------------------------------------------------
  rejected: "bad",
  declined: "bad",
  failed: "bad",
  error: "bad",
  cancelled: "bad",
  canceled: "bad", // Both spellings ship today; neither is worth a migration.
  blocked: "bad",
  overdue: "bad",
  // Red, not grey. Arguably it is merely "not on" — but both places that show
  // it today draw it red (`StatusBadge` for a device, `.au-cell-badge-bad` for
  // a user), and a disabled login or a decommissioned device is something
  // someone should notice. Following the app rather than the dictionary.
  inactive: "bad",

  // ---- Handed to a downstream system -------------------------------------
  // Blue, not green, and that is a correction rather than a preference. Green
  // was tried first and produced a badge that disagreed with the timeline dot
  // beside it on the same row — `.ir-dot-posted_to_sap` is blue, because the
  // page reads "posted" as a system state rather than a verdict. `billed` stays
  // green because it means the invoice is raised and the work is done; "posted
  // to SAP" means a record was written somewhere else.
  posted: "info",
  posted_to_sap: "info",

  // ---- A branch off the main flow ----------------------------------------
  // A credit/claim note was raised against the invoice. `.ir-badge-cl_raised`
  // drew this teal, which is not in the shared palette; blue is the closest
  // reading — a state marker, not an outcome. The teal is genuinely lost, and
  // that is the trade: seven bespoke hues on one screen, or one palette the
  // whole app shares.
  cl_raised: "info",

  // ---- Nothing has happened yet ------------------------------------------
  draft: "neutral",
  offline: "neutral",
  unknown: "neutral",
  none: "neutral",
};

/**
 * Fold the spellings the API actually sends into one key: case, spaces,
 * hyphens and the trailing punctuation that shows up in a few labels.
 */
function normalise(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z_]/g, "");
}

/**
 * The tone for a status, or `neutral` for one nobody has classified.
 *
 * Neutral rather than a loud default on purpose: an unrecognised status is a
 * gap in this file, not a problem with the record being displayed, and
 * colouring it red would tell the reader something untrue about their data.
 * The label still renders, so the screen stays usable and the omission is
 * visible to whoever notices a grey chip that should not be grey.
 */
export function toneForStatus(status: string | null | undefined): BadgeTone {
  if (!status) return "neutral";
  return STATUS_TONE[normalise(status)] ?? "neutral";
}

/** Whether a status has a tone recorded. Used by the tests, and by nothing else. */
export function hasTone(status: string): boolean {
  return normalise(status) in STATUS_TONE;
}

export { STATUS_TONE };
