import { HiOutlineCheckCircle, HiOutlineXCircle } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DetailFields } from "@/components/ui/detail";
import type { Order } from "@/services/ordersService";

/**
 * The approve / reject flow, shared by the three approval queues.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT IS TWO STEPS
 * ─────────────────────────────────────────────────────────────────────────
 * Approving pushes the order to SAP as a real Sales Order. That is not
 * undoable from this app, so the flow is: read a summary of what you are
 * about to act on, give a reason, then confirm. `Auditor_Order`,
 * `Billing_Order` and `Rate_Approver_Order` each implemented that from
 * scratch, with three copies of the same `.xx-modal` stylesheet and three
 * subtly different sets of button labels.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A REASON IS REQUIRED TO REJECT, OPTIONAL TO APPROVE
 * ─────────────────────────────────────────────────────────────────────────
 * That asymmetry is deliberate and it is the one rule this component
 * enforces itself: a rejection with no reason is a dead end for whoever has
 * to act on it next. Validation was `alert("Reason required")` in all three
 * pages — a browser dialog interrupting a dialog. The Continue button is
 * disabled instead, with the requirement stated where the reason is typed.
 */

export type ApprovalAction = "approve" | "reject";

/** Step 1 — what you are about to act on, and why. */
export function ApprovalReviewDialog({
  order,
  action,
  reason,
  onReasonChange,
  onContinue,
  onCancel,
}: {
  order: Order | null;
  action: ApprovalAction | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const open = Boolean(order && action);
  // A rejection must say why; an approval need not.
  const reasonMissing = action === "reject" && !reason.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      {open && order && action ? (
        <DialogContent
          title={action === "approve" ? "Review and approve" : "Review and reject"}
          size="sm"
        >
          <DialogHeader>
            <DialogTitle>
              {action === "approve" ? "Review & approve" : "Review & reject"}
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <DetailFields
              items={[
                ["Order number", order.order_number],
                ["Party", order.card_name],
                ["Items", order.items_count ?? order.items?.length ?? 0],
                [
                  "Amount",
                  `₹${Number(order.total_amount || 0).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`,
                ],
                ["Delivery date", order.delivery_date || ""],
              ]}
            />

            <div className="space-y-1.5">
              <label
                htmlFor="approval-reason"
                className="block text-[11px] font-medium text-subtle"
              >
                {action === "approve" ? "Reason (optional)" : "Reason (required)"}
              </label>
              {/*
                `[font-family:inherit]` — preflight is not imported, and
                `font-family` is not inherited by form controls, so a textarea
                styled with `text-[13px]` alone renders in the UA's font
                beside Inter. Spelled long-hand rather than `font-[inherit]`,
                which tailwind-merge drops as ambiguous.
              */}
              <textarea
                id="approval-reason"
                rows={3}
                value={reason}
                onChange={(event) => onReasonChange(event.target.value)}
                placeholder={
                  action === "approve" ? "Add a reason (optional)…" : "Why is this rejected?"
                }
                className={[
                  "w-full rounded-sm border border-line bg-surface px-2.5 py-2",
                  "[font-family:inherit] text-[13px] text-ink",
                  "transition-colors hover:border-line-strong",
                  "focus-visible:border-brand focus-visible:bg-white focus-visible:shadow-focus focus-visible:outline-none",
                ].join(" ")}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button onClick={onCancel}>Cancel</Button>
            <Button
              variant={action === "approve" ? "primary" : "danger"}
              onClick={onContinue}
              disabled={reasonMissing}
              // Disabled alone says "no" without saying why.
              title={reasonMissing ? "A reason is required to reject an order" : undefined}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** Step 2 — the point of no return, stated plainly. */
export function ApprovalConfirmDialog({
  order,
  action,
  submitting,
  /** What approving does here — "push to SAP as a Sales Order", say. */
  approveMessage,
  onConfirm,
  onBack,
  onCancel,
}: {
  order: Order | null;
  action: ApprovalAction | null;
  submitting: boolean;
  approveMessage?: (order: Order) => string;
  onConfirm: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const open = Boolean(order && action);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onCancel();
      }}
    >
      {open && order && action ? (
        <DialogContent
          title={action === "approve" ? "Confirm approval" : "Confirm rejection"}
          size="sm"
          className="max-w-[440px]"
        >
          <DialogBody className="text-center">
            <span
              aria-hidden="true"
              className={[
                "mx-auto mb-3 flex size-11 items-center justify-center rounded-full",
                action === "approve" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad",
              ].join(" ")}
            >
              {action === "approve" ? (
                <HiOutlineCheckCircle className="size-5" />
              ) : (
                <HiOutlineXCircle className="size-5" />
              )}
            </span>
            <h3 className="text-[16px] font-bold text-ink">
              {action === "approve" ? "Confirm approval" : "Confirm rejection"}
            </h3>
            <p className="mt-1.5 text-[13px] text-subtle">
              {action === "approve"
                ? (approveMessage?.(order) ??
                  `Approve order ${order.order_number}?`)
                : `Reject order ${order.order_number}? This cannot be undone from here.`}
            </p>
          </DialogBody>

          <DialogFooter className="justify-center">
            <Button onClick={onBack} disabled={submitting}>
              Back
            </Button>
            <Button
              variant={action === "approve" ? "primary" : "danger"}
              onClick={onConfirm}
              disabled={submitting}
            >
              {action === "approve" ? "Yes, approve" : "Yes, reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/**
 * The busy overlay, while the order is in flight to SAP.
 *
 * This is the one dialog on these pages that MUST NOT close. Escape and
 * pointer-down-outside are cancelled; everything else the primitive gives —
 * the focus trap, the inert background, focus restored when the post finishes
 * — is exactly what this needs. Before it was a plain fixed div, so Tab
 * walked straight into the page behind and a keyboard user could press the
 * button that started the post while it was still running.
 */
export function ApprovalBusyDialog({
  open,
  orderNumber,
  heading = "Creating sales order",
  message = "Sending the order to SAP. This may take a little while.",
}: {
  open: boolean;
  orderNumber?: string;
  /** What is happening. Only the auditor's queue actually talks to SAP. */
  heading?: string;
  message?: string;
}) {
  return (
    <Dialog open={open}>
      {open ? (
        <DialogContent
          title="Working"
          size="sm"
          className="max-w-[400px]"
          showClose={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogBody className="text-center" role="status" aria-live="polite" aria-busy="true">
            <span
              aria-hidden="true"
              className="mx-auto mb-3 block size-8 animate-spin rounded-full border-2 border-line border-t-brand"
            />
            <h3 className="text-[16px] font-bold text-ink">{heading}</h3>
            <p className="mt-1.5 text-[13px] text-subtle">
              {orderNumber ? `${orderNumber} — ` : ""}
              {message}
            </p>
            <p className="mt-2 text-[12px] font-medium text-hold">
              Please do not refresh or close this window.
            </p>
          </DialogBody>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** What SAP gave back. */
export function ApprovalSuccessDialog({
  open,
  onClose,
  result,
  /** "Sales Order No." for the auditor queue, "Invoice No." for billing. */
  numberLabel = "Sales Order No.",
}: {
  open: boolean;
  onClose: () => void;
  result: { number: string; order_id: string; message: string } | null;
  numberLabel?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open && result ? (
        <DialogContent title="Order completed" size="sm" className="max-w-[440px]">
          <DialogBody className="space-y-4">
            <div className="text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-ok-soft text-ok"
              >
                <HiOutlineCheckCircle className="size-5" />
              </span>
              <h3 className="text-[16px] font-bold text-ink">Order completed</h3>
            </div>
            <DetailFields
              items={[
                [numberLabel, result.number],
                ["Order number", result.order_id],
                ["Message", result.message],
              ]}
            />
          </DialogBody>
          <DialogFooter className="justify-center">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
