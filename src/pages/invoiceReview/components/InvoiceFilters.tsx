import { useMemo } from "react";
import {
  HiOutlineBuildingStorefront,
  HiOutlineCalendarDays,
  HiOutlineFlag,
  HiOutlineMagnifyingGlass,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  FilterBar,
  FilterCount,
  FilterDate,
  FilterMultiSelect,
  FilterSearch,
} from "@/components/ui/filter-bar";

import { statusLabel } from "../helpers";
import {
  EMPTY_INVOICE_FILTERS,
  activeFilterCount,
  statusOptionsOf,
  tabSupportsStatusFilter,
  warehouseOptionsOf,
  type InvoiceFilters as Filters,
} from "../filters";
import type { FilterKey, InvoiceRecord, InvoiceStatus } from "../types";

/**
 * The search and filter row over the Invoice Review archive.
 *
 * Shown on "Posted to SAP" and "All" only — see `filters.ts` for why the five
 * work-queue tabs do not carry it.
 *
 * The pickers offer the values actually PRESENT in the loaded rows rather than
 * every warehouse and status the system knows about. Offering a warehouse that
 * yields nothing is a filter that looks broken when it is merely empty, and the
 * whole slice is already in memory, so the real answer is free.
 */
export default function InvoiceFilters({
  tab,
  records,
  filters,
  onChange,
  shownCount,
}: {
  tab: FilterKey;
  /** The tab's rows BEFORE filtering — what the pickers offer, and the total. */
  records: InvoiceRecord[];
  filters: Filters;
  onChange: (next: Filters) => void;
  /** How many survive, for "N of M". */
  shownCount: number;
}) {
  const warehouses = useMemo(() => warehouseOptionsOf(records), [records]);
  const statuses = useMemo(() => statusOptionsOf(records), [records]);
  const showStatus = tabSupportsStatusFilter(tab);
  const active = activeFilterCount(filters);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <FilterBar>
      <FilterSearch
        label="Search"
        icon={HiOutlineMagnifyingGlass}
        value={filters.search}
        onChange={(event) => set("search", event.target.value)}
        placeholder="SO number, party, SAP doc, who submitted…"
        fieldClassName="min-w-[260px]"
      />

      <FilterMultiSelect
        label="Warehouse"
        icon={HiOutlineBuildingStorefront}
        value={filters.warehouses}
        onChange={(next) => set("warehouses", next)}
        options={warehouses.map((code) => ({ value: code, label: code }))}
        placeholder="Any warehouse"
        searchable
        fieldClassName="min-w-[170px]"
      />

      {showStatus ? (
        <FilterMultiSelect
          label="Status"
          icon={HiOutlineFlag}
          value={filters.statuses}
          onChange={(next) => set("statuses", next as InvoiceStatus[])}
          options={statuses.map((status) => ({
            value: status,
            label: statusLabel(status),
          }))}
          placeholder="Any status"
          fieldClassName="min-w-[180px]"
        />
      ) : null}

      <FilterDate
        label="Submitted from"
        icon={HiOutlineCalendarDays}
        value={filters.from}
        onChange={(event) => set("from", event.target.value)}
        fieldClassName="min-w-[150px]"
      />
      <FilterDate
        label="Submitted to"
        icon={HiOutlineCalendarDays}
        value={filters.to}
        onChange={(event) => set("to", event.target.value)}
        fieldClassName="min-w-[150px]"
      />

      <FilterCount>
        {active > 0
          ? `${shownCount} of ${records.length}`
          : `${records.length} invoice${records.length === 1 ? "" : "s"}`}
      </FilterCount>

      {/* Only once something is set. A permanently visible Clear on an
          untouched bar reads as an action that does nothing. */}
      {active > 0 ? (
        <Button
          size="xs"
          variant="ghost"
          className="self-end"
          onClick={() => onChange(EMPTY_INVOICE_FILTERS)}
        >
          Clear filters
        </Button>
      ) : null}
    </FilterBar>
  );
}
