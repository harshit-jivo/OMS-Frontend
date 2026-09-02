/**
 * Toast — the transient message, said out loud.
 *
 * The five hand-rolled ones are all this:
 *
 *     {toast && <div className="trk-toast">{toast}</div>}
 *
 * A plain div. It fades in at the corner, sits for three seconds and vanishes,
 * and a screen reader is never told any of it happened — which matters more
 * here than in most places, because these toasts are how the app reports that
 * a save WORKED. "Invoice advanced to JSAP" is the only confirmation the user
 * gets, and it is currently silent.
 *
 * `role="status"` + `aria-live="polite"` fixes that, and the region has to be
 * in the DOM *before* the message arrives for the announcement to fire — which
 * is why `Toast` renders the wrapper unconditionally and only the text
 * conditionally. Mounting the whole thing when the message appears is the
 * mistake that makes an aria-live region silent, and it is exactly what
 * `{toast && <div>}` does.
 *
 * Auto-dismiss stays with the caller. All five already own a `setTimeout` that
 * clears their state, and moving the timer in here would mean two things
 * deciding when the message goes away.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export function Toast({
  message,
  tone = "neutral",
  className,
}: {
  /** Falsy renders nothing visible — but the live region stays mounted. */
  message?: React.ReactNode;
  tone?: "neutral" | "ok" | "bad";
  className?: string;
}) {
  return (
    <div
      data-slot="toast-region"
      role="status"
      aria-live="polite"
      // Not `hidden` when empty: a hidden live region does not announce.
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[1100] flex justify-center"
    >
      {message ? (
        <div
          data-slot="toast"
          data-tone={tone}
          className={cn(
            "pointer-events-auto max-w-[min(90vw,32rem)] rounded-xl px-4 py-3",
            "text-[13px] font-semibold shadow-panel",
            tone === "ok" && "bg-ok-soft text-ok",
            tone === "bad" && "bg-bad-soft text-bad",
            tone === "neutral" && "bg-ink text-white",
            className,
          )}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
