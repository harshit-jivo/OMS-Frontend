import { useMemo, useState } from "react";
import {
  HiArrowPath,
  HiArrowDownTray,
  HiCheckCircle,
  HiChevronDown,
  HiChevronUp,
  HiEye,
  HiEyeSlash,
  HiPencilSquare,
  HiPlusCircle,
  HiTrash,
  HiXCircle,
} from "react-icons/hi2";

import ConfigTab from "./ConfigTab";
import approvalService, {
  COMPANY_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  type ApprovalLevel,
  type ApprovalRequest,
  type ApprovalWorkflow,
  type CollectionPerson,
  type CollectionPersonPayload,
  type Company,
  type BankSyncMeta,
  type CompanyMapping,
  type MethodMappingRow,
  type SapBank,
  type CompanyMappingPayload,
  type DocumentType,
  type LevelApprover,
  type LevelPayload,
  type RequestStatus,
  type WorkflowPayload,
} from "../../services/approvalService";
import {
  ActivePill,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  SearchSelect,
  StatusPill,
  TableSkeleton,
} from "./ApprovalUI";
import { formatAge, formatDateTime, formatMoney } from "./approvalFormat";
import {
  messageFrom,
  useIsApprovalAdmin,
  useResource,
  useToast,
} from "./useApprovalAdmin";
import "../../styles/Approval_Admin.css";

/**
 * Approval Workflow Management — single admin console for the Payments module.
 *
 * One page, six tabs. Everything an administrator needs to run approvals for
 * Receive Payment and Bank Deposit (and, via document_type, future modules)
 * without touching the database.
 *
 * Backend: /api/approvals/ (workflows, levels, approvers, requests) and
 * /api/payments/ for the master lists. Endpoints that do not exist yet are
 * typed in approvalService and render a real empty/error state rather than
 * mock data.
 */

type Tab =
  | "overview"
  | "workflows"
  | "levels"
  | "approvers"
  | "requests"
  | "masters";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "workflows", label: "Workflows" },
  { id: "levels", label: "Levels" },
  { id: "approvers", label: "Approvers" },
  { id: "requests", label: "Requests" },
  { id: "masters", label: "Masters" },
];

type Flash = (text: string, kind?: "ok" | "err") => void;

export default function ApprovalManagement() {
  const [tab, setTab] = useState<Tab>("overview");
  const { toast, flash } = useToast();
  const isAdmin = useIsApprovalAdmin();

  // Selected workflow is shared between the Workflows, Levels and Approvers
  // tabs, so choosing one in the list carries through to its editor.
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);

  const workflows = useResource<ApprovalWorkflow[]>(
    () => approvalService.listWorkflows(),
    [],
  );

  const openLevels = (id: number) => {
    setSelectedWorkflowId(id);
    setTab("levels");
  };

  const openApprovers = (id: number) => {
    setSelectedWorkflowId(id);
    setTab("approvers");
  };

  return (
    <div className="apv-page app-page">
      <div className="apv-header">
        <div>
          <h1>Approval Management</h1>
          <div className="apv-sub">
            Configure approval workflows, levels and approvers for payments,
            deposits and other documents.
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div className="apv-notice apv-notice-warn">
          <span>
            You are signed in without administrator rights. Configuration is
            read-only — the server rejects changes from non-admin accounts.
          </span>
        </div>
      )}

      <div className="apv-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`apv-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab workflows={workflows.data} />}

      {tab === "workflows" && (
        <WorkflowsTab
          resource={workflows}
          canEdit={isAdmin}
          flash={flash}
          onOpenLevels={openLevels}
          onOpenApprovers={openApprovers}
        />
      )}

      {tab === "levels" && (
        <LevelsTab
          workflows={workflows.data}
          selectedId={selectedWorkflowId}
          onSelect={setSelectedWorkflowId}
          canEdit={isAdmin}
          flash={flash}
          onWorkflowsChanged={workflows.reload}
        />
      )}

      {tab === "approvers" && (
        <ApproversTab
          workflows={workflows.data}
          selectedId={selectedWorkflowId}
          onSelect={setSelectedWorkflowId}
          canEdit={isAdmin}
          flash={flash}
        />
      )}

      {tab === "requests" && <RequestsTab flash={flash} />}

      {tab === "masters" && <MastersTab canEdit={isAdmin} flash={flash} />}


      {toast && (
        <div className={`apv-toast${toast.kind === "err" ? " is-err" : ""}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Overview
// ===========================================================================

function OverviewTab({ workflows }: { workflows: ApprovalWorkflow[] }) {
  const requests = useResource(
    () => approvalService.listRequests({}),
    { results: [] as ApprovalRequest[], count: 0 },
  );
  const inbox = useResource(
    () => approvalService.inbox(),
    { results: [] as ApprovalRequest[], count: 0 },
  );

  const stats = useMemo(() => {
    const all = requests.data.results;
    const today = new Date().toDateString();
    const decidedToday = (status: RequestStatus) =>
      all.filter(
        (r) =>
          r.status === status &&
          r.decided_at &&
          new Date(r.decided_at).toDateString() === today,
      ).length;

    return {
      totalWorkflows: workflows.length,
      activeWorkflows: workflows.filter((w) => w.is_active).length,
      awaitingMe: inbox.data.count,
      pending: all.filter((r) => r.status === "PENDING").length,
      approvedToday: decidedToday("APPROVED"),
      rejectedToday: decidedToday("REJECTED"),
    };
  }, [workflows, requests.data.results, inbox.data.count]);

  // A workflow with no active levels can never be satisfied — surface it here
  // rather than letting a document deadlock after submission.
  const brokenWorkflows = useMemo(
    () =>
      workflows.filter(
        (w) => w.is_active && w.levels.filter((l) => l.is_active).length === 0,
      ),
    [workflows],
  );

  const recent = requests.data.results.slice(0, 8);

  return (
    <>
      <div className="apv-stats">
        <Stat label="Workflows" value={stats.totalWorkflows} />
        <Stat label="Active" value={stats.activeWorkflows} tone="ok" />
        <Stat label="Awaiting me" value={stats.awaitingMe} tone="warn" />
        <Stat label="Pending" value={stats.pending} tone="warn" />
        <Stat label="Approved today" value={stats.approvedToday} tone="ok" />
        <Stat label="Rejected today" value={stats.rejectedToday} tone="err" />
      </div>

      {brokenWorkflows.length > 0 && (
        <div className="apv-notice apv-notice-warn">
          <span>
            <strong>
              {brokenWorkflows.length} active workflow
              {brokenWorkflows.length > 1 ? "s have" : " has"} no active levels.
            </strong>{" "}
            Documents submitted against{" "}
            {brokenWorkflows.length > 1 ? "them" : "it"} cannot be approved by
            anyone. Add at least one level:{" "}
            {brokenWorkflows.map((w) => w.code).join(", ")}
          </span>
        </div>
      )}

      <div className="apv-card">
        <div className="apv-card-head">
          <h3>Recent requests</h3>
          <button type="button" className="apv-btn apv-btn-sm" onClick={requests.reload}>
            <HiArrowPath /> Refresh
          </button>
        </div>

        <div className="apv-table-wrap">
          <table className="apv-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Company</th>
                <th className="apv-num">Amount</th>
                <th>Level</th>
                <th>Status</th>
                <th>Submitted by</th>
                <th>Age</th>
              </tr>
            </thead>
            <AsyncBoundaryTable
              loading={requests.loading}
              error={requests.error}
              isEmpty={recent.length === 0}
              onRetry={requests.reload}
              cols={8}
              emptyTitle="No requests yet"
              emptyHint="Approval requests appear here once a payment or deposit is submitted."
            >
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code>{r.document_number || `#${r.id}`}</code>
                    </td>
                    <td>{r.document_type}</td>
                    <td>{r.company}</td>
                    <td className="apv-num">{formatMoney(r.amount)}</td>
                    <td>{r.level_label}</td>
                    <td>
                      <StatusPill status={r.status} label={r.status_display} />
                    </td>
                    <td>{r.submitted_by_name || "—"}</td>
                    <td>{formatAge(r.submitted_at || r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </AsyncBoundaryTable>
          </table>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "err";
}) {
  return (
    <div className="apv-stat">
      <div className="apv-stat-label">{label}</div>
      <div className={`apv-stat-value${tone ? ` is-${tone}` : ""}`}>{value}</div>
    </div>
  );
}

/** AsyncBoundary that renders its states as a full-width table row. */
function AsyncBoundaryTable({
  loading,
  error,
  isEmpty,
  onRetry,
  cols,
  emptyTitle,
  emptyHint,
  emptyAction,
  children,
}: {
  loading: boolean;
  error: string;
  isEmpty: boolean;
  onRetry: () => void;
  cols: number;
  emptyTitle: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (loading) return <TableSkeleton cols={cols} />;
  if (error) {
    return (
      <tbody>
        <tr>
          <td colSpan={cols}>
            <ErrorState message={error} onRetry={onRetry} />
          </td>
        </tr>
      </tbody>
    );
  }
  if (isEmpty) {
    return (
      <tbody>
        <tr>
          <td colSpan={cols}>
            <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />
          </td>
        </tr>
      </tbody>
    );
  }
  return <>{children}</>;
}

// ===========================================================================
// Workflows
// ===========================================================================

const EMPTY_WORKFLOW: WorkflowPayload = {
  code: "",
  name: "",
  document_type: "PAYMENT",
  company: "",
  restart_on_reject: true,
  forbid_self_approval: true,
  is_active: true,
};

function WorkflowsTab({
  resource,
  canEdit,
  flash,
  onOpenLevels,
  onOpenApprovers,
}: {
  resource: ReturnType<typeof useResource<ApprovalWorkflow[]>>;
  canEdit: boolean;
  flash: Flash;
  onOpenLevels: (id: number) => void;
  onOpenApprovers: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [docFilter, setDocFilter] = useState<DocumentType | "">("");
  const [companyFilter, setCompanyFilter] = useState<Company | "">("");
  const [editing, setEditing] = useState<
    (WorkflowPayload & { id?: number }) | null
  >(null);
  const [deleting, setDeleting] = useState<ApprovalWorkflow | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resource.data.filter((w) => {
      if (docFilter && w.document_type !== docFilter) return false;
      if (companyFilter && w.company !== companyFilter) return false;
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q)
      );
    });
  }, [resource.data, search, docFilter, companyFilter]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) {
        const { id, ...payload } = editing;
        await approvalService.updateWorkflow(id, payload);
        flash("Workflow updated");
      } else {
        await approvalService.createWorkflow(editing);
        flash("Workflow created");
      }
      setEditing(null);
      resource.reload();
    } catch (err) {
      flash(messageFrom(err, "Save failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await approvalService.deleteWorkflow(deleting.id);
      flash("Workflow deleted");
      setDeleting(null);
      resource.reload();
    } catch (err) {
      flash(messageFrom(err, "Delete failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Activate / deactivate in place.
   *
   * Only ONE active workflow may exist per (document type, company), so this is
   * how an admin frees the slot before creating a replacement — the server
   * rejects the new one until the incumbent is switched off.
   */
  const toggleActive = async (w: ApprovalWorkflow) => {
    setBusy(true);
    try {
      await approvalService.updateWorkflow(w.id, { is_active: !w.is_active });
      flash(w.is_active ? "Workflow deactivated" : "Workflow activated");
      resource.reload();
    } catch (err) {
      flash(messageFrom(err, "Update failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const header = [
      "Code",
      "Name",
      "Document type",
      "Company",
      "Levels",
      "Restart on reject",
      "Self-approval blocked",
      "Status",
      "Created",
    ];
    const body = visible.map((w) => [
      w.code,
      w.name,
      w.document_type,
      w.company || "All",
      String(w.levels.filter((l) => l.is_active).length),
      w.restart_on_reject ? "Yes" : "No",
      w.forbid_self_approval ? "Yes" : "No",
      w.is_active ? "Active" : "Inactive",
      formatDateTime(w.created_at),
    ]);
    const csv = [header, ...body]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\r\n");

    // Leading BOM so Excel reads the file as UTF-8 rather than ANSI.
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `approval-workflows-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const valid =
    !!editing?.code?.trim() &&
    !!editing?.name?.trim() &&
    !!editing?.document_type;

  return (
    <div className="apv-card">
      <div className="apv-toolbar">
        <input
          className="apv-input apv-search"
          placeholder="Search name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="apv-select"
          value={docFilter}
          onChange={(e) => setDocFilter(e.target.value as DocumentType | "")}
        >
          <option value="">All document types</option>
          {DOCUMENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="apv-select"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value as Company | "")}
        >
          <option value="">All companies</option>
          {COMPANY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="apv-spacer" />

        <button type="button" className="apv-btn" onClick={resource.reload}>
          <HiArrowPath /> Refresh
        </button>
        <button
          type="button"
          className="apv-btn"
          onClick={exportCsv}
          disabled={visible.length === 0}
        >
          <HiArrowDownTray /> Export
        </button>
        {canEdit && (
          <button
            type="button"
            className="apv-btn apv-btn-primary"
            onClick={() => setEditing({ ...EMPTY_WORKFLOW })}
          >
            <HiPlusCircle /> New workflow
          </button>
        )}
      </div>

      <div className="apv-table-wrap">
        <table className="apv-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Document type</th>
              <th>Company</th>
              <th className="apv-num">Levels</th>
              <th>Rules</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <AsyncBoundaryTable
            loading={resource.loading}
            error={resource.error}
            isEmpty={visible.length === 0}
            onRetry={resource.reload}
            cols={9}
            emptyTitle={
              resource.data.length === 0
                ? "No workflows configured"
                : "No workflows match your filters"
            }
            emptyHint={
              resource.data.length === 0
                ? "Create a workflow to define who approves payments and deposits."
                : "Try clearing the search or filters."
            }
            emptyAction={
              resource.data.length === 0 && canEdit ? (
                <button
                  type="button"
                  className="apv-btn apv-btn-primary"
                  onClick={() => setEditing({ ...EMPTY_WORKFLOW })}
                >
                  <HiPlusCircle /> New workflow
                </button>
              ) : undefined
            }
          >
            <tbody>
              {visible.map((w) => {
                const activeLevels = w.levels.filter((l) => l.is_active).length;
                return (
                  <tr key={w.id}>
                    <td>
                      <code>{w.code}</code>
                    </td>
                    <td>{w.name}</td>
                    <td>{w.document_type}</td>
                    <td>{w.company || <span className="apv-badge apv-badge-info">All</span>}</td>
                    <td className="apv-num">
                      {activeLevels === 0 ? (
                        <span className="apv-badge apv-badge-err">None</span>
                      ) : (
                        activeLevels
                      )}
                    </td>
                    <td>
                      <span
                        className="apv-badge apv-badge-muted"
                        title="A rejected document restarts from level 1"
                      >
                        {w.restart_on_reject ? "Restart" : "Resume"}
                      </span>{" "}
                      {w.forbid_self_approval && (
                        <span
                          className="apv-badge apv-badge-muted"
                          title="The submitter may not approve their own document"
                        >
                          No self-approve
                        </span>
                      )}
                    </td>
                    <td>
                      <ActivePill active={w.is_active} />
                    </td>
                    <td>{formatDateTime(w.created_at)}</td>
                    <td>
                      <div className="apv-row-actions">
                        <button
                          type="button"
                          className="apv-btn apv-btn-sm"
                          onClick={() => onOpenLevels(w.id)}
                        >
                          Levels
                        </button>
                        <button
                          type="button"
                          className="apv-btn apv-btn-sm"
                          onClick={() => onOpenApprovers(w.id)}
                        >
                          Approvers
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon"
                              title={w.is_active ? "Deactivate" : "Activate"}
                              aria-label={`${w.is_active ? "Deactivate" : "Activate"} ${w.name}`}
                              disabled={busy}
                              onClick={() => toggleActive(w)}
                            >
                              {w.is_active ? <HiEye /> : <HiEyeSlash />}
                            </button>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon"
                              title="Edit"
                              aria-label={`Edit ${w.name}`}
                              onClick={() =>
                                setEditing({
                                  id: w.id,
                                  code: w.code,
                                  name: w.name,
                                  document_type: w.document_type,
                                  company: w.company,
                                  restart_on_reject: w.restart_on_reject,
                                  forbid_self_approval: w.forbid_self_approval,
                                  is_active: w.is_active,
                                })
                              }
                            >
                              <HiPencilSquare />
                            </button>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon apv-btn-danger"
                              title="Delete"
                              aria-label={`Delete ${w.name}`}
                              onClick={() => setDeleting(w)}
                            >
                              <HiTrash />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </AsyncBoundaryTable>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing.id ? "Edit workflow" : "New workflow"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button
                type="button"
                className="apv-btn"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apv-btn apv-btn-primary"
                onClick={save}
                disabled={busy || !valid}
              >
                {busy ? "Saving…" : "Save workflow"}
              </button>
            </>
          }
        >
          <div className="apv-form-grid">
            <div className="apv-field">
              <label htmlFor="wf-code">Code</label>
              <input
                id="wf-code"
                className="apv-input"
                value={editing.code ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, code: e.target.value.toUpperCase() })
                }
                placeholder="PAYMENT_OIL_V1"
              />
              <span className="apv-hint">Unique identifier. Cannot repeat.</span>
            </div>

            <div className="apv-field">
              <label htmlFor="wf-name">Name</label>
              <input
                id="wf-name"
                className="apv-input"
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Payment approval — Oil"
              />
            </div>

            <div className="apv-field">
              <label htmlFor="wf-doc">Document type</label>
              <select
                id="wf-doc"
                className="apv-select"
                value={editing.document_type ?? "PAYMENT"}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    document_type: e.target.value as DocumentType,
                  })
                }
              >
                {DOCUMENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="apv-field">
              <label htmlFor="wf-company">Company</label>
              <select
                id="wf-company"
                className="apv-select"
                value={editing.company ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, company: e.target.value as Company | "" })
                }
              >
                <option value="">All companies</option>
                {COMPANY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="apv-hint">
                Only one active workflow per document type + company.
              </span>
            </div>

            <div className="apv-field is-full">
              <label className="apv-check">
                <input
                  type="checkbox"
                  checked={editing.restart_on_reject ?? true}
                  onChange={(e) =>
                    setEditing({ ...editing, restart_on_reject: e.target.checked })
                  }
                />
                Restart from level 1 when a rejected document is resubmitted
              </label>
              <label className="apv-check">
                <input
                  type="checkbox"
                  checked={editing.forbid_self_approval ?? true}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      forbid_self_approval: e.target.checked,
                    })
                  }
                />
                Block self-approval (submitter may not approve their own document)
              </label>
              <label className="apv-check">
                <input
                  type="checkbox"
                  checked={editing.is_active ?? true}
                  onChange={(e) =>
                    setEditing({ ...editing, is_active: e.target.checked })
                  }
                />
                Active
              </label>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete workflow"
          message={`Delete "${deleting.name}" (${deleting.code})? Its levels and approver assignments are removed too. Workflows with existing approval requests cannot be deleted.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Levels
// ===========================================================================

function LevelsTab({
  workflows,
  selectedId,
  onSelect,
  canEdit,
  flash,
  onWorkflowsChanged,
}: {
  workflows: ApprovalWorkflow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  canEdit: boolean;
  flash: Flash;
  onWorkflowsChanged: () => void;
}) {
  const activeId = selectedId ?? workflows[0]?.id ?? null;
  const workflow = workflows.find((w) => w.id === activeId) ?? null;

  const levels = useResource<ApprovalLevel[]>(
    () => (activeId ? approvalService.listLevels(activeId) : Promise.resolve([])),
    [],
    [activeId],
  );
  const roles = useResource(() => approvalService.listRoles(), []);

  const [editing, setEditing] = useState<(LevelPayload & { id?: number }) | null>(
    null,
  );
  const [deleting, setDeleting] = useState<ApprovalLevel | null>(null);
  const [busy, setBusy] = useState(false);

  const ordered = useMemo(
    () => [...levels.data].sort((a, b) => a.sequence - b.sequence),
    [levels.data],
  );

  const refreshAll = () => {
    levels.reload();
    onWorkflowsChanged();
  };

  const save = async () => {
    if (!editing || !activeId) return;
    setBusy(true);
    try {
      if (editing.id) {
        const { id, ...payload } = editing;
        await approvalService.updateLevel(id, payload);
        flash("Level updated");
      } else {
        await approvalService.createLevel({ ...editing, workflow: activeId });
        flash("Level added");
      }
      setEditing(null);
      refreshAll();
    } catch (err) {
      flash(messageFrom(err, "Save failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await approvalService.deleteLevel(deleting.id);
      flash("Level deleted");
      setDeleting(null);
      refreshAll();
    } catch (err) {
      flash(messageFrom(err, "Delete failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Swap two levels' sequence numbers.
   *
   * (workflow, sequence) is UNIQUE in the database, so a direct swap would
   * collide on the first write. Parking one row on a free sequence first keeps
   * every intermediate state legal.
   */
  const move = async (index: number, direction: -1 | 1) => {
    const current = ordered[index];
    const neighbour = ordered[index + direction];
    if (!current || !neighbour) return;

    setBusy(true);
    try {
      const park = Math.max(...ordered.map((l) => l.sequence)) + 1;
      await approvalService.updateLevel(current.id, { sequence: park });
      await approvalService.updateLevel(neighbour.id, { sequence: current.sequence });
      await approvalService.updateLevel(current.id, { sequence: neighbour.sequence });
      flash("Order updated");
      refreshAll();
    } catch (err) {
      flash(messageFrom(err, "Could not reorder"), "err");
      levels.reload();
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (level: ApprovalLevel) => {
    setBusy(true);
    try {
      await approvalService.updateLevel(level.id, { is_active: !level.is_active });
      flash(level.is_active ? "Level disabled" : "Level enabled");
      refreshAll();
    } catch (err) {
      flash(messageFrom(err, "Update failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  if (workflows.length === 0) {
    return (
      <div className="apv-card">
        <EmptyState
          title="No workflows yet"
          hint="Create a workflow on the Workflows tab before adding levels."
        />
      </div>
    );
  }

  return (
    <>
      <div className="apv-card">
        <div className="apv-toolbar">
          <div className="apv-field" style={{ minWidth: 280 }}>
            <label htmlFor="lv-workflow">Workflow</label>
            <select
              id="lv-workflow"
              className="apv-select"
              value={activeId ?? ""}
              onChange={(e) => onSelect(Number(e.target.value))}
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>

          <div className="apv-spacer" />

          {canEdit && activeId && (
            <button
              type="button"
              className="apv-btn apv-btn-primary"
              onClick={() =>
                setEditing({
                  name: "",
                  sequence: ordered.length
                    ? Math.max(...ordered.map((l) => l.sequence)) + 1
                    : 1,
                  role: null,
                  min_approvals: 1,
                  is_active: true,
                })
              }
            >
              <HiPlusCircle /> Add level
            </button>
          )}
        </div>

        {workflow && !workflow.is_active && (
          <div className="apv-notice apv-notice-warn">
            <span>
              This workflow is inactive — documents will not route through it
              until it is activated.
            </span>
          </div>
        )}

        {levels.loading && <div className="apv-loading">Loading levels…</div>}
        {!levels.loading && levels.error && (
          <ErrorState message={levels.error} onRetry={levels.reload} />
        )}
        {!levels.loading && !levels.error && ordered.length === 0 && (
          <EmptyState
            title="No levels defined"
            hint="A workflow with no levels can never be approved. Add at least one."
          />
        )}

        {!levels.loading && !levels.error && ordered.length > 0 && (
          <div className="apv-ladder">
            {ordered.map((level, index) => (
              <div
                key={level.id}
                className={`apv-rung${level.is_active ? "" : " is-inactive"}`}
              >
                {/* The LADDER POSITION, not the stored sequence — documents
                    advance by position, so showing the raw column would
                    mislead whenever the numbering has gaps. */}
                <div className="apv-rung-seq">{index + 1}</div>

                <div className="apv-rung-main">
                  <div className="apv-rung-name">
                    {level.name}{" "}
                    {!level.is_active && (
                      <span className="apv-badge apv-badge-muted">Disabled</span>
                    )}
                  </div>
                  <div className="apv-rung-meta">
                    Role: {level.role_name || <em>any</em>} ·{" "}
                    {level.approvers.filter((a) => a.is_active).length} named
                    approver
                    {level.approvers.filter((a) => a.is_active).length === 1
                      ? ""
                      : "s"}
                  </div>
                </div>

                {canEdit && (
                  <div className="apv-rung-actions">
                    <button
                      type="button"
                      className="apv-btn apv-btn-icon"
                      aria-label="Move up"
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <HiChevronUp />
                    </button>
                    <button
                      type="button"
                      className="apv-btn apv-btn-icon"
                      aria-label="Move down"
                      disabled={busy || index === ordered.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <HiChevronDown />
                    </button>
                    <button
                      type="button"
                      className="apv-btn apv-btn-sm"
                      disabled={busy}
                      onClick={() => toggleActive(level)}
                    >
                      {level.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="apv-btn apv-btn-icon"
                      aria-label="Edit"
                      onClick={() =>
                        setEditing({
                          id: level.id,
                          name: level.name,
                          sequence: level.sequence,
                          role: level.role,
                          min_approvals: level.min_approvals,
                          is_active: level.is_active,
                        })
                      }
                    >
                      <HiPencilSquare />
                    </button>
                    <button
                      type="button"
                      className="apv-btn apv-btn-icon apv-btn-danger"
                      aria-label="Delete"
                      onClick={() => setDeleting(level)}
                    >
                      <HiTrash />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {activeId && <PreviewCard workflowId={activeId} company={workflow?.company ?? ""} />}

      {editing && (
        <Modal
          title={editing.id ? "Edit level" : "Add level"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button
                type="button"
                className="apv-btn"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apv-btn apv-btn-primary"
                onClick={save}
                disabled={busy || !editing.name?.trim()}
              >
                {busy ? "Saving…" : "Save level"}
              </button>
            </>
          }
        >
          <div className="apv-form-grid">
            <div className="apv-field">
              <label htmlFor="lvl-name">Level name</label>
              <input
                id="lvl-name"
                className="apv-input"
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Accountant review"
              />
            </div>

            {/* Sequence is NOT asked for: the server appends each new level to
                the end of the ladder, and reordering is done with the up/down
                arrows on the list. Typing a number here only invited a clash
                with the (workflow, sequence) unique constraint. */}

            <div className="apv-field">
              <label htmlFor="lvl-role">Role</label>
              <select
                id="lvl-role"
                className="apv-select"
                value={editing.role ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    role: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">No role — named approvers only</option>
                {roles.data.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <span className="apv-hint">
                Anyone with this role may approve this level.
              </span>
            </div>

            {/* "Minimum approvals" is always 1 — one approver clears a stage —
                and "Escalate after" is gone entirely: nothing auto-approves on
                a timer, which is the behaviour that field implied. */}

            <div className="apv-field is-full">
              <label className="apv-check">
                <input
                  type="checkbox"
                  checked={editing.is_active ?? true}
                  onChange={(e) =>
                    setEditing({ ...editing, is_active: e.target.checked })
                  }
                />
                Active
              </label>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete level"
          message={`Delete level ${deleting.sequence} "${deleting.name}"? Any documents currently waiting at this level will need attention.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/**
 * Resolved ladder preview.
 *
 * The `blocked` flag is the reason this exists: it is the only way to see that
 * a level has nobody able to approve it BEFORE a real document deadlocks there.
 */
function PreviewCard({
  workflowId,
  company,
}: {
  workflowId: number;
  company: Company | "";
}) {
  const [previewCompany, setPreviewCompany] = useState<Company | "">(company);
  const preview = useResource(
    () => approvalService.previewWorkflow(workflowId, previewCompany),
    null as Awaited<ReturnType<typeof approvalService.previewWorkflow>> | null,
    [workflowId, previewCompany],
  );

  const blocked = preview.data?.levels.filter((l) => l.blocked) ?? [];

  return (
    <div className="apv-card">
      <div className="apv-card-head">
        <h3>Live preview</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            className="apv-select"
            value={previewCompany}
            onChange={(e) => setPreviewCompany(e.target.value as Company | "")}
            aria-label="Preview for company"
          >
            <option value="">All companies</option>
            {COMPANY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" className="apv-btn apv-btn-sm" onClick={preview.reload}>
            <HiArrowPath /> Refresh
          </button>
        </div>
      </div>

      {preview.loading && <div className="apv-loading">Resolving approvers…</div>}
      {!preview.loading && preview.error && (
        <ErrorState message={preview.error} onRetry={preview.reload} />
      )}

      {!preview.loading && !preview.error && preview.data && (
        <>
          {blocked.length > 0 && (
            <div className="apv-notice apv-notice-warn">
              <span>
                <strong>
                  {blocked.length} level{blocked.length > 1 ? "s have" : " has"} no
                  eligible approver.
                </strong>{" "}
                A document reaching{" "}
                {blocked.length > 1 ? "these levels" : "this level"} cannot move
                forward. Assign a role or named approvers.
              </span>
            </div>
          )}

          {preview.data.levels.length === 0 ? (
            <EmptyState title="No active levels to preview" />
          ) : (
            <div className="apv-ladder">
              {preview.data.levels.map((l) => (
                <div
                  key={l.sequence}
                  className={`apv-rung${l.blocked ? " is-blocked" : ""}`}
                >
                  <div className="apv-rung-seq">{l.sequence}</div>
                  <div className="apv-rung-main">
                    <div className="apv-rung-name">
                      {l.name}{" "}
                      {l.blocked && (
                        <span className="apv-badge apv-badge-err">
                          No approver
                        </span>
                      )}
                    </div>
                    <div className="apv-rung-meta">
                      {l.role ? `Role: ${l.role} · ` : ""}
                      {l.eligible_count} eligible
                      {l.eligible_approvers.length > 0 && (
                        <> — {l.eligible_approvers.slice(0, 6).join(", ")}
                          {l.eligible_approvers.length > 6 &&
                            ` +${l.eligible_approvers.length - 6} more`}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Approvers
// ===========================================================================

function ApproversTab({
  workflows,
  selectedId,
  onSelect,
  canEdit,
  flash,
}: {
  workflows: ApprovalWorkflow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  canEdit: boolean;
  flash: Flash;
}) {
  const activeId = selectedId ?? workflows[0]?.id ?? null;
  const workflow = workflows.find((w) => w.id === activeId) ?? null;

  const levels = useResource<ApprovalLevel[]>(
    () => (activeId ? approvalService.listLevels(activeId) : Promise.resolve([])),
    [],
    [activeId],
  );
  const users = useResource(() => approvalService.listUsers(), []);

  const [adding, setAdding] = useState<ApprovalLevel | null>(null);
  const [pickUser, setPickUser] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [editingApprover, setEditingApprover] = useState<LevelApprover | null>(null);

  const ordered = useMemo(
    () => [...levels.data].sort((a, b) => a.sequence - b.sequence),
    [levels.data],
  );

  // Hide users already granted on THIS level — (level, user) is unique, so
  // offering them would only produce an integrity error on submit.
  const userOptions = useMemo(() => {
    const taken = new Set((adding?.approvers ?? []).map((a) => a.user));
    return users.data
      .filter((u) => !taken.has(u.id))
      .map((u) => ({ value: u.id, label: u.name || u.username, hint: u.username }));
  }, [users.data, adding]);

  const add = async () => {
    if (!adding || pickUser === "") return;
    setBusy(true);
    try {
      await approvalService.addLevelApprover(adding.id, {
        // Company is INHERITED from the workflow — the admin already chose it
        // there, so asking again invites a mismatch where an approver is
        // scoped to a company the workflow never routes to.
        user: Number(pickUser),
        company: workflow?.company ?? "",
        is_active: true,
      });
      flash("Approver assigned");
      setAdding(null);
      setPickUser("");
      levels.reload();
    } catch (err) {
      flash(messageFrom(err, "Could not assign approver"), "err");
    } finally {
      setBusy(false);
    }
  };

  const saveApprover = async () => {
    if (!editingApprover) return;
    setBusy(true);
    try {
      await approvalService.updateLevelApprover(editingApprover.id, {
        is_active: editingApprover.is_active,
      });
      flash("Approver updated");
      setEditingApprover(null);
      levels.reload();
    } catch (err) {
      flash(messageFrom(err, "Update failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (approverId: number, isActive: boolean) => {
    setBusy(true);
    try {
      await approvalService.updateLevelApprover(approverId, { is_active: !isActive });
      flash(isActive ? "Approver deactivated" : "Approver activated");
      levels.reload();
    } catch (err) {
      flash(messageFrom(err, "Update failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (approverId: number) => {
    setBusy(true);
    try {
      await approvalService.removeLevelApprover(approverId);
      flash("Approver removed");
      levels.reload();
    } catch (err) {
      flash(messageFrom(err, "Remove failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  if (workflows.length === 0) {
    return (
      <div className="apv-card">
        <EmptyState
          title="No workflows yet"
          hint="Create a workflow before assigning approvers."
        />
      </div>
    );
  }

  return (
    <div className="apv-card">
      <div className="apv-toolbar">
        <div className="apv-field" style={{ minWidth: 280 }}>
          <label htmlFor="ap-workflow">Workflow</label>
          <select
            id="ap-workflow"
            className="apv-select"
            value={activeId ?? ""}
            onChange={(e) => onSelect(Number(e.target.value))}
          >
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </div>
        <div className="apv-spacer" />
        <button type="button" className="apv-btn" onClick={levels.reload}>
          <HiArrowPath /> Refresh
        </button>
      </div>

      <div className="apv-notice apv-notice-info">
        <span>
          A level can be satisfied two ways: by <strong>role</strong> (anyone
          holding the level's role) or by a <strong>named approver</strong> listed
          here. Named approvers are additive — they do not replace the role.
        </span>
      </div>

      {levels.loading && <div className="apv-loading">Loading…</div>}
      {!levels.loading && levels.error && (
        <ErrorState message={levels.error} onRetry={levels.reload} />
      )}
      {!levels.loading && !levels.error && ordered.length === 0 && (
        <EmptyState
          title="No levels defined"
          hint={`Add levels to "${workflow?.name ?? "this workflow"}" first.`}
        />
      )}

      {!levels.loading &&
        !levels.error &&
        ordered.map((level) => {
          const list = level.approvers;
          return (
            <div key={level.id} style={{ marginBottom: 18 }}>
              <div className="apv-card-head">
                <h3>
                  Level {level.sequence} — {level.name}{" "}
                  <span className="apv-badge apv-badge-muted">
                    Role: {level.role_name || "any"}
                  </span>
                </h3>
                {canEdit && (
                  <button
                    type="button"
                    className="apv-btn apv-btn-sm"
                    onClick={() => setAdding(level)}
                  >
                    <HiPlusCircle /> Assign user
                  </button>
                )}
              </div>

              {list.length === 0 ? (
                <div
                  className="apv-notice apv-notice-warn"
                  style={{ marginBottom: 0 }}
                >
                  <span>
                    No named approvers.{" "}
                    {level.role_name
                      ? `Only users with the "${level.role_name}" role can approve this level.`
                      : "This level has no role either — nobody can approve it."}
                  </span>
                </div>
              ) : (
                <div className="apv-table-wrap">
                  <table className="apv-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Username</th>
                        <th>Company scope</th>
                        <th>Status</th>
                        <th>Assigned</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((a) => (
                        <tr key={a.id}>
                          <td>{a.user_name || "—"}</td>
                          <td>
                            <code>{a.username}</code>
                          </td>
                          <td>
                            {a.company || (
                              <span className="apv-badge apv-badge-info">All</span>
                            )}
                          </td>
                          <td>
                            <ActivePill active={a.is_active} />
                          </td>
                          <td>{formatDateTime(a.assigned_at)}</td>
                          <td>
                            <div className="apv-row-actions">
                              {canEdit && (
                                <>
                                  <button
                                    type="button"
                                    className="apv-btn apv-btn-icon"
                                    title={a.is_active ? "Deactivate" : "Activate"}
                                    aria-label={
                                      a.is_active
                                        ? `Deactivate ${a.user_name || a.username}`
                                        : `Activate ${a.user_name || a.username}`
                                    }
                                    disabled={busy}
                                    onClick={() => toggle(a.id, a.is_active)}
                                  >
                                    {a.is_active ? <HiEye /> : <HiEyeSlash />}
                                  </button>
                                  <button
                                    type="button"
                                    className="apv-btn apv-btn-icon"
                                    title="Edit"
                                    aria-label={`Edit ${a.user_name || a.username}`}
                                    disabled={busy}
                                    onClick={() => setEditingApprover({ ...a })}
                                  >
                                    <HiPencilSquare />
                                  </button>
                                  <button
                                    type="button"
                                    className="apv-btn apv-btn-icon apv-btn-danger"
                                    title="Remove"
                                    aria-label={`Remove ${a.user_name || a.username}`}
                                    disabled={busy}
                                    onClick={() => remove(a.id)}
                                  >
                                    <HiTrash />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

      {adding && (
        <Modal
          title={`Assign approver — Level ${adding.sequence}`}
          onClose={() => setAdding(null)}
          footer={
            <>
              <button
                type="button"
                className="apv-btn"
                onClick={() => setAdding(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apv-btn apv-btn-primary"
                onClick={add}
                disabled={busy || pickUser === ""}
              >
                {busy ? "Assigning…" : "Assign"}
              </button>
            </>
          }
        >
          <div className="apv-form-grid">
            <div className="apv-field is-full">
              <label htmlFor="ap-user">User</label>
              <SearchSelect
                id="ap-user"
                options={userOptions}
                value={pickUser}
                onChange={(v) => setPickUser(v === "" ? "" : Number(v))}
                placeholder="Select a user…"
                searchPlaceholder="Type a name or username…"
                emptyText="No users match that search"
                loading={users.loading}
              />
              <span className="apv-hint">
                {users.data.length} user{users.data.length === 1 ? "" : "s"}{" "}
                available. Already-assigned users are hidden.
              </span>
              {users.error && (
                <span className="apv-err-text">
                  Could not load users — {users.error}
                </span>
              )}
            </div>

            <div className="apv-field is-full">
              <label>Company scope</label>
              <div className="apv-readonly-value">
                {workflow?.company
                  ? COMPANY_OPTIONS.find((o) => o.value === workflow.company)
                      ?.label ?? workflow.company
                  : "All companies"}
              </div>
              <span className="apv-hint">
                Inherited from the workflow — change it there to change it here.
              </span>
            </div>
          </div>
        </Modal>
      )}

      {editingApprover && (
        <Modal
          title={`Edit approver — ${editingApprover.user_name || editingApprover.username}`}
          onClose={() => setEditingApprover(null)}
          footer={
            <>
              <button
                type="button"
                className="apv-btn"
                onClick={() => setEditingApprover(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apv-btn apv-btn-primary"
                onClick={saveApprover}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="apv-form-grid">
            <div className="apv-field is-full">
              <label>User</label>
              <div className="apv-readonly-value">
                {editingApprover.user_name || editingApprover.username}{" "}
                <code>{editingApprover.username}</code>
              </div>
              <span className="apv-hint">
                To assign a different user, remove this grant and add a new one.
              </span>
            </div>

            <div className="apv-field is-full">
              <label>Company scope</label>
              <div className="apv-readonly-value">
                {editingApprover.company || "All companies"}
              </div>
              <span className="apv-hint">Inherited from the workflow.</span>
            </div>

            <div className="apv-field is-full">
              <label className="apv-check">
                <input
                  type="checkbox"
                  checked={editingApprover.is_active}
                  onChange={(e) =>
                    setEditingApprover({
                      ...editingApprover,
                      is_active: e.target.checked,
                    })
                  }
                />
                Active — an inactive approver cannot decide at this level
              </label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ===========================================================================
// Requests
// ===========================================================================

function RequestsTab({ flash }: { flash: Flash }) {
  const [status, setStatus] = useState<RequestStatus | "">("");
  const [company, setCompany] = useState<Company | "">("");
  const [docType, setDocType] = useState<DocumentType | "">("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const requests = useResource(
    () =>
      approvalService.listRequests({
        status: status || undefined,
        company: company || undefined,
        document_type: docType || undefined,
        mine: onlyMine || undefined,
      }),
    { results: [] as ApprovalRequest[], count: 0 },
    [status, company, docType, onlyMine],
  );

  return (
    <div className="apv-card">
      <div className="apv-toolbar">
        <select
          className="apv-select"
          value={status}
          onChange={(e) => setStatus(e.target.value as RequestStatus | "")}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="DRAFT">Draft</option>
        </select>

        <select
          className="apv-select"
          value={company}
          onChange={(e) => setCompany(e.target.value as Company | "")}
          aria-label="Company"
        >
          <option value="">All companies</option>
          {COMPANY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          className="apv-select"
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocumentType | "")}
          aria-label="Document type"
        >
          <option value="">All document types</option>
          {DOCUMENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label className="apv-check">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
          />
          Submitted by me
        </label>

        <div className="apv-spacer" />
        <button type="button" className="apv-btn" onClick={requests.reload}>
          <HiArrowPath /> Refresh
        </button>
      </div>

      <div className="apv-table-wrap">
        <table className="apv-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Type</th>
              <th>Company</th>
              <th className="apv-num">Amount</th>
              <th>Level</th>
              <th>Status</th>
              <th>Submitted by</th>
              <th>Submitted</th>
              <th>Age</th>
              <th />
            </tr>
          </thead>
          <AsyncBoundaryTable
            loading={requests.loading}
            error={requests.error}
            isEmpty={requests.data.results.length === 0}
            onRetry={requests.reload}
            cols={10}
            emptyTitle="No approval requests"
            emptyHint="Requests appear here once a payment or deposit is submitted for approval."
          >
            <tbody>
              {requests.data.results.map((r) => (
                <tr key={r.id}>
                  <td>
                    <code>{r.document_number || `#${r.id}`}</code>
                  </td>
                  <td>{r.document_type}</td>
                  <td>{r.company}</td>
                  <td className="apv-num">{formatMoney(r.amount)}</td>
                  <td>{r.level_label}</td>
                  <td>
                    <StatusPill status={r.status} label={r.status_display} />
                  </td>
                  <td>{r.submitted_by_name || "—"}</td>
                  <td>{formatDateTime(r.submitted_at)}</td>
                  <td>
                    {r.status === "PENDING"
                      ? formatAge(r.level_entered_at || r.submitted_at)
                      : "—"}
                  </td>
                  <td>
                    <div className="apv-row-actions">
                      <button
                        type="button"
                        className="apv-btn apv-btn-sm"
                        onClick={() => setDetailId(r.id)}
                      >
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </AsyncBoundaryTable>
        </table>
      </div>

      {requests.data.count > requests.data.results.length && (
        <div className="apv-sub" style={{ marginTop: 10 }}>
          Showing {requests.data.results.length} of {requests.data.count} requests.
          Narrow the filters to see more.
        </div>
      )}

      {detailId !== null && (
        <RequestDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onActed={() => {
            setDetailId(null);
            requests.reload();
          }}
          flash={flash}
        />
      )}
    </div>
  );
}

function RequestDetailModal({
  id,
  onClose,
  onActed,
  flash,
}: {
  id: number;
  onClose: () => void;
  onActed: () => void;
  flash: Flash;
}) {
  const detail = useResource(
    () => approvalService.getRequest(id),
    null as Awaited<ReturnType<typeof approvalService.getRequest>> | null,
    [id],
  );
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRemarksError, setShowRemarksError] = useState(false);

  const req = detail.data;
  const canAct = !!req?.can_act && req?.status === "PENDING";

  const act = async (decision: "APPROVE" | "REJECT") => {
    // The server enforces this too; catching it here gives a field-level
    // message instead of a generic 400.
    if (decision === "REJECT" && !remarks.trim()) {
      setShowRemarksError(true);
      return;
    }
    setBusy(true);
    try {
      await approvalService.act(id, decision, remarks.trim());
      flash(decision === "APPROVE" ? "Request approved" : "Request rejected");
      onActed();
    } catch (err) {
      flash(messageFrom(err, "Action failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={
        req ? `Request ${req.document_number || `#${req.id}`}` : "Approval request"
      }
      onClose={onClose}
      wide
      footer={
        canAct ? (
          <>
            <button type="button" className="apv-btn" onClick={onClose} disabled={busy}>
              Close
            </button>
            <button
              type="button"
              className="apv-btn apv-btn-danger"
              onClick={() => act("REJECT")}
              disabled={busy}
            >
              <HiXCircle /> Reject
            </button>
            <button
              type="button"
              className="apv-btn apv-btn-ok"
              onClick={() => act("APPROVE")}
              disabled={busy}
            >
              <HiCheckCircle /> Approve
            </button>
          </>
        ) : (
          <button type="button" className="apv-btn" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {detail.loading && <div className="apv-loading">Loading request…</div>}
      {!detail.loading && detail.error && (
        <ErrorState message={detail.error} onRetry={detail.reload} />
      )}

      {!detail.loading && !detail.error && req && (
        <>
          <div className="apv-detail-grid" style={{ marginBottom: 18 }}>
            <Detail label="Status">
              <StatusPill status={req.status} label={req.status_display} />
            </Detail>
            <Detail label="Stage">{req.level_label}</Detail>
            <Detail label="Amount">{formatMoney(req.amount)}</Detail>
            <Detail label="Company">{req.company}</Detail>
            <Detail label="Document type">{req.document_type}</Detail>
            <Detail label="Workflow">{req.workflow_code}</Detail>
            <Detail label="Submitted by">{req.submitted_by_name || "—"}</Detail>
            <Detail label="Submitted">{formatDateTime(req.submitted_at)}</Detail>
            {req.round_number > 1 && (
              <Detail label="Round">
                {req.round_number} (resubmitted)
              </Detail>
            )}
          </div>

          <h3 style={{ fontSize: 14, margin: "0 0 12px" }}>History</h3>
          {req.actions.length === 0 ? (
            <EmptyState title="No actions yet" hint="Nobody has acted on this request." />
          ) : (
            <div className="apv-timeline">
              {[...req.actions]
                .sort((a, b) => a.sequence - b.sequence)
                .map((a, i, arr) => {
                  const tone = a.action.includes("REJECT")
                    ? "is-err"
                    : a.action.includes("APPROVE")
                      ? "is-ok"
                      : "";
                  return (
                    <div className="apv-tl-item" key={a.id}>
                      <div className="apv-tl-rail">
                        <div className={`apv-tl-dot ${tone}`} />
                        {i < arr.length - 1 && <div className="apv-tl-line" />}
                      </div>
                      <div className="apv-tl-body">
                        <div className="apv-tl-title">
                          {a.action_display}
                          {a.level_name ? ` — ${a.level_name}` : ""}
                        </div>
                        <div className="apv-tl-meta">
                          {a.approver_username || "system"}
                          {a.approver_role ? ` (${a.approver_role})` : ""} ·{" "}
                          {formatDateTime(a.acted_at)}
                          {a.round_number > 1 ? ` · round ${a.round_number}` : ""}
                        </div>
                        {a.remarks && (
                          <div className="apv-tl-remarks">{a.remarks}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {canAct && (
            <div className="apv-field is-full" style={{ marginTop: 18 }}>
              <label htmlFor="act-remarks">Remarks</label>
              <textarea
                id="act-remarks"
                className="apv-textarea"
                value={remarks}
                onChange={(e) => {
                  setRemarks(e.target.value);
                  if (e.target.value.trim()) setShowRemarksError(false);
                }}
                placeholder="Optional when approving. Required when rejecting."
              />
              {showRemarksError && (
                <span className="apv-err-text">
                  Remarks are mandatory when rejecting.
                </span>
              )}
            </div>
          )}

          {!canAct && req.status === "PENDING" && (
            <div className="apv-notice apv-notice-info" style={{ marginTop: 18 }}>
              <span>
                This request is waiting at {req.level_label}, but you are not an
                eligible approver for that level.
              </span>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="apv-detail-label">{label}</div>
      <div className="apv-detail-value">{children}</div>
    </div>
  );
}

// ===========================================================================
// Masters
// ===========================================================================

const EMPTY_PERSON: CollectionPersonPayload = {
  name: "",
  // Blank = selectable in every company; the dialog explains this.
  company: "",
  phone: "",
  // Left blank so the server generates it from the name.
  code: "",
  is_active: true,
};

const EMPTY_MAPPING: CompanyMappingPayload = {
  company: "OIL",
  display_name: "",
  company_db: "",
  hana_schema: "",
  default_bpl_id: null,
  cash_gl_account: "",
  is_active: true,
};

function MastersTab({ canEdit, flash }: { canEdit: boolean; flash: Flash }) {
  // Company filter for the list below. Declared before the resource so it can
  // be passed as a dependency.
  const [personCompany, setPersonCompany] = useState<Company | "">("");

  const companies = useResource(() => approvalService.listCompanyMappings(), []);
  // The ADMIN endpoint, not the picker feed — it returns inactive rows too,
  // so a deactivated person can be seen and switched back on.
  const persons = useResource(
    () => approvalService.adminListCollectionPersons(personCompany || undefined),
    [],
    [personCompany],
  );

  const [editing, setEditing] = useState<
    (CompanyMappingPayload & { id?: number }) | null
  >(null);
  const [deleting, setDeleting] = useState<CompanyMapping | null>(null);
  const [editingPerson, setEditingPerson] = useState<
    (CollectionPersonPayload & { id?: number }) | null
  >(null);
  const [deletingPerson, setDeletingPerson] = useState<CollectionPerson | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  // ---- Collection persons ----------------------------------------------
  const personValid = !!editingPerson?.name?.trim();

  const savePerson = async () => {
    if (!editingPerson) return;
    setBusy(true);
    try {
      if (editingPerson.id) {
        const { id, ...payload } = editingPerson;
        await approvalService.updateCollectionPerson(id, payload);
        flash("Person updated");
      } else {
        await approvalService.createCollectionPerson(editingPerson);
        flash("Person created");
      }
      setEditingPerson(null);
      persons.reload();
    } catch (err) {
      flash(messageFrom(err, "Save failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const togglePerson = async (person: CollectionPerson) => {
    setBusy(true);
    try {
      await approvalService.updateCollectionPerson(person.id, {
        is_active: !person.is_active,
      });
      flash(person.is_active ? "Deactivated" : "Activated");
      persons.reload();
    } catch (err) {
      flash(messageFrom(err, "Update failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const confirmDeletePerson = async () => {
    if (!deletingPerson) return;
    setBusy(true);
    try {
      await approvalService.deleteCollectionPerson(deletingPerson.id);
      flash("Person deleted");
      setDeletingPerson(null);
      persons.reload();
    } catch (err) {
      flash(messageFrom(err, "Delete failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const saveMapping = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) {
        const { id, ...payload } = editing;
        await approvalService.updateCompanyMapping(id, payload);
        flash("Mapping updated");
      } else {
        await approvalService.createCompanyMapping(editing);
        flash("Mapping created");
      }
      setEditing(null);
      companies.reload();
    } catch (err) {
      flash(messageFrom(err, "Save failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteMapping = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await approvalService.deleteCompanyMapping(deleting.id);
      flash("Mapping deleted");
      setDeleting(null);
      companies.reload();
    } catch (err) {
      flash(messageFrom(err, "Delete failed"), "err");
    } finally {
      setBusy(false);
    }
  };

  const mappingValid =
    !!editing?.company &&
    !!editing?.display_name?.trim() &&
    !!editing?.company_db?.trim() &&
    !!editing?.hana_schema?.trim();

  return (
    <>
      <div className="apv-card">
        <div className="apv-card-head">
          <h3>Company mapping</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="apv-btn apv-btn-sm" onClick={companies.reload}>
              <HiArrowPath /> Refresh
            </button>
            {canEdit && (
              <button
                type="button"
                className="apv-btn apv-btn-sm apv-btn-primary"
                onClick={() => setEditing({ ...EMPTY_MAPPING })}
              >
                <HiPlusCircle /> Add mapping
              </button>
            )}
          </div>
        </div>
        <div className="apv-notice apv-notice-info">
          <span>
            Maps each company to its SAP database and HANA schema. Nothing in
            the payments module works until a company is mapped — the company
            pickers stay empty and no document can post to SAP.
          </span>
        </div>
        <div className="apv-table-wrap">
          <table className="apv-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Display name</th>
                <th>SAP database</th>
                <th>HANA schema</th>
                <th>Cash G/L</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <AsyncBoundaryTable
              loading={companies.loading}
              error={companies.error}
              isEmpty={companies.data.length === 0}
              onRetry={companies.reload}
              cols={6}
              emptyTitle="No company mappings"
              emptyHint="Add one to enable company selection across the payments module."
              emptyAction={
                canEdit ? (
                  <button
                    type="button"
                    className="apv-btn apv-btn-primary"
                    onClick={() => setEditing({ ...EMPTY_MAPPING })}
                  >
                    <HiPlusCircle /> Add mapping
                  </button>
                ) : undefined
              }
            >
              <tbody>
                {companies.data.map((c) => (
                  <tr key={c.id}>
                    <td>{c.company}</td>
                    <td>{c.display_name}</td>
                    <td>
                      <code>{c.company_db}</code>
                    </td>
                    <td>
                      <code>{c.hana_schema}</code>
                    </td>
                    <td>
                      {c.cash_gl_account ? (
                        <code>{c.cash_gl_account}</code>
                      ) : (
                        // Cash cannot post without it, so an empty value is
                        // flagged rather than shown as a blank cell.
                        <span className="apv-pill err">Not set</span>
                      )}
                    </td>
                    <td>
                      <ActivePill active={c.is_active} />
                    </td>
                    <td>
                      <div className="apv-row-actions">
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon"
                              title={c.is_active ? "Deactivate" : "Activate"}
                              aria-label={`Toggle ${c.company}`}
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await approvalService.updateCompanyMapping(c.id, {
                                    is_active: !c.is_active,
                                  });
                                  flash(c.is_active ? "Deactivated" : "Activated");
                                  companies.reload();
                                } catch (err) {
                                  flash(messageFrom(err, "Update failed"), "err");
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              {c.is_active ? <HiEye /> : <HiEyeSlash />}
                            </button>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon"
                              title="Edit"
                              aria-label={`Edit ${c.company}`}
                              onClick={() => setEditing({ ...c })}
                            >
                              <HiPencilSquare />
                            </button>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon apv-btn-danger"
                              title="Delete"
                              aria-label={`Delete ${c.company}`}
                              onClick={() => setDeleting(c)}
                            >
                              <HiTrash />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </AsyncBoundaryTable>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing.id ? "Edit company mapping" : "Add company mapping"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button
                type="button"
                className="apv-btn"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apv-btn apv-btn-primary"
                onClick={saveMapping}
                disabled={busy || !mappingValid}
              >
                {busy ? "Saving…" : "Save mapping"}
              </button>
            </>
          }
        >
          <div className="apv-form-grid">
            <div className="apv-field">
              <label htmlFor="cm-company">Company</label>
              <select
                id="cm-company"
                className="apv-select"
                value={editing.company ?? "OIL"}
                onChange={(e) =>
                  setEditing({ ...editing, company: e.target.value as Company })
                }
              >
                {COMPANY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="apv-hint">One mapping per company.</span>
            </div>

            <div className="apv-field">
              <label htmlFor="cm-display">Display name</label>
              <input
                id="cm-display"
                className="apv-input"
                value={editing.display_name ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, display_name: e.target.value })
                }
                placeholder="Jivo Oil"
              />
            </div>

            <div className="apv-field">
              <label htmlFor="cm-db">SAP company database</label>
              <input
                id="cm-db"
                className="apv-input"
                value={editing.company_db ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, company_db: e.target.value })
                }
                placeholder="TEST_OIL_15122025"
              />
              <span className="apv-hint">
                Exact SAP database name — used for every Service Layer call.
              </span>
            </div>

            <div className="apv-field">
              <label htmlFor="cm-schema">HANA schema</label>
              <input
                id="cm-schema"
                className="apv-input"
                value={editing.hana_schema ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, hana_schema: e.target.value })
                }
                placeholder="TEST_OIL_15122025"
              />
              <span className="apv-hint">
                Usually identical to the database name.
              </span>
            </div>

            <div className="apv-field">
              <label htmlFor="cm-cash-gl">Cash G/L account</label>
              <input
                id="cm-cash-gl"
                className="apv-input"
                value={editing.cash_gl_account ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, cash_gl_account: e.target.value })
                }
                placeholder="1105003"
              />
              <span className="apv-hint">
                Where cash receipts post in SAP. Typed rather than picked:
                every other tender lands in a bank account SAP publishes, but a
                cash drawer is not a bank and has no such record.
              </span>
            </div>

            <div className="apv-field">
              <label htmlFor="cm-bpl">Default branch (BPL ID)</label>
              <input
                id="cm-bpl"
                className="apv-input"
                type="number"
                value={editing.default_bpl_id ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    default_bpl_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="Optional"
              />
            </div>

            <div className="apv-field is-full">
              <label className="apv-check">
                <input
                  type="checkbox"
                  checked={editing.is_active ?? true}
                  onChange={(e) =>
                    setEditing({ ...editing, is_active: e.target.checked })
                  }
                />
                Active — inactive companies disappear from every picker
              </label>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete company mapping"
          message={`Delete the mapping for ${deleting.company}? Payments and deposits for this company will stop working until it is recreated. Existing documents are not affected.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={confirmDeleteMapping}
          onCancel={() => setDeleting(null)}
        />
      )}

      {/* ── Payment method mapping ────────────────────────────────────
          Sits between the company mapping (which supplies the cash G/L) and
          collection persons, because it depends on the company being mapped
          first — its bank list comes from that company's SAP database. */}
      <ConfigTab canEdit={canEdit} flash={flash} />

      {/* ── Collection persons ────────────────────────────────────────── */}
      <div className="apv-card">
        <div className="apv-card-head">
          <h3>Collection persons</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="apv-select"
              value={personCompany}
              onChange={(e) => setPersonCompany(e.target.value as Company | "")}
              aria-label="Filter collection persons by company"
            >
              <option value="">All companies</option>
              {COMPANY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" className="apv-btn apv-btn-sm" onClick={persons.reload}>
              <HiArrowPath /> Refresh
            </button>
            {canEdit && (
              <button
                type="button"
                className="apv-btn apv-btn-sm apv-btn-primary"
                onClick={() =>
                  setEditingPerson({ ...EMPTY_PERSON, company: personCompany })
                }
              >
                <HiPlusCircle /> Add person
              </button>
            )}
          </div>
        </div>
        <div className="apv-notice apv-notice-info">
          <span>
            The “Received From” people on a payment receipt. Scope one to a
            company so it only appears for that company&rsquo;s payments, or
            leave it blank to offer it everywhere.
          </span>
        </div>
        <div className="apv-table-wrap">
          <table className="apv-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Company</th>
                <th>Phone</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <AsyncBoundaryTable
              loading={persons.loading}
              error={persons.error}
              isEmpty={persons.data.length === 0}
              onRetry={persons.reload}
              cols={6}
              emptyTitle="No collection persons"
              emptyHint="Add the people who collect payments on a party's behalf."
              emptyAction={
                canEdit ? (
                  <button
                    type="button"
                    className="apv-btn apv-btn-primary"
                    onClick={() =>
                      setEditingPerson({ ...EMPTY_PERSON, company: personCompany })
                    }
                  >
                    <HiPlusCircle /> Add person
                  </button>
                ) : undefined
              }
            >
              <tbody>
                {persons.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <code>{p.code}</code>
                    </td>
                    <td>{p.name}</td>
                    <td>
                      {p.company || (
                        <span className="apv-badge apv-badge-info">All</span>
                      )}
                    </td>
                    <td>{p.phone || "—"}</td>
                    <td>
                      <ActivePill active={p.is_active} />
                    </td>
                    <td>
                      <div className="apv-row-actions">
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon"
                              title={p.is_active ? "Deactivate" : "Activate"}
                              aria-label={`Toggle ${p.name}`}
                              disabled={busy}
                              onClick={() => togglePerson(p)}
                            >
                              {p.is_active ? <HiEye /> : <HiEyeSlash />}
                            </button>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon"
                              title="Edit"
                              aria-label={`Edit ${p.name}`}
                              onClick={() => setEditingPerson({ ...p })}
                            >
                              <HiPencilSquare />
                            </button>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon apv-btn-danger"
                              title="Delete"
                              aria-label={`Delete ${p.name}`}
                              onClick={() => setDeletingPerson(p)}
                            >
                              <HiTrash />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </AsyncBoundaryTable>
          </table>
        </div>
      </div>

      {/* ── Collection person dialog ──────────────────────────────────── */}
      {editingPerson && (
        <Modal
          title={editingPerson.id ? "Edit collection person" : "Add collection person"}
          onClose={() => setEditingPerson(null)}
          footer={
            <>
              <button
                type="button"
                className="apv-btn"
                onClick={() => setEditingPerson(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apv-btn apv-btn-primary"
                onClick={savePerson}
                disabled={busy || !personValid}
              >
                {busy ? "Saving…" : "Save person"}
              </button>
            </>
          }
        >
          <div className="apv-form-grid">
            <div className="apv-field is-full">
              <label htmlFor="cp-name">Name</label>
              <input
                id="cp-name"
                className="apv-input"
                value={editingPerson.name ?? ""}
                onChange={(e) =>
                  setEditingPerson({ ...editingPerson, name: e.target.value })
                }
                placeholder="Navneet"
              />
            </div>

            <div className="apv-field">
              <label htmlFor="cp-company">Company</label>
              <select
                id="cp-company"
                className="apv-select"
                value={editingPerson.company ?? ""}
                onChange={(e) =>
                  setEditingPerson({
                    ...editingPerson,
                    company: e.target.value as Company | "",
                  })
                }
              >
                <option value="">All companies</option>
                {COMPANY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="apv-hint">
                The same person can exist separately per company.
              </span>
            </div>

            <div className="apv-field">
              <label htmlFor="cp-phone">Phone</label>
              <input
                id="cp-phone"
                className="apv-input"
                value={editingPerson.phone ?? ""}
                onChange={(e) =>
                  setEditingPerson({ ...editingPerson, phone: e.target.value })
                }
                placeholder="Optional"
              />
            </div>

            <div className="apv-field is-full">
              <label htmlFor="cp-code">Code</label>
              <input
                id="cp-code"
                className="apv-input"
                value={editingPerson.code ?? ""}
                onChange={(e) =>
                  setEditingPerson({
                    ...editingPerson,
                    code: e.target.value.toUpperCase(),
                  })
                }
                placeholder="Leave blank to generate from the name"
              />
              <span className="apv-hint">
                Internal identifier, unique across all companies. Generated
                automatically when left blank.
              </span>
            </div>

            <div className="apv-field is-full">
              <label className="apv-check">
                <input
                  type="checkbox"
                  checked={editingPerson.is_active ?? true}
                  onChange={(e) =>
                    setEditingPerson({
                      ...editingPerson,
                      is_active: e.target.checked,
                    })
                  }
                />
                Active — inactive people disappear from the “Received From” picker
              </label>
            </div>
          </div>
        </Modal>
      )}

      {deletingPerson && (
        <ConfirmDialog
          title="Delete collection person"
          message={`Delete "${deletingPerson.name}"? Receipts that reference them are not affected, but they can no longer be selected. Deactivating is usually safer.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={confirmDeletePerson}
          onCancel={() => setDeletingPerson(null)}
        />
      )}
    </>
  );
}
