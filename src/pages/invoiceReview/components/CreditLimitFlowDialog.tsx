/**
 * The credit-limit JSAP approval flow modal (`clFlowRecord`).
 *
 * The second of the two timelines that justified `ui/timeline` — this one
 * shows where a credit-limit request has reached in JSAP's approval chain, so
 * the reader's question is "who is it sitting with", which is why the
 * assignee is the first note under every stage.
 */
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { toneForStatus } from "@/components/ui/statusTone";
import { Timeline, TimelineHead, TimelineItem, TimelineNote } from "@/components/ui/timeline";

import { toNumber } from "../../SalesInvoice/salesInvoice.utils";
import { creditLimitStageState, formatDateTime } from "../helpers";
import type { UseInvoiceReviewResult } from "../useInvoiceReview";

export default function CreditLimitFlowDialog({ view }: { view: UseInvoiceReviewResult }) {
  const { clFlowRecord, setClFlowRecord, clFlowStages, clFlowLoading, clFlowError, clFlowSummary } =
    view;

  return (
    <Dialog
      open={Boolean(clFlowRecord)}
      onOpenChange={(next) => {
        if (!next) setClFlowRecord(null);
      }}
    >
      {clFlowRecord && (
        <DialogContent title="Credit limit approval" size="md">
          <DialogHeader>
            <div className="min-w-0">
              <p className="m-0 mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
                Credit limit flow
              </p>
              <DialogTitle>{clFlowRecord.party_name || "—"}</DialogTitle>
              <DialogDescription>
                SO #{clFlowRecord.so_number || clFlowRecord.id}
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody>
            {clFlowLoading ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <span className="sr-only">Loading approval flow</span>
                {[0, 1, 2].map((row) => (
                  <Skeleton key={row} className="h-14 w-full" />
                ))}
              </div>
            ) : clFlowError ? (
              <Notice tone="bad">{clFlowError}</Notice>
            ) : (
              <>
                {/* The one-line answer, above the detail: approved, rejected,
                    or still waiting. Someone who only needs that should not
                    have to read the whole chain to infer it. */}
                {clFlowSummary && (
                  <div className="mb-4">
                    <Notice tone={toneForNotice(clFlowSummary.tone)}>
                      {clFlowSummary.label}
                    </Notice>
                  </div>
                )}
                <Timeline>
                  {clFlowStages.map((stage, index) => {
                    const state = creditLimitStageState(stage.actionStatus);
                    return (
                      <TimelineItem
                        key={stage.stageId ?? index}
                        tone={toneForStatus(state.tone)}
                        last={index === clFlowStages.length - 1}
                      >
                        <TimelineHead>
                          <span>
                            {toNumber(stage.priority) ? `${toNumber(stage.priority)}. ` : ""}
                            {stage.stageName || "—"}
                          </span>
                          <Badge tone={toneForStatus(state.tone)}>{state.label}</Badge>
                        </TimelineHead>
                        <TimelineNote>Assigned to: {stage.assignedTo || "—"}</TimelineNote>
                        {stage.actionDate && (
                          <TimelineNote>Actioned: {formatDateTime(stage.actionDate)}</TimelineNote>
                        )}
                        {stage.description && <TimelineNote>{stage.description}</TimelineNote>}
                      </TimelineItem>
                    );
                  })}
                </Timeline>
              </>
            )}
          </DialogBody>
        </DialogContent>
      )}
    </Dialog>
  );
}

/**
 * `Notice` speaks bad/hold/info; the stage state speaks the status vocabulary.
 * Anything that is not a refusal or a wait is information, not success — a
 * green banner on "approved" would compete with the timeline's own badges.
 */
function toneForNotice(tone: string): "bad" | "hold" | "info" {
  const badge = toneForStatus(tone);
  if (badge === "bad") return "bad";
  if (badge === "hold") return "hold";
  return "info";
}
