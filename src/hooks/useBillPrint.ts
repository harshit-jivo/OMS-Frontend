/**
 * React lifecycle around a bill-print blob: object URLs, and opening one in a
 * new tab without tripping the popup blocker.
 *
 * Split from `services/invoicePrint.ts` so the network half stays testable
 * without React, and so the object-URL bookkeeping — which is where a blob
 * fetch leaks memory — lives in exactly one place.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  billPrintError,
  billPrintFilename,
  fetchBillPrint,
  type BillPrintRef,
} from "../services/invoicePrint";

/**
 * Open a bill print in a new tab.
 *
 * The window is opened SYNCHRONOUSLY, before the request, and pointed at the
 * blob afterwards. That ordering is the whole trick: a browser allows
 * `window.open` only while it can still attribute the call to the click that
 * caused it, and an `await` ends that attribution — so opening the tab after
 * the fetch is blocked as a popup on default settings.
 *
 * If the blocker refuses even the synchronous open (some configurations block
 * unconditionally), it falls back to a download, which is the same document by
 * another route rather than a dead end.
 *
 * Returns an error message, or "" on success.
 */
export async function openBillPrint(ref: BillPrintRef): Promise<string> {
  const tab = window.open("", "_blank", "noopener,noreferrer");

  let blob: Blob;
  try {
    blob = await fetchBillPrint(ref);
  } catch (error) {
    tab?.close();
    return billPrintError(error);
  }

  const url = URL.createObjectURL(blob);
  if (tab && !tab.closed) {
    tab.location.href = url;
    // Not revoked on a timer: the new tab is still reading from this URL, and
    // revoking early leaves it blank. The browser reclaims it when the
    // document that created it goes away.
    return "";
  }

  // Popup blocked. A download is the same document by another route.
  const link = document.createElement("a");
  link.href = url;
  link.download = billPrintFilename(ref);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safe here: the download has been handed to the browser by this point.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "";
}

export interface BillPrintPreview {
  /** Object URL for an `<iframe src>`, or "" when nothing is loaded. */
  url: string;
  loading: boolean;
  /** Empty when the last load succeeded. */
  error: string;
  /** Fetch (or re-fetch) a print. Passing null clears the preview. */
  load: (ref: BillPrintRef | null) => void;
}

/**
 * A bill print held as an object URL, for embedding in an `<iframe>`.
 *
 * Revokes the previous URL on every replacement and on unmount. Without that,
 * each preview pins its PDF in memory for the life of the tab — and a user
 * checking twenty invoices in a sitting is exactly the expected workload.
 */
export function useBillPrint(): BillPrintPreview {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // The URL currently held, so it can be revoked from a cleanup that must not
  // depend on the render that created it.
  const held = useRef("");
  // Guards against a slow first request overwriting a newer one.
  const runId = useRef(0);
  const alive = useRef(true);

  const replace = useCallback((next: string) => {
    if (held.current) URL.revokeObjectURL(held.current);
    held.current = next;
    setUrl(next);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (held.current) URL.revokeObjectURL(held.current);
      held.current = "";
    };
  }, []);

  const load = useCallback(
    (ref: BillPrintRef | null) => {
      const mine = ++runId.current;

      if (!ref) {
        replace("");
        setError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      void (async () => {
        try {
          const blob = await fetchBillPrint(ref);
          if (!alive.current || mine !== runId.current) return;
          replace(URL.createObjectURL(blob));
        } catch (err) {
          const message = await billPrintError(err);
          if (!alive.current || mine !== runId.current) return;
          replace("");
          setError(message);
        } finally {
          if (alive.current && mine === runId.current) setLoading(false);
        }
      })();
    },
    [replace],
  );

  return { url, loading, error, load };
}
