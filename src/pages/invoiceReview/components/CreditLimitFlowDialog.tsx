/**
 * The credit-limit JSAP approval flow modal (`clFlowRecord`) — Phase 4 split.
 * Markup moved verbatim out of `InvoiceReview.tsx`.
 */
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toneForStatus } from "@/components/ui/statusTone";
import { HiXMark } from "react-icons/hi2";

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
        if (!next) (() => setClFlowRecord(null))();
      }}
    >
      {clFlowRecord && (
        <DialogContent
          title="Credit limit approval"
          variant="bare"
          size="auto"
          showClose={false}
          className="ir-modal ir-cl-flow-modal"
        >
          <header className="ir-modal-head">
            <div>
              <span className="ir-eyebrow">Credit Limit Flow</span>
              <h2>{clFlowRecord.party_name || "—"}</h2>
              <p>SO #{clFlowRecord.so_number || clFlowRecord.id}</p>
            </div>
            <button
              type="button"
              className="ir-icon-btn"
              aria-label="Close credit limit flow"
              onClick={() => setClFlowRecord(null)}
            >
              <HiXMark aria-hidden="true" />
            </button>
          </header>

          <div className="ir-modal-body">
            {clFlowLoading ? (
              <div className="ir-empty" role="status" aria-live="polite">
                Loading approval flow…
              </div>
            ) : clFlowError ? (
              <div className="ir-banner ir-banner-error">{clFlowError}</div>
            ) : (
              <>
                {clFlowSummary && (
                  <div className={`ir-cl-summary ir-cl-summary-${clFlowSummary.tone}`}>
                    {clFlowSummary.label}
                  </div>
                )}
                <ol className="ir-timeline">
                  {clFlowStages.map((stage, index) => {
                    const state = creditLimitStageState(stage.actionStatus);
                    return (
                      <li className="ir-timeline-item" key={stage.stageId ?? index}>
                        <span
                          className={`ir-timeline-dot ir-dot-${state.tone}`}
                          aria-hidden="true"
                        />
                        <div className="ir-timeline-body">
                          <div className="ir-timeline-head">
                            <strong>
                              {toNumber(stage.priority) ? `${toNumber(stage.priority)}. ` : ""}
                              {stage.stageName || "—"}
                            </strong>
                            <Badge tone={toneForStatus(state.tone)}>{state.label}</Badge>
                          </div>
                          <p className="ir-timeline-note ir-timeline-by">
                            Assigned to: {stage.assignedTo || "—"}
                          </p>
                          {stage.actionDate && (
                            <p className="ir-timeline-note">
                              Actioned: {formatDateTime(stage.actionDate)}
                            </p>
                          )}
                          {stage.description && (
                            <p className="ir-timeline-note">{stage.description}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
