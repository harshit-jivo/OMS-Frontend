/**
 * Workflows — the approval ladders themselves, one per document type and
 * company.
 */
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlinePencilSquare,
  HiOutlinePlusCircle,
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
import { Button } from "@/components/ui/button";
import {
  FilterActions,
  FilterBar,
  FilterSearch,
  FilterSelect,
} from "@/components/ui/filter-bar";
import { Checkbox, Field, FieldGroup, FormGrid, Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/page";
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
    <div className="space-y-4">
      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or code…"
          fieldClassName="min-w-[240px]"
        />
        <FilterSelect
          label="Document type"
          value={docFilter}
          onChange={(e) => setDocFilter(e.target.value as DocumentType | "")}
          fieldClassName="max-w-[200px]"
        >
          <option value="">All document types</option>
          {DOCUMENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Company"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value as Company | "")}
          fieldClassName="max-w-[190px]"
        >
          <option value="">All companies</option>
          {COMPANY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FilterSelect>

        <FilterActions>
          <Button onClick={resource.reload}>
            <HiOutlineArrowPath aria-hidden="true" /> Refresh
          </Button>
          <Button onClick={exportCsv} disabled={visible.length === 0}>
            <HiOutlineArrowDownTray aria-hidden="true" /> Export
          </Button>
          {canEdit && (
            <Button variant="primary" onClick={() => setEditing({ ...EMPTY_WORKFLOW })}>
              <HiOutlinePlusCircle aria-hidden="true" /> New workflow
            </Button>
          )}
        </FilterActions>
      </FilterBar>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Document type</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Levels</TableHead>
                <TableHead>Rules</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right" aria-label="Actions" />
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
                  <Button variant="primary" onClick={() => setEditing({ ...EMPTY_WORKFLOW })}>
                    <HiOutlinePlusCircle aria-hidden="true" /> New workflow
                  </Button>
                ) : undefined
              }
            >
              <TableBody>
                {visible.map((w) => {
                  const activeLevels = w.levels.filter((l) => l.is_active).length;
                  return (
                    <TableRow key={w.id}>
                      <TableCell>
                        <code className="font-mono text-[12px] text-ink">{w.code}</code>
                      </TableCell>
                      <TableCell className="font-semibold text-ink">{w.name}</TableCell>
                      <TableCell>{w.document_type}</TableCell>
                      <TableCell>{w.company || <Badge tone="info">All</Badge>}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {activeLevels === 0 ? <Badge tone="bad">None</Badge> : activeLevels}
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          <Badge
                            tone="neutral"
                            title="A rejected document restarts from level 1"
                          >
                            {w.restart_on_reject ? "Restart" : "Resume"}
                          </Badge>
                          {w.forbid_self_approval && (
                            <Badge
                              tone="neutral"
                              title="The submitter may not approve their own document"
                            >
                              No self-approve
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ActivePill active={w.is_active} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-subtle">
                        {formatDateTime(w.created_at)}
                      </TableCell>
                      <TableCell>
                        <span className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => onOpenLevels(w.id)}>
                            Levels
                          </Button>
                          <Button size="sm" onClick={() => onOpenApprovers(w.id)}>
                            Approvers
                          </Button>
                          {canEdit && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                title={w.is_active ? "Deactivate" : "Activate"}
                                aria-label={
                                  (w.is_active ? "Deactivate " : "Activate ") + w.name
                                }
                                disabled={busy}
                                onClick={() => toggleActive(w)}
                              >
                                {w.is_active ? <HiOutlineEye /> : <HiOutlineEyeSlash />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Edit"
                                aria-label={"Edit " + w.name}
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
                                <HiOutlinePencilSquare />
                              </Button>
                              {/* Delete removed deliberately. A workflow is the
                                  ladder in-flight documents are standing on —
                                  removing it (or its levels) strands every
                                  pending request at a rung that no longer
                                  exists, invisible to every approver. Set the
                                  workflow Inactive instead: new documents stop
                                  using it while the ones already in it finish. */}
                            </>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </AsyncBoundaryTable>
          </Table>
        </div>
      </Card>

      {editing && (
        <Modal
          title={editing.id ? "Edit workflow" : "New workflow"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={save}
                disabled={busy || !valid}
                title={valid ? undefined : "A code and a name are required."}
              >
                {busy ? "Saving…" : "Save workflow"}
              </Button>
            </>
          }
        >
          <FormGrid>
            <Field label="Code" required hint="Unique identifier. Cannot repeat.">
              {(control) => (
                <Input
                  {...control}
                  value={editing.code ?? ""}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  placeholder="PAYMENT_OIL_V1"
                  className="font-mono"
                  autoFocus
                />
              )}
            </Field>

            <Field label="Name" required>
              {(control) => (
                <Input
                  {...control}
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Payment approval — Oil"
                />
              )}
            </Field>

            <Field label="Document type">
              {(control) => (
                <Select
                  {...control}
                  value={editing.document_type ?? "PAYMENT"}
                  onChange={(e) =>
                    setEditing({ ...editing, document_type: e.target.value as DocumentType })
                  }
                >
                  {DOCUMENT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Company" hint="Only one active workflow per document type + company.">
              {(control) => (
                <Select
                  {...control}
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
                </Select>
              )}
            </Field>

            <FieldGroup legend="Rules" className="sm:col-span-2">
              <Checkbox
                label="Restart on reject"
                hint="A rejected document that is resubmitted starts again from level 1."
                checked={editing.restart_on_reject ?? true}
                onChange={(e) => setEditing({ ...editing, restart_on_reject: e.target.checked })}
              />
              <Checkbox
                label="Block self-approval"
                hint="The person who submitted a document may not approve it."
                checked={editing.forbid_self_approval ?? true}
                onChange={(e) =>
                  setEditing({ ...editing, forbid_self_approval: e.target.checked })
                }
              />
              <Checkbox
                label="Active"
                hint="An inactive workflow stops routing new documents; those already in it finish."
                checked={editing.is_active ?? true}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
            </FieldGroup>
          </FormGrid>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete workflow"
          message={
            'Delete "' +
            deleting.name +
            '" (' +
            deleting.code +
            ")? Its levels and approver assignments are removed too. Workflows with existing approval requests cannot be deleted."
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
