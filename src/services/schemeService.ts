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

/** Schemes are written in pieces or cartons only. Litres is derived (pack size x
 *  pieces) and a bare "qty" was pieces under another name; offering all four only
 *  invited picking the wrong one. Mirrors UOM_CHOICES in orders/models.py. */
export type Uom = "PCS" | "BOX";

export const UOM_OPTIONS: { value: Uom; label: string }[] = [
  { value: "PCS", label: "pieces" },
  { value: "BOX", label: "boxes" },
];

export type MatchType = "ITEM" | "SUB_GROUP" | "VARIETY" | "BRAND" | "CATEGORY" | "ALL";

export const MATCH_TYPE_OPTIONS: { value: MatchType; label: string }[] = [
  { value: "ITEM", label: "one product" },
  { value: "SUB_GROUP", label: "a sub group" },
  { value: "VARIETY", label: "a variety" },
  { value: "BRAND", label: "a brand" },
  { value: "CATEGORY", label: "a category" },
  { value: "ALL", label: "anything" },
];

/**
 * Which half of a 1+1 supplies the qualifying quantity. FREE_LINE is what makes
 * a scheme sit on top of a combo's free item.
 */
export type AppliesTo = "PAID_LINE" | "FREE_LINE" | "BOTH";

export const APPLIES_TO_OPTIONS: { value: AppliesTo; label: string; hint: string }[] = [
  {
    value: "PAID_LINE",
    label: "the quantity ordered",
    hint: "The normal case — count what the vendor actually pays for.",
  },
  {
    value: "FREE_LINE",
    label: "the free half of a 1+1",
    hint: "Count the combo's free item instead, so this offer sits on top of it.",
  },
  {
    value: "BOTH",
    label: "both added together",
    hint: "Count the paid quantity and the combo's free half together.",
  },
];

export type ScopeType = "PARTY" | "MAIN_GROUP" | "STATE" | "CATEGORY" | "ALL";

export const SCOPE_TYPE_OPTIONS: { value: ScopeType; label: string; hint: string }[] = [
  { value: "PARTY", label: "One vendor", hint: "A single party, by card code." },
  { value: "STATE", label: "A whole state", hint: "Every vendor in the state, including ones added later." },
  { value: "MAIN_GROUP", label: "A main group", hint: "Every vendor in that main group." },
  { value: "CATEGORY", label: "A category", hint: "Every vendor ordering in that category." },
  { value: "ALL", label: "Everyone", hint: "Every vendor, with no narrowing at all." },
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
  /** In `free_uom` — what the scheme was written in, and what the UI shows. */
  qty: string;
  /** The same giveaway in single units. SAP DocumentLine quantities are always
   *  pieces, so this — not `qty` — is what an order line must carry. */
  qty_pieces: string;
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
  min_uom: "PCS",
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
  // Sent with the scheme so an offer can be created already targeted. The API
  // replaces the whole set, which is why the editor holds the full list. The
  // dedupe guards the (scheme, scope_type, scope_value, category) unique key.
  assignments: dedupeAssignments(draft.assignments).map((assignment) => ({
    scope_type: assignment.scope_type,
    scope_value: assignment.scope_type === "ALL" ? "" : assignment.scope_value.trim(),
    category: assignment.category || "",
    is_exclusion: assignment.is_exclusion,
    valid_from: assignment.valid_from || null,
    valid_to: assignment.valid_to || null,
    is_active: assignment.is_active,
  })),
});

/** Last one wins on a repeated (type, value, category) — the API's unique key. */
export const dedupeAssignments = (rows: SchemeAssignment[]) => {
  const byKey = new Map<string, SchemeAssignment>();
  rows.forEach((row) => {
    const value = row.scope_type === "ALL" ? "" : row.scope_value.trim();
    byKey.set(`${row.scope_type}|${value.toLowerCase()}|${(row.category || "").toLowerCase()}`, row);
  });
  return [...byKey.values()];
};

/** Resolves an item code to its product name. Falls back to the code itself. */
export type ItemNameResolver = (itemCode: string) => string;

const defaultResolver: ItemNameResolver = (itemCode) => itemCode;

const uomWord = (uom: Uom) => UOM_OPTIONS.find((o) => o.value === uom)?.label ?? uom.toLowerCase();

/** Plain-English summary of what one benefit gives. */
export const describeBenefit = (
  benefit: SchemeBenefit,
  resolveItemName: ItemNameResolver = defaultResolver,
) => {
  const perQty = num(benefit.per_qty);
  const freeQty = num(benefit.free_qty);
  const code = String(benefit.free_item_code ?? "").trim();
  const item = code ? resolveItemName(code) : "the same item";
  const cap = nullableNum(benefit.max_free_qty);
  const capText = cap ? `, up to ${cap}` : "";
  const unit = uomWord(benefit.free_uom);

  if (perQty <= 0 && freeQty <= 0) return `free ${item}, quantity typed by hand`;
  if (perQty <= 0) return `${freeQty} ${unit} of ${item} free${capText}`;
  return `${freeQty} ${unit} of ${item} free for every ${perQty}${capText}`;
};

/** Plain-English summary of what one trigger requires. */
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
  const min = num(trigger.min_qty);
  const what =
    trigger.match_type === "ALL"
      ? "anything"
      : value || "(nothing chosen)";

  const buy = min > 0 ? `buy ${min} ${uomWord(trigger.min_uom)} of ${what}` : `buy ${what}`;
  const half =
    trigger.applies_to === "FREE_LINE"
      ? " (counting the combo's free half)"
      : trigger.applies_to === "BOTH"
        ? " (counting paid + free)"
        : "";
  return `${buy}${half}`;
};

export const describeScope = (assignment: Pick<SchemeAssignment, "scope_type" | "scope_value" | "category">) => {
  const category = assignment.category ? ` · ${assignment.category}` : "";
  if (assignment.scope_type === "ALL") return `Everyone${category}`;
  // These render as small chips, so the value carries it — qualified only where
  // the value alone would be ambiguous.
  const target = assignment.scope_value || "?";
  const named = assignment.scope_type === "MAIN_GROUP" ? `${target} group` : target;
  return `${named}${category}`;
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
