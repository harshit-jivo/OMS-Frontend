/* =====================================================================
 * HAIS — Hardware Asset Identification Software
 * Service layer for the office hardware asset register.
 *
 * Assets are still served from the in-memory `STORE` below (empty until the
 * asset endpoints are wired). The DROPDOWNS, however, are live: Asset Type,
 * Department and Storage Type load from the DB masters under /api/hais/.
 * ===================================================================== */
import api from "./api";

/** Operational state of a physical asset. */
export type WorkingStatus =
  | "Working"
  | "Under Repair"
  | "Not Working"
  | "In Stock"
  | "Scrapped";

export const WORKING_STATUSES: WorkingStatus[] = [
  "Working",
  "Under Repair",
  "Not Working",
  "In Stock",
  "Scrapped",
];

/** A dynamic dropdown value served from the DB (hais masters). */
export interface HaisOption {
  id: number;
  name: string;
}

/* Asset Type / Department / Storage Type are NO LONGER static — they come from
 * the DB dropdown masters via `haisService.options.*`. Only Working Status
 * stays static (above). Asset Type is now just a free string on the record. */
export type AssetType = string;

/** The five configuration fields — snapshotted into history on each change. */
export interface ConfigFields {
  processor?: string;
  memory?: string;
  operating_system?: string;
  storage_type?: string;
  storage_types?: string[];
  storage?: string;
}

/**
 * One movement in a device's life — who it went to, when, why, AND what the
 * configuration was at that moment. The ordered list of these on an Asset is
 * its full history: every handover and every configuration change.
 */
export interface AssetHistoryEntry {
  date?: string;              // dd/mm/yyyy
  action?: string;           // Assigned | Handover | Config Updated | Returned | Scrapped
  from_user_id?: string;
  from_user_name?: string;
  to_user_id?: string;
  to_user_name?: string;
  department?: string;
  location?: string;
  reason?: string;           // why it moved / changed
  config?: ConfigFields;     // configuration snapshot at this point in time
  config_change?: string;    // human summary, e.g. "Memory 8 GB → 16 GB"
}

/** Input for the Handover action (give the device to another person). */
export interface HandoverInput {
  to_user_id: string;
  to_user_name?: string;
  department?: string;
  location?: string;
  handover_date?: string;
  reason?: string;
  config?: ConfigFields;     // optional: upgrade the config for the new user
}

/** Input for the Update-Config action (hardware change, same user). */
export interface ConfigUpdateInput {
  config: ConfigFields;
  service_date?: string;
  reason?: string;
}

/**
 * Full asset record — every field the register maintains.
 * Dates are dd/mm/yyyy strings (matching the shared DateInput control).
 */
export interface Asset {
  asset_id: string;

  /* identification */
  asset_type?: AssetType | string;   // Asset Type / Category
  company?: string;                  // manufacturer / brand
  model_num?: string;
  serial_num?: string;                // required + unique — every device has its own
  qr_code?: string;                   // QR payload, generated from the serial number
  warranty_ends?: string;

  /* configuration (structured) */
  processor?: string;
  memory?: string;                   // RAM
  operating_system?: string;
  storage_type?: string;             // legacy single value (kept for history/config)
  storage_types?: string[];          // multi-select storage types (SSD, HDD, …)
  storage?: string;

  /* assignment / tracking */
  current_user_id?: string;          // Emp_ID of the person holding it now (required)
  current_user_name?: string;
  prev_user_id?: string;
  prev_user_name?: string;
  department?: string;
  email_id?: string;
  current_location?: string;
  handover_date?: string;

  /* purchase */
  purchase_invoice_no?: string;
  purchase_invoice_date?: string;
  amount?: number | string;
  vendor?: string;

  /* maintenance */
  date_of_last_service?: string;
  working_status?: WorkingStatus | string;
  remarks?: string;

  /* lifecycle history — oldest first */
  history?: AssetHistoryEntry[];

  /* server-managed */
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface AssetListResponse {
  results: Asset[];
  count?: number;
}

export interface AssetListParams {
  search?: string;
  department?: string;
  working_status?: string;
  asset_type?: string;
}

/** Display name for the current holder, or "Unassigned" when the device has none. */
export function holderLabel(a: Asset): string {
  return (a.current_user_name || a.current_user_id || "").trim() || "Unassigned";
}

/** Compose a one-line configuration summary from the structured fields. */
export function configSummary(a: ConfigFields): string {
  const types = a.storage_types && a.storage_types.length
    ? a.storage_types.join(" / ")
    : a.storage_type ?? "";
  const storage = a.storage ? `${a.storage}${types ? ` ${types}` : ""}` : "";
  return [a.processor, a.memory, storage, a.operating_system].filter(Boolean).join(", ");
}

/** Pull just the five config fields out of an asset (a point-in-time snapshot). */
export function configSnapshot(a: ConfigFields): ConfigFields {
  return {
    processor: a.processor,
    memory: a.memory,
    operating_system: a.operating_system,
    storage_type: a.storage_type,
    storage: a.storage,
  };
}

/** Human summary of what changed between two configs, e.g. "Memory 8 GB → 16 GB". */
export function diffConfig(before: ConfigFields, after: ConfigFields): string {
  const labels: [keyof ConfigFields, string][] = [
    ["processor", "Processor"],
    ["memory", "Memory"],
    ["operating_system", "OS"],
    ["storage_type", "Storage Type"],
    ["storage", "Storage"],
  ];
  return labels
    .filter(([k]) => String(before[k] ?? "").trim() !== String(after[k] ?? "").trim())
    .map(([k, label]) => `${label} ${(before[k] as string) || "—"} → ${(after[k] as string) || "—"}`)
    .join("; ");
}

/** The QR payload for a device — its serial number, which is unique per device.
 *  Scanning this QR in the app resolves straight back to the one matching asset. */
export function qrValueFor(serialNum?: string): string {
  return (serialNum ?? "").trim();
}

/* ------------------------------------------------------------------ *
 * API mapping — the backend stores dropdowns as FK ids and the history
 * as log rows; the frontend `Asset` uses names + a `history` array. These
 * helpers translate between the two shapes.
 * ------------------------------------------------------------------ */

// Cached dropdown masters so create/update can map names → FK ids without a
// round-trip per field. Cleared whenever a new option is added (createOption).
let optionCache: {
  assetTypes: HaisOption[];
  departments: HaisOption[];
  storageTypes: HaisOption[];
} | null = null;

async function loadOptionMaps() {
  if (!optionCache) {
    const [assetTypes, departments, storageTypes] = await Promise.all([
      fetchOptions("asset-types"),
      fetchOptions("departments"),
      fetchOptions("storage-types"),
    ]);
    optionCache = { assetTypes, departments, storageTypes };
  }
  return optionCache;
}

function idByName(list: HaisOption[], name?: string): number | null {
  const n = (name ?? "").trim().toUpperCase();
  if (!n) return null;
  return list.find((o) => o.name.toUpperCase() === n)?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function historyFromLog(l: Record<string, any>): AssetHistoryEntry {
  return {
    date: l.event_date,
    action: l.action,
    from_user_id: l.from_user_id,
    from_user_name: l.from_user_name,
    to_user_id: l.to_user_id,
    to_user_name: l.to_user_name,
    department: l.department_name ?? "",
    location: l.location,
    reason: l.reason,
    config: l.config_json ?? undefined,
    config_change: l.config_change || undefined,
  };
}

/** Backend asset → frontend `Asset` (dropdowns as names, logs as history). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assetFromApi(a: Record<string, any>): Asset {
  return {
    ...(a as object),
    asset_id: a.asset_id,
    serial_num: a.serial_num,
    qr_code: a.qr_code ?? "",
    asset_type: a.asset_type_name ?? "",
    department: a.department_name ?? "",
    storage_types: a.storage_type_names ?? [],
    amount: a.amount == null ? "" : a.amount,
    history: Array.isArray(a.logs) ? a.logs.map(historyFromLog) : [],
  } as Asset;
}

// String fields copied through as-is (only when present on the partial).
const ASSET_STRING_FIELDS: (keyof Asset)[] = [
  "serial_num", "company", "model_num", "warranty_ends", "processor", "memory",
  "operating_system", "storage", "current_user_id", "current_user_name",
  "prev_user_id", "prev_user_name", "email_id", "current_location", "handover_date",
  "purchase_invoice_no", "purchase_invoice_date", "vendor", "date_of_last_service",
  "working_status", "remarks",
];

/** Frontend `Asset` (partial) → backend write payload (names → FK ids).
 *  Only fields present on the partial are sent, so a partial PATCH never
 *  blanks out untouched columns. */
async function assetToApi(p: Partial<Asset>): Promise<Record<string, unknown>> {
  const maps = await loadOptionMaps();
  const body: Record<string, unknown> = {};
  for (const k of ASSET_STRING_FIELDS) {
    if (p[k] !== undefined) body[k] = p[k] == null ? "" : String(p[k]);
  }
  if (typeof body.serial_num === "string") body.serial_num = body.serial_num.trim();
  if (p.amount !== undefined) {
    body.amount = p.amount === "" || p.amount == null ? null : Number(p.amount);
  }
  if (p.asset_type !== undefined) body.asset_type = idByName(maps.assetTypes, p.asset_type as string);
  if (p.department !== undefined) body.department = idByName(maps.departments, p.department as string);
  if (p.storage_types !== undefined) {
    body.storage_type_ids = (p.storage_types ?? [])
      .map((n) => idByName(maps.storageTypes, n))
      .filter((x): x is number => x != null);
  }
  return body;
}

/** Fetch a dropdown master (active rows only) from the DB. DRF returns a bare
 *  array; tolerate a paginated `{results}` shape too. */
async function fetchOptions(path: string): Promise<HaisOption[]> {
  const { data } = await api.get(`/hais/${path}/`, { params: { active: 1 } });
  const rows: Array<{ id: number; name: string }> = Array.isArray(data)
    ? data
    : data?.results ?? [];
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/** Add a new dropdown value. Names are stored in CAPITALS. */
async function createOption(path: string, name: string): Promise<HaisOption> {
  const { data } = await api.post(`/hais/${path}/`, { name: name.trim().toUpperCase() });
  optionCache = null; // a new option exists — force the name→id map to reload
  return { id: data.id, name: data.name };
}

export const haisService = {
  /* --- dynamic dropdowns (from the DB masters) --- */
  options: {
    assetTypes: (): Promise<HaisOption[]> => fetchOptions("asset-types"),
    departments: (): Promise<HaisOption[]> => fetchOptions("departments"),
    storageTypes: (): Promise<HaisOption[]> => fetchOptions("storage-types"),
    createAssetType: (name: string): Promise<HaisOption> => createOption("asset-types", name),
    createDepartment: (name: string): Promise<HaisOption> => createOption("departments", name),
    createStorageType: (name: string): Promise<HaisOption> => createOption("storage-types", name),
  },

  /* --- list / search the register --- */
  list: async (params: AssetListParams = {}): Promise<AssetListResponse> => {
    const query: Record<string, string> = {};
    if (params.search) query.search = params.search;
    if (params.working_status) query.working_status = params.working_status;
    const { data } = await api.get("/hais/assets/", { params: query });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = Array.isArray(data) ? data : data?.results ?? [];
    return { results: rows.map(assetFromApi), count: rows.length };
  },

  /* --- single asset (also used by the QR / barcode lookup) --- */
  get: async (assetId: string): Promise<Asset> => {
    const { data } = await api.get(`/hais/assets/${encodeURIComponent(assetId)}/`);
    return assetFromApi(data);
  },

  /* --- resolve a scanned QR (serial number, or Asset ID as fallback) --- */
  getBySerial: async (code: string): Promise<Asset> => {
    const { data } = await api.get("/hais/assets/by-serial/", {
      params: { code: code.trim() },
    });
    return assetFromApi(data);
  },

  /**
   * The same device, for a scanner with NO session.
   *
   * A QR sticker is read by whatever phone is to hand, usually by somebody who
   * has no OMS account — so this endpoint is unauthenticated and returns a
   * narrowed payload: the device, its holder and a way to reach them, and
   * nothing else. See `PublicAssetSerializer` on the server for what is held
   * back and why.
   *
   * It goes through `assetFromApi` like its authenticated sibling because the
   * public payload uses the same `*_name` keys. The withheld fields simply
   * arrive undefined, which is what lets one component render both views —
   * `DetailFields hideWhenEmpty` drops the rows that are not there.
   *
   * SERIAL ONLY. The server will not resolve an Asset ID on this path, because
   * Asset IDs are sequential and would let anyone walk the register.
   */
  getPublicBySerial: async (code: string): Promise<Asset> => {
    const { data } = await api.get("/hais/public/device/", {
      params: { code: code.trim() },
    });
    return assetFromApi(data);
  },

  /* --- create --- (Asset ID + QR are generated server-side) */
  create: async (payload: Asset): Promise<Asset> => {
    const body = await assetToApi(payload);
    const { data } = await api.post("/hais/assets/", body);
    return assetFromApi(data);
  },

  /* --- update --- (the server logs a Handover or Config change as needed) */
  update: async (
    assetId: string,
    payload: Partial<Asset>,
    reason?: string,
  ): Promise<Asset> => {
    const body = await assetToApi(payload);
    if (reason) body.reason = reason;
    const { data } = await api.patch(
      `/hais/assets/${encodeURIComponent(assetId)}/`,
      body,
    );
    return assetFromApi(data);
  },

  /* --- handover: give the device to another person --- *
   * Modelled as an update that changes the current holder; the server records
   * a "Handover" log because current_user_id changes. Optional config upgrade. */
  handover: async (assetId: string, input: HandoverInput): Promise<Asset> => {
    const patch: Partial<Asset> = {
      current_user_id: input.to_user_id,
      current_user_name: input.to_user_name ?? "",
      department: input.department,
      current_location: input.location,
      handover_date: input.handover_date,
      ...(input.config ?? {}),
    };
    return haisService.update(assetId, patch, input.reason);
  },

  /* --- update config: hardware change with NO handover (same user) --- */
  updateConfig: async (assetId: string, input: ConfigUpdateInput): Promise<Asset> => {
    const patch: Partial<Asset> = {
      ...input.config,
      date_of_last_service: input.service_date,
    };
    return haisService.update(assetId, patch, input.reason);
  },

  /* --- delete --- */
  remove: async (assetId: string): Promise<{ ok: true }> => {
    await api.delete(`/hais/assets/${encodeURIComponent(assetId)}/`);
    return { ok: true as const };
  },
};
