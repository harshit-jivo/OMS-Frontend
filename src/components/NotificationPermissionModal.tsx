/**
 * The "explain first" notification-permission prompt.
 *
 * Shown BEFORE the browser's own permission dialog. The OS prompt
 * (`Notification.requestPermission()`) only fires from the "Allow" button —
 * never automatically, and never from an `alert`/`confirm`.
 *
 * Why the explain-first step exists at all: a browser gives each origin ONE
 * chance at the permission prompt. Dismissed or denied, it cannot be asked
 * again from script — the user has to go into site settings. So asking cold,
 * at load, spends the only ask on someone who has no idea what it is for.
 *
 * This was a hand-rolled overlay: a fixed div with an `onClick` to dismiss and
 * a `stopPropagation` on the card. It is `ui/dialog` now, which brings the
 * focus trap, Escape, the scroll lock and `aria-modal` it never had — and the
 * `tw-page` reset, without which its buttons rendered at the 18px root size
 * (DESIGN_SYSTEM §1.3).
 */
import { HiOutlineBell, HiOutlineCheck } from "react-icons/hi2";

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

type Props = {
  open: boolean;
  submitting?: boolean;
  onAllow: () => void;
  onDismiss: () => void;
};

const BENEFITS = [
  "Instant approval requests",
  "Billing assignments",
  "Auditor reviews",
  "Order status updates",
];

export default function NotificationPermissionModal({
  open,
  submitting = false,
  onAllow,
  onDismiss,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Dismissing is a real answer here ("maybe later"), so Escape and the
        // close button route to the same handler as the button — but not while
        // the OS prompt is being raised.
        if (!next && !submitting) onDismiss();
      }}
    >
      {open && (
        <DialogContent title="Notifications" size="sm">
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <span
                aria-hidden="true"
                className="mb-2 flex size-11 items-center justify-center rounded-full bg-brand-soft text-[20px] text-brand"
              >
                <HiOutlineBell />
              </span>
              <DialogTitle>Stay updated</DialogTitle>
              <DialogDescription>
                Never miss an important approval or workflow update.
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody>
            <ul className="m-0 list-none space-y-2 p-0">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2 text-[13px] text-body">
                  <span
                    aria-hidden="true"
                    className="flex size-4 shrink-0 items-center justify-center rounded-full bg-ok-soft text-[11px] text-ok"
                  >
                    <HiOutlineCheck />
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </DialogBody>

          <DialogFooter>
            <Button onClick={onDismiss} disabled={submitting}>
              Maybe later
            </Button>
            <Button variant="primary" onClick={onAllow} disabled={submitting}>
              {submitting ? "Please wait…" : "Allow notifications"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
