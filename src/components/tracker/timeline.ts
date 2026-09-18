/**
 * Turning an invoice's raw stage events into the legs a timeline can draw.
 *
 * Kept out of `InvoiceTimelineDialog` because that file may only export
 * components — `react-refresh/only-export-components`, the same rule
 * `ui/dialog.tsx` documents.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT JUST `events.map(...)`
 * ─────────────────────────────────────────────────────────────────────────
 * A `StageEvent` is not always a visit. A NOTE is an ANNOTATION on one — a
 * hold, or a rejection awaiting its written reason — and it does two things a
 * naive render gets wrong:
 *
 *   * it copies `entered_at` from the visit it annotates, so the two TIE and
 *     sorting by `entered_at` alone leaves their order to the database (371
 *     groups of rows tie in production);
 *   * it keeps `exited_at` NULL for good, by design, because the SAP/JSAP
 *     two-step rejection reads exactly that to mean "awaiting the reason". 129
 *     such rows are open right now, 116 of them at a desk their invoice left
 *     weeks ago — so "no exited_at" cannot mean "the invoice is here".
 *
 * The zero-length SKIPPED visits an automatic progression writes tie too: they
 * all carry the same instant.
 */
import type { BadgeTone } from "@/components/ui/badge";
import type { TimelineRail } from "@/components/ui/timeline";
import type { StageEvent } from "@/services/trackerService";

import { decisionTone } from "./format";

/** Written by `fast_track` / `auto_advance_to_payment` on a desk that was passed. */
export const SKIPPED = "SKIPPED";

export const isNote = (ev: StageEvent) => ev.event_type === "NOTE";

/**
 * A total order over the events.
 *
 * `id` settles ties by the order the rows were actually written, so the history
 * cannot reorder itself between two openings of the same dialog.
 */
export const inOrder = (a: StageEvent, b: StageEvent) =>
  a.entered_at === b.entered_at
    ? a.id - b.id
    : a.entered_at < b.entered_at
      ? -1
      : 1;

export type Leg = { visit: StageEvent; notes: StageEvent[] };

/**
 * One leg per VISIT, with the notes recorded during it attached.
 *
 * A note belongs to the visit at the same stage carrying the same `entered_at`
 * — precisely how `apply_action` writes it. A note with no such visit (older
 * data, or a visit since re-pointed) becomes its own leg rather than being
 * dropped: it is still a thing that happened to this invoice.
 */
export function toLegs(events: StageEvent[]): Leg[] {
  const sorted = [...events].sort(inOrder);
  const legs: Leg[] = [];
  const byKey = new Map<string, Leg>();

  for (const ev of sorted.filter((e) => !isNote(e))) {
    const leg: Leg = { visit: ev, notes: [] };
    legs.push(leg);
    byKey.set(`${ev.stage}|${ev.entered_at}`, leg);
  }
  for (const note of sorted.filter(isNote)) {
    const leg = byKey.get(`${note.stage}|${note.entered_at}`);
    if (leg) leg.notes.push(note);
    else legs.push({ visit: note, notes: [] });
  }
  return legs.sort((x, y) => inOrder(x.visit, y.visit));
}


/**
 * The rail below a leg: how the invoice LEFT this desk.
 *
 * The dot already says what the desk decided. The rail says what happened to
 * the document afterwards, which is what a reader scanning the history is
 * actually looking for — did it walk the route, was it pushed past a desk, did
 * it go backwards.
 *
 * "Backwards" is read from `event_type`, not by comparing stage positions:
 * `apply_action` closes a visit as RETURN precisely when it sends the invoice
 * to an earlier desk, so the event already carries the fact. Comparing stage
 * order would need a field the payload does not have, and would misread the
 * Transport Approval detour, which leaves and re-enters Pre-Audit by design.
 */
export function railFor(leg: Leg, next?: Leg): TimelineRail {
  if (!next) return "idle"; // nothing below it to colour
  if (leg.visit.stage_status === SKIPPED) return "skipped";
  if (leg.visit.event_type === "RETURN") return "back";
  return "covered";
}


/**
 * The node colour for a leg.
 *
 * A FILLED BLUE node means "the invoice has been through here" — so the
 * covered part of the journey reads as one continuous blue trail rather than a
 * row of grey rings the eye has to decode. That is the whole point of a
 * timeline: where has this got to.
 *
 * Only two things override it, because only two things want the reader to stop
 * and look: a hold and anything adverse (return, rejection, debit). A plain
 * OK/APPROVED does NOT — it is ordinary progress, and the green badge beside it
 * already says so. Colouring every decision would leave the trail a mix of
 * green, blue and grey with no through-line.
 *
 * A skipped desk stays neutral: the invoice passed it without anyone seeing it,
 * so filling it in would overstate what happened.
 */
export function toneFor(leg: Leg, opts: { here: boolean }): BadgeTone {
  if (opts.here) return "info";
  if (isNote(leg.visit)) return "note";
  if (leg.visit.stage_status === SKIPPED) return "neutral";
  const decided = decisionTone(leg.visit.stage_status);
  return decided === "hold" || decided === "bad" ? decided : "info";
}
