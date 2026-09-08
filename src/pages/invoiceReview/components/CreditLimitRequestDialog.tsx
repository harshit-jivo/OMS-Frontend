/**
 * The credit-limit request form modal (`clRecord`).
 *
 * A real `panel` dialog on `ui/form` controls, where it was a `bare` one
 * wearing `.ir-cl-modal` and three hand-rolled `<label><span>` fields.
 *
 * The customer's CURRENT balance and limit sit above the form on purpose:
 * "what should the new limit be" is a question you cannot answer without
 * them, and they were previously the same visual weight as the branch name
 * beside them.
 */
import { HiOutlineBanknotes } from "react-icons/hi2";

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
import { DetailField, DetailGrid } from "@/components/ui/detail";
import { Field, FormGrid, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount, parsePayload } from "../helpers";
import type { UseInvoiceReviewResult } from "../useInvoiceReview";

export default function CreditLimitRequestDialog({ view }: { view: UseInvoiceReviewResult }) {
  const {
    clRecord,
    setClRecord,
    clCard,
    clLoading,
    clLookupError,
    clNewLimit,
    setClNewLimit,
    clValidTill,
    setClValidTill,
    setClFile,
    clSubmitting,
    clSubmitError,
    submitCreditLimitRequest,
  } = view;

  return (
    <Dialog
      open={Boolean(clRecord)}
      onOpenChange={(next) => {
        if (!next && !clSubmitting) setClRecord(null);
      }}
    >
      {clRecord && (
        <DialogContent title="Credit limit request" size="md">
          <DialogHeader>
            <div className="min-w-0">
              <p className="m-0 mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
                Credit limit request
              </p>
              <DialogTitle>{clCard?.cardName || clRecord.party_name || "—"}</DialogTitle>
              <DialogDescription>
                {String(parsePayload(clRecord.invoice_payload).CardCode || "—")}
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody>
            {clLoading ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <span className="sr-only">Loading customer credit data</span>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-control w-full" />
                <Skeleton className="h-control w-full" />
              </div>
            ) : (
              <>
                {/* A lookup failure does not block the form — the request can
                    still be raised, it just has to be raised blind. Saying so
                    is more useful than an empty grid. */}
                {clLookupError ? (
                  <div className="mb-4">
                    <Notice tone="hold" title="Could not read the customer's credit data">
                      {clLookupError}
                    </Notice>
                  </div>
                ) : null}

                <DetailGrid className="mb-5">
                  <DetailField
                    label="Current balance"
                    value={clCard ? formatAmount(clCard.balance) : "—"}
                  />
                  <DetailField
                    label="Current credit limit"
                    value={clCard ? formatAmount(clCard.creditLine) : "—"}
                  />
                  <DetailField label="Card type" value={clCard?.cardType || "—"} />
                  <DetailField label="Branch" value={clRecord.branch || "—"} />
                </DetailGrid>

                <FormGrid>
                  <Field label="New credit limit" required>
                    {(control) => (
                      <Input
                        {...control}
                        type="number"
                        min={1}
                        value={clNewLimit}
                        onChange={(event) => setClNewLimit(event.target.value)}
                        placeholder="e.g. 200000"
                      />
                    )}
                  </Field>
                  <Field label="Valid till" required>
                    {(control) => (
                      <Input
                        {...control}
                        type="date"
                        value={clValidTill}
                        onChange={(event) => setClValidTill(event.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    label="Attachment"
                    required
                    span="full"
                    hint="Mandatory — the approval chain will not accept a request without one."
                  >
                    {(control) => (
                      <Input
                        {...control}
                        type="file"
                        onChange={(event) => setClFile(event.target.files?.[0] || null)}
                        className="file:mr-3 file:rounded-sm file:border-0 file:bg-surface-strong file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-body"
                      />
                    )}
                  </Field>
                </FormGrid>

                {clSubmitError ? (
                  <div className="mt-4">
                    <Notice tone="bad">{clSubmitError}</Notice>
                  </div>
                ) : null}
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button onClick={() => setClRecord(null)} disabled={clSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submitCreditLimitRequest}
              disabled={clSubmitting || clLoading}
            >
              <HiOutlineBanknotes aria-hidden="true" />
              {clSubmitting ? "Submitting…" : "Raise Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
