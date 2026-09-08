/**
 * The one question the review screen asks before it acts.
 *
 * Approve, reject, delete, edit and post each used to go through
 * `window.confirm`, and reject collected its mandatory reason through
 * `window.prompt` — a box that cannot be validated until after it closes, so
 * an empty reason surfaced as an error banner once the reviewer had already
 * committed. Here the reason is a real field and the confirm is disabled
 * until it has content, which is the rule in DESIGN_SYSTEM.md §6.
 */
import {
  HiOutlineArrowUpTray,
  HiOutlineCheckCircle,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineXCircle,
} from "react-icons/hi2";

import type { IconType } from "react-icons";

import { Button, type ButtonVariant } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import type { PendingAction, UseInvoiceReviewResult } from "../useInvoiceReview";

type Copy = {
  title: (label: string) => string;
  body: string;
  confirm: string;
  variant: ButtonVariant;
  icon: IconType;
};

const COPY: Record<PendingAction["kind"], Copy> = {
  approve: {
    title: (label) => `Approve ${label}?`,
    body: "It moves to the approved tab and can then be posted to SAP HANA.",
    confirm: "Approve invoice",
    variant: "success",
    icon: HiOutlineCheckCircle,
  },
  reject: {
    title: (label) => `Reject ${label}?`,
    body: "The reason is shown to whoever picks the invoice up, and stays with it if it is later edited and resubmitted.",
    confirm: "Reject invoice",
    variant: "danger",
    icon: HiOutlineXCircle,
  },
  delete: {
    title: (label) => `Remove ${label} from review?`,
    body: "It disappears from every tab here. Nothing is erased — the server soft-deletes, so the log and its history survive.",
    confirm: "Remove from review",
    variant: "danger",
    icon: HiOutlineTrash,
  },
  edit: {
    title: (label) => `Edit ${label} and resubmit?`,
    body: "The stored payload opens in the Sales Invoice wizard, which rebuilds the party and lines and re-runs batch allocation against current stock. This log stays rejected until a replacement is submitted.",
    confirm: "Open in the wizard",
    variant: "primary",
    icon: HiOutlinePencilSquare,
  },
  post: {
    title: (label) => `Post ${label} to SAP HANA?`,
    body: "The invoice is created in SAP. Progress and any SAP error appear in the loader that follows.",
    confirm: "Post to SAP",
    variant: "primary",
    icon: HiOutlineArrowUpTray,
  },
};

export default function ConfirmActionDialog({ view }: { view: UseInvoiceReviewResult }) {
  const { pending, setPending, rejectReason, setRejectReason, canConfirmPending, confirmPending, actionId } =
    view;

  const busy = pending ? actionId === pending.record.id : false;
  const copy = pending ? COPY[pending.kind] : null;
  const label = pending ? `SO #${pending.record.so_number || pending.record.id}` : "";
  const Icon = copy?.icon;

  return (
    <Dialog
      open={Boolean(pending)}
      onOpenChange={(next) => {
        if (!next && !busy) setPending(null);
      }}
    >
      {pending && copy && (
        <DialogContent title={copy.title(label)} size="sm">
          <DialogHeader>
            <DialogTitle>{copy.title(label)}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="m-0 text-[13px] text-body">
              <strong className="font-semibold text-ink">
                {pending.record.party_name || "This invoice"}
              </strong>
              {" — "}
              {copy.body}
            </p>
            {pending.kind === "reject" && (
              <Field
                label="Reason for rejection"
                required
                hint="Required. Say what has to change before it can be resubmitted."
              >
                {(control) => (
                  <Textarea
                    {...control}
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Rate does not match the approved price list"
                    autoFocus
                  />
                )}
              </Field>
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={copy.variant}
              onClick={confirmPending}
              disabled={busy || !canConfirmPending}
              title={canConfirmPending ? undefined : "Enter a reason first."}
            >
              {Icon ? <Icon aria-hidden="true" /> : null}
              {busy ? "Working…" : copy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
