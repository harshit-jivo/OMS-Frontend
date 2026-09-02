/**
 * One validation message, under the control it belongs to.
 *
 * Renders nothing when there is nothing wrong, so a caller can drop it after
 * any field without a conditional. `role="alert"` because the message usually
 * appears after a submit the user has already looked away from.
 */
export default function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="sl-field-error" role="alert">
      {message}
    </p>
  );
}
