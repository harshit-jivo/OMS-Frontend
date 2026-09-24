/**
 * Small validation helpers shared by the HAIS asset forms (AssetForm — edit,
 * AssetBatchAdd — create many under one holder). Kept in one place so the two
 * forms cannot drift on what counts as a valid date / email / employee ID.
 */

/** Employee IDs are always prefixed with the company code. */
export const EMP_ID_PREFIX = "JWPL";

/** Basic email shape check (case-insensitive). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True only for a real dd/mm/yyyy calendar date (rejects 31/02, 99/99/9999…). */
export function isValidDdMmYyyy(s: string): boolean {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const day = +m[1], month = +m[2], year = +m[3];
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2200) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

/** Normalise a raw employee-code entry to a single clean JWPL-prefixed, uppercased ID. */
export function normalizeEmpId(raw: string): string {
  const code = raw.toUpperCase().replace(/\s+/g, "").replace(/^(JWPL)+/, "");
  return code ? `${EMP_ID_PREFIX}${code}` : "";
}

/* ------------------------------------------------------------------ *
 * Per-asset-type field control.
 *
 * When adding an Asset Type, the admin ticks WHICH of these optional asset
 * fields that type shows on the create/edit form (stored as the type's
 * `field_config` list). Serial number, asset type and working status are
 * ALWAYS shown, so they are not in this catalogue.
 * ------------------------------------------------------------------ */
export type AssetFieldKey =
  | "company"
  | "model_num"
  | "warranty_ends"
  | "processor"
  | "memory"
  | "operating_system"
  | "storage_types"
  | "storage"
  | "purchase_invoice_no"
  | "purchase_invoice_date"
  | "vendor"
  | "amount"
  | "date_of_last_service"
  | "remarks";

export const ASSET_FIELD_GROUPS: {
  group: string;
  fields: { key: AssetFieldKey; label: string }[];
}[] = [
  {
    group: "Identification",
    fields: [
      { key: "company", label: "Company" },
      { key: "model_num", label: "Model number" },
      { key: "warranty_ends", label: "Warranty ends" },
    ],
  },
  {
    group: "Configuration",
    fields: [
      { key: "processor", label: "Processor" },
      { key: "memory", label: "Memory (RAM)" },
      { key: "operating_system", label: "Operating system" },
      { key: "storage_types", label: "Storage type" },
      { key: "storage", label: "Storage" },
    ],
  },
  {
    group: "Purchase",
    fields: [
      { key: "purchase_invoice_no", label: "Purchase invoice No." },
      { key: "purchase_invoice_date", label: "Purchase invoice date" },
      { key: "vendor", label: "Vendor" },
      { key: "amount", label: "Amount" },
    ],
  },
  {
    group: "Maintenance",
    fields: [
      { key: "date_of_last_service", label: "Date of last service" },
      { key: "remarks", label: "Remarks" },
    ],
  },
];

/** Every toggleable field key, in form order. */
export const ALL_ASSET_FIELD_KEYS: AssetFieldKey[] = ASSET_FIELD_GROUPS.flatMap((g) =>
  g.fields.map((f) => f.key),
);

/**
 * Is `key` shown for a type with this `field_config`? An empty/absent list means
 * "show all" — so existing types (and any not yet configured) keep every field.
 */
export function fieldVisible(cfg: string[] | undefined, key: AssetFieldKey): boolean {
  return !cfg || cfg.length === 0 || cfg.includes(key);
}
