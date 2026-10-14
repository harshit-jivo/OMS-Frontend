/**
 * The Expense board's carousel: which slide is up, for how long, and when the
 * controls show. Ported from JI's board carousel (factoryflow
 * `dashboards/carousel/hooks/useBoardRotation.ts` and `useIdleChrome.ts`), so
 * a wall screen behaves the same in both apps.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** How long a slide holds the screen, in seconds: 10s is a strobe, 10 min a static board. */
export const DWELL_CHOICES: readonly number[] = [15, 30, 45, 60, 90, 120, 300, 600];
/** Long enough to read a slide without hurrying; the whole board in three minutes. */
export const DEFAULT_DWELL_SECONDS = 45;
/** How often the rotation reads the clock. The progress bar animates by itself. */
export const TICK_MS = 250;
/** The strip hides after this long without the pointer near it. A wall has no pointer. */
export const CHROME_IDLE_MS = 4_000;
/** How close to the strip's top edge the pointer has to come to bring it up, in px. */
export const CHROME_REVEAL_PX = 24;

export const DWELL_STORAGE_KEY = "expense-board-dwell-seconds";
export const PAUSED_STORAGE_KEY = "expense-board-paused";

function readNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    // Private windows and locked-down kiosk browsers throw on the accessor; a wall must still rotate.
    return fallback;
  }
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* a screen that cannot remember its dwell still shows it */
  }
}

export interface BoardRotation {
  index: number;
  /** 0–1 through this slide's turn, as of the countdown's last whole second. */
  progress: number;
  /** Names this turn: the progress bar restarts when it changes. Null when nothing rotates. */
  turn: string | null;
  paused: boolean;
  dwellSeconds: number;
  /** Whole seconds left on this slide. */
  remaining: number;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  togglePaused: () => void;
  setDwellSeconds: (seconds: number) => void;
}

/**
 * The timer behind the carousel.
 *
 * WALL CLOCK, NOT TICK COUNT: the elapsed time is `Date.now()` minus when this
 * slide came up, so a throttled background tab catches up in one step instead
 * of drifting slower. NO TIMER WHILE HELD: holding clears the interval, so a
 * held board costs nothing and builds no backlog.
 */
export function useBoardRotation(count: number): BoardRotation {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(() => readFlag(PAUSED_STORAGE_KEY));
  const [dwellSeconds, setDwell] = useState(() => readNumber(DWELL_STORAGE_KEY, DEFAULT_DWELL_SECONDS));
  const [progress, setProgress] = useState(0);
  const [turns, setTurns] = useState(0);
  const startedAt = useRef(0);

  const restart = useCallback(() => {
    setProgress(0);
    setTurns((n) => n + 1);
  }, []);

  const show = useCallback(
    (target: number) => {
      restart();
      setIndex(target);
    },
    [restart],
  );

  const safeIndex = count > 0 ? Math.min(index, count - 1) : 0;

  const next = useCallback(() => {
    if (count > 0) show((safeIndex + 1) % count);
  }, [count, safeIndex, show]);

  const previous = useCallback(() => {
    if (count > 0) show((safeIndex - 1 + count) % count);
  }, [count, safeIndex, show]);

  const goTo = useCallback(
    (target: number) => {
      if (target >= 0 && target < count && target !== safeIndex) show(target);
    },
    [count, safeIndex, show],
  );

  const togglePaused = useCallback(() => {
    setPaused((was) => {
      const now = !was;
      write(PAUSED_STORAGE_KEY, String(now));
      // Releasing starts the turn over: whoever un-held it wants to read this slide.
      if (!now) restart();
      return now;
    });
  }, [restart]);

  const setDwellSeconds = useCallback(
    (seconds: number) => {
      setDwell(seconds);
      write(DWELL_STORAGE_KEY, String(seconds));
      restart();
    },
    [restart],
  );

  useEffect(() => {
    if (paused || count < 2) return;
    startedAt.current = Date.now();
    const id = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      if (elapsed >= dwellSeconds) {
        startedAt.current = Date.now();
        restart();
        setIndex((current) => (current + 1) % count);
        return;
      }
      // Only when the countdown's whole second changes: every new value re-renders the board.
      const fraction = elapsed / dwellSeconds;
      setProgress((was) =>
        Math.ceil(dwellSeconds * (1 - was)) === Math.ceil(dwellSeconds * (1 - fraction)) ? was : fraction,
      );
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [paused, count, dwellSeconds, safeIndex, restart]);

  return {
    index: safeIndex,
    progress,
    turn: count < 2 ? null : `${turns}:${count}`,
    paused,
    dwellSeconds,
    remaining: Math.max(0, Math.ceil(dwellSeconds * (1 - progress))),
    next,
    previous,
    goTo,
    togglePaused,
    setDwellSeconds,
  };
}

/**
 * Show the strip when somebody reaches for it, and only then: the pointer at
 * the very top of the board brings it up; moving back down onto the board puts
 * it away at once (so the board's own header stays usable); otherwise it fades
 * after `CHROME_IDLE_MS`. It stays while the pointer is over it or one of its
 * controls has focus. The keyboard works without it.
 */
export function useIdleChrome(rowRef: RefObject<HTMLElement | null>): { visible: boolean } {
  const [hidden, setHidden] = useState(false);
  const [activity, setActivity] = useState(0);
  const overRow = useRef(false);

  const wake = useCallback(() => {
    setHidden(false);
    setActivity((n) => n + 1);
  }, []);

  const focusInRow = useCallback(() => {
    const row = rowRef.current;
    return Boolean(row && document.activeElement && row.contains(document.activeElement));
  }, [rowRef]);

  useEffect(() => {
    if (hidden) return;
    const id = window.setTimeout(() => {
      if (!overRow.current && !focusInRow()) setHidden(true);
    }, CHROME_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [hidden, activity, focusInRow]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const rect = rowRef.current?.getBoundingClientRect();
      const top = Math.max(0, rect?.top ?? 0);
      const bottom = rect?.bottom ?? top;
      if (event.clientY <= top + CHROME_REVEAL_PX) {
        overRow.current = true;
        wake();
        return;
      }
      overRow.current = event.clientY <= bottom;
      if (overRow.current) {
        setActivity((n) => n + 1);
        return;
      }
      if (!focusInRow()) setHidden(true);
    };
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [rowRef, wake, focusInRow]);

  return { visible: !hidden };
}
