/* =====================================================================
 * HAIS — Hardware Asset Identification Software
 * Service layer for the office hardware asset register.
 *
 * NOTE: This is a STATIC / in-memory implementation — there is no backend
 * yet. All data lives in the `STORE` array below and resets on page reload.
 * The method signatures already match a REST API (`hais/assets/`), so
 * swapping to real `api` calls later is a drop-in change.
 * ===================================================================== */

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

/** Hardware category — every kind of office device we track. */
export const ASSET_TYPES = [
  "Desktop / PC",
  "Laptop",
  "Monitor",
  "Keyboard",
  "Mouse",
  "Printer",
  "Scanner",
  "UPS",
  "Server",
  "Router",
  "Switch",
  "Mobile",
  "Tablet",
  "Projector",
  "Webcam",
  "Headphone",
  "Docking Station",
  "Hard Disk",
  "Pen Drive",
  "Other",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** Departments — used by the Department dropdown on the form. */
export const DEPARTMENTS = [
  "IT",
  "Accounts",
  "Admin",
  "HR",
  "Sales",
  "Marketing",
  "Production",
  "Purchase",
  "Legal",
  "Management",
  "Store",
] as const;

/** Storage medium — used by the Storage Type dropdown. */
export const STORAGE_TYPES = ["SSD", "HDD", "NVMe SSD", "eMMC", "Hybrid", "N/A"] as const;

/** The five configuration fields — snapshotted into history on each change. */
export interface ConfigFields {
  processor?: string;
  memory?: string;
  operating_system?: string;
  storage_type?: string;
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
  serial_num?: string;
  warranty_ends?: string;

  /* configuration (structured) */
  processor?: string;
  memory?: string;                   // RAM
  operating_system?: string;
  storage_type?: string;
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

/** Compose a one-line configuration summary from the structured fields. */
export function configSummary(a: ConfigFields): string {
  const storage = a.storage ? `${a.storage}${a.storage_type ? ` ${a.storage_type}` : ""}` : "";
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
    .filter(([k]) => (before[k] ?? "").trim() !== (after[k] ?? "").trim())
    .map(([k, label]) => `${label} ${(before[k] || "—")} → ${(after[k] || "—")}`)
    .join("; ");
}

/** Short code per category, used when the system generates an Asset ID. */
const ID_PREFIX: Record<string, string> = {
  "Desktop / PC": "DT",
  Laptop: "LT",
  Monitor: "MN",
  Keyboard: "KB",
  Mouse: "MS",
  Printer: "PR",
  Scanner: "SC",
  UPS: "UPS",
  Server: "SV",
  Router: "RT",
  Switch: "SW",
  Mobile: "MB",
  Tablet: "TB",
  Projector: "PJ",
  Webcam: "WC",
  Headphone: "HP",
  "Docking Station": "DK",
  "Hard Disk": "HD",
  "Pen Drive": "PD",
  Other: "AS",
};

/* ------------------------------------------------------------------ *
 * Static seed data — sample assets so every screen has something to
 * show without a backend. Edit / add freely.
 * ------------------------------------------------------------------ */
const STORE: Asset[] = [
  {
    asset_id: "JIVO-LT-0001",
    asset_type: "Laptop",
    company: "Dell",
    model_num: "Latitude 5440",
    serial_num: "DL5440X92KK",
    warranty_ends: "05/01/2028",
    processor: "Intel Core i5 12th Gen",
    memory: "16 GB",
    operating_system: "Windows 11 Pro",
    storage_type: "SSD",
    storage: "512 GB",
    current_user_id: "EMP1042",
    current_user_name: "Rahul Sharma",
    prev_user_id: "EMP1007",
    prev_user_name: "Anita Desai",
    department: "IT",
    email_id: "rahul.sharma@jivo.com",
    current_location: "Head Office - 2nd Floor",
    handover_date: "12/03/2026",
    purchase_invoice_no: "INV-2025-8841",
    purchase_invoice_date: "05/01/2025",
    amount: 72000,
    vendor: "Computech Solutions",
    date_of_last_service: "18/06/2026",
    working_status: "Working",
    remarks: "Battery replaced under warranty.",
    history: [
      { date: "05/01/2025", action: "Assigned", to_user_id: "EMP1007", to_user_name: "Anita Desai", department: "IT", location: "Head Office - 2nd Floor", reason: "New purchase — issued to employee", config: { processor: "Intel Core i5 12th Gen", memory: "8 GB", operating_system: "Windows 11 Pro", storage_type: "SSD", storage: "512 GB" } } as AssetHistoryEntry,
      { date: "12/03/2026", action: "Handover", from_user_id: "EMP1007", from_user_name: "Anita Desai", to_user_id: "EMP1042", to_user_name: "Rahul Sharma", department: "IT", location: "Head Office - 2nd Floor", reason: "Anita left; RAM upgraded for new user", config: { processor: "Intel Core i5 12th Gen", memory: "16 GB", operating_system: "Windows 11 Pro", storage_type: "SSD", storage: "512 GB" }, config_change: "Memory 8 GB → 16 GB" },
    ],
  },
  {
    asset_id: "JIVO-DT-0007",
    asset_type: "Desktop / PC",
    company: "HP",
    model_num: "ProDesk 400 G9",
    serial_num: "HPPD400G9-7781",
    warranty_ends: "22/02/2028",
    processor: "Intel Core i7 13th Gen",
    memory: "16 GB",
    operating_system: "Windows 11 Pro",
    storage_type: "NVMe SSD",
    storage: "1 TB",
    current_user_id: "EMP2210",
    current_user_name: "Priya Nair",
    prev_user_id: "",
    prev_user_name: "",
    department: "Accounts",
    email_id: "priya.nair@jivo.com",
    current_location: "Head Office - 1st Floor",
    handover_date: "01/07/2026",
    purchase_invoice_no: "INV-2025-9020",
    purchase_invoice_date: "22/02/2025",
    amount: 58000,
    vendor: "Computech Solutions",
    date_of_last_service: "",
    working_status: "Working",
    remarks: "",
    history: [
      { date: "01/07/2026", action: "Assigned", to_user_id: "EMP2210", to_user_name: "Priya Nair", department: "Accounts", location: "Head Office - 1st Floor", reason: "New purchase — issued to employee" },
    ],
  },
  {
    asset_id: "JIVO-KB-0021",
    asset_type: "Keyboard",
    company: "Logitech",
    model_num: "K120",
    serial_num: "LGK120-4432",
    warranty_ends: "10/09/2027",
    processor: "",
    memory: "",
    operating_system: "",
    storage_type: "",
    storage: "",
    current_user_id: "EMP2210",
    current_user_name: "Priya Nair",
    prev_user_id: "EMP1042",
    prev_user_name: "Rahul Sharma",
    department: "Accounts",
    email_id: "",
    current_location: "Head Office - 1st Floor",
    handover_date: "01/07/2026",
    purchase_invoice_no: "INV-2025-9020",
    purchase_invoice_date: "10/09/2024",
    amount: 650,
    vendor: "Computech Solutions",
    date_of_last_service: "",
    working_status: "Working",
    remarks: "Bundled with desktop JIVO-DT-0007.",
    history: [
      { date: "10/09/2024", action: "Assigned", to_user_id: "EMP1042", to_user_name: "Rahul Sharma", department: "IT", location: "Head Office - 2nd Floor", reason: "New purchase — issued to employee" },
      { date: "01/07/2026", action: "Reassigned", from_user_id: "EMP1042", from_user_name: "Rahul Sharma", to_user_id: "EMP2210", to_user_name: "Priya Nair", department: "Accounts", location: "Head Office - 1st Floor", reason: "Moved with desk to Accounts" },
    ],
  },
  {
    asset_id: "JIVO-MS-0034",
    asset_type: "Mouse",
    company: "Logitech",
    model_num: "B100",
    serial_num: "LGB100-9910",
    warranty_ends: "10/09/2027",
    processor: "",
    memory: "",
    operating_system: "",
    storage_type: "",
    storage: "",
    current_user_id: "EMP1042",
    current_user_name: "Rahul Sharma",
    prev_user_id: "",
    prev_user_name: "",
    department: "IT",
    email_id: "",
    current_location: "Head Office - 2nd Floor",
    handover_date: "12/03/2026",
    purchase_invoice_no: "INV-2025-8841",
    purchase_invoice_date: "10/09/2024",
    amount: 350,
    vendor: "Computech Solutions",
    date_of_last_service: "",
    working_status: "Working",
    remarks: "",
    history: [
      { date: "12/03/2026", action: "Assigned", to_user_id: "EMP1042", to_user_name: "Rahul Sharma", department: "IT", location: "Head Office - 2nd Floor", reason: "New purchase — issued to employee" },
    ],
  },
  {
    asset_id: "JIVO-PR-0003",
    asset_type: "Printer",
    company: "Canon",
    model_num: "LBP2900B",
    serial_num: "CN2900B-5567",
    warranty_ends: "14/11/2026",
    processor: "",
    memory: "",
    operating_system: "",
    storage_type: "",
    storage: "",
    current_user_id: "EMP3001",
    current_user_name: "Admin Store",
    prev_user_id: "EMP2210",
    prev_user_name: "Priya Nair",
    department: "Admin",
    email_id: "",
    current_location: "Store Room",
    handover_date: "20/05/2026",
    purchase_invoice_no: "INV-2024-3312",
    purchase_invoice_date: "14/11/2024",
    amount: 12500,
    vendor: "Office Mart",
    date_of_last_service: "02/04/2026",
    working_status: "Under Repair",
    remarks: "Paper feed jam — sent to vendor.",
    history: [
      { date: "14/11/2024", action: "Assigned", to_user_id: "EMP2210", to_user_name: "Priya Nair", department: "Accounts", location: "Head Office - 1st Floor", reason: "New purchase — issued to department" },
      { date: "20/05/2026", action: "Returned", from_user_id: "EMP2210", from_user_name: "Priya Nair", to_user_id: "EMP3001", to_user_name: "Admin Store", department: "Admin", location: "Store Room", reason: "Frequent jams — pulled back to store for servicing" },
    ],
  },
];

// Small delay so the UI's loading states are visible, mimicking a real call.
const delay = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), 150));

/** Generate the next sequential Asset ID for a category, e.g. JIVO-LT-0002. */
function nextAssetId(assetType?: string): string {
  const base = `JIVO-${ID_PREFIX[assetType ?? ""] ?? "AS"}-`;
  const highest = STORE
    .filter((a) => a.asset_id.startsWith(base))
    .map((a) => parseInt(a.asset_id.slice(base.length), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return `${base}${String(highest + 1).padStart(4, "0")}`;
}

const matches = (a: Asset, term: string) => {
  const t = term.toLowerCase();
  return [
    a.asset_id, a.current_user_name, a.current_user_id, a.prev_user_name,
    a.serial_num, a.company, a.model_num, a.department, a.current_location, a.asset_type,
  ].some((v) => String(v ?? "").toLowerCase().includes(t));
};

export const haisService = {
  /* --- list / search the register --- */
  list: async (params: AssetListParams = {}): Promise<AssetListResponse> => {
    let rows = [...STORE];
    if (params.search) rows = rows.filter((a) => matches(a, params.search!));
    if (params.working_status) rows = rows.filter((a) => a.working_status === params.working_status);
    if (params.department) rows = rows.filter((a) => a.department === params.department);
    if (params.asset_type) rows = rows.filter((a) => a.asset_type === params.asset_type);
    return delay({ results: rows, count: rows.length });
  },

  /* --- single asset (also used by the QR / barcode lookup) --- */
  get: async (assetId: string): Promise<Asset> => {
    const found = STORE.find((a) => a.asset_id.toLowerCase() === assetId.toLowerCase());
    if (!found) throw new Error(`No asset found with ID "${assetId}".`);
    return delay({ ...found });
  },

  /* --- create --- *
   * The Asset ID is generated by the system (not entered by the user). */
  create: async (payload: Asset): Promise<Asset> => {
    const asset_id = (payload.asset_id || "").trim() || nextAssetId(payload.asset_type);
    if (STORE.some((a) => a.asset_id.toLowerCase() === asset_id.toLowerCase())) {
      throw new Error(`Asset ID "${asset_id}" already exists.`);
    }
    // Seed the history with the first assignment.
    const record: Asset = {
      ...payload,
      asset_id,
      history: [
        {
          date: payload.handover_date,
          action: "Assigned",
          to_user_id: payload.current_user_id,
          to_user_name: payload.current_user_name,
          department: payload.department,
          location: payload.current_location,
          reason: "Initial assignment",
          config: configSnapshot(payload),
        } as AssetHistoryEntry,
      ],
    };
    STORE.unshift(record);
    return delay({ ...record });
  },

  /* --- update --- *
   * A single edit path that keeps the history trail complete:
   *   • if the current user changed  → a "Handover" entry (old → new holder)
   *   • else if the config changed    → a "Config Updated" entry
   * Either way a configuration snapshot + change summary is recorded, so a RAM
   * upgrade (with or without a handover) is never lost. `reason` explains why. */
  update: async (
    assetId: string,
    payload: Partial<Asset>,
    reason?: string,
  ): Promise<Asset> => {
    const idx = STORE.findIndex((a) => a.asset_id.toLowerCase() === assetId.toLowerCase());
    if (idx === -1) throw new Error(`No asset found with ID "${assetId}".`);
    const before = STORE[idx];
    const beforeConfig = configSnapshot(before);

    const userChanged =
      payload.current_user_id !== undefined &&
      String(payload.current_user_id) !== String(before.current_user_id ?? "");

    const next: Asset = { ...before, ...payload, asset_id: before.asset_id };
    const afterConfig = configSnapshot(next);
    const change = diffConfig(beforeConfig, afterConfig);

    if (userChanged) {
      next.prev_user_id = before.current_user_id;
      next.prev_user_name = before.current_user_name;
      const entry: AssetHistoryEntry = {
        date: payload.handover_date ?? next.handover_date,
        action: "Handover",
        from_user_id: before.current_user_id,
        from_user_name: before.current_user_name,
        to_user_id: next.current_user_id,
        to_user_name: next.current_user_name,
        department: next.department,
        location: next.current_location,
        reason: reason || "Reassigned",
        config: afterConfig,
        config_change: change || undefined,
      };
      next.history = [...(before.history ?? []), entry];
    } else if (change) {
      const entry: AssetHistoryEntry = {
        date: payload.date_of_last_service ?? next.date_of_last_service,
        action: "Config Updated",
        to_user_id: before.current_user_id,
        to_user_name: before.current_user_name,
        department: before.department,
        location: before.current_location,
        reason: reason || "Configuration updated",
        config: afterConfig,
        config_change: change,
      };
      next.history = [...(before.history ?? []), entry];
    }

    STORE[idx] = next;
    return delay({ ...next });
  },

  /* --- handover: give the device to another person --- *
   * Records the new holder AND a snapshot of the configuration at handover.
   * Optionally the config can be upgraded for the new user at the same time. */
  handover: async (assetId: string, input: HandoverInput): Promise<Asset> => {
    const idx = STORE.findIndex((a) => a.asset_id.toLowerCase() === assetId.toLowerCase());
    if (idx === -1) throw new Error(`No asset found with ID "${assetId}".`);
    const before = STORE[idx];
    const beforeConfig = configSnapshot(before);

    const next: Asset = { ...before };
    // Apply any configuration change made during the handover.
    if (input.config) Object.assign(next, input.config);
    const afterConfig = configSnapshot(next);
    const change = diffConfig(beforeConfig, afterConfig);

    // Rotate users: current becomes previous, new becomes current.
    next.prev_user_id = before.current_user_id;
    next.prev_user_name = before.current_user_name;
    next.current_user_id = input.to_user_id;
    next.current_user_name = input.to_user_name;
    if (input.department) next.department = input.department;
    if (input.location) next.current_location = input.location;
    if (input.handover_date) next.handover_date = input.handover_date;

    const entry: AssetHistoryEntry = {
      date: input.handover_date,
      action: "Handover",
      from_user_id: before.current_user_id,
      from_user_name: before.current_user_name,
      to_user_id: input.to_user_id,
      to_user_name: input.to_user_name,
      department: next.department,
      location: next.current_location,
      reason: input.reason,
      config: afterConfig,
      config_change: change || undefined,
    };
    next.history = [...(before.history ?? []), entry];
    STORE[idx] = next;
    return delay({ ...next });
  },

  /* --- update config: hardware change with NO handover (same user) --- *
   * e.g. the hardware team increases the RAM. Logged in history with the
   * before→after change and a snapshot, so nothing is lost. */
  updateConfig: async (assetId: string, input: ConfigUpdateInput): Promise<Asset> => {
    const idx = STORE.findIndex((a) => a.asset_id.toLowerCase() === assetId.toLowerCase());
    if (idx === -1) throw new Error(`No asset found with ID "${assetId}".`);
    const before = STORE[idx];
    const beforeConfig = configSnapshot(before);

    const next: Asset = { ...before, ...input.config };
    if (input.service_date) next.date_of_last_service = input.service_date;
    const afterConfig = configSnapshot(next);
    const change = diffConfig(beforeConfig, afterConfig);

    const entry: AssetHistoryEntry = {
      date: input.service_date,
      action: "Config Updated",
      to_user_id: before.current_user_id,
      to_user_name: before.current_user_name,
      department: before.department,
      location: before.current_location,
      reason: input.reason,
      config: afterConfig,
      config_change: change || undefined,
    };
    next.history = [...(before.history ?? []), entry];
    STORE[idx] = next;
    return delay({ ...next });
  },

  /* --- delete --- */
  remove: async (assetId: string): Promise<{ ok: true }> => {
    const idx = STORE.findIndex((a) => a.asset_id.toLowerCase() === assetId.toLowerCase());
    if (idx !== -1) STORE.splice(idx, 1);
    return delay({ ok: true as const });
  },
};
