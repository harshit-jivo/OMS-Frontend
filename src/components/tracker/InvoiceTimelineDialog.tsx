/**
 * The stage-by-stage timeline of one tracker invoice — where it has been,
 * what each desk decided, and how long it sat there.
 *
 * Three pages (Alerts, Invoices, Queue) each drew this list by hand with
 * `.trk-timeline`; this is the one copy, on `ui/timeline`.
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
import type { Invoice } from "@/services/trackerService";

import { decisionTone, fmtDT, money } from "./format";

export default function InvoiceTimelineDialog({
  invoice,
  onClose,
}: {
  invoice: Invoice | null;
  onClose: () => void;
}) {
  const events = invoice?.events ?? [];
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
            {events.length === 0 ? (
              <EmptyState title="No stage events yet" className="py-8" />
            ) : (
              <Timeline className="ml-1.5">
                {events.map((ev, index) => (
                  <TimelineItem
                    key={ev.id}
                    tone={ev.exited_at ? decisionTone(ev.stage_status) : "info"}
                    last={index === events.length - 1}
                  >
                    <TimelineHead>
                      {ev.stage_name}
                      {ev.stage_status && (
                        <Badge tone={decisionTone(ev.stage_status)} outlined>
                          {ev.stage_status.replace(/_/g, " ")}
                          {ev.hold_type ? ` · ${ev.hold_type}` : ""}
                        </Badge>
                      )}
                      {ev.amount ? (
                        <Badge tone="hold" outlined>
                          ₹{money(ev.amount)}
                        </Badge>
                      ) : null}
                      {ev.receiving_note === "LATE" && (
                        <Badge tone="hold" outlined>
                          Late (after 6 PM)
                        </Badge>
                      )}
                      <time>{fmtDT(ev.entered_at)}</time>
                    </TimelineHead>
                    <TimelineNote>
                      {ev.event_type}
                      {ev.exited_at ? ` · out ${fmtDT(ev.exited_at)}` : " · here now"}
                      {ev.days_spent ? ` · ${ev.days_spent} days` : ""}
                      {ev.acted_by_name ? ` · ${ev.acted_by_name}` : ""}
                    </TimelineNote>
                    {ev.remarks && (
                      <TimelineNote className="italic text-body">“{ev.remarks}”</TimelineNote>
                    )}
                  </TimelineItem>
                ))}
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
