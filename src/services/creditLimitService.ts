/**
 * creditLimitService — API layer for the Credit Limit module.
 *
 * Mirrors `backdateService`: the shared axios instance supplies auth,
 * refresh-on-401 and the version/device headers, and `unwrap` reads `data`
 * out of the project envelope `{ success, message, data }`.
 *
 * Nothing here sends a user id. The backend takes the requester and the
 * approver from the session, and everything about the customer (name, main
 * group, balance, current limit) from SAP at submission — the form only sends
 * the card code.
 */
import api from "./api";

const BASE = "/credit-limit";

/* ------------------------------------------------------------------ *
 * Types — mirror Backend/credit_limit/serializers.py
 * ------------------------------------------------------------------ */

export type CreditLimitCompany = "OIL" | "BEVERAGES" | "MART";
export const CREDIT_LIMIT_COMPANIES: CreditLimitCompany[] = ["OIL", "BEVERAGES", "MART"];

export type CreditLimitStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Live OCRD facts for one customer. Decimals arrive as strings. */
export interface CreditLimitCustomer {
  card_code: string;
  card_name: string;
  card_type: string;
  main_group: string;
  balance: string;
  credit_limit: string;
}

export interface CreditLimitFlow {
  status: CreditLimitStatus;
  workflow_code: string;
  current_stage_name: string;
  current_stage_sequence: number | null;
  current_user_username: string;
  total_stage: number;
  /** SAP's own words on the last write attempt; empty until one is made. */
  sap_response: string;
  updated_at: string;
}

export interface CreditLimitRequest {
  id: number;
  company: CreditLimitCompany;
  card_code: string;
  card_name: string;
  main_group: string;
  /** Snapshotted from SAP at submission. */
  current_balance: string;
  current_credit_limit: string;
  new_credit_limit: string;
  valid_till: string;
  remarks: string;
  /** Empty when the request has no file. */
  attachment_name: string;
  invoice_log: unknown;
  created_by?: number;
  created_by_username: string;
  created_at: string;
  flow: CreditLimitFlow | null;
}

export interface CreditLimitActionRow {
  id?: number;
  action: string;
  stage?: number | null;
  stage_name: string;
  acted_by?: number | null;
  acted_by_username: string;
  remarks: string;
  acted_at: string;
}

export interface CreditLimitStageProgress {
  stage_id: number;
  sequence: number;
  stage_name: string;
  status: "APPROVED" | "REJECTED" | "AWAITING" | "UPCOMING" | "SKIPPED";
  reviewer: string;
  acted_by: string;
  acted_at: string | null;
  remarks: string;
}

export interface CreditLimitHistory {
  actions: CreditLimitActionRow[];
  stages: CreditLimitStageProgress[];
}

export interface NewCreditLimitRequest {
  company: CreditLimitCompany;
  card_code: string;
  new_credit_limit: string;
  /** `YYYY-MM-DD`, today or later. */
  valid_till: string;
  remarks?: string;
  attachment?: File | null;
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

function pushMessages(out: string[], value: unknown) {
  if (Array.isArray(value)) out.push(value.filter((v) => typeof v === "string").join(" "));
  else if (typeof value === "string") out.push(value);
}

/**
 * A readable sentence from any backend error shape.
 *
 * The server's `message` is passed through: a 409 ("SAP has no customer …",
 * "no workflow matches …"), a 403 ("not your stage") and a 502 SAP refusal
 * each say something specific, and replacing them with a generic line would
 * hide the one thing the user can act on. For a 502 on approve, SAP's own
 * response (`errors.sap`) is appended.
 */
export function creditLimitError(err: unknown): string {
  const resp = (err as { response?: { status?: number; data?: unknown } })?.response;
  const status = resp?.status;
  const data = resp?.data as Record<string, unknown> | undefined;

  if (status === 401) return "Your session has expired. Please sign in again.";

  if (data && typeof data === "object" && !(data instanceof Blob)) {
    const details: string[] = [];
    const errors = data.errors as Record<string, unknown> | undefined;
    if (errors && typeof errors === "object") {
      for (const [key, value] of Object.entries(errors)) {
        if (key === "sap") {
          if (typeof value === "string" && value) details.push(`SAP: ${value}`);
          else if (value && typeof value === "object") details.push(`SAP: ${JSON.stringify(value)}`);
        } else {
          pushMessages(details, value);
        }
      }
    }
    const msg = (data.message || data.detail || data.error) as string | undefined;
    const extra = details.filter((d) => d && d !== msg);
    if (msg && extra.length) return `${msg}\n${extra.join("\n")}`;
    if (msg) return msg;
    if (extra.length) return extra.join("\n");
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

type ListOpts = { company?: string; status?: string };

function listParams(opts: ListOpts) {
  const params: Record<string, string> = {};
  if (opts.company) params.company = opts.company;
  if (opts.status) params.status = opts.status;
  return params;
}

export const creditLimitService = {
  // --- SAP -----------------------------------------------------------
  customer: async (
    company: CreditLimitCompany,
    cardCode: string,
  ): Promise<CreditLimitCustomer> => {
    const res = await api.get(
      `${BASE}/customers/${encodeURIComponent(cardCode)}/`,
      { params: { company } },
    );
    return unwrap<CreditLimitCustomer>(res.data);
  },

  // --- my requests ---------------------------------------------------
  listRequests: async (opts: ListOpts = {}): Promise<CreditLimitRequest[]> => {
    const res = await api.get(`${BASE}/requests/`, { params: listParams(opts) });
    return unwrap<CreditLimitRequest[]>(res.data) || [];
  },
  getRequest: async (id: number): Promise<CreditLimitRequest> => {
    const res = await api.get(`${BASE}/requests/${id}/`);
    return unwrap<CreditLimitRequest>(res.data);
  },
  createRequest: async (body: NewCreditLimitRequest): Promise<CreditLimitRequest> => {
    const form = new FormData();
    form.append("company", body.company);
    form.append("card_code", body.card_code);
    form.append("new_credit_limit", body.new_credit_limit);
    form.append("valid_till", body.valid_till);
    form.append("remarks", body.remarks ?? "");
    if (body.attachment) form.append("attachment", body.attachment);
    const res = await api.post(`${BASE}/requests/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return unwrap<CreditLimitRequest>(res.data);
  },
  history: async (id: number): Promise<CreditLimitHistory> => {
    const res = await api.get(`${BASE}/requests/${id}/history/`);
    return unwrap<CreditLimitHistory>(res.data) || { actions: [], stages: [] };
  },
  /** The request's file. Needs the auth header, so it is fetched as a blob. */
  attachment: async (id: number): Promise<Blob> => {
    const res = await api.get(`${BASE}/requests/${id}/attachment/`, {
      responseType: "blob",
    });
    return res.data as Blob;
  },

  // --- approval desk -------------------------------------------------
  /** Only what THIS user may act on now — resolved server-side. */
  approvalQueue: async (opts: ListOpts = {}): Promise<CreditLimitRequest[]> => {
    const res = await api.get(`${BASE}/approvals/queue/`, { params: listParams(opts) });
    return unwrap<CreditLimitRequest[]>(res.data) || [];
  },
  /** Requests this user has already decided a stage of. */
  approvalHistory: async (opts: ListOpts = {}): Promise<CreditLimitRequest[]> => {
    const res = await api.get(`${BASE}/approvals/history/`, { params: listParams(opts) });
    return unwrap<CreditLimitRequest[]>(res.data) || [];
  },
  approve: async (id: number, remarks = ""): Promise<CreditLimitRequest> => {
    const res = await api.post(`${BASE}/requests/${id}/approve/`, { remarks });
    return unwrap<CreditLimitRequest>(res.data);
  },
  reject: async (id: number, remarks: string): Promise<CreditLimitRequest> => {
    const res = await api.post(`${BASE}/requests/${id}/reject/`, { remarks });
    return unwrap<CreditLimitRequest>(res.data);
  },
};

export default creditLimitService;
