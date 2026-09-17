/**
 * Open the production order a notification was about.
 *
 * `routeForNotification` gets the user to the right PAGE; this gets them to the
 * right ROW. Landing on a list of forty orders having been told one of them
 * needs you is only half an answer, and the half that still leaves you
 * searching.
 *
 * The id arrives as `?orderId=` and the detail dialog opens once. Two details
 * are load-bearing:
 *
 *   * It waits for `ready`. Both pages start empty and fill asynchronously, so
 *     acting immediately would always miss the list and always fall back to a
 *     second fetch.
 *
 *   * It prefers the row already on screen. On the approval desk, membership of
 *     the QUEUE is what proves the user may act, and the Approve and Reject
 *     buttons are rendered from the row in that table. An order fetched
 *     directly is not in the queue, so it opens read-only — which is correct
 *     for one that has since been decided or was never theirs.
 *
 * The param is cleared either way, so a refresh does not reopen a dialog the
 * user has closed.
 *
 * The BackDate equivalent is `pages/backdate/useDeepLinkedRequest.ts`. They are
 * separate because the two modules have different services and different id
 * params, not by oversight — but they must stay behaviourally identical, and a
 * change to one is a prompt to look at the other.
 */
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import {
  productionService,
  type ProductionOrder,
} from "../../services/productionService";

export function useDeepLinkedOrder(
  rows: ProductionOrder[],
  ready: boolean,
  open: (order: ProductionOrder) => void,
) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("orderId");

  // `rows` and `open` are new objects on most renders; holding them in refs
  // keeps this effect keyed on the id alone, so a background refresh of the
  // list cannot reopen the dialog under the user. Synced in effects, which run
  // before the one below on any render that changes them.
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
          next.delete("orderId");
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
    productionService
      .getOrder(id)
      .then((order) => {
        if (!cancelled) openRef.current(order);
      })
      // A 403 or 404 here is an ordinary outcome, not a failure to report: the
      // order was retired, or belongs to a company this user cannot see. The
      // page stays as it is rather than showing an error nobody can act on.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) clear();
      });

    return () => {
      cancelled = true;
    };
  }, [raw, ready, setParams]);
}

export default useDeepLinkedOrder;
