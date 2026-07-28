import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiArrowPath,
  HiCheckCircle,
  HiXCircle,
  HiXMark,
  HiEye,
  HiInbox,
  HiExclamationTriangle,
  HiClock,
  HiPaperAirplane,
  HiPencilSquare,
  HiBanknotes,
  HiArrowUturnLeft,
} from "react-icons/hi2";
import { apiFetch, apiUpload, EDIT_RESTORE_STORAGE_KEY } from "./SalesInvoice/useSalesInvoice";
import { useSapPost } from "./SalesInvoice/useSapPost";
import { toNumber } from "./SalesInvoice/salesInvoice.utils";
import MissionControlLoader from "../components/MissionControlLoader";
import "../styles/InvoiceReview.css";

type InvoiceStatus = "PENDING" | "APPROVED" | "REJECTED" | "EDITED" | "ERROR" | "POSTED_TO_SAP" | "CL_RAISED";

// Exact status string the backend stores after a successful SAP post.
// Change this single constant if the backend expects a different value.
const POSTED_TO_SAP_STATUS: InvoiceStatus = "POSTED_TO_SAP";

type InvoiceBatch = {
  BatchNumber?: string;
  SystemSerialNumber?: number;
  Quantity?: number;
};

type InvoiceLine = {
  LineNum?: number;
  ItemCode?: string;
  Quantity?: number;
  WarehouseCode?: string;
  TaxCode?: string;
  UnitPrice?: number;
  BatchNumbers?: InvoiceBatch[];
  [key: string]: unknown;
};

type InvoicePayload = {
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

type InvoiceRecord = {
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
  // Revision lineage. `supersedes` is the rejected log this one was reworked
  // from; `superseded_by_id` is the replacement that was submitted for it.
  supersedes?: number | string | null;
  supersedes_so_number?: string | null;
  supersedes_status?: string | null;
  supersedes_rejection_reason?: string | null;
  superseded_by_id?: number | string | null;
  [key: string]: unknown;
};

type ApiMessageResponse = {
  message?: unknown;
  detail?: unknown;
  results?: unknown;
  data?: unknown;
  [key: string]: unknown;
};

const STATUS_FILTERS: Array<{ key: InvoiceStatus | "ALL"; label: string }> = [
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
const statusLabel = (status: InvoiceStatus) => status.replace(/_/g, " ");

// Per-tab count map used for the number badges on the filter tabs. "ALL" holds
// the grand total across every status.
type StatusCounts = Record<InvoiceStatus | "ALL", number>;

const createEmptyCounts = (): StatusCounts => ({
  PENDING: 0,
  APPROVED: 0,
  POSTED_TO_SAP: 0,
  REJECTED: 0,
  EDITED: 0,
  ERROR: 0,
  CL_RAISED: 0,
  ALL: 0,
});

const formatAmount = (value: unknown) => {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDateTime = (value?: string) => {
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

const normalizeStatus = (status?: string): InvoiceStatus => {
  const upper = String(status || "").toUpperCase().replace(/\s+/g, "_");
  if (
    upper === "APPROVED"
    || upper === "REJECTED"
    || upper === "EDITED"
    || upper === "ERROR"
    || upper === "POSTED_TO_SAP"
    || upper === "CL_RAISED"
  ) {
    return upper;
  }
  return "PENDING";
};

// Records may arrive as a bare array or wrapped in { results } / { data }.
const extractRecords = (payload: unknown): InvoiceRecord[] => {
  if (Array.isArray(payload)) return payload as InvoiceRecord[];
  if (payload && typeof payload === "object") {
    const wrapped = payload as ApiMessageResponse;
    if (Array.isArray(wrapped.results)) return wrapped.results as InvoiceRecord[];
    if (Array.isArray(wrapped.data)) return wrapped.data as InvoiceRecord[];
  }
  return [];
};

const parsePayload = (payload: InvoiceRecord["invoice_payload"]): InvoicePayload => {
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

const extractMessage = (value: unknown, fallback: string) => {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const obj = value as ApiMessageResponse;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
    if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail;
  }
  return fallback;
};

// Pull the deepest human-readable SAP message out of a raw error string (for UI).
const readableSapError = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw);
    const deep =
      (parsed?.details?.error?.message && String(parsed.details.error.message))
      || (parsed?.error?.message && String(parsed.error.message))
      || (typeof parsed?.error === "string" && parsed.error)
      || (typeof parsed?.message === "string" && parsed.message)
      || (typeof parsed?.detail === "string" && parsed.detail);
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
const companyForBranch = (branch?: unknown) =>
  String(branch || "").trim().toUpperCase() === "BEVERAGE" ? "2" : "1";

type CustomerCard = {
  cardCode?: string;
  cardName?: string;
  cardType?: string;
  balance?: string | number;
  debtLine?: string | number;
  creditLine?: string | number;
};

// One approval stage in a credit-limit request's JSAP flow.
type CreditLimitStage = {
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
type StageTone = "approved" | "rejected" | "pending";
type StageState = { label: string; tone: StageTone };

const CL_STAGE_CODES: Record<string, StageState> = {
  A: { label: "Approved", tone: "approved" },
  R: { label: "Rejected", tone: "rejected" },
  P: { label: "Pending", tone: "pending" },
};

const creditLimitStageState = (actionStatus?: string | null): StageState => {
  const raw = String(actionStatus ?? "").trim();
  if (!raw) return { label: "Pending", tone: "pending" };
  const byCode = CL_STAGE_CODES[raw.toUpperCase()];
  if (byCode) return byCode;
  if (/reject/i.test(raw)) return { label: "Rejected", tone: "rejected" };
  if (/approve/i.test(raw)) return { label: "Approved", tone: "approved" };
  return { label: raw, tone: "pending" };
};

// One-line answer to "did the credit limit go through?", derived from the stages.
const creditLimitFlowSummary = (stages: CreditLimitStage[]): StageState | null => {
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
const isCreditLimitError = (record: InvoiceRecord) =>
  /credit\s*limit/i.test(String(record.error_message || ""));

// A value is a usable lineage reference (log id) — 0 is not a valid pk here.
const hasRef = (value: unknown) => value !== undefined && value !== null && value !== "";

/**
 * Update an invoice record's status. A rejection_reason is required when the
 * status becomes REJECTED, and an error_message is logged when it becomes ERROR.
 */
const updateInvoiceStatus = (
  id: InvoiceRecord["id"],
  status: InvoiceStatus,
  extra?: { rejection_reason?: string; error_message?: string },
) =>
  apiFetch<ApiMessageResponse>(`/api/invoice/${id}/update-status/`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...(extra || {}) }),
  });

export default function InvoiceReview() {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "ALL">("PENDING");
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [counts, setCounts] = useState<StatusCounts>(createEmptyCounts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<InvoiceRecord | null>(null);
  const [actionId, setActionId] = useState<InvoiceRecord["id"] | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [historyFor, setHistoryFor] = useState<InvoiceRecord | null>(null);
  const [historyRecords, setHistoryRecords] = useState<InvoiceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [clRecord, setClRecord] = useState<InvoiceRecord | null>(null);
  const [clCard, setClCard] = useState<CustomerCard | null>(null);
  const [clLoading, setClLoading] = useState(false);
  const [clLookupError, setClLookupError] = useState("");
  const [clNewLimit, setClNewLimit] = useState("");
  const [clValidTill, setClValidTill] = useState("");
  const [clFile, setClFile] = useState<File | null>(null);
  const [clSubmitting, setClSubmitting] = useState(false);
  const [clSubmitError, setClSubmitError] = useState("");
  const [clFlowRecord, setClFlowRecord] = useState<InvoiceRecord | null>(null);
  const [clFlowStages, setClFlowStages] = useState<CreditLimitStage[]>([]);
  const [clFlowLoading, setClFlowLoading] = useState(false);
  const [clFlowError, setClFlowError] = useState("");
  // The record currently being posted to SAP, kept so a credit-limit failure can
  // offer "Raise CL" for the right invoice straight from the loader modal.
  const [postingRecord, setPostingRecord] = useState<InvoiceRecord | null>(null);
  const sapPost = useSapPost();
  const navigate = useNavigate();

  // Factory approvers only review (Pending/Approved/Rejected) and cannot post to
  // SAP — that's the billing role's job.
  const userRole = (localStorage.getItem("role") || "").toLowerCase();
  const isFactoryApprover = userRole === "factory_approver";
  const canPostToSap = !isFactoryApprover;
  // Only the factory approver approves/rejects; billing just sees "Pending Approval".
  const canApproveReject = isFactoryApprover;
  const visibleFilters = isFactoryApprover
    ? STATUS_FILTERS.filter(
        (f) => f.key === "PENDING" || f.key === "APPROVED" || f.key === "REJECTED" || f.key === "EDITED",
      )
    : STATUS_FILTERS;

  // Tally the number of invoices per status for the tab badges. The tab list is
  // server-filtered, so `records` only ever holds the active tab; we fetch the
  // full unfiltered list once and count each status client-side.
  const loadCounts = useCallback(async () => {
    try {
      const data = await apiFetch<unknown>(`/api/invoice/logs/all/`);
      const all = extractRecords(data);
      const next = createEmptyCounts();
      all.forEach((record) => {
        next[normalizeStatus(record.status)] += 1;
      });
      next.ALL = all.length;
      setCounts(next);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = statusFilter === "ALL" ? "" : `?status=${statusFilter}`;
      const data = await apiFetch<unknown>(`/api/invoice/logs/all/${query}`);
      setRecords(extractRecords(data));
    } catch (err) {
      console.error(err);
      setRecords([]);
      setError(extractMessage(err, "Unable to load invoices for review."));
    } finally {
      setLoading(false);
    }
    // Keep the tab badges in sync with every reload (tab switch or post-action).
    void loadCounts();
  }, [statusFilter, loadCounts]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const selectedPayload = useMemo(
    () => (selected ? parsePayload(selected.invoice_payload) : {}),
    [selected],
  );

  const clFlowSummary = useMemo(() => creditLimitFlowSummary(clFlowStages), [clFlowStages]);

  // Version number per log id in the history chain, keyed in first-seen
  // (chronological) order: oldest version is 1. Size is the number of versions.
  const historyVersions = useMemo(() => {
    const versions = new Map<string, number>();
    historyRecords.forEach((entry) => {
      const key = String(entry.invoice_log ?? "");
      if (!versions.has(key)) versions.set(key, versions.size + 1);
    });
    return versions;
  }, [historyRecords]);

  const handleAction = async (record: InvoiceRecord, status: InvoiceStatus) => {
    if (record.id === undefined || record.id === null) {
      setActionError("This invoice has no identifier and cannot be updated.");
      return;
    }
    const label = `SO #${record.so_number || record.id}`;
    let rejectionReason: string | undefined;

    if (status === "REJECTED") {
      const reason = window.prompt(`Enter a reason for rejecting ${label}:`);
      if (reason === null) return; // reviewer cancelled
      if (!reason.trim()) {
        setActionError("A rejection reason is required to reject an invoice.");
        return;
      }
      rejectionReason = reason.trim();
    } else if (!window.confirm(`Are you sure you want to approve ${label}?`)) {
      return;
    }

    setActionId(record.id);
    setActionError("");
    setActionMessage("");
    try {
      const data = await updateInvoiceStatus(
        record.id,
        status,
        status === "REJECTED" ? { rejection_reason: rejectionReason ?? "" } : undefined,
      );
      setActionMessage(
        extractMessage(data, status === "APPROVED" ? "Invoice approved." : "Invoice rejected."),
      );
      setSelected(null);
      await loadInvoices();
    } catch (err) {
      console.error(err);
      setActionError(extractMessage(err, `Unable to ${status === "APPROVED" ? "approve" : "reject"} the invoice.`));
    } finally {
      setActionId(null);
    }
  };

  // Reopen a rejected invoice for editing: hand the stored payload to the Sales
  // Invoice wizard via sessionStorage and navigate there. The wizard rebuilds the
  // party and lines and re-runs batch allocation against current stock.
  //
  // This log is NOT touched here. It stays REJECTED — with its reason intact and
  // visible to reviewers — until a replacement is actually submitted; the create
  // endpoint retires it to EDITED at that point (see `edited_from`). An edit that
  // is started and then abandoned therefore leaves the rejection standing.
  const handleEdit = (record: InvoiceRecord) => {
    if (record.id === undefined || record.id === null) {
      setActionError("This invoice has no identifier and cannot be edited.");
      return;
    }
    const label = `SO #${record.so_number || record.id}`;
    if (!window.confirm(`Edit ${label} and resubmit it for approval?`)) return;

    setActionError("");
    setActionMessage("");
    sessionStorage.setItem(
      EDIT_RESTORE_STORAGE_KEY,
      JSON.stringify({ logId: record.id, branch: record.branch, payload: parsePayload(record.invoice_payload) }),
    );
    navigate("/Sales_Invoice");
  };

  // Open the credit-limit request form for a credit-limit ERROR record and
  // prefetch the customer's live balance/limit from the DSR service, matched by
  // the payload's CardCode.
  const openCreditLimitRequest = async (record: InvoiceRecord) => {
    const cardCode = String(parsePayload(record.invoice_payload).CardCode || "");
    setClRecord(record);
    setClCard(null);
    setClLookupError("");
    setClNewLimit("");
    setClValidTill("");
    setClFile(null);
    setClSubmitError("");
    setClLoading(true);
    try {
      const company = companyForBranch(record.branch);
      const data = await apiFetch<{ success?: boolean; data?: CustomerCard[] }>(
        `/api/invoice/credit-limit/cards/?company=${company}`,
      );
      const cards = Array.isArray(data?.data) ? data.data : [];
      const card = cards.find((candidate) => String(candidate.cardCode || "") === cardCode) || null;
      setClCard(card);
      if (!card) {
        setClLookupError(
          `Customer ${cardCode || "(unknown)"} was not found in the credit-limit master, so balances could not be prefilled.`,
        );
      }
    } catch (err) {
      console.error(err);
      setClLookupError(extractMessage(err, "Unable to load customer credit data."));
    } finally {
      setClLoading(false);
    }
  };

  // Submit the credit-limit request as multipart form-data: a documentData JSON
  // blob plus the mandatory attachment.
  const submitCreditLimitRequest = async () => {
    if (!clRecord) return;
    const cardCode = String(parsePayload(clRecord.invoice_payload).CardCode || "");
    const newLimit = Number(clNewLimit);
    if (!Number.isFinite(newLimit) || newLimit <= 0) {
      setClSubmitError("Enter a valid new credit limit.");
      return;
    }
    if (!clValidTill) {
      setClSubmitError("Select a valid-till date.");
      return;
    }
    if (!clFile) {
      setClSubmitError("An attachment is mandatory for a credit-limit request.");
      return;
    }

    const company = companyForBranch(clRecord.branch);
    const documentData = {
      branchId: company,
      customerCode: clCard?.cardCode || cardCode,
      customerValue: clCard?.cardName || clRecord.party_name || "",
      currentBalance: toNumber(clCard?.balance),
      currentCreditLimit: toNumber(clCard?.creditLine),
      newCreditLimit: newLimit,
      validTill: `${clValidTill} 23:59:59.00`,
      companyId: company,
      // createdBy is stamped server-side (OMS_JSAP_USER_ID) — see the backend proxy.
      totalEntries: 1,
    };

    const formData = new FormData();
    formData.append("documentData", JSON.stringify(documentData));
    formData.append("attachment", clFile);
    if (clRecord.id !== undefined && clRecord.id !== null) {
      formData.append("invoice_log_id", String(clRecord.id));
    }

    setClSubmitting(true);
    setClSubmitError("");
    try {
      await apiUpload("/api/invoice/credit-limit/request/", formData);
      // Move the log to the CL Raised tab now that a request exists for it.
      if (clRecord.id !== undefined && clRecord.id !== null) {
        try {
          await updateInvoiceStatus(clRecord.id, "CL_RAISED");
        } catch (statusErr) {
          console.error("Unable to set CL RAISED status:", statusErr);
        }
      }
      setActionMessage(
        `Credit-limit request raised for ${documentData.customerValue || cardCode} (new limit ${formatAmount(newLimit)}).`,
      );
      setClRecord(null);
      loadInvoices();
    } catch (err) {
      console.error(err);
      setClSubmitError(extractMessage(err, "Unable to raise the credit-limit request."));
    } finally {
      setClSubmitting(false);
    }
  };

  // Show the JSAP approval flow for a credit-limit request. Keyed by the invoice
  // log id; company is 1 for OIL, 2 for BEVERAGE (via companyForBranch).
  const openCreditLimitFlow = async (record: InvoiceRecord) => {
    if (record.id === undefined || record.id === null) {
      setActionError("This invoice has no identifier and cannot show its flow.");
      return;
    }
    setClFlowRecord(record);
    setClFlowStages([]);
    setClFlowError("");
    setClFlowLoading(true);
    try {
      const company = companyForBranch(record.branch);
      const data = await apiFetch<{ success?: boolean; data?: CreditLimitStage[] }>(
        `/api/invoice/credit-limit/flow/?invoice_id=${encodeURIComponent(String(record.id))}&company=${company}`,
      );
      const stages = Array.isArray(data?.data) ? data.data : [];
      stages.sort((a, b) => toNumber(a.priority) - toNumber(b.priority));
      setClFlowStages(stages);
      if (stages.length === 0) setClFlowError("No approval stages were returned for this request.");
    } catch (err) {
      console.error(err);
      setClFlowError(extractMessage(err, "Unable to load the credit-limit approval flow."));
    } finally {
      setClFlowLoading(false);
    }
  };

  // Post an approved (or error/retry) invoice to SAP HANA through the Mission
  // Control loader. The loader owns the live progress and shows any SAP error
  // (translated, with technical details) inside itself; here we only record the
  // outcome on the local record: POSTED_TO_SAP on success, ERROR with the
  // readable SAP message on failure.
  const handlePostToSap = (record: InvoiceRecord) => {
    if (record.id === undefined || record.id === null) {
      setActionError("This invoice has no identifier and cannot be posted.");
      return;
    }
    const label = `SO #${record.so_number || record.id}`;
    if (!window.confirm(`Post ${label} to SAP HANA?`)) return;

    setActionError("");
    setActionMessage("");
    setSelected(null);
    setPostingRecord(record);

    const payload = parsePayload(record.invoice_payload);
    sapPost.run({
      payload,
      branch: record.branch,
      doc: {
        draftNo: String(record.so_number || record.id),
        customer: record.party_name || "",
        itemCount: (payload.DocumentLines || []).length || null,
        total: toNumber(record.total_amount),
        branch: record.branch || "",
      },
      onSuccess: async () => {
        setActionMessage(`${label} posted to SAP HANA successfully.`);
        try {
          await updateInvoiceStatus(record.id, POSTED_TO_SAP_STATUS);
        } catch (logErr) {
          console.error("Unable to record SAP post success:", logErr);
        }
      },
      onError: async (message, rawError) => {
        // Save the readable SAP message (e.g. the "Credit Limit Exceeded!" text)
        // in the log, overwriting any previous error.
        const readable = readableSapError(rawError || message);
        // A credit-limit rejection on an invoice that already has a credit-limit
        // request in flight is the expected result until that request is
        // approved — not a new failure. Keep it in CL Raised so it stays on that
        // tab with its Show Flow / Repost actions; the message is still recorded.
        // Any other failure on a CL Raised invoice is a genuine error.
        const stillAwaitingCreditLimit =
          normalizeStatus(record.status) === "CL_RAISED" && /credit\s*limit/i.test(readable);
        try {
          await updateInvoiceStatus(record.id, stillAwaitingCreditLimit ? "CL_RAISED" : "ERROR", {
            error_message: readable,
          });
        } catch (logErr) {
          console.error("Unable to log SAP post error:", logErr);
        }
      },
    });
  };

  // Dismiss the loader; refresh the list once the run has settled so the row
  // reflects the recorded POSTED_TO_SAP / ERROR status.
  const closeSapLoader = () => {
    const settled = sapPost.state.status === "success" || sapPost.state.status === "error";
    sapPost.close();
    setPostingRecord(null);
    if (settled) loadInvoices();
  };

  // The SAP post failed on a credit-limit check: close the loader and open the
  // credit-limit request form for the invoice that was being posted.
  const raiseClFromLoader = () => {
    const record = postingRecord;
    if (!record) return;
    closeSapLoader();
    void openCreditLimitRequest(record);
  };

  // True when the current SAP failure is specifically about the credit limit, so
  // the loader can offer a "Raise CL" shortcut.
  const sapErrorIsCreditLimit =
    sapPost.state.status === "error" &&
    /credit\s*limit/i.test(
      String(sapPost.state.rawError || sapPost.state.errorMessage || ""),
    );

  const openHistory = async (record: InvoiceRecord) => {
    // The history endpoint is keyed by the invoice-log id. On a list row that is
    // the record's invoice_log when present, otherwise its own id.
    const logId = record.invoice_log ?? record.id;
    if (logId === undefined || logId === null || logId === "") {
      setHistoryError("This entry has no log reference to trace history.");
      setHistoryFor(record);
      setHistoryRecords([]);
      return;
    }

    setHistoryFor(record);
    setHistoryRecords([]);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      // Returns the whole revision chain, oldest first. Re-sorted defensively;
      // the id tiebreaker keeps same-timestamp entries in insertion order so
      // version boundaries stay contiguous.
      const data = await apiFetch<unknown>(`/api/invoice/history/${encodeURIComponent(String(logId))}/`);
      const rows = extractRecords(data).sort((a, b) => {
        const byTime = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        return byTime !== 0 ? byTime : toNumber(a.id) - toNumber(b.id);
      });
      setHistoryRecords(rows);
    } catch (err) {
      console.error(err);
      setHistoryError(extractMessage(err, "Unable to load history for this entry."));
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="ir-page">
      <header className="ir-header">
        <div>
          <h1>Invoice Review</h1>
          {/* <p>Review submitted sales invoices and approve or reject them before they post to SAP HANA.</p> */}
        </div>
        <button
          type="button"
          className="ir-btn ir-btn-ghost"
          onClick={loadInvoices}
          disabled={loading}
        >
          <HiArrowPath className={loading ? "ir-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <nav className="ir-filters" aria-label="Filter invoices by status">
        {visibleFilters.map((filter) => {
          const count = counts[filter.key] ?? 0;
          return (
            <button
              key={filter.key}
              type="button"
              className={`ir-filter${statusFilter === filter.key ? " is-active" : ""}`}
              onClick={() => setStatusFilter(filter.key)}
            >
              {filter.label}
              {count > 0 && (
                <span className="ir-filter-badge">{count > 99 ? "99+" : count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {actionMessage && <div className="ir-banner ir-banner-success">{actionMessage}</div>}
      {actionError && <div className="ir-banner ir-banner-error">{actionError}</div>}
      {error && <div className="ir-banner ir-banner-error">{error}</div>}

      <section className="ir-card">
        {loading ? (
          <div className="ir-empty">Loading invoices…</div>
        ) : records.length === 0 ? (
          <div className="ir-empty">
            <HiInbox aria-hidden="true" />
            <span>No invoices found for this status.</span>
          </div>
        ) : (
          <div className="ir-table-wrap">
            <table className="ir-table">
              <thead>
                <tr>
                  <th>SO #</th>
                  <th>Party</th>
                  <th className="ir-num">Amount</th>
                  {/* <th>Status</th> */}
                  <th>Submitted</th>
                  <th className="ir-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => {
                  const status = normalizeStatus(record.status);
                  const busy = actionId === record.id;
                  return (
                    <tr key={record.id ?? index}>
                      <td>
                        {record.so_number || "—"}
                        {/* Lineage: this row is either a rework of a rejected
                            invoice, or the version that was reworked away. */}
                        {hasRef(record.supersedes) && (
                          <span className="ir-lineage-chip" title={record.supersedes_rejection_reason || undefined}>
                            <HiArrowUturnLeft aria-hidden="true" />
                            Revision of #{record.supersedes}
                          </span>
                        )}
                        {hasRef(record.superseded_by_id) && (
                          <span className="ir-lineage-chip ir-lineage-chip-muted">
                            <HiArrowUturnLeft aria-hidden="true" />
                            Replaced by #{record.superseded_by_id}
                          </span>
                        )}
                      </td>
                      <td>{record.party_name || "—"}</td>
                      <td className="ir-num">{formatAmount(record.total_amount)}</td>
                      {/* <td>
                        <span className={`ir-badge ir-badge-${status.toLowerCase()}`}>{statusLabel(status)}</span>
                      </td> */}
                      <td>{formatDateTime(record.created_at)}</td>
                      <td className="ir-actions-col">
                        <div className="ir-row-actions">
                          <button
                            type="button"
                            className="ir-btn ir-btn-ghost ir-btn-sm"
                            onClick={() => setSelected(record)}
                          >
                            <HiEye aria-hidden="true" />
                            View
                          </button>
                          <button
                            type="button"
                            className="ir-btn ir-btn-ghost ir-btn-sm"
                            onClick={() => openHistory(record)}
                          >
                            <HiClock aria-hidden="true" />
                            History
                          </button>
                          {(status === "PENDING" || status === "EDITED") && (
                            canApproveReject ? (
                              <>
                                <button
                                  type="button"
                                  className="ir-btn ir-btn-approve ir-btn-sm"
                                  disabled={busy}
                                  onClick={() => handleAction(record, "APPROVED")}
                                >
                                  <HiCheckCircle aria-hidden="true" />
                                  {busy ? "…" : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  className="ir-btn ir-btn-reject ir-btn-sm"
                                  disabled={busy}
                                  onClick={() => handleAction(record, "REJECTED")}
                                >
                                  <HiXCircle aria-hidden="true" />
                                  {busy ? "…" : "Reject"}
                                </button>
                              </>
                            ) : (
                              <span className="ir-pending-tag">Pending Approval</span>
                            )
                          )}
                          {status === "APPROVED" && canPostToSap && (
                            <button
                              type="button"
                              className="ir-btn ir-btn-sap ir-btn-sm"
                              disabled={busy}
                              onClick={() => handlePostToSap(record)}
                            >
                              <HiPaperAirplane aria-hidden="true" />
                              {busy ? "…" : "Post to SAP"}
                            </button>
                          )}
                          {(status === "ERROR" || status === "CL_RAISED") && canPostToSap && (
                            <button
                              type="button"
                              className="ir-btn ir-btn-sap ir-btn-sm"
                              disabled={busy}
                              onClick={() => handlePostToSap(record)}
                            >
                              <HiArrowPath aria-hidden="true" />
                              {busy ? "…" : "Repost to SAP"}
                            </button>
                          )}
                          {status === "CL_RAISED" && canPostToSap && (
                            <button
                              type="button"
                              className="ir-btn ir-btn-cl ir-btn-sm"
                              disabled={busy}
                              onClick={() => openCreditLimitFlow(record)}
                            >
                              <HiBanknotes aria-hidden="true" />
                              Show Flow
                            </button>
                          )}
                          {status === "ERROR" && canPostToSap && isCreditLimitError(record) && (
                            <button
                              type="button"
                              className="ir-btn ir-btn-cl ir-btn-sm"
                              disabled={busy}
                              onClick={() => openCreditLimitRequest(record)}
                            >
                              <HiBanknotes aria-hidden="true" />
                              {busy ? "…" : "Raise CL"}
                            </button>
                          )}
                          {status === "REJECTED" && canPostToSap && (
                            <button
                              type="button"
                              className="ir-btn ir-btn-edit ir-btn-sm"
                              disabled={busy}
                              onClick={() => handleEdit(record)}
                            >
                              <HiPencilSquare aria-hidden="true" />
                              {busy ? "…" : "Edit"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="ir-modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <section
            className="ir-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Invoice details for SO ${selected.so_number || ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ir-modal-head">
              <div>
                <span className="ir-eyebrow">Invoice Details</span>
                <h2>SO #{selected.so_number || "—"}</h2>
                <p>{selected.party_name || "—"}</p>
              </div>
              <button
                type="button"
                className="ir-icon-btn"
                aria-label="Close details"
                onClick={() => setSelected(null)}
              >
                <HiXMark aria-hidden="true" />
              </button>
            </header>

            <div className="ir-modal-body">
              {/* The approver of a reworked invoice needs to see why the previous
                  attempt was turned down before deciding on this one. */}
              {hasRef(selected.supersedes) && (
                <div className="ir-lineage-box" role="note">
                  <HiArrowUturnLeft aria-hidden="true" />
                  <div>
                    <strong>
                      Revision of invoice #{selected.supersedes}
                      {selected.supersedes_so_number ? ` (SO #${selected.supersedes_so_number})` : ""}, which was
                      rejected.
                    </strong>
                    {selected.supersedes_rejection_reason && (
                      <p>Previous rejection reason: {selected.supersedes_rejection_reason}</p>
                    )}
                    <button
                      type="button"
                      className="ir-link-btn"
                      onClick={() => {
                        const record = selected;
                        setSelected(null);
                        void openHistory(record);
                      }}
                    >
                      View full revision history
                    </button>
                  </div>
                </div>
              )}
              {hasRef(selected.superseded_by_id) && (
                <div className="ir-lineage-box ir-lineage-box-muted" role="note">
                  <HiArrowUturnLeft aria-hidden="true" />
                  <div>
                    <strong>Replaced by invoice #{selected.superseded_by_id}.</strong>
                    <p>This version was reworked and is no longer active.</p>
                  </div>
                </div>
              )}
              {selected.error_message && (
                <div className="ir-error-box" role="alert">
                  <HiExclamationTriangle aria-hidden="true" />
                  <span>{selected.error_message}</span>
                </div>
              )}
              {selected.rejection_reason && (
                <div className="ir-reason-box" role="note">
                  <HiXCircle aria-hidden="true" />
                  <span><strong>Rejection reason:</strong> {selected.rejection_reason}</span>
                </div>
              )}
              <div className="ir-detail-hero">
                <div className="ir-detail-hero-amount">
                  <span className="ir-eyebrow">Total Amount</span>
                  <strong>{formatAmount(selected.total_amount)}</strong>
                </div>
                <span
                  className={`ir-badge ir-badge-lg ir-badge-${normalizeStatus(selected.status).toLowerCase()}`}
                >
                  {statusLabel(normalizeStatus(selected.status))}
                </span>
              </div>

              <dl className="ir-meta-grid">
                <div>
                  <dt>Customer Code</dt>
                  <dd>{selectedPayload.CardCode || "—"}</dd>
                </div>
                <div>
                  <dt>Doc Date</dt>
                  <dd>{selectedPayload.DocDate || "—"}</dd>
                </div>
                <div>
                  <dt>Due Date</dt>
                  <dd>{selectedPayload.DocDueDate || "—"}</dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{formatDateTime(selected.created_at)}</dd>
                </div>
              </dl>

              <h3 className="ir-section-title">
                Line Items
                <span className="ir-section-count">{(selectedPayload.DocumentLines || []).length}</span>
              </h3>
              <div className="ir-table-wrap">
                <table className="ir-table ir-table-compact">
                  <thead>
                    <tr>
                      <th>Item Code</th>
                      <th>Warehouse</th>
                      <th className="ir-num">Qty</th>
                      <th>Tax Code</th>
                      <th>Batches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedPayload.DocumentLines || []).map((line, index) => (
                      <tr key={line.LineNum ?? index}>
                        <td className="ir-cell-code">{line.ItemCode || "—"}</td>
                        <td>{line.WarehouseCode || "—"}</td>
                        <td className="ir-num">{toNumber(line.Quantity).toLocaleString("en-IN")}</td>
                        <td>{line.TaxCode || "—"}</td>
                        <td>
                          {(line.BatchNumbers || []).length === 0 ? (
                            <span className="ir-muted">No batch</span>
                          ) : (
                            <div className="ir-batch-chips">
                              {(line.BatchNumbers || []).map((batch, batchIndex) => (
                                <span className="ir-batch-chip" key={batchIndex}>
                                  {batch.BatchNumber || `Serial ${batch.SystemSerialNumber ?? "?"}`}
                                  <em>×{toNumber(batch.Quantity)}</em>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <details className="ir-raw">
                <summary>Raw payload</summary>
                <pre>{JSON.stringify(selectedPayload, null, 2)}</pre>
              </details>
            </div>

            {["PENDING", "EDITED"].includes(normalizeStatus(selected.status)) && (
              <footer className="ir-modal-foot">
                {canApproveReject ? (
                  <>
                    <button
                      type="button"
                      className="ir-btn ir-btn-reject"
                      disabled={actionId === selected.id}
                      onClick={() => handleAction(selected, "REJECTED")}
                    >
                      <HiXCircle aria-hidden="true" />
                      Reject
                    </button>
                    <button
                      type="button"
                      className="ir-btn ir-btn-approve"
                      disabled={actionId === selected.id}
                      onClick={() => handleAction(selected, "APPROVED")}
                    >
                      <HiCheckCircle aria-hidden="true" />
                      Approve
                    </button>
                  </>
                ) : (
                  <span className="ir-pending-tag">Pending Approval</span>
                )}
              </footer>
            )}

            {normalizeStatus(selected.status) === "APPROVED" && canPostToSap && (
              <footer className="ir-modal-foot">
                <button
                  type="button"
                  className="ir-btn ir-btn-sap"
                  disabled={actionId === selected.id}
                  onClick={() => handlePostToSap(selected)}
                >
                  <HiPaperAirplane aria-hidden="true" />
                  Post to SAP
                </button>
              </footer>
            )}

            {["ERROR", "CL_RAISED"].includes(normalizeStatus(selected.status)) && canPostToSap && (
              <footer className="ir-modal-foot">
                {normalizeStatus(selected.status) === "ERROR" && isCreditLimitError(selected) && (
                  <button
                    type="button"
                    className="ir-btn ir-btn-cl"
                    disabled={actionId === selected.id}
                    onClick={() => openCreditLimitRequest(selected)}
                  >
                    <HiBanknotes aria-hidden="true" />
                    Raise Credit Limit
                  </button>
                )}
                {normalizeStatus(selected.status) === "CL_RAISED" && (
                  <button
                    type="button"
                    className="ir-btn ir-btn-cl"
                    disabled={actionId === selected.id}
                    onClick={() => openCreditLimitFlow(selected)}
                  >
                    <HiBanknotes aria-hidden="true" />
                    Show Flow
                  </button>
                )}
                <button
                  type="button"
                  className="ir-btn ir-btn-sap"
                  disabled={actionId === selected.id}
                  onClick={() => handlePostToSap(selected)}
                >
                  <HiArrowPath aria-hidden="true" />
                  Repost to SAP
                </button>
              </footer>
            )}

            {normalizeStatus(selected.status) === "REJECTED" && canPostToSap && (
              <footer className="ir-modal-foot">
                <button
                  type="button"
                  className="ir-btn ir-btn-edit"
                  disabled={actionId === selected.id}
                  onClick={() => handleEdit(selected)}
                >
                  <HiPencilSquare aria-hidden="true" />
                  Edit &amp; Resubmit
                </button>
              </footer>
            )}
          </section>
        </div>
      )}

      {historyFor && (
        <div className="ir-modal-backdrop" role="presentation" onClick={() => setHistoryFor(null)}>
          <section
            className="ir-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Status history for SO ${historyFor.so_number || ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ir-modal-head">
              <div>
                <span className="ir-eyebrow">Status History</span>
                <h2>SO #{historyFor.so_number || "—"}</h2>
                <p>{historyFor.party_name || "—"}</p>
              </div>
              <button
                type="button"
                className="ir-icon-btn"
                aria-label="Close history"
                onClick={() => setHistoryFor(null)}
              >
                <HiXMark aria-hidden="true" />
              </button>
            </header>

            <div className="ir-modal-body">
              {historyError && <div className="ir-banner ir-banner-error">{historyError}</div>}
              {historyLoading ? (
                <div className="ir-empty">Loading history…</div>
              ) : historyRecords.length === 0 && !historyError ? (
                <div className="ir-empty">
                  <HiInbox aria-hidden="true" />
                  <span>No history available for this entry.</span>
                </div>
              ) : (
                <ol className="ir-timeline">
                  {historyRecords.map((entry, index) => {
                    const entryStatus = normalizeStatus(entry.status);
                    // The timeline spans every version in the revision chain, so
                    // mark where one log ends and its rework begins.
                    const logId = entry.invoice_log;
                    const startsVersion = index === 0 || historyRecords[index - 1].invoice_log !== logId;
                    const versionNumber = historyVersions.get(String(logId ?? "")) ?? 1;
                    return (
                      <Fragment key={entry.id ?? index}>
                        {startsVersion && historyVersions.size > 1 && (
                          <li className="ir-timeline-sep" aria-hidden="false">
                            <span>
                              Version {versionNumber} of {historyVersions.size}
                              {hasRef(logId) ? ` · invoice #${logId}` : ""}
                            </span>
                          </li>
                        )}
                        <li className="ir-timeline-item">
                          <span className={`ir-timeline-dot ir-dot-${entryStatus.toLowerCase()}`} aria-hidden="true" />
                          <div className="ir-timeline-body">
                            <div className="ir-timeline-head">
                              <span className={`ir-badge ir-badge-${entryStatus.toLowerCase()}`}>{statusLabel(entryStatus)}</span>
                              <time>{formatDateTime(entry.created_at)}</time>
                            </div>
                            {entry.created_by_name && (
                              <p className="ir-timeline-note ir-timeline-by">By: {entry.created_by_name}</p>
                            )}
                            {entry.rejection_reason && (
                              <p className="ir-timeline-note">Reason: {entry.rejection_reason}</p>
                            )}
                            {entry.error_message && (
                              <p className="ir-timeline-note ir-timeline-error">{entry.error_message}</p>
                            )}
                          </div>
                        </li>
                      </Fragment>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Credit-limit request form (credit-limit ERROR records only) */}
      {clRecord && (
        <div
          className="ir-modal-backdrop"
          role="presentation"
          onClick={() => !clSubmitting && setClRecord(null)}
        >
          <section
            className="ir-modal ir-cl-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Raise credit limit request"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ir-modal-head">
              <div>
                <span className="ir-eyebrow">Credit Limit Request</span>
                <h2>{clCard?.cardName || clRecord.party_name || "—"}</h2>
                <p>{String(parsePayload(clRecord.invoice_payload).CardCode || "—")}</p>
              </div>
              <button
                type="button"
                className="ir-icon-btn"
                aria-label="Close credit limit request"
                onClick={() => !clSubmitting && setClRecord(null)}
              >
                <HiXMark aria-hidden="true" />
              </button>
            </header>

            <div className="ir-modal-body">
              {clLoading ? (
                <div className="ir-empty">Loading customer credit data…</div>
              ) : (
                <>
                  {clLookupError && <div className="ir-banner ir-banner-error">{clLookupError}</div>}
                  <dl className="ir-meta-grid">
                    <div>
                      <dt>Current Balance</dt>
                      <dd>{clCard ? formatAmount(clCard.balance) : "—"}</dd>
                    </div>
                    <div>
                      <dt>Current Credit Limit</dt>
                      <dd>{clCard ? formatAmount(clCard.creditLine) : "—"}</dd>
                    </div>
                    <div>
                      <dt>Card Type</dt>
                      <dd>{clCard?.cardType || "—"}</dd>
                    </div>
                    <div>
                      <dt>Branch</dt>
                      <dd>{clRecord.branch || "—"}</dd>
                    </div>
                  </dl>

                  <div className="ir-cl-form">
                    <label className="ir-cl-field">
                      <span>New Credit Limit *</span>
                      <input
                        type="number"
                        min={1}
                        value={clNewLimit}
                        onChange={(event) => setClNewLimit(event.target.value)}
                        placeholder="e.g. 200000"
                      />
                    </label>
                    <label className="ir-cl-field">
                      <span>Valid Till *</span>
                      <input
                        type="date"
                        value={clValidTill}
                        onChange={(event) => setClValidTill(event.target.value)}
                      />
                    </label>
                    <label className="ir-cl-field ir-cl-field-wide">
                      <span>Attachment * (mandatory)</span>
                      <input
                        type="file"
                        onChange={(event) => setClFile(event.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  {clSubmitError && <div className="ir-banner ir-banner-error">{clSubmitError}</div>}
                </>
              )}
            </div>

            <footer className="ir-modal-foot">
              <button
                type="button"
                className="ir-btn ir-btn-ghost"
                onClick={() => setClRecord(null)}
                disabled={clSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ir-btn ir-btn-cl"
                onClick={submitCreditLimitRequest}
                disabled={clSubmitting || clLoading}
              >
                <HiBanknotes aria-hidden="true" />
                {clSubmitting ? "Submitting…" : "Raise Request"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* Credit-limit approval flow (CL Raised records) */}
      {clFlowRecord && (
        <div className="ir-modal-backdrop" role="presentation" onClick={() => setClFlowRecord(null)}>
          <section
            className="ir-modal ir-cl-flow-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Credit limit approval flow"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ir-modal-head">
              <div>
                <span className="ir-eyebrow">Credit Limit Flow</span>
                <h2>{clFlowRecord.party_name || "—"}</h2>
                <p>SO #{clFlowRecord.so_number || clFlowRecord.id}</p>
              </div>
              <button
                type="button"
                className="ir-icon-btn"
                aria-label="Close credit limit flow"
                onClick={() => setClFlowRecord(null)}
              >
                <HiXMark aria-hidden="true" />
              </button>
            </header>

            <div className="ir-modal-body">
              {clFlowLoading ? (
                <div className="ir-empty">Loading approval flow…</div>
              ) : clFlowError ? (
                <div className="ir-banner ir-banner-error">{clFlowError}</div>
              ) : (
                <>
                {clFlowSummary && (
                  <div className={`ir-cl-summary ir-cl-summary-${clFlowSummary.tone}`}>
                    {clFlowSummary.label}
                  </div>
                )}
                <ol className="ir-timeline">
                  {clFlowStages.map((stage, index) => {
                    const state = creditLimitStageState(stage.actionStatus);
                    return (
                      <li className="ir-timeline-item" key={stage.stageId ?? index}>
                        <span className={`ir-timeline-dot ir-dot-${state.tone}`} aria-hidden="true" />
                        <div className="ir-timeline-body">
                          <div className="ir-timeline-head">
                            <strong>
                              {toNumber(stage.priority) ? `${toNumber(stage.priority)}. ` : ""}
                              {stage.stageName || "—"}
                            </strong>
                            <span className={`ir-badge ir-badge-${state.tone}`}>{state.label}</span>
                          </div>
                          <p className="ir-timeline-note ir-timeline-by">
                            Assigned to: {stage.assignedTo || "—"}
                          </p>
                          {stage.actionDate && (
                            <p className="ir-timeline-note">Actioned: {formatDateTime(stage.actionDate)}</p>
                          )}
                          {stage.description && (
                            <p className="ir-timeline-note">{stage.description}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Mission Control loader — drives the live post-to-SAP transaction and
          shows success or the translated SAP error (with retry) in place. */}
      <MissionControlLoader
        state={sapPost.state}
        onClose={closeSapLoader}
        onRetry={sapPost.retry}
        onRaiseCl={
          // Not offered when a request is already in flight — that invoice is
          // waiting on the existing approval, and the row only exposes Show Flow
          // for it. Raising a second request would duplicate it in JSAP.
          canPostToSap
          && sapErrorIsCreditLimit
          && postingRecord
          && normalizeStatus(postingRecord.status) !== "CL_RAISED"
            ? raiseClFromLoader
            : undefined
        }
      />
    </div>
  );
}
