import { useCallback, useEffect, useRef, useState } from "react";

import { useAction } from "../../auth/actions";
import { showToast } from "@/lib/toastStore";

/**
 * Minimal async-resource hook.
 *
 * The app has no React Query, so this is the one place load/error/refetch
 * bookkeeping lives — every tab in the Approval console uses it instead of
 * repeating the same useState/useEffect triple.
 */
export interface Resource<T> {
  data: T;
  loading: boolean;
  /** Empty string when the last load succeeded. */
  error: string;
  reload: () => void;
  /** Local mutation, for optimistic updates before a reload confirms. */
  set: (next: T) => void;
}

/** Turn any axios/DRF failure into a message worth showing a user. */
export function messageFrom(err: unknown, fallback = "Something went wrong"): string {
  const res = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (!res) return "Network error — check your connection and try again.";
  if (res.status === 403) return "You do not have permission to do this.";
  if (res.status === 404) return "Not found — it may have been deleted.";

  const data = res.data as Record<string, unknown> | string | undefined;
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    const detail = (data as { detail?: string; message?: string }).detail
      ?? (data as { message?: string }).message;
    if (detail) return detail;

    // DRF field errors: {"code": ["This field must be unique."]}
    const errors = (data as { errors?: Record<string, unknown> }).errors ?? data;
    const first = Object.entries(errors)[0];
    if (first) {
      const [field, value] = first;
      const text = Array.isArray(value) ? String(value[0]) : String(value);
      return field === "detail" ? text : `${field}: ${text}`;
    }
  }
  return fallback;
}

export function useResource<T>(
  loader: () => Promise<T>,
  initial: T,
  deps: unknown[] = [],
): Resource<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  // Guards against a slow first response overwriting a newer one, and against
  // setting state on an unmounted component.
  const runId = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const id = ++runId.current;
    setLoading(true);
    loader()
      .then((result) => {
        if (!alive.current || id !== runId.current) return;
        setData(result);
        setError("");
      })
      .catch((err) => {
        if (!alive.current || id !== runId.current) return;
        setError(messageFrom(err, "Failed to load"));
      })
      .finally(() => {
        if (!alive.current || id !== runId.current) return;
        setLoading(false);
      });
    // `loader` is intentionally excluded — callers pass an inline closure, so
    // including it would refetch on every render. `deps` is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, loading, error, reload, set: setData };
}

/** Transient success/failure banner. */
export function useToast() {
  /*
   * The console had its OWN toast: a piece of state, a 3s timer, a cleanup
   * effect, and a fixed-position div rendered by the shell. That made two
   * toast stacks in one app — this one and `lib/toastStore` — which could
   * show two unrelated messages in two different corners at once.
   *
   * `flash(text, kind)` keeps its signature, because roughly twenty call
   * sites across five tabs pass it down as a prop. It just goes to the real
   * toaster now. `toast` stays in the return so those files still destructure
   * cleanly; it is always null, and the shell no longer renders anything for
   * it.
   */
  const flash = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    showToast({ title: kind === "err" ? "Could not save" : "Saved", message: text });
  }, []);

  return { toast: null, flash };
}


/**
 * Config-edit gate — mirrors approvals/permissions.py IsApprovalAdmin.
 *
 * Now a one-line delegation to the shared action table, which is the whole
 * point of that table: the rule ("an admin, or a holder of Payments_Dashboard")
 * is written once, next to a note saying which server class enforces it, and
 * this file no longer carries a second opinion that could drift from it.
 *
 * What the old implementation got wrong, and why it is worth spelling out
 * -------------------------------------------------------------------------
 * It read `localStorage` directly, and so:
 *
 *   * `role === "admin"` missed an admin granted through `extra_roles`, and
 *     missed `is_superuser` / `is_staff` entirely — all three of which the
 *     server's `core.permissions.is_admin` accepts. Those users saw the
 *     configuration tabs in read-only mode over an API that would have let
 *     them write.
 *   * it parsed `extra_pages` itself, in a `try/catch` that treated corrupt
 *     JSON as "no grant" — correct, but a fourth place doing the same parse.
 *   * it answered from storage rather than from the resolved session, so it
 *     could not distinguish "not permitted" from "profile still loading".
 *
 * It remains a UX gate, not a security boundary: the server re-checks the same
 * key on every write, so a tampered session buys a live-looking form and a 403
 * on save.
 */
export function useIsApprovalAdmin(): boolean {
  return useAction("approvals.configure");
}
