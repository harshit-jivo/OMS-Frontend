/**
 * Open the payment request a link points at — `?request=<id>`, which is where
 * an advance-payment notification lands (`notificationRoutes.ts`).
 *
 * Reacts to the parameter rather than reading it once, so a notification
 * clicked while the page is already open still opens its request. The
 * parameter is removed once handled, so a refresh does not reopen it. The
 * request's own screen loads it, and the server decides who may see it.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export function useLinkedRequest(onOpen: (id: number) => void) {
  const [params, setParams] = useSearchParams();
  const linked = params.get("request");

  useEffect(() => {
    if (!linked) return;
    const next = new URLSearchParams(params);
    next.delete("request");
    setParams(next, { replace: true });
    const id = Number(linked);
    if (Number.isInteger(id) && id > 0) onOpen(id);
  }, [linked]); // eslint-disable-line react-hooks/exhaustive-deps
}
