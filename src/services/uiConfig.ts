/**
 * uiConfig — dynamic UI field labels served by the backend.
 *
 * Admins edit field labels (e.g. "Price List" → "Distributor Price") from the
 * dashboard; every client renders the current wording without a code change or
 * redeploy. The rules for this module:
 *
 *   • Fetch the label map ONCE after login (see `loadUILabels`) — never per page.
 *   • Read labels synchronously anywhere via `getLabel(key, fallback)`.
 *   • React components subscribe with `useUILabels()` so they re-render the
 *     instant an admin save refreshes the cache (optimistic UI).
 *
 * State lives in a tiny module-level external store — the same pattern as
 * NotificationToaster — plus a localStorage mirror so a page reload paints the
 * last-known labels immediately (before the network round-trip completes).
 */
import { useSyncExternalStore } from "react";

import api from "./api";

/** Flat map the backend returns: { field_key: display_name }. */
export type UILabelMap = Record<string, string>;

const STORAGE_KEY = "ui_labels";
const ENDPOINT = "/ui-config/labels/";

// ---------------------------------------------------------------------------
// External store
// ---------------------------------------------------------------------------
let labels: UILabelMap = readPersisted();
let loadPromise: Promise<UILabelMap> | null = null;
const listeners = new Set<() => void>();

function readPersisted(): UILabelMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as UILabelMap) : {};
  } catch {
    return {};
  }
}

function setLabels(next: UILabelMap) {
  labels = next || {};
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
  } catch {
    /* persistence is best-effort only */
  }
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The current label map (may be stale/empty before the first load). Prefer
 * `getLabel` for individual reads so a missing key always has a fallback.
 */
export const getUILabels = (): UILabelMap => labels;

/**
 * Resolve a single label. `fallback` is the original hardcoded English so the
 * UI is always correct even before labels load or if a key is absent/inactive.
 */
export const getLabel = (key: string, fallback: string): string => {
  const value = labels[key];
  return typeof value === "string" && value.trim() ? value : fallback;
};

/**
 * Fetch the label map once and cache it. Safe to call repeatedly — concurrent
 * calls share one in-flight request, and it never throws (a failed fetch just
 * keeps the last-known/empty map so the UI falls back to the hardcoded text).
 * Call this fire-and-forget after login and on authenticated startup.
 */
export const loadUILabels = (force = false): Promise<UILabelMap> => {
  if (!force && loadPromise) return loadPromise;
  loadPromise = api
    .get<UILabelMap>(ENDPOINT)
    .then((res) => {
      const data = res.data && typeof res.data === "object" ? res.data : {};
      setLabels(data);
      return data;
    })
    .catch(() => labels)
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
};

/**
 * Merge a freshly-saved label into the cache immediately (optimistic refresh
 * after an admin edit) so open screens update without a reload or refetch.
 */
export const applyLabelUpdate = (fieldKey: string, displayName: string) => {
  setLabels({ ...labels, [fieldKey]: displayName });
};

/** Drop a key from the cache (e.g. after an admin delete/deactivate). */
export const removeLabel = (fieldKey: string) => {
  if (!(fieldKey in labels)) return;
  const next = { ...labels };
  delete next[fieldKey];
  setLabels(next);
};

/** Clear everything (call on logout so a new user starts clean). */
export const clearUILabels = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  setLabels({});
};

// ---------------------------------------------------------------------------
// React binding
// ---------------------------------------------------------------------------
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/**
 * Subscribe a component to the label map. Returns a `t(key, fallback)` reader
 * that re-renders the component whenever labels change.
 *
 *   const { t } = useUILabels();
 *   <label>{t("price_list", "Price List")}</label>
 */
export const useUILabels = () => {
  const map = useSyncExternalStore(subscribe, getUILabels, getUILabels);
  const t = (key: string, fallback: string): string => {
    const value = map[key];
    return typeof value === "string" && value.trim() ? value : fallback;
  };
  return { labels: map, t };
};

// ---------------------------------------------------------------------------
// Admin CRUD — used only by the UI Label Management page (admin only).
// ---------------------------------------------------------------------------

/** Full label row as returned by the admin endpoints. */
export interface UILabelRow {
  id: number;
  field_key: string;
  display_name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UILabelInput {
  field_key?: string;
  display_name: string;
  description?: string;
  is_active?: boolean;
}

/** Unwrap the backend's `{success, message, data}` admin envelope. */
const unwrap = <T,>(payload: any): T =>
  (payload && "data" in payload ? payload.data : payload) as T;

export const uiLabelAdminService = {
  listLabels: async (): Promise<UILabelRow[]> => {
    const res = await api.get("/ui-config/admin/labels/");
    return unwrap<UILabelRow[]>(res.data) ?? [];
  },

  createLabel: async (data: UILabelInput): Promise<UILabelRow> => {
    const res = await api.post("/ui-config/admin/labels/", data);
    return unwrap<UILabelRow>(res.data);
  },

  updateLabel: async (
    id: number,
    data: Partial<UILabelInput>,
  ): Promise<UILabelRow> => {
    const res = await api.put(`/ui-config/admin/labels/${id}/`, data);
    return unwrap<UILabelRow>(res.data);
  },

  deleteLabel: async (id: number): Promise<void> => {
    await api.delete(`/ui-config/admin/labels/${id}/`);
  },
};
