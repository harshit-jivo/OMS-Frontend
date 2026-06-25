import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { userService } from "../services/userService";
import type { User } from "../services/userService";
import { sapService } from "../services/sapService";
import type { Party } from "../services/sapService";
import "../styles/Party_Assignment.css";

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
  const list = (user as { categories?: Array<{ category?: string } | string> } | undefined)?.categories;
  const names = Array.isArray(list)
    ? list
        .map((c) => asText(typeof c === "string" ? c : c?.category))
        .filter(Boolean)
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

const getPartyList = (data: unknown): Party[] => {
  if (Array.isArray(data)) return data as Party[];
  if (data && typeof data === "object") {
    const response = data as { data?: unknown; results?: unknown };
    if (Array.isArray(response.data)) return response.data as Party[];
    if (Array.isArray(response.results)) return response.results as Party[];
  }
  return [];
};

const getImportValue = (row: Record<string, unknown>, keys: string[]) => {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [
    normalizeSearch(key),
    value,
  ] as const);
  for (const key of keys) {
    const normalizedKey = normalizeSearch(key);
    const match = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
    if (match) return match[1];
  }
  return "";
};

const getWorksheetRows = (workbook: XLSX.WorkBook, sheetNames: string[]) => {
  const normalizedNames = sheetNames.map(normalizeSearch);
  const sheetName = workbook.SheetNames.find((name) => normalizedNames.includes(normalizeSearch(name)));
  if (!sheetName) return [];

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
};

const splitImportList = (value: unknown) =>
  asText(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export default function Party_Assignment() {
  const [users, setUsers] = useState<User[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [isPartiesLoading, setIsPartiesLoading] = useState(false);
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

  useEffect(() => {
    fetchUsers();
    fetchParties();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await userService.getUsers();
      const data2 = data.data.filter(
        (u: any) =>
          u.role_id === 2 ||
          u.role_id === 4 ||
          Number(u.role) === 2 ||
          Number(u.role) === 4 ||
          u.role?.toLowerCase() === "manager" ||
          u.role?.toLowerCase() === "billing",
      );
      setUsers(data2);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchParties = async () => {
    setIsPartiesLoading(true);
    try {
      const data = await sapService.getParties();
      setParties(mergeParties(getPartyList(data)));
    } catch (error) {
      console.error("Error fetching parties:", error);
      setParties([]);
    } finally {
      setIsPartiesLoading(false);
    }
  };

  const fetchUserParties = async (userId: number, category?: string) => {
    try {
      const userRecord = users.find((user) => user.id === userId);
      // Scope to the chosen category; default to the user's first category.
      const userCategory = category ?? (getUserCategories(userRecord)[0] || "");
      const res = await userService.getUserParties(userId, userCategory || undefined);

      const assigned = (res.data?.parties || [])
        .filter((p: any) => isPartyInUserCategory(p, userCategory))
        .map((p: any) => asText(p.card_code));

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
  const partyOptions = parties.filter((party) => isPartyInUserCategory(party, selectedUserCategoryLabel));
  const partySearchTerm = normalizeSearch(search);
  const visibleParties = partyOptions.filter((party) => {
    if (!partySearchTerm) return true;

    const searchableText = [
      getPartyName(party),
      getPartyCode(party),
      party.state,
      party.main_group,
      getPartyCategory(party),
    ].map(normalizeSearch).join(" ");

    return partySearchTerm
      .split(" ")
      .every((term) => searchableText.includes(term));
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

const handleDel =  async (partyCode: string) => {
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
  const userRows = [
    { Username: "manager.username" },
    { Username: "billing.username" },
  ];
  const partyRows = [
    { "Party Code": "CUST000001" },
    { "Party Code": "CUST000002" },
    { "Party Code": "CUST000003" },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(userRows), "Users");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(partyRows), "Parties");
  XLSX.writeFile(workbook, "party-user-assignment-template.xlsx");
};

const handleBulkImport = async (file: File) => {
  setIsImporting(true);
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const userRows = getWorksheetRows(workbook, ["Users", "User"]);
    const partyRows = getWorksheetRows(workbook, ["Parties", "Party", "Party Codes", "Party Mapping"]);

    let parsedRows: { user_name: string; name: string; username: string; card_code: string }[] = [];

    if (userRows.length && partyRows.length) {
      const userIdentifiers = Array.from(new Set(
        userRows
          .map((row) =>
            asText(getImportValue(row, ["Username", "username", "User", "User Name", "User ID", "User Id", "user_id", "Name", "name"])),
          )
          .filter(Boolean),
      ));
      const partyCodes = Array.from(new Set(
        partyRows
          .map((row) =>
            asText(getImportValue(row, ["Party Code", "Party Codes", "Card Code", "Card Codes", "card_code", "CardCode", "party_code"])),
          )
          .filter(Boolean),
      ));

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
            ...splitImportList(getImportValue(row, ["Users", "User", "User Name", "Name", "user_name", "name"])),
            ...splitImportList(getImportValue(row, ["Usernames", "Username", "User ID", "User Id", "user_id", "username"])),
          ];
          const uniqueUsers = Array.from(new Set(userIdentifiers));
          const partyCodes = splitImportList(
            getImportValue(row, ["Party Codes", "Party Code", "Card Codes", "Card Code", "card_code", "CardCode", "party_code"])
          );

          return uniqueUsers.flatMap((userIdentifier) =>
            partyCodes.map((cardCode) => ({
              user_name: userIdentifier,
              name: userIdentifier,
              username: userIdentifier,
              card_code: cardCode,
            }))
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
      ].filter(Boolean).join("\n"),
    );
    if (errors.length) {
      console.warn("Party assignment import errors:", errors);
    }
    if (selectedUser) {
      fetchUserParties(Number(selectedUser));
    }
  } catch (error: any) {
    console.error("Error importing party assignments:", error);
    const data = error?.response?.data?.data;
    const errors = Array.isArray(data?.errors) ? data.errors : [];
    alert(errors.length ? `Import completed with errors: ${errors.slice(0, 3).join("; ")}` : "Failed to import Excel file.");
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
        <div 
          className="pa-card" 
          style={{ 
            background: '#fff', 
            borderRadius: '12px', 
            padding: '24px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
            marginBottom: '24px' 
          }}
        >
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Party Assignment</h1>
            {/* <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Search and select a user to manage their assigned parties.</p> */}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
              padding: '16px',
              marginBottom: '24px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
            }}
          >
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Excel Upload
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Add usernames in the Users sheet and one party code per row in the Parties sheet; every listed party is assigned to every listed user.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={downloadBulkTemplate}
                style={{
                  padding: '9px 14px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#334155',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Download Template
              </button>
              <button
                type="button"
                disabled={isImporting}
                onClick={() => importInputRef.current?.click()}
                style={{
                  padding: '9px 14px',
                  border: 'none',
                  background: '#16a34a',
                  color: '#fff',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: isImporting ? 'not-allowed' : 'pointer',
                  opacity: isImporting ? 0.75 : 1,
                }}
              >
                {isImporting ? 'Uploading...' : 'Upload Excel'}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    handleBulkImport(file);
                  }
                }}
              />
            </div>
          </div>

          <div style={{ position: 'relative', maxWidth: '400px', zIndex: 10 }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '8px' }}>
              User Search
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Type name to search..."
                style={{ 
                  width: '100%', 
                  height: 'var(--input-h, 40px)',
                  padding: '0 12px',
                  background: 'rgba(248, 250, 252, 0.9)',
                  border: '1px solid #cbd5e1', 
                  borderRadius: 'var(--radius-sm, 8px)', 
                  fontSize: 'var(--font-ui, 13px)', 
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
              />
            </div>

            {showDropdown && (
              <div style={{ 
                position: 'absolute', 
                top: '100%', 
                left: 0, 
                right: 0, 
                marginTop: '4px', 
                background: '#fff', 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px', 
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
                maxHeight: '250px', 
                overflowY: 'auto' 
              }}>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      onClick={() => {
                        const firstCategory = getUserCategories(user)[0] || "";
                        setSelectedUser(user.id);
                        setUserSearch(user.name);
                        setShowDropdown(false);
                        setSelectedCategory(firstCategory);
                        fetchUserParties(user.id, firstCategory);
                      }}
                    >
                      <div style={{ fontWeight: 500, color: '#0f172a' }}>{user.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{user.role || 'Unknown Role'}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '10px 14px', color: '#64748b' }}>No users found</div>
                )}
              </div>
            )}
          </div>

          {selectedUser && (
            <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>Assigned Parties</h3>
                  <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '4px 0 0' }}>
                    <strong>{[...new Set(selectedParties)].length}</strong> parties assigned to <strong>{selectedUserRecord?.name}</strong>
                    {selectedUserCategoryLabel && <> in <strong>{selectedUserCategoryLabel}</strong></>}
                  </p>
                </div>
                <button
                  style={{ 
                    background: '#2563eb', 
                    color: '#fff', 
                    padding: '8px 16px', 
                    borderRadius: '8px', 
                    border: 'none', 
                    fontWeight: 500, 
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)'
                  }}
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', alignSelf: 'center', marginRight: '4px' }}>Category:</span>
                  {selectedUserCategories.map((cat) => {
                    const active = selectedUserCategoryLabel === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategoryChange(cat)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '999px',
                          border: active ? '1px solid #2563eb' : '1px solid #cbd5e1',
                          background: active ? '#eff6ff' : '#fff',
                          color: active ? '#1d4ed8' : '#475569',
                          fontWeight: active ? 700 : 500,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {(selectedParties || []).length > 0 ? (
                  [...new Set(selectedParties)].map((partyCode) => {
                    const party = partyOptions.find((p) => getPartyCode(p) === partyCode);
                    return party ? (
                      <div key={getPartyKey(party)} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'flex-start', 
                        background: '#f8fafc', 
                        padding: '14px 16px', 
                        borderRadius: '8px', 
                        border: '1px solid #e2e8f0' 
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{getPartyName(party)}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', fontFamily: 'monospace' }}>
                            {[getPartyCode(party), party.state, getPartyCategory(party)].filter(Boolean).join(" • ")}
                          </div>
                        </div>
                        <button
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: '#ef4444', 
                            fontSize: '1.25rem', 
                            cursor: 'pointer', 
                            padding: '0 4px', 
                            lineHeight: 1,
                            opacity: 0.7 
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                          onClick={() => handleDel(getPartyCode(party))}
                          title="Remove Party"
                        >
                          ×
                        </button>
                      </div>
                    ) : null;
                  })
                ) : (
                  <div style={{ gridColumn: '1 / -1', padding: '40px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', color: '#64748b', border: '1px dashed #cbd5e1' }}>
                    No parties assigned to this user yet. Click "Assign New Parties" to get started.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showParties && (
        <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Assign Parties</h2>
              <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '4px 0 0' }}>
                Select multiple {selectedUserCategoryLabel && <strong>{selectedUserCategoryLabel} </strong>}parties to map to <strong>{selectedUserRecord?.name}</strong>
              </p>
            </div>
            <button
              style={{ 
                background: '#fff', 
                border: '1px solid #cbd5e1', 
                padding: '8px 16px', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 500,
                color: '#334155'
              }}
              onClick={() => setShowParties(false)}
            >
              ← Back
            </button>
          </div>

          <div style={{ marginBottom: '16px', maxWidth: '500px' }}>
            <input
              type="text"
              placeholder="Search party by name or code..."
              style={{ 
                width: '100%', 
                padding: '10px 14px', 
                border: '1px solid #cbd5e1', 
                borderRadius: '8px', 
                fontSize: '0.95rem', 
                outline: 'none',
                boxSizing: 'border-box'
              }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div
            key={`party-list-${partySearchTerm}-${visibleParties.length}`}
            style={{ 
            maxHeight: '400px', 
            overflowY: 'auto', 
            border: '1px solid #e2e8f0', 
            borderRadius: '8px', 
            background: '#f8fafc' 
          }}
          >
            {!isPartiesLoading && visibleParties.length > 0 && (
              <label 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '14px 16px', 
                  borderBottom: '2px solid #cbd5e1', 
                  cursor: 'pointer', 
                  background: '#f1f5f9', 
                  margin: 0,
                  position: 'sticky',
                  top: 0,
                  zIndex: 10
                }}
              >
                <input
                  type="checkbox"
                  style={{ marginRight: '16px', width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563eb' }}
                  checked={visibleParties.length > 0 && visiblePartyKeys.every((key) => selectedParties.includes(key))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const newKeys = visiblePartyKeys.filter(key => !selectedParties.includes(key));
                      setSelectedParties([...selectedParties, ...newKeys]);
                    } else {
                      setSelectedParties(selectedParties.filter(key => !visiblePartyKeys.includes(key)));
                    }
                  }}
                />
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>
              Select All ({visiblePartyKeys.filter((key) => selectedParties.includes(key)).length}/{visibleParties.length})
            </div>
              </label>
            )}
            {isPartiesLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>Loading parties...</div>
            ) : visibleParties.length > 0 ? (
              visibleParties.map((party) => {
                const partyCode = getPartyCode(party);
                const partyName = getPartyName(party);
                const partyKey = getPartyCode(party);

                return (
                <label 
                  key={getPartyKey(party)} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '14px 16px', 
                    borderBottom: '1px solid #e2e8f0', 
                    cursor: 'pointer', 
                    background: selectedParties.includes(partyKey) ? '#eff6ff' : '#fff', 
                    transition: 'background 0.2s',
                    margin: 0
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ marginRight: '16px', width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563eb' }}
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
                    <div style={{ fontWeight: 500, color: '#0f172a', fontSize: '0.95rem' }}>
                      {partyName || "Unnamed party"}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', fontFamily: 'monospace' }}>
                      {[partyCode, party.state, getPartyCategory(party)].filter(Boolean).join(" • ")}
                    </div>
                  </div>
                </label>
              );
            })
            ) : (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>No matching parties found</div>
            )}
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
            <button
              style={{ 
                background: '#fff', 
                border: '1px solid #cbd5e1', 
                padding: '10px 20px', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 500, 
                color: '#475569' 
              }}
              onClick={() => setShowParties(false)}
            >
              Cancel
            </button>
            <button
              style={{ 
                background: '#2563eb', 
                color: '#fff', 
                padding: '10px 20px', 
                borderRadius: '8px', 
                border: 'none', 
                fontWeight: 500, 
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)'
              }}
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
