/**
 * Masters — the reference data the payments module cannot run without:
 * company-to-SAP mapping, payment-method mapping (via ConfigTab) and the
 * collection persons a receipt can name.
 */
import {
  HiOutlineArrowPath,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlinePencilSquare,
  HiOutlinePlusCircle,
  HiOutlineTrash,
} from "react-icons/hi2";

import ConfigTab from "../../ConfigTab";
import { COMPANY_OPTIONS, type Company } from "../../../../services/approvalService";
import { ActivePill, ConfirmDialog, Modal } from "../../ApprovalUI";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Notice } from "@/components/ui/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Flash } from "../types";
import { EMPTY_PERSON, useMastersTab } from "../useMastersTab";
import AsyncBoundaryTable from "./AsyncBoundaryTable";

export default function MastersTab({ canEdit, flash }: { canEdit: boolean; flash: Flash }) {
  const {
    personCompany,
    setPersonCompany,
    persons,
    editingPerson,
    setEditingPerson,
    deletingPerson,
    setDeletingPerson,
    busy,
    personValid,
    savePerson,
    togglePerson,
    confirmDeletePerson,
  } = useMastersTab(flash);

  return (
    <div className="space-y-4">
      {/* ── Payment method mapping ────────────────────────────────────
          A company-mapping card used to sit above this, configuring each
          company's SAP database, HANA schema and cash G/L. All three moved
          out of the payments database — the SAP target to the environment,
          the cash G/L into the method mapping itself — so the card went with
          its table. Company selection now lives inside this section. */}
      <ConfigTab canEdit={canEdit} flash={flash} />

      {/* ── Collection persons ────────────────────────────────────────── */}
      <Card className="p-0">
        <CardHeader className="mb-0 flex-wrap border-b border-line px-4 py-3">
          <CardTitle>Collection persons</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={personCompany}
              onChange={(e) => setPersonCompany(e.target.value as Company | "")}
              aria-label="Filter collection persons by company"
              className="h-control-xs w-auto text-[12.5px]"
            >
              <option value="">All companies</option>
              {COMPANY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button size="xs" onClick={persons.reload}>
              <HiOutlineArrowPath aria-hidden="true" /> Refresh
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                size="xs"
                onClick={() => setEditingPerson({ ...EMPTY_PERSON, company: personCompany })}
              >
                <HiOutlinePlusCircle aria-hidden="true" /> Add person
              </Button>
            )}
          </div>
        </CardHeader>

        <Notice tone="info" className="m-4 mb-0">
          The &ldquo;Received From&rdquo; people on a payment receipt. Scope one to a company so
          it only appears for that company&rsquo;s payments, or leave it blank to offer it
          everywhere.
        </Notice>

        <div className="mt-4 overflow-x-auto">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <AsyncBoundaryTable
              loading={persons.loading}
              error={persons.error}
              isEmpty={persons.data.length === 0}
              onRetry={persons.reload}
              cols={6}
              emptyTitle="No collection persons"
              emptyHint="Add the people who collect payments on a party's behalf."
              emptyAction={
                canEdit ? (
                  <Button
                    variant="primary"
                    onClick={() => setEditingPerson({ ...EMPTY_PERSON, company: personCompany })}
                  >
                    <HiOutlinePlusCircle aria-hidden="true" /> Add person
                  </Button>
                ) : undefined
              }
            >
              <TableBody>
                {persons.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <code className="font-mono text-[12px]">{p.code}</code>
                    </TableCell>
                    <TableCell className="font-semibold text-ink">{p.name}</TableCell>
                    <TableCell>{p.company || <Badge tone="info">All</Badge>}</TableCell>
                    <TableCell>{p.phone || "—"}</TableCell>
                    <TableCell>
                      <ActivePill active={p.is_active} />
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <span className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={p.is_active ? "Deactivate" : "Activate"}
                            aria-label={(p.is_active ? "Deactivate " : "Activate ") + p.name}
                            disabled={busy}
                            onClick={() => togglePerson(p)}
                          >
                            {p.is_active ? <HiOutlineEye /> : <HiOutlineEyeSlash />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit"
                            aria-label={"Edit " + p.name}
                            onClick={() => setEditingPerson({ ...p })}
                          >
                            <HiOutlinePencilSquare />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete"
                            aria-label={"Delete " + p.name}
                            onClick={() => setDeletingPerson(p)}
                          >
                            <HiOutlineTrash />
                          </Button>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </AsyncBoundaryTable>
          </Table>
        </div>
      </Card>

      {/* ── Collection person dialog ──────────────────────────────────── */}
      {editingPerson && (
        <Modal
          title={editingPerson.id ? "Edit collection person" : "Add collection person"}
          onClose={() => setEditingPerson(null)}
          footer={
            <>
              <Button onClick={() => setEditingPerson(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={savePerson}
                disabled={busy || !personValid}
                title={personValid ? undefined : "A name is required."}
              >
                {busy ? "Saving…" : "Save person"}
              </Button>
            </>
          }
        >
          <FormGrid>
            <Field label="Name" required className="sm:col-span-2">
              {(control) => (
                <Input
                  {...control}
                  value={editingPerson.name ?? ""}
                  onChange={(e) => setEditingPerson({ ...editingPerson, name: e.target.value })}
                  placeholder="Navneet"
                  autoFocus
                />
              )}
            </Field>

            <Field label="Company" hint="The same person can exist separately per company.">
              {(control) => (
                <Select
                  {...control}
                  value={editingPerson.company ?? ""}
                  onChange={(e) =>
                    setEditingPerson({
                      ...editingPerson,
                      company: e.target.value as Company | "",
                    })
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

            <Field label="Phone">
              {(control) => (
                <Input
                  {...control}
                  value={editingPerson.phone ?? ""}
                  onChange={(e) => setEditingPerson({ ...editingPerson, phone: e.target.value })}
                  placeholder="Optional"
                />
              )}
            </Field>

            <Field
              label="Code"
              className="sm:col-span-2"
              hint="Internal identifier, unique across all companies. Generated automatically when left blank."
            >
              {(control) => (
                <Input
                  {...control}
                  value={editingPerson.code ?? ""}
                  onChange={(e) =>
                    setEditingPerson({ ...editingPerson, code: e.target.value.toUpperCase() })
                  }
                  placeholder="Leave blank to generate from the name"
                  className="font-mono"
                />
              )}
            </Field>

            <div className="sm:col-span-2">
              <Checkbox
                label="Active"
                hint="Inactive people disappear from the “Received From” picker."
                checked={editingPerson.is_active ?? true}
                onChange={(e) =>
                  setEditingPerson({ ...editingPerson, is_active: e.target.checked })
                }
              />
            </div>
          </FormGrid>
        </Modal>
      )}

      {deletingPerson && (
        <ConfirmDialog
          title="Delete collection person"
          message={
            'Delete "' +
            deletingPerson.name +
            '"? Receipts that reference them are not affected, but they can no longer be selected. Deactivating is usually safer.'
          }
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={confirmDeletePerson}
          onCancel={() => setDeletingPerson(null)}
        />
      )}
    </div>
  );
}
