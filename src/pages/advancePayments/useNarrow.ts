import { useSyncExternalStore } from "react";

/** A phone: request lists become cards, nine columns do not fit. */
const NARROW = "(max-width: 767px)";

export function useNarrow(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = typeof window.matchMedia === "function" ? window.matchMedia(NARROW) : null;
      query?.addEventListener?.("change", notify);
      return () => query?.removeEventListener?.("change", notify);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(NARROW).matches,
    () => false,
  );
}
