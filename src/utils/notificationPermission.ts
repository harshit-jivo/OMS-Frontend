/**
 * Persistence + decision logic for our custom "explain first" web
 * notification-permission prompt (Phase: permission UX).
 *
 * We NEVER call Notification.requestPermission() automatically — this state
 * decides when to show OUR modal; the OS dialog only fires from the modal's
 * "Allow Notifications" button.
 */

export type PermissionPromptStatus =
  | "never_asked"
  | "dismissed"
  | "granted"
  | "denied";

export type PermissionPromptState = {
  status: PermissionPromptStatus;
  lastPromptAt: number | null;
  dismissCount: number;
};

const STORAGE_KEY = "oms_notif_permission_state";
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_STATE: PermissionPromptState = {
  status: "never_asked",
  lastPromptAt: null,
  dismissCount: 0,
};

export const getPromptState = (): PermissionPromptState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return {
      status: parsed.status ?? "never_asked",
      lastPromptAt:
        typeof parsed.lastPromptAt === "number" ? parsed.lastPromptAt : null,
      dismissCount:
        typeof parsed.dismissCount === "number" ? parsed.dismissCount : 0,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
};

export const savePromptState = (patch: Partial<PermissionPromptState>): void => {
  try {
    const next = { ...getPromptState(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota/serialization errors */
  }
};

/**
 * Whether to show OUR modal now, given the current OS permission.
 *
 * - granted / unsupported → never (Task 6/7).
 * - denied → never auto-show; the browser won't reopen its dialog, so the
 *   Settings section surfaces re-enable instructions instead (Task 4).
 * - never_asked → show.
 * - dismissed → only after 7 days (Task 5).
 */
export const shouldShowPrompt = (
  osPermission: NotificationPermission | "unsupported",
): boolean => {
  if (osPermission === "granted" || osPermission === "unsupported") return false;
  if (osPermission === "denied") return false;

  const state = getPromptState();
  if (state.status === "granted") return false;
  if (state.status === "never_asked") return true;
  if (!state.lastPromptAt) return true;
  return Date.now() - state.lastPromptAt >= SEVEN_DAYS_MS;
};
