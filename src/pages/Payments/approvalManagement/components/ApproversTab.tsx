import {
  HiArrowPath,
  HiEye,
  HiEyeSlash,
  HiPencilSquare,
  HiPlusCircle,
  HiTrash,
} from "react-icons/hi2";

import {
  COMPANY_OPTIONS,
  type ApprovalWorkflow,
} from "../../../../services/approvalService";
import {
  ActivePill,
  EmptyState,
  ErrorState,
  Modal,
  SearchSelect,
} from "../../ApprovalUI";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "../../approvalFormat";
import type { Flash } from "../types";
import { useApproversTab } from "../useApproversTab";

export default function ApproversTab({
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
  const {
    activeId,
    workflow,
    levels,
    users,
    ordered,
    userOptions,
    adding,
    setAdding,
    pickUser,
    setPickUser,
    editingApprover,
    setEditingApprover,
    busy,
    add,
    saveApprover,
    toggle,
    remove,
  } = useApproversTab(workflows, selectedId, flash);

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
        <div className="apv-field apv-field-wf">
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
            <div key={level.id} className="apv-level-group">
              <div className="apv-card-head">
                <h3>
                  Level {level.sequence} — {level.name}{" "}
                  <Badge tone="neutral">
                    Role: {level.role_name || "any"}
                  </Badge>
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
                <div className="apv-notice apv-notice-warn apv-notice-tight">
                  <span>
                    No named approvers.{" "}
                    {level.role_name
                      ? `Only users with the "${level.role_name}" role can approve this level.`
                      : "This level has no role either — nobody can approve it."}
                  </span>
                </div>
              ) : (
                <div className="apv-table-wrap">
                  <Table density="compact">
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Company scope</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assigned</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{a.user_name || "—"}</TableCell>
                          <TableCell>
                            <code>{a.username}</code>
                          </TableCell>
                          <TableCell>
                            {a.company || (
                              <Badge tone="info">All</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <ActivePill active={a.is_active} />
                          </TableCell>
                          <TableCell>{formatDateTime(a.assigned_at)}</TableCell>
                          <TableCell>
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
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
