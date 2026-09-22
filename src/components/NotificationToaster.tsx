/**
 * The app's toast stack — top right, auto-dismissing.
 *
 * A tiny external store drives it; `showToast()` can be called from anywhere
 * (including from service code outside the React tree), and this is mounted
 * once by the shell. It renders EVERY toast in the app.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE LIVE REGION IS MOUNTED ALWAYS, AND THAT IS THE POINT
 * ─────────────────────────────────────────────────────────────────────────
 * This used to `return null` when the stack was empty, and put
 * `role="status" aria-live="polite"` on each CARD. Both halves of that are the
 * classic way to build an aria-live region that never announces anything: the
 * region has to already be in the accessibility tree when the message arrives,
 * because what is announced is the CHANGE to a live region — not the arrival
 * of one that is already full.
 *
 * So every toast in the app was silent to a screen reader. That matters more
 * here than in most places: these toasts are how the app confirms that a save
 * WORKED. "Assignments saved" is often the only confirmation there is.
 *
 * The wrapper is therefore rendered unconditionally and only the cards
 * conditionally, and the live region is the CONTAINER — one region the stack
 * is announced from, rather than one per card.
 */
import { useEffect, useState } from "react";
import {
  HiOutlineBell,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineXMark,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { AUTO_DISMISS_MS, dismissToast, subscribeToToasts } from "@/lib/toastStore";
import type { ToastData, ToastTone } from "@/lib/toastStore";
import { cn } from "@/lib/utils";

/**
 * Colour, icon and left edge per tone.
 *
 * The accent is a 3px left border rather than a tinted card: a fully green
 * panel sitting over the page is louder than a confirmation needs to be, and
 * at four stacked toasts it becomes the brightest thing on screen. The border
 * plus the chip is enough to read green-or-red from across the desk, which is
 * the whole requirement.
 */
const TONES: Record<ToastTone, { edge: string; chip: string; Icon: typeof HiOutlineBell }> = {
  ok: {
    edge: "border-l-[3px] border-l-ok",
    chip: "bg-ok-soft text-ok",
    Icon: HiOutlineCheckCircle,
  },
  bad: {
    edge: "border-l-[3px] border-l-bad",
    chip: "bg-bad-soft text-bad",
    Icon: HiOutlineXCircle,
  },
};

function ToastCard({ toast }: { toast: ToastData }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id]);

  const tone = toast.tone ? TONES[toast.tone] : null;
  const Icon = tone?.Icon ?? HiOutlineBell;

  return (
    <div
      data-slot="toast"
      data-tone={toast.tone}
      className={cn(
        "pointer-events-auto flex w-[min(92vw,360px)] gap-2.5 rounded-card border border-line",
        "bg-card p-3 shadow-panel motion-safe:animate-[oms-fade-slide-up_0.18s_ease-out]",
        tone?.edge,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          tone?.chip ?? "bg-brand-soft text-brand",
        )}
      >
        <Icon />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">{toast.title}</span>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1 -mt-1 size-6 shrink-0"
            onClick={() => dismissToast(toast.id)}
            aria-label={"Dismiss: " + toast.title}
          >
            <HiOutlineXMark />
          </Button>
        </div>

        <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-body">{toast.message}</p>

        {toast.orderNumber ? (
          <p className="m-0 mt-1 font-mono text-[11.5px] text-subtle">
            Order #{toast.orderNumber}
          </p>
        ) : null}

        {toast.onAction ? (
          <Button
            variant="link"
            size="inline"
            className="mt-1.5"
            onClick={() => {
              toast.onAction?.();
              dismissToast(toast.id);
            }}
          >
            {toast.actionLabel || "View order"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function NotificationToaster() {
  const [items, setItems] = useState<ToastData[]>([]);

  useEffect(() => subscribeToToasts(setItems), []);

  return (
    <div
      data-slot="toast-region"
      role="status"
      aria-live="polite"
      // `pointer-events-none` on the container, `auto` on each card: the strip
      // spans the corner of the screen and must not swallow clicks meant for
      // the page underneath it when it is empty.
      className="pointer-events-none fixed right-4 top-4 z-[2000] flex flex-col gap-2.5"
    >
      {items.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
