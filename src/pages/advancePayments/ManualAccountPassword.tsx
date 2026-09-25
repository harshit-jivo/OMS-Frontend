/**
 * "Confirm your password" before the Payment user types a payee's bank
 * account by hand. The server checks the password and answers with a token
 * that unlocks typing on this request for a while; the payout carries it
 * back when it is saved (`manual_token`), and the server refuses a typed
 * account without one. This dialog is the asking, never the check.
 */
import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "../../components/ui/dialog";
import { Field, Input } from "../../components/ui/form";
import { advancePaymentError, advancePaymentService } from "../../services/advancePaymentService";

export function ManualAccountPassword({
  requestId,
  open,
  onClose,
  onConfirmed,
}: {
  requestId: number;
  open: boolean;
  onClose: () => void;
  onConfirmed: (token: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPassword("");
    setError("");
    onClose();
  };

  const confirm = async () => {
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    try {
      const token = await advancePaymentService.confirmManualPassword(requestId, password);
      setPassword("");
      setError("");
      onConfirmed(token);
    } catch (err) {
      setError(advancePaymentError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && close()}>
      {open ? (
        <DialogContent
          title="Confirm your password"
          description="A bank account typed by hand is not one SAP holds for the payee. Confirm it is you before entering it."
          size="sm"
          className="max-w-[440px]"
        >
          <DialogBody>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              <Field label="Your password" error={error || undefined}>
                {(f) => (
                  <Input
                    {...f}
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void confirm()} disabled={busy}>
              {busy ? "Checking…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
