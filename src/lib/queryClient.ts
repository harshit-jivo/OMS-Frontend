/**
 * The one QueryClient, and the defaults it is configured with.
 *
 * Every default below is a decision about THIS app, not a copy of the
 * library's. Writing them down here is the point of having one client: the
 * alternative is 220 call sites each deciding, implicitly, by what they
 * happened to put in a `useEffect`.
 */
import { QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

/**
 * How long a response stays fresh before a remount refetches it.
 *
 * 30 seconds, not 0. The screens here are navigated between constantly —
 * View_Orders → detail → back — and every one of those trips currently refires
 * the same list request. It is also not longer: this is an order system where
 * two people work the same queue, and a minute-old approval state is a minute
 * of somebody acting on a stale row.
 */
const STALE_TIME = 30_000;

/**
 * Do not retry what will not succeed.
 *
 * The library retries three times by default, which for a 403 means three
 * round trips before the user is told they lack permission, and for a 400 means
 * three attempts to submit an invalid payload. Only genuine transport failures
 * and 5xx are worth repeating; `api.ts` already handles 401 refresh itself, so
 * a 401 reaching here has already failed that.
 */
function retry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (isAxiosError(error)) {
    const status = error.response?.status;
    // No response at all — a dropped connection or a timeout. Worth retrying.
    if (status === undefined) return true;
    return status >= 500;
  }
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME,
        retry,
        // The default refetches every query whenever the tab regains focus.
        // On a dashboard with eight of them that is eight requests for
        // alt-tabbing to Excel and back, which people here do all day.
        // Screens that genuinely need live data ask for it explicitly with
        // `refetchInterval`, the way Tracker_Alerts does.
        refetchOnWindowFocus: false,
        // A remount SHOULD refetch, but only if the data is stale — which is
        // what `staleTime` above already decides.
        refetchOnMount: true,
      },
      mutations: {
        // A mutation is a write. Repeating one that failed at the server is
        // how an order gets submitted twice.
        retry: false,
      },
    },
  });
}
