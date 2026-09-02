/**
 * State and mutations behind the Workflows tab.
 *
 * The list itself (`resource`) is owned by useApprovalManagement and passed
 * in, because Levels and Approvers read the same workflows. Everything below
 * — search/filter, the edit/delete dialogs, and the three writes — is local
 * to this tab.
 *
 * Phase 3.1: save/delete/toggle were `try/catch` around a direct
 * `approvalService` call with a shared `busy` boolean. They are now
 * `useMutation`s; `busy` is the three `isPending`s OR'd together, which is
 * the same "any in-flight write disables every button" behaviour the one
 * boolean gave.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import approvalService, {
  type ApprovalWorkflow,
  type Company,
  type DocumentType,
  type WorkflowPayload,
} from "../../../services/approvalService";
import { formatDateTime } from "../approvalFormat";
import { messageFrom } from "../useApprovalAdmin";
import type { Flash, Resource } from "./types";

export const EMPTY_WORKFLOW: WorkflowPayload = {
  code: "",
  name: "",
  document_type: "PAYMENT",
  company: "",
  restart_on_reject: true,
  forbid_self_approval: true,
  is_active: true,
};

export function useWorkflowsTab(
  resource: Resource<ApprovalWorkflow[]>,
  flash: Flash,
) {
  const [search, setSearch] = useState("");
  const [docFilter, setDocFilter] = useState<DocumentType | "">("");
  const [companyFilter, setCompanyFilter] = useState<Company | "">("");
  const [editing, setEditing] = useState<
    (WorkflowPayload & { id?: number }) | null
  >(null);
  const [deleting, setDeleting] = useState<ApprovalWorkflow | null>(null);

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

  const saveMutation = useMutation({
    mutationFn: (payload: WorkflowPayload & { id?: number }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        return approvalService.updateWorkflow(id, rest);
      }
      return approvalService.createWorkflow(payload);
    },
    onSuccess: (_workflow, payload) => {
      flash(payload.id ? "Workflow updated" : "Workflow created");
      setEditing(null);
      resource.reload();
    },
    onError: (err) => flash(messageFrom(err, "Save failed"), "err"),
  });

  const deleteMutation = useMutation({
    mutationFn: (workflow: ApprovalWorkflow) =>
      approvalService.deleteWorkflow(workflow.id),
    onSuccess: () => {
      flash("Workflow deleted");
      setDeleting(null);
      resource.reload();
    },
    onError: (err) => flash(messageFrom(err, "Delete failed"), "err"),
  });

  /**
   * Activate / deactivate in place.
   *
   * Only ONE active workflow may exist per (document type, company), so this
   * is how an admin frees the slot before creating a replacement — the
   * server rejects the new one until the incumbent is switched off.
   */
  const toggleMutation = useMutation({
    mutationFn: (workflow: ApprovalWorkflow) =>
      approvalService.updateWorkflow(workflow.id, {
        is_active: !workflow.is_active,
      }),
    onSuccess: (_workflow, workflow) => {
      flash(workflow.is_active ? "Workflow deactivated" : "Workflow activated");
      resource.reload();
    },
    onError: (err) => flash(messageFrom(err, "Update failed"), "err"),
  });

  const busy =
    saveMutation.isPending || deleteMutation.isPending || toggleMutation.isPending;

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

  return {
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
    save: () => editing && saveMutation.mutate(editing),
    confirmDelete: () => deleting && deleteMutation.mutate(deleting),
    toggleActive: (workflow: ApprovalWorkflow) => toggleMutation.mutate(workflow),
    exportCsv,
  };
}
