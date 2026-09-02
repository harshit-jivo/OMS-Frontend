import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiPencilSquare, HiTrash, HiPlus } from "react-icons/hi2";

import { showToast } from "@/lib/toastStore";
import {
  applyLabelUpdate,
  applyFieldUpdate,
  loadUILabels,
  loadUIFields,
  removeLabel,
  removeField,
  uiLabelAdminService,
  type UILabelRow,
} from "../services/uiConfig";
import "../styles/App_User.css";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/ui/skeleton";
import { errorBody, fieldError, messageFrom } from "@/lib/apiError";

const DISPLAY_NAME_MAX = 100;
const FIELD_KEY_MAX = 100;
// Keys are stable machine identifiers clients depend on: lowercase, digits, _.
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const LABELS_KEY = ["ui-labels"] as const;
/** One identity for "no rows yet", so the filter memo below settles. */
const NO_LABELS: UILabelRow[] = [];

/**
 * UI Label Management (admin only).
 *
 * Full CRUD over the dynamic field labels. Creating/renaming/deleting a label
 * refreshes the shared label cache immediately (optimistic) so any open screen —
 * and every client on its next login — reflects the change without a code
 * change or redeploy. `field_key` is set once on create and never editable
 * afterwards: clients depend on it as the stable key.
 */
export default function UILabels() {
  const queryClient = useQueryClient();
  const { data: labels = NO_LABELS, isPending: isLoading } = useQuery({
    queryKey: LABELS_KEY,
    queryFn: uiLabelAdminService.listLabels,
  });

  /**
   * Write the list in the cache.
   *
   * The three CRUD handlers below each patched a local `labels` array so the
   * table updated without a refetch. They still do — the array just lives in
   * the query cache now, which is what makes the patch survive a remount and
   * lets any other reader of this key see it.
   */
  const setLabelRows = (update: (rows: UILabelRow[]) => UILabelRow[]) =>
    queryClient.setQueryData<UILabelRow[]>(LABELS_KEY, (rows) => update(rows ?? []));
  const [search, setSearch] = useState("");

  // Form modal — shared by create ("add") and edit modes.
  const [showForm, setShowForm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editRow, setEditRow] = useState<UILabelRow | null>(null);
  const [fieldKey, setFieldKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  // Field-behaviour flags (apply when the key is an input field, e.g. po_number).
  const [isEnabled, setIsEnabled] = useState(true);
  const [isRequired, setIsRequired] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation.
  const [deleteRow, setDeleteRow] = useState<UILabelRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      normalizedSearch
        ? labels.filter((row) =>
            [row.field_key, row.display_name, row.description]
              .map((value) => String(value ?? "").toLowerCase())
              .some((value) => value.includes(normalizedSearch)),
          )
        : labels,
    [labels, normalizedSearch],
  );

  const openAdd = () => {
    setIsEditMode(false);
    setEditRow(null);
    setFieldKey("");
    setDisplayName("");
    setDescription("");
    setIsActive(true);
    setIsEnabled(true);
    setIsRequired(false);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (row: UILabelRow) => {
    setIsEditMode(true);
    setEditRow(row);
    setFieldKey(row.field_key);
    setDisplayName(row.display_name);
    setDescription(row.description || "");
    setIsActive(row.is_active);
    setIsEnabled(row.is_enabled);
    setIsRequired(row.is_required);
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setIsEditMode(false);
    setEditRow(null);
    setFormError("");
  };

  // Reflect a saved row into the live caches so open screens update now.
  //
  // Labels: inactive → drop so the wording falls back to the hardcoded default.
  // Fields: NEVER drop on inactive — an absent key would make the client fall
  // back to its built-in default (enabled), re-showing a field the admin just
  // turned off. Instead keep the key with the EFFECTIVE flags: inactive OR not
  // enabled ⇒ enabled:false (and a hidden field can't be required). This
  // mirrors the backend /fields/ logic exactly.
  const syncCache = (row: UILabelRow) => {
    if (row.is_active) {
      applyLabelUpdate(row.field_key, row.display_name);
    } else {
      removeLabel(row.field_key);
    }

    const effectiveEnabled = row.is_active && row.is_enabled;
    applyFieldUpdate(row.field_key, {
      label: row.display_name,
      enabled: effectiveEnabled,
      required: effectiveEnabled && row.is_required,
    });

    // Reconcile with the server's canonical maps in the background.
    void loadUILabels(true);
    void loadUIFields(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setFormError("Display Name is required.");
      return;
    }
    if (trimmedName.length > DISPLAY_NAME_MAX) {
      setFormError(`Display Name must be at most ${DISPLAY_NAME_MAX} characters.`);
      return;
    }

    // field_key is only validated/sent on create — it is immutable afterwards.
    const trimmedKey = fieldKey.trim();
    if (!isEditMode) {
      if (!trimmedKey) {
        setFormError("Field Key is required.");
        return;
      }
      if (!FIELD_KEY_PATTERN.test(trimmedKey)) {
        setFormError(
          "Field Key must be lowercase letters, digits and underscores, starting with a letter (e.g. price_list).",
        );
        return;
      }
      if (labels.some((row) => row.field_key === trimmedKey)) {
        setFormError(`Field Key "${trimmedKey}" already exists.`);
        return;
      }
    }

    setIsSaving(true);
    setFormError("");
    try {
      if (isEditMode && editRow) {
        const updated = await uiLabelAdminService.updateLabel(editRow.id, {
          display_name: trimmedName,
          description: description.trim(),
          is_active: isActive,
          is_enabled: isEnabled,
          is_required: isRequired,
        });
        setLabelRows((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
        syncCache(updated);
        showToast({
          title: "Label updated",
          message: `"${updated.field_key}" is now "${updated.display_name}".`,
        });
      } else {
        const created = await uiLabelAdminService.createLabel({
          field_key: trimmedKey,
          display_name: trimmedName,
          description: description.trim(),
          is_active: isActive,
          is_enabled: isEnabled,
          is_required: isRequired,
        });
        setLabelRows((rows) => [...rows, created]);
        syncCache(created);
        showToast({
          title: "Label created",
          message: `"${created.field_key}" → "${created.display_name}".`,
        });
      }
      closeForm();
    } catch (error) {
      // Two NAMED fields, in a deliberate order — `messageFrom`'s "first field
      // wins" cannot express that, which is why this one keeps its own read.
      const errors = errorBody(error)?.errors as Record<string, unknown> | undefined;
      const serverMsg = fieldError(errors, "field_key") ?? fieldError(errors, "display_name");
      setFormError(serverMsg || messageFrom(error, "Could not save the label. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    setIsDeleting(true);
    try {
      await uiLabelAdminService.deleteLabel(deleteRow.id);
      setLabelRows((rows) => rows.filter((row) => row.id !== deleteRow.id));
      // Drop from the live caches — clients fall back to the hardcoded default.
      removeLabel(deleteRow.field_key);
      removeField(deleteRow.field_key);
      void loadUILabels(true);
      void loadUIFields(true);
      showToast({
        title: "Label deleted",
        message: `"${deleteRow.field_key}" was removed.`,
      });
      setDeleteRow(null);
    } catch (error) {
      console.error("Failed to delete label:", error);
      showToast({
        title: "Delete failed",
        message: "Could not delete the label. Please try again.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="au-page app-page">
      {/* ── PAGE HEADER ── */}
      <div className="au-header app-page-head au-header--center">
        <div>
          <h1 className="au-title app-page-title">UI Label Management</h1>
          <p className="au-subtitle app-page-subtitle">
            Rename field labels shown across web and mobile. Changes apply on each client&apos;s
            next login — no deployment or app rebuild needed.
          </p>
        </div>
        <div className="au-header-actions">
          <div className="au-search">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="m17 17-3.2-3.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by field key or name…"
              aria-label="Search labels"
            />
            {search && (
              <button
                type="button"
                className="au-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                &times;
              </button>
            )}
          </div>
          <span className="au-table-count">
            Total: {filtered.length}
          </span>
          <button className="au-toggle-btn" onClick={openAdd} title="Add label">
            <span className="au-btn-label">
              <HiPlus size={16} /> Add Label
            </span>
          </button>
        </div>
      </div>

      {/* ── LABELS TABLE ── */}
      <div className="au-table-card">
        {isLoading ? (
          <TableSkeleton columns={5} label="Loading labels" />
        ) : filtered.length > 0 ? (
          <div className="au-table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field Key</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Behaviour</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="au-muted">
                      <code>{row.field_key}</code>
                    </TableCell>
                    <TableCell className="au-name">{row.display_name}</TableCell>
                    <TableCell>{row.description || <span className="au-muted">—</span>}</TableCell>
                    <TableCell>
                      <span className={`au-chip ${row.is_active ? "au-active" : "au-inactive"}`}>
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="au-cell-chips">
                        <span className={`au-chip ${row.is_enabled ? "au-active" : "au-inactive"}`}>
                          {row.is_enabled ? "Enabled" : "Disabled"}
                        </span>
                        {row.is_enabled && (
                          <span
                            className={`au-chip ${row.is_required ? "au-active" : "au-inactive"}`}
                          >
                            {row.is_required ? "Required" : "Optional"}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="au-cell-actions">
                        <button
                          className="au-edit-btn"
                          onClick={() => openEdit(row)}
                          title="Edit label"
                          aria-label="Edit label"
                        >
                          <HiPencilSquare size={16} />
                        </button>
                        <button
                          className="au-edit-btn au-delete-btn"
                          onClick={() => setDeleteRow(row)}
                          title="Delete label"
                          aria-label="Delete label"
                        >
                          <HiTrash size={16} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "#64748b",
              background: "#f8fafc",
              borderRadius: "8px",
              border: "1px dashed #cbd5e1",
              margin: "20px 0",
            }}
          >
            {search ? "No labels match your search" : "No labels found"}
          </div>
        )}
      </div>

      {/* ── ADD / EDIT LABEL MODAL ── */}
      <Dialog
        open={Boolean(showForm)}
        onOpenChange={(next) => {
          if (!next) setShowForm(false);
        }}
      >
        {showForm && (
          <DialogContent
            title="Label form"
            variant="bare"
            size="auto"
            showClose={false}
            className="au-modal"
          >
            <div className="au-form-toolbar">
              <h2 className="au-form-heading">{isEditMode ? "Edit UI Label" : "Add UI Label"}</h2>
              <button
                type="button"
                className="au-modal-close"
                onClick={closeForm}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="au-form-grid">
                {/* Field key — editable on create, read-only on edit. */}
                <div className="au-field au-full">
                  <label className="au-label">
                    Field Key {!isEditMode && <span className="au-req">*</span>}
                  </label>
                  <input
                    value={fieldKey}
                    onChange={(e) => setFieldKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                    maxLength={FIELD_KEY_MAX}
                    placeholder="e.g. price_list"
                    readOnly={isEditMode}
                    disabled={isEditMode}
                    autoFocus={!isEditMode}
                  />
                  {!isEditMode && (
                    <span className="au-hint">
                      Lowercase letters, digits and underscores. Cannot be changed later — clients
                      use this as the stable key.
                    </span>
                  )}
                </div>

                <div className="au-field au-full">
                  <label className="au-label">
                    Display Name <span className="au-req">*</span>
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={DISPLAY_NAME_MAX}
                    placeholder="e.g. Distributor Price"
                    required
                    autoFocus={isEditMode}
                  />
                  <span className="au-hint">
                    {displayName.trim().length}/{DISPLAY_NAME_MAX}
                  </span>
                </div>

                <div className="au-field au-full">
                  <label className="au-label">Description</label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional note for admins"
                  />
                </div>

                <div className="au-field au-full">
                  <label className="au-label au-check-row">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="au-check"
                    />
                    Active (uncheck to fall back to the built-in default)
                  </label>
                </div>

                {/* Field behaviour — only meaningful for input-field keys such
                    as po_number. Ignored by pure text labels like price_list. */}
                <div className="au-field au-full">
                  <label className="au-label au-label--tight">Field behaviour</label>
                  <span className="au-hint--lead">
                    For input fields (e.g. <code>po_number</code>): control whether the field shows
                    and whether it is mandatory. Text-only labels can ignore these.
                  </span>

                  <label className="au-check-row au-toggle-row au-toggle-row--spaced">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setIsEnabled(next);
                        // A hidden field cannot be required.
                        if (!next) setIsRequired(false);
                      }}
                      className="au-check"
                    />
                    Field enabled (show this field on the form)
                  </label>

                  <label
                    className={`au-check-row au-toggle-row${isEnabled ? "" : " au-toggle-row--muted"}`}
                  >
                    <input
                      type="checkbox"
                      checked={isRequired}
                      disabled={!isEnabled}
                      onChange={(e) => setIsRequired(e.target.checked)}
                      className="au-check"
                    />
                    Field required (mandatory when shown)
                  </label>
                </div>
              </div>

              {formError && (
                <p
                  role="alert"
                  className="au-form-error"
                >
                  {formError}
                </p>
              )}

              <div className="au-form-actions">
                <button type="submit" className="au-submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : isEditMode ? "Save" : "Create Label"}
                </button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      {/* ── DELETE CONFIRMATION ── */}
      <Dialog
        open={Boolean(deleteRow)}
        onOpenChange={(next) => {
          if (!next) setDeleteRow(null);
        }}
      >
        {deleteRow && (
          <DialogContent
            title="Delete label"
            variant="bare"
            size="auto"
            showClose={false}
            className="au-modal"
          >
            <div className="au-form-toolbar">
              <h2 className="au-form-heading">Delete UI Label</h2>
              <button
                type="button"
                className="au-modal-close"
                onClick={() => setDeleteRow(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <p className="au-delete-text">
              Delete <code>{deleteRow.field_key}</code> (<strong>{deleteRow.display_name}</strong>)?
              Clients will fall back to the built-in default text. This cannot be undone.
            </p>
            <div
              className="au-form-actions au-form-actions--gap"
            >
              <button
                type="button"
                className="au-submit au-btn-cancel"
                onClick={() => setDeleteRow(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="au-submit au-btn-danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
