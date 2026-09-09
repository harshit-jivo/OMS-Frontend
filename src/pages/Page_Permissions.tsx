/**
 * Page Permissions — what an individual USER may open, on top of their role.
 *
 * Role_Permissions is the other half: this page grants to a person, that one
 * grants to a role. Admins are shown but skipped, because they hold every key
 * implicitly and a stored grant for them would be a second copy to maintain.
 */
import { useMemo, useState } from "react";
import { HiOutlineShieldCheck, HiOutlineXMark } from "react-icons/hi2";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { PermissionGrid, PermissionToggle } from "@/components/admin/PermissionToggle";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/dropdown";
import { Field } from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  Notice,
  Page,
  PageHeader,
  SectionHeading,
} from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { showToast } from "@/lib/toastStore";
import { userService } from "../services/userService";
import type { User } from "../services/userService";
import { useUserList } from "../lib/authQueries";
import {
  ALL_GRANTABLE_KEYS,
  GRANTABLE_ADMIN_PAGES,
  ORDER_SCOPE_PERMISSIONS,
  PAYMENT_ACTION_PERMISSIONS,
} from "../config/adminPages";

const isAdminRole = (role?: string) =>
  String(role || "")
    .trim()
    .toLowerCase() === "admin";

export default function Page_Permissions() {
  const queryClient = useQueryClient();
  // Shared with App_User, Party_Assignment and the three manager reports under
  // ["users"]. This page's tolerant unwrap is the one that moved into the hook —
  // the other two consumers assumed the `{data}` envelope and threw without it.
  const { users, isLoading: loading, isError: loadFailed } = useUserList();

  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /** Save failures only. The load failure is the query's, so the two no longer
   *  overwrite each other. */
  const [saveError, setSaveError] = useState("");

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedUserIds.includes(user.id)),
    [users, selectedUserIds],
  );
  const nonAdminSelected = useMemo(
    () => selectedUsers.filter((user) => !isAdminRole(user.role)),
    [selectedUsers],
  );
  const adminSelectedCount = selectedUsers.length - nonAdminSelected.length;

  /*
   * The user picker was a hand-rolled trigger + menu + search + `menuRef` +
   * `document.addEventListener("mousedown")`, holding its own `menuOpen` in
   * the page. `ui/dropdown`'s MultiSelect is that, minus the state — see
   * DESIGN_SYSTEM §5a. The search box is why this list needed the primitive
   * extended rather than replaced: it runs to every user in the company.
   */
  const userOptions = useMemo<MultiSelectOption<number>[]>(
    () =>
      users.map((user) => ({
        value: user.id,
        label: user.name || user.username,
        hint: user.username + (user.role ? " · " + user.role : ""),
        keywords: user.role || "",
      })),
    [users],
  );

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

  /*
   * `next` is computed OUTSIDE any updater. It used to be computed inside one,
   * with `setPages(computePagesFor(next))` called from within — a setState in
   * another setState's updater, which StrictMode double-invokes.
   * `computePagesFor` also closes over `users`, so with the list now coming
   * from a cache that can refetch underneath the page, deriving the grants
   * from a stale closure would have let Save write the wrong permissions.
   */
  const selectUsers = (next: number[]) => {
    setSelectedUserIds(next);
    setPages(computePagesFor(next));
    setSaveError("");
  };

  const togglePage = (key: string) => {
    setPages((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  };

  const setAll = (grantAll: boolean) => setPages(grantAll ? [...ALL_GRANTABLE_KEYS] : []);

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
      showToast({
        title: "Access saved",
        message:
          pages.length +
          " permission" +
          (pages.length === 1 ? "" : "s") +
          " applied to " +
          nonAdminSelected.length +
          " user" +
          (nonAdminSelected.length === 1 ? "" : "s") +
          ".",
      });
    } catch (err) {
      console.error("Error saving page permissions:", err);
      setSaveError("Unable to save page access. Make sure you are logged in as admin.");
    } finally {
      setSaving(false);
    }
  };

  // What the two permission grids show when nothing actionable is selected.
  const pickerHint =
    selectedUsers.length === 0
      ? "Pick one or more users above to choose what they can open."
      : "Every user in your selection is an admin — they already hold every permission.";

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Administration" }, { label: "Page Permissions" }]} />

      <PageHeader
        eyebrow="Access control"
        title="Page Permissions"
        description="Grant access to admin pages for any user. Granted pages appear in their sidebar."
        actions={
          <Button
            variant="ghost"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["users"] })}
          >
            Refresh
          </Button>
        }
      />

      {loadFailed && (
        <Notice tone="bad" title="Could not load users">
          The list below is empty because the request for it failed, not because there are no
          users. Saving is unsafe until it loads.
        </Notice>
      )}
      {saveError && <Notice tone="bad">{saveError}</Notice>}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Select users</CardTitle>
          </CardHeader>

          {loading ? (
            <Skeleton className="h-control w-full" />
          ) : (
            <Field label="Users" hint="Search by name, username or role.">
              {(control) => (
                <MultiSelect
                  {...control}
                  value={selectedUserIds}
                  onChange={selectUsers}
                  options={userOptions}
                  searchable
                  searchPlaceholder="Name, username or role…"
                  placeholder="Choose users"
                  // Every user in the company is more than a panel can show.
                  maxShown={60}
                  emptyText="No users loaded"
                  // "Select all" would grant to the entire company in one
                  // click. It is offered only once a search has narrowed the
                  // list to something a person can read.
                  selectAll={false}
                />
              )}
            </Field>
          )}

          {selectedUsers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selectedUsers.map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-strong py-0.5 pl-2.5 pr-1 text-[12px] text-ink"
                >
                  {user.name || user.username}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 rounded-full"
                    onClick={() =>
                      selectUsers(selectedUserIds.filter((id) => id !== user.id))
                    }
                    aria-label={"Remove " + (user.name || user.username)}
                  >
                    <HiOutlineXMark />
                  </Button>
                </span>
              ))}
            </div>
          )}

          {selectedUsers.length > 1 && (
            <p className="m-0 mt-3 text-[12px] text-subtle">
              Saving applies the selected permissions to all {selectedUsers.length} users,
              replacing their current access.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            {nonAdminSelected.length > 0 && (
              <span className="text-[12px] text-subtle">
                {pages.length} / {ALL_GRANTABLE_KEYS.length} granted
              </span>
            )}
          </CardHeader>

          {nonAdminSelected.length === 0 ? (
            <Notice tone="info">
              <span className="flex items-start gap-2">
                <HiOutlineShieldCheck className="mt-0.5 shrink-0" aria-hidden="true" />
                {pickerHint}
              </span>
            </Notice>
          ) : (
            <>
              {adminSelectedCount > 0 && (
                <p className="m-0 mb-3 text-[12px] text-subtle">
                  {adminSelectedCount} admin{adminSelectedCount > 1 ? "s" : ""} in your selection
                  will be skipped — they already have full access.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setAll(true)}>Grant all</Button>
                <Button onClick={() => setAll(false)}>Clear all</Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <section className="space-y-3">
        <SectionHeading>Allowed pages</SectionHeading>
        <Card>
          {nonAdminSelected.length === 0 ? (
            <p className="m-0 text-[13px] text-subtle">{pickerHint}</p>
          ) : (
            <PermissionGrid>
              {GRANTABLE_ADMIN_PAGES.map((page) => (
                <PermissionToggle
                  key={page.key}
                  title={page.label}
                  subtitle={page.path}
                  checked={pages.includes(page.key)}
                  onChange={() => togglePage(page.key)}
                />
              ))}
            </PermissionGrid>
          )}
        </Card>
      </section>

      {/* Action permissions — what a user may DO, not which page they open. */}
      <section className="space-y-3">
        <SectionHeading>Payment permissions</SectionHeading>
        <Card>
          {nonAdminSelected.length === 0 ? (
            <p className="m-0 text-[13px] text-subtle">{pickerHint}</p>
          ) : (
            <>
              <p className="m-0 mb-3 text-[12px] text-subtle">
                These control actions rather than page access. Granting &ldquo;Create&rdquo; lets a
                user raise and submit an entry; &ldquo;Approve&rdquo; lets them decide one — and
                still only on the workflow levels they are assigned to.
              </p>
              <PermissionGrid>
                {PAYMENT_ACTION_PERMISSIONS.map((perm) => (
                  <PermissionToggle
                    key={perm.key}
                    title={perm.label}
                    checked={pages.includes(perm.key)}
                    onChange={() => togglePage(perm.key)}
                  />
                ))}
              </PermissionGrid>
            </>
          )}
        </Card>
      </section>

      {/* Order visibility — widens what the screens a user already holds can
          show them, rather than opening a screen of its own. */}
      <section className="space-y-3">
        <SectionHeading>Order visibility</SectionHeading>
        <Card>
          {nonAdminSelected.length === 0 ? (
            <p className="m-0 text-[13px] text-subtle">{pickerHint}</p>
          ) : (
            <>
              <p className="m-0 mb-3 text-[12px] text-subtle">
                Separate from the Sales Dashboard page grant: that decides whether a user can
                open the screen, this decides whose orders appear on it. Without it a user
                sees only the orders their role already scopes them to.
              </p>
              <PermissionGrid>
                {ORDER_SCOPE_PERMISSIONS.map((perm) => (
                  <PermissionToggle
                    key={perm.key}
                    title={perm.label}
                    checked={pages.includes(perm.key)}
                    onChange={() => togglePage(perm.key)}
                  />
                ))}
              </PermissionGrid>
            </>
          )}
        </Card>
      </section>

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => void handleSave()}
          disabled={saving || nonAdminSelected.length === 0}
          title={
            nonAdminSelected.length === 0 ? "Select at least one non-admin user first." : undefined
          }
        >
          {saving ? "Saving…" : "Save access"}
        </Button>
      </div>
    </Page>
  );
}
