/**
 * The stock filter bar: search, party, category, type, warehouse and stock
 * status.
 *
 * This was FIVE hand-rolled dropdowns — five `…DropdownOpen` booleans and five
 * refs on the shared hook, closed by one `document.addEventListener("mousedown")`
 * that had to know about all of them. Four are now primitives that own their
 * own open state (DESIGN_SYSTEM §5a); the fifth, Party, was never really a
 * dropdown at all — see `PartyPickerDialog`.
 */
import { HiOutlineUsers } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  FilterBar,
  FilterMultiSelect,
  FilterSearch,
  FilterSelect,
} from "@/components/ui/filter-bar";
import { STOCK_OPTIONS, normalizeText } from "../productStockUtils";
import type { ProductStockState } from "../useProductStock";
import PartyPickerDialog from "./PartyPickerDialog";

export default function FilterToolbar({ ps }: { ps: ProductStockState }) {
  const {
    searchText,
    setSearchText,
    selectedProductCode,
    clearProductDemand,

    partyFilterLabel,
    selectedPartyCodes,
    setPartyPickerOpen,

    categoryFilter,
    setCategoryFilter,
    categories,

    typeFilter,
    setTypeFilter,
    types,

    warehouses,
    warehouseFilters,
    setWarehouseFilters,

    stockFilters,
    setStockFilters,
  } = ps;

  return (
    <>
      <FilterBar>
        <FilterSearch
          value={searchText}
          onChange={(event) => {
            setSearchText(event.target.value);
            if (selectedProductCode) clearProductDemand(false);
          }}
          placeholder="Product, warehouse code, variety or pack…"
          fieldClassName="min-w-[280px]"
        />

        {/*
         * Party is a button, not a picker. Choosing a party here does not set
         * a filter value — it opens that party's open sales orders so you can
         * say which of them count. A row that looks like a checkbox and opens
         * a modal instead is exactly the control that needs explaining, so it
         * says what it does.
         */}
        <Button onClick={() => setPartyPickerOpen(true)} className="self-end">
          <HiOutlineUsers aria-hidden="true" />
          {partyFilterLabel}
          {selectedPartyCodes.length > 0 && (
            <span className="rounded-full bg-brand-soft px-1.5 text-[11px] font-bold text-brand">
              {selectedPartyCodes.length}
            </span>
          )}
        </Button>

        <FilterSelect
          label="Category"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          fieldClassName="max-w-[180px]"
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category} value={normalizeText(category)}>
              {category}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Type"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          fieldClassName="max-w-[170px]"
        >
          <option value="all">All types</option>
          {types.map((type) => (
            <option key={type} value={normalizeText(type)}>
              {type}
            </option>
          ))}
        </FilterSelect>

        <FilterMultiSelect
          label="Warehouse"
          value={warehouseFilters}
          onChange={setWarehouseFilters}
          options={warehouses.map((code) => ({ value: code, label: code }))}
          searchable
          searchPlaceholder="Warehouse code…"
          placeholder="All warehouses"
          emptyText="No warehouses"
          fieldClassName="max-w-[200px]"
        />

        <FilterMultiSelect
          label="Stock"
          value={stockFilters}
          onChange={setStockFilters}
          options={STOCK_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          placeholder="All stock"
          fieldClassName="max-w-[190px]"
        />
      </FilterBar>

      <PartyPickerDialog ps={ps} />
    </>
  );
}
