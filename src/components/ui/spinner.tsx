import { cn } from "@/lib/utils";

/**
 * Spinner — the app's circular "round progress" ring, extracted from the
 * hand-rolled `border-2 … border-t-… animate-spin` markup that Login and the
 * order pages each wrote inline. Decorative by default (`aria-hidden`): the
 * accessible "Loading" announcement belongs to the container that owns the
 * wait (a button's own label, or `PageLoader`'s `role="status"` region), so a
 * bare spinner does not announce a second time.
 */
export function Spinner({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-5 rounded-full border-2 border-line border-t-brand",
        "motion-safe:animate-spin",
        className,
      )}
      {...props}
    />
  );
}

/**
 * PageLoader — a centred circular spinner with a label, for the "nothing to
 * show until the data arrives" state of a page or a panel. Announces itself
 * once via `role="status"` so a screen reader hears the wait.
 */
export function PageLoader({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-center",
        className,
      )}
    >
      <Spinner className="size-9 border-[3px]" />
      <p className="m-0 text-[13px] text-subtle">{label}</p>
    </div>
  );
}
