/**
 * Open the request a notification was about.
 *
 * `routeForNotification` gets the user to the right PAGE; this gets them to the
 * right ROW. Landing on a list of forty requests having been told one of them
 * needs you is only half an answer, and the half that still leaves you
 * searching.
 *
 * The id arrives as `?requestId=` and the detail dialog opens once. Two details
 * are load-bearing:
 *
 *   * It waits for `ready`. Both pages start with an empty `rows` and fill it
 *     asynchronously, so acting immediately would always miss the list and
 *     always fall back to a second fetch — wasteful, and on the approval desk
 *     actively wrong (see below).
 *
 *   * It prefers the row already on screen. On the approval desk, membership of
 *     `rows` via the QUEUE is what proves the user may act, and the Approve and
 *     Reject buttons are shown from that. A request fetched directly is not in
 *     the queue set, so it opens read-only — which is correct for a request
 *     that has since been decided or was never theirs, and would be quietly
 *     wrong for one they are still holding.
 *
 * The param is cleared either way, so a refresh does not reopen a dialog the
 * user has closed.
 */
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import backdateService, {
  type BackDateRequest,
} from "../../services/backdateService";

export function useDeepLinkedRequest(
  rows: BackDateRequest[],
  ready: boolean,
  open: (request: BackDateRequest) => void,
) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("requestId");

  // `rows` and `open` are new objects on most renders; holding them in refs
  // keeps this effect keyed on the id alone, so a background refresh of the
  // list cannot reopen the dialog under the user.
  // Synced in an effect, not during render. These run before the effect below
  // on any render that changes them, so it always reads the current list.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!raw || !ready || handled.current === raw) return;
    handled.current = raw;

    const clear = () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("requestId");
          return next;
        },
        { replace: true },
      );

    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      clear();
      return;
    }

    const onScreen = rowsRef.current.find((row) => row.id === id);
    if (onScreen) {
      openRef.current(onScreen);
      clear();
      return;
    }

    let cancelled = false;
    backdateService
      .getRequest(id)
      .then((request) => {
        if (!cancelled) openRef.current(request);
      })
      // A 403 or 404 here is an ordinary outcome, not a failure to report: the
      // request was deleted, or belongs to someone else. The page stays as it
      // is rather than showing an error the user can do nothing about.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) clear();
      });

    return () => {
      cancelled = true;
    };
  }, [raw, ready, setParams]);
}

export default useDeepLinkedRequest;
