/**
 * deviceAdminService — API calls for the Device Management admin page. Uses the
 * shared axios instance, so auth, refresh-on-401 and the version/device headers
 * all come for free.
 *
 * All list endpoints are server-paginated/filtered/searched: the device table
 * grows one row per user per device, so the browser never receives all of it.
 */
import api from "./api";

/** Derived activity status. Computed by the SERVER from last_active — never
 *  stored, and never recomputed in the browser (a skewed client clock would
 *  disagree with the server-side ?status= filter). */
export type DeviceStatus = "online" | "idle" | "offline" | "inactive";

export type DeviceRow = {
  id: number;
  device_id: string;
  user_id: number;
  username: string;
  user_name: string;
  email: string;
  role: string;
  status: DeviceStatus;
  /** "latest" | "old" vs the active version policy for this device's platform;
   *  "unknown" when the platform has no policy (or is web). Server-derived. */
  update_status: "latest" | "old" | "unknown";
  platform: string;
  app_type: string;
  app_version: string;
  build_number: number;
  device_name: string;
  manufacturer: string;
  device_model: string;
  browser_name: string;
  browser_version: string;
  os_name: string;
  os_version: string;
  language: string;
  timezone: string;
  first_login: string | null;
  last_login: string | null;
  last_active: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Pagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type DeviceFilters = {
  page?: number;
  page_size?: number;
  search?: string;
  /** online | idle | offline | inactive — translated server-side to a
   *  last_active window. An unknown value is ignored by the API. */
  status?: string;
  platform?: string;
  app_type?: string;
  app_version?: string;
  build_number?: string;
  browser_name?: string;
  os_name?: string;
  is_active?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
  ordering?: string;
};

export type StatusCounts = Record<DeviceStatus, number>;

export type StatusThresholds = {
  online_within_minutes: number;
  idle_within_minutes: number;
  inactive_after_days: number;
};

export type AnalyticsCards = {
  total_devices: number;
  active_devices: number;
  inactive_devices: number;
  mobile_devices: number;
  web_devices: number;
  android_devices: number;
  ios_devices: number;
  desktop_browsers: number;
  devices_active_today: number;
  /** Derived activity buckets; always sum to total_devices. */
  status_counts: StatusCounts;
  /** The server's rule set, so the UI can explain itself without hardcoding. */
  status_thresholds: StatusThresholds;
  /** Latest-vs-old device counts per mobile platform, vs the active policy. */
  version_policy: Record<MobilePlatform, VersionPolicyStat>;
};

export type MobilePlatform = "ANDROID" | "IOS";

export type VersionPolicyStat = {
  required_build: number | null;
  required_version: string | null;
  total: number;
  latest: number;
  old: number;
};

/** One bar in the version-adoption chart. */
export type AdoptionBuild = {
  build_number: number;
  devices: number;
  users: number;
};

export type PlatformAdoption = {
  required_build: number | null;
  builds: AdoptionBuild[];
};

/** An editable mobile version policy (ANDROID / IOS). */
export type VersionPolicy = {
  id: number;
  platform: MobilePlatform;
  required_version: string;
  required_build: number;
  store_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CountRow = Record<string, string | number> & { count: number };

export type AnalyticsCharts = {
  version_distribution: CountRow[];
  platform_distribution: CountRow[];
  app_type_distribution: CountRow[];
  browser_distribution: CountRow[];
  os_distribution: CountRow[];
  devices_by_last_seen: { date: string; count: number }[];
  version_adoption: Record<MobilePlatform, PlatformAdoption>;
};

export type Analytics = { cards: AnalyticsCards; charts: AnalyticsCharts };

/** Drop empty values so we never send `?platform=` and filter on "". */
const clean = (params: Record<string, unknown>) => {
  const out: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      out[key] = String(value);
    }
  });
  return out;
};

export const deviceAdminService = {
  async listDevices(
    filters: DeviceFilters,
  ): Promise<{ results: DeviceRow[]; pagination: Pagination }> {
    const res = await api.get("/admin/devices/", { params: clean(filters) });
    return res.data.data;
  },

  async getDevice(id: number): Promise<DeviceRow> {
    const res = await api.get(`/admin/devices/${id}/`);
    return res.data.data;
  },

  async getAnalytics(days?: number): Promise<Analytics> {
    const res = await api.get("/admin/devices/analytics/", {
      params: clean({ days }),
    });
    return res.data.data;
  },

  /** Load both mobile policies at once (either may be null). */
  async getVersionPolicies(): Promise<
    Record<MobilePlatform, VersionPolicy | null>
  > {
    const res = await api.get("/admin/version-policy/");
    return res.data.data;
  },

  /** Upsert one platform's policy. Returns the saved row. */
  async saveVersionPolicy(payload: {
    platform: MobilePlatform;
    required_version: string;
    required_build: number;
    store_url: string;
  }): Promise<VersionPolicy> {
    const res = await api.put("/admin/version-policy/", payload);
    return res.data.data;
  },
};

export default deviceAdminService;
