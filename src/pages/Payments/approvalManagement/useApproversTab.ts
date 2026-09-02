/**
 * State and mutations behind the Approvers tab (named approvers per level).
 *
 * Phase 3.1: `levels` and `users` were `useResource` fetch/effects; they are
 * now `useQuery`. `levels` shares its key (`levelsQueryKey`) with the Levels
 * tab's own levels query — same list, one cache entry, so a mutation from
 * either tab refreshes both without an extra round trip.
 *
 * add/saveApprover/toggle/remove were `try/catch` around a direct
 * `approvalService` call with a shared `busy` boolean; they are now
 * `useMutation`s, and `busy` is the four `isPending`s OR'd together — the
 * same "any in-flight write disables every button" behaviour the one
 * boolean gave.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import approvalService, {
  type AppUser,
  type ApprovalLevel,
  type ApprovalWorkflow,
  type LevelApprover,
} from "../../../services/approvalService";
import { messageFrom } from "../useApprovalAdmin";
import type { Flash, Resource } from "./types";
import { levelsQueryKey } from "./types";

const NO_LEVELS: ApprovalLevel[] = [];
const NO_USERS: AppUser[] = [];

export function useApproversTab(
  workflows: ApprovalWorkflow[],
  selectedId: number | null,
  flash: Flash,
) {
  const activeId = selectedId ?? workflows[0]?.id ?? null;
  const workflow = workflows.find((w) => w.id === activeId) ?? null;

  const levelsQuery = useQuery({
    queryKey: levelsQueryKey(activeId),
    queryFn: () =>
      activeId ? approvalService.listLevels(activeId) : Promise.resolve([]),
  });
  const levels: Resource<ApprovalLevel[]> = {
    data: levelsQuery.data ?? NO_LEVELS,
    loading: levelsQuery.isFetching,
    error: levelsQuery.error ? messageFrom(levelsQuery.error, "Failed to load") : "",
    reload: () => void levelsQuery.refetch(),
  };

  const usersQuery = useQuery({
    queryKey: ["approvals", "users"],
    queryFn: () => approvalService.listUsers(),
  });
  const users: Resource<AppUser[]> = {
    data: usersQuery.data ?? NO_USERS,
    loading: usersQuery.isFetching,
    error: usersQuery.error ? messageFrom(usersQuery.error, "Failed to load") : "",
    reload: () => void usersQuery.refetch(),
  };

  const [adding, setAdding] = useState<ApprovalLevel | null>(null);
  const [pickUser, setPickUser] = useState<number | "">("");
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

  const addMutation = useMutation({
    mutationFn: (vars: { level: ApprovalLevel; user: number }) =>
      // Company is INHERITED from the workflow — the admin already chose it
      // there, so asking again invites a mismatch where an approver is
      // scoped to a company the workflow never routes to.
      approvalService.addLevelApprover(vars.level.id, {
        user: vars.user,
        company: workflow?.company ?? "",
        is_active: true,
      }),
    onSuccess: () => {
      flash("Approver assigned");
      setAdding(null);
      setPickUser("");
      levels.reload();
    },
    onError: (err) => flash(messageFrom(err, "Could not assign approver"), "err"),
  });

  const saveApproverMutation = useMutation({
    mutationFn: (approver: LevelApprover) =>
      approvalService.updateLevelApprover(approver.id, {
        is_active: approver.is_active,
      }),
    onSuccess: () => {
      flash("Approver updated");
      setEditingApprover(null);
      levels.reload();
    },
    onError: (err) => flash(messageFrom(err, "Update failed"), "err"),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: number; isActive: boolean }) =>
      approvalService.updateLevelApprover(vars.id, { is_active: !vars.isActive }),
    onSuccess: (_approver, vars) => {
      flash(vars.isActive ? "Approver deactivated" : "Approver activated");
      levels.reload();
    },
    onError: (err) => flash(messageFrom(err, "Update failed"), "err"),
  });

  const removeMutation = useMutation({
    mutationFn: (approverId: number) => approvalService.removeLevelApprover(approverId),
    onSuccess: () => {
      flash("Approver removed");
      levels.reload();
    },
    onError: (err) => flash(messageFrom(err, "Remove failed"), "err"),
  });

  const busy =
    addMutation.isPending ||
    saveApproverMutation.isPending ||
    toggleMutation.isPending ||
    removeMutation.isPending;

  return {
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
    add: () => {
      if (!adding || pickUser === "") return;
      addMutation.mutate({ level: adding, user: Number(pickUser) });
    },
    saveApprover: () => editingApprover && saveApproverMutation.mutate(editingApprover),
    toggle: (id: number, isActive: boolean) => toggleMutation.mutate({ id, isActive }),
    remove: (id: number) => removeMutation.mutate(id),
  };
}
