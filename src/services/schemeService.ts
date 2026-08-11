import api from "./api";

/**
 * Client for the v2 scheme engine (`/orders/v2/schemes/`).
 *
 * Deliberately separate from `ordersService.getSchemeProducts` / `createScheme`,
 * which still speak to the legacy flat `scheme_product` table feeding the current
 * Add Sales picker. The two coexist until the migration completes.
 *
 * See Backend/docs/scheme-architecture.md.
 */

export type Uom = "QTY" | "PCS" | "BOX" | "LTR";

export const UOM_OPTIONS: { value: Uom; label: string }[] = [
  { value: "QTY", label: "Qty" },
  { value: "PCS", label: "Pieces" },
  { value: "BOX", label: "Boxes" },
  { value: "LTR", label: "Litres" },
];

export type MatchType = "ITEM" | "SUB_GROUP" | "VARIETY" | "BRAND" | "CATEGORY" | "ALL";

export const MATCH_TYPE_OPTIONS: { value: MatchType; label: string }[] = [
  { value: "ITEM", label: "Item code" },
  { value: "SUB_GROUP", label: "Sub group" },
  { value: "VARIETY", label: "Variety" },
  { value: "BRAND", label: "Brand" },
  { value: "CATEGORY", label: "Category" },
  { value: "ALL", label: "Any item" },
];

/**
 * Which half of a 1+1 supplies the qualifying quantity. FREE_LINE is what makes
 * a scheme sit on top of a combo's free item.
 */
export type AppliesTo = "PAID_LINE" | "FREE_LINE" | "BOTH";

export const APPLIES_TO_OPTIONS: { value: AppliesTo; label: string; hint: string }[] = [
  {
    value: "PAID_LINE",
    label: "Paid line",
    hint: "Qualify on the quantity actually ordered. The ordinary single-FG case.",
  },
  {
    value: "FREE_LINE",
    label: "Free (combo) line",
    hint: "Qualify on the free half of a 1+1 — the giveaway is sized on top of it.",
  },
  {
    value: "BOTH",
    label: "Paid + free",
    hint: "Qualify on the paid quantity and the combo's free half added together.",
  },
];

export type ScopeType = "PARTY" | "MAIN_GROUP" | "STATE" | "CATEGORY" | "ALL";

export const SCOPE_TYPE_OPTIONS: { value: ScopeType; label: string; hint: string }[] = [
  { value: "PARTY", label: "Vendor", hint: "One party, by card code." },
  { value: "STATE", label: "State", hint: "Every vendor in the state, including ones added later." },
  { value: "MAIN_GROUP", label: "Main group", hint: "Every vendor in the main group." },
  { value: "CATEGORY", label: "Category", hint: "Every vendor ordering in this category." },
  { value: "ALL", label: "All vendors", hint: "No targeting at all." },
];

/** Mirrors SchemeAssignment.SCOPE_SPECIFICITY — the more specific scope wins. */
export const SCOPE_SPECIFICITY: Record<ScopeType, number> = {
  PARTY: 100,
  MAIN_GROUP: 60,
  STATE: 50,
  CATEGORY: 20,
  ALL: 0,
};

export type SchemeBenefit = {
  id?: number;
  /** null / "" means "the same item as the trigger line". */
  free_item_code: string | null;
  free_uom: Uom;
  /** Buy `per_qty`, get `free_qty`. per_qty 0 = flat giveaway. Both 0 = user types the number. */
  per_qty: string | number;
  free_qty: string | number;
  max_free_qty: string | number | null;
};

export type SchemeTrigger = {
  id?: number;
  match_type: MatchType;
  match_value: string;
  min_qty: string | number;
  min_uom: Uom;
  applies_to: AppliesTo;
};

export type SchemeAssignment = {
  id?: number;
  scheme?: number;
  scheme_code?: string;
  scope_type: ScopeType;
  scope_value: string;
  category: string;
  is_exclusion: boolean;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  created_at?: string;
};

export type Scheme = {
  id: number;
  code: string;
  name: string;
  description: string;
  /** Business line this offer belongs to. "" = applies to every category. */
  category: string;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  priority: number;
  stackable: boolean;
  benefits: SchemeBenefit[];
  triggers: SchemeTrigger[];
  assignments: SchemeAssignment[];
  created_at?: string;
  updated_at?: string;
};

export type SchemeWritePayload = Omit<Scheme, "id" | "created_at" | "updated_at">;

/** One line as the preview endpoint expects it. */
export type PreviewLine = {
  item_code: string;
  item_name?: string;
  category?: string;
  sub_group?: string;
  variety?: string;
  brand?: string;
  item_type?: string;
  qty?: number | string;
  pcs?: number | string;
  boxes?: number | string;
  ltrs?: number | string;
  is_auto_free?: boolean;
  combo_source_code?: string | null;
};

export type SchemeProposal = {
  line_index: number;
  trigger_item_code: string;
  scheme_id: number;
  scheme_code: string;
  scheme_name: string;
  benefit_id: number;
  benefit_item_code: string;
  free_uom: Uom;
  qty: string;
  qualifying_qty: string;
  scope_type: ScopeType;
  scope_value: string;
  priority: number;
  stackable: boolean;
  /** True when the scheme carries no rule and the quantity is still the user's to type. */
  qty_is_user_supplied: boolean;
};

export type PartyContext = {
  card_code: string;
  category: string;
  state_code: string;
  main_group: string;
};

export type PreviewResponse = {
  success: boolean;
  context: PartyContext;
  proposals: SchemeProposal[];
};

export type ApplicableScheme = {
  scheme_id: number;
  code: string;
  name: string;
  category?: string;
  priority: number;
  stackable: boolean;
  valid_from: string | null;
  valid_to: string | null;
  granted_by: { scope_type: ScopeType; scope_value: string };
  triggers: Omit<SchemeTrigger, "id">[];
  benefits: SchemeBenefit[];
  context: PartyContext;
};

export type ListFilters = {
  search?: string;
  /** Keeps uncategorised schemes too — they apply to this category as well. */
  category?: string;
  include_inactive?: boolean;
  scope_type?: ScopeType;
  scope_value?: string;
};

export const emptyBenefit = (): SchemeBenefit => ({
  free_item_code: "",
  free_uom: "PCS",
  per_qty: "",
  free_qty: "",
  max_free_qty: "",
});

export const emptyTrigger = (): SchemeTrigger => ({
  match_type: "ITEM",
  match_value: "",
  min_qty: "",
  min_uom: "QTY",
  applies_to: "PAID_LINE",
});

export const emptyAssignment = (): SchemeAssignment => ({
  scope_type: "STATE",
  scope_value: "",
  category: "",
  is_exclusion: false,
  valid_from: null,
  valid_to: null,
  is_active: true,
});

export const emptyScheme = (): SchemeWritePayload => ({
  code: "",
  name: "",
  description: "",
  category: "",
  valid_from: null,
  valid_to: null,
  is_active: true,
  priority: 0,
  stackable: false,
  benefits: [emptyBenefit()],
  triggers: [emptyTrigger()],
  assignments: [],
});

/** Blank numeric inputs must reach the API as 0 / null, not "". */
const num = (value: string | number | null | undefined, fallback = 0) => {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nullableNum = (value: string | number | null | undefined) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Strip the form's empty strings before the payload goes over the wire. */
export const serializeScheme = (draft: SchemeWritePayload) => ({
  code: draft.code.trim(),
  name: draft.name.trim(),
  description: draft.description.trim(),
  category: draft.category || "",
  valid_from: draft.valid_from || null,
  valid_to: draft.valid_to || null,
  is_active: draft.is_active,
  priority: num(draft.priority),
  stackable: draft.stackable,
  benefits: draft.benefits.map((benefit) => ({
    // "" means "same item as the trigger line" — the API models that as null.
    free_item_code: String(benefit.free_item_code ?? "").trim() || null,
    free_uom: benefit.free_uom,
    per_qty: num(benefit.per_qty),
    free_qty: num(benefit.free_qty),
    max_free_qty: nullableNum(benefit.max_free_qty),
  })),
  triggers: draft.triggers.map((trigger) => ({
    match_type: trigger.match_type,
    match_value: trigger.match_type === "ALL" ? "" : trigger.match_value.trim(),
    min_qty: num(trigger.min_qty),
    min_uom: trigger.min_uom,
    applies_to: trigger.applies_to,
  })),
});

/** Resolves an item code to its product name. Falls back to the code itself. */
export type ItemNameResolver = (itemCode: string) => string;

const defaultResolver: ItemNameResolver = (itemCode) => itemCode;

/** Human-readable summary of what one benefit gives. */
export const describeBenefit = (
  benefit: SchemeBenefit,
  resolveItemName: ItemNameResolver = defaultResolver,
) => {
  const perQty = num(benefit.per_qty);
  const freeQty = num(benefit.free_qty);
  const code = String(benefit.free_item_code ?? "").trim();
  const item = code ? resolveItemName(code) : "the ordered item";
  const cap = nullableNum(benefit.max_free_qty);
  const capText = cap ? `, capped at ${cap}` : "";

  if (perQty <= 0 && freeQty <= 0) return `${item} — quantity typed by the user`;
  if (perQty <= 0) return `${freeQty} ${benefit.free_uom} of ${item}${capText}`;
  return `every ${perQty} → ${freeQty} ${benefit.free_uom} of ${item}${capText}`;
};

/** Human-readable summary of what one trigger requires. */
export const describeTrigger = (
  trigger: SchemeTrigger,
  resolveItemName: ItemNameResolver = defaultResolver,
) => {
  // Only ITEM matches on a product code; the other match types are free text
  // (sub group, brand, ...) and must be shown verbatim.
  const value =
    trigger.match_type === "ITEM" && trigger.match_value
      ? resolveItemName(trigger.match_value)
      : trigger.match_value;
  const on =
    trigger.match_type === "ALL"
      ? "any item"
      : `${MATCH_TYPE_OPTIONS.find((o) => o.value === trigger.match_type)?.label ?? trigger.match_type} = ${value || "?"}`;
  const min = num(trigger.min_qty);
  const minText = min > 0 ? `, min ${min} ${trigger.min_uom}` : "";
  const half =
    trigger.applies_to === "FREE_LINE"
      ? " (counts the combo's free half)"
      : trigger.applies_to === "BOTH"
        ? " (counts paid + free)"
        : "";
  return `${on}${minText}${half}`;
};

export const describeScope = (assignment: Pick<SchemeAssignment, "scope_type" | "scope_value" | "category">) => {
  const label = SCOPE_TYPE_OPTIONS.find((o) => o.value === assignment.scope_type)?.label ?? assignment.scope_type;
  const target = assignment.scope_type === "ALL" ? "" : ` ${assignment.scope_value}`;
  const category = assignment.category ? ` · ${assignment.category}` : "";
  return `${label}${target}${category}`;
};

export const schemeService = {
  list: async (filters: ListFilters = {}) => {
    const response = await api.get("/orders/v2/schemes/", {
      params: {
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.include_inactive ? { include_inactive: "true" } : {}),
        ...(filters.scope_type ? { scope_type: filters.scope_type } : {}),
        ...(filters.scope_value ? { scope_value: filters.scope_value } : {}),
      },
    });
    return (response.data?.data || []) as Scheme[];
  },

  get: async (schemeId: number) => {
    const response = await api.get(`/orders/v2/schemes/${schemeId}/`);
    return response.data?.data as Scheme;
  },

  create: async (draft: SchemeWritePayload) => {
    const response = await api.post("/orders/v2/schemes/", serializeScheme(draft));
    return response.data?.data as Scheme;
  },

  update: async (schemeId: number, draft: SchemeWritePayload) => {
    const response = await api.patch(`/orders/v2/schemes/${schemeId}/`, serializeScheme(draft));
    return response.data?.data as Scheme;
  },

  /**
   * Deactivate. `hard` really deletes and is refused by the API when any order
   * line references the scheme — the record of what was given away has to survive.
   */
  remove: async (schemeId: number, hard = false) => {
    const response = await api.delete(`/orders/v2/schemes/${schemeId}/`, {
      params: hard ? { hard: "true" } : undefined,
    });
    return response.data as { success: boolean; message: string; used_by_order_lines?: number };
  },

  listAssignments: async (schemeId: number) => {
    const response = await api.get(`/orders/v2/schemes/${schemeId}/assignments/`);
    return (response.data?.data || []) as SchemeAssignment[];
  },

  /** Accepts one assignment or many, so "assign to these 40 vendors" is one call. */
  saveAssignments: async (schemeId: number, rows: SchemeAssignment | SchemeAssignment[]) => {
    const payload = (Array.isArray(rows) ? rows : [rows]).map((row) => ({
      scope_type: row.scope_type,
      scope_value: row.scope_type === "ALL" ? "" : row.scope_value.trim(),
      category: row.category || "",
      is_exclusion: row.is_exclusion,
      valid_from: row.valid_from || null,
      valid_to: row.valid_to || null,
      is_active: row.is_active,
    }));
    const response = await api.post(`/orders/v2/schemes/${schemeId}/assignments/`, payload);
    return (response.data?.data || []) as SchemeAssignment[];
  },

  removeAssignment: async (schemeId: number, assignmentId: number) => {
    const response = await api.delete(`/orders/v2/schemes/${schemeId}/assignments/`, {
      params: { assignment_id: assignmentId },
    });
    return response.data as { success: boolean; message: string };
  },

  /** Dry-run the engine over a draft order. Writes nothing. */
  preview: async (cardCode: string, category: string, lines: PreviewLine[]) => {
    const response = await api.post("/orders/v2/schemes/preview/", {
      card_code: cardCode,
      category,
      lines,
    });
    return response.data as PreviewResponse;
  },

  /** Every scheme reaching a vendor, with the scope that let each one in. */
  applicable: async (cardCode: string, category = "") => {
    const response = await api.get("/orders/v2/schemes/applicable/", {
      params: { card_code: cardCode, ...(category ? { category } : {}) },
    });
    return (response.data?.data || []) as ApplicableScheme[];
  },
};

export default schemeService;
