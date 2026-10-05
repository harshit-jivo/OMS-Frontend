/**
 * "Confirm your password" before the Payment user types a payee's bank
 * account by hand. The server checks the password and answers with a token
 * that unlocks typing on this request for a while; the payout carries it
 * back when it is saved (`manual_token`), and the server refuses a typed
 * account without one. This dialog is the asking, never the check.
 *
 * The password is Jivo Auth's, so the check signs in to Jivo Auth as the
 * signed-in user — by EMAIL — and hands OMS the proof (see
 * `confirmManualPassword`). An OMS account with no email on file therefore
 * cannot be confirmed at all, and the dialog says so before anything is typed.
 */
import { useState } from "react";

import { useAuth } from "../../auth";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "../../components/ui/dialog";
import { Field, Input } from "../../components/ui/form";
import { advancePaymentError, advancePaymentService } from "../../services/advancePaymentService";
import { JivoAuthError, passwordCheckErrorMessage } from "../../services/jivoAuth";

const NO_EMAIL = "Your OMS account has no email address; ask your administrator.";

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
  const { session } = useAuth();
  const email = session?.email?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPassword("");
    setError("");
    onClose();
  };

  const confirm = async () => {
    // No email, no Jivo Auth sign-in to check the password with. Nothing is
    // sent — not to Jivo Auth, not to OMS.
    if (!email) return;
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    try {
      const token = await advancePaymentService.confirmManualPassword(requestId, email, password);
      setPassword("");
      setError("");
      onConfirmed(token);
    } catch (err) {
      setError(
        err instanceof JivoAuthError ? passwordCheckErrorMessage(err) : advancePaymentError(err),
      );
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
              <Field label="Your password" error={(email ? error : NO_EMAIL) || undefined}>
                {(f) => (
                  <Input
                    {...f}
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    disabled={!email}
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
            <Button variant="primary" onClick={() => void confirm()} disabled={busy || !email}>
              {busy ? "Checking…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
