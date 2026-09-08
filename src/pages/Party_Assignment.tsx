/**
 * Party Assignment — which parties a manager, biller or distributor may see.
 *
 * Two views on one route: the user's current assignment, and the picker that
 * adds to it. The picker is a view rather than a dialog because choosing from
 * several thousand parties needs the whole width.
 */
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowUpTray,
  HiOutlinePlus,
  HiOutlineUsers,
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
import { SearchSelect, type SearchSelectOption } from "@/components/ui/dropdown";
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Field } from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  Page,
  PageHeader,
} from "@/components/ui/page";
import { SegmentedControl } from "@/components/ui/segmented";
import { showToast } from "@/lib/toastStore";
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

/**
 * What a bulk import did.
 *
 * This used to be an `alert()` built by joining six strings, which showed the
 * first FIVE errors and put the rest in `console.warn` — so an import of 400
 * rows that failed 90 of them reported "5 errors... 85 more errors..." and the
 * list of which rows to fix was only in devtools. It is a dialog with the
 * whole list now.
 */
type ImportReport = { added: number; existing: number; errors: string[] };

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
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  /** The party a removal has been asked about. It used to just happen. */
  const [confirmRemove, setConfirmRemove] = useState<SearchableParty | null>(null);
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
      showToast({
        title: "Could not load assignments",
        message: "The list below may be incomplete. Reselect the user to try again.",
      });
    }
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setSelectedParties([]);
    if (selectedUser) void fetchUserParties(Number(selectedUser), category);
  };

  const selectUser = (id: number | "") => {
    if (id === "") {
      setSelectedUser("");
      setSelectedParties([]);
      setSelectedCategory("");
      return;
    }
    const user = users.find((u) => u.id === id);
    const firstCategory = getUserCategories(user)[0] || "";
    setSelectedUser(id);
    setSelectedCategory(firstCategory);
    void fetchUserParties(id, firstCategory);
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
  const assignedCodes = useMemo(() => [...new Set(selectedParties)], [selectedParties]);

  /*
   * The user picker was a text box over an absolutely-positioned div that set
   * `showDropdown` true on focus and false only when a row was CHOSEN — so
   * clicking anywhere else left the list hanging over the page. `SearchSelect`
   * closes on Escape and on an outside pointer-down (DESIGN_SYSTEM §5a), and
   * it also searches the username and role, which the old one did not.
   */
  const userOptions = useMemo<SearchSelectOption<number>[]>(
    () =>
      users.map((user) => ({
        value: user.id,
        label: user.name || user.username,
        hint: user.role || "Unknown role",
      })),
    [users],
  );

  const persist = async (codes: string[]) => {
    await userService.assignPartiesToUser(
      Number(selectedUser),
      [...new Set(codes)],
      selectedUserCategoryLabel || undefined,
    );
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await persist(selectedParties);
      showToast({
        title: "Assignments saved",
        message:
          assignedCodes.length +
          " part" +
          (assignedCodes.length === 1 ? "y is" : "ies are") +
          " now assigned to " +
          (selectedUserRecord?.name || "this user") +
          (selectedUserCategoryLabel ? " in " + selectedUserCategoryLabel : "") +
          ".",
      });
      setShowParties(false);
      await fetchUserParties(Number(selectedUser), selectedUserCategoryLabel);
    } catch (error) {
      console.error("Error saving parties:", error);
      showToast({
        title: "Could not save",
        message: "The assignment was not changed. Check your connection and try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    const party = confirmRemove;
    if (!party || !selectedUser) return;
    const partyCode = getPartyCode(party);
    setConfirmRemove(null);
    try {
      await persist(selectedParties.filter((p) => p !== partyCode));
      showToast({
        title: "Party removed",
        message: (getPartyName(party) || partyCode) + " is no longer assigned.",
      });
      await fetchUserParties(Number(selectedUser), selectedUserCategoryLabel);
    } catch (error) {
      console.error(error);
      showToast({
        title: "Could not remove the party",
        message: "It is still assigned. Check your connection and try again.",
      });
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
        showToast({
          title: "Nothing to import",
          message:
            "No valid rows were found. Use the Users and Parties sheets from the template.",
        });
        return;
      }

      const response = await userService.bulkAssignPartiesToUsers(parsedRows);
      const data = response.data || {};
      const errors = Array.isArray(data.errors) ? (data.errors as string[]) : [];
      setImportReport({
        added: Number(data.added || 0),
        existing: Number(data.existing || 0),
        errors,
      });
      if (selectedUser) await fetchUserParties(Number(selectedUser));
    } catch (error) {
      console.error("Error importing party assignments:", error);
      // The import endpoint answers `{ data: { errors: [...] } }` — a LIST of
      // per-row failures, not one message, so it reads the body directly.
      const data = errorBody(error)?.data as { errors?: unknown } | undefined;
      const errors: string[] = Array.isArray(data?.errors) ? (data.errors as string[]) : [];
      setImportReport({
        added: 0,
        existing: 0,
        errors: errors.length ? errors : ["The file could not be imported."],
      });
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  const allVisibleChosen =
    visibleParties.length > 0 && visiblePartyKeys.every((key) => selectedParties.includes(key));

  /* ── The party picker ─────────────────────────────────────────────────── */
  if (showParties) {
    return (
      <Page>
        <Breadcrumbs
          items={[
            { label: "Administration" },
            { label: "Party Assignment", onClick: () => setShowParties(false) },
            { label: "Assign parties" },
          ]}
        />

        <PageHeader
          eyebrow={selectedUserCategoryLabel || undefined}
          title="Assign parties"
          description={
            "Choose the parties " +
            (selectedUserRecord?.name || "this user") +
            " may see. Everything ticked here is saved together."
          }
          badges={<Badge tone="info">{assignedCodes.length} selected</Badge>}
        />

        <FilterBar>
          <FilterSearch
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Party name, code or state…"
            fieldClassName="min-w-[300px]"
          />
          <FilterCount>
            {visibleParties.length} of {partyOptions.length} shown
          </FilterCount>
        </FilterBar>

        <Card className="p-0">
          {isPartiesLoading && parties.length === 0 ? (
            <EmptyState icon={HiOutlineUsers} title="Loading parties…" />
          ) : visibleParties.length === 0 ? (
            <EmptyState
              icon={HiOutlineUsers}
              title="No matching parties"
              hint={
                selectedUserCategoryLabel
                  ? "Only " + selectedUserCategoryLabel + " parties are listed for this user."
                  : "Try a shorter search."
              }
            />
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-2.5 border-b border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink">
                <input
                  type="checkbox"
                  className="size-3.5 accent-brand"
                  checked={allVisibleChosen}
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
                Select all {visibleParties.length} shown (
                {visiblePartyKeys.filter((key) => selectedParties.includes(key)).length} chosen)
              </label>
              <ul className="m-0 max-h-[520px] list-none divide-y divide-line overflow-y-auto p-0">
                {visibleParties.map((party) => {
                  const partyCode = getPartyCode(party);
                  const chosen = selectedParties.includes(partyCode);
                  return (
                    <li key={getPartyKey(party)}>
                      <label
                        className={
                          "flex cursor-pointer items-center gap-2.5 px-4 py-2 text-[13px] transition-colors " +
                          (chosen ? "bg-brand-soft" : "hover:bg-surface")
                        }
                      >
                        <input
                          type="checkbox"
                          className="size-3.5 shrink-0 accent-brand"
                          checked={chosen}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedParties([...selectedParties, partyCode]);
                            } else {
                              setSelectedParties(
                                selectedParties.filter((key) => key !== partyCode),
                              );
                            }
                          }}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold text-ink">
                            {getPartyName(party) || "Unnamed party"}
                          </span>
                          <span className="text-[11.5px] text-subtle">
                            {[partyCode, party.state, getPartyCategory(party)]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>

        <div className="flex justify-end gap-2">
          <Button onClick={() => setShowParties(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save " + assignedCodes.length + " assignments"}
          </Button>
        </div>
      </Page>
    );
  }

  /* ── The user's current assignment ────────────────────────────────────── */
  return (
    <Page>
      <Breadcrumbs items={[{ label: "Order Config" }, { label: "Party Assignment" }]} />

      <PageHeader
        eyebrow="Order Config"
        title="Party Assignment"
        description="Choose which parties a manager, biller or distributor can see."
        actions={
          <>
            <Button variant="ghost" onClick={downloadBulkTemplate}>
              <HiOutlineArrowDownTray aria-hidden="true" />
              Template
            </Button>
            <Button
              variant="ghost"
              disabled={isImporting}
              onClick={() => importInputRef.current?.click()}
            >
              <HiOutlineArrowUpTray aria-hidden="true" />
              {isImporting ? "Uploading…" : "Bulk import"}
            </Button>
          </>
        }
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        aria-label="Upload Excel file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleBulkImport(file);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Choose a user</CardTitle>
        </CardHeader>
        <Field
          label="User"
          hint="Managers, billers and distributors. Search by name or role."
        >
          {(control) => (
            <SearchSelect
              {...control}
              value={selectedUser}
              onChange={selectUser}
              options={userOptions}
              placeholder="Search for a user"
              searchPlaceholder="Name or role…"
              clearLabel="No user selected"
              emptyText="No users match"
              className="max-w-[420px]"
            />
          )}
        </Field>
      </Card>

      {!selectedUser ? (
        <Card>
          <EmptyState
            icon={HiOutlineUsers}
            title="No user selected"
            hint="Pick a user above to see and change the parties they are assigned."
          />
        </Card>
      ) : (
        <>
          {selectedUserCategories.length > 1 && (
            <Field
              label="Category"
              hint="This user works across several categories. Assignments are held separately for each."
            >
              {() => (
                <SegmentedControl
                  value={selectedUserCategoryLabel}
                  onChange={handleCategoryChange}
                  options={selectedUserCategories.map((cat) => ({ value: cat, label: cat }))}
                />
              )}
            </Field>
          )}

          <Card className="p-0">
            <CardHeader className="mb-0 border-b border-line px-4 py-3">
              <div>
                <CardTitle>Assigned parties</CardTitle>
                <p className="m-0 mt-0.5 text-[12px] text-subtle">
                  <strong className="font-semibold text-ink">{assignedCodes.length}</strong>{" "}
                  assigned to{" "}
                  <strong className="font-semibold text-ink">{selectedUserRecord?.name}</strong>
                  {selectedUserCategoryLabel && (
                    <>
                      {" "}
                      in{" "}
                      <strong className="font-semibold text-ink">
                        {selectedUserCategoryLabel}
                      </strong>
                    </>
                  )}
                </p>
              </div>
              <Button
                variant="primary"
                size="xs"
                onClick={() => {
                  setSearch("");
                  setShowParties(true);
                  if (parties.length === 0) void fetchParties();
                }}
              >
                <HiOutlinePlus aria-hidden="true" />
                Assign parties
              </Button>
            </CardHeader>

            {assignedCodes.length === 0 ? (
              <EmptyState
                icon={HiOutlineUsers}
                title="No parties assigned yet"
                hint="This user sees nothing until at least one party is assigned."
              />
            ) : (
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2 p-4">
                {assignedCodes.map((partyCode) => {
                  const party = partyOptions.find((p) => getPartyCode(p) === partyCode);
                  return (
                    <li
                      key={partyCode}
                      className="flex items-start justify-between gap-2 rounded-sm border border-line bg-surface px-3 py-2"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-semibold text-ink">
                          {party ? getPartyName(party) : partyCode}
                        </span>
                        <span className="text-[11.5px] text-subtle">
                          {party
                            ? [partyCode, party.state, getPartyCategory(party)]
                                .filter(Boolean)
                                .join(" · ")
                            : // A code the party list does not contain — the
                              // party was removed from SAP, or has not synced.
                              // The old card rendered nothing at all for this
                              // case, so the assignment was invisible and
                              // could not be removed.
                              partyCode + " · not in the synced party list"}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfirmRemove(party ?? ({ card_code: partyCode } as SearchableParty))
                        }
                        aria-label={"Remove " + (party ? getPartyName(party) : partyCode)}
                      >
                        <HiOutlineXMark />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* ── Remove one party ── */}
      <Dialog
        open={Boolean(confirmRemove)}
        onOpenChange={(next) => {
          if (!next) setConfirmRemove(null);
        }}
      >
        {confirmRemove && (
          <DialogContent title="Remove party" size="sm">
            <DialogHeader>
              <DialogTitle>
                Remove {getPartyName(confirmRemove) || getPartyCode(confirmRemove)}?
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Notice tone="hold">
                {selectedUserRecord?.name || "This user"} stops seeing this party&rsquo;s orders,
                invoices and reports immediately. Nothing about the party itself changes, and it
                can be assigned again.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmRemove(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => void handleRemove()}>
                Remove party
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── What the import did ── */}
      <Dialog
        open={Boolean(importReport)}
        onOpenChange={(next) => {
          if (!next) setImportReport(null);
        }}
      >
        {importReport && (
          <DialogContent title="Import result" size="md">
            <DialogHeader>
              <DialogTitle>
                {importReport.errors.length ? "Import finished with errors" : "Import complete"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="flex gap-4">
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ok">
                    {importReport.added}
                  </strong>
                  added
                </span>
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ink">
                    {importReport.existing}
                  </strong>
                  already assigned
                </span>
                <span className="text-[13px]">
                  <strong
                    className={
                      "block text-[20px] font-bold " +
                      (importReport.errors.length ? "text-bad" : "text-ink")
                    }
                  >
                    {importReport.errors.length}
                  </strong>
                  failed
                </span>
              </div>

              {importReport.errors.length > 0 && (
                <>
                  <Notice tone="bad">
                    These rows were not applied. Everything else was — the import does not roll
                    back.
                  </Notice>
                  {/* Every error, not the first five. */}
                  <ul className="m-0 max-h-64 list-none space-y-1 overflow-y-auto rounded-sm border border-line bg-surface p-2 text-[12px] text-body">
                    {importReport.errors.map((message, index) => (
                      <li key={index} className="border-b border-line/60 pb-1 last:border-0">
                        {message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => setImportReport(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
