/**
 * Shared shapes for the Invoice Review screen — Phase 4 split.
 *
 * This is a MOVE, not a rewrite: every type here is the same declaration that
 * used to live inline at the top of `InvoiceReview.tsx`, lifted out whole so
 * the hook and the view components can both import it without one owning the
 * other's file.
 */

export type InvoiceStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "EDITED" | "ERROR" | "POSTED_TO_SAP" | "CL_RAISED";

export type InvoiceBatch = {
  BatchNumber?: string;
  SystemSerialNumber?: number;
  Quantity?: number;
};

export type InvoiceLine = {
  LineNum?: number;
  ItemCode?: string;
  Quantity?: number;
  WarehouseCode?: string;
  TaxCode?: string;
  UnitPrice?: number;
  BatchNumbers?: InvoiceBatch[];
  [key: string]: unknown;
};

export type InvoicePayload = {
  CardCode?: string;
  DocDate?: string;
  DocDueDate?: string;
  TaxDate?: string;
  NumAtCard?: string;
  ShipToCode?: string;
  PayToCode?: string;
  DocumentLines?: InvoiceLine[];
  [key: string]: unknown;
};

export type InvoiceRecord = {
  id?: number | string;
  so_number?: string;
  party_name?: string;
  total_amount?: number | string;
  status?: string;
  error_message?: string;
  rejection_reason?: string;
  invoice_log?: number | string;
  created_by?: number | string;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
  branch?: string;
  warehouse?: string;
  invoice_payload?: InvoicePayload | string;
  /** {item_code: product name} for the payload's lines, resolved by the API from
   *  the synced catalogue. The payload itself still carries only codes — it is
   *  the record of what went to SAP. */
  item_names?: Record<string, string>;
  // SAP identifiers recorded when the invoice posted; drive the bill print.
  sap_doc_num?: string | null;
  sap_doc_entry?: string | null;
  // Revision lineage. `supersedes` is the rejected log this one was reworked
  // from; `superseded_by_id` is the replacement that was submitted for it.
  supersedes?: number | string | null;
  supersedes_so_number?: string | null;
  supersedes_status?: string | null;
  supersedes_rejection_reason?: string | null;
  superseded_by_id?: number | string | null;
  // Soft delete. `can_delete` is decided by the backend from the row's status,
  // so the deletable-status list lives in one place and this screen does not
  // keep a second copy of it.
  is_deleted?: boolean;
  can_delete?: boolean;
  deleted_at?: string | null;
  deleted_by_name?: string | null;
  delete_reason?: string | null;
  [key: string]: unknown;
};

export type ApiMessageResponse = {
  message?: unknown;
  detail?: unknown;
  results?: unknown;
  data?: unknown;
  [key: string]: unknown;
};

// Deleting is a soft delete on the backend — the log and its history survive,
// and it stays queryable with ?include_deleted=true — but the review screen
// simply stops listing the row. There is no Deleted tab.
export type FilterKey = InvoiceStatus | "ALL";

// Per-tab count map used for the number badges on the filter tabs. "ALL" holds
// the grand total across every status.
export type StatusCounts = Record<FilterKey, number>;

export type CustomerCard = {
  cardCode?: string;
  cardName?: string;
  cardType?: string;
  balance?: string | number;
  debtLine?: string | number;
  creditLine?: string | number;
};

// One approval stage in a credit-limit request's JSAP flow.
export type CreditLimitStage = {
  stageId?: number;
  stageName?: string;
  priority?: number;
  assignedTo?: string;
  actionStatus?: string | null;
  actionDate?: string | null;
  description?: string | null;
  approvalRequired?: number;
  rejectRequired?: number;
};

/* JSAP reports each approval stage with a single-letter action code, not a word:
 * A = approved, R = rejected, P = pending, null/blank = not actioned yet. The
 * word forms are accepted as a fallback in case the service ever returns them. */
export type StageTone = "approved" | "rejected" | "pending";
export type StageState = { label: string; tone: StageTone };

export type ReportRef = { docEntry: string; docNum: string; party: string; branch: string };
