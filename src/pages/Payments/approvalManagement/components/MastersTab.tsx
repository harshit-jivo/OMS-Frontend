import {
  HiArrowPath,
  HiEye,
  HiEyeSlash,
  HiPencilSquare,
  HiPlusCircle,
  HiTrash,
} from "react-icons/hi2";

import ConfigTab from "../../ConfigTab";
import {
  COMPANY_OPTIONS,
  type Company,
} from "../../../../services/approvalService";
import { ActivePill, ConfirmDialog, Modal } from "../../ApprovalUI";
import { Badge } from "@/components/ui/badge";
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
    <>
      <div className="apv-card">
        <div className="apv-card-head">
          <h3>Company mapping</h3>
          <div className="apv-actions-row">
            <button type="button" className="apv-btn apv-btn-sm" onClick={companies.reload}>
              <HiArrowPath /> Refresh
            </button>
            {canEdit && (
              <button
                type="button"
                className="apv-btn apv-btn-sm apv-btn-primary"
                onClick={() => setEditing({ ...EMPTY_MAPPING })}
              >
                <HiPlusCircle /> Add mapping
              </button>
            )}
          </div>
        </div>
        <div className="apv-notice apv-notice-info">
          <span>
            Maps each company to its SAP database and HANA schema. Nothing in
            the payments module works until a company is mapped — the company
            pickers stay empty and no document can post to SAP.
          </span>
        </div>
        <div className="apv-table-wrap">
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
                <TableHead />
              </TableRow>
            </TableHeader>
            <AsyncBoundaryTable
              loading={companies.loading}
              error={companies.error}
              isEmpty={companies.data.length === 0}
              onRetry={companies.reload}
              cols={6}
              emptyTitle="No company mappings"
              emptyHint="Add one to enable company selection across the payments module."
              emptyAction={
                canEdit ? (
                  <button
                    type="button"
                    className="apv-btn apv-btn-primary"
                    onClick={() => setEditing({ ...EMPTY_MAPPING })}
                  >
                    <HiPlusCircle /> Add mapping
                  </button>
                ) : undefined
              }
            >
              <TableBody>
                {companies.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.company}</TableCell>
                    <TableCell>{c.display_name}</TableCell>
                    <TableCell>
                      <code>{c.company_db}</code>
                    </TableCell>
                    <TableCell>
                      <code>{c.hana_schema}</code>
                    </TableCell>
                    <TableCell>
                      {c.cash_gl_account ? (
                        <code>{c.cash_gl_account}</code>
                      ) : (
                        // Cash cannot post without it, so an empty value is
                        // flagged rather than shown as a blank cell.
                        <span className="apv-pill err">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.deposit_source_gl_account ? (
                        <code>{c.deposit_source_gl_account}</code>
                      ) : (
                        // Blank falls back to the cash G/L on the server, which
                        // SAP rejects for a deposit — so show what will be used.
                        <span className="apv-pill warn">
                          Falls back to cash G/L
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ActivePill active={c.is_active} />
                    </TableCell>
                    <TableCell>
                      <div className="apv-row-actions">
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon"
                              title={c.is_active ? "Deactivate" : "Activate"}
                              aria-label={`Toggle ${c.company}`}
                              disabled={busy}
                              onClick={() => toggleMapping(c)}
                            >
                              {c.is_active ? <HiEye /> : <HiEyeSlash />}
                            </button>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon"
                              title="Edit"
                              aria-label={`Edit ${c.company}`}
                              onClick={() => setEditing({ ...c })}
                            >
                              <HiPencilSquare />
                            </button>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon apv-btn-danger"
                              title="Delete"
                              aria-label={`Delete ${c.company}`}
                              onClick={() => setDeleting(c)}
                            >
                              <HiTrash />
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </AsyncBoundaryTable>
          </Table>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing.id ? "Edit company mapping" : "Add company mapping"}
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
                onClick={saveMapping}
                disabled={busy || !mappingValid}
              >
                {busy ? "Saving…" : "Save mapping"}
              </button>
            </>
          }
        >
          <div className="apv-form-grid">
            <div className="apv-field">
              <label htmlFor="cm-company">Company</label>
              <select
                id="cm-company"
                className="apv-select"
                value={editing.company ?? "OIL"}
                onChange={(e) =>
                  setEditing({ ...editing, company: e.target.value as Company })
                }
              >
                {COMPANY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="apv-hint">One mapping per company.</span>
            </div>

            <div className="apv-field">
              <label htmlFor="cm-display">Display name</label>
              <input
                id="cm-display"
                className="apv-input"
                value={editing.display_name ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, display_name: e.target.value })
                }
                placeholder="Jivo Oil"
              />
            </div>

            <div className="apv-field">
              <label htmlFor="cm-db">SAP company database</label>
              <input
                id="cm-db"
                className="apv-input"
                value={editing.company_db ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, company_db: e.target.value })
                }
                placeholder="TEST_OIL_15122025"
              />
              <span className="apv-hint">
                Exact SAP database name — used for every Service Layer call.
              </span>
            </div>

            <div className="apv-field">
              <label htmlFor="cm-schema">HANA schema</label>
              <input
                id="cm-schema"
                className="apv-input"
                value={editing.hana_schema ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, hana_schema: e.target.value })
                }
                placeholder="TEST_OIL_15122025"
              />
              <span className="apv-hint">
                Usually identical to the database name.
              </span>
            </div>

            <div className="apv-field">
              <label htmlFor="cm-cash-gl">Cash G/L account</label>
              <input
                id="cm-cash-gl"
                className="apv-input"
                value={editing.cash_gl_account ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, cash_gl_account: e.target.value })
                }
                placeholder="1105003"
              />
              <span className="apv-hint">
                Where cash receipts post in SAP. Typed rather than picked:
                every other tender lands in a bank account SAP publishes, but a
                cash drawer is not a bank and has no such record.
              </span>
            </div>

            <div className="apv-field">
              <label htmlFor="cm-deposit-gl">Deposit source G/L account</label>
              <input
                id="cm-deposit-gl"
                className="apv-input"
                value={editing.deposit_source_gl_account ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    deposit_source_gl_account: e.target.value,
                  })
                }
                placeholder="2191001"
              />
              <span className="apv-hint">
                The account a deposit credits — the drawer being emptied. It
                must NOT be the cash G/L: SAP refuses a cash-flow account as
                the CardCode of a deposit transfer. Leave blank and the cash
                G/L is used, which SAP will reject.
              </span>
            </div>

            <div className="apv-field">
              <label htmlFor="cm-bpl">Default branch (BPL ID)</label>
              <input
                id="cm-bpl"
                className="apv-input"
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
            </div>

            <div className="apv-field is-full">
              <label className="apv-check">
                <input
                  type="checkbox"
                  checked={editing.is_active ?? true}
                  onChange={(e) =>
                    setEditing({ ...editing, is_active: e.target.checked })
                  }
                />
                Active — inactive companies disappear from every picker
              </label>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete company mapping"
          message={`Delete the mapping for ${deleting.company}? Payments and deposits for this company will stop working until it is recreated. Existing documents are not affected.`}
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
      <div className="apv-card">
        <div className="apv-card-head">
          <h3>Collection persons</h3>
          <div className="apv-actions-row apv-actions-row-center">
            <select
              className="apv-select"
              value={personCompany}
              onChange={(e) => setPersonCompany(e.target.value as Company | "")}
              aria-label="Filter collection persons by company"
            >
              <option value="">All companies</option>
              {COMPANY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" className="apv-btn apv-btn-sm" onClick={persons.reload}>
              <HiArrowPath /> Refresh
            </button>
            {canEdit && (
              <button
                type="button"
                className="apv-btn apv-btn-sm apv-btn-primary"
                onClick={() =>
                  setEditingPerson({ ...EMPTY_PERSON, company: personCompany })
                }
              >
                <HiPlusCircle /> Add person
              </button>
            )}
          </div>
        </div>
        <div className="apv-notice apv-notice-info">
          <span>
            The “Received From” people on a payment receipt. Scope one to a
            company so it only appears for that company&rsquo;s payments, or
            leave it blank to offer it everywhere.
          </span>
        </div>
        <div className="apv-table-wrap">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
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
                  <button
                    type="button"
                    className="apv-btn apv-btn-primary"
                    onClick={() =>
                      setEditingPerson({ ...EMPTY_PERSON, company: personCompany })
                    }
                  >
                    <HiPlusCircle /> Add person
                  </button>
                ) : undefined
              }
            >
              <TableBody>
                {persons.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <code>{p.code}</code>
                    </TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>
                      {p.company || (
                        <Badge tone="info">All</Badge>
                      )}
                    </TableCell>
                    <TableCell>{p.phone || "—"}</TableCell>
                    <TableCell>
                      <ActivePill active={p.is_active} />
                    </TableCell>
                    <TableCell>
                      <div className="apv-row-actions">
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon"
                              title={p.is_active ? "Deactivate" : "Activate"}
                              aria-label={`Toggle ${p.name}`}
                              disabled={busy}
                              onClick={() => togglePerson(p)}
                            >
                              {p.is_active ? <HiEye /> : <HiEyeSlash />}
                            </button>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon"
                              title="Edit"
                              aria-label={`Edit ${p.name}`}
                              onClick={() => setEditingPerson({ ...p })}
                            >
                              <HiPencilSquare />
                            </button>
                            <button
                              type="button"
                              className="apv-btn apv-btn-icon apv-btn-danger"
                              title="Delete"
                              aria-label={`Delete ${p.name}`}
                              onClick={() => setDeletingPerson(p)}
                            >
                              <HiTrash />
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </AsyncBoundaryTable>
          </Table>
        </div>
      </div>

      {/* ── Collection person dialog ──────────────────────────────────── */}
      {editingPerson && (
        <Modal
          title={editingPerson.id ? "Edit collection person" : "Add collection person"}
          onClose={() => setEditingPerson(null)}
          footer={
            <>
              <button
                type="button"
                className="apv-btn"
                onClick={() => setEditingPerson(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apv-btn apv-btn-primary"
                onClick={savePerson}
                disabled={busy || !personValid}
              >
                {busy ? "Saving…" : "Save person"}
              </button>
            </>
          }
        >
          <div className="apv-form-grid">
            <div className="apv-field is-full">
              <label htmlFor="cp-name">Name</label>
              <input
                id="cp-name"
                className="apv-input"
                value={editingPerson.name ?? ""}
                onChange={(e) =>
                  setEditingPerson({ ...editingPerson, name: e.target.value })
                }
                placeholder="Navneet"
              />
            </div>

            <div className="apv-field">
              <label htmlFor="cp-company">Company</label>
              <select
                id="cp-company"
                className="apv-select"
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
              </select>
              <span className="apv-hint">
                The same person can exist separately per company.
              </span>
            </div>

            <div className="apv-field">
              <label htmlFor="cp-phone">Phone</label>
              <input
                id="cp-phone"
                className="apv-input"
                value={editingPerson.phone ?? ""}
                onChange={(e) =>
                  setEditingPerson({ ...editingPerson, phone: e.target.value })
                }
                placeholder="Optional"
              />
            </div>

            <div className="apv-field is-full">
              <label htmlFor="cp-code">Code</label>
              <input
                id="cp-code"
                className="apv-input"
                value={editingPerson.code ?? ""}
                onChange={(e) =>
                  setEditingPerson({
                    ...editingPerson,
                    code: e.target.value.toUpperCase(),
                  })
                }
                placeholder="Leave blank to generate from the name"
              />
              <span className="apv-hint">
                Internal identifier, unique across all companies. Generated
                automatically when left blank.
              </span>
            </div>

            <div className="apv-field is-full">
              <label className="apv-check">
                <input
                  type="checkbox"
                  checked={editingPerson.is_active ?? true}
                  onChange={(e) =>
                    setEditingPerson({
                      ...editingPerson,
                      is_active: e.target.checked,
                    })
                  }
                />
                Active — inactive people disappear from the “Received From” picker
              </label>
            </div>
          </div>
        </Modal>
      )}

      {deletingPerson && (
        <ConfirmDialog
          title="Delete collection person"
          message={`Delete "${deletingPerson.name}"? Receipts that reference them are not affected, but they can no longer be selected. Deactivating is usually safer.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={confirmDeletePerson}
          onCancel={() => setDeletingPerson(null)}
        />
      )}
    </>
  );
}
