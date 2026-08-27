import { useState, useEffect, useRef } from "react";
import { userService } from "../services/userService";
import type { User, Option, CreateUserData, CategoryOption } from "../services/userService";
import { sapService } from "../services/sapService";
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

export default function App_User() {

  const stateRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);
  const varietyRef = useRef<HTMLDivElement>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [mainGroup, setMainGroup] = useState<Option[]>([]);
  const [state, setState] = useState<Option[]>([]);
  const [role, setRole] = useState<Option[]>([]);
  const [company, setCompany] = useState<Option[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [varietyOptions, setVarietyOptions] = useState<string[]>([]);
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

  useEffect(() => {
    fetchUsers();
    fetchMainGroup();
    fetchState();
    fetchRole();
    fetchCompany();
    fetchCategories();
  }, []);

  const selectedCategoryName =
    categories.find((item) => item.id === formData.category)?.category || "";

  useEffect(() => {
    fetchVarieties(selectedCategoryName);
  }, [selectedCategoryName]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        stateRef.current &&
        !stateRef.current.contains(event.target as Node)
      ) {
        setStDropdownOpen(false);
      }

      if (
        groupRef.current &&
        !groupRef.current.contains(event.target as Node)
      ) {
        setMgDropdownOpen(false);
      }

      if (
        roleRef.current &&
        !roleRef.current.contains(event.target as Node)
      ) {
        setRoleDropdownOpen(false);
      }

      if (
        varietyRef.current &&
        !varietyRef.current.contains(event.target as Node)
      ) {
        setVarietyDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const fetchUsers = async () => {
    setIsUsersLoading(true);
    try {
      const data = await userService.getUsers();
      setUsers(data.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsUsersLoading(false);
    }
  };

  const fetchMainGroup = async () => {
    try {
      const data2 = await userService.getMainGroup();
      setMainGroup(data2);
    } catch (error) {
      console.log("Error fetching main group:", error);
    }
  };

  const fetchState = async () => {
    try {
      const data3 = await userService.getState();
      setState(data3);
    } catch (error) {
      console.log("Error fetching State:", error);
    }
  };

  const fetchRole = async () => {
    try {
      const data4 = await userService.getRole();
      setRole(data4);

    } catch (error) {
      console.log("Error fetching User Role:", error);
    }
  };
  console.log("Roles fetched:", role);

  const fetchCompany = async () => {
    try {
      const data5 = await userService.getCompany();
      setCompany(data5);
    } catch (error) {
      console.log("Error fetching Company:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await userService.getCategories();
      setCategories(data);
    } catch (error) {
      console.log("Error fetching Category:", error);
    }
  };

  const fetchVarieties = async (category: string) => {
    if (!category) {
      setVarietyOptions([]);
      return;
    }
    try {
      const data = await sapService.getProductVarieties(category);
      const subGroups = Array.isArray(data.sub_groups)
        ? data.sub_groups
        : Array.isArray(data.varieties)
          ? data.varieties
          : [];
      setVarietyOptions(subGroups);
    } catch (error) {
      console.log("Error fetching SAP varieties:", error);
      setVarietyOptions([]);
    }
  };

  const toggleMainGroup = (id: number) => {
    setFormData((prev) => {
      const current = prev.mainGroups || [];
      const isSelected = current.includes(id);
      const updated = current.includes(id)
        ? current.filter((v) => v !== id)
        : [...current, id];
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
      const updated = current.includes(id)
        ? current.filter((v) => v !== id)
        : [...current, id];
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "role"
          ? (value === "" ? 0 : Number(value))
          : name === "company" || name === "category"
            ? (value === "" ? null : Number(value))
            : value,
    }));
  };

  const getCreateUserErrorMessage = (source: any) => {
    const responseData = source?.response?.data || source;
    const errorBag = responseData?.errors || {};

    const errorsToScan = Object.keys(errorBag).length > 0 ? errorBag : responseData;

    if (errorsToScan && typeof errorsToScan === "object" && !Array.isArray(errorsToScan)) {
      const usernameError = errorsToScan.username?.[0] || (typeof errorsToScan.username === "string" ? errorsToScan.username : null);
      const emailError = errorsToScan.email?.[0] || (typeof errorsToScan.email === "string" ? errorsToScan.email : null);
      const passwordError = errorsToScan.password?.[0] || (typeof errorsToScan.password === "string" ? errorsToScan.password : null);
      const nonFieldError = errorsToScan.non_field_errors?.[0];

      const isDuplicate = (val: any) => {
        const msg = String(val || "").toLowerCase();
        return msg.includes("already exist") || msg.includes("duplicate") || msg.includes("already taken");
      };

      if (isDuplicate(usernameError) && isDuplicate(emailError)) {
        return "Username and email already exist.";
      }
      if (isDuplicate(usernameError)) return "Username already exists.";
      if (isDuplicate(emailError)) return "Email already exists.";

      if (passwordError) return `Password: ${passwordError}`;
      if (usernameError) return `Username: ${usernameError}`;
      if (emailError) return `Email: ${emailError}`;
      if (nonFieldError) return String(nonFieldError);

      // Dynamically extract any other field error (e.g., phone, name)
      for (const [key, value] of Object.entries(errorsToScan)) {
        if (key !== "message" && key !== "error" && key !== "detail" && key !== "success") {
          if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
            const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
            return `${fieldName}: ${value[0]}`;
          }
        }
      }
    }

    if (typeof responseData?.message === "string" && responseData.message) return responseData.message;
    if (typeof responseData?.error === "string" && responseData.error) return responseData.error;
    if (typeof responseData?.detail === "string" && responseData.detail) return responseData.detail;

    return typeof responseData === "string" && responseData.trim() !== ""
      ? responseData
      : "Something went wrong while creating the user.";
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

        fetchUsers();
        setShowForm(false);
      } else {
        alert("Error: " + getCreateUserErrorMessage(result));
      }
    } catch (error: any) {
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
      getId(editableUser.role) ||
      role.find((r) => r.name.toLowerCase() === roleName)?.id ||
      0;

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
      <div className="au-header app-page-head" style={{ marginBottom: '24px', alignItems: 'center' }}>
        <div>
          <h1 className="au-title app-page-title">App Users</h1>
          <p className="au-subtitle app-page-subtitle" style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
            Manage user access, review account status and keep operational roles aligned.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="au-search">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
                <path d="m17 17-3.2-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
            <span className="au-table-count" style={{ margin: 0 }}>
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
              <div className="order-loading-state">
                <span className="order-loading-spinner" />
                <span>Loading users...</span>
              </div>
            ) : filteredUsers.length > 0 ? (
              <div className="au-table-wrap">
                <table className="au-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Company</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers
                        .slice(
                          (currentPage - 1) * itemsPerPage,
                          currentPage * itemsPerPage,
                        )
                        .map((user) => (
                          <tr key={user.id}>
                            <td className="au-muted">{user.id}</td>
                            <td className="au-name">{user.name}</td>
                            <td>{user.username}</td>
                            <td>{user.email || "—"}</td>
                            <td>
                              {user.role ? (
                                <span className="au-cell-badge au-cell-badge-role">{user.role}</span>
                              ) : (
                                <span className="au-muted">—</span>
                              )}
                            </td>
                            <td>{resolveOptionName(user.company, company)}</td>
                            <td>{userCategoryName(user)}</td>
                            <td>
                              <span
                                className={`au-cell-badge ${
                                  user.is_active === false ? "au-cell-badge-bad" : "au-cell-badge-ok"
                                }`}
                              >
                                {user.is_active === false ? "Inactive" : "Active"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="au-edit-btn"
                                onClick={() => handleEditUser(user)}
                                title="Edit User"
                                aria-label="Edit user"
                              >
                                <HiPencilSquare size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", margin: "20px 0" }}>
                {search ? "No users match your search" : "No users found"}
              </div>
            )}

          {filteredUsers.length > itemsPerPage && (
            <div className="au-pagination">
              <button
                className="au-pg-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                ← Prev
              </button>

              <span className="au-pg-info">
                {currentPage} / {Math.ceil(filteredUsers.length / itemsPerPage)}
              </span>

              <button
                className="au-pg-btn"
                disabled={
                  currentPage === Math.ceil(filteredUsers.length / itemsPerPage)
                }
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </div>

      {/* ── ADD / EDIT USER MODAL ── */}
      {showForm && (
        <div className="au-modal-overlay" role="dialog" aria-modal="true">
          <div className="au-modal">
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
                <label className="au-label">Full Name</label>
                <div className="au-input-wrap au-has-icon">
                  <HiUser className="au-field-icon" aria-hidden="true" />
                  <input
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
                <label className="au-label">Username</label>
                <div className="au-input-wrap au-has-icon">
                  <HiAtSymbol className="au-field-icon" aria-hidden="true" />
                  <input
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
                <label className="au-label">{isEditMode ? "Change Password" : "Password"}</label>
                <div className="au-input-wrap au-has-icon">
                  <HiLockClosed className="au-field-icon" aria-hidden="true" />
                  <input
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
                <label className="au-label">Email Address</label>
                <div className="au-input-wrap au-has-icon">
                  <HiEnvelope className="au-field-icon" aria-hidden="true" />
                  <input
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
                <label className="au-label">Contact No.</label>
                <div className="au-input-wrap au-has-icon">
                  <HiPhone className="au-field-icon" aria-hidden="true" />
                  <input
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
                  <div
                    className="au-mg-trigger"
                    onClick={() => setMgDropdownOpen((v) => !v)}
                  >
                    <span className="au-trigger-label">
                      <HiUserGroup className="au-field-icon" aria-hidden="true" />
                      <span>
                        {(formData.mainGroups?.length || 0) === 1
                          ? mainGroup.find((g) => g.id === formData.mainGroups![0])
                            ?.name || "1 selected"
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
                            checked={
                              formData.mainGroups?.includes(g.id) || false
                            }
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
                  <div
                    className="au-mg-trigger"
                    onClick={() => setStDropdownOpen((v) => !v)}
                  >
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
                          checked={
                            state.length > 0 &&
                            formData.states?.length === state.length
                          }
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
                          setFormData((prev) => ({ ...prev, category: c.id, categories: [c.id], variety: "" }))
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
                      <div className="au-mg-option au-variety-search" style={{ cursor: "default" }}>
                        <input
                          type="text"
                          value={varietySearch}
                          onChange={(event) => setVarietySearch(event.target.value)}
                          placeholder="Search sub group..."
                          style={{
                            width: "100%",
                            border: "1px solid #cbd5e1",
                            borderRadius: "6px",
                            padding: "8px 10px",
                            fontSize: "13px",
                            outline: "none",
                          }}
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
                          <div className="au-mg-option au-variety-selected-label">
                            Selected
                          </div>
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
                          {selectedCategoryName ? "No varieties found" : "Select category first"}
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
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    style={{
                      width: "13px",
                      height: "13px",
                      position: "relative",
                      zIndex: 1,
                    }}
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
          </div>
        </div>
      )}
    </div>
  );
}
