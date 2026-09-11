/**
 * Pure helpers, constants and the two API calls for Invoice Review — Phase 4
 * split. Lifted verbatim out of `InvoiceReview.tsx`; nothing here changed
 * behaviour, only address.
 */
import { apiFetch } from "../SalesInvoice/useSalesInvoice";
import { toNumber } from "../SalesInvoice/salesInvoice.utils";
import { openBillPrint } from "../../hooks/useBillPrint";
import type {
  ApiMessageResponse,
  CreditLimitStage,
  FilterKey,
  InvoicePayload,
  InvoiceRecord,
  InvoiceStatus,
  ReportRef,
  StageState,
  StatusCounts,
} from "./types";

// Exact status string the backend stores after a successful SAP post.
// Change this single constant if the backend expects a different value.
export const POSTED_TO_SAP_STATUS: InvoiceStatus = "POSTED_TO_SAP";

export const STATUS_FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "POSTED_TO_SAP", label: "Posted to SAP" },
  { key: "REJECTED", label: "Rejected" },
  { key: "EDITED", label: "Edited" },
  { key: "ERROR", label: "Error" },
  { key: "CL_RAISED", label: "CL Raised" },
  { key: "ALL", label: "All" },
];

// Human-readable label for a status (e.g. POSTED_TO_SAP -> "POSTED TO SAP").
export const statusLabel = (status: InvoiceStatus) => status.replace(/_/g, " ");

export const createEmptyCounts = (): StatusCounts => ({
  PENDING: 0,
  APPROVED: 0,
  POSTED_TO_SAP: 0,
  REJECTED: 0,
  EDITED: 0,
  ERROR: 0,
  CL_RAISED: 0,
  ALL: 0,
});

export const formatAmount = (value: unknown) => {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatDateTime = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const normalizeStatus = (status?: string): InvoiceStatus => {
  const upper = String(status || "")
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (
    upper === "APPROVED" ||
    upper === "REJECTED" ||
    upper === "EDITED" ||
    upper === "ERROR" ||
    upper === "POSTED_TO_SAP" ||
    upper === "CL_RAISED"
  ) {
    return upper;
  }
  return "PENDING";
};

// Records may arrive as a bare array or wrapped in { results } / { data }.
export const extractRecords = (payload: unknown): InvoiceRecord[] => {
  if (Array.isArray(payload)) return payload as InvoiceRecord[];
  if (payload && typeof payload === "object") {
    const wrapped = payload as ApiMessageResponse;
    if (Array.isArray(wrapped.results)) return wrapped.results as InvoiceRecord[];
    if (Array.isArray(wrapped.data)) return wrapped.data as InvoiceRecord[];
  }
  return [];
};

/**
 * Newest first — the order every tab lists in.
 *
 * The endpoint returns rows in insertion order, so the invoice someone just
 * approved went to the BOTTOM of a list hundreds long, and a queue worked
 * top-down showed the oldest thing first on all seven tabs.
 *
 * COPIES BEFORE SORTING. `extractRecords` hands back the response array
 * itself when the body is a bare array, and `.sort()` mutates — sorting in
 * place would reorder the body cached by TanStack Query, which is shared.
 *
 * A row with no `created_at` sorts to the END rather than the top: falling
 * back to 0 would make it 1970, and a missing timestamp would jump a queue it
 * knows nothing about.
 */
export const newestFirst = (rows: InvoiceRecord[]): InvoiceRecord[] => {
  const time = (row: InvoiceRecord) => {
    const parsed = row.created_at ? new Date(row.created_at).getTime() : Number.NaN;
    // Unparseable is the same answer as absent: last.
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  };
  return [...rows].sort((a, b) => time(b) - time(a));
};

export const parsePayload = (payload: InvoiceRecord["invoice_payload"]): InvoicePayload => {
  if (!payload) return {};
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as InvoicePayload;
    } catch {
      return {};
    }
  }
  return payload;
};

export const extractMessage = (value: unknown, fallback: string) => {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const obj = value as ApiMessageResponse;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
    if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail;
    const errorText = (obj as { error?: unknown }).error;
    if (typeof errorText === "string" && errorText.trim()) return errorText;
  }
  return fallback;
};

// Pull the deepest human-readable SAP message out of a raw error string (for UI).
export const readableSapError = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw);
    const deep =
      (parsed?.details?.error?.message && String(parsed.details.error.message)) ||
      (parsed?.error?.message && String(parsed.error.message)) ||
      (typeof parsed?.error === "string" && parsed.error) ||
      (typeof parsed?.message === "string" && parsed.message) ||
      (typeof parsed?.detail === "string" && parsed.detail);
    if (typeof deep === "string" && deep.trim()) return deep;
  } catch {
    /* not JSON — fall through to raw */
  }
  return raw;
};

/* ── Credit-limit request (external DSR service) ─────────────────────────
 * When a SAP post fails specifically because the customer's credit limit is
 * exceeded, the reviewer can raise a credit-limit request with the DSR
 * service. The DSR API has no CORS support, so both calls go through the OMS
 * backend proxy (/api/invoice/credit-limit/...; base URL configured there via
 * DSR_API_BASE). The customer's live balance/limit are prefetched for the form. */

// Company id for the DSR credit-limit service, derived from the branch stored
// on the log: OIL → 1, BEVERAGE → 2.
export const companyForBranch = (branch?: unknown) =>
  String(branch || "")
    .trim()
    .toUpperCase() === "BEVERAGE"
    ? "2"
    : "1";

export const CL_STAGE_CODES: Record<string, StageState> = {
  A: { label: "Approved", tone: "approved" },
  R: { label: "Rejected", tone: "rejected" },
  P: { label: "Pending", tone: "pending" },
};

export const creditLimitStageState = (actionStatus?: string | null): StageState => {
  const raw = String(actionStatus ?? "").trim();
  if (!raw) return { label: "Pending", tone: "pending" };
  const byCode = CL_STAGE_CODES[raw.toUpperCase()];
  if (byCode) return byCode;
  if (/reject/i.test(raw)) return { label: "Rejected", tone: "rejected" };
  if (/approve/i.test(raw)) return { label: "Approved", tone: "approved" };
  return { label: raw, tone: "pending" };
};

// One-line answer to "did the credit limit go through?", derived from the stages.
export const creditLimitFlowSummary = (stages: CreditLimitStage[]): StageState | null => {
  if (stages.length === 0) return null;
  const states = stages.map((stage) => creditLimitStageState(stage.actionStatus));
  const rejectedAt = states.findIndex((state) => state.tone === "rejected");
  if (rejectedAt >= 0) {
    return { label: `Rejected at stage ${rejectedAt + 1} of ${stages.length}`, tone: "rejected" };
  }
  const approved = states.filter((state) => state.tone === "approved").length;
  return approved === stages.length
    ? { label: `Approved — all ${stages.length} stages cleared`, tone: "approved" }
    : { label: `Pending — ${approved} of ${stages.length} stages approved`, tone: "pending" };
};

// The raise-credit-limit action only applies to errors that are actually about
// the customer's credit limit.
export const isCreditLimitError = (record: InvoiceRecord) =>
  /credit\s*limit/i.test(String(record.error_message || ""));

/**
 * The status to record when a post to SAP fails.
 *
 * ERROR for everything — EXCEPT a record that already has a credit-limit
 * request in flight. That request is not withdrawn just because this attempt
 * failed, and until JSAP clears it a repost keeps failing the same check, so
 * the invoice genuinely still belongs on the CL Raised tab. Demoting it to
 * ERROR takes away "Show Flow" — the only way back to the approval stages of
 * the request the reviewer already raised — and offers "Raise CL" again,
 * which the backend refuses with a 409 because a request for that log exists.
 *
 * The backend stores the latest SAP message either way, so keeping the status
 * costs nothing: the reviewer still sees what SAP said on this attempt.
 */
export const statusAfterFailedPost = (record: InvoiceRecord): InvoiceStatus =>
  normalizeStatus(record.status) === "CL_RAISED" ? "CL_RAISED" : "ERROR";

// A value is a usable lineage reference (log id) — 0 is not a valid pk here.
export const hasRef = (value: unknown) => value !== undefined && value !== null && value !== "";

/* ── Bill print ────────────────────────────────────────────────────────────
 * The backend proxies the Crystal bill print and answers with the PDF itself.
 * It accepts either the internal OINV key (DocEntry) — which is what Crystal
 * actually renders from — or the visible invoice number (DocNum), which it
 * resolves to a DocEntry first. We prefer DocEntry when the post recorded one,
 * because the DocNum lookup only searches the OIL company database.
 * ────────────────────────────────────────────────────────────────────────── */

export const trimmed = (value: unknown) => String(value ?? "").trim();

// The report can only be generated once we know which SAP document to print.
export const invoiceReportRef = (record: InvoiceRecord): ReportRef | null => {
  const docEntry = trimmed(record.sap_doc_entry);
  const docNum = trimmed(record.sap_doc_num);
  if (!docEntry && !docNum) return null;
  return {
    docEntry,
    docNum,
    party: trimmed(record.party_name),
    branch: trimmed(record.branch),
  };
};

// The party name only travels so the backend can name the download
// "<DocNum> <Party Name>.pdf"; it plays no part in resolving the document.
// The branch does: oil and beverage are separate company databases with
// separate Crystal reports, and the backend defaults to oil without it.
// Opening the bill print is a FETCH, not a navigation.
//
// These were `<a href>` links straight to the endpoint, which cannot work: a
// navigation carries no Authorization header, and this project authenticates
// with JWT alone. The request arrived anonymous at a view inheriting
// IsAuthenticated. See services/invoicePrint.ts.
//
// The old comment here worried that `window.open` could be downgraded to a
// same-tab navigation by a popup blocker, taking the reviewer off the list.
// That concern is handled rather than ignored: `openBillPrint` opens the tab
// SYNCHRONOUSLY, before the request, so the browser still attributes it to the
// click; and if the blocker refuses outright it falls back to a download
// instead of navigating anywhere.
export const openReport = (ref: ReportRef, onError: (message: string) => void) => {
  void openBillPrint(ref).then((message) => {
    if (message) onError(message);
  });
};

/**
 * Update an invoice record's status. A rejection_reason is required when the
 * status becomes REJECTED, and an error_message is logged when it becomes ERROR.
 */
export const updateInvoiceStatus = (
  id: InvoiceRecord["id"],
  status: InvoiceStatus,
  extra?: {
    rejection_reason?: string;
    error_message?: string;
    sap_doc_num?: string;
    sap_doc_entry?: string;
  },
) =>
  apiFetch<ApiMessageResponse>(`/api/invoice/${id}/update-status/`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...(extra || {}) }),
  });

/**
 * Remove an entry from the review screen. This is a soft delete: the backend
 * hides the row and stamps who removed it, but the invoice log and its whole
 * history survive — a row removed by mistake is still in the database and can
 * be brought back with POST /api/invoice/<id>/delete/, which this screen no
 * longer offers. Refused with 409 for APPROVED and POSTED_TO_SAP.
 */
export const deleteInvoice = (id: InvoiceRecord["id"]) =>
  apiFetch<ApiMessageResponse>(`/api/invoice/${id}/delete/`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });

/** Stable empties, so the filter/sort memos settle. */
export const NO_RECORDS: InvoiceRecord[] = [];
export const EMPTY_COUNTS: StatusCounts = createEmptyCounts();
