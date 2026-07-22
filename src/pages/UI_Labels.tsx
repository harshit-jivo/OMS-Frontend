import { useEffect, useMemo, useState } from "react";
import { HiPencilSquare, HiTrash, HiPlus } from "react-icons/hi2";

import { showToast } from "../components/NotificationToaster";
import {
  applyLabelUpdate,
  loadUILabels,
  removeLabel,
  uiLabelAdminService,
  type UILabelRow,
} from "../services/uiConfig";
import "../styles/App_User.css";

const DISPLAY_NAME_MAX = 100;
const FIELD_KEY_MAX = 100;
// Keys are stable machine identifiers clients depend on: lowercase, digits, _.
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

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
  const [labels, setLabelRows] = useState<UILabelRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Form modal — shared by create ("add") and edit modes.
  const [showForm, setShowForm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editRow, setEditRow] = useState<UILabelRow | null>(null);
  const [fieldKey, setFieldKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation.
  const [deleteRow, setDeleteRow] = useState<UILabelRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchLabels = async () => {
    setIsLoading(true);
    try {
      const rows = await uiLabelAdminService.listLabels();
      setLabelRows(rows);
    } catch (error) {
      console.error("Failed to load UI labels:", error);
      showToast({
        title: "Load failed",
        message: "Could not load UI labels. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchLabels();
  }, []);

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
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setIsEditMode(false);
    setEditRow(null);
    setFormError("");
  };

  // Reflect a saved row into the live label cache so open screens update now.
  // Active → publish the wording; inactive → clients fall back to the hardcoded
  // default, so drop it from the cache.
  const syncCache = (row: UILabelRow) => {
    if (row.is_active) {
      applyLabelUpdate(row.field_key, row.display_name);
    } else {
      removeLabel(row.field_key);
    }
    // Reconcile with the server's canonical active map in the background.
    void loadUILabels(true);
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
        });
        setLabelRows((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)),
        );
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
        });
        setLabelRows((rows) => [...rows, created]);
        syncCache(created);
        showToast({
          title: "Label created",
          message: `"${created.field_key}" → "${created.display_name}".`,
        });
      }
      closeForm();
    } catch (error: any) {
      const data = error?.response?.data;
      const serverMsg =
        data?.errors?.field_key?.[0] ||
        data?.errors?.display_name?.[0] ||
        data?.message;
      setFormError(serverMsg || "Could not save the label. Please try again.");
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
      // Drop from the live cache — clients fall back to the hardcoded default.
      removeLabel(deleteRow.field_key);
      void loadUILabels(true);
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
      <div
        className="au-header app-page-head"
        style={{ marginBottom: "24px", alignItems: "center" }}
      >
        <div>
          <h1 className="au-title app-page-title">UI Label Management</h1>
          <p
            className="au-subtitle app-page-subtitle"
            style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}
          >
            Rename field labels shown across web and mobile. Changes apply on
            each client&apos;s next login — no deployment or app rebuild needed.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
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
          <span className="au-table-count" style={{ margin: 0 }}>
            Total: {filtered.length}
          </span>
          <button
            className="au-toggle-btn"
            onClick={openAdd}
            title="Add label"
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <HiPlus size={16} /> Add Label
            </span>
          </button>
        </div>
      </div>

      {/* ── LABELS TABLE ── */}
      <div className="au-table-card">
        {isLoading ? (
          <div className="order-loading-state">
            <span className="order-loading-spinner" />
            <span>Loading labels...</span>
          </div>
        ) : filtered.length > 0 ? (
          <div className="au-table-wrap">
            <table className="au-table">
              <thead>
                <tr>
                  <th>Field Key</th>
                  <th>Display Name</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="au-muted">
                      <code>{row.field_key}</code>
                    </td>
                    <td className="au-name">{row.display_name}</td>
                    <td>{row.description || <span className="au-muted">—</span>}</td>
                    <td>
                      <span
                        className={`au-chip ${
                          row.is_active ? "au-active" : "au-inactive"
                        }`}
                      >
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "8px" }}>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      {showForm && (
        <div className="au-modal-overlay" role="dialog" aria-modal="true">
          <div className="au-modal">
            <div className="au-form-toolbar">
              <h2 className="au-form-heading">
                {isEditMode ? "Edit UI Label" : "Add UI Label"}
              </h2>
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
                    Field Key{" "}
                    {!isEditMode && <span style={{ color: "#dc2626" }}>*</span>}
                  </label>
                  <input
                    value={fieldKey}
                    onChange={(e) =>
                      setFieldKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))
                    }
                    maxLength={FIELD_KEY_MAX}
                    placeholder="e.g. price_list"
                    readOnly={isEditMode}
                    disabled={isEditMode}
                    autoFocus={!isEditMode}
                  />
                  {!isEditMode && (
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#94a3b8",
                        marginTop: "4px",
                      }}
                    >
                      Lowercase letters, digits and underscores. Cannot be changed
                      later — clients use this as the stable key.
                    </span>
                  )}
                </div>

                <div className="au-field au-full">
                  <label className="au-label">
                    Display Name <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={DISPLAY_NAME_MAX}
                    placeholder="e.g. Distributor Price"
                    required
                    autoFocus={isEditMode}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#94a3b8",
                      marginTop: "4px",
                    }}
                  >
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
                  <label
                    className="au-label"
                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      style={{ width: "auto" }}
                    />
                    Active (uncheck to fall back to the built-in default)
                  </label>
                </div>
              </div>

              {formError && (
                <p
                  role="alert"
                  style={{
                    color: "#dc2626",
                    fontSize: "13px",
                    margin: "8px 0 0",
                  }}
                >
                  {formError}
                </p>
              )}

              <div className="au-form-actions">
                <button type="submit" className="au-submit" disabled={isSaving}>
                  {isSaving
                    ? "Saving..."
                    : isEditMode
                      ? "Save"
                      : "Create Label"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION ── */}
      {deleteRow && (
        <div className="au-modal-overlay" role="dialog" aria-modal="true">
          <div className="au-modal" style={{ maxWidth: "440px" }}>
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
            <p style={{ fontSize: "14px", color: "#475569", lineHeight: 1.5 }}>
              Delete <code>{deleteRow.field_key}</code> (
              <strong>{deleteRow.display_name}</strong>)? Clients will fall back to
              the built-in default text. This cannot be undone.
            </p>
            <div
              className="au-form-actions"
              style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="au-submit"
                onClick={() => setDeleteRow(null)}
                disabled={isDeleting}
                style={{ background: "#e2e8f0", color: "#0f172a" }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="au-submit"
                onClick={handleDelete}
                disabled={isDeleting}
                style={{ background: "#dc2626" }}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
