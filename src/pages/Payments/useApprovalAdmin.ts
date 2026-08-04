import { useCallback, useEffect, useRef, useState } from "react";

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
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "err" } | null>(
    null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, kind });
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { toast, flash };
}

/** Admin gate — mirrors approvals/permissions.py is_admin(). */
export function useIsApprovalAdmin(): boolean {
  const role = (localStorage.getItem("role") || "").toLowerCase().trim();
  return role === "admin";
}
