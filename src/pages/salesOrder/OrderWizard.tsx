/**
 * The 4-step order wizard — the form a salesperson creating a NEW order sees.
 *
 * Split out of `Add_Sales.tsx` alongside `LegacyOrderForm`, which the same page
 * renders instead of this for edit / duplicate / FOC. The two never coexist in
 * the DOM and share exactly one piece of markup (`WarehouseField`), so keeping
 * them in one 4,282-line file bought nothing and cost the ability to change
 * either one alone.
 *
 * It draws from `useSalesOrderForm`; it holds no order state of its own. What
 * IS local to it is the item modal — its facet rail, its search and its
 * open/confirm/cancel handlers — because nothing outside the wizard has an item
 * modal.
 *
 * Note for the react-hook-form migration (plan 3.4 step 6): this renders
 * OUTSIDE any `<form>` element, which is why the `required` attributes below
 * are inert. Wrapping it in a form turns them all live at once. The legacy
 * branch is where they already are live, and `interactions.visual.spec.ts`
 * asserts that difference.
 */
import { Fragment } from "react";

import type { PartyProduct } from "@/services/ordersService";

import FieldError from "./FieldError";
import ProblemSummary from "./ProblemSummary";
import WarehouseField from "./WarehouseField";
import { stepOneComplete, stepThreeComplete } from "./orderHeaderSchema";
import { computeLandingPrice } from "./rowTotals";
import { PICKER_FACETS, type PickerFacet, type SalesOrderForm } from "./useSalesOrderForm";
import { createEmptyRow, type SalesRow } from "../salesOrderRow";

export default function OrderWizard({ form }: { form: SalesOrderForm }) {
  const {
    userDefaultCategory,
    selectedPartyCategory,
    partySearch,
    setPartySearch,
    partyDropdownOpen,
    setPartyDropdownOpen,
    dispatchDropdownOpen,
    setDispatchDropdownOpen,
    billSearch,
    setBillSearch,
    billDropdownOpen,
    setBillDropdownOpen,
    shipSearch,
    setShipSearch,
    shipDropdownOpen,
    setShipDropdownOpen,
    companyDropdownOpen,
    setCompanyDropdownOpen,
    setOpenRowDropdown,
    branch,
    company,
    partyProducts,
    schemeOptions,
    setRowSchemeOptions,
    setShowSaveConfirm,
    isSaving,
    isSavingDraft,
    partyDropdownRef,
    dispatchDropdownRef,
    dispatchInfoRef,
    billDropdownRef,
    shipDropdownRef,
    companyDropdownRef,
    formData,
    setFormData,
    rows,
    updateRow,
    appendRow,
    currentStep,
    setCurrentStep,
    dispatchInfoOpen,
    setDispatchInfoOpen,
    itemModalIndex,
    setItemModalIndex,
    itemModalSnapshot,
    setItemModalSnapshot,
    itemModalIsNew,
    setItemModalIsNew,
    isPickingItem,
    setIsPickingItem,
    itemSearch,
    setItemSearch,
    isFocOrder,
    poField,
    canEditPoNumber,
    getProductType,
    fetchSchemesForRow,
    validateBeforeSave,
    handleSaveDraft,
    handleClearForm,
    handleRowSchemeToggle,
    handleAddScheme,
    handleSchemeChange,
    handleRemoveScheme,
    getDerivedLines,
    getProductTaxRate,
    applyFocPricing,
    handleRowChange,
    handleDeleteRow,
    handlePartySelect,
    handleChange,
    handleBillAddressSelect,
    handleShipAddressSelect,
    handleDispatchSelect,
    handleCompanySelect,
    handleConfirmRow,
    handleEditRow,
    confirmedRows,
    orderHeader,
    poConfig,
    problems,
    confirmProblems,
    visibleLineCount,
    totalAmount,
    taxAmount,
    grandTotal,
    filteredParties,
    filteredBillAddresses,
    filteredShipAddresses,
    selectedPartyLabel,
    selectedDispatch,
    isMartOrder,
    isSchemePanelHidden,
    selectedBillAddressLabel,
    selectedShipAddressLabel,
    selectedDispatchLabel,
    selectedCompanyLabel,
  } = form;

  const chevronIcon = (
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
  const trashIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 6V4.5A1.5 1.5 0 019.5 3h5A1.5 1.5 0 0116 4.5V6"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 6l-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6" />
    </svg>
  );
  const pencilIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
      />
    </svg>
  );

  // ---------------------------------------------------------------------------
  // Add Item picker — search first, filters second.
  // ---------------------------------------------------------------------------

  /** Every typed word must appear somewhere in the product, in any order. */
  const matchesItemSearch = (product: PartyProduct, term: string) => {
    if (!term) return true;
    const haystack = [
      product.item_name,
      product.item_code,
      product.category,
      product.brand,
      product.variety,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return term.split(/\s+/).every((word) => haystack.includes(word));
  };

  /**
   * Set one facet and drop everything below it. `handleRowChange` only clears
   * the item when a facet changes, which would leave e.g. a brand from the
   * previous category still selected and the result list empty.
   */
  const setPickerFacet = (index: number, facet: PickerFacet, value: string) => {
    updateRow(index, (current) => {
      const next: SalesRow = { ...current, confirmed: false };
      next[facet] = value;
      PICKER_FACETS.slice(PICKER_FACETS.indexOf(facet) + 1).forEach((lower) => {
        next[lower] = "";
      });
      return {
        ...next,
        item: "",
        pcs: "",
        qty: "",
        ltrs: "",
        boxes: "",
        priceListBasic: "",
        basicPrice: "",
        tax: "",
        amount: "",
        isScheme: false,
        scheme: "",
        schemeQty: "",
        schemes: [],
      };
    });
    setRowSchemeOptions(rows[index].uid, []);
  };

  const clearPickerFacets = (index: number) => setPickerFacet(index, "category", "");

  /**
   * Pick a whole product in one go. The `item` branch of `handleRowChange`
   * assumes category / brand / sub-group are already chosen, so a search hit
   * back-fills all four facets from the product itself before applying the
   * same item-side fields.
   */
  const selectProductForRow = (index: number, product: PartyProduct) => {
    updateRow(index, (current) =>
      applyFocPricing({
        ...current,
        confirmed: false,
        category: product.category,
        brand: product.brand || "",
        variety: product.variety || "",
        type: getProductType(product.item_name),
        item: product.item_name,
        pcs: String(product.sal_factor2 ?? ""),
        tax: String(getProductTaxRate(product)),
        // Basic Price = pre-tax basic rate; Landing = basic + tax%.
        basicPrice:
          isFocOrder || product.basic_rate == null
            ? isFocOrder
              ? "0"
              : ""
            : String(product.basic_rate),
        priceListBasic: isFocOrder
          ? "0"
          : computeLandingPrice(product.basic_rate, getProductTaxRate(product)),
        qty: "",
        ltrs: "",
        boxes: "",
        amount: "",
        isScheme: false,
        scheme: "",
        schemeQty: "",
        schemes: [],
      }),
    );
    void fetchSchemesForRow(rows[index].uid, true);
    setIsPickingItem(false);
  };

  /** Distinct values of one facet, with how many products carry each. */
  const facetsOf = (list: PartyProduct[], valueOf: (product: PartyProduct) => string) => {
    const counts = new Map<string, number>();
    list.forEach((product) => {
      const value = valueOf(product) || "";
      // Products with no brand / sub-group stay reachable through search and
      // through leaving the facet unset; an "" option here would be
      // indistinguishable from "no filter".
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()].map(([value, count]) => ({ value, count }));
  };

  // `isMartOrder` is defined above (near selectedCompanyLabel).
  // Company-3 (Mart) orders also choose a dispatch warehouse. Display-only for
  // now — the value is not persisted.
  const renderSchemePanel = (row: SalesRow, index: number) => {
    if (isSchemePanelHidden(row)) return null;
    return (
      <div className={`sl-scheme-panel${row.isScheme ? " is-active" : ""}`}>
        <div className="sl-scheme-panel-head">
          <div>
            <div className="sl-scheme-eyebrow">Optional promotion</div>
            <div className="sl-scheme-title">Add scheme to this item</div>
          </div>
          <div className="sl-scheme-toggle-compact">
            <span className="sl-scheme-toggle-label">{row.isScheme ? "Enabled" : "Disabled"}</span>
            <label className="sl-switch">
              <input
                type="checkbox"
                checked={row.isScheme}
                onChange={(e) => handleRowSchemeToggle(index, e.target.checked)}
                disabled={row.confirmed}
              />
              <span className="sl-switch-slider" />
            </label>
          </div>
        </div>

        {row.isScheme && (
          <div className="sl-scheme-panel-body">
            <div className="sl-scheme-dropdown-field">
              <div className="sl-scheme-table-head">
                <span>Scheme</span>
                <span>Qty</span>
                <span>Action</span>
              </div>
              {(row.schemes.length ? row.schemes : [{ scheme: "", schemeQty: "" }]).map(
                (schemeRow, schemeIndex) => (
                  <div className="sl-scheme-table-row" key={`${index}-${schemeIndex}`}>
                    <select
                      value={schemeRow.scheme}
                      onChange={(e) =>
                        handleSchemeChange(index, schemeIndex, "scheme", e.target.value)
                      }
                      disabled={row.confirmed || !(schemeOptions[row.uid] || []).length}
                    >
                      <option value="">Select Scheme...</option>
                      {(schemeOptions[row.uid] || []).map((scheme) => (
                        <option key={scheme.scheme_id} value={scheme.scheme_id}>
                          {scheme.scheme_name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={schemeRow.schemeQty}
                      placeholder="0"
                      onChange={(e) =>
                        handleSchemeChange(index, schemeIndex, "schemeQty", e.target.value)
                      }
                      disabled={row.confirmed}
                    />
                    <button
                      type="button"
                      className="sl-remove-scheme-btn"
                      onClick={() => handleRemoveScheme(index, schemeIndex)}
                      disabled={row.confirmed}
                      aria-label="Remove scheme"
                      title="Remove scheme"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" d="M5 12h14" />
                      </svg>
                    </button>
                  </div>
                ),
              )}
              <button
                type="button"
                className="sl-add-scheme-btn"
                onClick={() => handleAddScheme(index)}
                disabled={row.confirmed}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
                Add Scheme
              </button>
            </div>

            <div className="sl-scheme-total-card">
              <span className="sl-scheme-field-label">Total Ltrs</span>
              <input
                type="text"
                name="totalLtrs"
                value={
                  row.schemes.length
                    ? (
                        Number(row.ltrs) +
                        row.schemes.reduce((sum, scheme) => sum + Number(scheme.schemeQty || 0), 0)
                      ).toFixed(2)
                    : Number(row.ltrs).toFixed(2)
                }
                readOnly
              />
              <small>Base ltrs plus selected scheme quantity</small>
            </div>
          </div>
        )}
      </div>
    );
  };

  const openAddItem = () => {
    setItemSearch("");
    const existing = rows.findIndex((r) => !r.confirmed);
    if (existing !== -1) {
      setItemModalSnapshot(null);
      setItemModalIsNew(true);
      setIsPickingItem(!rows[existing].item);
      setItemModalIndex(existing);
      return;
    }
    appendRow({ ...createEmptyRow(), category: selectedPartyCategory || userDefaultCategory });
    setItemModalSnapshot(null);
    setItemModalIsNew(true);
    setIsPickingItem(true);
    setItemModalIndex(rows.length);
  };

  const openEditItem = (index: number) => {
    setItemModalSnapshot(rows[index]);
    setItemModalIsNew(false);
    setItemSearch("");
    // An existing item opens on its quantities; "Change item" goes back to the
    // picker.
    setIsPickingItem(!rows[index].item);
    handleEditRow(index);
    setItemModalIndex(index);
  };

  const confirmItemModal = () => {
    if (itemModalIndex === null) return;
    // `handleConfirmRow` runs the same `rowProblem` check and records the
    // reason against the row; the modal renders it below. Asking it rather
    // than re-running the rules here is what keeps the two answers identical.
    if (!handleConfirmRow(itemModalIndex)) return;
    setItemModalIndex(null);
    setItemModalSnapshot(null);
    setOpenRowDropdown(null);
  };

  const cancelItemModal = () => {
    if (itemModalIndex === null) return;
    const index = itemModalIndex;
    if (itemModalIsNew) {
      handleDeleteRow(index);
    } else if (itemModalSnapshot) {
      const snapshot = itemModalSnapshot;
      updateRow(index, () => snapshot);
    }
    setItemModalIndex(null);
    setItemModalSnapshot(null);
    setOpenRowDropdown(null);
  };

  /** Left 30% facet rail, right 70% result list under one omni-search. */
  const renderItemPicker = (row: SalesRow, index: number) => {
    const term = itemSearch.trim().toLowerCase();
    const searched = partyProducts.filter((p) => matchesItemSearch(p, term));

    // Each facet level offers what is still reachable given the levels above it.
    const afterCategory = searched.filter((p) => !row.category || p.category === row.category);
    const afterBrand = afterCategory.filter((p) => !row.brand || (p.brand || "") === row.brand);
    const afterVariety = afterBrand.filter(
      (p) => !row.variety || (p.variety || "") === row.variety,
    );
    const results = afterVariety.filter(
      (p) => !row.type || getProductType(p.item_name) === row.type,
    );

    const facetGroups: {
      key: PickerFacet;
      label: string;
      options: { value: string; count: number }[];
    }[] = [
      { key: "category", label: "Category", options: facetsOf(searched, (p) => p.category) },
      { key: "brand", label: "Brand", options: facetsOf(afterCategory, (p) => p.brand || "") },
      { key: "variety", label: "Sub Group", options: facetsOf(afterBrand, (p) => p.variety || "") },
      {
        key: "type",
        label: "Size",
        options: facetsOf(afterVariety, (p) => getProductType(p.item_name)).sort((a, b) => {
          if (a.value === "Others") return 1;
          if (b.value === "Others") return -1;
          return parseFloat(a.value) - parseFloat(b.value);
        }),
      },
    ];

    const activeFacetCount = PICKER_FACETS.filter((facet) => row[facet]).length;

    return (
      <div className="sl-pick">
        <aside className="sl-pick-filters">
          <div className="sl-pick-filters-head">
            <span>Filters</span>
            {activeFacetCount > 0 && (
              <button type="button" onClick={() => clearPickerFacets(index)}>
                Clear all
              </button>
            )}
          </div>
          {facetGroups.map((group) => (
            <div className="sl-pick-facet" key={group.key}>
              <div className="sl-pick-facet-title">{group.label}</div>
              {group.options.length === 0 ? (
                <div className="sl-pick-facet-empty">—</div>
              ) : (
                <div className="sl-pick-facet-list">
                  {group.options.map((option) => (
                    <button
                      type="button"
                      key={`${group.key}-${option.value}`}
                      className={`sl-pick-facet-option${
                        row[group.key] === option.value ? " is-active" : ""
                      }`}
                      onClick={() =>
                        setPickerFacet(
                          index,
                          group.key,
                          row[group.key] === option.value ? "" : option.value,
                        )
                      }
                    >
                      <span>{option.value}</span>
                      <em>{option.count}</em>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </aside>

        <div className="sl-pick-results">
          <div className="sl-pick-search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.6" stroke="#94a3b8" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              autoFocus
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search any product — name, code, brand, sub group..."
            />
            {itemSearch && (
              <button
                type="button"
                className="sl-pick-search-clear"
                onClick={() => setItemSearch("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="sl-pick-count">
            {results.length} product{results.length === 1 ? "" : "s"}
            {activeFacetCount > 0 || term ? " matching" : " available"}
          </div>

          <div className="sl-pick-list">
            {results.length === 0 ? (
              <div className="sl-pick-empty">
                <p>Nothing matches that.</p>
                <span>Try fewer words, or clear a filter on the left.</span>
              </div>
            ) : (
              results.map((product) => (
                <button
                  type="button"
                  key={`${product.item_code}-${product.category}`}
                  className={`sl-pick-item${product.item_name === row.item ? " is-active" : ""}`}
                  onClick={() => selectProductForRow(index, product)}
                >
                  <span className="sl-pick-item-main">
                    <span className="sl-pick-item-name">{product.item_name}</span>
                    <span className="sl-pick-item-meta">
                      {[product.category, product.brand, product.variety]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="sl-pick-item-side">
                    <span className="sl-pick-item-size">{getProductType(product.item_name)}</span>
                    {!isFocOrder && product.basic_rate !== null && product.basic_rate !== "" && (
                      <span className="sl-pick-item-rate">₹ {product.basic_rate}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderItemModal = () => {
    if (itemModalIndex === null) return null;
    const row = rows[itemModalIndex];
    if (!row) return null;
    const index = itemModalIndex;

    return (
      <div className="sl-modal-overlay">
        <div
          className={`sl-wiz-modal${isPickingItem ? " is-picking" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={itemModalIsNew ? "Add item" : "Edit item"}
        >
          <div className="sl-wiz-modal-head">
            <div>
              <div className="sl-wiz-eyebrow">{itemModalIsNew ? "Add item" : "Edit item"}</div>
              <h3 className="sl-wiz-modal-title">
                {isPickingItem ? "Choose a product" : row.item || "Select a product"}
              </h3>
            </div>
            <button
              type="button"
              className="sl-wiz-icon-btn"
              onClick={cancelItemModal}
              aria-label="Close"
              title="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className={`sl-wiz-modal-body${isPickingItem ? " is-picking" : ""}`}>
            {isPickingItem ? (
              renderItemPicker(row, index)
            ) : (
              <>
                <div className="sl-pick-chosen">
                  <div className="sl-pick-chosen-main">
                    <div className="sl-pick-chosen-name">{row.item}</div>
                    <div className="sl-pick-chosen-meta">
                      {[row.category, row.brand, row.variety, row.type]
                        .filter(Boolean)
                        .map((part) => (
                          <span className="sl-pick-tag" key={part}>
                            {part}
                          </span>
                        ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sl-wiz-btn sl-wiz-btn-ghost"
                    onClick={() => {
                      setItemSearch("");
                      setIsPickingItem(true);
                    }}
                  >
                    Change item
                  </button>
                </div>
                <div className="sl-wiz-item-fields">
                  <div className="sl-wiz-input">
                    <label>Boxes</label>
                    <input
                      type="number"
                      name="boxes"
                      aria-label="Boxes"
                      value={row.boxes}
                      onChange={(e) => handleRowChange(index, e)}
                    />
                  </div>
                  <div className="sl-wiz-input">
                    <label>Qty</label>
                    <input
                      type="number"
                      name="qty"
                      aria-label="Qty"
                      value={row.qty}
                      onChange={(e) => handleRowChange(index, e)}
                    />
                  </div>
                  <div className="sl-wiz-input">
                    <label>Pcs</label>
                    <input
                      type="number"
                      aria-label="Pcs"
                      value={row.pcs ? Number(row.pcs).toFixed(1) : ""}
                      readOnly
                    />
                  </div>
                  <div className="sl-wiz-input">
                    <label>Ltrs</label>
                    <input type="number" aria-label="Ltrs" value={row.ltrs} readOnly />
                  </div>
                  <div className="sl-wiz-input">
                    <label>Price List</label>
                    <input type="number" aria-label="Price List" value={row.priceListBasic} readOnly />
                  </div>
                  <div className="sl-wiz-input">
                    <label>Basic Price</label>
                    <input
                      type="number"
                      name="basicPrice"
                      aria-label="Basic Price"
                      value={row.basicPrice}
                      onChange={(e) => handleRowChange(index, e)}
                    />
                  </div>
                  <div className="sl-wiz-input">
                    <label>Tax %</label>
                    <input type="text" aria-label="Tax %" value={Number(row.tax).toFixed(2)} readOnly />
                  </div>
                  <div className="sl-wiz-input">
                    <label>Amount</label>
                    <input type="number" aria-label="Amount" value={row.amount} readOnly />
                  </div>
                </div>
                {row.item && !isFocOrder && renderSchemePanel(row, index)}
              </>
            )}
          </div>

          {/* The reason this row will not confirm. It was an `alert()`, which
              covers the fields it is talking about and has to be dismissed
              before they can be looked at. */}
          <FieldError message={confirmProblems[row.uid]} />

          <div className="sl-wiz-modal-foot">
            {isPickingItem && row.item && (
              <button
                type="button"
                className="sl-wiz-btn sl-wiz-btn-ghost sl-pick-back"
                onClick={() => setIsPickingItem(false)}
              >
                ← Back to quantities
              </button>
            )}
            <button type="button" className="sl-wiz-btn sl-wiz-btn-ghost" onClick={cancelItemModal}>
              Cancel
            </button>
            {!isPickingItem && (
              <button
                type="button"
                className="sl-wiz-btn sl-wiz-btn-primary"
                onClick={confirmItemModal}
              >
                {itemModalIsNew ? "Add Item" : "Save Changes"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderItemSummaryCard = (row: SalesRow, index: number) => (
    <Fragment key={`sum-${index}`}>
      <div className="sl-wiz-item-summary">
        <div className="sl-wiz-item-summary-main">
          <span className="sl-wiz-item-summary-name">{row.item || "Item"}</span>
          <span className="sl-wiz-item-summary-meta">
            {row.type ? `${row.type} · ` : ""}
            {row.boxes ? `${row.boxes} box · ` : ""}
            Qty {row.qty || 0}
          </span>
        </div>
        <span className="sl-wiz-item-summary-amount">₹ {Number(row.amount || 0).toFixed(2)}</span>
        <div className="sl-wiz-item-summary-actions">
          <button
            type="button"
            className="sl-wiz-icon-btn"
            onClick={() => openEditItem(index)}
            aria-label="Edit item"
            title="Edit item"
          >
            {pencilIcon}
          </button>
          <button
            type="button"
            className="sl-wiz-icon-btn sl-wiz-danger"
            onClick={() => handleDeleteRow(index)}
            aria-label="Delete item"
            title="Delete item"
          >
            {trashIcon}
          </button>
        </div>
      </div>

      {/* Free lines belonging to the item above. No edit/delete: they follow the
          parent, so you change them by changing it. */}
      {getDerivedLines(row, index).map((line) => (
        <div className="sl-wiz-item-summary is-free" key={line.key}>
          <div className="sl-wiz-item-summary-main">
            <span className="sl-wiz-item-summary-name">
              {line.itemName}
              <span className={`sl-wiz-free-badge is-${line.kind}`}>
                {line.kind === "combo" ? "Combo" : "Scheme"}
              </span>
            </span>
            <span className="sl-wiz-item-summary-meta">
              {line.note}
              {line.itemCode ? ` · ${line.itemCode}` : ""} · Qty {line.qtyLabel}
            </span>
          </div>
          <span className="sl-wiz-item-summary-amount">₹ 0.00</span>
          <div className="sl-wiz-item-summary-actions" />
        </div>
      ))}
    </Fragment>
  );

  const renderCombo = (config: {
    refEl: React.RefObject<HTMLDivElement | null>;
    open: boolean;
    setOpen: (value: boolean) => void;
    search: string;
    setSearch: (value: string) => void;
    selectedLabel: string;
    placeholder: string;
    children: React.ReactNode;
  }) => (
    <div className={`sl-party-dropdown sl-combo${config.open ? " open" : ""}`} ref={config.refEl}>
      <input
        type="text"
        className="sl-combo-input"
        placeholder={config.placeholder}
        aria-label={config.placeholder}
        role="combobox"
        aria-expanded={config.open}
        aria-autocomplete="list"
        value={config.open ? config.search : config.selectedLabel}
        onChange={(e) => {
          config.setSearch(e.target.value);
          config.setOpen(true);
        }}
        onFocus={() => {
          config.setOpen(true);
          config.setSearch("");
        }}
      />
      <span className="sl-combo-caret" aria-hidden="true">
        {chevronIcon}
      </span>
      {config.open && (
        <div className="sl-party-menu">
          <div className="sl-party-options">{config.children}</div>
        </div>
      )}
    </div>
  );

  const renderStepParty = () => (
    <div className="sl-wiz-step">
      <div className="sl-wiz-step-intro">
        <div className="sl-wiz-eyebrow">Step 1</div>
        <h2 className="sl-wiz-step-title">Party Information</h2>
        <p className="sl-wiz-step-sub">
          Choose the party — bill-to and ship-to fill in automatically.
        </p>
      </div>
      <div className="sl-wiz-field-grid">
        <div className="sl-field sl-wiz-field-full">
          <label className="sl-label">Party Name</label>
          {renderCombo({
            refEl: partyDropdownRef,
            open: partyDropdownOpen,
            setOpen: setPartyDropdownOpen,
            search: partySearch,
            setSearch: setPartySearch,
            selectedLabel: selectedPartyLabel,
            placeholder: "Search party...",
            children:
              filteredParties.length > 0 ? (
                filteredParties.map((party) => (
                  <button
                    type="button"
                    key={`${party.value}-${party.category || ""}`}
                    className={`sl-party-option${
                      party.value === formData.parties &&
                      String(party.category || "").toUpperCase() ===
                        selectedPartyCategory.toUpperCase()
                        ? " is-selected"
                        : ""
                    }`}
                    onClick={() => handlePartySelect(party.value, party.category || "")}
                  >
                    <span className="sl-party-option-label">{party.label}</span>
                    <span className="sl-party-option-code">
                      {[party.value, party.category].filter(Boolean).join(" | ")}
                    </span>
                  </button>
                ))
              ) : (
                <div className="sl-party-empty">No parties found</div>
              ),
          })}
          <FieldError message={problems.header.parties} />
        </div>

        <div className="sl-field">
          <label className="sl-label">Bill To Address</label>
          {renderCombo({
            refEl: billDropdownRef,
            open: billDropdownOpen,
            setOpen: setBillDropdownOpen,
            search: billSearch,
            setSearch: setBillSearch,
            selectedLabel: selectedBillAddressLabel,
            placeholder: "Search bill to...",
            children:
              filteredBillAddresses.length > 0 ? (
                filteredBillAddresses.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    className={`sl-party-option${
                      String(b.id) === formData.billAddress ? " is-selected" : ""
                    }`}
                    onClick={() => handleBillAddressSelect(String(b.id))}
                  >
                    <span className="sl-party-option-label">
                      {b.address_name || b.full_address || b.address_id}
                    </span>
                  </button>
                ))
              ) : (
                <div className="sl-party-empty">No addresses found</div>
              ),
          })}
          <FieldError message={problems.header.billAddress} />
        </div>

        <div className="sl-field">
          <label className="sl-label">Ship To Address</label>
          {renderCombo({
            refEl: shipDropdownRef,
            open: shipDropdownOpen,
            setOpen: setShipDropdownOpen,
            search: shipSearch,
            setSearch: setShipSearch,
            selectedLabel: selectedShipAddressLabel,
            placeholder: "Search ship to...",
            children:
              filteredShipAddresses.length > 0 ? (
                filteredShipAddresses.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={`sl-party-option${
                      String(s.id) === formData.shipAddress ? " is-selected" : ""
                    }`}
                    onClick={() => handleShipAddressSelect(String(s.id))}
                  >
                    <span className="sl-party-option-label">
                      {s.address_name || s.full_address || s.address_id}
                    </span>
                  </button>
                ))
              ) : (
                <div className="sl-party-empty">No addresses found</div>
              ),
          })}
          <FieldError message={problems.header.shipAddress} />
        </div>

        <div className="sl-field">
          <label className="sl-label">Dispatch From</label>
          <div className="sl-wiz-dispatch">
            <div
              className={`sl-party-dropdown sl-wiz-dispatch-select${
                dispatchDropdownOpen ? " open" : ""
              }`}
              ref={dispatchDropdownRef}
            >
              <button
                type="button"
                className="sl-party-trigger"
                aria-haspopup="listbox"
                aria-expanded={dispatchDropdownOpen}
                aria-label="Dispatch From"
                onClick={() => setDispatchDropdownOpen((prev) => !prev)}
              >
                <span>{selectedDispatchLabel || "--select--"}</span>
                {chevronIcon}
              </button>
              {dispatchDropdownOpen && (
                <div className="sl-party-menu">
                  <div className="sl-party-options">
                    {branch.length > 0 ? (
                      branch.map((d) => (
                        <button
                          type="button"
                          key={d.bpl_id}
                          className={`sl-party-option${
                            String(d.bpl_id) === formData.dispatch ? " is-selected" : ""
                          }`}
                          onClick={() => handleDispatchSelect(String(d.bpl_id))}
                        >
                          <span className="sl-party-option-label">{d.bpl_name}</span>
                        </button>
                      ))
                    ) : (
                      <div className="sl-party-empty">No dispatch locations found</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="sl-wiz-info" ref={dispatchInfoRef}>
              <button
                type="button"
                className="sl-wiz-info-btn"
                onClick={() => setDispatchInfoOpen((prev) => !prev)}
                aria-label="Dispatch location details"
                title="Dispatch location details"
              >
                i
              </button>
              {dispatchInfoOpen && (
                <div className="sl-wiz-info-pop">
                  <div className="sl-wiz-info-pop-title">Dispatch location</div>
                  {selectedDispatch ? (
                    <dl className="sl-wiz-info-list">
                      <div>
                        <dt>Name</dt>
                        <dd>{selectedDispatch.bpl_name || "—"}</dd>
                      </div>
                      <div>
                        <dt>Branch ID</dt>
                        <dd>{selectedDispatch.bpl_id ?? "—"}</dd>
                      </div>
                      {selectedDispatch.address && (
                        <div>
                          <dt>Address</dt>
                          <dd>{selectedDispatch.address}</dd>
                        </div>
                      )}
                    </dl>
                  ) : (
                    <p className="sl-wiz-info-empty">
                      This is the default dispatch branch for your orders.
                    </p>
                  )}
                </div>
              )}
            </div>
            <input type="hidden" name="dispatch" value={formData.dispatch} />
          </div>
        </div>

        <div className="sl-field">
          <label className="sl-label">Date</label>
          <div className="sl-input-wrap">
            <input type="date" name="date" aria-label="Date" value={formData.date} readOnly />
            <div className="sl-focus-line" />
          </div>
        </div>

        <div className="sl-field">
          <label className="sl-label" htmlFor="wiz-delivery-date">
            Delivery Date
          </label>
          <div className="sl-input-wrap">
            <input
              id="wiz-delivery-date"
              type="date"
              name="Deliverydate"
              value={formData.Deliverydate}
              onChange={handleChange}
            />
            <div className="sl-focus-line" />
          </div>
          <FieldError message={problems.header.Deliverydate} />
        </div>
      </div>
    </div>
  );

  const renderStepItems = () => (
    <div className="sl-wiz-step">
      <div className="sl-wiz-items-head">
        <div className="sl-wiz-step-intro">
          <div className="sl-wiz-eyebrow">Step 2</div>
          <h2 className="sl-wiz-step-title">Items</h2>
        </div>
        <div className="sl-wiz-items-meta">
          <span>
            {/* Counts the free lines too, so the number matches what is listed. */}
            {visibleLineCount} item{visibleLineCount === 1 ? "" : "s"}
          </span>
          <strong>₹ {totalAmount.toFixed(2)}</strong>
        </div>
      </div>
      {confirmedRows.length > 0 ? (
        <div className="sl-wiz-item-list">
          {rows.map((row, index) => (row.confirmed ? renderItemSummaryCard(row, index) : null))}
        </div>
      ) : (
        <div className="sl-wiz-item-empty">
          <p>No items added yet.</p>
          <span>Click “Add Item” to start building this order.</span>
        </div>
      )}
      <button type="button" className="sl-wiz-add-item" onClick={openAddItem}>
        + Add Item
      </button>
    </div>
  );

  const renderStepSummary = () => (
    <div className="sl-wiz-step">
      <div className="sl-wiz-step-intro">
        <div className="sl-wiz-eyebrow">Step 3</div>
        <h2 className="sl-wiz-step-title">Order Summary</h2>
      </div>
      <div className="sl-wiz-field-grid">
        {canEditPoNumber && (
          <div className="sl-field">
            <label className="sl-label" htmlFor="wiz-po">
              {poField.label}
              {poField.required && <span className="sl-req-mark"> *</span>}
            </label>
            <div className="sl-input-wrap">
              <input
                type="text"
                id="wiz-po"
                name="poNumber"
                value={formData.poNumber}
                onChange={handleChange}
                placeholder="Enter PO number"
                // Bound, not hardcoded. Inert today because renderWizard() is
                // rendered outside the <form>, but it goes live the moment a
                // form element wraps this — see the 3.4 migration notes.
                required={poField.required}
              />
              <div className="sl-focus-line" />
            </div>
            <FieldError message={problems.header.poNumber} />
          </div>
        )}
        {isMartOrder && <WarehouseField form={form} />}
        <div className="sl-field">
          <label className="sl-label">Company</label>
          <div
            className={`sl-party-dropdown${companyDropdownOpen ? " open" : ""}`}
            ref={companyDropdownRef}
          >
            <button
              type="button"
              className="sl-party-trigger"
              aria-haspopup="listbox"
              aria-expanded={companyDropdownOpen}
              aria-label="Company"
              onClick={() => setCompanyDropdownOpen((prev) => !prev)}
            >
              <span>{selectedCompanyLabel || "Select Company"}</span>
              {chevronIcon}
            </button>
            {companyDropdownOpen && (
              <div className="sl-party-menu">
                <div className="sl-party-options">
                  {company.length > 0 ? (
                    company.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`sl-party-option${
                          String(item.id) === formData.company ? " is-selected" : ""
                        }`}
                        onClick={() => handleCompanySelect(String(item.id))}
                      >
                        <span className="sl-party-option-label">{item.name}</span>
                      </button>
                    ))
                  ) : (
                    <div className="sl-party-empty">No companies found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sl-wiz-totals">
        <div className="sl-wiz-total-row">
          <span>Total</span>
          <strong>₹ {totalAmount.toFixed(2)}</strong>
        </div>
        <div className="sl-wiz-total-row">
          <span>Tax</span>
          <strong>₹ {taxAmount.toFixed(2)}</strong>
        </div>
        <div className="sl-wiz-total-row sl-wiz-total-grand">
          <span>Grand Total</span>
          <strong>₹ {grandTotal.toFixed(2)}</strong>
        </div>
      </div>

      <div className="sl-field sl-full">
        <label className="sl-label" htmlFor="wiz-comment">
          Comment
        </label>
        <div className="sl-input-wrap sl-input-wrap-textarea">
          <textarea
            id="wiz-comment"
            name="comment"
            rows={3}
            placeholder="Add a note..."
            value={formData.comment}
            onChange={(e) => setFormData((prev) => ({ ...prev, comment: e.target.value }))}
          />
          <div className="sl-focus-line" />
        </div>
      </div>
    </div>
  );

  const renderStepReview = () => (
    <div className="sl-wiz-step">
      <div className="sl-wiz-step-intro">
        <div className="sl-wiz-eyebrow">Step 4</div>
        <h2 className="sl-wiz-step-title">Review &amp; Submit</h2>
        <p className="sl-wiz-step-sub">Confirm the details below before saving.</p>
      </div>
      {/* Everything still wrong, on the step that has the Save button. The
          individual messages are on steps 1 and 3, which the user has left by
          the time they press it — a message they have to navigate back to is
          only half an answer. */}
      <ProblemSummary problems={problems} />
      <div className="sl-wiz-review">
        <div className="sl-wiz-review-hero">
          <span className="sl-wiz-review-label">Party</span>
          <strong className="sl-wiz-review-party">{selectedPartyLabel || "—"}</strong>
        </div>
        <div className="sl-wiz-review-secondary">
          <div>
            <span>Bill To</span>
            <em>{selectedBillAddressLabel || "—"}</em>
          </div>
          <div>
            <span>Ship To</span>
            <em>{selectedShipAddressLabel || "—"}</em>
          </div>
          <div>
            <span>Dispatch</span>
            <em>{selectedDispatchLabel || "—"}</em>
          </div>
          <div>
            <span>Delivery Date</span>
            <em>{formData.Deliverydate || "—"}</em>
          </div>
        </div>
        <div className="sl-wiz-review-items">
          <div className="sl-wiz-review-items-head">
            <span>Items</span>
            <span>{visibleLineCount}</span>
          </div>
          {/* Free lines are listed here too. This is the last screen before the
              order is saved, so it has to match what actually gets sent. */}
          {rows.map((row, index) =>
            row.confirmed ? (
              <Fragment key={`rev-${index}`}>
                <div className="sl-wiz-review-item">
                  <strong>{row.item || "Item"}</strong>
                  <span>Qty {row.qty || 0}</span>
                  <span className="sl-wiz-review-item-amt">
                    ₹ {Number(row.amount || 0).toFixed(2)}
                  </span>
                </div>
                {getDerivedLines(row, index).map((line) => (
                  <div className="sl-wiz-review-item is-free" key={line.key}>
                    <strong>
                      {line.itemName}
                      <span className={`sl-wiz-free-badge is-${line.kind}`}>
                        {line.kind === "combo" ? "Combo" : "Scheme"}
                      </span>
                    </strong>
                    <span>Qty {line.qtyLabel}</span>
                    <span className="sl-wiz-review-item-amt">₹ 0.00</span>
                  </div>
                ))}
              </Fragment>
            ) : null,
          )}
        </div>
        <div className="sl-wiz-review-foot">
          {formData.poNumber && (
            <div className="sl-wiz-review-kv">
              <span>{poField.label}</span>
              <strong>{formData.poNumber}</strong>
            </div>
          )}
          {formData.comment && (
            <div className="sl-wiz-review-kv">
              <span>Comments</span>
              <strong>{formData.comment}</strong>
            </div>
          )}
          <div className="sl-wiz-review-kv sl-wiz-review-total">
            <span>Grand Total</span>
            <strong>₹ {grandTotal.toFixed(2)}</strong>
          </div>
        </div>
      </div>
    </div>
  );

  const wizardSteps = [
    { n: 1, label: "Party" },
    { n: 2, label: "Items" },
    { n: 3, label: "Summary" },
    { n: 4, label: "Review" },
  ];

  const canAdvance = (step: number) => {
    // Steps 1 and 3 defer to `orderHeaderSchema`, which the save gate now uses
    // too. They were hand-written truthiness chains that disagreed with the
    // save path in both directions: an address only had to be non-empty here,
    // while `submitOrder` sends `Number(...)` of it.
    if (step === 1) return stepOneComplete(orderHeader, poConfig);
    if (step === 2) return confirmedRows.length > 0 && !rows.some((r) => !r.confirmed && r.item);
    // PO Number is optional, so step 3 only needs the company.
    if (step === 3) return stepThreeComplete(orderHeader, poConfig);
    return true;
  };

  const handleWizardSubmit = () => {
    if (!validateBeforeSave()) return;
    setShowSaveConfirm(true);
  };

  const renderStepper = () => (
    <div className="sl-wiz-stepper">
      {wizardSteps.map((step, i) => (
        <Fragment key={step.n}>
          <button
            type="button"
            className={`sl-wiz-step-node${currentStep === step.n ? " is-active" : ""}${
              currentStep > step.n ? " is-complete" : ""
            }`}
            onClick={() => {
              if (step.n < currentStep) setCurrentStep(step.n);
            }}
            disabled={step.n > currentStep}
          >
            <span className="sl-wiz-step-num">{currentStep > step.n ? "✓" : step.n}</span>
            <span className="sl-wiz-step-label">{step.label}</span>
          </button>
          {i < wizardSteps.length - 1 && (
            <span className={`sl-wiz-step-line${currentStep > step.n ? " is-complete" : ""}`} />
          )}
        </Fragment>
      ))}
    </div>
  );

  const renderWizardFooter = () => (
    <div className="sl-wiz-footer">
      {currentStep > 1 ? (
        <button
          type="button"
          className="sl-wiz-btn sl-wiz-btn-ghost"
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
        >
          Back
        </button>
      ) : (
        <button type="button" className="sl-wiz-btn sl-wiz-btn-ghost" onClick={handleClearForm}>
          Clear
        </button>
      )}
      <div className="sl-wiz-footer-spacer" />
      {/*
        Save as Draft, on every step.

        This existed only on the legacy form, which `useWizard` renders for
        edit / duplicate / FOC — so the one flow a draft is actually for,
        starting a fresh order, had no way to reach it, while `handleSaveDraft`
        and the whole /Drafts page stayed live. It sits on every step rather
        than only the last because an order you can finish is not the one you
        need to park.

        A party is the gate: `handleSaveDraft` sends `card_code` straight
        through, and a draft saved without one is a row nobody can resume.
      */}
      {/*
        No `(!isEditMode || editOrderIsDraft)` guard, which is what the legacy
        form carries: `useWizard` requires mode "create" and `isEditMode`
        requires mode "edit", so inside this component the guard is always true.
        Copying it across would have been a condition that cannot be false.
      */}
      <button
        type="button"
        className="sl-wiz-btn sl-wiz-btn-ghost"
        onClick={handleSaveDraft}
        disabled={isSaving || isSavingDraft || !formData.parties}
      >
        {isSavingDraft ? "Saving Draft..." : "Save as Draft"}
      </button>
      {currentStep < 4 ? (
        <button
          type="button"
          className="sl-wiz-btn sl-wiz-btn-primary"
          disabled={!canAdvance(currentStep)}
          onClick={() => {
            if (canAdvance(currentStep)) setCurrentStep((s) => Math.min(4, s + 1));
          }}
        >
          Continue
        </button>
      ) : (
        <button
          type="button"
          className="sl-wiz-btn sl-wiz-btn-primary"
          disabled={isSaving || confirmedRows.length === 0}
          onClick={handleWizardSubmit}
        >
          {isSaving ? "Saving..." : "Save Order"}
        </button>
      )}
    </div>
  );

  const renderWizard = () => (
    <div className="sl-wiz">
      {renderStepper()}
      <div className="sl-wiz-body">
        {currentStep === 1 && renderStepParty()}
        {currentStep === 2 && renderStepItems()}
        {currentStep === 3 && renderStepSummary()}
        {currentStep === 4 && renderStepReview()}
      </div>
      {renderWizardFooter()}
      {renderItemModal()}
    </div>
  );

  return renderWizard();
}
