/**
 * budgetService — API layer for BUDGET (budget approval of SAP drafts).
 *
 * SAP is the origin: someone saves an expense document in SAP, it waits as a
 * draft, `manage.py sync_budget_drafts` takes it into OMS, and the budget
 * owner decides it here. OMS never creates or edits a draft, so there is no
 * create and no update — only reads, decisions and the auto-approval setting.
 *
 * No call sends a user id: the server acts as the signed-in user.
 * Shapes mirror OMS-Backend/budget/serializers.py.
 */
import api from "./api";

const BASE = "/budget";

export type BudgetCompany = "OIL" | "BEVERAGES" | "MART";
export type BudgetDraftStatus = "PENDING" | "APPROVED" | "REJECTED" | "GONE";
export type BudgetItemStatus = "PENDING" | "APPROVED" | "REJECTED" | "GONE" | "SUPERSEDED";

export interface BudgetUser {
  id: number;
  name: string;
  username: string;
}

export interface BudgetDraft {
  id: number;
  company: BudgetCompany;
  obj_type: number;
  /** "A/P invoice", "Journal voucher", … */
  obj_type_label: string;
  draft_entry: number;
  doc_num: number | null;
  doc_date: string | null;
  card_code: string;
  card_name: string;
  /** Who raised it in SAP. */
  sap_created_by: string;
  comments: string;
  status: BudgetDraftStatus;
  synced_at: string | null;
  created_at: string | null;
}

export interface BudgetLine {
  line_num: number;
  acct_code: string;
  acct_name: string;
  budget_code: string;
  sub_budget_code: string;
  effect_month: string;
  amount: string;
  remarks: string;
}

export interface BudgetStage {
  stage_id: number;
  name: string;
  sequence: number;
  /** CURRENT, UPCOMING, or what was done there: APPROVE, AUTO_APPROVE, REJECT. */
  state: string;
  user_name: string;
  acted_at: string | null;
}

export interface BudgetLog {
  action: string;
  label: string;
  actor: BudgetUser | null;
  stage: string;
  remarks: string;
  data: Record<string, unknown> | null;
  at: string | null;
}

/** The lines of one draft that share a budget head (route), and the flow deciding them. */
export interface BudgetItem {
  id: number;
  company: BudgetCompany;
  /** FACTORY, FACTORY_ELECTRICITY, SALES_RE, … */
  route: string;
  budget_code: string;
  amount: string;
  status: BudgetItemStatus;
  status_label: string;
  /** Sent back with a decision: a stale screen is refused. */
  version: number;
  workflow: string | null;
  current_stage: string;
  current_user: BudgetUser | null;
  total_stage: number;
  waiting_since: string | null;
  sap_status: "SUCCESS" | "FAILED" | null;
  sap_status_text: string;
  sap_written_at: string | null;
  draft: BudgetDraft;
  lines: BudgetLine[];
  can: { approve: boolean; reject: boolean; retry_sap: boolean };
  stages?: BudgetStage[];
  logs?: BudgetLog[];
}

export interface BudgetDraftDetail extends BudgetDraft {
  items: BudgetItem[];
}

export interface BudgetSettings {
  auto_approve_enabled: boolean;
  auto_approve_hours: number;
  exempt_users: BudgetUser[];
  /** {company: ISO time} of the last sync that read SAP. */
  last_sync: Record<string, string>;
  updated_at: string | null;
}

/** One file attached to a draft in SAP. A journal voucher's single link is line 0. */
export interface BudgetAttachment {
  line: number;
  file_name: string;
  date: string | null;
}

/** One item's outcome in a bulk approval. */
export interface BudgetBulkResult {
  id: number;
  ok: boolean;
  /** True when this approval completed the item (SAP may post); false when it moved on. */
  approved: boolean;
  message: string;
}

export interface BudgetBulkOutcome {
  results: BudgetBulkResult[];
  approved: number;
  refused: number;
  message: string;
}

export interface BudgetCount {
  count: number;
  amount: string;
}

/** One person on the report: what waits on them now, and what they decided. */
export interface BudgetApproverRow {
  user_id: number;
  name: string;
  pending: number;
  approved: number;
  auto_approved: number;
  rejected: number;
  total: number;
}

export interface BudgetReport {
  summary: Record<"total" | "pending" | "approved" | "rejected" | "gone" | "superseded", BudgetCount>;
  approvers: BudgetApproverRow[];
  items: BudgetItem[];
  truncated: boolean;
}

/** The report's filters. `month` is the document's month, `YYYY-MM`. */
export interface BudgetReportFilters {
  month?: string;
  company?: string;
  status?: string;
  q?: string;
}

function reportParams(filters: BudgetReportFilters) {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
}

export interface BudgetHealth {
  company: BudgetCompany;
  last_synced_at: string | null;
  pending: number;
  sap_write_failed: number;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "success" in (payload as object)) {
    return ((payload as { data: T }).data ?? null) as T;
  }
  return payload as T;
}

/** The server's own sentence for an error, which is written for the person reading it. */
export function budgetError(err: unknown): string {
  const resp = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (resp?.status === 401) return "Your session has expired. Please sign in again.";
  const data = resp?.data as { message?: string; detail?: string } | undefined;
  if (data?.message) return data.message;
  if (data?.detail) return data.detail;
  if (!resp) return "The server could not be reached.";
  return `Request failed (${resp.status}).`;
}

/** What a decision returns: the item as it now stands, and the server's sentence. */
export interface BudgetDecision {
  item: BudgetItem;
  message: string;
}

async function decide(id: number, action: "approve" | "reject", remarks: string, version: number) {
  const res = await api.post(`${BASE}/items/${id}/${action}/`, { remarks, version });
  return { item: unwrap<BudgetItem>(res.data), message: (res.data?.message as string) || "" } as BudgetDecision;
}

export const budgetService = {
  queue: async (): Promise<BudgetItem[]> => unwrap<BudgetItem[]>((await api.get(`${BASE}/queue/`)).data) || [],
  history: async (): Promise<BudgetItem[]> => unwrap<BudgetItem[]>((await api.get(`${BASE}/history/`)).data) || [],
  draft: async (id: number): Promise<BudgetDraftDetail> =>
    unwrap<BudgetDraftDetail>((await api.get(`${BASE}/drafts/${id}/`)).data),
  approve: (id: number, remarks: string, version: number) => decide(id, "approve", remarks, version),
  reject: (id: number, remarks: string, version: number) => decide(id, "reject", remarks, version),
  retrySap: async (id: number): Promise<string> => {
    const res = await api.post(`${BASE}/items/${id}/retry-sap/`);
    return (res.data?.message as string) || "SAP accepted it.";
  },
  settings: async (): Promise<BudgetSettings> => unwrap<BudgetSettings>((await api.get(`${BASE}/settings/`)).data),
  saveSettings: async (input: {
    auto_approve_enabled: boolean;
    auto_approve_hours: number;
    exempt_user_ids: number[];
  }): Promise<BudgetSettings> => unwrap<BudgetSettings>((await api.put(`${BASE}/settings/`, input)).data),
  health: async (): Promise<BudgetHealth[]> => unwrap<BudgetHealth[]>((await api.get(`${BASE}/health/`)).data) || [],
  users: async (): Promise<BudgetUser[]> => unwrap<BudgetUser[]>((await api.get(`${BASE}/users/`)).data) || [],
  /** One item in full: what a notification opens. */
  item: async (id: number): Promise<BudgetItem> => unwrap<BudgetItem>((await api.get(`${BASE}/items/${id}/`)).data),
  attachments: async (draftId: number): Promise<BudgetAttachment[]> =>
    unwrap<BudgetAttachment[]>((await api.get(`${BASE}/drafts/${draftId}/attachments/`)).data) || [],
  /** The file itself; the name is resolved from SAP on the server, by line. */
  attachmentFile: async (draftId: number, line: number): Promise<Blob> =>
    (await api.get(`${BASE}/drafts/${draftId}/attachments/${line}/`, { responseType: "blob" })).data as Blob,
  /** Approve several at once; each is decided on its own and answers for itself. */
  approveBulk: async (items: { id: number; version: number }[], remarks: string): Promise<BudgetBulkOutcome> => {
    const res = await api.post(`${BASE}/items/approve-bulk/`, { items, remarks });
    const data = unwrap<Omit<BudgetBulkOutcome, "message">>(res.data);
    return { ...data, message: (res.data?.message as string) || "" };
  },
  report: async (filters: BudgetReportFilters): Promise<BudgetReport> =>
    unwrap<BudgetReport>((await api.get(`${BASE}/report/`, { params: reportParams(filters) })).data),
  exportReport: async (filters: BudgetReportFilters): Promise<Blob> =>
    (await api.get(`${BASE}/report/export/`, { params: reportParams(filters), responseType: "blob" })).data as Blob,
};

/** "FACTORY_ELECTRICITY" -> "Factory · electricity"; the head as people say it. */
export function routeLabel(item: Pick<BudgetItem, "route" | "budget_code">): string {
  return item.route.endsWith("_ELECTRICITY") ? `${item.budget_code} · electricity` : item.budget_code;
}

/** "A/P invoice 1234" — the draft as a person would quote it. */
export function draftLabel(draft: BudgetDraft): string {
  return `${draft.obj_type_label} ${draft.doc_num ?? draft.draft_entry}`;
}
