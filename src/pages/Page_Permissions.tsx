import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiCheck,
  HiCheckCircle,
  HiChevronDown,
  HiExclamationCircle,
  HiMagnifyingGlass,
  HiShieldCheck,
} from "react-icons/hi2";
import { useQueryClient } from "@tanstack/react-query";
import { userService } from "../services/userService";
import type { User } from "../services/userService";
import { useUserList } from "../lib/authQueries";
import {
  ALL_GRANTABLE_KEYS,
  GRANTABLE_ADMIN_PAGES,
  PAYMENT_ACTION_PERMISSIONS,
} from "../config/adminPages";
import "../styles/Order_Flow_Settings.css";
import "../styles/Page_Permissions.css";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const isAdminRole = (role?: string) =>
  String(role || "")
    .trim()
    .toLowerCase() === "admin";

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

export default function Page_Permissions() {
  const queryClient = useQueryClient();
  // Shared with App_User, Party_Assignment and the three manager reports under
  // ["users"]. This page's tolerant unwrap is the one that moved into the hook —
  // the other two consumers assumed the `{data}` envelope and threw without it.
  const { users, isLoading: loading, isError: loadFailed } = useUserList();

  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [saving, setSaving] = useState(false);
  /** Save failures only. The load failure is the query's, so the two no longer
   *  overwrite each other. */
  const [saveError, setSaveError] = useState("");
  const [successVisible, setSuccessVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const error = saveError || (loadFailed ? "Unable to load users." : "");

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
    [users, selectedUserIds],
  );
  const nonAdminSelected = useMemo(
    () => selectedUsers.filter((user) => !isAdminRole(user.role)),
    [selectedUsers],
  );
  const adminSelectedCount = selectedUsers.length - nonAdminSelected.length;

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.name, user.username, user.role].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [users, userSearch]);

  // Page set = union of the selected non-admin users' current grants, so the
  // admin starts from what those users already have.
  const computePagesFor = (ids: number[]) => {
    const granted = new Set<string>();
    users.forEach((user) => {
      if (!ids.includes(user.id) || isAdminRole(user.role)) return;
      (user.extra_pages || []).forEach((key) => {
        // Action permissions live in the same list, so filter on the FULL key
        // set — using the page-only list would silently drop them on save.
        if (ALL_GRANTABLE_KEYS.includes(key)) granted.add(key);
      });
    });
    return Array.from(granted);
  };

  const toggleUser = (user: User) => {
    /*
     * `next` is computed OUTSIDE the updater. It used to be computed inside
     * one, with `setPages(computePagesFor(next))` called from within — a
     * setState in another setState's updater, which StrictMode double-invokes.
     * `computePagesFor` also closes over `users`, so with the list now coming
     * from a cache that can refetch underneath the page, deriving the grants
     * from a stale closure would have let Save write the wrong permissions.
     */
    const next = selectedUserIds.includes(user.id)
      ? selectedUserIds.filter((id) => id !== user.id)
      : [...selectedUserIds, user.id];
    setSelectedUserIds(next);
    setPages(computePagesFor(next));
    setSaveError("");
  };

  const togglePage = (key: string) => {
    setPages((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  };

  const setAll = (grantAll: boolean) => {
    setPages(grantAll ? [...ALL_GRANTABLE_KEYS] : []);
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
    setSaveError("");
    try {
      await Promise.all(
        nonAdminSelected.map((user) => userService.updatePagePermissions(user.id, pages)),
      );
      /*
       * This patch IS the persistence — nothing refetches after a save, and the
       * page reads `user.extra_pages` back out of the list to seed the next
       * selection. It was a local `setUsers`; as `setQueryData(["users"])` it
       * keeps working here AND becomes visible to App_User, Party_Assignment
       * and the three reports, which is correct but is new cross-page
       * behaviour: those pages will now show the grant before any of them has
       * re-read the server.
       */
      const savedIds = nonAdminSelected.map((user) => user.id);
      queryClient.setQueryData<User[]>(["users"], (current) =>
        (current ?? []).map((user) =>
          savedIds.includes(user.id) ? { ...user, extra_pages: pages } : user,
        ),
      );
      setSuccessVisible(true);
    } catch (err) {
      console.error("Error saving page permissions:", err);
      setSaveError("Unable to save page access. Make sure you are logged in as admin.");
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
        <button type="button" className="ofs-refresh" onClick={() => void queryClient.invalidateQueries({ queryKey: ["users"] })}>
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
            <button
              type="button"
              className="ofs-flow-trigger"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span>
                <small>Selected Users</small>
                <strong>{triggerLabel()}</strong>
              </span>
              <HiChevronDown className={menuOpen ? "is-open" : ""} />
            </button>
            {menuOpen ? (
              <div className="ofs-flow-menu pp-user-menu">
                <label className="pp-user-search">
                  <HiMagnifyingGlass aria-hidden="true" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Search by name, username or role"
                    aria-label="Search by name, username or role"
                    autoFocus
                  />
                </label>
                <div className="pp-user-options" role="listbox" aria-multiselectable="true">
                  {filteredUsers.length === 0 ? (
                    <div className="pp-user-empty">No users found</div>
                  ) : (
                    filteredUsers.map((user) => {
                      const checked = selectedUserIds.includes(user.id);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          role="option"
                          aria-selected={checked}
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
              Saving applies the selected pages to all {selectedUsers.length} users (replacing their
              current access).
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
                  Grant all
                </button>
                <button type="button" className="ofs-secondary" onClick={() => setAll(false)}>
                  Clear all
                </button>
                <span className="pp-count">
                  {pages.length} / {ALL_GRANTABLE_KEYS.length} granted
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
            <p className="pp-hint">
              Pick one or more non-admin users from the dropdown above to choose which admin pages
              they can open.
            </p>
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

        {/* Action permissions — what a user may DO, not which page they open. */}
        <section className="ofs-card ofs-card--wide">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>Payment Permissions</h2>
          </div>

          {nonAdminSelected.length === 0 ? (
            <p className="pp-hint">
              Pick one or more non-admin users above to choose what they can do in the Payments
              module.
            </p>
          ) : (
            <>
              <p className="pp-hint">
                These control actions rather than page access. Granting &ldquo;Create&rdquo; lets a
                user raise and submit an entry; &ldquo;Approve&rdquo; lets them decide one — and
                still only on the workflow levels they are assigned to.
              </p>
              <div className="ofs-condition-grid">
                {PAYMENT_ACTION_PERMISSIONS.map((perm) => (
                  <ToggleRow
                    key={perm.key}
                    title={perm.label}
                    checked={pages.includes(perm.key)}
                    onChange={() => togglePage(perm.key)}
                  />
                ))}
              </div>
            </>
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

      <Dialog
        open={Boolean(successVisible)}
        onOpenChange={(next) => {
          if (!next) (() => setSuccessVisible(false))();
        }}
      >
        {successVisible && (
          <DialogContent
            title="Page permissions"
            variant="bare"
            size="auto"
            showClose={false}
            className="ofs-modal"
          >
            <div className="ofs-success-icon">
              <HiCheck />
            </div>
            <h2>Access Saved</h2>
            <p>
              Page access updated successfully for {nonAdminSelected.length} user
              {nonAdminSelected.length > 1 ? "s" : ""}.
            </p>
            <div className="ofs-modal-actions">
              <button
                type="button"
                className="ofs-primary"
                onClick={() => setSuccessVisible(false)}
              >
                Done
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
