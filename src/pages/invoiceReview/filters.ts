/**
 * Narrowing the Invoice Review list — the rules, with no React in them.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY ONLY TWO TABS CARRY THESE
 * ─────────────────────────────────────────────────────────────────────────
 * Five of the seven tabs are work queues: Pending, Approved, Rejected,
 * Edited, Error, CL Raised. You open one to clear it, it is short by
 * definition, and a filter bar over eleven rows is furniture.
 *
 * "Posted to SAP" and "All" are the opposite — they are the archive, they
 * only ever grow, and nobody opens them to clear them. They are opened to
 * ANSWER something: did this party's invoice go through, what did we post on
 * Tuesday, which of these failed out of Bhiwandi. Those are searches, and
 * without them the only way through is the scrollbar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE FILTERING IS CLIENT-SIDE
 * ─────────────────────────────────────────────────────────────────────────
 * The tab itself is already a server query (`?status=`), and the whole slice
 * is in memory — the table virtualizes it precisely because it can be long.
 * Narrowing what is already here answers on the keystroke, with no request
 * and no spinner; pushing it to the server would add query parameters, a
 * debounce and a loading state to make the same list shorter.
 *
 * The honest limit: this narrows what the tab loaded, not the database. That
 * is the same set the reviewer can already scroll, so the bar never implies a
 * reach it does not have.
 */
import { haystackOf, matchesTokens, searchTokens } from "@/lib/optionSearch";

import { normalizeStatus, trimmed } from "./helpers";
import type { FilterKey, InvoiceRecord, InvoiceStatus } from "./types";

export type InvoiceFilters = {
  /** One box across SO number, party, SAP doc number and who submitted it. */
  search: string;
  warehouses: string[];
  /** Only meaningful on "All" — every row on "Posted to SAP" shares a status. */
  statuses: InvoiceStatus[];
  /** `yyyy-mm-dd`, inclusive at both ends, against the submitted date. */
  from: string;
  to: string;
};

export const EMPTY_INVOICE_FILTERS: InvoiceFilters = {
  search: "",
  warehouses: [],
  statuses: [],
  from: "",
  to: "",
};

/** The tabs that are an archive to be searched rather than a queue to be cleared. */
export const tabSupportsFilters = (tab: FilterKey): boolean =>
  tab === "ALL" || tab === "POSTED_TO_SAP";

/** The status picker is pointless where the tab has already fixed the status. */
export const tabSupportsStatusFilter = (tab: FilterKey): boolean => tab === "ALL";

/**
 * Everything the omni-search looks in for one row.
 *
 * Deliberately NOT the amount: "1200" would match a total, a date and half
 * the SO numbers, and a search that matches too much is the same as one that
 * matches nothing. Amount is a column you read, not one you search.
 */
export const invoiceSearchFields = (record: InvoiceRecord): string[] => [
  trimmed(record.so_number),
  trimmed(record.party_name),
  trimmed(record.sap_doc_num),
  trimmed(record.created_by_name),
  trimmed(record.warehouse),
];

/** The `yyyy-mm-dd` day a record was submitted, or "" when it has no date. */
const submittedDay = (record: InvoiceRecord): string => {
  const raw = trimmed(record.created_at);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  // Local parts, not `toISOString()`: that converts to UTC first, so an
  // invoice submitted at 01:00 IST would be filed under the previous day and
  // fall outside a range the reviewer drew around the day they saw.
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/** The warehouses actually present, for the picker. Sorted, no blanks. */
export const warehouseOptionsOf = (records: InvoiceRecord[]): string[] =>
  [...new Set(records.map((record) => trimmed(record.warehouse)).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );

/** The statuses actually present, for the picker on the All tab. */
export const statusOptionsOf = (records: InvoiceRecord[]): InvoiceStatus[] =>
  [...new Set(records.map((record) => normalizeStatus(record.status)))].sort((a, b) =>
    a.localeCompare(b),
  );

/** How many filters are doing something — drives the count and the Clear button. */
export const activeFilterCount = (filters: InvoiceFilters): number =>
  (filters.search.trim() ? 1 : 0) +
  (filters.warehouses.length > 0 ? 1 : 0) +
  (filters.statuses.length > 0 ? 1 : 0) +
  (filters.from ? 1 : 0) +
  (filters.to ? 1 : 0);

/**
 * The rows that survive every filter, in the order they came in.
 *
 * Order is preserved rather than ranked by relevance: the list is newest-first
 * and a reviewer scanning for "the one from this morning" relies on that. A
 * search that reshuffled the table would answer a question nobody asked.
 */
export const applyInvoiceFilters = (
  records: InvoiceRecord[],
  filters: InvoiceFilters,
): InvoiceRecord[] => {
  const tokens = searchTokens(filters.search);
  const warehouses = new Set(filters.warehouses);
  const statuses = new Set(filters.statuses);

  if (
    tokens.length === 0 &&
    warehouses.size === 0 &&
    statuses.size === 0 &&
    !filters.from &&
    !filters.to
  ) {
    // Same array, so a `useMemo` consumer does not re-render for nothing.
    return records;
  }

  return records.filter((record) => {
    if (!matchesTokens(haystackOf(invoiceSearchFields(record)), tokens)) return false;
    if (warehouses.size > 0 && !warehouses.has(trimmed(record.warehouse))) return false;
    if (statuses.size > 0 && !statuses.has(normalizeStatus(record.status))) return false;

    if (filters.from || filters.to) {
      const day = submittedDay(record);
      // A row with no usable date cannot be shown to be inside the range, and
      // showing it anyway would make the range a suggestion rather than a filter.
      if (!day) return false;
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
    }

    return true;
  });
};
