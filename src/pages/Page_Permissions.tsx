import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiCheck,
  HiCheckCircle,
  HiChevronDown,
  HiExclamationCircle,
  HiMagnifyingGlass,
  HiShieldCheck,
} from "react-icons/hi2";
import { userService } from "../services/userService";
import type { User } from "../services/userService";
import { GRANTABLE_ADMIN_PAGES, GRANTABLE_PAGE_KEYS } from "../config/adminPages";
import "../styles/Order_Flow_Settings.css";
import "../styles/Page_Permissions.css";

const isAdminRole = (role?: string) => String(role || "").trim().toLowerCase() === "admin";

type ToggleRowProps = {
  title: string;
  subtitle?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
};

function ToggleRow({ title, subtitle, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
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

export default function Page_Permissions() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successVisible, setSuccessVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await userService.getUsers();
      const list: User[] = Array.isArray(response) ? response : response?.data ?? [];
      setUsers(list);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Unable to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedUserIds.includes(user.id)),
    [users, selectedUserIds]
  );
  const nonAdminSelected = useMemo(
    () => selectedUsers.filter((user) => !isAdminRole(user.role)),
    [selectedUsers]
  );
  const adminSelectedCount = selectedUsers.length - nonAdminSelected.length;

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.name, user.username, user.role].some((value) =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }, [users, userSearch]);

  // Page set = union of the selected non-admin users' current grants, so the
  // admin starts from what those users already have.
  const computePagesFor = (ids: number[]) => {
    const granted = new Set<string>();
    users.forEach((user) => {
      if (!ids.includes(user.id) || isAdminRole(user.role)) return;
      (user.extra_pages || []).forEach((key) => {
        if (GRANTABLE_PAGE_KEYS.includes(key)) granted.add(key);
      });
    });
    return Array.from(granted);
  };

  const toggleUser = (user: User) => {
    setSelectedUserIds((current) => {
      const next = current.includes(user.id)
        ? current.filter((id) => id !== user.id)
        : [...current, user.id];
      setPages(computePagesFor(next));
      return next;
    });
    setError("");
  };

  const togglePage = (key: string) => {
    setPages((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
    );
  };

  const setAll = (grantAll: boolean) => {
    setPages(grantAll ? [...GRANTABLE_PAGE_KEYS] : []);
  };

  const triggerLabel = () => {
    if (selectedUsers.length === 0) return "Choose users";
    if (selectedUsers.length === 1) {
      const user = selectedUsers[0];
      return `${user.name || user.username}${user.role ? ` · ${user.role}` : ""}`;
    }
    return `${selectedUsers.length} users selected`;
  };

  const handleSave = async () => {
    if (nonAdminSelected.length === 0) return;
    setSaving(true);
    setError("");
    try {
      await Promise.all(
        nonAdminSelected.map((user) => userService.updatePagePermissions(user.id, pages))
      );
      const savedIds = nonAdminSelected.map((user) => user.id);
      setUsers((current) =>
        current.map((user) =>
          savedIds.includes(user.id) ? { ...user, extra_pages: pages } : user
        )
      );
      setSuccessVisible(true);
    } catch (err) {
      console.error("Error saving page permissions:", err);
      setError("Unable to save page access. Make sure you are logged in as admin.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ofs-page">
        <div className="ofs-loading">
          <span className="ofs-spinner" />
          <span>Loading users...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ofs-page">
      <div className="ofs-header">
        <div>
          <span className="ofs-kicker">Access Control</span>
          <h1>Page Permissions</h1>
          <p>Grant access to admin pages for any user. Granted pages appear in their sidebar.</p>
        </div>
        <button type="button" className="ofs-refresh" onClick={() => void fetchUsers()}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="ofs-alert">
          <HiExclamationCircle />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="ofs-grid">
        <section className="ofs-card">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>Select Users</h2>
          </div>

          <div className="ofs-flow-select" ref={menuRef}>
            <button type="button" className="ofs-flow-trigger" onClick={() => setMenuOpen((open) => !open)}>
              <span>
                <small>Selected Users</small>
                <strong>{triggerLabel()}</strong>
              </span>
              <HiChevronDown className={menuOpen ? "is-open" : ""} />
            </button>
            {menuOpen ? (
              <div className="ofs-flow-menu pp-user-menu">
                <label className="pp-user-search">
                  <HiMagnifyingGlass />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Search by name, username or role"
                    autoFocus
                  />
                </label>
                <div className="pp-user-options">
                  {filteredUsers.length === 0 ? (
                    <div className="pp-user-empty">No users found</div>
                  ) : (
                    filteredUsers.map((user) => {
                      const checked = selectedUserIds.includes(user.id);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          className={`ofs-flow-option${checked ? " is-selected" : ""}`}
                          onClick={() => toggleUser(user)}
                        >
                          <span className="pp-user-option-text">
                            <span>{user.name || user.username}</span>
                            <small>
                              {user.username}
                              {user.role ? ` · ${user.role}` : ""}
                            </small>
                          </span>
                          {checked ? <HiCheckCircle /> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {selectedUsers.length > 0 ? (
            <div className="pp-chip-wrap">
              {selectedUsers.map((user) => (
                <span key={user.id} className="pp-chip">
                  {user.name || user.username}
                  <button
                    type="button"
                    className="pp-chip-remove"
                    onClick={() => toggleUser(user)}
                    aria-label={`Remove ${user.name || user.username}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {selectedUsers.length > 1 ? (
            <p className="pp-hint">
              Saving applies the selected pages to all {selectedUsers.length} users (replacing
              their current access).
            </p>
          ) : null}
        </section>

        <section className="ofs-card">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>Quick Actions</h2>
          </div>
          {selectedUsers.length === 0 ? (
            <p className="pp-hint">Select one or more users to manage their page access.</p>
          ) : nonAdminSelected.length === 0 ? (
            <div className="pp-admin-note">
              <HiShieldCheck />
              <span>
                Admins already have full access to every page. Select a non-admin user to manage
                access.
              </span>
            </div>
          ) : (
            <>
              {adminSelectedCount > 0 ? (
                <p className="pp-hint">
                  {adminSelectedCount} admin{adminSelectedCount > 1 ? "s" : ""} in your selection
                  will be skipped (they already have full access).
                </p>
              ) : null}
              <div className="pp-quick-actions">
                <button type="button" className="ofs-secondary" onClick={() => setAll(true)}>
                  Grant all pages
                </button>
                <button type="button" className="ofs-secondary" onClick={() => setAll(false)}>
                  Clear all
                </button>
                <span className="pp-count">
                  {pages.length} / {GRANTABLE_ADMIN_PAGES.length} granted
                </span>
              </div>
            </>
          )}
        </section>

        <section className="ofs-card ofs-card--wide">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>Allowed Pages</h2>
          </div>

          {nonAdminSelected.length === 0 ? (
            <p className="pp-hint">Pick one or more non-admin users from the dropdown above to choose which admin pages they can open.</p>
          ) : (
            <div className="ofs-condition-grid">
              {GRANTABLE_ADMIN_PAGES.map((page) => (
                <ToggleRow
                  key={page.key}
                  title={page.label}
                  subtitle={page.path}
                  checked={pages.includes(page.key)}
                  onChange={() => togglePage(page.key)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="ofs-actions">
        <button
          type="button"
          className="ofs-save"
          onClick={() => void handleSave()}
          disabled={saving || nonAdminSelected.length === 0}
        >
          {saving ? "Saving..." : "Save Access"}
        </button>
      </div>

      {successVisible ? (
        <div className="ofs-modal-backdrop" onClick={() => setSuccessVisible(false)}>
          <div className="ofs-modal" onClick={(event) => event.stopPropagation()}>
            <div className="ofs-success-icon">
              <HiCheck />
            </div>
            <h2>Access Saved</h2>
            <p>
              Page access updated successfully for {nonAdminSelected.length} user
              {nonAdminSelected.length > 1 ? "s" : ""}.
            </p>
            <div className="ofs-modal-actions">
              <button type="button" className="ofs-primary" onClick={() => setSuccessVisible(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
