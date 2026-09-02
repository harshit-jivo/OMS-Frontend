/**
 * State and data behind the Approval console's top-level shell.
 *
 * Owns the tab selector and the "which workflow" selection that the Levels
 * and Approvers tabs read, plus the one list — `workflows` — that the
 * Workflows, Levels and Approvers tabs all consume in some form.
 *
 * Phase 3.1: `workflows` used to be `useResource`'s hand-rolled fetch/effect
 * (see ../useApprovalAdmin.ts); it is now `useQuery` on `["approvals",
 * "workflows"]`, adapted back to the same `data/loading/error/reload` shape
 * so nothing downstream had to change. That key is shared, not per-tab, so a
 * level or approver mutation's `onWorkflowsChanged()` (which patches a
 * workflow's nested `levels`) refreshes every tab reading it.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import approvalService, { type ApprovalWorkflow } from "../../../services/approvalService";
import { messageFrom, useIsApprovalAdmin, useToast } from "../useApprovalAdmin";
import type { Resource, Tab } from "./types";

const NO_WORKFLOWS: ApprovalWorkflow[] = [];

export function useApprovalManagement() {
  const [tab, setTab] = useState<Tab>("analytics");
  const { toast, flash } = useToast();
  const isAdmin = useIsApprovalAdmin();

  // Selected workflow is shared between the Workflows, Levels and Approvers
  // tabs, so choosing one in the list carries through to its editor.
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ["approvals", "workflows"],
    queryFn: () => approvalService.listWorkflows(),
  });
  const workflows: Resource<ApprovalWorkflow[]> = {
    data: query.data ?? NO_WORKFLOWS,
    // `isFetching`, not `isPending` — a manual Refresh should show the same
    // loading state a first load did, which is what `useResource` always did
    // (every reload set `loading` back to true, cache or no cache).
    loading: query.isFetching,
    error: query.error ? messageFrom(query.error, "Failed to load") : "",
    reload: () => void query.refetch(),
  };

  const openLevels = (id: number) => {
    setSelectedWorkflowId(id);
    setTab("levels");
  };

  const openApprovers = (id: number) => {
    setSelectedWorkflowId(id);
    setTab("approvers");
  };

  return {
    tab,
    setTab,
    toast,
    flash,
    isAdmin,
    selectedWorkflowId,
    setSelectedWorkflowId,
    workflows,
    openLevels,
    openApprovers,
  };
}
