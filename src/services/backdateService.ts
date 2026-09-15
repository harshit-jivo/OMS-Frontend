/**
 * backdateService — API layer for the BackDate (BKDT) module.
 *
 * Uses the shared axios instance, so auth, refresh-on-401 and the
 * version/device headers all come for free. Every endpoint answers with the
 * project envelope `{ success, message, data }`; `unwrap` reads `data` out of
 * it and tolerates a bare payload.
 *
 * NOTE what none of these calls send: a user id. The backend derives the
 * acting user from the session for every decision — creating, approving and
 * rejecting all. The JSAP predecessor took the approver's id from the request
 * body, which is why its approval endpoint could be driven as anybody.
 */
import api from "./api";

const BASE = "/backdate";

/* ------------------------------------------------------------------ *
 * Types — mirror OMS-Backend/backdate/serializers.py
 * ------------------------------------------------------------------ */

/** Companies a grant can apply to. BKDT is always ONE company per request. */
export type BackDateCompany = "OIL" | "BEVERAGES" | "MART";
export const BACKDATE_COMPANIES: BackDateCompany[] = ["OIL", "BEVERAGES", "MART"];

/** What the rights are for. `A` = add documents, `U` = update them. */
export type BackDateAction = "A" | "U";

/**
 * What a request STORES: one action, or both.
 *
 * Both is one request, not two. SAP is never told the action — `OPEN_BKDT` has
 * no such parameter — so Add + Update is a single grant with a wider recorded
 * scope, which is exactly how JSAP stored it.
 */
export type BackDateActionValue = BackDateAction | "A,U";

export type BackDateFlowStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * Whether the approved grant actually reached SAP.
 *
 * `null` until the final approval attempts the write. Two values and a null,
 * rather than four values: "has SAP been written to?" should not have three
 * different ways of saying no.
 */
export type BackDateHanaStatus = "SUCCESS" | "FAILED" | null;

/**
 * Where a request currently is.
 *
 * Everything naming a stage or a user is RESOLVED server-side from the
 * workflow's current configuration — nothing here is a stored copy. That is
 * why a stage reassignment or an active replacement shows up immediately:
 * `current_user_username` is the configured holder, `effective_user_username`
 * is who may act today, and they differ exactly when a stand-in is covering.
 */
/** One `OPEN_BKDT` invocation: which branch, and the 11 parameters sent. */
export interface BackDateSapCall {
  branch: string;
  parameters: Record<string, string | number | null>;
}

/** One `OPEN_BKDT` outcome: SAP's own response or its own error, verbatim. */
export interface BackDateSapResult {
  branch: string;
  status: "SUCCESS" | "FAILED";
  response: string;
}

export interface BackDateFlow {
  id: number;
  backdate: number;
  status: BackDateFlowStatus;
  hana_status: BackDateHanaStatus;
  /** Exactly what was sent to `OPEN_BKDT`, one entry per company. */
  sap_payload: { calls: BackDateSapCall[] } | null;
  /** Exactly what SAP said, per company, as JSON. Never a generic message. */
  hana_status_text: string;
  workflow: number;
  workflow_code: string;
  current_user: number | null;
  current_user_username: string;
  effective_user_username: string;
  has_active_replacement: boolean;
  /** `workflow_stages.id`, or null once the flow is finished. */
  current_stage: number | null;
  current_stage_name: string;
  current_stage_sequence: number | null;
  /** Stages the chosen workflow had at submission — "stage 2 of 3". */
  total_stage: number;
  created_at: string;
  updated_at: string;
}

export interface BackDateRequest {
  id: number;
  /** The selected companies, canonical and comma-separated: `"OIL,BEVERAGES"`. */
  company: string;
  /** The same set, rendered for people: `"OIL, BEVERAGES"`. */
  company_label: string;
  /** The same set as a list, so a client never splits the string itself. */
  companies: BackDateCompany[];
  /** The SAP user being granted rights — not the OMS user who asked. */
  sap_username: string;
  /** SAP object type (MOBJ.ObjType). Numeric because SAP requires it. */
  document_type: number;
  from_date: string;
  to_date: string;
  time_limit: string;
  action: BackDateActionValue;
  action_label: string;
  remarks: string;
  created_by: number;
  created_by_username: string;
  created_at: string;
  updated_at: string;
  flow: BackDateFlow | null;
}

/** One field an edit changed. */
export interface BackDateFieldChange {
  old: string | number | null;
  new: string | number | null;
}

export interface BackDateActionRow {
  id: number;
  backdate: number;
  action: "CREATE" | "UPDATE" | "APPROVE" | "REJECT";
  action_label: string;
  /** `workflow_stages.id`; null for CREATE and UPDATE. */
  stage: number | null;
  /** Resolved from `stage`, never stored — a renamed stage reads correctly. */
  stage_name: string;
  acted_by: number | null;
  acted_by_username: string;
  remarks: string;
  /** Set on UPDATE rows only: the changed fields, old and new. */
  action_data: Record<string, BackDateFieldChange> | null;
  acted_at: string;
}

export interface BackDateHistory {
  actions: BackDateActionRow[];
}

export interface BackDateInsights {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export interface SapUser {
  user_id: number;
  user_code: string;
}

export interface SapDocumentType {
  object_type: number;
  name: string;
}

export interface DecisionResult {
  flow_id: number;
  flow_status: BackDateFlowStatus;
  /** The stage it moved to, or null once the flow is finished. */
  current_stage?: number | null;
  current_user?: number | null;
  hana_status?: BackDateHanaStatus;
  hana_status_text?: string;
  /** null until final approval; false when SAP refused the write. */
  hana_applied?: boolean | null;
}

export interface NewBackDateRequest {
  /**
   * The companies this ONE request covers.
   *
   * Several companies is one request, not one per company: it is a single
   * business decision, approved once. The fan-out happens at the SAP layer,
   * where `OPEN_BKDT` takes one branch per call.
   */
  company: BackDateCompany[];
  sap_username: string;
  document_type: number;
  from_date: string;
  to_date: string;
  /**
   * REQUIRED. SAP only honours a grant while `CURRENT_TIMESTAMP < timeLimit`,
   * so rights with no expiry are silently ignored by the posting validator —
   * the request reads as approved and the user still cannot post.
   */
  time_limit: string;
  action: BackDateActionValue;
  remarks?: string;
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
 * The two that matter here are both 403s with different meanings — "you cannot
 * approve at all" and "this is not your stage" — and the backend words them
 * distinctly, so the message is passed through rather than replaced.
 */
export function backdateError(err: unknown): string {
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
  if (status === 404) return "That request no longer exists.";
  if (status && status >= 500) {
    return "The server could not complete the request. The incident has been logged.";
  }
  return "Something went wrong. Please try again.";
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export const backdateService = {
  // --- SAP master data ----------------------------------------------
  sapUsers: async (company: BackDateCompany): Promise<SapUser[]> => {
    const res = await api.get(BASE + "/sap-users/", { params: { company } });
    return unwrap<SapUser[]>(res.data) || [];
  },
  documentTypes: async (company: BackDateCompany): Promise<SapDocumentType[]> => {
    const res = await api.get(BASE + "/document-types/", { params: { company } });
    return unwrap<SapDocumentType[]>(res.data) || [];
  },

  // --- my requests ---------------------------------------------------
  listRequests: async (
    opts: { status?: string; company?: string; month?: string } = {},
  ): Promise<BackDateRequest[]> => {
    const params: Record<string, string> = {};
    if (opts.status) params.status = opts.status;
    if (opts.company) params.company = opts.company;
    if (opts.month) params.month = opts.month;
    const res = await api.get(BASE + "/requests/", { params });
    return unwrap<BackDateRequest[]>(res.data) || [];
  },
  getRequest: async (id: number): Promise<BackDateRequest> => {
    const res = await api.get(BASE + "/requests/" + id + "/");
    return unwrap<BackDateRequest>(res.data);
  },
  createRequest: async (body: NewBackDateRequest): Promise<BackDateRequest> => {
    const res = await api.post(BASE + "/requests/", body);
    return unwrap<BackDateRequest>(res.data);
  },
  updateRequest: async (
    id: number,
    body: Partial<NewBackDateRequest> & { log_remarks?: string },
  ): Promise<BackDateRequest> => {
    const res = await api.patch(BASE + "/requests/" + id + "/", body);
    return unwrap<BackDateRequest>(res.data);
  },
  history: async (id: number): Promise<BackDateHistory> => {
    const res = await api.get(BASE + "/requests/" + id + "/history/");
    return unwrap<BackDateHistory>(res.data);
  },
  insights: async (
    opts: { company?: string; month?: string } = {},
  ): Promise<BackDateInsights> => {
    const params: Record<string, string> = {};
    if (opts.company) params.company = opts.company;
    if (opts.month) params.month = opts.month;
    const res = await api.get(BASE + "/insights/", { params });
    return unwrap<BackDateInsights>(res.data);
  },

  // --- approval desk -------------------------------------------------
  /** Only what THIS user may act on — membership resolved server-side. */
  approvalQueue: async (
    opts: { company?: string } = {},
  ): Promise<BackDateRequest[]> => {
    const res = await api.get(BASE + "/approvals/queue/", {
      params: opts.company ? { company: opts.company } : {},
    });
    return unwrap<BackDateRequest[]>(res.data) || [];
  },
  approvalHistory: async (
    opts: { status?: string; company?: string } = {},
  ): Promise<BackDateRequest[]> => {
    const params: Record<string, string> = {};
    if (opts.status) params.status = opts.status;
    if (opts.company) params.company = opts.company;
    const res = await api.get(BASE + "/approvals/history/", { params });
    return unwrap<BackDateRequest[]>(res.data) || [];
  },
  /**
   * Counts for the approval desk.
   *
   * A separate endpoint from `insights`, not a parameter on it: that one counts
   * the caller's OWN requests, this one counts what they are approving. The two
   * answer different questions for the same user.
   */
  approvalInsights: async (
    opts: { company?: string } = {},
  ): Promise<BackDateInsights> => {
    const res = await api.get(BASE + "/approvals/insights/", {
      params: opts.company ? { company: opts.company } : {},
    });
    return unwrap<BackDateInsights>(res.data);
  },
  /**
   * Decisions are addressed by REQUEST, not by task.
   *
   * There is no task table any more: a request waits at one stage at a time
   * and its flow says which, so the request id is enough and the client has no
   * second identifier to track.
   */
  approve: async (requestId: number, remarks = ""): Promise<DecisionResult> => {
    const res = await api.post(BASE + "/requests/" + requestId + "/approve/",
                               { remarks });
    return unwrap<DecisionResult>(res.data);
  },
  reject: async (requestId: number, remarks: string): Promise<DecisionResult> => {
    const res = await api.post(BASE + "/requests/" + requestId + "/reject/",
                               { remarks });
    return unwrap<DecisionResult>(res.data);
  },
  /** Re-attempt the SAP write for an approved request whose write failed. */
  retryHana: async (requestId: number): Promise<DecisionResult> => {
    const res = await api.post(BASE + "/requests/" + requestId + "/retry-hana/");
    return unwrap<DecisionResult>(res.data);
  },
};

export default backdateService;
