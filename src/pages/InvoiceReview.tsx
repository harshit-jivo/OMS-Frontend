import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiArrowPath,
  HiCheckCircle,
  HiCloudArrowUp,
  HiExclamationTriangle,
  HiEye,
  HiInbox,
  HiMagnifyingGlass,
  HiXCircle,
  HiXMark,
} from "react-icons/hi2";
import { apiFetch, createInvoiceLog, getCurrentUserId } from "./SalesInvoice/useSalesInvoice";
import { useSapPost } from "./SalesInvoice/useSapPost";
import { toNumber } from "./SalesInvoice/salesInvoice.utils";
import MissionControlLoader from "../components/MissionControlLoader";
import "../styles/InvoiceReview.css";

// SAP approval (WddStatus) codes the invoice-drafts endpoint filters on:
// W = pending approval, Y = approved, N = rejected. The response itself does not
// carry the status, so the active filter determines what's shown.
type StatusCode = "W" | "Y" | "N";

const STATUS_FILTERS: Array<{ code: StatusCode; label: string; badge: string }> = [
  { code: "W", label: "Pending", badge: "pending" },
  { code: "Y", label: "Approved", badge: "approved" },
  { code: "N", label: "Rejected", badge: "rejected" },
];

// The endpoint returns one row per approval request (keyed by WddCode). It is a
// header-only summary — no line items are included, but DocTotal carries the amount.
type DraftRow = {
  WddCode?: number;
  Status?: string;
  UserSign?: number;
  DocEntry?: number;
  DocDueDate?: string;
  CardCode?: string;
  CardName?: string;
  Address?: string;
  Address2?: string;
  ShipToCode?: string;
  DocTotal?: number;
  U_OMS_REF?: string | null;
  [key: string]: unknown;
};

type ToastState = { id: number; message: string; type: "success" | "error" };

/* ── Formatting helpers ─────────────────────────────────────────────── */

const formatAmount = (value: unknown) => {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

// SAP addresses arrive as carriage-return separated lines ("CITY\rPIN\rIN").
const formatAddress = (value?: string) =>
  value
    ? value
        .split(/\r\n?/)
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ")
    : "—";

const orDash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

const statusBadgeMeta = (code: StatusCode) =>
  STATUS_FILTERS.find((filter) => filter.code === code) ?? STATUS_FILTERS[0];

// The SAP proxy returns rows wrapped as { data: [...] }; tolerate a few shapes.
const extractRows = (payload: unknown): DraftRow[] => {
  if (Array.isArray(payload)) return payload as DraftRow[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "results", "value"]) {
      if (Array.isArray(obj[key])) return obj[key] as DraftRow[];
    }
  }
  return [];
};

const rowKey = (row: DraftRow, index = 0) =>
  row.WddCode !== undefined && row.WddCode !== null
    ? `W${row.WddCode}`
    : `E${row.DocEntry ?? index}`;

const draftLabel = (row: DraftRow) => orDash(row.DocEntry);

/* ── Toast ──────────────────────────────────────────────────────────── */

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`ir-toast ir-toast-${toast.type}`} role="status">
      {toast.type === "success" ? (
        <HiCheckCircle aria-hidden="true" />
      ) : (
        <HiExclamationTriangle aria-hidden="true" />
      )}
      <span>{toast.message}</span>
      <button type="button" className="ir-toast-close" aria-label="Dismiss" onClick={onClose}>
        <HiXMark aria-hidden="true" />
      </button>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function InvoiceReview() {
  const [statusCode, setStatusCode] = useState<StatusCode>("W");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<StatusCode, number>>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DraftRow | null>(null);
  const [confirmApproveRow, setConfirmApproveRow] = useState<DraftRow | null>(null);
  const [rejectRow, setRejectRow] = useState<DraftRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [postSapRow, setPostSapRow] = useState<DraftRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const sapPost = useSapPost();

  const activeFilter = statusBadgeMeta(statusCode);
  const isPendingTab = statusCode === "W";
  const isApprovedTab = statusCode === "Y";

  const showToast = useCallback((message: string, type: ToastState["type"]) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<unknown>(`/api/hana/invoice-drafts/?statusCode=${statusCode}`);
      const nextRows = extractRows(data);
      setRows(nextRows);
      setCounts((current) => ({ ...current, [statusCode]: nextRows.length }));
    } catch (err) {
      console.error(err);
      setRows([]);
      setError("Unable to load invoice drafts from SAP HANA.");
    } finally {
      setLoading(false);
    }
  }, [statusCode]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.DocEntry, row.CardName, row.U_OMS_REF, row.CardCode, row.ShipToCode]
        .filter((value) => value !== undefined && value !== null)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [rows, search]);

  const closeDrawer = () => setSelected(null);

  // Approve a draft through the SAP service-layer draft-action endpoint. The
  // request is keyed by DocEntry (passed as draft_id) with status=Approved.
  const approveDraft = async (row: DraftRow) => {
    if (row.DocEntry === undefined || row.DocEntry === null) {
      showToast("Missing draft id for this draft.", "error");
      return;
    }
    setActionLoading(true);
    try {
      const response = await apiFetch<unknown>(
        `/api/service-layer/draft-action/?draft_id=${encodeURIComponent(String(row.DocEntry))}&status=Approved`,
        { method: "POST" },
      );
      console.log("Approve draft response:", response);
      // apiFetch only resolves on a 2xx, so reaching here means the approval landed.
      const approver = getCurrentUserId();
      await createInvoiceLog({
        so_number: "",
        party_name: row.CardName || "",
        total_amount: String(toNumber(row.DocTotal)),
        ref_id: String(row.U_OMS_REF || ""),
        status: "APPROVED",
        created_by: approver,
        approved_by: approver,
        invoice_payload: row,
      });
      setRows((current) => current.filter((item) => rowKey(item) !== rowKey(row)));
      setCounts((current) => ({
        ...current,
        W: Math.max((current.W ?? 1) - 1, 0),
        Y: (current.Y ?? 0) + 1,
      }));
      showToast(`Draft #${draftLabel(row)} approved.`, "success");
      setConfirmApproveRow(null);
      if (selected && rowKey(selected) === rowKey(row)) closeDrawer();
    } catch (err) {
      console.error(err);
      showToast("Unable to approve draft. Please try again.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Reject a draft through the same SAP service-layer draft-action endpoint, keyed
  // by DocEntry (draft_id) with status=NotApproved. The reason gates the action in the
  // UI and is recorded in the invoice log below.
  const rejectDraft = async (row: DraftRow, reason: string) => {
    if (!reason.trim()) return;
    if (row.DocEntry === undefined || row.DocEntry === null) {
      showToast("Missing draft id for this draft.", "error");
      return;
    }
    setActionLoading(true);
    try {
      const response = await apiFetch<unknown>(
        `/api/service-layer/draft-action/?draft_id=${encodeURIComponent(String(row.DocEntry))}&status=NotApproved`,
        { method: "POST" },
      );
      console.log("Reject draft response:", response);
      // apiFetch only resolves on a 2xx, so reaching here means the rejection landed.
      const rejecter = getCurrentUserId();
      await createInvoiceLog({
        so_number: "",
        party_name: row.CardName || "",
        total_amount: String(toNumber(row.DocTotal)),
        ref_id: String(row.U_OMS_REF || ""),
        status: "REJECTED",
        created_by: rejecter,
        rejected_by: rejecter,
        rejection_reason: reason.trim(),
        invoice_payload: row,
      });
      setRows((current) => current.filter((item) => rowKey(item) !== rowKey(row)));
      setCounts((current) => ({
        ...current,
        W: Math.max((current.W ?? 1) - 1, 0),
        N: (current.N ?? 0) + 1,
      }));
      showToast(`Draft #${draftLabel(row)} rejected.`, "success");
      setRejectRow(null);
      setRejectReason("");
      if (selected && rowKey(selected) === rowKey(row)) closeDrawer();
    } catch (err) {
      console.error(err);
      showToast("Unable to reject draft. Please try again.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openReject = (row: DraftRow) => {
    setRejectReason("");
    setRejectRow(row);
  };

  // Launch the Mission Control loader for an already-approved draft. The loader's
  // hook (useSapPost) owns the real work — fetch the full draft, transform it into
  // the lean invoice payload, then POST it to the service-layer invoice endpoint.
  const launchSapPost = (row: DraftRow) => {
    if (row.DocEntry === undefined || row.DocEntry === null) {
      showToast("Missing draft id for this draft.", "error");
      return;
    }
    setPostSapRow(null);
    if (selected && rowKey(selected) === rowKey(row)) closeDrawer();
    sapPost.run({
      draftId: row.DocEntry,
      doc: {
        draftNo: draftLabel(row),
        customer: row.CardName || "",
        itemCount: null,
        total: toNumber(row.DocTotal),
        branch: typeof row.BPLName === "string" ? row.BPLName : "",
      },
    });
  };

  // Dismiss the loader; refresh the list after a successful post so any SAP-side
  // state change is reflected.
  const closeSapLoader = () => {
    const posted = sapPost.state.status === "success";
    sapPost.close();
    if (posted) loadDrafts();
  };

  return (
    <div className="ir-page">
      {/* Page header */}
      <header className="ir-header">
        <div>
          <h1>Invoice Review</h1>
          <p>Review, approve, or reject invoice drafts</p>
        </div>
        <button type="button" className="ir-btn ir-btn-ghost" onClick={loadDrafts} disabled={loading}>
          <HiArrowPath className={loading ? "ir-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      </header>

      {/* Pill tabs with counts */}
      <nav className="ir-filters" aria-label="Filter invoice drafts by approval status">
        {STATUS_FILTERS.map((filter) => {
          const count = counts[filter.code];
          return (
            <button
              key={filter.code}
              type="button"
              className={`ir-filter${statusCode === filter.code ? " is-active" : ""}`}
              onClick={() => setStatusCode(filter.code)}
            >
              {filter.label}
              {count !== undefined && <span className="ir-filter-count">{count}</span>}
            </button>
          );
        })}
      </nav>

      {/* Filter / search bar */}
      <div className="ir-toolbar">
        <div className="ir-search">
          <HiMagnifyingGlass aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by Draft #, Party, OMS Ref, Customer Code"
            aria-label="Search invoice drafts"
          />
        </div>
        <span className="ir-toolbar-meta">
          {loading ? "Loading…" : `${filteredRows.length} ${filteredRows.length === 1 ? "draft" : "drafts"}`}
        </span>
      </div>

      <section className="ir-card">
        {loading ? (
          <SkeletonTable />
        ) : error ? (
          <div className="ir-empty">
            <HiExclamationTriangle aria-hidden="true" />
            <span>{error}</span>
            <button type="button" className="ir-btn ir-btn-ghost ir-btn-sm" onClick={loadDrafts}>
              <HiArrowPath aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="ir-empty">
            <HiInbox aria-hidden="true" />
            <span>{search ? "No invoices match your search." : "No invoices found."}</span>
          </div>
        ) : (
          <div className="ir-table-wrap">
            <table className="ir-table">
              <thead>
                <tr>
                  <th>Draft #</th>
                  <th>Party</th>
                  <th className="ir-num">Amount</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Ship To</th>
                  <th>OMS Ref</th>
                  <th className="ir-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={rowKey(row, index)}>
                    <td className="ir-strong">{draftLabel(row)}</td>
                    <td>
                      <span className="ir-truncate" title={orDash(row.CardName)}>
                        {orDash(row.CardName)}
                      </span>
                    </td>
                    <td className="ir-num">{formatAmount(row.DocTotal)}</td>
                    <td>
                      <span className={`ir-badge ir-badge-${activeFilter.badge}`}>{activeFilter.label}</span>
                    </td>
                    <td>{formatDate(row.DocDueDate)}</td>
                    <td>
                      <span className="ir-truncate" title={orDash(row.ShipToCode)}>
                        {orDash(row.ShipToCode)}
                      </span>
                    </td>
                    <td>
                      <span className="ir-truncate ir-truncate-sm" title={orDash(row.U_OMS_REF)}>
                        {orDash(row.U_OMS_REF)}
                      </span>
                    </td>
                    <td className="ir-actions-col">
                      <div className="ir-row-actions">
                        <button
                          type="button"
                          className="ir-btn ir-btn-ghost ir-btn-sm"
                          onClick={() => setSelected(row)}
                        >
                          <HiEye aria-hidden="true" />
                          View
                        </button>
                        {isPendingTab && (
                          <>
                            <button
                              type="button"
                              className="ir-btn ir-btn-approve ir-btn-sm"
                              onClick={() => setConfirmApproveRow(row)}
                            >
                              <HiCheckCircle aria-hidden="true" />
                              Approve
                            </button>
                            <button
                              type="button"
                              className="ir-btn ir-btn-reject ir-btn-sm"
                              onClick={() => openReject(row)}
                            >
                              <HiXCircle aria-hidden="true" />
                              Reject
                            </button>
                          </>
                        )}
                        {isApprovedTab && (
                          <button
                            type="button"
                            className="ir-btn ir-btn-sap ir-btn-sm"
                            onClick={() => setPostSapRow(row)}
                          >
                            <HiCloudArrowUp aria-hidden="true" />
                            Post to SAP
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Detail drawer */}
      {selected && (
        <div className="ir-drawer-backdrop" role="presentation" onClick={closeDrawer}>
          <aside
            className="ir-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Invoice draft ${draftLabel(selected)}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ir-drawer-head">
              <div>
                <span className="ir-eyebrow">Invoice Draft</span>
                <h2>Draft #{draftLabel(selected)}</h2>
                <p>{orDash(selected.CardName)}</p>
              </div>
              <button type="button" className="ir-icon-btn" aria-label="Close details" onClick={closeDrawer}>
                <HiXMark aria-hidden="true" />
              </button>
            </header>

            <div className="ir-drawer-body">
              <div className="ir-drawer-status">
                <span className={`ir-badge ir-badge-${activeFilter.badge}`}>{activeFilter.label}</span>
                <strong>{formatAmount(selected.DocTotal)}</strong>
              </div>

              <dl className="ir-meta-grid">
                <div><dt>Party Name</dt><dd>{orDash(selected.CardName)}</dd></div>
                <div><dt>Draft Entry</dt><dd>{orDash(selected.DocEntry)}</dd></div>
                <div><dt>Approval Code</dt><dd>{orDash(selected.WddCode)}</dd></div>
                <div><dt>Customer Code</dt><dd>{orDash(selected.CardCode)}</dd></div>
                <div><dt>Total Amount</dt><dd>{formatAmount(selected.DocTotal)}</dd></div>
                <div><dt>Due Date</dt><dd>{formatDate(selected.DocDueDate)}</dd></div>
                <div><dt>Ship To</dt><dd>{orDash(selected.ShipToCode)}</dd></div>
                <div><dt>OMS Ref</dt><dd>{orDash(selected.U_OMS_REF)}</dd></div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>Address</dt>
                  <dd>{formatAddress(selected.Address)}</dd>
                </div>
              </dl>
            </div>

            {isPendingTab && (
              <footer className="ir-drawer-foot">
                <button
                  type="button"
                  className="ir-btn ir-btn-reject"
                  onClick={() => openReject(selected)}
                >
                  <HiXCircle aria-hidden="true" />
                  Reject
                </button>
                <button
                  type="button"
                  className="ir-btn ir-btn-approve"
                  onClick={() => setConfirmApproveRow(selected)}
                >
                  <HiCheckCircle aria-hidden="true" />
                  Approve Invoice
                </button>
              </footer>
            )}

            {isApprovedTab && (
              <footer className="ir-drawer-foot">
                <button
                  type="button"
                  className="ir-btn ir-btn-sap"
                  onClick={() => setPostSapRow(selected)}
                >
                  <HiCloudArrowUp aria-hidden="true" />
                  Post to SAP
                </button>
              </footer>
            )}
          </aside>
        </div>
      )}

      {/* Approve confirmation */}
      {confirmApproveRow && (
        <div className="ir-modal-backdrop" role="presentation" onClick={() => !actionLoading && setConfirmApproveRow(null)}>
          <section
            className="ir-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm approval"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ir-confirm-icon ir-confirm-icon-approve">
              <HiCheckCircle aria-hidden="true" />
            </div>
            <h3>Approve invoice?</h3>
            <p>
              Are you sure you want to approve Draft #{draftLabel(confirmApproveRow)} for{" "}
              {orDash(confirmApproveRow.CardName)}?
            </p>
            <div className="ir-confirm-actions">
              <button
                type="button"
                className="ir-btn ir-btn-ghost"
                onClick={() => setConfirmApproveRow(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ir-btn ir-btn-approve"
                onClick={() => approveDraft(confirmApproveRow)}
                disabled={actionLoading}
              >
                {actionLoading ? "Approving…" : "Yes, Approve"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Reject reason */}
      {rejectRow && (
        <div className="ir-modal-backdrop" role="presentation" onClick={() => !actionLoading && setRejectRow(null)}>
          <section
            className="ir-confirm ir-confirm-reject"
            role="dialog"
            aria-modal="true"
            aria-label="Reject invoice"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ir-confirm-icon ir-confirm-icon-reject">
              <HiXCircle aria-hidden="true" />
            </div>
            <h3>Reject invoice</h3>
            <p>
              Provide a reason for rejecting Draft #{draftLabel(rejectRow)} for {orDash(rejectRow.CardName)}.
            </p>
            <label className="ir-field-label" htmlFor="ir-reject-reason">
              Reason for rejection
            </label>
            <textarea
              id="ir-reject-reason"
              className="ir-textarea"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="e.g. Incorrect pricing, wrong ship-to address…"
              rows={4}
              autoFocus
            />
            <div className="ir-confirm-actions">
              <button
                type="button"
                className="ir-btn ir-btn-ghost"
                onClick={() => setRejectRow(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ir-btn ir-btn-reject-solid"
                onClick={() => rejectDraft(rejectRow, rejectReason)}
                disabled={actionLoading || !rejectReason.trim()}
              >
                {actionLoading ? "Rejecting…" : "Reject Invoice"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Post to SAP confirmation */}
      {postSapRow && (
        <div className="ir-modal-backdrop" role="presentation" onClick={() => !actionLoading && setPostSapRow(null)}>
          <section
            className="ir-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm post to SAP"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ir-confirm-icon ir-confirm-icon-sap">
              <HiCloudArrowUp aria-hidden="true" />
            </div>
            <h3>Post invoice to SAP?</h3>
            <p>
              This will create an invoice in SAP from Draft #{draftLabel(postSapRow)} for{" "}
              {orDash(postSapRow.CardName)}.
            </p>
            <div className="ir-confirm-actions">
              <button
                type="button"
                className="ir-btn ir-btn-ghost"
                onClick={() => setPostSapRow(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ir-btn ir-btn-sap"
                onClick={() => launchSapPost(postSapRow)}
              >
                Yes, Post to SAP
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Mission Control loader — drives the live post-to-SAP transaction */}
      <MissionControlLoader state={sapPost.state} onClose={closeSapLoader} onRetry={sapPost.retry} />

      {toast && (
        <div className="ir-toast-wrap">
          <Toast toast={toast} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
}

/* ── Loading skeleton ───────────────────────────────────────────────── */

function SkeletonTable() {
  return (
    <div className="ir-table-wrap">
      <table className="ir-table">
        <thead>
          <tr>
            <th>Draft #</th>
            <th>Party</th>
            <th className="ir-num">Amount</th>
            <th>Status</th>
            <th>Due Date</th>
            <th>Ship To</th>
            <th>OMS Ref</th>
            <th className="ir-actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, index) => (
            <tr key={index} className="ir-skeleton-row">
              {Array.from({ length: 8 }).map((__, cell) => (
                <td key={cell}>
                  <span className="ir-skeleton-bar" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
