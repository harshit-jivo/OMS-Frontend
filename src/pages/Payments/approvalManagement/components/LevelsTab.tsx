/**
 * Levels — the approval ladder a document climbs, per workflow.
 */
import {
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlinePencilSquare,
  HiOutlinePlusCircle,
} from "react-icons/hi2";

import type { ApprovalWorkflow } from "../../../../services/approvalService";
import { ConfirmDialog, EmptyState, ErrorState, Modal } from "../../ApprovalUI";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Card, Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
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
      <Card>
        <EmptyState
          title="No workflows yet"
          hint="Create a workflow on the Workflows tab before adding levels."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <Field label="Workflow" className="max-w-[320px] flex-1">
            {(control) => (
              <Select
                {...control}
                value={activeId ?? ""}
                onChange={(e) => onSelect(Number(e.target.value))}
              >
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {canEdit && activeId && (
            <Button
              variant="primary"
              onClick={() =>
                setEditing({
                  name: "",
                  sequence: ordered.length ? Math.max(...ordered.map((l) => l.sequence)) + 1 : 1,
                  role: null,
                  min_approvals: 1,
                  is_active: true,
                })
              }
            >
              <HiOutlinePlusCircle aria-hidden="true" /> Add level
            </Button>
          )}
        </div>

        {workflow && !workflow.is_active && (
          <Notice tone="hold" className="mb-3">
            This workflow is inactive — documents will not route through it until it is
            activated.
          </Notice>
        )}

        {levels.loading && (
          <div className="space-y-2" aria-label="Loading levels">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
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
          <ol className="m-0 list-none space-y-1.5 p-0">
            {ordered.map((level, index) => {
              const named = level.approvers.filter((a) => a.is_active).length;
              return (
                <li
                  key={level.id}
                  className={
                    "flex flex-wrap items-center gap-3 rounded-sm border border-line p-2.5 " +
                    (level.is_active ? "bg-surface" : "bg-surface-strong opacity-70")
                  }
                >
                  {/* The LADDER POSITION, not the stored sequence — documents
                      advance by position, so showing the raw column would
                      mislead whenever the numbering has gaps. */}
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                    {index + 1}
                  </span>

                  <span className="min-w-[160px] flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink">
                      {level.name}
                      {!level.is_active && <Badge tone="neutral">Disabled</Badge>}
                    </span>
                    <span className="block text-[11.5px] text-subtle">
                      Role: {level.role_name || <em>any</em>} · {named} named approver
                      {named === 1 ? "" : "s"}
                    </span>
                  </span>

                  {canEdit && (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={"Move " + level.name + " up"}
                        disabled={busy || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <HiOutlineChevronUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={"Move " + level.name + " down"}
                        disabled={busy || index === ordered.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <HiOutlineChevronDown />
                      </Button>
                      <Button size="sm" disabled={busy} onClick={() => toggleActive(level)}>
                        {level.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={"Edit " + level.name}
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
                        <HiOutlinePencilSquare />
                      </Button>
                      {/* Delete removed deliberately — see the Workflows tab.
                          Deleting a level renumbers the ladder under documents
                          already waiting on it: six payment approvals were
                          stranded exactly this way, matched to a position that
                          no longer existed and shown to nobody. Untick Active
                          to retire a level safely. */}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {activeId && <PreviewCard workflowId={activeId} company={workflow?.company ?? ""} />}

      {editing && (
        <Modal
          title={editing.id ? "Edit level" : "Add level"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={save}
                disabled={busy || !editing.name?.trim()}
                title={editing.name?.trim() ? undefined : "Give the level a name first."}
              >
                {busy ? "Saving…" : "Save level"}
              </Button>
            </>
          }
        >
          <FormGrid>
            <Field label="Level name" required className="sm:col-span-2">
              {(control) => (
                <Input
                  {...control}
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Accountant review"
                  autoFocus
                />
              )}
            </Field>

            {/* Sequence is NOT asked for: the server appends each new level to
                the end of the ladder, and reordering is done with the up/down
                arrows on the list. Typing a number here only invited a clash
                with the (workflow, sequence) unique constraint. */}

            <Field
              label="Role"
              className="sm:col-span-2"
              hint="Anyone with this role may approve this level."
            >
              {(control) => (
                <Select
                  {...control}
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
                </Select>
              )}
            </Field>

            {/* "Minimum approvals" is always 1 — one approver clears a stage —
                and "Escalate after" is gone entirely: nothing auto-approves on
                a timer, which is the behaviour that field implied. */}

            <div className="sm:col-span-2">
              <Checkbox
                label="Active"
                hint="An inactive level is skipped when a document climbs the ladder."
                checked={editing.is_active ?? true}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
            </div>
          </FormGrid>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete level"
          message={
            'Delete level ' +
            deleting.sequence +
            ' "' +
            deleting.name +
            '"? Any documents currently waiting at this level will need attention.'
          }
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
