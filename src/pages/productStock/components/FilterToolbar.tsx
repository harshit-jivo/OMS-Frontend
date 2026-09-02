/**
 * The `.ps-toolbar` search box plus the five filter dropdowns — party,
 * category, type, warehouse and stock status. Each dropdown owns its own
 * open/close state and outside-click ref, all of which live on the shared
 * `useProductStock` hook so this stays presentational.
 */
import { HiMagnifyingGlass } from "react-icons/hi2";

import { STOCK_OPTIONS, getPartyCode, getPartyName, normalizeText } from "../productStockUtils";
import type { ProductStockState } from "../useProductStock";

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="#64748b"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function FilterToolbar({ ps }: { ps: ProductStockState }) {
  const {
    searchText,
    setSearchText,
    selectedProductCode,
    clearProductDemand,

    partyDropdownOpen,
    setPartyDropdownOpen,
    partyDropdownRef,
    partyFilterLabel,
    partySearch,
    setPartySearch,
    openParties,
    filteredOpenParties,
    selectedPartyCodes,
    setSelectedPartyCodes,
    setSelectedSalesOrders,
    handlePartyClick,

    categoryDropdownOpen,
    setCategoryDropdownOpen,
    categoryDropdownRef,
    categoryFilterLabel,
    categoryFilter,
    setCategoryFilter,
    categories,

    typeDropdownOpen,
    setTypeDropdownOpen,
    typeDropdownRef,
    typeFilterLabel,
    typeFilter,
    setTypeFilter,
    types,

    warehouseDropdownOpen,
    setWarehouseDropdownOpen,
    warehouseDropdownRef,
    warehouseFilterLabel,
    warehouseSearch,
    setWarehouseSearch,
    warehouses,
    filteredWarehouses,
    warehouseFilters,
    setWarehouseFilters,
    toggleWarehouseFilter,

    stockDropdownOpen,
    setStockDropdownOpen,
    stockDropdownRef,
    stockFilterLabel,
    stockFilters,
    setStockFilters,
    toggleStockFilter,
  } = ps;

  return (
    <section className="ps-toolbar">
      <label className="ps-search">
        <HiMagnifyingGlass />
        <input
          type="text"
          value={searchText}
          onChange={(event) => {
            setSearchText(event.target.value);
            if (selectedProductCode) clearProductDemand(false);
          }}
          placeholder="Search by product, warehouse code, variety or pack"
        />
      </label>

      <div
        className={`ps-warehouse-dropdown${partyDropdownOpen ? " open" : ""}`}
        ref={partyDropdownRef}
      >
        <button
          type="button"
          className="ps-warehouse-trigger"
          onClick={() => {
            setPartyDropdownOpen((open) => !open);
            setPartySearch("");
          }}
        >
          <span>{partyFilterLabel}</span>
          <ChevronIcon />
        </button>

        {partyDropdownOpen && (
          <div className="ps-warehouse-menu ps-party-menu">
            <div className="ps-warehouse-search-wrap">
              <HiMagnifyingGlass />
              <input
                type="text"
                className="ps-warehouse-search-input"
                placeholder="Search party..."
                value={partySearch}
                onChange={(event) => setPartySearch(event.target.value)}
                autoFocus
              />
            </div>
            <div className="ps-warehouse-options">
              {openParties.length > 0 && (
                <div className="ps-party-bulk-actions">
                  <button
                    type="button"
                    className="ps-party-bulk-btn"
                    onClick={() => {
                      setSelectedPartyCodes(
                        openParties.map((party) => getPartyCode(party)).filter(Boolean),
                      );
                      setSelectedSalesOrders({});
                    }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="ps-party-bulk-btn"
                    onClick={() => {
                      setSelectedPartyCodes([]);
                      setSelectedSalesOrders({});
                      setPartySearch("");
                    }}
                  >
                    Deselect All
                  </button>
                </div>
              )}
              {filteredOpenParties.length > 0 ? (
                [...filteredOpenParties]
                  .sort((a, b) => {
                    const aCode = getPartyCode(a);
                    const bCode = getPartyCode(b);
                    const aSel = selectedPartyCodes.includes(aCode) ? 0 : 1;
                    const bSel = selectedPartyCodes.includes(bCode) ? 0 : 1;
                    if (aSel !== bSel) return aSel - bSel;
                    const aName = (getPartyName(a) || aCode).toLowerCase();
                    const bName = (getPartyName(b) || bCode).toLowerCase();
                    return aName.localeCompare(bName);
                  })
                  .map((party) => {
                    const partyCode = getPartyCode(party);
                    const partyName = getPartyName(party);

                    return (
                      <button
                        type="button"
                        key={partyCode}
                        aria-pressed={selectedPartyCodes.includes(partyCode)}
                        className={`ps-party-option ps-warehouse-option${
                          selectedPartyCodes.includes(partyCode) ? " is-selected" : ""
                        }`}
                        onClick={() => handlePartyClick(party)}
                      >
                        <span className="ps-party-option-row">
                          <span
                            className={`ps-party-check${
                              selectedPartyCodes.includes(partyCode) ? " is-selected" : ""
                            }`}
                          />
                          <span className="ps-party-option-text">
                            <span className="ps-party-option-main">{partyName || partyCode}</span>
                            <span className="ps-party-option-meta">
                              {partyCode}
                              {party.open_sales_order_count !== undefined
                                ? ` | ${party.open_sales_order_count} open`
                                : ""}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })
              ) : (
                <div className="ps-warehouse-empty">No party found</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className={`ps-warehouse-dropdown${categoryDropdownOpen ? " open" : ""}`}
        ref={categoryDropdownRef}
      >
        <button
          type="button"
          className="ps-warehouse-trigger"
          onClick={() => setCategoryDropdownOpen((open) => !open)}
        >
          <span>{categoryFilterLabel}</span>
          <ChevronIcon />
        </button>

        {categoryDropdownOpen && (
          <div className="ps-warehouse-menu">
            <div className="ps-warehouse-options">
              <button
                type="button"
                className={`ps-warehouse-option${categoryFilter === "all" ? " is-selected" : ""}`}
                onClick={() => {
                  setCategoryFilter("all");
                  setCategoryDropdownOpen(false);
                }}
              >
                All Categories
              </button>
              {categories.length > 0 ? (
                categories.map((category) => (
                  <button
                    type="button"
                    key={category}
                    className={`ps-warehouse-option${
                      normalizeText(category) === categoryFilter ? " is-selected" : ""
                    }`}
                    onClick={() => {
                      setCategoryFilter(normalizeText(category));
                      setCategoryDropdownOpen(false);
                    }}
                  >
                    {category}
                  </button>
                ))
              ) : (
                <div className="ps-warehouse-empty">No category found</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className={`ps-warehouse-dropdown${typeDropdownOpen ? " open" : ""}`}
        ref={typeDropdownRef}
      >
        <button
          type="button"
          className="ps-warehouse-trigger"
          onClick={() => setTypeDropdownOpen((open) => !open)}
        >
          <span>{typeFilterLabel}</span>
          <ChevronIcon />
        </button>

        {typeDropdownOpen && (
          <div className="ps-warehouse-menu">
            <div className="ps-warehouse-options">
              <button
                type="button"
                className={`ps-warehouse-option${typeFilter === "all" ? " is-selected" : ""}`}
                onClick={() => {
                  setTypeFilter("all");
                  setTypeDropdownOpen(false);
                }}
              >
                All Types
              </button>
              {types.length > 0 ? (
                types.map((type) => (
                  <button
                    type="button"
                    key={type}
                    className={`ps-warehouse-option${
                      normalizeText(type) === typeFilter ? " is-selected" : ""
                    }`}
                    onClick={() => {
                      setTypeFilter(normalizeText(type));
                      setTypeDropdownOpen(false);
                    }}
                  >
                    {type}
                  </button>
                ))
              ) : (
                <div className="ps-warehouse-empty">No type found</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className={`ps-warehouse-dropdown${warehouseDropdownOpen ? " open" : ""}`}
        ref={warehouseDropdownRef}
      >
        <button
          type="button"
          className="ps-warehouse-trigger"
          onClick={() => {
            setWarehouseDropdownOpen((open) => !open);
            setWarehouseSearch("");
          }}
        >
          <span>{warehouseFilterLabel}</span>
          <ChevronIcon />
        </button>

        {warehouseDropdownOpen && (
          <div className="ps-warehouse-menu">
            <div className="ps-warehouse-search-wrap">
              <HiMagnifyingGlass />
              <input
                type="text"
                className="ps-warehouse-search-input"
                placeholder="Search warehouse code..."
                value={warehouseSearch}
                onChange={(event) => setWarehouseSearch(event.target.value)}
                autoFocus
              />
            </div>
            <div className="ps-warehouse-options">
              {warehouses.length > 0 && (
                <div className="ps-party-bulk-actions">
                  <button
                    type="button"
                    className="ps-party-bulk-btn"
                    onClick={() => {
                      setWarehouseFilters(warehouses);
                      setWarehouseSearch("");
                    }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="ps-party-bulk-btn"
                    onClick={() => {
                      setWarehouseFilters([]);
                      setWarehouseSearch("");
                    }}
                  >
                    Deselect All
                  </button>
                </div>
              )}
              {filteredWarehouses.length > 0 ? (
                filteredWarehouses.map((warehouseCode) => (
                  <button
                    type="button"
                    key={warehouseCode}
                    aria-pressed={warehouseFilters.includes(warehouseCode)}
                    className={`ps-party-option ps-warehouse-option${
                      warehouseFilters.includes(warehouseCode) ? " is-selected" : ""
                    }`}
                    onClick={() => {
                      toggleWarehouseFilter(warehouseCode);
                    }}
                  >
                    <span className="ps-party-option-row">
                      <span
                        className={`ps-party-check${
                          warehouseFilters.includes(warehouseCode) ? " is-selected" : ""
                        }`}
                      />
                      <span className="ps-party-option-main">{warehouseCode}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="ps-warehouse-empty">No warehouse found</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className={`ps-warehouse-dropdown${stockDropdownOpen ? " open" : ""}`}
        ref={stockDropdownRef}
      >
        <button
          type="button"
          className="ps-warehouse-trigger"
          onClick={() => setStockDropdownOpen((open) => !open)}
        >
          <span>{stockFilterLabel}</span>
          <ChevronIcon />
        </button>

        {stockDropdownOpen && (
          <div className="ps-warehouse-menu">
            <div className="ps-warehouse-options">
              <div className="ps-party-bulk-actions">
                <button
                  type="button"
                  className="ps-party-bulk-btn"
                  onClick={() => setStockFilters(STOCK_OPTIONS.map((option) => option.value))}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="ps-party-bulk-btn"
                  onClick={() => setStockFilters([])}
                >
                  Deselect All
                </button>
              </div>
              {STOCK_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  aria-pressed={stockFilters.includes(option.value)}
                  className={`ps-party-option ps-warehouse-option${
                    stockFilters.includes(option.value) ? " is-selected" : ""
                  }`}
                  onClick={() => toggleStockFilter(option.value)}
                >
                  <span className="ps-party-option-row">
                    <span
                      className={`ps-party-check${
                        stockFilters.includes(option.value) ? " is-selected" : ""
                      }`}
                    />
                    <span className="ps-party-option-main">{option.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
