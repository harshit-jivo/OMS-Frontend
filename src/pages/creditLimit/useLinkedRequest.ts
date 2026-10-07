/**
 * Open the request a link points at — `?request=<id>`, which is where a
 * credit-limit notification lands (`utils/notificationRouting.ts`).
 *
 * Reacts to the parameter rather than reading it once, so a notification
 * clicked while the page is already open still opens its request. The
 * parameter is removed once handled, so a refresh does not reopen it.
 */
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import {
  creditLimitError,
  creditLimitService,
  type CreditLimitRequest,
} from "../../services/creditLimitService";

export function useLinkedRequest(
  onOpen: (request: CreditLimitRequest) => void,
  onError: (message: string) => void,
) {
  const [params, setParams] = useSearchParams();
  const linked = params.get("request");
  // Unmount, not a parameter change, is what should drop the answer: removing
  // `?request=` below re-runs this effect, and cancelling there would discard
  // the very fetch it started.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!linked) return;
    const id = Number(linked);
    const next = new URLSearchParams(params);
    next.delete("request");
    setParams(next, { replace: true });
    if (!Number.isInteger(id) || id <= 0) return;

    creditLimitService
      .getRequest(id)
      .then((request) => {
        if (mounted.current) onOpen(request);
      })
      .catch((e) => {
        if (mounted.current) onError(creditLimitError(e));
      });
    // Keyed on the linked id alone: `params`/`setParams` change identity on
    // every navigation and the callbacks are page setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);
}
