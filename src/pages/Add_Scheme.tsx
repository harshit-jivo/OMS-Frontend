import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ordersService } from "../services/ordersService";
import type { SchemeRow } from "../services/ordersService";
import { userService } from "../services/userService";
import "../styles/Add_Scheme.css";

type StateOption = {
  id: number;
  name: string;
  code: string;
};

const EMPTY_FORM = { scheme_name: "", item_code: "", state_code: "" };

// The API reports duplicate/validation problems per field; surface the first one
// rather than a generic "failed" alert.
const readApiError = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: unknown } })?.response?.data as
    | { message?: string; errors?: Record<string, string[] | string> }
    | undefined;
  if (data?.errors) {
    const first = Object.values(data.errors)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === "string") return first;
  }
  return data?.message || fallback;
};

export default function Add_Scheme() {
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [states, setStates] = useState<StateOption[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  // null = creating a new scheme; a number = editing that scheme_id.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [schemes, setSchemes] = useState<SchemeRow[]>([]);
  const [isLoadingSchemes, setIsLoadingSchemes] = useState(false);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const payload = {
    scheme_name: formData.scheme_name,
    item_code: formData.item_code,
    state_code: formData.state_code,
  };

  const loadSchemes = useCallback(async () => {
    setIsLoadingSchemes(true);
    try {
      const rows = await ordersService.getSchemesForManage({
        include_inactive: includeInactive,
      });
      setSchemes(rows);
    } catch (error) {
      console.error("Error fetching schemes:", error);
      setSchemes([]);
      setFeedback({ kind: "error", text: readApiError(error, "Could not load schemes") });
    } finally {
      setIsLoadingSchemes(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void loadSchemes();
  }, [loadSchemes]);

  // Client-side filter: the list is small (tens of rows) so there is no need to
  // round-trip the server on every keystroke.
  const visibleSchemes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return schemes;
    return schemes.filter(
      (row) =>
        row.scheme_name?.toLowerCase().includes(term) ||
        row.item_code?.toLowerCase().includes(term) ||
        row.item_name?.toLowerCase().includes(term) ||
        row.state_code?.toLowerCase().includes(term),
    );
  }, [schemes, search]);

  useEffect(() => {
    const fetchStates = async () => {
      setIsLoadingStates(true);
      try {
        const data = await userService.getState();
        setStates(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error fetching states:", error);
        setStates([]);
      } finally {
        setIsLoadingStates(false);
      }
    };

    void fetchStates();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        stateDropdownRef.current &&
        !stateDropdownRef.current.contains(event.target as Node)
      ) {
        setStateDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (editingId !== null) {
        await ordersService.updateScheme(editingId, payload);
        setFeedback({ kind: "ok", text: `Scheme #${editingId} updated` });
      } else {
        await ordersService.createScheme(payload);
        setFeedback({ kind: "ok", text: "Scheme created successfully" });
      }

      setFormData(EMPTY_FORM);
      setEditingId(null);
      await loadSchemes();
    } catch (error) {
      console.error("Error:", error);
      setFeedback({
        kind: "error",
        text: readApiError(
          error,
          editingId !== null ? "Failed to update scheme" : "Failed to create scheme",
        ),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (row: SchemeRow) => {
    setEditingId(row.scheme_id);
    setFormData({
      scheme_name: row.scheme_name ?? "",
      item_code: row.item_code ?? "",
      state_code: row.state_code ?? "",
    });
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFeedback(null);
  };

  const handleDelete = async (row: SchemeRow) => {
    const confirmed = window.confirm(
      `Deactivate "${row.scheme_name}" (${row.state_code || "no state"} / ${row.item_code || "no item"})?\n\n` +
        "It will stop appearing in Add Sales and stop adding free lines to new SAP orders. " +
        "Existing orders keep their history, and you can re-activate it later.",
    );
    if (!confirmed) return;

    setBusyId(row.scheme_id);
    setFeedback(null);
    try {
      const result = await ordersService.deleteScheme(row.scheme_id);
      setFeedback({
        kind: "ok",
        text: result?.message || `Scheme #${row.scheme_id} deactivated`,
      });
      if (editingId === row.scheme_id) cancelEdit();
      await loadSchemes();
    } catch (error) {
      console.error("Error:", error);
      setFeedback({ kind: "error", text: readApiError(error, "Failed to deactivate scheme") });
    } finally {
      setBusyId(null);
    }
  };

  const handleReactivate = async (row: SchemeRow) => {
    setBusyId(row.scheme_id);
    setFeedback(null);
    try {
      await ordersService.updateScheme(row.scheme_id, { is_active: true });
      setFeedback({ kind: "ok", text: `Scheme #${row.scheme_id} re-activated` });
      await loadSchemes();
    } catch (error) {
      console.error("Error:", error);
      setFeedback({ kind: "error", text: readApiError(error, "Failed to re-activate scheme") });
    } finally {
      setBusyId(null);
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const selectedStateName =
    states.find((state) => state.code === formData.state_code)?.name ||
    (isLoadingStates ? "Loading states..." : "Select state");

  return (
    <div className="asg-page app-page">
      {/* <div className="asg-header app-page-head">
        <div>
          <span className="app-chip asg-chip">Scheme Setup</span>
          <h1 className="asg-title app-page-title">Add Scheme</h1>
          <p className="asg-subtitle app-page-subtitle">
            Create product schemes.
          </p>
        </div>
      </div> */}

      <div className="asg-form-card app-card">
        <div className="asg-form-head">
          <h1 className="asg-form-title">
            {editingId !== null ? `Edit Scheme #${editingId}` : "Add Scheme"}
          </h1>
          {editingId !== null && (
            <p className="asg-form-subtitle">
              Editing an existing scheme. Changes apply to future orders only.
            </p>
          )}
        </div>

        {feedback && (
          <div
            className={`asg-feedback is-${feedback.kind}`}
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.text}
          </div>
        )}

        <form className="asg-form" onSubmit={handleSubmit}>
          <div className="asg-form-grid">
            <div className="asg-field">
              <label className="asg-label" htmlFor="scheme_name">
                Scheme Name
              </label>
              <div className="asg-input-wrap">
                <input
                  id="scheme_name"
                  name="scheme_name"
                  type="text"
                  placeholder="Enter scheme name"
                  value={formData.scheme_name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="asg-field">
              <label className="asg-label">
                State
              </label>
              <div className="asg-dropdown" ref={stateDropdownRef}>
                <button
                  type="button"
                  className="asg-dropdown-trigger"
                  onClick={() => !isLoadingStates && setStateDropdownOpen((value) => !value)}
                  disabled={isLoadingStates}
                  aria-expanded={stateDropdownOpen}
                >
                  <span>{selectedStateName}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M3 4.5L6 7.5L9 4.5"
                      stroke="#64748b"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {stateDropdownOpen && (
                  <div className="asg-dropdown-menu">
                    {states.map((state) => (
                      <button
                        key={state.id}
                        type="button"
                        className={`asg-dropdown-option${formData.state_code === state.code ? " is-selected" : ""}`}
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, state_code: state.code }));
                          setStateDropdownOpen(false);
                        }}
                      >
                        {state.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="asg-field">
              <label className="asg-label" htmlFor="item_code">
                Item Code
              </label>
              <div className="asg-input-wrap">
                <input
                  id="item_code"
                  name="item_code"
                  type="text"
                  placeholder="Eg: FG0000005"
                  value={formData.item_code}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

          </div>

          <div className="asg-actions">
            {editingId !== null && (
              <button
                className="asg-cancel"
                type="button"
                onClick={cancelEdit}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            )}
            <button
              className="asg-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Saving..."
                : editingId !== null
                  ? "Update Scheme"
                  : "Submit"}
            </button>
          </div>
        </form>
      </div>

      <div className="asg-list-card app-card">
        <div className="asg-list-head">
          <h2 className="asg-list-title">
            Existing Schemes{" "}
            <span className="asg-count">
              {isLoadingSchemes ? "" : `(${visibleSchemes.length})`}
            </span>
          </h2>

          <div className="asg-list-tools">
            <input
              className="asg-search"
              type="search"
              placeholder="Search name, item code or state"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="asg-toggle">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Show deactivated
            </label>
          </div>
        </div>

        <div className="asg-table-wrap">
          <table className="asg-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Scheme Name</th>
                <th>State</th>
                <th>Free Item</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {isLoadingSchemes ? (
                <tr>
                  <td colSpan={6} className="asg-empty">
                    Loading schemes...
                  </td>
                </tr>
              ) : visibleSchemes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="asg-empty">
                    No schemes found.
                  </td>
                </tr>
              ) : (
                visibleSchemes.map((row) => {
                  const isBusy = busyId === row.scheme_id;
                  return (
                    <tr
                      key={row.scheme_id}
                      className={[
                        row.is_active ? "" : "is-inactive",
                        editingId === row.scheme_id ? "is-editing" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td>{row.scheme_id}</td>
                      <td>{row.scheme_name}</td>
                      <td>{row.state_code || "—"}</td>
                      <td>
                        {row.item_code || "—"}
                        {row.item_name ? (
                          <span className="asg-item-name">{row.item_name}</span>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`asg-badge ${row.is_active ? "is-active" : "is-off"}`}
                        >
                          {row.is_active ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td className="asg-row-actions">
                        <button
                          type="button"
                          className="asg-link"
                          onClick={() => startEdit(row)}
                          disabled={isBusy}
                        >
                          Edit
                        </button>
                        {row.is_active ? (
                          <button
                            type="button"
                            className="asg-link is-danger"
                            onClick={() => handleDelete(row)}
                            disabled={isBusy}
                          >
                            {isBusy ? "..." : "Delete"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="asg-link"
                            onClick={() => handleReactivate(row)}
                            disabled={isBusy}
                          >
                            {isBusy ? "..." : "Re-activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
