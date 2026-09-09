/**
 * App Users — the account list, and the form that creates and edits one.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineCheckCircle,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineShieldCheck,
  HiOutlineUserGroup,
  HiOutlineXCircle,
  HiOutlineXMark,
} from "react-icons/hi2";

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
import { MultiSelect, SearchSelect } from "@/components/ui/dropdown";
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Field, FormGrid, Input } from "@/components/ui/form";
import {
  Card,
  Notice,
  Page,
  PageHeader,
  Stat,
  StatRow,
} from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { SegmentedControl } from "@/components/ui/segmented";
import { TableSkeleton } from "@/components/ui/skeleton";
import { toneForStatus } from "@/components/ui/statusTone";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { showToast } from "@/lib/toastStore";
import { userService } from "../services/userService";
import type { User, Option, CreateUserData } from "../services/userService";
import {
  useCategories,
  useCompanies,
  useMainGroups,
  useRoles,
  useStates,
  useUserList,
} from "../lib/authQueries";
import { useProductVarietiesMulti } from "../lib/sapQueries";
import { errorBody, fieldError, messageFrom } from "@/lib/apiError";

const ITEMS_PER_PAGE = 7;

const BLANK_FORM: CreateUserData = {
  name: "",
  username: "",
  password: "",
  email: "",
  phone: "",
  mainGroup: 0,
  mainGroups: [],
  state: 0,
  states: [],
  role: 0,
  company: 0,
  category: null,
  // A user may hold several — OIL and BEVERAGES, say. `category` stays the
  // PRIMARY (the first picked): the server still uses it as the default scope
  // where a request names no category of its own.
  categories: [],
  variety: "",
};

export default function App_User() {
  const queryClient = useQueryClient();
  /*
   * Six lists that used to be six `useState` + six fetchers + one mount effect.
   * Every one of them is reference data that does not change during a session,
   * and five of the six are shared with other pages — `["users"]` alone now has
   * six consumers. The seventh fetch, the variety list, is below: it is the one
   * that is conditional.
   */
  const { users, isLoading: isUsersLoading } = useUserList();
  const { items: mainGroup } = useMainGroups();
  const { states: state } = useStates();
  const { items: role } = useRoles();
  const { items: company } = useCompanies();
  const { items: categories } = useCategories();

  const [formData, setFormData] = useState<CreateUserData>(BLANK_FORM);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  /** The categories this user holds, primary first. */
  const selectedCategoryIds = useMemo(
    () =>
      formData.categories?.length
        ? formData.categories
        : formData.category
          ? [formData.category]
          : [],
    [formData.categories, formData.category],
  );

  const selectedCategoryNames = useMemo(
    () =>
      selectedCategoryIds
        .map((id) => categories.find((item) => item.id === id)?.category)
        .filter((name): name is string => Boolean(name)),
    [selectedCategoryIds, categories],
  );

  // Kept for the copy that names one category ("Sub groups within OIL").
  const selectedCategoryName = selectedCategoryNames.join(", ");

  /*
   * Was `useEffect(() => fetchVarieties(selectedCategoryName), [selectedCategoryName])`,
   * where `fetchVarieties` opened with a synchronous `setVarietyOptions([])`
   * before its first await — a `react-hooks/set-state-in-effect` violation that
   * only passed lint because the mount fetch above made the component
   * unanalysable. `enabled` inside the hook replaces both the effect and that
   * clearing branch.
   */
  const { varieties: varietyOptions } = useProductVarietiesMulti(selectedCategoryNames);

  /*
   * FOUR hand-rolled dropdowns lived here — Main Group, State, Role and Sub
   * Group — sharing one `document.addEventListener("mousedown")` over four
   * separate refs, with four `…DropdownOpen` booleans in page state and a
   * `closeSingleSelects()` helper to stop two of them being open at once.
   * `ui/dropdown` owns all of that (DESIGN_SYSTEM §5a), so the page now holds
   * only the VALUES.
   */
  const mainGroupOptions = useMemo(
    () => mainGroup.map((g) => ({ value: g.id, label: g.name })),
    [mainGroup],
  );
  const stateOptions = useMemo(() => state.map((s) => ({ value: s.id, label: s.name })), [state]);
  const roleOptions = useMemo(() => role.map((r) => ({ value: r.id, label: r.name })), [role]);
  const varietyPickerOptions = useMemo(
    () => varietyOptions.map((v) => ({ value: v, label: v })),
    [varietyOptions],
  );

  const selectedVarieties = useMemo(
    () =>
      String(formData.variety || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [formData.variety],
  );

  const setVarieties = (next: string[]) =>
    setFormData((prev) => ({ ...prev, variety: next.join(", ") }));

  /*
   * `mainGroup` / `state` are the singular legacy fields the API still reads
   * alongside the plural lists, so they track the first of the selection.
   */
  const setMainGroups = (ids: number[]) =>
    setFormData((prev) => ({ ...prev, mainGroup: ids[0] || 0, mainGroups: ids }));
  const setStates = (ids: number[]) =>
    setFormData((prev) => ({ ...prev, state: ids[0] || 0, states: ids }));

  /*
   * User creation is the one place where a generic "first field error wins" is
   * the wrong answer, which is why this does not just call `messageFrom`.
   *
   * Creating a user is a multi-write call, and the failure people actually hit
   * is a duplicate username or email — sometimes both at once. DRF reports
   * that as two separate field errors, and reading only the first tells the
   * admin to change the username when the email is also taken, so they submit
   * again and fail again. Collapsing the pair into one sentence is the whole
   * reason for this function.
   *
   * `source` is either an axios error OR the service's own `{success, errors}`
   * result — both reach the same banner, so both are handled here rather than
   * at the two call sites.
   */
  const getCreateUserErrorMessage = (source: unknown): string => {
    const body =
      errorBody(source) ??
      (source && typeof source === "object" ? (source as Record<string, unknown>) : undefined);
    const bag =
      (body?.errors as Record<string, unknown> | undefined) &&
      Object.keys(body?.errors as object).length > 0
        ? (body?.errors as Record<string, unknown>)
        : body;

    const username = fieldError(bag, "username");
    const email = fieldError(bag, "email");
    const password = fieldError(bag, "password");
    const nonField = fieldError(bag, "non_field_errors");

    const isDuplicate = (value?: string) => {
      const msg = String(value || "").toLowerCase();
      return (
        msg.includes("already exist") || msg.includes("duplicate") || msg.includes("already taken")
      );
    };

    // The pair, before either one alone.
    if (isDuplicate(username) && isDuplicate(email)) {
      return "Username and email already exist.";
    }
    if (isDuplicate(username)) return "Username already exists.";
    if (isDuplicate(email)) return "Email already exists.";

    if (password) return "Password: " + password;
    if (username) return "Username: " + username;
    if (email) return "Email: " + email;
    if (nonField) return nonField;

    // Any other field the serializer rejected — phone, name, a role id.
    for (const [key, value] of Object.entries(bag ?? {})) {
      if (["message", "error", "detail", "success", "errors"].includes(key)) continue;
      const text = fieldError(bag, key);
      if (text && Array.isArray(value)) {
        return key.charAt(0).toUpperCase() + key.slice(1) + ": " + text;
      }
    }

    return messageFrom(source, "Something went wrong while creating the user.");
  };

  /*
   * What the submit needs before it can run.
   *
   * These three were an `alert("Please select role, company and category.")`
   * fired AFTER the press. The rule is the same; it is enforced by disabling
   * the button and saying why in its title, per DESIGN_SYSTEM §6 — so the
   * form cannot be submitted into a failure that was knowable beforehand.
   */
  const missing: string[] = [];
  if (!formData.role) missing.push("role");
  if (!formData.company) missing.push("company");
  if (!formData.category) missing.push("category");
  const canSubmit = missing.length === 0;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    // Creating/updating a user is a multi-write call (role, groups, states,
    // categories, password); block the form until it settles so an impatient
    // second submit can't fire the same write twice.
    if (isSaving) return;
    setIsSaving(true);
    setFormError("");

    try {
      const result =
        isEditMode && editUserId
          ? await userService.updateUser(editUserId, formData)
          : await userService.createUser(formData);

      if (result.success) {
        showToast({
          title: isEditMode ? "User updated" : "User created",
          message: (formData.name || formData.username) + " was saved.",
        });
        setFormData(BLANK_FORM);
        setIsEditMode(false);
        setEditUserId(null);
        void queryClient.invalidateQueries({ queryKey: ["users"] });
        setShowForm(false);
      } else {
        setFormError(getCreateUserErrorMessage(result));
      }
    } catch (error) {
      setFormError(getCreateUserErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditUser = (user: User) => {
    setIsEditMode(true);
    setEditUserId(user.id);
    setFormError("");

    const getId = (value: unknown) => {
      if (typeof value === "number") return value;
      if (typeof value === "string") return Number(value) || 0;
      if (value && typeof value === "object" && "id" in value) {
        return Number((value as { id?: number | string }).id) || 0;
      }
      return 0;
    };
    const getIds = (values: unknown) =>
      Array.isArray(values) ? values.map(getId).filter(Boolean) : [];
    const editableUser = user as User & {
      main_group?: unknown;
      main_groups?: unknown;
      state?: unknown;
      states?: unknown;
      company?: unknown;
      category?: unknown;
      variety?: string | null;
      sub_group?: string | null;
      role?: unknown;
      role_display?: string;
    };
    const mainGroupIds = getIds(editableUser.main_groups);
    const stateIds = getIds(editableUser.states);
    // Carry the category m2m through the edit so saving can't drop it. The
    // Category picker is single-choice, so picking one replaces this list.
    const categoryIds = getIds((editableUser as { categories?: unknown }).categories);
    const roleName = String(
      editableUser.role || editableUser.role_name || editableUser.role_display || "",
    ).toLowerCase();
    const roleId =
      getId(editableUser.role) || role.find((r) => r.name.toLowerCase() === roleName)?.id || 0;

    setFormData({
      name: user.name || "",
      username: user.username || "",
      password: "",
      email: user.email || "",
      phone: user.phone || "",
      mainGroup: getId(editableUser.main_group) || mainGroupIds[0] || 0,
      mainGroups: mainGroupIds,
      state: getId(editableUser.state) || stateIds[0] || 0,
      states: stateIds,
      role: roleId,
      company: getId(editableUser.company) || null,
      category: getId(editableUser.category) || categoryIds[0] || null,
      categories: categoryIds,
      // formData.variety is the in-form holder for the user's sub group assignment.
      variety: editableUser.sub_group || "",
    });

    setShowForm(true);
  };

  const openAddForm = () => {
    setIsEditMode(false);
    setEditUserId(null);
    setFormData(BLANK_FORM);
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setIsEditMode(false);
    setEditUserId(null);
    setFormError("");
  };

  /* The serializer sends company/category either as a nested object or as a bare
   * id depending on the endpoint, so resolve both shapes against the loaded
   * option lists before showing them in the table. */
  const resolveOptionName = (value: unknown, options: Option[]): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") {
      const nested = value as { name?: string; id?: number };
      return nested.name || options.find((item) => item.id === nested.id)?.name || "—";
    }
    return options.find((item) => item.id === Number(value))?.name || String(value);
  };

  const userCategoryName = (user: User): string => {
    if (user.category?.category) return user.category.category;
    const first = user.categories?.[0]?.category;
    return first || "—";
  };

  // Omni search across id, name, username, email and role.
  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = normalizedSearch
    ? users.filter((user) =>
        [user.id, user.name, user.username, user.email, user.role]
          .map((value) => String(value ?? "").toLowerCase())
          .some((value) => value.includes(normalizedSearch)),
      )
    : users;

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const visibleUsers = filteredUsers.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const activeUsers = users.filter((user) => user.is_active !== false).length;
  const distinctRoles = new Set(
    users.map((user) => String(user.role || user.role_name || "").trim()).filter(Boolean),
  ).size;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Administration" }, { label: "App Users" }]} />

      <PageHeader
        eyebrow="Administration"
        title="App Users"
        description="Manage user access, review account status and keep operational roles aligned."
        actions={
          <Button variant="primary" onClick={openAddForm}>
            <HiOutlinePlus aria-hidden="true" />
            Add user
          </Button>
        }
      />

      <StatRow>
        <Stat
          label="Total users"
          value={isUsersLoading ? "—" : users.length}
          icon={HiOutlineUserGroup}
        />
        <Stat
          label="Active"
          value={isUsersLoading ? "—" : activeUsers}
          icon={HiOutlineCheckCircle}
          tone="ok"
        />
        <Stat
          label="Inactive"
          value={isUsersLoading ? "—" : users.length - activeUsers}
          icon={HiOutlineXCircle}
          tone={users.length - activeUsers > 0 ? "bad" : "neutral"}
        />
        <Stat
          label="Roles in use"
          value={isUsersLoading ? "—" : distinctRoles}
          icon={HiOutlineShieldCheck}
        />
      </StatRow>

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          placeholder="Name, username, email, role or id…"
          fieldClassName="min-w-[300px]"
        />
        <FilterCount>
          {filteredUsers.length} user{filteredUsers.length === 1 ? "" : "s"}
          {normalizedSearch ? " of " + users.length : ""}
        </FilterCount>
      </FilterBar>

      <Card className="overflow-hidden p-0">
        {isUsersLoading ? (
          <TableSkeleton columns={9} label="Loading users" />
        ) : (
          /*
           * The empty state lives INSIDE the table. It used to be a sibling
           * div rendered instead of the `<table>`, which took the column
           * headers away with the rows — so "no users match your search"
           * arrived with no indication of what was being searched.
           */
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableEmpty colSpan={9}>
                    {search ? "No users match your search" : "No users found"}
                  </TableEmpty>
                ) : (
                  visibleUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="text-subtle tabular-nums">{user.id}</TableCell>
                      <TableCell className="font-semibold text-ink">{user.name}</TableCell>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>{user.email || "—"}</TableCell>
                      <TableCell>
                        {user.role ? (
                          // `info`, not a role-specific colour. The old
                          // `.au-cell-badge-role` was blue for every role,
                          // so nothing is lost — and giving roles their own
                          // colours would compete with the status column
                          // beside it, which is the one that matters.
                          <Badge tone="info" caps>
                            {user.role}
                          </Badge>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </TableCell>
                      <TableCell>{resolveOptionName(user.company, company)}</TableCell>
                      <TableCell>{userCategoryName(user)}</TableCell>
                      <TableCell>
                        {/*
                          The tone comes from the status word rather than from a
                          local ternary, so "Active" here is the same green as
                          "Active" anywhere else in the app. That is the whole
                          point of statusTone.ts.
                        */}
                        <Badge
                          tone={toneForStatus(user.is_active === false ? "inactive" : "active")}
                          caps
                        >
                          {user.is_active === false ? "Inactive" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditUser(user)}
                            aria-label={"Edit " + (user.name || user.username)}
                          >
                            <HiOutlinePencilSquare />
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {filteredUsers.length > ITEMS_PER_PAGE && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            className="border-t border-line px-4 py-3"
          />
        )}
      </Card>

      {/* ── Add / edit ── */}
      <Dialog
        open={showForm}
        onOpenChange={(next) => {
          if (!next && !isSaving) closeForm();
        }}
      >
        {showForm && (
          <DialogContent title="User form" size="lg">
            <DialogHeader>
              <DialogTitle>{isEditMode ? "Update user details" : "New user"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => void handleSubmit(e)} aria-busy={isSaving}>
              {/* The fieldset is what stops anything being edited or
                  re-submitted mid-write. */}
              <fieldset className="m-0 min-w-0 border-0 p-0" disabled={isSaving}>
                <DialogBody className="space-y-4">
                  <FormGrid>
                    <Field label="Full name" required>
                      {(control) => (
                        <Input
                          {...control}
                          value={formData.name}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, name: e.target.value }))
                          }
                          placeholder="Name"
                          required
                        />
                      )}
                    </Field>

                    <Field label="Username" required>
                      {(control) => (
                        <Input
                          {...control}
                          value={formData.username}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, username: e.target.value }))
                          }
                          placeholder="Username"
                          required
                        />
                      )}
                    </Field>

                    <Field
                      label={isEditMode ? "Change password" : "Password"}
                      required={!isEditMode}
                      hint={isEditMode ? "Leave blank to keep the current password." : undefined}
                    >
                      {(control) => (
                        <Input
                          {...control}
                          type="password"
                          value={formData.password}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, password: e.target.value }))
                          }
                          placeholder={isEditMode ? "Unchanged" : "••••••••"}
                          required={!isEditMode}
                        />
                      )}
                    </Field>

                    <Field label="Email address" required>
                      {(control) => (
                        <Input
                          {...control}
                          type="email"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, email: e.target.value }))
                          }
                          placeholder="abc@gmail.com"
                          required
                        />
                      )}
                    </Field>

                    <Field label="Contact number" required>
                      {(control) => (
                        <Input
                          {...control}
                          type="tel"
                          maxLength={10}
                          value={formData.phone}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, phone: e.target.value }))
                          }
                          placeholder="10-digit number"
                          required
                        />
                      )}
                    </Field>

                    <Field label="User role" required>
                      {(control) => (
                        <SearchSelect
                          {...control}
                          value={formData.role || ""}
                          onChange={(next) =>
                            setFormData((prev) => ({ ...prev, role: Number(next) || 0 }))
                          }
                          options={roleOptions}
                          placeholder="Select role"
                          searchPlaceholder="Role name…"
                          emptyText="No roles"
                        />
                      )}
                    </Field>

                    <Field label="Main group" hint="One or more.">
                      {(control) => (
                        <MultiSelect
                          {...control}
                          value={formData.mainGroups || []}
                          onChange={setMainGroups}
                          options={mainGroupOptions}
                          placeholder="Select main group"
                          emptyText="No main groups"
                        />
                      )}
                    </Field>

                    <Field label="State" hint="One or more.">
                      {(control) => (
                        <MultiSelect
                          {...control}
                          value={formData.states || []}
                          onChange={setStates}
                          options={stateOptions}
                          searchable
                          searchPlaceholder="State name…"
                          placeholder="Select state"
                          emptyText="No states"
                        />
                      )}
                    </Field>
                  </FormGrid>

                  {/* Company is a short, mutually exclusive list, so every
                      option stays visible — one tap to pick. A SegmentedControl
                      is a real radiogroup, which the hand-rolled `au-pellet`
                      buttons only imitated.

                      Category is NOT exclusive: a user can sell across OIL and
                      BEVERAGES, so it is a MultiSelect below. The first pick is
                      the primary, which is what the server falls back to when a
                      request names no category of its own. */}
                  <Field label="Company" required>
                    {() =>
                      company.length === 0 ? (
                        <p className="m-0 text-[12px] text-subtle">No companies available.</p>
                      ) : (
                        <SegmentedControl
                          value={String(formData.company ?? "")}
                          onChange={(next) =>
                            setFormData((prev) => ({ ...prev, company: Number(next) }))
                          }
                          options={company.map((c) => ({ value: String(c.id), label: c.name }))}
                          aria-label="Company"
                        />
                      )
                    }
                  </Field>

                  <Field
                    label="Category"
                    required
                    hint={
                      selectedCategoryNames.length > 1
                        ? "Primary is " +
                          selectedCategoryNames[0] +
                          " — the default when a screen asks for no category in particular."
                        : "Pick more than one for someone who sells across companies."
                    }
                  >
                    {(control) =>
                      categories.length === 0 ? (
                        <p className="m-0 text-[12px] text-subtle">No categories available.</p>
                      ) : (
                        <MultiSelect
                          {...control}
                          value={selectedCategoryIds}
                          onChange={(next) => {
                            // Sub groups belong to a category, so REMOVING one
                            // can orphan the sub groups that came with it and
                            // the picks are cleared. Adding one cannot orphan
                            // anything, so the existing picks survive — losing
                            // them every time an admin widens a user's access
                            // would be its own small betrayal.
                            const isAddition = selectedCategoryIds.every((id) =>
                              next.includes(id),
                            );
                            setFormData((prev) => ({
                              ...prev,
                              categories: next,
                              // First picked is the primary.
                              category: next[0] ?? null,
                              variety: isAddition ? prev.variety : "",
                            }));
                          }}
                          options={categories.map((c) => ({
                            value: c.id,
                            label: c.category,
                          }))}
                          selectAll={false}
                          placeholder="Select category"
                          emptyText="No categories available"
                          aria-label="Category"
                        />
                      )
                    }
                  </Field>

                  <Field
                    label="Sub group"
                    hint={
                      selectedCategoryName
                        ? "Sub groups within " + selectedCategoryName + "."
                        : "Pick a category first — sub groups belong to one."
                    }
                  >
                    {(control) => (
                      <MultiSelect
                        {...control}
                        value={selectedVarieties}
                        onChange={setVarieties}
                        options={varietyPickerOptions}
                        searchable
                        searchPlaceholder="Sub group name…"
                        placeholder="Select sub group"
                        emptyText={
                          selectedCategoryName
                            ? "No sub groups in this category"
                            : "Select a category first"
                        }
                        disabled={!selectedCategoryName}
                      />
                    )}
                  </Field>

                  {/* Whatever is already selected stays visible as removable
                      chips, so the picks are readable without reopening the
                      dropdown. */}
                  {selectedVarieties.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedVarieties.map((variety) => (
                        <span
                          key={variety}
                          className="inline-flex items-center gap-1 rounded-full bg-surface-strong py-0.5 pl-2.5 pr-1 text-[12px] text-ink"
                        >
                          {variety}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-5 rounded-full"
                            onClick={() =>
                              setVarieties(selectedVarieties.filter((v) => v !== variety))
                            }
                            aria-label={"Remove " + variety}
                          >
                            <HiOutlineXMark />
                          </Button>
                        </span>
                      ))}
                      <Button variant="ghost" size="xs" onClick={() => setVarieties([])}>
                        Clear all
                      </Button>
                    </div>
                  )}

                  {formError && <Notice tone="bad">{formError}</Notice>}
                </DialogBody>

                <DialogFooter>
                  <Button type="button" onClick={closeForm} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSaving || !canSubmit}
                    title={canSubmit ? undefined : "Select a " + missing.join(", ") + " first."}
                  >
                    {isSaving
                      ? isEditMode
                        ? "Updating…"
                        : "Creating…"
                      : isEditMode
                        ? "Update user"
                        : "Create user"}
                  </Button>
                </DialogFooter>
              </fieldset>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
