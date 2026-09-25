/**
 * The toast store: state and the imperative API, with no React in it.
 *
 * It used to live inside NotificationToaster.tsx, which made that file export
 * a component AND two functions. Two consequences, one cosmetic and one not:
 *
 *   * `react-refresh/only-export-components` — editing the toaster stopped
 *     hot-reloading cleanly, because a file that exports helpers cannot be
 *     swapped in place.
 *   * Pages calling `showToast` had to import from a SHELL component, which
 *     put the entry chunk in their dependency graph. After the Phase 5.4 split
 *     that was the last thing pinning any page chunk to the entry's hash: a
 *     one-line Sidebar edit still re-hashed UI_Labels and Profile because of
 *     this import alone.
 *
 * The store is a plain external store rather than context, deliberately —
 * `showToast()` is called from service code and error handlers that are not
 * inside the React tree at all.
 */

/**
 * How the toast reads at a glance, before the words are.
 *
 * Omitted is the neutral bell — an FYI. `ok` and `bad` are for a DECISION the
 * user just took and wants confirmed: approving and rejecting are one click
 * apart and the only difference afterwards is the sentence, which is exactly
 * the thing nobody reads on a toast that is about to disappear.
 */
// `ok`/`bad` are the original vocabulary; `success`/`error` are the equivalents
// introduced by the Distributor pages. Both are accepted and styled the same
// (ok≡success, bad≡error) so callers on either spelling get colored toasts.
export type ToastTone = "ok" | "bad" | "success" | "error";

export type ToastData = {
  id: number;
  title: string;
  message: string;
  /** Visual tone. `success`/`ok` render the card green with a check icon,
   *  `error`/`bad` render it red with an X icon; anything else (or omitted)
   *  uses the neutral brand styling. */
  tone?: ToastTone;
  orderNumber?: string | null;
  onAction?: () => void;
  actionLabel?: string;
};

export type ToastInput = Omit<ToastData, "id">;

/** How long a toast stays up before it removes itself. */
export const AUTO_DISMISS_MS = 6000;

/** Most toasts kept on screen at once; older ones fall off the bottom. */
const MAX_STACK = 4;

let seq = 1;
let toasts: ToastData[] = [];
const listeners = new Set<(items: ToastData[]) => void>();

const emit = () => listeners.forEach((l) => l([...toasts]));

export const showToast = (input: ToastInput): number => {
  const id = seq++;
  toasts = [{ id, ...input }, ...toasts].slice(0, MAX_STACK);
  emit();
  return id;
};

export const dismissToast = (id: number) => {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
};

/**
 * Subscribe to the stack. Returns the unsubscribe function, so a caller can
 * write `useEffect(() => subscribeToToasts(setItems), [])` and not have to
 * remember the cleanup — forgetting it leaks a listener per mount.
 */
export const subscribeToToasts = (listener: (items: ToastData[]) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Test-only: drop every toast and reset ids so cases cannot leak into each other. */
export const __resetToasts = () => {
  toasts = [];
  seq = 1;
  emit();
};
