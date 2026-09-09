/**
 * The invoice history / revision timeline modal (`historyFor`).
 *
 * It was a `variant="bare"` dialog wearing `.ir-modal` — its own width,
 * padding, header and close button, none of which the primitive knew about.
 * It is a real `panel` dialog now, so the scroll behaviour, the escape
 * handling and the close affordance are the ones every other dialog has, and
 * the timeline is `ui/timeline` rather than the second of two hand-rolled
 * copies.
 */
import { Fragment } from "react";
import { HiOutlineInbox } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { toneForStatus } from "@/components/ui/statusTone";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Timeline,
  TimelineHead,
  TimelineItem,
  TimelineNote,
  TimelineSeparator,
} from "@/components/ui/timeline";
import { formatDateTime, hasRef, normalizeStatus, statusLabel } from "../helpers";
import type { UseInvoiceReviewResult } from "../useInvoiceReview";

export default function InvoiceHistoryDialog({ view }: { view: UseInvoiceReviewResult }) {
  const { historyFor, setHistoryFor, historyRecords, historyLoading, historyError, historyVersions } =
    view;

  return (
    <Dialog
      open={Boolean(historyFor)}
      onOpenChange={(next) => {
        if (!next) setHistoryFor(null);
      }}
    >
      {historyFor && (
        <DialogContent title="Invoice history" size="md">
          <DialogHeader>
            <div className="min-w-0">
              <p className="m-0 mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
                Status history
              </p>
              <DialogTitle>SO #{historyFor.so_number || "—"}</DialogTitle>
              <DialogDescription>{historyFor.party_name || "—"}</DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody>
            {historyError ? <Notice tone="bad">{historyError}</Notice> : null}

            {historyLoading ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <span className="sr-only">Loading history</span>
                {[0, 1, 2].map((row) => (
                  <Skeleton key={row} className="h-14 w-full" />
                ))}
              </div>
            ) : historyRecords.length === 0 && !historyError ? (
              <EmptyState
                icon={HiOutlineInbox}
                title="No history available"
                hint="Nothing has been recorded against this entry yet."
              />
            ) : (
              <Timeline>
                {historyRecords.map((entry, index) => {
                  const entryStatus = normalizeStatus(entry.status);
                  // The timeline spans every version in the revision chain, so
                  // mark where one log ends and its rework begins.
                  const logId = entry.invoice_log;
                  const startsVersion =
                    index === 0 || historyRecords[index - 1].invoice_log !== logId;
                  const versionNumber = historyVersions.get(String(logId ?? "")) ?? 1;
                  return (
                    <Fragment key={entry.id ?? index}>
                      {startsVersion && historyVersions.size > 1 && (
                        <TimelineSeparator>
                          Version {versionNumber} of {historyVersions.size}
                          {hasRef(logId) ? ` · invoice #${logId}` : ""}
                        </TimelineSeparator>
                      )}
                      <TimelineItem
                        tone={toneForStatus(entryStatus)}
                        last={index === historyRecords.length - 1}
                      >
                        <TimelineHead>
                          <Badge tone={toneForStatus(entryStatus)}>
                            {statusLabel(entryStatus)}
                          </Badge>
                          <time dateTime={entry.created_at}>
                            {formatDateTime(entry.created_at)}
                          </time>
                        </TimelineHead>
                        {entry.created_by_name && (
                          <TimelineNote>By: {entry.created_by_name}</TimelineNote>
                        )}
                        {entry.rejection_reason && (
                          <TimelineNote>Reason: {entry.rejection_reason}</TimelineNote>
                        )}
                        {entry.error_message && (
                          <TimelineNote tone="bad">{entry.error_message}</TimelineNote>
                        )}
                      </TimelineItem>
                    </Fragment>
                  );
                })}
              </Timeline>
            )}
          </DialogBody>
        </DialogContent>
      )}
    </Dialog>
  );
}
