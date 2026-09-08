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
import { useEffect, useMemo, useState } from "react";
import { HiOutlineCheckCircle, HiOutlinePlus, HiOutlineShieldCheck } from "react-icons/hi2";

import { PermissionGrid, PermissionToggle } from "@/components/admin/PermissionToggle";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FormActions, FormGrid, Input } from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  Page,
  PageHeader,
} from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { Tab, TabList } from "@/components/ui/tabs";
import { showToast } from "@/lib/toastStore";
import { userService } from "../services/userService";

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
  const detail = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return detail || fallback;
}

const MODULE_TITLES: Record<string, string> = {
  orders: "Orders & Sales Flow",
  pages: "Admin Pages",
  payments: "Payments Actions",
  invoices: "Invoices",
  tracker: "Document Tracker",
};

const isPrivileged = (role: RoleRow) => PRIVILEGED_ROLES.has(role.name.trim().toLowerCase());

export default function Role_Permissions() {
  const [modules, setModules] = useState<RegistryModule[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [migrated, setMigrated] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set());
  /** Which module tab is open. Empty means "the first one" — see below. */
  const [activeModule, setActiveModule] = useState("");
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
  /** The role a delete has been asked about. `window.confirm` before. */
  const [confirmDelete, setConfirmDelete] = useState<RoleRow | null>(null);

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

  /*
   * The open module, falling back to the first. Derived rather than seeded in
   * an effect: the registry arrives asynchronously, so an effect would have to
   * write state on load — and this way an unknown saved name (a module the
   * server stopped sending) degrades to the first tab instead of an empty panel.
   */
  const activeModuleObj =
    modules.find((m) => m.name === activeModule) ?? modules[0] ?? null;
  const activeModuleName = activeModuleObj?.name ?? "";
  const activeModuleTitle = activeModuleObj
    ? (MODULE_TITLES[activeModuleObj.name] ?? activeModuleObj.name)
    : "";

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
      setRoles((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewOpen(false);
      setNewName("");
      setNewDisplay("");
      selectRole(created);
      showToast({
        title: "Role created",
        message: created.display_name + " has no permissions yet — tick what it should grant.",
      });
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
      setRoles((prev) => prev.map((r) => (r.id === selected.id ? { ...r, ...res.data } : r)));
      setSavedMsg(res.message);
    } catch (e) {
      setError(apiMessage(e, "Could not update the role."));
    } finally {
      setRoleBusy(false);
    }
  }

  async function deleteRole() {
    const role = confirmDelete;
    if (!role || roleBusy) return;
    setRoleBusy(true);
    setError("");
    try {
      const res = await userService.deleteRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      setSelectedId(null);
      setConfirmDelete(null);
      showToast({ title: "Role deleted", message: res.message });
    } catch (e) {
      setError(apiMessage(e, "Could not delete the role."));
      setConfirmDelete(null);
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
        setRoles((prev) => prev.map((r) => (r.id === selected.id ? { ...r, keys } : r)));
        setSavedMsg(
          "Saved — holders of " + selected.display_name + " are updated on their next request.",
        );
      } else {
        setError(res.message || "Save failed.");
      }
    } catch (e: unknown) {
      setError(apiMessage(e, "Save failed."));
    } finally {
      setSaving(false);
    }
  }

  /** Why Delete is unavailable, or undefined when it is available. */
  const deleteBlockedBecause = (role: RoleRow) =>
    isPrivileged(role)
      ? "Privileged roles cannot be deleted."
      : role.users > 0
        ? role.users +
          " user" +
          (role.users === 1 ? "" : "s") +
          " still hold this role — reassign them first."
        : undefined;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Administration" }, { label: "Role Permissions" }]} />

      <PageHeader
        eyebrow="Access control"
        title="Role Permissions"
        description="What each role can do. A permission ticked here is held by every user with that role — as primary or extra — on top of any personal grants from the Permissions page."
      />

      {!migrated && (
        <Notice tone="hold" title="Role permission storage is not migrated">
          Bundles show as empty and saving is disabled until <code>manage.py migrate users</code>{" "}
          has run on this server.
        </Notice>
      )}
      {error && <Notice tone="bad">{error}</Notice>}

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-start">
        {/* ── The roles ── */}
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle>Roles</CardTitle>
            <Button size="xs" onClick={() => setNewOpen((v) => !v)}>
              {newOpen ? "Cancel" : <HiOutlinePlus aria-hidden="true" />}
              {newOpen ? null : "New role"}
            </Button>
          </CardHeader>

          {newOpen && (
            <div className="mb-3 space-y-2.5 rounded-sm border border-line bg-surface p-3">
              <Field
                label="Name"
                required
                hint="How code and reports refer to the role. Permanent — it cannot be changed later."
              >
                {(control) => (
                  <Input
                    {...control}
                    value={newName}
                    maxLength={50}
                    placeholder="dispatch_clerk"
                    onChange={(e) => setNewName(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Display name" hint="What people see. This one can be changed.">
                {(control) => (
                  <Input
                    {...control}
                    value={newDisplay}
                    maxLength={100}
                    placeholder="Dispatch Clerk"
                    onChange={(e) => setNewDisplay(e.target.value)}
                  />
                )}
              </Field>
              <Button
                variant="primary"
                className="w-full"
                disabled={!newName.trim() || creating}
                onClick={() => void createRole()}
              >
                {creating ? "Creating…" : "Create role"}
              </Button>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : roles.length === 0 ? (
            <EmptyState icon={HiOutlineShieldCheck} title="No roles defined" />
          ) : (
            <ul className="m-0 max-h-[440px] list-none space-y-1 overflow-y-auto p-0">
              {roles.map((role) => {
                const isSelected = role.id === selectedId;
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      /* A selectable list row, so the DESIGN_SYSTEM §1.1 reset
                         is copied rather than using `ui/button`. */
                      className={
                        "flex w-full cursor-pointer appearance-none flex-col gap-0.5 rounded-sm border border-solid px-3 py-2 text-left [font-family:inherit] text-[13px] transition-colors " +
                        (isSelected
                          ? "border-brand-line bg-brand-soft"
                          : "border-transparent bg-transparent hover:bg-surface")
                      }
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => selectRole(role)}
                    >
                      <span className="flex items-center gap-1.5 font-semibold text-ink">
                        {role.display_name}
                        {!role.is_active && <Badge tone="neutral">Inactive</Badge>}
                      </span>
                      <span className="text-[11.5px] text-subtle">
                        {role.users} user{role.users === 1 ? "" : "s"} ·{" "}
                        {role.name.trim().toLowerCase() === "admin"
                          ? "all permissions"
                          : role.keys.length +
                            " permission" +
                            (role.keys.length === 1 ? "" : "s")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ── The selected role ── */}
        <div className="space-y-4">
          {!selected ? (
            <Card>
              <EmptyState
                icon={HiOutlineShieldCheck}
                title="Select a role"
                hint="Pick a role on the left to see and edit what it grants."
              />
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{selected.display_name}</CardTitle>
                  <span className="text-[12px] text-subtle">
                    <code className="rounded bg-surface-strong px-1 py-px font-mono text-[11.5px]">
                      {selected.name}
                    </code>{" "}
                    · permanent · {selected.users} user{selected.users === 1 ? "" : "s"}
                  </span>
                </CardHeader>

                <FormGrid>
                  <Field label="Display name" hint="What people see. Renaming is safe.">
                    {(control) => (
                      <Input
                        {...control}
                        value={editDisplay}
                        maxLength={100}
                        disabled={roleBusy}
                        onChange={(e) => setEditDisplay(e.target.value)}
                      />
                    )}
                  </Field>
                </FormGrid>

                <FormActions>
                  <Button
                    variant="danger"
                    className="mr-auto"
                    disabled={roleBusy || Boolean(deleteBlockedBecause(selected))}
                    title={deleteBlockedBecause(selected)}
                    onClick={() => setConfirmDelete(selected)}
                  >
                    Delete
                  </Button>
                  <Button
                    disabled={roleBusy || isPrivileged(selected)}
                    title={
                      isPrivileged(selected)
                        ? "Privileged roles cannot be deactivated."
                        : selected.is_active
                          ? "Deactivate: holders keep the role but its permission bundle stops granting."
                          : "Reactivate the role."
                    }
                    onClick={() => void saveRoleDetails({ is_active: !selected.is_active })}
                  >
                    {selected.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={
                      roleBusy ||
                      !editDisplay.trim() ||
                      editDisplay.trim() === selected.display_name
                    }
                    onClick={() => void saveRoleDetails({ display_name: editDisplay.trim() })}
                  >
                    Rename
                  </Button>
                </FormActions>
              </Card>

              {isAdminRole ? (
                <Notice tone="info" title="Administrators hold every permission">
                  There is nothing to tick here — and nothing that can be unticked.
                </Notice>
              ) : (
                <>
                  {/*
                   * One module at a time, rather than every module stacked into
                   * one long scroll. The count on each tab is what makes that
                   * safe: switching tabs would otherwise hide how much is
                   * granted elsewhere, and this screen's whole job is showing
                   * exactly that.
                   */}
                  <TabList label="Permission modules">
                    {modules.map((module) => {
                      const granted = module.keys.filter(({ key }) =>
                        draftKeys.has(key),
                      ).length;
                      return (
                        <Tab
                          key={module.name}
                          selected={module.name === activeModuleName}
                          onClick={() => setActiveModule(module.name)}
                        >
                          {MODULE_TITLES[module.name] ?? module.name}
                          <span
                            className={
                              "ml-1.5 rounded-full px-1.5 py-px text-[11px] font-bold " +
                              (module.name === activeModuleName
                                ? "bg-white/20"
                                : granted > 0
                                  ? "bg-brand-soft text-brand"
                                  : "bg-surface-strong text-subtle")
                            }
                          >
                            {granted}/{module.keys.length}
                          </span>
                        </Tab>
                      );
                    })}
                  </TabList>

                  <Card role="tabpanel" aria-label={activeModuleTitle}>
                    {activeModuleObj ? (
                      <PermissionGrid>
                        {activeModuleObj.keys.map(({ key, label }) => (
                          <PermissionToggle
                            key={key}
                            title={label}
                            subtitle={key}
                            checked={draftKeys.has(key)}
                            disabled={!migrated || saving}
                            onChange={() => toggleKey(key)}
                          />
                        ))}
                      </PermissionGrid>
                    ) : (
                      <EmptyState
                        icon={HiOutlineShieldCheck}
                        title="No permissions registered"
                        hint="The server's permission registry returned nothing to grant."
                      />
                    )}
                  </Card>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {/* The total across every module, so the figure the save
                        writes is visible without visiting each tab. */}
                    <span className="mr-auto text-[12px] text-subtle">
                      {draftKeys.size} permission{draftKeys.size === 1 ? "" : "s"} granted in
                      total
                    </span>
                    {savedMsg && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-ok">
                        <HiOutlineCheckCircle aria-hidden="true" /> {savedMsg}
                      </span>
                    )}
                    <Button
                      variant="primary"
                      disabled={!dirty || !migrated || saving}
                      title={!migrated ? "Saving is disabled until the migration has run." : undefined}
                      onClick={() => void save()}
                    >
                      {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(next) => {
          if (!next && !roleBusy) setConfirmDelete(null);
        }}
      >
        {confirmDelete && (
          <DialogContent title="Delete role" size="sm">
            <DialogHeader>
              <DialogTitle>Delete {confirmDelete.display_name}?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Notice tone="hold">
                The role and its permission bundle are deleted together. Anything that refers to{" "}
                <code className="font-mono">{confirmDelete.name}</code> by name — reports, saved
                filters — stops matching, and the name cannot be reused to bring it back.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmDelete(null)} disabled={roleBusy}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void deleteRole()} disabled={roleBusy}>
                {roleBusy ? "Deleting…" : "Delete role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
