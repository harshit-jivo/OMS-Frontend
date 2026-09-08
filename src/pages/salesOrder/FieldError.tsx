/**
 * One validation message, under the control it belongs to.
 *
 * Renders nothing when there is nothing wrong, so a caller can drop it after
 * any field without a conditional. `role="alert"` because the message usually
 * appears after a submit the user has already looked away from.
 *
 * Where a message sits directly under a single control, prefer `Field`'s own
 * `error` prop — it wires `aria-describedby` and `aria-invalid` to the input,
 * which this cannot do from outside. This exists for the places that are not
 * one field: the item modal's "why this row will not confirm", and the legacy
 * form's table cells.
 */
export default function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="m-0 mt-1 text-[12px] leading-snug text-danger" role="alert">
      {message}
    </p>
  );
}
