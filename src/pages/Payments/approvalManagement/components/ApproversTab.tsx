/**
 * Approvers — who, by name, may decide each level of a workflow.
 */
import { useState } from "react";
import {
  HiOutlineArrowPath,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlinePencilSquare,
  HiOutlinePlusCircle,
  HiOutlineTrash,
} from "react-icons/hi2";

import {
  COMPANY_OPTIONS,
  type ApprovalWorkflow,
  type LevelApprover,
} from "../../../../services/approvalService";
import {
  ActivePill,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  SearchSelect,
} from "../../ApprovalUI";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormGrid, Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
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

/** A read-only value inside a form, where a field would imply it is editable. */
function ReadOnlyValue({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 rounded-sm border border-line bg-surface px-3 py-2 text-[13px] text-body">
      {children}
    </p>
  );
}

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

  /*
   * Removing an approver used to happen on the click, with no question asked.
   * It is the one action here that can leave a level with nobody able to
   * decide it — which does not fail loudly, it just silently strands the next
   * document that reaches that level. So it asks first, and says whether the
   * level has a role to fall back on.
   */
  const [confirmRemove, setConfirmRemove] = useState<{
    approver: LevelApprover;
    levelName: string;
    roleName: string | null;
    othersLeft: number;
  } | null>(null);

  if (workflows.length === 0) {
    return (
      <Card>
        <EmptyState title="No workflows yet" hint="Create a workflow before assigning approvers." />
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
          <Button onClick={levels.reload}>
            <HiOutlineArrowPath aria-hidden="true" /> Refresh
          </Button>
        </div>

        <Notice tone="info">
          A level can be satisfied two ways: by <strong className="font-semibold">role</strong>{" "}
          (anyone holding the level&apos;s role) or by a{" "}
          <strong className="font-semibold">named approver</strong> listed here. Named approvers
          are additive — they do not replace the role.
        </Notice>
      </Card>

      {levels.loading && (
        <Card>
          <Skeleton className="h-24 w-full" />
        </Card>
      )}
      {!levels.loading && levels.error && (
        <Card>
          <ErrorState message={levels.error} onRetry={levels.reload} />
        </Card>
      )}
      {!levels.loading && !levels.error && ordered.length === 0 && (
        <Card>
          <EmptyState
            title="No levels defined"
            hint={'Add levels to "' + (workflow?.name ?? "this workflow") + '" first.'}
          />
        </Card>
      )}

      {!levels.loading &&
        !levels.error &&
        ordered.map((level) => {
          const list = level.approvers;
          return (
            <Card key={level.id} className="overflow-hidden p-0">
              <CardHeader className="mb-0 border-b border-line px-4 py-3">
                <CardTitle>
                  <span className="flex flex-wrap items-center gap-2">
                    Level {level.sequence} — {level.name}
                    <Badge tone="neutral">Role: {level.role_name || "any"}</Badge>
                  </span>
                </CardTitle>
                {canEdit && (
                  <Button size="xs" onClick={() => setAdding(level)}>
                    <HiOutlinePlusCircle aria-hidden="true" /> Assign user
                  </Button>
                )}
              </CardHeader>

              {list.length === 0 ? (
                <Notice tone="hold" className="m-4">
                  No named approvers.{" "}
                  {level.role_name
                    ? 'Only users with the "' +
                      level.role_name +
                      '" role can approve this level.'
                    : "This level has no role either — nobody can approve it."}
                </Notice>
              ) : (
                <div className="overflow-x-auto">
                  <Table density="compact">
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Company scope</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assigned</TableHead>
                        <TableHead className="text-right" aria-label="Actions" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-semibold text-ink">
                            {a.user_name || "—"}
                          </TableCell>
                          <TableCell>
                            <code className="font-mono text-[12px]">{a.username}</code>
                          </TableCell>
                          <TableCell>
                            {a.company || <Badge tone="info">All</Badge>}
                          </TableCell>
                          <TableCell>
                            <ActivePill active={a.is_active} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-subtle">
                            {formatDateTime(a.assigned_at)}
                          </TableCell>
                          <TableCell>
                            {canEdit && (
                              <span className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={a.is_active ? "Deactivate" : "Activate"}
                                  aria-label={
                                    (a.is_active ? "Deactivate " : "Activate ") +
                                    (a.user_name || a.username)
                                  }
                                  disabled={busy}
                                  onClick={() => toggle(a.id, a.is_active)}
                                >
                                  {a.is_active ? <HiOutlineEye /> : <HiOutlineEyeSlash />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Edit"
                                  aria-label={"Edit " + (a.user_name || a.username)}
                                  disabled={busy}
                                  onClick={() => setEditingApprover({ ...a })}
                                >
                                  <HiOutlinePencilSquare />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Remove"
                                  aria-label={"Remove " + (a.user_name || a.username)}
                                  disabled={busy}
                                  onClick={() =>
                                    setConfirmRemove({
                                      approver: a,
                                      levelName: level.name,
                                      roleName: level.role_name,
                                      othersLeft: list.filter(
                                        (o) => o.id !== a.id && o.is_active,
                                      ).length,
                                    })
                                  }
                                >
                                  <HiOutlineTrash />
                                </Button>
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          );
        })}

      {adding && (
        <Modal
          title={"Assign approver — Level " + adding.sequence}
          onClose={() => setAdding(null)}
          footer={
            <>
              <Button onClick={() => setAdding(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={add}
                disabled={busy || pickUser === ""}
                title={pickUser === "" ? "Choose a user first." : undefined}
              >
                {busy ? "Assigning…" : "Assign"}
              </Button>
            </>
          }
        >
          <FormGrid>
            <Field
              label="User"
              required
              className="sm:col-span-2"
              hint={
                users.data.length +
                " user" +
                (users.data.length === 1 ? "" : "s") +
                " available. Already-assigned users are hidden."
              }
              error={users.error ? "Could not load users — " + users.error : undefined}
            >
              {(control) => (
                <SearchSelect
                  {...control}
                  options={userOptions}
                  value={pickUser}
                  onChange={(v) => setPickUser(v === "" ? "" : Number(v))}
                  placeholder="Select a user…"
                  searchPlaceholder="Type a name or username…"
                  emptyText="No users match that search"
                  loading={users.loading}
                />
              )}
            </Field>

            <Field
              label="Company scope"
              className="sm:col-span-2"
              hint="Inherited from the workflow — change it there to change it here."
            >
              {() => (
                <ReadOnlyValue>
                  {workflow?.company
                    ? (COMPANY_OPTIONS.find((o) => o.value === workflow.company)?.label ??
                      workflow.company)
                    : "All companies"}
                </ReadOnlyValue>
              )}
            </Field>
          </FormGrid>
        </Modal>
      )}

      {editingApprover && (
        <Modal
          title={"Edit approver — " + (editingApprover.user_name || editingApprover.username)}
          onClose={() => setEditingApprover(null)}
          footer={
            <>
              <Button onClick={() => setEditingApprover(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={saveApprover} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </>
          }
        >
          <FormGrid>
            <Field
              label="User"
              className="sm:col-span-2"
              hint="To assign a different user, remove this grant and add a new one."
            >
              {() => (
                <ReadOnlyValue>
                  {editingApprover.user_name || editingApprover.username}{" "}
                  <code className="font-mono text-[12px] text-subtle">
                    {editingApprover.username}
                  </code>
                </ReadOnlyValue>
              )}
            </Field>

            <Field
              label="Company scope"
              className="sm:col-span-2"
              hint="Inherited from the workflow."
            >
              {() => <ReadOnlyValue>{editingApprover.company || "All companies"}</ReadOnlyValue>}
            </Field>

            <div className="sm:col-span-2">
              <Checkbox
                label="Active"
                hint="An inactive approver cannot decide at this level."
                checked={editingApprover.is_active}
                onChange={(e) =>
                  setEditingApprover({ ...editingApprover, is_active: e.target.checked })
                }
              />
            </div>
          </FormGrid>
        </Modal>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Remove approver"
          message={
            "Remove " +
            (confirmRemove.approver.user_name || confirmRemove.approver.username) +
            " from " +
            confirmRemove.levelName +
            "? " +
            (confirmRemove.othersLeft > 0
              ? confirmRemove.othersLeft +
                " other named approver" +
                (confirmRemove.othersLeft === 1 ? "" : "s") +
                " can still decide this level."
              : confirmRemove.roleName
                ? 'Nobody is named on this level afterwards — only users with the "' +
                  confirmRemove.roleName +
                  '" role could approve it.'
                : "This level has no role and would then have NOBODY able to approve it. Any document reaching it would stop there.")
          }
          confirmLabel="Remove approver"
          danger
          busy={busy}
          onConfirm={() => {
            remove(confirmRemove.approver.id);
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}
