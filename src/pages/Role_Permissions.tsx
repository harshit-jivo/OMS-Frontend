import { useEffect, useMemo, useState } from "react";
import {
  HiCheck,
  HiCheckCircle,
  HiExclamationCircle,
  HiShieldCheck,
} from "react-icons/hi2";
import { userService } from "../services/userService";
import "../styles/Order_Flow_Settings.css";
import "../styles/Page_Permissions.css";
import "../styles/Role_Permissions.css";

/**
 * The Role Permissions matrix — what each role can do, visible and editable.
 *
 * This is the screen the permission system never had: `Page_Permissions`
 * edits one USER's grants, but what a ROLE conferred lived in backend code
 * where only a deploy could change it. Both halves render from the server —
 * the registry (`/auth/permission-registry/`) supplies every grantable key
 * with its label, the roles call supplies each role's bundle — so this page
 * has no key list of its own to drift out of date.
 *
 * Saving replaces the selected role's bundle wholesale (what is ticked is
 * granted, what is not is not) and takes effect on each holder's next
 * request server-side; their browser catches up on its next profile load.
 *
 * The `admin` role is shown but not editable: administrators hold every
 * registered key implicitly (see `core.permissions.effective_keys`), so a
 * stored bundle for them would be a second copy to keep in step.
 */

type RegistryModule = { name: string; keys: { key: string; label: string }[] };
type RoleRow = {
  id: number;
  name: string;
  display_name: string;
  is_active: boolean;
  keys: string[];
  /** Distinct holders (primary or extra). A held role cannot be deleted. */
  users: number;
};

/** Mirrors PRIVILEGED_ROLE_NAMES on the server: these cannot be deleted or
 *  deactivated, and the server refuses even if this list drifts. */
const PRIVILEGED_ROLES = new Set(["admin", "tracker_admin"]);

function apiMessage(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { message?: string } } })?.response
    ?.data?.message;
  return detail || fallback;
}

const MODULE_TITLES: Record<string, string> = {
  orders: "Orders & Sales Flow",
  pages: "Admin Pages",
  payments: "Payments Actions",
  invoices: "Invoices",
  tracker: "Document Tracker",
};

function ToggleRow({
  title,
  subtitle,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`ofs-toggle-row${checked ? " is-checked" : ""}${disabled ? " is-disabled" : ""}`}
      onClick={onChange}
      disabled={disabled}
    >
      <span className="ofs-checkbox" aria-hidden="true">
        {checked ? <HiCheck /> : null}
      </span>
      <span className="ofs-toggle-text">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </button>
  );
}

export default function Role_Permissions() {
  const [modules, setModules] = useState<RegistryModule[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [migrated, setMigrated] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  // Role lifecycle state
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDisplay, setNewDisplay] = useState("");
  const [creating, setCreating] = useState(false);
  const [editDisplay, setEditDisplay] = useState("");
  const [roleBusy, setRoleBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [registry, rolePerms] = await Promise.all([
          userService.getPermissionRegistry(),
          userService.getRolePermissions(),
        ]);
        if (cancelled) return;
        setModules(registry.data.modules);
        setMigrated(rolePerms.data.migrated);
        setRoles(rolePerms.data.roles);
      } catch {
        if (!cancelled) setError("Could not load roles or the permission registry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );
  const isAdminRole = (selected?.name ?? "").trim().toLowerCase() === "admin";

  function selectRole(role: RoleRow) {
    setSelectedId(role.id);
    setDraftKeys(new Set(role.keys));
    setEditDisplay(role.display_name);
    setSavedMsg("");
    setError("");
  }

  async function createRole() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await userService.createRole(name, newDisplay.trim() || name);
      const created: RoleRow = { ...res.data, keys: [], users: 0 };
      setRoles((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewOpen(false);
      setNewName("");
      setNewDisplay("");
      selectRole(created);
    } catch (e) {
      setError(apiMessage(e, "Could not create the role."));
    } finally {
      setCreating(false);
    }
  }

  async function saveRoleDetails(patch: { display_name?: string; is_active?: boolean }) {
    if (!selected || roleBusy) return;
    setRoleBusy(true);
    setError("");
    try {
      const res = await userService.updateRole(selected.id, patch);
      setRoles((prev) =>
        prev.map((r) => (r.id === selected.id ? { ...r, ...res.data } : r)),
      );
      setSavedMsg(res.message);
    } catch (e) {
      setError(apiMessage(e, "Could not update the role."));
    } finally {
      setRoleBusy(false);
    }
  }

  async function deleteRole() {
    if (!selected || roleBusy) return;
    if (!window.confirm(`Delete the role "${selected.display_name}"? Its permission bundle is deleted with it.`)) {
      return;
    }
    setRoleBusy(true);
    setError("");
    try {
      const res = await userService.deleteRole(selected.id);
      setRoles((prev) => prev.filter((r) => r.id !== selected.id));
      setSelectedId(null);
      setSavedMsg(res.message);
    } catch (e) {
      setError(apiMessage(e, "Could not delete the role."));
    } finally {
      setRoleBusy(false);
    }
  }

  function toggleKey(key: string) {
    setDraftKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSavedMsg("");
  }

  const dirty = useMemo(() => {
    if (!selected) return false;
    const current = new Set(selected.keys);
    if (current.size !== draftKeys.size) return true;
    for (const k of draftKeys) if (!current.has(k)) return true;
    return false;
  }, [selected, draftKeys]);

  async function save() {
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    try {
      const keys = Array.from(draftKeys);
      const res = await userService.updateRolePermissions(selected.id, keys);
      if (res.success) {
        setRoles((prev) =>
          prev.map((r) => (r.id === selected.id ? { ...r, keys } : r)),
        );
        setSavedMsg(`Saved — holders of ${selected.display_name} are updated on their next request.`);
      } else {
        setError(res.message || "Save failed.");
      }
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="ofs-page">
        <div className="ofs-loading">
          <span className="ofs-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="ofs-page">
      <div className="ofs-header">
        <div>
          <span className="ofs-kicker">Access Control</span>
          <h1>
            <HiShieldCheck aria-hidden="true" /> Role Permissions
          </h1>
          <p>
            What each role can do. A permission ticked here is held by every
            user with that role — as primary or extra — on top of any personal
            grants from the Permissions page.
          </p>
        </div>
      </div>

      {!migrated && (
        <div className="ofs-alert">
          <HiExclamationCircle aria-hidden="true" />
          Role permission storage is not migrated on this server yet — bundles
          show as empty and saving is disabled until{" "}
          <code>manage.py migrate users</code> has run.
        </div>
      )}
      {error && (
        <div className="ofs-alert">
          <HiExclamationCircle aria-hidden="true" /> {error}
        </div>
      )}

      <div className="ofs-grid">
        <section className="ofs-card">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>Roles</h2>
            <button
              type="button"
              className="ofs-refresh rp-new-btn"
              onClick={() => setNewOpen((v) => !v)}
            >
              {newOpen ? "Cancel" : "+ New role"}
            </button>
          </div>

          {newOpen && (
            <div className="rp-new-form">
              <input
                type="text"
                placeholder="name (e.g. dispatch_clerk) — permanent"
                value={newName}
                maxLength={50}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Display name (e.g. Dispatch Clerk)"
                value={newDisplay}
                maxLength={100}
                onChange={(e) => setNewDisplay(e.target.value)}
              />
              <button
                type="button"
                className="ofs-refresh"
                disabled={!newName.trim() || creating}
                onClick={() => void createRole()}
              >
                {creating ? "Creating…" : "Create role"}
              </button>
              <p className="pp-hint">
                The name is how code and reports refer to the role and cannot
                be changed later; the display name can.
              </p>
            </div>
          )}

          <div className="rp-role-list">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={`rp-role-row${role.id === selectedId ? " is-selected" : ""}`}
                onClick={() => selectRole(role)}
              >
                <span className="rp-role-name">
                  {role.display_name}
                  {!role.is_active && <small> (inactive)</small>}
                </span>
                <span className="rp-role-meta">
                  {role.users} user{role.users === 1 ? "" : "s"} ·{" "}
                  {role.name.trim().toLowerCase() === "admin"
                    ? "all permissions"
                    : `${role.keys.length} permission${role.keys.length === 1 ? "" : "s"}`}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="ofs-card">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>
              {selected
                ? `Permissions — ${selected.display_name}`
                : "Select a role"}
            </h2>
          </div>

          {!selected && (
            <p className="pp-hint">
              Pick a role on the left to see and edit what it grants.
            </p>
          )}

          {selected && isAdminRole && (
            <div className="ofs-alert">
              <HiCheckCircle aria-hidden="true" />
              Administrators hold every permission implicitly. There is nothing
              to tick — and nothing that can be unticked.
            </div>
          )}

          {selected && (
            <div className="rp-details">
              <div className="rp-details-row">
                <label htmlFor="rp-display-name">Display name</label>
                <input
                  id="rp-display-name"
                  type="text"
                  value={editDisplay}
                  maxLength={100}
                  disabled={roleBusy}
                  onChange={(e) => setEditDisplay(e.target.value)}
                />
                <button
                  type="button"
                  className="ofs-refresh"
                  disabled={
                    roleBusy ||
                    !editDisplay.trim() ||
                    editDisplay.trim() === selected.display_name
                  }
                  onClick={() => void saveRoleDetails({ display_name: editDisplay.trim() })}
                >
                  Rename
                </button>
              </div>
              <div className="rp-details-row">
                <span className="rp-details-name">
                  name: <code>{selected.name}</code> (permanent) ·{" "}
                  {selected.users} user{selected.users === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  className="ofs-refresh"
                  disabled={roleBusy || PRIVILEGED_ROLES.has(selected.name.trim().toLowerCase())}
                  title={
                    PRIVILEGED_ROLES.has(selected.name.trim().toLowerCase())
                      ? "Privileged roles cannot be deactivated."
                      : selected.is_active
                        ? "Deactivate: holders keep the role but its permission bundle stops granting."
                        : "Reactivate the role."
                  }
                  onClick={() => void saveRoleDetails({ is_active: !selected.is_active })}
                >
                  {selected.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  className="ofs-refresh rp-danger"
                  disabled={
                    roleBusy ||
                    selected.users > 0 ||
                    PRIVILEGED_ROLES.has(selected.name.trim().toLowerCase())
                  }
                  title={
                    PRIVILEGED_ROLES.has(selected.name.trim().toLowerCase())
                      ? "Privileged roles cannot be deleted."
                      : selected.users > 0
                        ? `${selected.users} user${selected.users === 1 ? "" : "s"} still hold this role — reassign them first.`
                        : "Delete this role and its permission bundle."
                  }
                  onClick={() => void deleteRole()}
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          {selected && !isAdminRole && (
            <>
              {modules.map((module) => (
                <div key={module.name} className="rp-module">
                  <h3 className="rp-module-title">
                    {MODULE_TITLES[module.name] ?? module.name}
                  </h3>
                  {module.keys.map(({ key, label }) => (
                    <ToggleRow
                      key={key}
                      title={label}
                      subtitle={key}
                      checked={draftKeys.has(key)}
                      disabled={!migrated || saving}
                      onChange={() => toggleKey(key)}
                    />
                  ))}
                </div>
              ))}

              <div className="rp-actions">
                <button
                  type="button"
                  className="ofs-refresh"
                  disabled={!dirty || !migrated || saving}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                </button>
                {savedMsg && (
                  <span className="rp-saved">
                    <HiCheckCircle aria-hidden="true" /> {savedMsg}
                  </span>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
