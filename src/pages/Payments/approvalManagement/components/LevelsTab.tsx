import {
  HiChevronDown,
  HiChevronUp,
  HiPencilSquare,
  HiPlusCircle,
} from "react-icons/hi2";

import type { ApprovalWorkflow } from "../../../../services/approvalService";
import { ConfirmDialog, EmptyState, ErrorState, Modal } from "../../ApprovalUI";
import { Badge } from "@/components/ui/badge";
import type { Flash } from "../types";
import { useLevelsTab } from "../useLevelsTab";
import PreviewCard from "./PreviewCard";

export default function LevelsTab({
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
  const {
    activeId,
    workflow,
    levels,
    roles,
    editing,
    setEditing,
    deleting,
    setDeleting,
    busy,
    ordered,
    save,
    confirmDelete,
    move,
    toggleActive,
  } = useLevelsTab(workflows, selectedId, flash, onWorkflowsChanged);

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
          <div className="apv-field apv-field-wf">
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
                      <Badge tone="neutral">Disabled</Badge>
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
                    {/* Delete removed deliberately — see the Workflows tab.
                        Deleting a level renumbers the ladder under documents
                        already waiting on it: six payment approvals were
                        stranded exactly this way, matched to a position that
                        no longer existed and shown to nobody. Untick Active
                        to retire a level safely. */}
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
                {roles.map((r) => (
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
