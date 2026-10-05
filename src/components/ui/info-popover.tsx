/**
 * An (i) that reveals a panel of detail.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY NOT A `title` ATTRIBUTE
 * ─────────────────────────────────────────────────────────────────────────
 * Several screens already lean on `title` for this, and it cannot carry a
 * layout: everything collapses into one unstyled line, it takes about a second
 * to appear, it cannot be read by touch at all, and its text cannot be
 * selected or copied. A biller reading an address off the screen to somebody
 * on the phone needs all four of those.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOVER *AND* CLICK
 * ─────────────────────────────────────────────────────────────────────────
 * `openOn="hover"` still opens on click and on keyboard focus. That is not
 * padding the spec: a touch screen has no hover at all, so hover-only would
 * mean the panel simply does not exist on a tablet, and a hover panel that
 * vanishes the moment the pointer leaves cannot have its text selected. Click
 * pins it open until the next outside click.
 *
 * `openOn="click"` is click only — for a panel that is a deliberate detour
 * rather than a glance, where opening on a passing cursor would be noise.
 *
 * The close delay in hover mode is what lets the pointer cross the 4px gap
 * between the icon and the panel without the panel disappearing en route.
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { HiOutlineInformationCircle } from "react-icons/hi2";

import { cn } from "@/lib/utils";
import { useAnchoredPanel } from "./anchoredPanel";

/** Long enough to cross the gap to the panel, short enough not to feel stuck. */
const CLOSE_DELAY_MS = 120;
/** Must outlast `info-popover-out` in tailwind.css (120ms). */
const EXIT_MS = 160;

type Props = {
  /** Names the trigger and the panel for screen readers. */
  label: string;
  openOn?: "hover" | "click";
  /** Width of the panel. The trigger is an icon, so it cannot supply one. */
  width?: number;
  className?: string;
  children: React.ReactNode;
};

export function InfoPopover({ label, openOn = "hover", width = 320, className, children }: Props) {
  const rootRef = React.useRef<HTMLSpanElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // "closed" is unmounted; "closing" is still on screen, fading out.
  const [phase, setPhase] = React.useState<"closed" | "open" | "closing">("closed");
  // Pinned by a click: hover leaving must not close it.
  const [pinned, setPinned] = React.useState(false);

  const closeTimer = React.useRef<number | undefined>(undefined);
  const exitTimer = React.useRef<number | undefined>(undefined);

  const clearTimers = () => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(exitTimer.current);
  };

  // The only effect: drop pending timers if the trigger unmounts mid-fade.
  // It sets no state, so it cannot cascade a render.
  React.useEffect(() => clearTimers, []);

  const open = () => {
    clearTimers();
    setPhase("open");
  };

  /** Start the fade, then unmount once it has run. */
  const close = (immediate = false) => {
    clearTimers();
    setPinned(false);
    if (immediate) {
      setPhase("closed");
      return;
    }
    setPhase((current) => (current === "open" ? "closing" : current));
    exitTimer.current = window.setTimeout(() => setPhase("closed"), EXIT_MS);
  };

  const closeAfterDelay = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => close(), CLOSE_DELAY_MS);
  };

  const mounted = phase !== "closed";
  const showing = phase === "open";
  const placement = useAnchoredPanel(rootRef, mounted, {
    width: "content",
    align: "end",
    maxHeight: 420,
  });

  // An outside pointer-down closes a pinned panel, the same gesture that
  // closes the dropdown pickers. Bound only while something is pinned, so the
  // page carries no listener the rest of the time.
  React.useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned]);

  const hoverProps =
    openOn === "hover"
      ? {
          onMouseEnter: open,
          onMouseLeave: () => {
            if (!pinned) closeAfterDelay();
          },
          onFocus: open,
          onBlur: (event: React.FocusEvent) => {
            // Focus moving INTO the panel is not leaving the popover.
            if (panelRef.current?.contains(event.relatedTarget as Node)) return;
            if (!pinned) close(true);
          },
        }
      : {};

  const panelId = React.useId();

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-flex align-middle", className)}
      {...hoverProps}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={mounted}
        aria-controls={mounted ? panelId : undefined}
        /* §1.1 reset: `index.css` only normalises controls inside `.tw-page`,
           and this trigger is rendered in ordinary page content. */
        className={cn(
          "inline-flex size-[22px] cursor-pointer appearance-none items-center justify-center",
          "rounded-full border-0 bg-transparent p-0 text-subtle transition-colors",
          "hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2",
          "focus-visible:outline-brand",
          mounted && "text-brand",
        )}
        onClick={() => {
          if (mounted && pinned) {
            close(true);
            return;
          }
          open();
          setPinned(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && mounted) {
            event.stopPropagation();
            close(true);
          }
        }}
      >
        <HiOutlineInformationCircle aria-hidden="true" className="size-[17px]" />
      </button>

      {mounted && placement.host
        ? ReactDOM.createPortal(
            <div style={placement.style} className="z-[1100]">
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-label={label}
                data-state={showing ? "open" : "closed"}
                /* `tw-page` for the same reason `DialogContent` carries it:
                   this panel is portalled OUT of the page, and `index.css`'s
                   unlayered `input, select, button { font: inherit }` would
                   otherwise render its contents at the 18px root size. */
                className={cn(
                  "info-popover tw-page overflow-y-auto rounded-md border border-line/60",
                  "bg-card p-3 text-[12.5px] leading-relaxed text-body shadow-lg",
                  "ring-1 ring-black/[0.03]",
                )}
                style={{ width }}
                onMouseEnter={openOn === "hover" ? open : undefined}
                onMouseLeave={openOn === "hover" && !pinned ? closeAfterDelay : undefined}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.stopPropagation();
                  close(true);
                  triggerRef.current?.focus();
                }}
              >
                {children}
              </div>
            </div>,
            placement.host,
          )
        : null}
    </span>
  );
}
