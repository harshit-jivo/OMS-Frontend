import { HiOutlineArrowRightOnRectangle } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * The sign-out confirm.
 *
 * A `panel` rather than the `sb-modal` legacy class it used to borrow, which
 * is still in Sidebar.css because two HAIS screens use it. This one no longer
 * does, so the 320px centred box, the red circle and the two hand-rolled
 * buttons come from the primitives instead.
 *
 * No `DialogHeader`: a confirm with three words in it does not need a titled
 * bar above them. The accessible name comes from `DialogContent`'s `title`.
 */
export function LogoutDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent title="Sign out" size="sm" className="max-w-[400px]">
          <DialogBody className="text-center">
            <span
              aria-hidden="true"
              className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger"
            >
              <HiOutlineArrowRightOnRectangle className="size-5" />
            </span>
            <h3 className="text-[16px] font-bold text-ink">Sign out</h3>
            <p className="mt-1.5 text-[13px] text-subtle">
              You will need to sign in again to place or approve orders.
            </p>
          </DialogBody>
          <DialogFooter className="justify-center">
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            {/*
              `danger` is the soft-fill variant, not a solid red slab — see
              ui/button: a destructive button that shouts is one people click
              to make it stop.
            */}
            <Button variant="danger" onClick={onConfirm}>
              Yes, sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
