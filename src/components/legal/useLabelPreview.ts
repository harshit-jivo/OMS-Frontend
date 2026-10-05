import { useEffect, useState } from "react";

import api from "../../services/api";
import { toBasePath } from "../../services/apiPaths";

/**
 * The label artwork, fetched with the access token attached.
 *
 * THE BUG THIS FIXES
 * ------------------
 * `image_url` used to be a media path and went straight into `<img src>`.
 * That worked in development and showed a broken-image icon on the deployed
 * server, because Django serves `MEDIA_URL` only under `DEBUG` — so the one
 * place the compliance record is actually read was the one place the label
 * could not be seen. The backend now streams the artwork from an
 * authenticated endpoint (`legal/previews.py` has the full reasoning).
 *
 * Which moves the problem here: an `<img src>` is a browser fetch, and the
 * browser attaches cookies and nothing else. This project authenticates with
 * `JWTAuthentication` ALONE — only our axios interceptor adds the header — so
 * the request would arrive anonymous and be refused. `invoicePrint.ts` hit
 * exactly this with an `<iframe src>` and its docstring is the long version.
 *
 * So the bytes come through axios and the `<img>` is pointed at an object
 * URL. The shared pipeline comes with them: the token is attached, a 401
 * refreshes and retries once instead of leaving a permanently broken image,
 * and the correlation ID makes a failure findable in the server log.
 *
 * An absolute URL is passed straight through and never fetched — if media
 * ever moves to a CDN, the browser should load it directly rather than have
 * this app proxy bytes it has no need to touch.
 */

type Preview = {
  /** What to put in `<img src>`. "" until it is ready, or on failure. */
  src: string;
  loading: boolean;
  /** Set when the artwork could not be fetched; "" otherwise. */
  error: string;
};

const ABSOLUTE = /^https?:\/\//i;

export default function useLabelPreview(url: string | undefined | null): Preview {
  const path = (url ?? "").trim();
  const direct = ABSOLUTE.test(path);

  const [src, setSrc] = useState(direct ? path : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!path) {
      setSrc("");
      setLoading(false);
      setError("");
      return;
    }
    if (direct) {
      setSrc(path);
      setLoading(false);
      setError("");
      return;
    }

    // Not `setSrc("")` here: blanking first makes an already-rendered label
    // flash empty whenever the component re-renders with the same url. The
    // object URL is replaced when the new one arrives.
    let objectUrl = "";
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const response = await api.get<Blob>(toBasePath(path), {
          responseType: "blob",
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data);
        setSrc(objectUrl);
      } catch {
        if (cancelled) return;
        // Deliberately not the server's message: every failure here reads the
        // same to a reviewer — the label is not on screen — and the one thing
        // worth saying is that the report beside it is still valid.
        setSrc("");
        setError("The label artwork could not be loaded. The findings below are unaffected.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // Revoking is not housekeeping: a label preview is a megabyte or so of
      // PNG, and an object URL pins it in memory for the lifetime of the
      // document. A reviewer opening twenty checks would hold all twenty.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, direct]);

  return { src, loading, error };
}
