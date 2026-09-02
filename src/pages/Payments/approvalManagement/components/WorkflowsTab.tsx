import {
  HiArrowPath,
  HiArrowDownTray,
  HiEye,
  HiEyeSlash,
  HiPencilSquare,
  HiPlusCircle,
} from "react-icons/hi2";

import {
  COMPANY_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  type ApprovalWorkflow,
  type Company,
  type DocumentType,
} from "../../../../services/approvalService";
import { ActivePill, ConfirmDialog, Modal } from "../../ApprovalUI";
import { formatDateTime } from "../../approvalFormat";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Flash, Resource } from "../types";
import { EMPTY_WORKFLOW, useWorkflowsTab } from "../useWorkflowsTab";
import AsyncBoundaryTable from "./AsyncBoundaryTable";

export default function WorkflowsTab({
  resource,
  canEdit,
  flash,
  onOpenLevels,
  onOpenApprovers,
}: {
  resource: Resource<ApprovalWorkflow[]>;
  canEdit: boolean;
  flash: Flash;
  onOpenLevels: (id: number) => void;
  onOpenApprovers: (id: number) => void;
}) {
  const {
    search,
    setSearch,
    docFilter,
    setDocFilter,
    companyFilter,
    setCompanyFilter,
    editing,
    setEditing,
    deleting,
    setDeleting,
    busy,
    visible,
    valid,
    save,
    confirmDelete,
    toggleActive,
    exportCsv,
  } = useWorkflowsTab(resource, flash);

  return (
    <div className="apv-card">
      <div className="apv-toolbar">
        <input
          className="apv-input apv-search"
          placeholder="Search name or code…"
          aria-label="Search workflows by name or code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="apv-select"
          aria-label="Filter by document type"
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
          aria-label="Filter by company"
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
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Document type</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="apv-num">Levels</TableHead>
              <TableHead>Rules</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
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
            <TableBody>
              {visible.map((w) => {
                const activeLevels = w.levels.filter((l) => l.is_active).length;
                return (
                  <TableRow key={w.id}>
                    <TableCell>
                      <code>{w.code}</code>
                    </TableCell>
                    <TableCell>{w.name}</TableCell>
                    <TableCell>{w.document_type}</TableCell>
                    <TableCell>{w.company || <Badge tone="info">All</Badge>}</TableCell>
                    <TableCell className="apv-num">
                      {activeLevels === 0 ? (
                        <Badge tone="bad">None</Badge>
                      ) : (
                        activeLevels
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone="neutral"
                        title="A rejected document restarts from level 1"
                      >
                        {w.restart_on_reject ? "Restart" : "Resume"}
                      </Badge>{" "}
                      {w.forbid_self_approval && (
                        <Badge
                          tone="neutral"
                          title="The submitter may not approve their own document"
                        >
                          No self-approve
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ActivePill active={w.is_active} />
                    </TableCell>
                    <TableCell>{formatDateTime(w.created_at)}</TableCell>
                    <TableCell>
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
                            {/* Delete removed deliberately. A workflow is the
                                ladder in-flight documents are standing on —
                                removing it (or its levels) strands every
                                pending request at a rung that no longer
                                exists, invisible to every approver. Set the
                                workflow Inactive instead: new documents stop
                                using it while the ones already in it finish. */}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </AsyncBoundaryTable>
        </Table>
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
