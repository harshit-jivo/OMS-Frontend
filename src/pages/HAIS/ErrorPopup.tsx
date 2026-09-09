import { HiOutlineExclamationTriangle } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

type Props = {
  /** The message to show. Falsy = the popup is not rendered. */
  message?: string;
  onClose: () => void;
  title?: string;
};

/**
 * A small centred popup for a save failure, instead of an inline banner —
 * the Add-asset form is long, and a banner at the bottom of it is below the
 * fold when the button that produced it is pressed.
 */
export default function ErrorPopup({ message, onClose, title = "Something went wrong" }: Props) {
  return (
    <Dialog open={Boolean(message)} onOpenChange={(next) => !next && onClose()}>
      {message ? (
        <DialogContent title={title} size="sm" showClose={false}>
          <DialogBody className="flex flex-col items-center gap-3 pt-7 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-bad-soft text-bad">
              <HiOutlineExclamationTriangle aria-hidden="true" className="size-6" />
            </span>
            <h3 className="m-0 text-[16px] font-bold text-ink">{title}</h3>
            <p className="m-0 text-[13px] text-body">{message}</p>
          </DialogBody>
          <DialogFooter className="justify-center border-t-0 pt-0">
            <Button variant="primary" onClick={onClose} autoFocus>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
