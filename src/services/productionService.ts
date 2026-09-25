/**
 * productionService — API layer for the PRDO (Production Order) module.
 *
 * Uses the shared axios instance, so auth, refresh-on-401 and the
 * version/device headers all come for free. Every endpoint answers with the
 * project envelope `{ success, message, data }`; `unwrap` reads `data` out of
 * it and tolerates a bare payload.
 *
 * THERE IS NO CREATE AND NO EDIT HERE, AND THAT IS THE DESIGN.
 * SAP is the point of origin: a planner raises a production order in SAP B1,
 * `manage.py sync_production_orders` notices it, and OMS decides it. OMS never
 * creates, edits, cancels or closes a production order — so this service has
 * no `create` and no `update`, only reads and decisions.
 *
 * NOTE what none of these calls send: a user id. The backend derives the
 * acting user from the session for every decision. JSAP's production
 * endpoints took the approver's id from the request body.
 */
import api from "./api";

const BASE = "/production";

/* ------------------------------------------------------------------ *
 * Types — mirror OMS-Backend/production/serializers.py
 * ------------------------------------------------------------------ */

export type ProductionCompany = "OIL" | "BEVERAGES" | "MART";
export const PRODUCTION_COMPANIES: ProductionCompany[] = ["OIL", "BEVERAGES", "MART"];

/**
 * Where a request is in OMS.
 *
 * `OBSOLETE` has no equivalent in BackDate and is not a decision: SAP moved
 * the order out of Planned before anyone judged it, so the question stopped
 * being asked. JSAP had no such exit, which is why 17 of its requests have sat
 * Pending since as far back as October 2025.
 */
export type ProductionFlowStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "OBSOLETE";

/** Whether the approval actually reached SAP. `null` until it is attempted. */
export type ProductionSapStatus = "SUCCESS" | "FAILED" | null;

/** `OWOR.Status`, as SAP spells it. Snapshotted by the sync, never set here. */
export type SapOrderStatus = "P" | "R" | "L" | "C";

export const SAP_ORDER_STATUS_LABEL: Record<SapOrderStatus, string> = {
  P: "Planned",
  R: "Released",
  L: "Closed",
  C: "Cancelled",
};

/** `OWOR.Type`. Only Standard is gated by SAP, and only Standard is synced. */
export type SapOrderType = "S" | "P" | "D";

export const SAP_ORDER_TYPE_LABEL: Record<SapOrderType, string> = {
  S: "Standard",
  P: "Special",
  D: "Disassembly",
};

/**
 * Where a request currently is.
 *
 * Everything naming a stage or a user is RESOLVED server-side from the
 * workflow's CURRENT configuration — nothing here is a stored copy. That is
 * why reassigning a stage, or opening a replacement window, shows up
 * immediately with nothing migrated.
 */
export interface ProductionFlow {
  id: number;
  status: ProductionFlowStatus;
  sap_status: ProductionSapStatus;
  /** The exact SAP response, or the database error verbatim. */
  sap_status_text: string;
  workflow: number;
  workflow_code: string;
  current_stage: number | null;
  current_stage_name: string | null;
  current_stage_sequence: number | null;
  current_user: number | null;
  current_user_name: string | null;
  /** Stage count AT SUBMISSION, so "stage 2 of 3" survives a later edit. */
  total_stage: number;
  /** Pre-rendered "Stage 2 of 3", or null once the flow is finished. */
  stage_label: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One production order, as SAP had it when OMS first saw it.
 *
 * Every SAP-derived field is a SNAPSHOT: refreshed while the decision is open,
 * frozen once it is made. An item renamed in SAP later must not change what an
 * approved order says it was.
 */
export interface ProductionOrder {
  id: number;
  company: ProductionCompany;
  /** `OWOR.DocEntry` — unique only WITHIN a company. */
  sap_doc_entry: number;
  /** `OWOR.DocNum` — the number a human quotes. */
  sap_doc_num: number | null;

  item_code: string;
  item_name: string;
  item_group: string;
  item_series: number | null;
  warehouse: string;

  /** PIECES, because that is what `OWOR.PlannedQty` means. */
  planned_qty: string;
  /** Derived from the pack-size snapshots, never stored. Null if unknown. */
  planned_boxes: string | null;
  planned_litres: string | null;
  sal_factor2: string | null;
  sal_pack_un: string | null;

  order_type: SapOrderType;
  post_date: string | null;
  due_date: string | null;
  start_date: string | null;

  batch_no: string;
  mfg_date: string | null;
  expiry_date: string | null;

  /** Who raised it in SAP. A snapshot, not an OMS identity. */
  sap_created_by: string;
  sap_user_sign: number | null;
  /**
   * True when SAP's release gate would not have stopped this order anyway —
   * a raw material, a non-Standard order, or one raised by the exempt user.
   *
   * Surfaced deliberately. The OIL gate ends `AND A."UserSign" <> 33`, and
   * user 33 raised 2,888 of the 3,152 eligible orders, so most approvals are a
   * RECORD rather than a CONTROL. An approval that was never going to be
   * enforced should not look identical to one that was.
   */
  gate_exempt: boolean;
  /** Only on the detail endpoint. Why the gate would skip it, or null. */
  gate_exemption_reason?: string | null;

  remarks: string;
  /** Last seen `OWOR.Status`. Anything but `P` on a pending flow retires it. */
  sap_status: SapOrderStatus;
  synced_at: string;

  created_at: string;
  updated_at: string;
  flow: ProductionFlow | null;
}

export type ProductionLogAction = "SYNC" | "APPROVE" | "REJECT" | "OBSOLETE";

export interface ProductionActionLog {
  id: number;
  action: ProductionLogAction;
  /** Null for SYNC and OBSOLETE — neither is performed by an OMS user. */
  acted_by: number | null;
  acted_by_name: string | null;
  stage: number | null;
  /** Resolved through the FK, so a renamed stage reads correctly in history. */
  stage_name: string | null;
  stage_sequence: number | null;
  remarks: string;
  /** Changed snapshot fields on a refresh: {field: {old, new}}. */
  action_data: Record<string, { old: string | null; new: string | null }> | null;
  acted_at: string;
}

/**
 * One warehouse's holding of the order's item.
 *
 * `on_hand` is a STRING for the same reason `planned_qty` is: it is
 * `numeric(19,6)` in HANA and a JSON number loses precision.
 */
export interface WarehouseStock {
  warehouse: string;
  warehouse_name: string;
  /** Flagged, not filtered: a closed warehouse can still hold stock. */
  inactive: boolean;
  on_hand: string;
  /** The warehouse this production order will consume from. */
  is_order_warehouse: boolean;
}

/**
 * Where the order's item is, across the order's SITE.
 *
 * `results` holds ONLY the warehouses with stock, plus the order's own — the
 * site runs to 35 warehouses and an item is typically in two or three, so the
 * rest were rows of zeros. `site_warehouses` and `holding` keep the "3 of 35"
 * sentence answerable without shipping the other 32.
 *
 * Empty `results` means the site genuinely holds none; a failed read is a 503,
 * so the two cannot be confused.
 */
export interface ItemLocationStock {
  /** The order's own warehouse, which is what selects the site. */
  warehouse: string;
  /** `OWHS.Location` — SAP's grouping of warehouses into a physical site. */
  location: number | null;
  site_warehouses: number;
  holding: number;
  results: WarehouseStock[];
}

export interface ProductionInsights {
  total: number;
  by_status: Partial<Record<ProductionFlowStatus, number>>;
  approved_total: number;
  /** Approvals SAP would not have enforced. See `gate_exempt`. */
  approved_but_exempt_from_sap_gate: number;
  sap_write_failed: number;
}

/** One company's feed health. Answers "is the sync alive?" without Task Scheduler. */
export interface ProductionHealth {
  company: ProductionCompany;
  last_synced_at: string | null;
  pending: number;
  sap_write_failed: number;
}

export interface DecisionResult {
  flow_id: number;
  flow_status: ProductionFlowStatus;
  current_stage: number | null;
  current_user: number | null;
  sap_status?: ProductionSapStatus;
  sap_status_text?: string;
  /** null when the decision did not finish the flow, so SAP was not written. */
  sap_written?: boolean | null;
}

/* ------------------------------------------------------------------ *
 * Envelope + error helpers
 * ------------------------------------------------------------------ */

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "success" in (payload as object)) {
    return ((payload as { data: T }).data ?? null) as T;
  }
  return payload as T;
}

/**
 * A readable sentence from any backend error shape.
 *
 * The messages that matter here are deliberately distinct on the server —
 * "you do not have permission" versus "this request is not waiting for your
 * decision" — so they are passed through rather than replaced. The first sends
 * someone to an administrator; the second does not.
 */
export function productionError(err: unknown): string {
  const resp = (err as { response?: { status?: number; data?: unknown } })?.response;
  const status = resp?.status;
  const data = resp?.data as Record<string, unknown> | undefined;

  if (status === 401) return "Your session has expired. Please sign in again.";

  if (data && typeof data === "object") {
    const fieldMessages: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (["success", "message", "detail", "error", "data", "errors"].includes(key)) continue;
      if (Array.isArray(value)) fieldMessages.push(value.join(" "));
      else if (typeof value === "string") fieldMessages.push(value);
    }
    const errors = data.errors as Record<string, unknown> | undefined;
    if (errors && typeof errors === "object") {
      for (const [, value] of Object.entries(errors)) {
        if (Array.isArray(value)) fieldMessages.push(value.join(" "));
        else if (typeof value === "string") fieldMessages.push(value);
      }
    }
    const msg = (data.message || data.detail || data.error) as string | undefined;
    if (msg && fieldMessages.length) return `${msg}\n${fieldMessages.join("\n")}`;
    if (msg) return msg;
    if (fieldMessages.length) return fieldMessages.join("\n");
  }

  if (status === 403) return "You are not allowed to do that.";
  if (status === 404) return "That production order no longer exists.";
  if (status === 409) return "That request has already been decided.";
  if (status === 502) return "SAP did not accept the approval. It can be retried.";
  if (status && status >= 500) {
    return "The server could not complete the request. The incident has been logged.";
  }
  return "Something went wrong. Please try again.";
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export const productionService = {
  // --- reading -------------------------------------------------------
  listOrders: async (
    opts: { status?: string; company?: string; item_code?: string } = {},
  ): Promise<ProductionOrder[]> => {
    const params: Record<string, string> = {};
    if (opts.status) params.status = opts.status;
    if (opts.company) params.company = opts.company;
    if (opts.item_code) params.item_code = opts.item_code;
    const res = await api.get(BASE + "/requests/", { params });
    return unwrap<ProductionOrder[]>(res.data) || [];
  },
  getOrder: async (id: number): Promise<ProductionOrder> => {
    const res = await api.get(BASE + "/requests/" + id + "/");
    return unwrap<ProductionOrder>(res.data);
  },
  history: async (id: number): Promise<ProductionActionLog[]> => {
    const res = await api.get(BASE + "/requests/" + id + "/history/");
    return unwrap<ProductionActionLog[]>(res.data) || [];
  },
  /**
   * Where the order's item actually is, read live from SAP.
   *
   * Not part of `getOrder`: it is a HANA round trip against OWHS/OITW and
   * nothing in the list needs it, so it stays a separate call the detail
   * dialog makes when it opens.
   */
  stock: async (id: number): Promise<ItemLocationStock> => {
    const res = await api.get(BASE + "/requests/" + id + "/stock/");
    return unwrap<ItemLocationStock>(res.data);
  },
  insights: async (
    opts: { company?: string } = {},
  ): Promise<ProductionInsights> => {
    const res = await api.get(BASE + "/insights/", {
      params: opts.company ? { company: opts.company } : {},
    });
    return unwrap<ProductionInsights>(res.data);
  },
  /** Last successful sync per company — "is the feed alive?" */
  health: async (): Promise<ProductionHealth[]> => {
    const res = await api.get(BASE + "/health/");
    return unwrap<ProductionHealth[]>(res.data) || [];
  },

  // --- approval desk -------------------------------------------------
  /**
   * Only what THIS user may act on today, stand-ins included.
   *
   * Resolved server-side through the workflow stage, never through a stored
   * `current_user` — so a stage reassigned while a request sat still, or a
   * replacement window that opened since, is reflected immediately.
   */
  approvalQueue: async (
    opts: { company?: string } = {},
  ): Promise<ProductionOrder[]> => {
    const res = await api.get(BASE + "/approvals/queue/", {
      params: opts.company ? { company: opts.company } : {},
    });
    return unwrap<ProductionOrder[]>(res.data) || [];
  },
  approvalHistory: async (
    opts: { status?: string; company?: string } = {},
  ): Promise<ProductionOrder[]> => {
    const params: Record<string, string> = {};
    if (opts.status) params.status = opts.status;
    if (opts.company) params.company = opts.company;
    const res = await api.get(BASE + "/approvals/history/", { params });
    return unwrap<ProductionOrder[]>(res.data) || [];
  },

  /**
   * Decisions are addressed by ORDER, not by task.
   *
   * There is no task table: an order waits at one stage at a time and its flow
   * says which, so the order id is enough.
   */
  approve: async (orderId: number, remarks = ""): Promise<DecisionResult> => {
    const res = await api.post(BASE + "/requests/" + orderId + "/approve/", { remarks });
    return unwrap<DecisionResult>(res.data);
  },
  reject: async (orderId: number, remarks: string): Promise<DecisionResult> => {
    const res = await api.post(BASE + "/requests/" + orderId + "/reject/", { remarks });
    return unwrap<DecisionResult>(res.data);
  },
  /** Re-attempt the SAP write for an approved order whose write failed. */
  retrySap: async (orderId: number): Promise<DecisionResult> => {
    const res = await api.post(BASE + "/requests/" + orderId + "/retry-sap/");
    return unwrap<DecisionResult>(res.data);
  },
};

export default productionService;
