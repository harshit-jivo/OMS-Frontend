/**
 * App Users — the account list, and the form that creates and edits one.
 *
 * Sign-in is Jivo Auth's (auth.jivo.in). A person exists there first — an
 * administrator adds them — and creating an OMS user here means PICKING that
 * person and giving them OMS roles and scope. So the create form has no name,
 * email, username or password inputs, and the edit form shows name and email
 * read-only: they are Jivo Auth's, and the server ignores them.
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
import { JivoUserPicker } from "../components/JivoUserPicker";
import { userService } from "../services/userService";
import type { User, Option, CreateUserData } from "../services/userService";
import {
  useCategories,
  useCompanies,
  useJivoUsers,
  useMainGroups,
  useRoles,
  useStates,
  useUserList,
} from "../lib/authQueries";
import { useProductVarietiesMulti } from "../lib/sapQueries";
import { errorBody, fieldError, messageFrom } from "@/lib/apiError";

const ITEMS_PER_PAGE = 7;

/** Shown wherever the form displays something it cannot change. */
const MANAGED_IN_JIVO = "Name and email are managed in Jivo Auth.";

const BLANK_FORM: CreateUserData = {
  authId: "",
  username: "",
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
  // The whole row, not just its id: the edit form SHOWS its name and email.
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Who a new user can be. Fetched only while the create form is open — the
  // server asks Jivo Auth every time, and the list changes with each create.
  const {
    items: jivoUsers,
    isLoading: isJivoUsersLoading,
    isError: isJivoUsersError,
    error: jivoUsersError,
  } = useJivoUsers(showForm && !isEditMode);

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
   * Why a create or an edit was refused, named by the field it was about.
   *
   * Not just `messageFrom`: that reads `detail`/`message` first, and the
   * refusals people hit here are field errors — on a create, `auth_id` (the
   * picked person already has an OMS user, or no longer has OMS access); on an
   * edit, a duplicate username. The field is what tells the admin which input
   * to change.
   *
   * Duplicate EMAILS are no longer possible here: email is Jivo Auth's, and
   * it is not sent.
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

    const authId = fieldError(bag, "auth_id");
    const username = fieldError(bag, "username");
    const nonField = fieldError(bag, "non_field_errors");

    const isDuplicate = (value?: string) => {
      const msg = String(value || "").toLowerCase();
      return (
        msg.includes("already exist") || msg.includes("duplicate") || msg.includes("already taken")
      );
    };

    if (authId) return "Person: " + authId;
    if (isDuplicate(username)) return "Username already exists.";
    if (username) return "Username: " + username;
    if (nonField) return nonField;

    // Any other field the serializer rejected — phone, a role id.
    for (const [key, value] of Object.entries(bag ?? {})) {
      if (["message", "error", "detail", "success", "errors"].includes(key)) continue;
      const text = fieldError(bag, key);
      if (text && Array.isArray(value)) {
        return key.charAt(0).toUpperCase() + key.slice(1) + ": " + text;
      }
    }

    // The server's own sentence — a 503 says Jivo Auth could not be reached.
    // Read here as well as by `messageFrom`, which only reads axios errors and
    // would drop it from the service's non-throwing `{success: false}` result.
    const sentence = [body?.detail, body?.message].find(
      (value): value is string => typeof value === "string" && value.trim() !== "",
    );
    if (sentence) return sentence.trim();

    return messageFrom(source, "Something went wrong while saving the user.");
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
  if (!isEditMode && !formData.authId) missing.push("person");
  if (!formData.role) missing.push("role");
  if (!formData.company) missing.push("company");
  if (!formData.category) missing.push("category");
  const canSubmit = missing.length === 0;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    // Creating/updating a user is a multi-write call (role, groups, states,
    // categories); block the form until it settles so an impatient second
    // submit can't fire the same write twice.
    if (isSaving) return;
    setIsSaving(true);
    setFormError("");

    // Who was saved, for the toast — the picked person on a create.
    const picked = jivoUsers.find((person) => person.auth_id === formData.authId);
    const savedName =
      isEditMode && editingUser
        ? editingUser.name || formData.username
        : picked?.name || picked?.email || "The user";

    try {
      const result =
        isEditMode && editingUser
          ? await userService.updateUser(editingUser.id, formData)
          : await userService.createUser(formData);

      if (result.success) {
        showToast({
          title: isEditMode ? "User updated" : "User created",
          message: savedName + " was saved.",
        });
        setFormData(BLANK_FORM);
        setIsEditMode(false);
        setEditingUser(null);
        void queryClient.invalidateQueries({ queryKey: ["users"] });
        // The person just created now HAS an OMS user, so they leave the
        // create form's list.
        void queryClient.invalidateQueries({ queryKey: ["auth", "jivo-users"] });
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
    setEditingUser(user);
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
      authId: user.auth_id || "",
      username: user.username || "",
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
    setEditingUser(null);
    setFormData(BLANK_FORM);
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setIsEditMode(false);
    setEditingUser(null);
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
                  {!isEditMode && (
                    <Notice tone="info">
                      People are added to Jivo Auth by an administrator first; pick them here to
                      give them OMS access and roles.
                    </Notice>
                  )}

                  <FormGrid>
                    {isEditMode ? (
                      <>
                        {/* Read-only, not hidden: the admin still needs to see
                            whose account this is. Changing either is done in
                            Jivo Auth, and the server ignores them here. */}
                        <Field label="Full name" hint={MANAGED_IN_JIVO}>
                          {(control) => (
                            <Input {...control} value={editingUser?.name || ""} readOnly />
                          )}
                        </Field>

                        <Field label="Email address" hint={MANAGED_IN_JIVO}>
                          {(control) => (
                            <Input
                              {...control}
                              type="email"
                              value={editingUser?.email || ""}
                              placeholder="—"
                              readOnly
                            />
                          )}
                        </Field>

                        {/* Still editable: no longer a sign-in credential, but
                            other OMS features key on it. */}
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
                      </>
                    ) : (
                      <Field
                        label="Person"
                        required
                        span="full"
                        hint={
                          isJivoUsersError
                            ? undefined
                            : "Everyone with OMS access in Jivo Auth who has no OMS user yet."
                        }
                        error={
                          isJivoUsersError
                            ? messageFrom(jivoUsersError, "Could not load people from Jivo Auth.")
                            : undefined
                        }
                      >
                        {(control) => (
                          <JivoUserPicker
                            id={control.id}
                            users={jivoUsers}
                            value={formData.authId}
                            onChange={(authId) => setFormData((prev) => ({ ...prev, authId }))}
                            loading={isJivoUsersLoading}
                          />
                        )}
                      </Field>
                    )}

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
