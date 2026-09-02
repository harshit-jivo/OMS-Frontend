/**
 * Everything the Invoice Review page KNOWS, with nothing it draws — Phase 4
 * split, following the `useSalesOrderForm` pattern (`salesOrder/`).
 *
 * This is a MOVE, not a rewrite: the state, queries, derivations and handlers
 * below are the same code in the same order, lifted out of `InvoiceReview.tsx`
 * whole. Anything that returns JSX stayed behind in the view components.
 *
 * The hook returns one object rather than a fistful of individually-imported
 * values, mirroring `SalesOrderForm` — callers destructure what they need, and
 * `UseInvoiceReviewResult` is its inferred type, so a value added here needs no
 * second declaration to reach a consumer.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { apiFetch, apiUpload, EDIT_RESTORE_STORAGE_KEY } from "../SalesInvoice/useSalesInvoice";
import { useSapPost } from "../SalesInvoice/useSapPost";
import { toNumber } from "../SalesInvoice/salesInvoice.utils";
import {
  companyForBranch,
  createEmptyCounts,
  creditLimitFlowSummary,
  EMPTY_COUNTS,
  extractMessage,
  extractRecords,
  formatAmount,
  NO_RECORDS,
  normalizeStatus,
  openReport,
  parsePayload,
  POSTED_TO_SAP_STATUS,
  readableSapError,
  STATUS_FILTERS,
  trimmed,
  updateInvoiceStatus,
  deleteInvoice,
} from "./helpers";
import type {
  CreditLimitStage,
  CustomerCard,
  FilterKey,
  InvoiceRecord,
  InvoiceStatus,
} from "./types";

/**
 * `canApproveReject` / `canPostToSap` are decided by the CALLER (the page
 * component), not in here — deliberately. `actions.test.ts` guards against
 * exactly the anti-pattern this screen used to have: a page that decides its
 * own permissions from something other than `useAction`. Keeping the two
 * `useAction(...)` calls visible in `InvoiceReview.tsx` itself, rather than
 * buried in this hook, is what that guard is checking for; the hook takes the
 * results as plain booleans like any other derived input.
 */
export type UseInvoiceReviewOptions = {
  canApproveReject: boolean;
  canPostToSap: boolean;
};

export function useInvoiceReview({ canApproveReject, canPostToSap }: UseInvoiceReviewOptions) {
  const [statusFilter, setStatusFilter] = useState<FilterKey>("PENDING");
  const queryClient = useQueryClient();
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

  // Which status tabs to show. The approver's workflow ends at the decision, so
  // the SAP-side statuses would only ever be empty for them.
  const visibleFilters = canApproveReject
    ? STATUS_FILTERS.filter(
        (f) =>
          f.key === "PENDING" || f.key === "APPROVED" || f.key === "REJECTED" || f.key === "EDITED",
      )
    : STATUS_FILTERS;

  // Tally the number of invoices per status for the tab badges. The tab list is
  // server-filtered, so `records` only ever holds the active tab; we fetch the
  // full unfiltered list once and count each status client-side.
  /*
   * The tab badges. A SECOND, unfiltered round trip of the same table, chained
   * after every list fetch — and its catch was a bare `console.error`, so every
   * badge silently read 0 with no signal. As its own key it is fetched once and
   * shared across tab switches instead of re-counting on each one.
   */
  const { data: counts = EMPTY_COUNTS } = useQuery({
    queryKey: ["invoice", "logs", "counts"],
    queryFn: async () => {
      // Deleted rows are left out entirely: the endpoint hides them by default,
      // and no tab lists them, so counting them would badge a tab with rows the
      // reviewer cannot see.
      const all = extractRecords(await apiFetch<unknown>(`/api/invoice/logs/all/`));
      const next = createEmptyCounts();
      all.forEach((record) => {
        next[normalizeStatus(record.status)] += 1;
        next.ALL += 1;
      });
      return next;
    },
  });

  const {
    data: records = NO_RECORDS,
    isPending: loading,
    error: listError,
  } = useQuery({
    queryKey: ["invoice", "logs", statusFilter],
    queryFn: async () => {
      // Deleted rows never come back: the endpoint hides them unless
      // include_deleted is set, which nothing here asks for.
      const query = statusFilter === "ALL" ? "" : `?status=${statusFilter}`;
      return extractRecords(await apiFetch<unknown>(`/api/invoice/logs/all/${query}`));
    },
  });

  /* The list failure. `actionError` below is a separate banner for approve /
     reject / delete failures, and the two must not overwrite each other — the
     old code funnelled both through one `error` state. */
  const error = listError ? extractMessage(listError, "Unable to load invoices for review.") : "";

  /** Reload the list AND the badges — they must not drift apart. */
  const loadInvoices = () => queryClient.invalidateQueries({ queryKey: ["invoice", "logs"] });

  const selectedPayload = useMemo(
    () => (selected ? parsePayload(selected.invoice_payload) : {}),
    [selected],
  );

  // Product name for a line's code. Empty when the catalogue has no row for it,
  // in which case the table falls back to showing the code on its own.
  const itemNameOf = useCallback(
    (itemCode?: string) => (itemCode ? selected?.item_names?.[itemCode] || "" : ""),
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
      setActionError(
        extractMessage(
          err,
          `Unable to ${status === "APPROVED" ? "approve" : "reject"} the invoice.`,
        ),
      );
    } finally {
      setActionId(null);
    }
  };

  // Remove an entry from the review screen. Nothing is erased — the backend soft
  // deletes, so the log and its history survive — but the row is gone from every
  // tab here, which is why the confirmation says so plainly.
  //
  // One confirmation, no reason prompt: the reviewer deleting the row is already
  // recorded against it, and the delete is reversible, so making them type a
  // reason bought nothing.
  const handleDelete = async (record: InvoiceRecord) => {
    if (record.id === undefined || record.id === null) {
      setActionError("This invoice has no identifier and cannot be deleted.");
      return;
    }
    const label = `SO #${record.so_number || record.id}`;
    if (
      !window.confirm(
        `Remove ${label} from the review screen?\n\nIt will no longer appear on any tab.`,
      )
    ) {
      return;
    }

    setActionId(record.id);
    setActionError("");
    setActionMessage("");
    try {
      const data = await deleteInvoice(record.id);
      setActionMessage(extractMessage(data, "Invoice deleted."));
      setSelected(null);
      await loadInvoices();
    } catch (err) {
      console.error(err);
      setActionError(extractMessage(err, "Unable to delete the invoice."));
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
      JSON.stringify({
        logId: record.id,
        branch: record.branch,
        payload: parsePayload(record.invoice_payload),
      }),
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
      // 409 = a credit-limit request already exists for this invoice log (the row
      // is keyed by invoice_log_id). Nothing was created; the record simply belongs
      // on the CL Raised tab, so move it there instead of showing a hard failure.
      if ((err as { status?: number })?.status === 409) {
        if (clRecord.id !== undefined && clRecord.id !== null) {
          try {
            await updateInvoiceStatus(clRecord.id, "CL_RAISED");
          } catch (statusErr) {
            console.error("Unable to set CL RAISED status:", statusErr);
          }
        }
        setActionMessage(
          extractMessage(
            (err as { data?: unknown })?.data,
            "A credit-limit request has already been raised for this invoice.",
          ),
        );
        setClRecord(null);
        loadInvoices();
        return;
      }
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
      const raw = Array.isArray(data?.data) ? data.data : [];
      // Copy before sorting: `raw` is `data?.data`, i.e. the cached body.
      const stages = [...raw].sort((a, b) => toNumber(a.priority) - toNumber(b.priority));
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
      onSuccess: async ({ invoiceNumber, docNum, docEntry }) => {
        setActionMessage(
          invoiceNumber
            ? `${label} posted to SAP HANA successfully as invoice #${invoiceNumber}.`
            : `${label} posted to SAP HANA successfully.`,
        );
        try {
          // Keep SAP's identifiers on the log so the row can print the bill
          // later without anyone having to look the invoice up in SAP.
          await updateInvoiceStatus(record.id, POSTED_TO_SAP_STATUS, {
            ...(docNum ? { sap_doc_num: docNum } : {}),
            ...(docEntry ? { sap_doc_entry: docEntry } : {}),
          });
        } catch (logErr) {
          console.error("Unable to record SAP post success:", logErr);
        }
      },
      onError: async (message, rawError) => {
        // Save the readable SAP message (e.g. the "Credit Limit Exceeded!" text)
        // in the log, overwriting any previous error.
        const readable = readableSapError(rawError || message);
        try {
          await updateInvoiceStatus(record.id, "ERROR", { error_message: readable });
        } catch (logErr) {
          console.error("Unable to log SAP post error:", logErr);
        }
      },
    });
  };

  // The bill print for the invoice that was just posted, offered on the loader's
  // success panel so billing can print without going back to the list.
  const openLoaderReport = (() => {
    const { docNum, docEntry } = sapPost.state;
    if (!docNum && !docEntry) return undefined;
    return () =>
      openReport(
        {
          docNum,
          docEntry,
          party: trimmed(postingRecord?.party_name),
          branch: trimmed(postingRecord?.branch),
        },
        setActionError,
      );
  })();

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
    /credit\s*limit/i.test(String(sapPost.state.rawError || sapPost.state.errorMessage || ""));

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
      const data = await apiFetch<unknown>(
        `/api/invoice/history/${encodeURIComponent(String(logId))}/`,
      );
      // `.sort()` mutates. `extractRecords` can hand back the response array
      // itself when the body is a bare array, so sorting it in place would
      // corrupt the cached copy — hence the spread.
      const rows = [...extractRecords(data)].sort((a, b) => {
        const byTime =
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
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

  return {
    // Filters / list
    statusFilter,
    setStatusFilter,
    visibleFilters,
    counts,
    records,
    loading,
    error,
    loadInvoices,

    // Row / detail selection
    selected,
    setSelected,
    selectedPayload,
    itemNameOf,

    // Row action state
    actionId,
    actionError,
    setActionError,
    actionMessage,
    canApproveReject,
    canPostToSap,
    handleAction,
    handleDelete,
    handleEdit,

    // History drawer
    historyFor,
    setHistoryFor,
    historyRecords,
    historyLoading,
    historyError,
    historyVersions,
    openHistory,

    // Credit-limit request
    clRecord,
    setClRecord,
    clCard,
    clLoading,
    clLookupError,
    clNewLimit,
    setClNewLimit,
    clValidTill,
    setClValidTill,
    clFile,
    setClFile,
    clSubmitting,
    clSubmitError,
    openCreditLimitRequest,
    submitCreditLimitRequest,

    // Credit-limit approval flow
    clFlowRecord,
    setClFlowRecord,
    clFlowStages,
    clFlowLoading,
    clFlowError,
    clFlowSummary,
    openCreditLimitFlow,

    // SAP post (Mission Control loader)
    sapPost,
    postingRecord,
    handlePostToSap,
    openLoaderReport,
    closeSapLoader,
    raiseClFromLoader,
    sapErrorIsCreditLimit,
  };
}

export type UseInvoiceReviewResult = ReturnType<typeof useInvoiceReview>;
