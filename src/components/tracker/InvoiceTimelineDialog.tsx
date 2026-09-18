/**
 * The stage-by-stage timeline of one tracker invoice — where it has been,
 * what each desk decided, and how long it sat there.
 *
 * Three pages (Alerts, Invoices, Queue) each drew this list by hand with
 * `.trk-timeline`; this is the one copy, on `ui/timeline`.
 *
 *
 * It renders LEGS, not raw rows: a hold or a pending rejection is an
 * annotation on a visit rather than a stop of its own, and "here now" is
 * asserted from the invoice's current stage rather than inferred from a
 * null `exited_at`. See `./timeline` for why both matter.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/page";
import { Timeline, TimelineHead, TimelineItem, TimelineNote } from "@/components/ui/timeline";
import { cn } from "@/lib/utils";
import type { Invoice, StageEvent } from "@/services/trackerService";

import { decisionTone, fmtDT, money } from "./format";
import { isNote, railFor, SKIPPED, toLegs, toneFor } from "./timeline";

function Decision({ ev }: { ev: StageEvent }) {
  if (!ev.stage_status) return null;
  if (ev.stage_status === SKIPPED) {
    return (
      <Badge outlined tone="neutral" title="Passed without a decision at this desk">
        skipped
      </Badge>
    );
  }
  return (
    <Badge tone={decisionTone(ev.stage_status)} outlined>
      {ev.stage_status.replace(/_/g, " ")}
      {ev.hold_type ? ` · ${ev.hold_type}` : ""}
    </Badge>
  );
}

export default function InvoiceTimelineDialog({
  invoice,
  onClose,
}: {
  invoice: Invoice | null;
  onClose: () => void;
}) {
  const legs = toLegs(invoice?.events ?? []);
  // The step AHEAD, drawn uncoloured so the eye can tell ground covered from
  // ground still to cover. Absent at the terminal desk and on a detour, where
  // there is no fixed next step to promise — see `services.next_stage`.
  const upcoming = invoice?.next_stage_name ?? null;

  return (
    <Dialog open={Boolean(invoice)} onOpenChange={(next) => !next && onClose()}>
      {invoice && (
        <DialogContent title="Invoice timeline">
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <DialogTitle>{invoice.invoice_number}</DialogTitle>
              <DialogDescription>{invoice.party_name}</DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody>
            {legs.length === 0 ? (
              <EmptyState title="No stage events yet" className="py-8" />
            ) : (
              <Timeline className="ml-1.5">
                {legs.map(({ visit, notes }, index) => {
                  // Asserted from the invoice, not inferred from a null column:
                  // a note keeps `exited_at` NULL for good and is not an
                  // occupancy, and only the LAST leg can be the current one.
                  const here =
                    !isNote(visit) &&
                    visit.exited_at === null &&
                    visit.stage_code === invoice.current_stage_code &&
                    index === legs.length - 1;
                  const skipped = visit.stage_status === SKIPPED;

                  return (
                    <TimelineItem
                      key={visit.id}
                      tone={toneFor(legs[index], { here })}
                      rail={railFor(legs[index], legs[index + 1])}
                      last={index === legs.length - 1 && !upcoming}
                    >
                      <TimelineHead className={cn(skipped && "opacity-70")}>
                        {visit.stage_name}
                        <Decision ev={visit} />
                        {visit.amount ? (
                          <Badge tone="hold" outlined>
                            ₹{money(visit.amount)}
                          </Badge>
                        ) : null}
                        {visit.receiving_note === "LATE" && (
                          <Badge tone="hold" outlined>
                            Late (after 6 PM)
                          </Badge>
                        )}
                        {here && (
                          <Badge tone="info" outlined>
                            here now
                          </Badge>
                        )}
                        <time>{fmtDT(visit.entered_at)}</time>
                      </TimelineHead>

                      <TimelineNote>
                        {isNote(visit)
                          ? "Note"
                          : skipped
                            ? "Passed — no decision recorded at this desk"
                            : here
                              ? "Waiting here"
                              : visit.exited_at
                                ? `Left ${fmtDT(visit.exited_at)}`
                                : "Not closed"}
                        {visit.days_spent !== null && !skipped
                          ? ` · ${visit.days_spent} day(s)`
                          : ""}
                        {visit.acted_by_name ? ` · ${visit.acted_by_name}` : ""}
                      </TimelineNote>

                      {visit.remarks && (
                        <TimelineNote className="italic text-body">
                          “{visit.remarks}”
                        </TimelineNote>
                      )}

                      {/* Holds and pending rejections recorded DURING this visit —
                          shown under it rather than as separate stops, which is
                          what made a single desk appear five times. */}
                      {notes.map((note) => (
                        <TimelineNote key={note.id} className="mt-1 pl-3">
                          <span className="inline-flex items-center gap-1.5">
                            <Decision ev={note} />
                            {note.acted_by_name ? `${note.acted_by_name} · ` : ""}
                            {fmtDT(note.entered_at)}
                          </span>
                          {note.remarks && (
                            <span className="ml-1 italic text-body">“{note.remarks}”</span>
                          )}
                        </TimelineNote>
                      ))}
                    </TimelineItem>
                  );
                })}

                {/* Not a stage event — nothing has happened here yet. Hollow
                    dot, no timestamp, and the rail into it is the plain grey
                    one, so it cannot be mistaken for a desk the invoice has
                    already been through. */}
                {upcoming && (
                  <TimelineItem tone="neutral" last>
                    <TimelineHead className="opacity-60">
                      {upcoming}
                      <Badge outlined tone="neutral">
                        next
                      </Badge>
                    </TimelineHead>
                    <TimelineNote>Not reached yet</TimelineNote>
                  </TimelineItem>
                )}
              </Timeline>
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
