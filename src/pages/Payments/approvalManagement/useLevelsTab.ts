/**
 * State and mutations behind the Levels tab (the ladder editor).
 *
 * Phase 3.1: `levels` and `roles` were `useResource` fetch/effects; they are
 * now `useQuery`. `levels` is keyed with `levelsQueryKey`, shared with the
 * Approvers tab's own levels query — the two tabs show the same list, so one
 * cache entry means switching between them does not refetch, and a mutation
 * from either tab refreshes both.
 *
 * save/delete/move/toggle were `try/catch` around a direct `approvalService`
 * call with a shared `busy` boolean; they are now `useMutation`s, and `busy`
 * is the four `isPending`s OR'd together — the same "any in-flight write
 * disables every button" behaviour the one boolean gave.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import approvalService, {
  type ApprovalLevel,
  type ApprovalWorkflow,
  type LevelPayload,
  type Role,
} from "../../../services/approvalService";
import { messageFrom } from "../useApprovalAdmin";
import type { Flash, Resource } from "./types";
import { levelsQueryKey } from "./types";

const NO_LEVELS: ApprovalLevel[] = [];
const NO_ROLES: Role[] = [];

export function useLevelsTab(
  workflows: ApprovalWorkflow[],
  selectedId: number | null,
  flash: Flash,
  onWorkflowsChanged: () => void,
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

  const rolesQuery = useQuery({
    queryKey: ["approvals", "roles"],
    queryFn: () => approvalService.listRoles(),
  });
  const roles: Role[] = rolesQuery.data ?? NO_ROLES;

  const [editing, setEditing] = useState<(LevelPayload & { id?: number }) | null>(
    null,
  );
  const [deleting, setDeleting] = useState<ApprovalLevel | null>(null);

  const ordered = useMemo(
    () => [...levels.data].sort((a, b) => a.sequence - b.sequence),
    [levels.data],
  );

  const refreshAll = () => {
    levels.reload();
    onWorkflowsChanged();
  };

  const saveMutation = useMutation({
    mutationFn: ({
      workflowId,
      ...payload
    }: LevelPayload & { id?: number; workflowId: number }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        return approvalService.updateLevel(id, rest);
      }
      return approvalService.createLevel({ ...payload, workflow: workflowId });
    },
    onSuccess: (_level, payload) => {
      flash(payload.id ? "Level updated" : "Level added");
      setEditing(null);
      refreshAll();
    },
    onError: (err) => flash(messageFrom(err, "Save failed"), "err"),
  });

  const deleteMutation = useMutation({
    mutationFn: (level: ApprovalLevel) => approvalService.deleteLevel(level.id),
    onSuccess: () => {
      flash("Level deleted");
      setDeleting(null);
      refreshAll();
    },
    onError: (err) => flash(messageFrom(err, "Delete failed"), "err"),
  });

  /**
   * Swap two levels' sequence numbers.
   *
   * (workflow, sequence) is UNIQUE in the database, so a direct swap would
   * collide on the first write. Parking one row on a free sequence first
   * keeps every intermediate state legal.
   */
  const moveMutation = useMutation({
    mutationFn: async ({
      current,
      neighbour,
    }: {
      current: ApprovalLevel;
      neighbour: ApprovalLevel;
    }) => {
      const park = Math.max(...ordered.map((l) => l.sequence)) + 1;
      await approvalService.updateLevel(current.id, { sequence: park });
      await approvalService.updateLevel(neighbour.id, { sequence: current.sequence });
      await approvalService.updateLevel(current.id, { sequence: neighbour.sequence });
    },
    onSuccess: () => {
      flash("Order updated");
      refreshAll();
    },
    onError: (err) => {
      flash(messageFrom(err, "Could not reorder"), "err");
      levels.reload();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (level: ApprovalLevel) =>
      approvalService.updateLevel(level.id, { is_active: !level.is_active }),
    onSuccess: (_level, level) => {
      flash(level.is_active ? "Level disabled" : "Level enabled");
      refreshAll();
    },
    onError: (err) => flash(messageFrom(err, "Update failed"), "err"),
  });

  const busy =
    saveMutation.isPending ||
    deleteMutation.isPending ||
    moveMutation.isPending ||
    toggleMutation.isPending;

  const move = (index: number, direction: -1 | 1) => {
    const current = ordered[index];
    const neighbour = ordered[index + direction];
    if (!current || !neighbour) return;
    moveMutation.mutate({ current, neighbour });
  };

  return {
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
    save: () => {
      if (!editing || !activeId) return;
      saveMutation.mutate({ ...editing, workflowId: activeId });
    },
    confirmDelete: () => deleting && deleteMutation.mutate(deleting),
    move,
    toggleActive: (level: ApprovalLevel) => toggleMutation.mutate(level),
  };
}
