/**
 * WebDeviceService — the single home for all browser/device & app-version logic.
 *
 * Nothing outside this file should parse a User-Agent, read the version, or
 * touch the device id. Components ask this service. Future features (force
 * update, version check, session tracking, analytics, browser tracking) hang
 * off this service and must NOT require touching the auth flow again — see the
 * "Future extension points" note at the bottom.
 *
 * Responsibilities:
 *   1. Report the app version/build from the build-time constants (single
 *      source of truth: package.json -> vite `define` -> here).
 *   2. Own the stable, logout-surviving browser id.
 *   3. Detect browser / OS / locale / screen without any third-party parser.
 *   4. Register this browser with the backend after authentication —
 *      best-effort, never blocking, self-retrying on the next auth event.
 *   5. Supply version/device headers to the global axios interceptor.
 *
 * Mirrors the React Native DeviceService so both clients report an identical
 * contract; the detection heuristics below intentionally mirror the backend's
 * own UA parser (devices/utils.py) so client- and server-derived values agree.
 */
import api, { setAuthenticatedHandler, setDeviceHeaderProvider } from "./api";

// ---------------------------------------------------------------------------
// Constants — must match the backend's `platform` / `app_type` enums exactly.
// ---------------------------------------------------------------------------
const PLATFORM = "WEB";
// This deployment is the main web app. A separate admin/partner portal would
// report ADMIN_WEB / PARTNER_WEB — the backend enum already supports both.
const APP_TYPE = "WEB";

const DEVICE_ID_KEY = "device_id";
const LAST_SYNC_KEY = "device_last_sync";

/** Everything we know about this browser. Superset of what the backend stores. */
export interface WebDeviceInfo {
  device_id: string;
  platform: string;
  app_type: string;
  app_version: string;
  build_number: number;
  browser_name: string;
  browser_version: string;
  os_name: string;
  os_version: string;
  language: string;
  timezone: string;
  screen_resolution: string;
  viewport_size: string;
  user_agent: string;
}

/** The subset the backend's /devices/register/ serializer accepts. */
interface DeviceRegistrationPayload {
  device_id: string;
  platform: string;
  app_type: string;
  app_version: string;
  build_number: number;
  os_name: string;
  os_version: string;
  language: string;
  timezone: string;
}

// ---------------------------------------------------------------------------
// Module state (private; `webDeviceService` below is the only public surface).
// ---------------------------------------------------------------------------
let cachedDeviceId: string | null = null;
let initialized = false;
let registeredThisSession = false;
let registerInFlight: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Storage helpers. localStorage can throw (Safari private mode, disabled
// storage), so every access is guarded — the app must work regardless.
// ---------------------------------------------------------------------------
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — we degrade to an in-memory id for this session */
  }
}

// ---------------------------------------------------------------------------
// Device id — created once, then stable for the life of the browser profile.
// Deliberately NOT in the auth key lists that logout clears (see api.ts
// AUTH_STORAGE_KEYS and Sidebar clearSessionStorage), so logging out never
// mints a phantom device.
// ---------------------------------------------------------------------------
function uuid(): string {
  // crypto.randomUUID is available in all modern browsers on secure origins
  // (https + localhost). The manual fallback covers non-secure origins and
  // older Safari — this is an opaque identifier, not a secret, so
  // Math.random-based generation is acceptable there.
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the manual generator */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Get-or-create the stable browser id. Synchronous (localStorage is sync). */
function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  let id = safeGet(DEVICE_ID_KEY);
  if (!id) {
    id = uuid();
    safeSet(DEVICE_ID_KEY, id);
  }
  cachedDeviceId = id;
  return id;
}

// ---------------------------------------------------------------------------
// Browser / OS detection.
//
// Plain User-Agent parsing, no third-party dependency. Order matters: Edge,
// Opera and Samsung Internet all put "Chrome" in their UA, and Chrome puts
// "Safari" in its own — so the most specific pattern must win first. This is
// the same ordering the backend uses, so both agree on the same UA.
// ---------------------------------------------------------------------------
const BROWSER_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
  ["Opera", /OPR\/([\d.]+)/],
  ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
  ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
  ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
  ["Safari", /Version\/([\d.]+).*Safari/],
];

const OS_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Windows", /Windows NT ([\d.]+)/],
  ["Android", /Android ([\d.]+)/],
  ["iOS", /(?:iPhone|iPad); CPU (?:iPhone )?OS ([\d_]+)/],
  ["macOS", /Mac OS X ([\d_]+)/],
  ["Linux", /(Linux)/],
];

function getUserAgent(): string {
  try {
    return navigator.userAgent || "";
  } catch {
    return "";
  }
}

/** `{name, version}` for the current browser; blanks when unrecognised. */
function getBrowser(): { name: string; version: string } {
  const ua = getUserAgent();
  for (const [name, pattern] of BROWSER_PATTERNS) {
    const match = pattern.exec(ua);
    if (match) return { name, version: match[1] };
  }
  return { name: "", version: "" };
}

/** `{name, version}` for the current OS; blanks when unrecognised. */
function getOs(): { name: string; version: string } {
  const ua = getUserAgent();
  for (const [name, pattern] of OS_PATTERNS) {
    const match = pattern.exec(ua);
    if (match) {
      const version = name === "Linux" ? "" : match[1].replace(/_/g, ".");
      return { name, version };
    }
  }
  return { name: "", version: "" };
}

function getLanguage(): string {
  try {
    return navigator.language || "";
  } catch {
    return "";
  }
}

function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function getScreenResolution(): string {
  try {
    return `${window.screen.width}x${window.screen.height}`;
  } catch {
    return "";
  }
}

function getViewportSize(): string {
  try {
    return `${window.innerWidth}x${window.innerHeight}`;
  } catch {
    return "";
  }
}

function getAppVersion(): string {
  return __APP_VERSION__;
}

function getBuildNumber(): number {
  // Backend requires build_number >= 1.
  return Number.isFinite(__APP_BUILD_NUMBER__) && __APP_BUILD_NUMBER__ >= 1
    ? __APP_BUILD_NUMBER__
    : 1;
}

/** Everything we can observe about this browser. */
function getInfo(): WebDeviceInfo {
  const browser = getBrowser();
  const os = getOs();
  return {
    device_id: getDeviceId(),
    platform: PLATFORM,
    app_type: APP_TYPE,
    app_version: getAppVersion(),
    build_number: getBuildNumber(),
    browser_name: browser.name,
    browser_version: browser.version,
    os_name: os.name,
    os_version: os.version,
    language: getLanguage(),
    timezone: getTimezone(),
    screen_resolution: getScreenResolution(),
    viewport_size: getViewportSize(),
    user_agent: getUserAgent(),
  };
}

/**
 * The registration body.
 *
 * Only the fields the backend's serializer accepts are sent — field widths are
 * clamped to the backend column limits. Browser name/version are deliberately
 * NOT sent: the backend derives them from the User-Agent header (which the
 * browser always sends) so the value can't be spoofed by the client.
 * screen/viewport/user_agent are collected for display and future analytics but
 * have no backend column yet, so sending them would be silently dropped.
 */
function getRegistrationPayload(): DeviceRegistrationPayload {
  const info = getInfo();
  return {
    device_id: info.device_id,
    platform: info.platform,
    app_type: info.app_type,
    app_version: info.app_version.slice(0, 20),
    build_number: info.build_number,
    os_name: info.os_name.slice(0, 20),
    os_version: info.os_version.slice(0, 20),
    language: info.language.slice(0, 10),
    timezone: info.timezone.slice(0, 64),
  };
}

/** ISO timestamp of the last successful registration, or null. */
function getLastSync(): string | null {
  return safeGet(LAST_SYNC_KEY);
}

/** Read-only summary for the Profile page. */
function getSummary(): WebDeviceInfo & { last_sync: string | null } {
  return { ...getInfo(), last_sync: getLastSync() };
}

// ---------------------------------------------------------------------------
// Headers — handed synchronously to the global axios request interceptor so
// every request carries version/device metadata from one place.
// ---------------------------------------------------------------------------
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-App-Version": getAppVersion(),
    "X-Build-Number": String(getBuildNumber()),
    "X-Platform": PLATFORM,
    "X-App-Type": APP_TYPE,
  };
  const os = getOs();
  if (os.version) headers["X-OS-Version"] = os.version;
  const id = getDeviceId();
  if (id) headers["X-Device-Id"] = id;
  return headers;
}

// ---------------------------------------------------------------------------
// Backend registration — best-effort, never throws, never blocks login.
// The endpoint is an idempotent upsert, so repeat calls are safe and cheap.
// ---------------------------------------------------------------------------
async function register(): Promise<void> {
  const payload = getRegistrationPayload();
  try {
    await api.post("/devices/register/", payload);
    registeredThisSession = true;
    safeSet(LAST_SYNC_KEY, new Date().toISOString());
  } catch (error) {
    // Covers 401/403 (not yet authenticated), 4xx and network failures alike.
    // We leave `registeredThisSession` false so the next successful
    // authentication retries. Never rethrown — this is telemetry, not a
    // feature the user is waiting on.
    console.warn(
      "WebDeviceService: registration failed; will retry on next authenticated session",
      error,
    );
  }
}

/**
 * Call after any successful authentication event.
 *   • 'login'   — always (re)assert; the signed-in user may have changed.
 *   • 'startup' — an authenticated page mounted; register once per page load.
 *   • 'refresh' — token refreshed; the automatic retry path.
 * Never awaited by callers, never throws.
 */
async function onAuthenticated(
  trigger: "login" | "startup" | "refresh" = "login",
): Promise<void> {
  try {
    init();
    // Only an explicit login forces a re-assert. Otherwise one success per page
    // load is enough — this keeps route changes (which remount the shell) from
    // re-POSTing on every navigation.
    if (trigger !== "login" && registeredThisSession) return;
    if (!registerInFlight) {
      registerInFlight = register().finally(() => {
        registerInFlight = null;
      });
    }
    await registerInFlight;
  } catch (error) {
    console.warn("WebDeviceService: onAuthenticated error (non-blocking)", error);
  }
}

/** Reset per-session state on logout. The device id is deliberately kept. */
function reset(): void {
  registeredThisSession = false;
}

/**
 * One-time wiring: register this service with the axios layer (header provider
 * + post-refresh retry hook). Idempotent; safe to call from app bootstrap
 * before any login. Synchronous — localStorage needs no await.
 */
function init(): void {
  if (initialized) return;
  initialized = true;
  setDeviceHeaderProvider(getHeaders);
  setAuthenticatedHandler(() => {
    void onAuthenticated("refresh");
  });
}

export const webDeviceService = {
  init,
  onAuthenticated,
  register,
  reset,
  getDeviceId,
  getInfo,
  getSummary,
  getHeaders,
  getLastSync,
  // Individual reporters for any caller that needs just one value.
  getAppVersion,
  getBuildNumber,
  getBrowser,
  getOs,

  // ---- Future extension points (intentionally not implemented in Phase 4) ----
  // These belong HERE so no future feature needs to touch the auth flow again:
  //   • checkForUpdate()   -> GET /app/version/ + compare (force/optional UI)
  //   • trackSession()     -> heartbeat / last-active pings
  //   • reportAnalytics()  -> screen/viewport/UA are already collected above
};

export default webDeviceService;
