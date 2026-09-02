import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
// SheetJS (422 kB) is fetched at import time, not page-load time — see
// utils/xlsxLoader.ts. Reading uploaded workbooks only; writing goes
// through excelExport.
import { loadXlsx, type WorkBook, type XlsxModule } from "../utils/xlsxLoader";
import { startSheetsExport } from "../utils/excelExport";
import { userService } from "../services/userService";
import type { User } from "../services/userService";
import { useUserList } from "../lib/authQueries";
import { useSapParties } from "../lib/sapQueries";
import type { Party } from "../services/sapService";
import "../styles/Party_Assignment.css";
import { errorBody } from "@/lib/apiError";

type SearchableParty = Party & {
  CardCode?: string | number | null;
  CardName?: string | null;
};

const asText = (value: unknown) => String(value ?? "").trim();
const normalizeSearch = (value: unknown) =>
  asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const getPartyCode = (party: SearchableParty) => asText(party.card_code || party.CardCode);
const getPartyName = (party: SearchableParty) => asText(party.card_name || party.CardName);
const getPartyCategory = (party: SearchableParty) => asText(party.category);
const normalizeCategory = (value: unknown) => asText(value).toUpperCase();
const getPartyKey = (party: SearchableParty) =>
  [getPartyCode(party), asText(party.category), asText(party.id)].filter(Boolean).join("-");

const getUserCategory = (user?: User) => {
  const category = user?.category;
  if (!category) return "";
  if (typeof category === "string" || typeof category === "number") return asText(category);
  return asText(category.category);
};

// All categories assigned to a user (OIL / BEVERAGES / MART), falling back to
// the single primary category for users created before multi-category support.
const getUserCategories = (user?: User): string[] => {
  const list = (user as { categories?: Array<{ category?: string } | string> } | undefined)
    ?.categories;
  const names = Array.isArray(list)
    ? list.map((c) => asText(typeof c === "string" ? c : c?.category)).filter(Boolean)
    : [];
  if (names.length) return Array.from(new Set(names));
  const single = getUserCategory(user);
  return single ? [single] : [];
};

const isPartyInUserCategory = (party: Party, userCategory: string) =>
  !userCategory || normalizeCategory(party.category) === normalizeCategory(userCategory);

const mergeParties = (partyList: Party[]) => {
  const seen = new Set<string>();

  return partyList.filter((party) => {
    const key = getPartyKey(party);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/* Superseded by `asList` in src/lib/sapQueries.ts, which now accepts the same
   three shapes for every consumer of ["sap","parties"] rather than only this
   page. Kept rather than deleted, per the repo's standing rule on removals.
const getPartyList = (data: unknown): Party[] => {
  if (Array.isArray(data)) return data as Party[];
  if (data && typeof data === "object") {
    const response = data as { data?: unknown; results?: unknown };
    if (Array.isArray(response.data)) return response.data as Party[];
    if (Array.isArray(response.results)) return response.results as Party[];
  }
  return [];
};
*/

const getImportValue = (row: Record<string, unknown>, keys: string[]) => {
  const normalizedEntries = Object.entries(row).map(
    ([key, value]) => [normalizeSearch(key), value] as const,
  );
  for (const key of keys) {
    const normalizedKey = normalizeSearch(key);
    const match = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
    if (match) return match[1];
  }
  return "";
};

const getWorksheetRows = (XLSX: XlsxModule, workbook: WorkBook, sheetNames: string[]) => {
  const normalizedNames = sheetNames.map(normalizeSearch);
  const sheetName = workbook.SheetNames.find((name) =>
    normalizedNames.includes(normalizeSearch(name)),
  );
  if (!sheetName) return [];

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
  });
};

const splitImportList = (value: unknown) =>
  asText(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export default function Party_Assignment() {
  const queryClient = useQueryClient();

  /*
   * The user list is the shared ["users"] key; the role filter is this page's
   * own business and stays here. It used to read `data.data.filter(...)` with
   * no guard at all, so any response that was not `{data: [...]}` threw
   * "filter is not a function" — the tolerant unwrap now lives in the hook.
   */
  const { users: allUsers } = useUserList();
  const users = useMemo(
    () =>
      allUsers.filter(
        (u) =>
          (u as { role_id?: number }).role_id === 2 ||
          (u as { role_id?: number }).role_id === 4 ||
          Number(u.role) === 2 ||
          Number(u.role) === 4 ||
          u.role?.toLowerCase() === "manager" ||
          u.role?.toLowerCase() === "billing" ||
          u.role?.toLowerCase() === "distributor",
      ),
    [allUsers],
  );

  /* Shared with the five Sap Sync tabs under ["sap","parties"]. The dedupe is
     this page's, so it runs over the cached list rather than inside the fetch. */
  const { items: rawParties, isFetching: isPartiesLoading } = useSapParties();
  const parties = useMemo(() => mergeParties(rawParties), [rawParties]);
  const [selectedUser, setSelectedUser] = useState<number | "">("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showParties, setShowParties] = useState(false);
  const [search, setSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  // const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const fetchParties = () => queryClient.invalidateQueries({ queryKey: ["sap", "parties"] });

  /*
   * DELIBERATELY IMPERATIVE, and it must stay that way.
   *
   * `selectedParties` is server-seeded and then user-editable: this seeds it,
   * and the checkboxes below (and Import) edit it freely before Save. It
   * therefore cannot BE query data — and it must not be re-seeded from an
   * effect on the query either, because a background refetch would then throw
   * away edits the user has not saved yet.
   *
   * What the cache does buy is the fetch itself: `fetchQuery` on a per-user,
   * per-category key means re-selecting a user you already looked at does not
   * re-request their assignment list.
   */
  const fetchUserParties = async (userId: number, category?: string) => {
    const userRecord = users.find((user) => user.id === userId);
    // Scope to the chosen category; default to the user's first category.
    const userCategory = category ?? (getUserCategories(userRecord)[0] || "");
    try {
      const res = await queryClient.fetchQuery({
        queryKey: ["party", "assigned", userId, userCategory],
        queryFn: () => userService.getUserParties(userId, userCategory || undefined),
      });

      const assigned = (res.data?.parties || [])
        .filter((p: Party) => isPartyInUserCategory(p, userCategory))
        .map((p: Party) => asText(p.card_code));

      setSelectedParties(assigned);
    } catch (err) {
      console.error("Error fetching assigned parties", err);
    }
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setSelectedParties([]);
    if (selectedUser) fetchUserParties(Number(selectedUser), category);
  };

  const selectedUserRecord = users.find((user) => user.id === selectedUser);
  const selectedUserCategories = getUserCategories(selectedUserRecord);
  // The category currently being assigned for (defaults to the user's first).
  const selectedUserCategoryLabel = selectedCategory || selectedUserCategories[0] || "";
  const partyOptions = parties.filter((party) =>
    isPartyInUserCategory(party, selectedUserCategoryLabel),
  );
  const partySearchTerm = normalizeSearch(search);
  const visibleParties = partyOptions.filter((party) => {
    if (!partySearchTerm) return true;

    const searchableText = [
      getPartyName(party),
      getPartyCode(party),
      party.state,
      party.main_group,
      getPartyCategory(party),
    ]
      .map(normalizeSearch)
      .join(" ");

    return partySearchTerm.split(" ").every((term) => searchableText.includes(term));
  });
  const visiblePartyKeys = visibleParties.map(getPartyCode);

  const filteredUsers = users.filter((user) =>
    normalizeSearch(user.name).includes(normalizeSearch(userSearch)),
  );

  const handleSave = async () => {
    try {
      if (!selectedUser) {
        alert("Please select user");
        return;
      }

      const selectedPartyCodes = [...new Set(selectedParties)];

      const res = await userService.assignPartiesToUser(
        Number(selectedUser),
        selectedPartyCodes,
        selectedUserCategoryLabel || undefined,
      );

      console.log("API Response:", res);

      alert("Parties saved successfully ✅");

      // close dropdown
      setShowParties(false);

      // reload assigned parties
      fetchUserParties(Number(selectedUser), selectedUserCategoryLabel);
    } catch (error) {
      console.error("Error saving parties:", error);
      alert("Failed to save ❌");
    }
  };

  const handleDel = async (partyCode: string) => {
    try {
      if (!selectedUser) return;

      console.log("Removing party", partyCode, "from user", selectedUser);

      const selectedPartyCodes = [...new Set(selectedParties.filter((p) => p !== partyCode))];
      await userService.assignPartiesToUser(
        Number(selectedUser),
        selectedPartyCodes,
        selectedUserCategoryLabel || undefined,
      );

      alert("Party removed ✅");

      fetchUserParties(Number(selectedUser), selectedUserCategoryLabel);
    } catch (error) {
      console.error(error);
      alert("Failed ❌");
    }
  };

  const downloadBulkTemplate = () => {
    const userRows = [{ Username: "manager.username" }, { Username: "billing.username" }];
    const partyRows = [
      { "Party Code": "CUST000001" },
      { "Party Code": "CUST000002" },
      { "Party Code": "CUST000003" },
    ];
    startSheetsExport(
      [
        { sheetName: "Users", rows: userRows },
        { sheetName: "Parties", rows: partyRows },
      ],
      "party-user-assignment-template.xlsx",
    );
  };

  const handleBulkImport = async (file: File) => {
    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await loadXlsx();
      const workbook = XLSX.read(buffer, { type: "array" });
      const userRows = getWorksheetRows(XLSX, workbook, ["Users", "User"]);
      const partyRows = getWorksheetRows(XLSX, workbook, [
        "Parties",
        "Party",
        "Party Codes",
        "Party Mapping",
      ]);

      let parsedRows: { user_name: string; name: string; username: string; card_code: string }[] =
        [];

      if (userRows.length && partyRows.length) {
        const userIdentifiers = Array.from(
          new Set(
            userRows
              .map((row) =>
                asText(
                  getImportValue(row, [
                    "Username",
                    "username",
                    "User",
                    "User Name",
                    "User ID",
                    "User Id",
                    "user_id",
                    "Name",
                    "name",
                  ]),
                ),
              )
              .filter(Boolean),
          ),
        );
        const partyCodes = Array.from(
          new Set(
            partyRows
              .map((row) =>
                asText(
                  getImportValue(row, [
                    "Party Code",
                    "Party Codes",
                    "Card Code",
                    "Card Codes",
                    "card_code",
                    "CardCode",
                    "party_code",
                  ]),
                ),
              )
              .filter(Boolean),
          ),
        );

        parsedRows = userIdentifiers.flatMap((userIdentifier) =>
          partyCodes.map((cardCode) => ({
            user_name: userIdentifier,
            name: userIdentifier,
            username: userIdentifier,
            card_code: cardCode,
          })),
        );
      } else {
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
        parsedRows = rows
          .flatMap((row) => {
            const userIdentifiers = [
              ...splitImportList(
                getImportValue(row, ["Users", "User", "User Name", "Name", "user_name", "name"]),
              ),
              ...splitImportList(
                getImportValue(row, [
                  "Usernames",
                  "Username",
                  "User ID",
                  "User Id",
                  "user_id",
                  "username",
                ]),
              ),
            ];
            const uniqueUsers = Array.from(new Set(userIdentifiers));
            const partyCodes = splitImportList(
              getImportValue(row, [
                "Party Codes",
                "Party Code",
                "Card Codes",
                "Card Code",
                "card_code",
                "CardCode",
                "party_code",
              ]),
            );

            return uniqueUsers.flatMap((userIdentifier) =>
              partyCodes.map((cardCode) => ({
                user_name: userIdentifier,
                name: userIdentifier,
                username: userIdentifier,
                card_code: cardCode,
              })),
            );
          })
          .filter((row) => (row.username || row.user_name) && row.card_code);
      }

      if (!parsedRows.length) {
        alert("No valid rows found. Use Users and Parties sheets from the template.");
        return;
      }

      const response = await userService.bulkAssignPartiesToUsers(parsedRows);
      const data = response.data || {};
      const errors = Array.isArray(data.errors) ? data.errors : [];
      const errorPreview = errors.slice(0, 5).join("\n");
      alert(
        [
          errors.length ? `Import completed with errors.` : `Import complete.`,
          `Added: ${data.added || 0}`,
          `Existing/updated: ${data.existing || 0}`,
          errors.length ? `Errors: ${errors.length}` : "",
          errorPreview,
          errors.length > 5 ? `${errors.length - 5} more errors...` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      if (errors.length) {
        console.warn("Party assignment import errors:", errors);
      }
      if (selectedUser) {
        fetchUserParties(Number(selectedUser));
      }
    } catch (error) {
      console.error("Error importing party assignments:", error);
      // The import endpoint answers `{ data: { errors: [...] } }` — a LIST of
      // per-row failures, not one message, so it reads the body directly.
      const data = errorBody(error)?.data as { errors?: unknown } | undefined;
      const errors: string[] = Array.isArray(data?.errors) ? (data.errors as string[]) : [];
      alert(
        errors.length
          ? `Import completed with errors: ${errors.slice(0, 3).join("; ")}`
          : "Failed to import Excel file.",
      );
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="pa-page app-page">
      {!showParties && (
        <div className="pa-card">
          <div className="pa-card-head">
            <h1 className="pa-title">Party Assignment</h1>
            {/* <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Search and select a user to manage their assigned parties.</p> */}
          </div>

          <div className="pa-upload">
            <div>
              <h2 className="pa-upload-title">Excel Upload</h2>
              <p className="pa-upload-note">
                Add usernames in the Users sheet and one party code per row in the Parties sheet;
                every listed party is assigned to every listed user.
              </p>
            </div>
            <div className="pa-upload-actions">
              <button
                type="button"
                onClick={downloadBulkTemplate}
                className="pa-btn pa-btn-outline"
              >
                Download Template
              </button>
              <button
                type="button"
                disabled={isImporting}
                onClick={() => importInputRef.current?.click()}
                className="pa-btn pa-btn-go"
              >
                {isImporting ? "Uploading..." : "Upload Excel"}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                aria-label="Upload Excel file"
                className="pa-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    handleBulkImport(file);
                  }
                }}
              />
            </div>
          </div>

          <div className="pa-search">
            <label className="pa-label">User Search</label>
            <div className="pa-search-wrap">
              <input
                type="text"
                placeholder="Type name to search..." aria-label="Type name to search"
                className="pa-search-input"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
              />
            </div>

            {showDropdown && (
              <div className="pa-dropdown">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="pa-dropdown-item"
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      onClick={() => {
                        const firstCategory = getUserCategories(user)[0] || "";
                        setSelectedUser(user.id);
                        setUserSearch(user.name);
                        setShowDropdown(false);
                        setSelectedCategory(firstCategory);
                        fetchUserParties(user.id, firstCategory);
                      }}
                    >
                      <div className="pa-dropdown-name">{user.name}</div>
                      <div className="pa-dropdown-role">
                        {user.role || "Unknown Role"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="pa-dropdown-empty">No users found</div>
                )}
              </div>
            )}
          </div>

          {selectedUser && (
            <div className="pa-assigned">
              <div className="pa-assigned-head">
                <div>
                  <h3 className="pa-assigned-title">
                    Assigned Parties
                  </h3>
                  <p className="pa-assigned-sub">
                    <strong>{[...new Set(selectedParties)].length}</strong> parties assigned to{" "}
                    <strong>{selectedUserRecord?.name}</strong>
                    {selectedUserCategoryLabel && (
                      <>
                        {" "}
                        in <strong>{selectedUserCategoryLabel}</strong>
                      </>
                    )}
                  </p>
                </div>
                <button
                  className="pa-btn-assign"
                  onClick={() => {
                    setSearch("");
                    setShowParties(true);
                    if (parties.length === 0) fetchParties();
                  }}
                >
                  + Assign New Parties
                </button>
              </div>

              {selectedUserCategories.length > 1 && (
                <div className="pa-category-row">
                  <span className="pa-category-label">
                    Category:
                  </span>
                  {selectedUserCategories.map((cat) => {
                    const active = selectedUserCategoryLabel === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategoryChange(cat)}
                        className={`pa-category-chip${active ? " pa-category-chip--active" : ""}`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="pa-assigned-grid">
                {(selectedParties || []).length > 0 ? (
                  [...new Set(selectedParties)].map((partyCode) => {
                    const party = partyOptions.find((p) => getPartyCode(p) === partyCode);
                    return party ? (
                      <div
                        key={getPartyKey(party)}
                        className="pa-assigned-card"
                      >
                        <div>
                          <div className="pa-assigned-name">
                            {getPartyName(party)}
                          </div>
                          <div className="pa-assigned-meta">
                            {[getPartyCode(party), party.state, getPartyCategory(party)]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        </div>
                        <button
                          className="pa-assigned-remove"
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
                          onClick={() => handleDel(getPartyCode(party))}
                          title="Remove Party"
                        >
                          ×
                        </button>
                      </div>
                    ) : null;
                  })
                ) : (
                  <div className="pa-assigned-empty">
                    No parties assigned to this user yet. Click "Assign New Parties" to get started.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showParties && (
        <div className="pa-card">
          <div className="pa-panel-head">
            <div>
              <h2 className="pa-title">
                Assign Parties
              </h2>
              <p className="pa-panel-sub">
                Select multiple{" "}
                {selectedUserCategoryLabel && <strong>{selectedUserCategoryLabel} </strong>}parties
                to map to <strong>{selectedUserRecord?.name}</strong>
              </p>
            </div>
            <button
              className="pa-btn-back"
              onClick={() => setShowParties(false)}
            >
              ← Back
            </button>
          </div>

          <div className="pa-panel-search">
            <input
              type="text"
              placeholder="Search party by name or code..." aria-label="Search party by name or code"
              className="pa-panel-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div
            key={`party-list-${partySearchTerm}-${visibleParties.length}`}
            className="pa-party-list"
          >
            {!isPartiesLoading && visibleParties.length > 0 && (
              <label className="pa-select-all">
                <input
                  type="checkbox"
                  className="pa-checkbox"
                  checked={
                    visibleParties.length > 0 &&
                    visiblePartyKeys.every((key) => selectedParties.includes(key))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      const newKeys = visiblePartyKeys.filter(
                        (key) => !selectedParties.includes(key),
                      );
                      setSelectedParties([...selectedParties, ...newKeys]);
                    } else {
                      setSelectedParties(
                        selectedParties.filter((key) => !visiblePartyKeys.includes(key)),
                      );
                    }
                  }}
                />
                <div className="pa-select-all-label">
                  Select All (
                  {visiblePartyKeys.filter((key) => selectedParties.includes(key)).length}/
                  {visibleParties.length})
                </div>
              </label>
            )}
            {isPartiesLoading ? (
              <div className="pa-party-list-status">
                Loading parties...
              </div>
            ) : visibleParties.length > 0 ? (
              visibleParties.map((party) => {
                const partyCode = getPartyCode(party);
                const partyName = getPartyName(party);
                const partyKey = getPartyCode(party);

                return (
                  <label
                    key={getPartyKey(party)}
                    className={`pa-party-row${selectedParties.includes(partyKey) ? " pa-party-row--selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="pa-checkbox"
                      checked={selectedParties.includes(partyKey)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedParties([...selectedParties, partyKey]);
                        } else {
                          setSelectedParties(selectedParties.filter((key) => key !== partyKey));
                        }
                      }}
                    />
                    <div>
                      <div className="pa-party-name">
                        {partyName || "Unnamed party"}
                      </div>
                      <div className="pa-party-meta">
                        {[partyCode, party.state, getPartyCategory(party)]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    </div>
                  </label>
                );
              })
            ) : (
              <div className="pa-party-list-status">
                No matching parties found
              </div>
            )}
          </div>

          <div className="pa-panel-actions">
            <button
              className="pa-btn-cancel"
              onClick={() => setShowParties(false)}
            >
              Cancel
            </button>
            <button
              className="pa-btn-save"
              onClick={handleSave}
            >
              Save Assignments ({[...new Set(selectedParties)].length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
