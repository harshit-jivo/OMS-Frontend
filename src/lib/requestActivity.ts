/**
 * How many API requests are in flight, for the app-wide loading cover.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A COUNTER AND NOT A FLAG PER SCREEN
 * ─────────────────────────────────────────────────────────────────────────
 * There are ~280 API calls across 31 files. Most list screens do show a
 * skeleton while they load, but nothing showed feedback for the calls that
 * are not a first page load: a filter change that refetches, a save, an
 * approve, a rate revision, a sync. Those are exactly the calls a user waits
 * on with no idea whether the click registered.
 *
 * Giving each one its own indicator is 280 chances to forget. Every one of
 * them goes through the single axios instance in `services/api.ts`, so that
 * interceptor pair is the one place that can see all of them, and it reports
 * here. A call added tomorrow is covered without anyone remembering to.
 *
 * A COUNT rather than a boolean because requests overlap constantly — a page
 * mount fires four in parallel, and a boolean set by the first to finish
 * would hide the cover while three were still running.
 *
 * This deliberately does NOT replace the per-screen skeletons. A skeleton
 * says "this table is coming and here is its shape"; the cover says "the app is
 * talking to the server". They answer different questions, and the pages that
 * have a skeleton keep it.
 *
 * The listener-set shape mirrors `lib/toastStore.ts`, which is how this app
 * already shares state that lives outside React's tree — here it must, because
 * the producer is an axios interceptor and not a component.
 */

let inFlight = 0;
const listeners = new Set<(count: number) => void>();

const emit = () => listeners.forEach((listener) => listener(inFlight));

/** A request left the client. Called from the request interceptor. */
export const requestStarted = () => {
  inFlight += 1;
  emit();
};

/**
 * A request came back, failed, or was abandoned.
 *
 * Clamped at zero rather than trusting the pairing. The interceptors are
 * balanced (see `services/api.ts`), but a cover stuck on screen because the
 * count drifted negative is a visible bug in every corner of the app, and a
 * guard here is cheaper than being sure forever.
 */
export const requestSettled = () => {
  if (inFlight === 0) return;
  inFlight -= 1;
  emit();
};

/**
 * The count right now.
 *
 * The bar needs this at mount as well as on change: the shell's own fetches
 * start before it renders, so a subscription alone would miss a request that
 * was already running and only ever hear about it settling.
 */
export const getInFlightCount = () => inFlight;

export const subscribeToRequestActivity = (
  listener: (count: number) => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Test-only: forget every in-flight request so cases cannot leak into each other. */
export const __resetRequestActivity = () => {
  inFlight = 0;
  emit();
};
