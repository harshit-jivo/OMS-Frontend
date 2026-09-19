import api from "./api";
import type { Schemas } from "../types/api";

/**
 * Approval workflow admin API.
 *
 * Types mirror the DRF serializers under /api/payments/ (payments/serializers.py).
 * Endpoints that do not exist on the backend yet are marked NOT IMPLEMENTED and
 * documented with the URL they will call once built — they are typed exactly as
 * the finished endpoint will respond, so wiring them up later is a no-op here.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Company IS category — OIL/BEVERAGES/MART map 1:1 to SAP company databases. */
export type Company = "OIL" | "BEVERAGES" | "MART";

/** One company as the server describes it — see `listCompanies`. */
export interface PaymentCompany {
  id: number;
  company: Company;
  display_name: string;
  is_active: boolean;
}

export const COMPANY_OPTIONS: { value: Company; label: string }[] = [
  { value: "OIL", label: "Jivo Oil" },
  { value: "BEVERAGES", label: "Jivo Beverages" },
  { value: "MART", label: "Jivo Mart" },
];

export type DocumentType = "PAYMENT" | "DEPOSIT" | "ORDER";

// ORDER is deliberately absent: sales orders run through the separate legacy
// order-approval flow, so offering it here would let an admin build a workflow
// that never fires. The type keeps ORDER so existing rows still deserialize.
export const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: "PAYMENT", label: "Payment Receipt" },
  { value: "DEPOSIT", label: "Bank Deposit" },
];

export type RequestStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type Decision = "APPROVE" | "REJECT" | "CANCEL";

/** Every new-module view wraps its payload in { success, message, data }. */
interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
}

/** DRF paginated body (core/pagination.py StandardPagination). */
interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * The list endpoints return the paginated body INSIDE the envelope, while the
 * plain DRF generics (workflows, levels) return it bare. Unwrapping in one
 * place keeps that difference out of every component.
 */
export const unwrap = <T>(body: Envelope<T> | T): T =>
  body && typeof body === "object" && "data" in (body as Envelope<T>)
    ? (body as Envelope<T>).data
    : (body as T);

const rows = <T>(body: unknown): T[] => {
  const inner = unwrap<Paginated<T> | T[]>(body as Paginated<T> | T[]);
  if (Array.isArray(inner)) return inner;
  return inner?.results ?? [];
};

// ---------------------------------------------------------------------------
// Workflow configuration
// ---------------------------------------------------------------------------

export interface LevelApprover {
  id: number;
  level: number;
  user: number;
  user_name: string;
  username: string;
  company: Company | "";
  is_active: boolean;
  assigned_at: string;
}

export interface ApprovalLevel {
  id: number;
  workflow: number;
  sequence: number;
  name: string;
  role: number | null;
  role_name: string | null;
  min_approvals: number;
  is_active: boolean;
  approvers: LevelApprover[];
}

export interface ApprovalWorkflow {
  id: number;
  code: string;
  name: string;
  document_type: DocumentType;
  company: Company | "";
  restart_on_reject: boolean;
  forbid_self_approval: boolean;
  is_active: boolean;
  levels: ApprovalLevel[];
  created_at: string;
}

/** Fields the client may send when creating/updating a workflow. */
export type WorkflowPayload = Partial<
  Pick<
    ApprovalWorkflow,
    | "code"
    | "name"
    | "document_type"
    | "company"
    | "restart_on_reject"
    | "forbid_self_approval"
    | "is_active"
  >
>;

export type LevelPayload = Partial<
  Pick<
    ApprovalLevel,
    | "workflow"
    | "sequence"
    | "name"
    | "role"
    | "min_approvals"
    | "is_active"
  >
>;

/** One rung of the ladder as resolved by the preview endpoint. */
export interface PreviewLevel {
  sequence: number;
  name: string;
  role: string | null;
  min_approvals: number;
  eligible_approvers: string[];
  eligible_count: number;
  /** True when NOBODY can approve this level — a document would deadlock. */
  blocked: boolean;
}

export interface WorkflowPreview {
  workflow: string;
  company: string;
  total_levels: number;
  levels: PreviewLevel[];
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface ApprovalAction {
  id: number;
  sequence: number;
  round_number: number;
  level: number;
  level_name: string;
  action: string;
  action_display: string;
  remarks: string;
  approver: number | null;
  approver_username: string;
  approver_role: string;
  acted_at: string;
}

export interface ApprovalRequest {
  id: number;
  workflow: number;
  workflow_code: string;
  document_type: DocumentType;
  company: Company;
  amount: string;
  document_number: string;
  status: RequestStatus;
  status_display: string;
  current_level: number;
  total_levels: number;
  level_label: string;
  round_number: number;
  submitted_by: number | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
  level_entered_at: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ApprovalRequestDetail extends ApprovalRequest {
  actions: ApprovalAction[];
  /** Server-computed: may THIS user act on THIS request right now. */
  can_act: boolean;
}

export interface RequestFilters {
  status?: RequestStatus;
  company?: Company;
  document_type?: DocumentType;
  mine?: boolean;
  page?: number;
}

// ---------------------------------------------------------------------------
// Masters (backend NOT built yet — see notes on each method)
// ---------------------------------------------------------------------------

/** One SAP House Bank Account (DSC1). SAP is the master; OMS stores none. */
export interface SapBank {
  bank_code: string;
  display_name: string;
  gl_account: string;
  account_number: string;
  branch: string;
  ifsc: string;
  key: string;
  label: string;
}

/** Freshness of the cached SAP bank list. */
export interface BankSyncMeta {
  synced_at: string | null;
  stale: boolean;
  source: "sap" | "cache" | "stale" | "none";
  available: boolean;
  bank_count: number;
  /** True when any method is unmapped or points at a vanished account. */
  has_errors: boolean;
}

/** A payment method and the SAP account it resolves to. */
export interface MethodMappingRow {
  payment_method: string;
  label: string;
  is_cash: boolean;
  mapping_id: number | null;
  bank_key: string;
  gl_account: string;
  bank_code: string;
  bank_name: string;
  /**
   * The account's own name in SAP's chart of accounts, e.g.
   * "ICICI BANK LTD - 629305042195". Already carries the account number, so
   * the table shows this instead of separate number and branch columns.
   */
  account_name: string;
  account_number: string;
  branch: string;
  configured: boolean;
  valid: boolean;
  error: string;
}


/**
 * Mirrors payments/serializers.py CollectionPersonSerializer — and, unlike the
 * rest of this file's types, is DERIVED from the generated schema rather than
 * hand-duplicated. The server marks every field but `name` optional (a partial
 * PATCH); `Required` re-tightens that back to what every call site already
 * assumes, so the shape callers see is unchanged, but a field the backend
 * renames or drops now fails this line instead of drifting silently.
 */
export type CollectionPerson = Required<
  Pick<Schemas["CollectionPerson"], "id" | "name" | "code" | "company" | "phone" | "is_active">
>;

export type CollectionPersonPayload = Partial<
  Pick<
    CollectionPerson,
    "name" | "code" | "company" | "phone" | "is_active"
  >
>;

export interface Role {
  id: number;
  name: string;
}

export interface AppUser {
  id: number;
  name: string;
  username: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const approvalService = {
  // The workflow / level / approver / request methods that used to open this
  // object called `/api/approvals/…`, the OLD per-module approval engine. That
  // engine has been removed: its routes are gone and its tables are dropped,
  // so every one of those calls would now 404. Payments approvals are the
  // generic Workflow Engine's, served from `/api/workflow/` and consumed by
  // `workflowService.ts`.
  //
  // What remains here is payments MASTER data — collection people, and the
  // payment-method → SAP bank mapping — which never belonged to the approval
  // engine and is still configured from the Masters tab.

  // ---- Masters ---------------------------------------------------------
  // ---- Bank accounts (admin CRUD) --------------------------------------

  // ---- Collection persons (admin CRUD) ---------------------------------
  adminListCollectionPersons: async (
    company?: Company,
  ): Promise<CollectionPerson[]> => {
    const res = await api.get("/payments/admin/collection-persons/", {
      params: company ? { company } : undefined,
    });
    return rows<CollectionPerson>(res.data);
  },

  createCollectionPerson: async (
    payload: CollectionPersonPayload,
  ): Promise<CollectionPerson> => {
    const res = await api.post("/payments/admin/collection-persons/", payload);
    return unwrap<CollectionPerson>(res.data);
  },

  updateCollectionPerson: async (
    id: number,
    payload: CollectionPersonPayload,
  ): Promise<CollectionPerson> => {
    const res = await api.patch(
      `/payments/admin/collection-persons/${id}/`,
      payload,
    );
    return unwrap<CollectionPerson>(res.data);
  },

  deleteCollectionPerson: async (id: number): Promise<void> => {
    await api.delete(`/payments/admin/collection-persons/${id}/`);
  },

  /** Live — payments/views.py CollectionPersonListView. */
  listCollectionPersons: async (company?: Company): Promise<CollectionPerson[]> => {
    const res = await api.get("/payments/collection-persons/", {
      params: company ? { company } : undefined,
    });
    return rows<CollectionPerson>(res.data);
  },

  // ---- Payment method mapping (admin) ---------------------------------
  /** One row per payment method, with its resolved SAP account. */
  // The payment-method mapping calls lived here — one SAP account per method
  // per company, edited from the Masters tab. The collector now chooses the
  // receiving account on the payment itself, so the table was dropped and its
  // admin endpoints with it. What remains below is payments master data that
  // never belonged to the mapping.


  // ---- Lookups for dropdowns ------------------------------------------
  /**
   * The companies payments may transact in, from the server.
   *
   * The canonical list is CATEGORY_CHOICES on the backend. COMPANY_OPTIONS
   * above is a static fallback kept for the screens that have not moved yet;
   * anything company-aware should prefer this, so a company added or renamed
   * server-side needs no frontend release.
   */
  listCompanies: async (): Promise<PaymentCompany[]> => {
    const res = await api.get("/payments/companies/");
    return rows<PaymentCompany>(res.data);
  },

  listRoles: async (): Promise<Role[]> => {
    const res = await api.get("/auth/roles/");
    return rows<Role>(res.data);
  },

  listUsers: async (): Promise<AppUser[]> => {
    const res = await api.get("/auth/users/list/");
    return rows<AppUser>(res.data);
  },
};

export default approvalService;
