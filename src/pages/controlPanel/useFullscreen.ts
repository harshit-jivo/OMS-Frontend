/**
 * Full screen for one element, YouTube-style: a button, the `F` key, and
 * `F11`, all toggling the same thing; Esc (the browser's own) leaves it.
 *
 * Element full screen rather than the browser's: the Control Panel page fills
 * the whole screen with nothing of OMS around it, and leaving puts the user
 * back exactly where they were. F11 is taken over on these pages so it does
 * that instead of the browser's chrome-only full screen; where a browser
 * refuses to hand F11 over, its own full screen still fills the screen,
 * because the frame is sized to the viewport.
 *
 * Keys are listened for on this window AND on any extra window handed to
 * `listenOn` — the page frame's, which is same-origin — because a key pressed
 * while the frame has focus never reaches the parent window.
 *
 * `supported` is false where an element cannot go full screen (iPhone Safari);
 * callers hide the button there.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Typing in a field must not toggle full screen. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const supported = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === ref.current && ref.current !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [ref]);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (ref.current) {
      void ref.current.requestFullscreen().catch(() => {});
    }
  }, [ref, supported]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "F11") {
        event.preventDefault();
        toggle();
      } else if ((event.key === "f" || event.key === "F") && !isTyping(event.target)) {
        event.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  // The frame's window, attached on each load (a reload is a new window).
  const attached = useRef<Window | null>(null);
  const listenOn = useCallback(
    (win: Window | null) => {
      try {
        attached.current?.removeEventListener("keydown", onKeyDown);
      } catch {
        /* the old frame window may already be gone */
      }
      attached.current = null;
      try {
        // Throws for a cross-origin window; then the keys simply only work
        // while focus is outside the frame.
        win?.addEventListener("keydown", onKeyDown);
        attached.current = win;
      } catch {
        attached.current = null;
      }
    },
    [onKeyDown],
  );
  useEffect(() => () => listenOn(null), [listenOn]);

  return { isFullscreen, supported, toggle, listenOn };
}
