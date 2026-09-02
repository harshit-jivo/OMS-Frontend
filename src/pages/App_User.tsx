import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { useProductVarieties } from "../lib/sapQueries";
import { Badge } from "@/components/ui/badge";
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
import "../styles/App_User.css";
import {
  HiAtSymbol,
  HiBuildingOffice2,
  HiCheckCircle,
  HiEnvelope,
  HiLockClosed,
  HiMapPin,
  HiPencilSquare,
  HiPhone,
  HiShieldCheck,
  HiTag,
  HiUser,
  HiUserGroup,
  HiXCircle,
  HiXMark,
} from "react-icons/hi2";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { errorBody, fieldError, messageFrom } from "@/lib/apiError";

export default function App_User() {
  const stateRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);
  const varietyRef = useRef<HTMLDivElement>(null);
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
  const [formData, setFormData] = useState<CreateUserData>({
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
    variety: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mgDropdownOpen, setMgDropdownOpen] = useState(false);
  const [stDropdownOpen, setStDropdownOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [varietyDropdownOpen, setVarietyDropdownOpen] = useState(false);
  const [varietySearch, setVarietySearch] = useState("");
  // Read-only: the show/hide toggle button below is currently commented out, so
  // nothing sets this and the field stays masked. Restore `setShowPassword` here
  // when re-enabling that button.
  const [showPassword] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const itemsPerPage = 7;
  const [isEditMode, setIsEditMode] = useState(false);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  const selectedCategoryName =
    categories.find((item) => item.id === formData.category)?.category || "";

  /*
   * Was `useEffect(() => fetchVarieties(selectedCategoryName), [selectedCategoryName])`,
   * where `fetchVarieties` opened with a synchronous `setVarietyOptions([])`
   * before its first await — a `react-hooks/set-state-in-effect` violation that
   * only passed lint because the mount fetch above made the component
   * unanalysable. `enabled` inside the hook replaces both the effect and that
   * clearing branch.
   */
  const { varieties: varietyOptions } = useProductVarieties(selectedCategoryName);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stateRef.current && !stateRef.current.contains(event.target as Node)) {
        setStDropdownOpen(false);
      }

      if (groupRef.current && !groupRef.current.contains(event.target as Node)) {
        setMgDropdownOpen(false);
      }

      if (roleRef.current && !roleRef.current.contains(event.target as Node)) {
        setRoleDropdownOpen(false);
      }

      if (varietyRef.current && !varietyRef.current.contains(event.target as Node)) {
        setVarietyDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleMainGroup = (id: number) => {
    setFormData((prev) => {
      const current = prev.mainGroups || [];
      const isSelected = current.includes(id);
      const updated = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
      return {
        ...prev,
        mainGroup: isSelected ? updated[0] || 0 : id,
        mainGroups: updated,
      };
    });
  };

  const toggleAllMainGroups = () => {
    setFormData((prev) => {
      const allSelected = (prev.mainGroups || []).length === mainGroup.length;
      const updated = allSelected ? [] : mainGroup.map((g) => g.id);
      return {
        ...prev,
        mainGroup: updated[0] || 0,
        mainGroups: updated,
      };
    });
  };

  const toggleState = (id: number) => {
    setFormData((prev) => {
      const current = prev.states || [];
      const isSelected = current.includes(id);
      const updated = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
      return {
        ...prev,
        state: isSelected ? updated[0] || 0 : id,
        states: updated,
      };
    });
  };

  const toggleAllStates = () => {
    setFormData((prev) => {
      const allSelected = (prev.states || []).length === state.length;
      const updated = allSelected ? [] : state.map((s) => s.id);
      return { ...prev, state: updated[0] || 0, states: updated };
    });
  };

  const getOptionName = (options: Option[], id: number | null | undefined, fallback: string) =>
    options.find((item) => item.id === id)?.name || fallback;

  const selectedVarieties = String(formData.variety || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const filteredVarietyOptions = varietyOptions.filter((variety) =>
    variety.toLowerCase().includes(varietySearch.trim().toLowerCase()),
  );
  const selectedVarietyOptions = selectedVarieties.filter((variety) =>
    variety.toLowerCase().includes(varietySearch.trim().toLowerCase()),
  );
  const unselectedVarietyOptions = filteredVarietyOptions.filter(
    (variety) => !selectedVarieties.includes(variety),
  );
  const varietyLabel =
    selectedVarieties.length === 0
      ? "Select Sub Group"
      : selectedVarieties.length === 1
        ? selectedVarieties[0]
        : `${selectedVarieties.length} sub groups selected`;

  const toggleVariety = (variety: string) => {
    setFormData((prev) => {
      const current = String(prev.variety || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const updated = current.includes(variety)
        ? current.filter((value) => value !== variety)
        : [...current, variety];
      return { ...prev, variety: updated.join(", ") };
    });
  };

  const allFilteredVarietiesSelected =
    filteredVarietyOptions.length > 0 &&
    filteredVarietyOptions.every((variety) => selectedVarieties.includes(variety));

  const toggleAllFilteredVarieties = () => {
    setFormData((prev) => {
      const current = String(prev.variety || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const updated = allFilteredVarietiesSelected
        ? current.filter((value) => !filteredVarietyOptions.includes(value))
        : Array.from(new Set([...current, ...filteredVarietyOptions]));

      return { ...prev, variety: updated.join(", ") };
    });
  };

  const closeSingleSelects = () => {
    setRoleDropdownOpen(false);
    setVarietyDropdownOpen(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "role"
          ? value === ""
            ? 0
            : Number(value)
          : name === "company" || name === "category"
            ? value === ""
              ? null
              : Number(value)
            : value,
    }));
  };

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
   * result — both reach the same alert, so both are handled here rather than
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

    if (password) return `Password: ${password}`;
    if (username) return `Username: ${username}`;
    if (email) return `Email: ${email}`;
    if (nonField) return nonField;

    // Any other field the serializer rejected — phone, name, a role id.
    for (const [key, value] of Object.entries(bag ?? {})) {
      if (["message", "error", "detail", "success", "errors"].includes(key)) continue;
      const text = fieldError(bag, key);
      if (text && Array.isArray(value)) {
        return `${key.charAt(0).toUpperCase()}${key.slice(1)}: ${text}`;
      }
    }

    return messageFrom(source, "Something went wrong while creating the user.");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.role || !formData.company || !formData.category) {
      alert("Please select role, company and category.");
      return;
    }

    // Creating/updating a user is a multi-write call (role, groups, states,
    // categories, password); block the form until it settles so an impatient
    // second submit can't fire the same write twice.
    if (isSaving) return;
    setIsSaving(true);

    try {
      let result;

      if (isEditMode && editUserId) {
        result = await userService.updateUser(editUserId, formData);
      } else {
        result = await userService.createUser(formData);
      }

      if (result.success) {
        alert(isEditMode ? "User Updated ✅" : "User Added ✅");

        setFormData({
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
          variety: "",
        });

        setIsEditMode(false);
        setEditUserId(null);

        void queryClient.invalidateQueries({ queryKey: ["users"] });
        setShowForm(false);
      } else {
        alert("Error: " + getCreateUserErrorMessage(result));
      }
    } catch (error) {
      alert("Error: " + getCreateUserErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditUser = (user: User) => {
    setIsEditMode(true);
    setEditUserId(user.id);

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
    // Category select is single-choice, so picking one replaces this list.
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

  const blankForm: CreateUserData = {
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
    variety: "",
  };

  const openAddForm = () => {
    setIsEditMode(false);
    setEditUserId(null);
    setFormData(blankForm);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setIsEditMode(false);
    setEditUserId(null);
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

  const activeUsers = users.filter((user) => user.is_active !== false).length;
  const distinctRoles = new Set(
    users.map((user) => String(user.role || user.role_name || "").trim()).filter(Boolean),
  ).size;
  const userKpis = [
    { label: "Total Users", value: users.length, icon: HiUserGroup, tone: "" },
    { label: "Active", value: activeUsers, icon: HiCheckCircle, tone: "au-kpi-ok" },
    { label: "Inactive", value: users.length - activeUsers, icon: HiXCircle, tone: "au-kpi-bad" },
    { label: "Roles In Use", value: distinctRoles, icon: HiShieldCheck, tone: "" },
  ];

  return (
    <div className="au-page app-page">
      {/* ── PAGE HEADER ── */}
      <div className="au-header app-page-head au-header--center">
        <div>
          <h1 className="au-title app-page-title">App Users</h1>
          <p className="au-subtitle app-page-subtitle">
            Manage user access, review account status and keep operational roles aligned.
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
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search users…"
              aria-label="Search users"
            />
            {search && (
              <button
                type="button"
                className="au-search-clear"
                onClick={() => {
                  setSearch("");
                  setCurrentPage(1);
                }}
                aria-label="Clear search"
              >
                &times;
              </button>
            )}
          </div>
          <span className="au-table-count">
            Total: {filteredUsers.length}
          </span>
          <button className="au-toggle-btn" onClick={openAddForm}>
            <span>+ Add User</span>
          </button>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="au-kpis">
        {userKpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article className={`au-kpi ${kpi.tone}`} key={kpi.label}>
              <span className="au-kpi-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="au-kpi-body">
                <span className="au-kpi-value">
                  {isUsersLoading ? "—" : kpi.value.toLocaleString("en-IN")}
                </span>
                <span className="au-kpi-label">{kpi.label}</span>
              </div>
            </article>
          );
        })}
      </div>

      {/* ── USERS TABLE ── */}
      <div className="au-table-card">
        {isUsersLoading ? (
          <TableSkeleton columns={9} label="Loading users" />
        ) : (
          /*
           * Phase 2.1: the first page off its own table CSS.
           *
           * The empty state moved INSIDE the table. It used to be a sibling
           * div rendered instead of the `<table>`, which took the column
           * headers away with the rows — so "no users match your search"
           * arrived with no indication of what was being searched.
           *
           * `au-table` / `au-table-wrap` are gone rather than kept
           * alongside. Existing CSS is unlayered and beats every utility in
           * the primitive, so leaving the old class on would render the old
           * design and look like the swap did nothing.
           */
          <Table>
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableEmpty colSpan={9}>
                  {search ? "No users match your search" : "No users found"}
                </TableEmpty>
              ) : (
                filteredUsers
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="au-muted">{user.id}</TableCell>
                      <TableCell className="au-name">{user.name}</TableCell>
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
                          <span className="au-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>{resolveOptionName(user.company, company)}</TableCell>
                      <TableCell>{userCategoryName(user)}</TableCell>
                      <TableCell>
                        {/*
                              The tone comes from the status word rather than
                              from a local ternary, so "Active" here is the same
                              green as "Active" anywhere else in the app. That
                              is the whole point of statusTone.ts.
                            */}
                        <Badge
                          tone={toneForStatus(user.is_active === false ? "inactive" : "active")}
                          caps
                        >
                          {user.is_active === false ? "Inactive" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          className="au-edit-btn"
                          onClick={() => handleEditUser(user)}
                          title="Edit User"
                          aria-label="Edit user"
                        >
                          <HiPencilSquare size={16} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        )}

        {filteredUsers.length > itemsPerPage && (
          <Pagination
            page={currentPage}
            totalPages={Math.ceil(filteredUsers.length / itemsPerPage)}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      {/* ── ADD / EDIT USER MODAL ── */}
      <Dialog
        open={Boolean(showForm)}
        onOpenChange={(next) => {
          if (!next) setShowForm(false);
        }}
      >
        {showForm && (
          <DialogContent
            title="User form"
            variant="bare"
            size="auto"
            showClose={false}
            className="au-modal"
          >
            <div className="au-form-toolbar">
              <h2 className="au-form-heading">
                {isEditMode ? "Update User Details" : "User Details"}
              </h2>
              <button
                type="button"
                className="au-modal-close"
                onClick={closeForm}
                disabled={isSaving}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* Covers the form for the duration of the save, so nothing can be
              edited or re-submitted mid-write. */}
            {isSaving && (
              <div className="au-saving" role="status" aria-live="polite">
                <span className="au-saving-spinner" aria-hidden="true" />
                <span className="au-saving-text">
                  {isEditMode ? "Updating user…" : "Creating user…"}
                </span>
                <span className="au-saving-hint">This only takes a moment.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} aria-busy={isSaving}>
              <fieldset className="au-fieldset" disabled={isSaving}>
                <div className="au-form-grid">
                  <div className="au-field">
                    <label className="au-label" htmlFor="au-name">Full Name</label>
                    <div className="au-input-wrap au-has-icon">
                      <HiUser className="au-field-icon" aria-hidden="true" />
                      <input
                        id="au-name"
                        type="text"
                        name="name"
                        placeholder="Name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                      />
                      <div className="au-focus-line" />
                    </div>
                  </div>
                  <div className="au-field">
                    <label className="au-label" htmlFor="au-username">Username</label>
                    <div className="au-input-wrap au-has-icon">
                      <HiAtSymbol className="au-field-icon" aria-hidden="true" />
                      <input
                        id="au-username"
                        type="text"
                        name="username"
                        placeholder="Username"
                        value={formData.username}
                        onChange={handleChange}
                        required
                      />
                      <div className="au-focus-line" />
                    </div>
                  </div>
                  <div className="au-field">
                    <label className="au-label" htmlFor="au-password">
                      {isEditMode ? "Change Password" : "Password"}
                    </label>
                    <div className="au-input-wrap au-has-icon">
                      <HiLockClosed className="au-field-icon" aria-hidden="true" />
                      <input
                        id="au-password"
                        className="au-password-input"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        placeholder={isEditMode ? "Leave blank to keep current" : "••••••••"}
                        value={formData.password}
                        onChange={handleChange}
                        required={!isEditMode}
                      />
                      {/* <button
                    type="button"
                    className="au-eye-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 3l18 18M10.477 10.477A3 3 0 0013.5 13.5M6.228 6.228A10.45 10.45 0 002.458 12C3.732 16.057 7.523 19 12 19c1.7 0 3.3-.425 4.7-1.175M9.756 4.82A9.568 9.568 0 0112 4.5c4.478 0 8.268 2.943 9.542 7a10.49 10.49 0 01-1.552 3.145"
                        />
                      </svg>
                    ) : (
                      <svg
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button> */}
                      <div className="au-focus-line" />
                    </div>
                  </div>
                  <div className="au-field">
                    <label className="au-label" htmlFor="au-email">Email Address</label>
                    <div className="au-input-wrap au-has-icon">
                      <HiEnvelope className="au-field-icon" aria-hidden="true" />
                      <input
                        id="au-email"
                        type="email"
                        name="email"
                        placeholder="abc@gmail.com"
                        value={formData.email}
                        onChange={handleChange}
                        required
                      />
                      <div className="au-focus-line" />
                    </div>
                  </div>
                  <div className="au-field">
                    <label className="au-label" htmlFor="au-phone">Contact No.</label>
                    <div className="au-input-wrap au-has-icon">
                      <HiPhone className="au-field-icon" aria-hidden="true" />
                      <input
                        id="au-phone"
                        type="tel"
                        name="phone"
                        maxLength={10}
                        placeholder="10-digit number"
                        value={formData.phone}
                        onChange={handleChange}
                        required
                      />
                      <div className="au-focus-line" />
                    </div>
                  </div>
                  <div className="au-field" ref={groupRef}>
                    <label className="au-label">Main Group</label>
                    <div className="au-mg-dropdown">
                      <div className="au-mg-trigger" onClick={() => setMgDropdownOpen((v) => !v)}>
                        <span className="au-trigger-label">
                          <HiUserGroup className="au-field-icon" aria-hidden="true" />
                          <span>
                            {(formData.mainGroups?.length || 0) === 1
                              ? mainGroup.find((g) => g.id === formData.mainGroups![0])?.name ||
                                "1 selected"
                              : (formData.mainGroups?.length || 0) > 1
                                ? `${formData.mainGroups!.length} selected`
                                : "Select Main Group"}
                          </span>
                        </span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M3 4.5L6 7.5L9 4.5"
                            stroke="#64748b"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      {mgDropdownOpen && (
                        <div className="au-mg-menu">
                          <label className="au-mg-option au-mg-selectall">
                            <input
                              type="checkbox"
                              checked={
                                mainGroup.length > 0 &&
                                formData.mainGroups?.length === mainGroup.length
                              }
                              onChange={toggleAllMainGroups}
                            />
                            Select All
                          </label>
                          {mainGroup.map((g) => (
                            <label key={g.id} className="au-mg-option">
                              <input
                                type="checkbox"
                                checked={formData.mainGroups?.includes(g.id) || false}
                                onChange={() => toggleMainGroup(g.id)}
                              />
                              {g.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="au-field" ref={stateRef}>
                    <label className="au-label">State</label>
                    <div className="au-mg-dropdown">
                      <div className="au-mg-trigger" onClick={() => setStDropdownOpen((v) => !v)}>
                        <span className="au-trigger-label">
                          <HiMapPin className="au-field-icon" aria-hidden="true" />
                          <span>
                            {(formData.states?.length || 0) === 1
                              ? state.find((s) => s.id === formData.states![0])?.name ||
                                "1 selected"
                              : (formData.states?.length || 0) > 1
                                ? `${formData.states!.length} selected`
                                : "Select State"}
                          </span>
                        </span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M3 4.5L6 7.5L9 4.5"
                            stroke="#64748b"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      {stDropdownOpen && (
                        <div className="au-mg-menu">
                          <label className="au-mg-option au-mg-selectall">
                            <input
                              type="checkbox"
                              checked={state.length > 0 && formData.states?.length === state.length}
                              onChange={toggleAllStates}
                            />
                            Select All
                          </label>
                          {state.map((s) => (
                            <label key={s.id} className="au-mg-option">
                              <input
                                type="checkbox"
                                checked={formData.states?.includes(s.id) || false}
                                onChange={() => toggleState(s.id)}
                              />
                              {s.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="au-field" ref={roleRef}>
                    <label className="au-label">User Role</label>
                    <div className="au-mg-dropdown">
                      <div
                        className="au-mg-trigger"
                        onClick={() => {
                          closeSingleSelects();
                          setRoleDropdownOpen((value) => !value);
                        }}
                      >
                        <span className="au-trigger-label">
                          <HiShieldCheck className="au-field-icon" aria-hidden="true" />
                          <span>{getOptionName(role, formData.role, "Select Role")}</span>
                        </span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M3 4.5L6 7.5L9 4.5"
                            stroke="#64748b"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      {roleDropdownOpen && (
                        <div className="au-mg-menu">
                          {role.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              className={`au-mg-option au-select-option${formData.role === r.id ? " is-selected" : ""}`}
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, role: r.id }));
                                setRoleDropdownOpen(false);
                              }}
                            >
                              {r.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Company and Category are short, mutually exclusive lists, so they
                  read better as pellets than as dropdowns — every option visible,
                  one tap to pick. */}
                  <div className="au-field au-full">
                    <label className="au-label">
                      <HiBuildingOffice2 className="au-field-icon" aria-hidden="true" />
                      Company
                    </label>
                    {company.length === 0 ? (
                      <p className="au-pellet-empty">No companies available.</p>
                    ) : (
                      <div className="au-pellets" role="radiogroup" aria-label="Company">
                        {company.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            role="radio"
                            aria-checked={formData.company === c.id}
                            className={`au-pellet${formData.company === c.id ? " au-pellet-active" : ""}`}
                            onClick={() => setFormData((prev) => ({ ...prev, company: c.id }))}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="au-field au-full">
                    <label className="au-label">
                      <HiTag className="au-field-icon" aria-hidden="true" />
                      Category
                    </label>
                    {categories.length === 0 ? (
                      <p className="au-pellet-empty">No categories available.</p>
                    ) : (
                      <div className="au-pellets" role="radiogroup" aria-label="Category">
                        {categories.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            role="radio"
                            aria-checked={formData.category === c.id}
                            className={`au-pellet${formData.category === c.id ? " au-pellet-active" : ""}`}
                            // Switching category invalidates the sub groups under it.
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                category: c.id,
                                categories: [c.id],
                                variety: "",
                              }))
                            }
                          >
                            {c.category}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="au-field au-full">
                    <label className="au-label">Sub Group</label>
                    <div className="au-mg-dropdown" ref={varietyRef}>
                      <div
                        className="au-mg-trigger"
                        onClick={() => {
                          closeSingleSelects();
                          setVarietyDropdownOpen((value) => !value);
                        }}
                      >
                        <span className="au-trigger-label">
                          <HiTag className="au-field-icon" aria-hidden="true" />
                          <span>{varietyLabel}</span>
                        </span>
                        {selectedVarieties.length > 0 && (
                          <span className="au-pellet-count">{selectedVarieties.length}</span>
                        )}
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M3 4.5L6 7.5L9 4.5"
                            stroke="#64748b"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      {varietyDropdownOpen && (
                        <div className="au-mg-menu au-variety-menu">
                          <div className="au-mg-option au-variety-search">
                            <input
                              type="text"
                              className="au-variety-search-input"
                              value={varietySearch}
                              onChange={(event) => setVarietySearch(event.target.value)}
                              placeholder="Search sub group..."
                              onClick={(event) => event.stopPropagation()}
                            />
                          </div>
                          <label className="au-mg-option au-mg-selectall au-variety-selectall">
                            <input
                              type="checkbox"
                              checked={allFilteredVarietiesSelected}
                              disabled={filteredVarietyOptions.length === 0}
                              onChange={toggleAllFilteredVarieties}
                            />
                            Select All
                          </label>
                          {selectedVarietyOptions.length > 0 && (
                            <>
                              <div className="au-mg-option au-variety-selected-label">Selected</div>
                              {selectedVarietyOptions.map((variety) => (
                                <label key={`selected-${variety}`} className="au-mg-option">
                                  <input
                                    type="checkbox"
                                    checked
                                    onChange={() => toggleVariety(variety)}
                                  />
                                  {variety}
                                </label>
                              ))}
                            </>
                          )}
                          {unselectedVarietyOptions.length > 0 ? (
                            unselectedVarietyOptions.map((variety) => (
                              <label key={variety} className="au-mg-option">
                                <input
                                  type="checkbox"
                                  checked={false}
                                  onChange={() => toggleVariety(variety)}
                                />
                                {variety}
                              </label>
                            ))
                          ) : selectedVarietyOptions.length === 0 ? (
                            <div className="au-mg-option">
                              {selectedCategoryName
                                ? "No varieties found"
                                : "Select category first"}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                    {/* Whatever is already selected stays visible as removable pellets,
                    so the picks are readable without reopening the dropdown. */}
                    {selectedVarieties.length > 0 && (
                      <div className="au-pellets au-pellets-chosen">
                        {selectedVarieties.map((variety) => (
                          <button
                            key={`chosen-${variety}`}
                            type="button"
                            className="au-pellet au-pellet-chosen"
                            title={`Remove ${variety}`}
                            aria-label={`Remove ${variety}`}
                            onClick={() => toggleVariety(variety)}
                          >
                            {variety}
                            <HiXMark className="au-pellet-x" aria-hidden="true" />
                          </button>
                        ))}
                        <button
                          type="button"
                          className="au-pellet au-pellet-clear"
                          onClick={() => setFormData((prev) => ({ ...prev, variety: "" }))}
                        >
                          Clear all
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="au-form-actions">
                  <button type="submit" className="au-submit" disabled={isSaving}>
                    <span>
                      {isSaving
                        ? isEditMode
                          ? "Updating…"
                          : "Creating…"
                        : isEditMode
                          ? "Update User"
                          : "Create User"}
                    </span>
                    {isSaving ? (
                      <span className="au-submit-spinner" aria-hidden="true" />
                    ) : (
                      <svg
                        className="au-submit-icon"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M17 8l4 4m0 0l-4 4m4-4H3"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </fieldset>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
