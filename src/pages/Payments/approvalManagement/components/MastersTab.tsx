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
import { EMPTY_MAPPING, EMPTY_PERSON, useMastersTab } from "../useMastersTab";
import AsyncBoundaryTable from "./AsyncBoundaryTable";

export default function MastersTab({ canEdit, flash }: { canEdit: boolean; flash: Flash }) {
  const {
    personCompany,
    setPersonCompany,
    companies,
    persons,
    editing,
    setEditing,
    deleting,
    setDeleting,
    editingPerson,
    setEditingPerson,
    deletingPerson,
    setDeletingPerson,
    busy,
    personValid,
    mappingValid,
    savePerson,
    togglePerson,
    confirmDeletePerson,
    saveMapping,
    confirmDeleteMapping,
    toggleMapping,
  } = useMastersTab(flash);

  return (
    <div className="space-y-4">
      {/* ── Company mapping ─────────────────────────────────────────── */}
      <Card className="p-0">
        <CardHeader className="mb-0 border-b border-line px-4 py-3">
          <CardTitle>Company mapping</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="xs" onClick={companies.reload}>
              <HiOutlineArrowPath aria-hidden="true" /> Refresh
            </Button>
            {canEdit && (
              <Button variant="primary" size="xs" onClick={() => setEditing({ ...EMPTY_MAPPING })}>
                <HiOutlinePlusCircle aria-hidden="true" /> Add mapping
              </Button>
            )}
          </div>
        </CardHeader>

        <Notice tone="info" className="m-4 mb-0">
          Maps each company to its SAP database and HANA schema. Nothing in the payments module
          works until a company is mapped — the company pickers stay empty and no document can
          post to SAP.
        </Notice>

        <div className="mt-4 overflow-x-auto">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>SAP database</TableHead>
                <TableHead>HANA schema</TableHead>
                <TableHead>Cash G/L</TableHead>
                <TableHead>Deposit source G/L</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <AsyncBoundaryTable
              loading={companies.loading}
              error={companies.error}
              isEmpty={companies.data.length === 0}
              onRetry={companies.reload}
              cols={8}
              emptyTitle="No company mappings"
              emptyHint="Add one to enable company selection across the payments module."
              emptyAction={
                canEdit ? (
                  <Button variant="primary" onClick={() => setEditing({ ...EMPTY_MAPPING })}>
                    <HiOutlinePlusCircle aria-hidden="true" /> Add mapping
                  </Button>
                ) : undefined
              }
            >
              <TableBody>
                {companies.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold text-ink">{c.company}</TableCell>
                    <TableCell>{c.display_name}</TableCell>
                    <TableCell>
                      <code className="font-mono text-[12px]">{c.company_db}</code>
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-[12px]">{c.hana_schema}</code>
                    </TableCell>
                    <TableCell>
                      {c.cash_gl_account ? (
                        <code className="font-mono text-[12px]">{c.cash_gl_account}</code>
                      ) : (
                        // Cash cannot post without it, so an empty value is
                        // flagged rather than shown as a blank cell.
                        <Badge tone="bad">Not set</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.deposit_source_gl_account ? (
                        <code className="font-mono text-[12px]">
                          {c.deposit_source_gl_account}
                        </code>
                      ) : (
                        // Blank falls back to the cash G/L on the server, which
                        // SAP rejects for a deposit — so show what will be used.
                        <Badge tone="hold">Falls back to cash G/L</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ActivePill active={c.is_active} />
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <span className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={c.is_active ? "Deactivate" : "Activate"}
                            aria-label={(c.is_active ? "Deactivate " : "Activate ") + c.company}
                            disabled={busy}
                            onClick={() => toggleMapping(c)}
                          >
                            {c.is_active ? <HiOutlineEye /> : <HiOutlineEyeSlash />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit"
                            aria-label={"Edit " + c.company}
                            onClick={() => setEditing({ ...c })}
                          >
                            <HiOutlinePencilSquare />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete"
                            aria-label={"Delete " + c.company}
                            onClick={() => setDeleting(c)}
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

      {editing && (
        <Modal
          title={editing.id ? "Edit company mapping" : "Add company mapping"}
          onClose={() => setEditing(null)}
          wide
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={saveMapping}
                disabled={busy || !mappingValid}
                title={mappingValid ? undefined : "Fill in the required fields first."}
              >
                {busy ? "Saving…" : "Save mapping"}
              </Button>
            </>
          }
        >
          <FormGrid>
            <Field label="Company" required hint="One mapping per company.">
              {(control) => (
                <Select
                  {...control}
                  value={editing.company ?? "OIL"}
                  onChange={(e) => setEditing({ ...editing, company: e.target.value as Company })}
                >
                  {COMPANY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Display name" required>
              {(control) => (
                <Input
                  {...control}
                  value={editing.display_name ?? ""}
                  onChange={(e) => setEditing({ ...editing, display_name: e.target.value })}
                  placeholder="Jivo Oil"
                />
              )}
            </Field>

            <Field
              label="SAP company database"
              required
              hint="Exact SAP database name — used for every Service Layer call."
            >
              {(control) => (
                <Input
                  {...control}
                  value={editing.company_db ?? ""}
                  onChange={(e) => setEditing({ ...editing, company_db: e.target.value })}
                  placeholder="TEST_OIL_15122025"
                  className="font-mono"
                />
              )}
            </Field>

            <Field label="HANA schema" required hint="Usually identical to the database name.">
              {(control) => (
                <Input
                  {...control}
                  value={editing.hana_schema ?? ""}
                  onChange={(e) => setEditing({ ...editing, hana_schema: e.target.value })}
                  placeholder="TEST_OIL_15122025"
                  className="font-mono"
                />
              )}
            </Field>

            <Field
              label="Cash G/L account"
              className="sm:col-span-2"
              hint="Where cash receipts post in SAP. Typed rather than picked: every other tender lands in a bank account SAP publishes, but a cash drawer is not a bank and has no such record."
            >
              {(control) => (
                <Input
                  {...control}
                  value={editing.cash_gl_account ?? ""}
                  onChange={(e) => setEditing({ ...editing, cash_gl_account: e.target.value })}
                  placeholder="1105003"
                  className="font-mono"
                />
              )}
            </Field>

            <Field
              label="Deposit source G/L account"
              className="sm:col-span-2"
              hint="The account a deposit credits — the drawer being emptied. It must NOT be the cash G/L: SAP refuses a cash-flow account as the CardCode of a deposit transfer. Leave blank and the cash G/L is used, which SAP will reject."
            >
              {(control) => (
                <Input
                  {...control}
                  value={editing.deposit_source_gl_account ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, deposit_source_gl_account: e.target.value })
                  }
                  placeholder="2191001"
                  className="font-mono"
                />
              )}
            </Field>

            <Field label="Default branch (BPL ID)">
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  value={editing.default_bpl_id ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      default_bpl_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="Optional"
                />
              )}
            </Field>

            <div className="sm:col-span-2">
              <Checkbox
                label="Active"
                hint="Inactive companies disappear from every picker."
                checked={editing.is_active ?? true}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
            </div>
          </FormGrid>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete company mapping"
          message={
            "Delete the mapping for " +
            deleting.company +
            "? Payments and deposits for this company will stop working until it is recreated. Existing documents are not affected."
          }
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={confirmDeleteMapping}
          onCancel={() => setDeleting(null)}
        />
      )}

      {/* ── Payment method mapping ────────────────────────────────────
          Sits between the company mapping (which supplies the cash G/L) and
          collection persons, because it depends on the company being mapped
          first — its bank list comes from that company's SAP database. */}
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
