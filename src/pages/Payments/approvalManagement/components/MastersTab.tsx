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
    <>
      {/* ── Payment method mapping ────────────────────────────────────
          A company-mapping card used to sit above this, configuring each
          company's SAP database, HANA schema and cash G/L. All three moved
          out of the payments database — the SAP target to the environment,
          the cash G/L into the method mapping itself — so the card went with
          its table. Company selection now lives inside this section. */}
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
