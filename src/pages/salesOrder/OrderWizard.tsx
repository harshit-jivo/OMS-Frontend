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
 *
 * ── On the conversion ─────────────────────────────────────────────────────
 * The last unconverted form in the app, and the one that was left until last
 * on purpose: people have muscle memory for it, so this is a restyle, not a
 * redesign. Every step, every field, every validation gate and the order they
 * appear in are unchanged.
 *
 * Three things did change, because they were bugs rather than style:
 *
 * · THE ITEM MODAL IS A REAL DIALOG. It was a fixed div with `role="dialog"`
 *   and `aria-modal` asserted by hand — no focus trap, no scroll lock, no
 *   Escape. Tab walked straight out of it into the page behind. `ui/dialog`
 *   owns all of that, and brings the `tw-page` reset a portaled panel needs
 *   (DESIGN_SYSTEM §1.3).
 * · THE STEPPER IS A LIST, not a row of anonymous buttons — and a completed
 *   step's tick is no longer the only thing saying so, since `aria-current`
 *   now marks the step you are on.
 * · THE SCHEME TOGGLE IS A REAL CHECKBOX in a label. It was a `<label>`
 *   wrapping a visually-hidden input and a `<span>` slider, which worked, but
 *   the switch had no accessible name at all.
 *
 * What did NOT change, deliberately: the party / bill-to / ship-to comboboxes
 * still carry their own open state, refs and outside-click handling from
 * `useSalesOrderForm`, rather than becoming `ui/dropdown`'s `SearchSelect`.
 * That state is SHARED with `LegacyOrderForm`, so swapping the control means
 * changing the hook underneath both forms at once — a bigger and riskier
 * change than a restyle, and its own piece of work.
 */
import { Fragment } from "react";
import {
  HiChevronDown,
  HiMagnifyingGlass,
  HiMinus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiPlus,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { PartyProduct } from "@/services/ordersService";

import FieldError from "./FieldError";
import ProblemSummary from "./ProblemSummary";
import WarehouseField from "./WarehouseField";
import { stepOneComplete, stepThreeComplete } from "./orderHeaderSchema";
import { FOC_TOKEN_BASIC_PRICE, computeLandingPrice } from "./rowTotals";
import { PICKER_FACETS, type PickerFacet, type SalesOrderForm } from "./useSalesOrderForm";
import { createEmptyRow, type SalesRow } from "../salesOrderRow";

/* ── Shared class recipes ─────────────────────────────────────────────────
 * Named where they repeat, inline where they do not. These four are the ones
 * that appear on three or more elements; anything used twice is written out
 * at both sites, because a name that saves ten characters costs a lookup.
 */

/** The white card a step, the stepper and the footer each sit on. */
const PANEL = "rounded-md border border-line bg-card shadow-card";

/** The eyebrow over a step title, and over the modal's own heading. */
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.08em] text-brand";

/** A dropdown panel: the party/bill/ship/dispatch/company menus share it. */
const MENU =
  "absolute left-0 right-0 top-[calc(100%+6px)] z-[1301] overflow-hidden rounded-md border border-brand-line bg-card shadow-panel";

/** One option inside that panel. */
const OPTION =
  "flex w-full cursor-pointer appearance-none flex-col items-start gap-0.5 rounded-lg border-0 bg-transparent px-2.5 py-2.5 text-left [font-family:inherit] transition-colors hover:bg-surface";

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
              ? FOC_TOKEN_BASIC_PRICE
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
      <div
        className={cn(
          "mt-4 overflow-hidden rounded-md border bg-card shadow-card",
          row.isScheme ? "border-line-strong" : "border-line",
        )}
      >
        <div className="flex flex-col items-stretch justify-between gap-3.5 border-b border-line bg-surface p-3.5 sm:flex-row sm:items-center">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-subtle">
              Optional promotion
            </div>
            <div className="mt-0.5 text-[13px] font-bold text-ink">
              Add scheme to this item
            </div>
          </div>
          {/*
            A real checkbox in a label, so the switch has an accessible name
            and answers the space bar. It was a bare input inside a label with
            no text, and a `<span>` doing the drawing.
          */}
          <label className="flex h-[34px] min-w-[132px] cursor-pointer items-center justify-between gap-2 rounded-full border border-line-strong bg-card px-2.5">
            <span className="text-[11px] font-extrabold text-ink-soft">
              {row.isScheme ? "Enabled" : "Disabled"}
            </span>
            <span className="relative inline-block h-5 w-9 shrink-0">
              <input
                type="checkbox"
                className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                checked={row.isScheme}
                onChange={(e) => handleRowSchemeToggle(index, e.target.checked)}
                disabled={row.confirmed}
                aria-label="Add scheme to this item"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-line-strong transition-colors peer-checked:bg-[#0f766e] peer-focus-visible:shadow-focus"
              />
              <span
                aria-hidden="true"
                className="absolute left-[3px] top-[3px] size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.2)] transition-transform peer-checked:translate-x-[18px]"
              />
            </span>
          </label>
        </div>

        {row.isScheme && (
          <div className="grid items-start gap-3 p-3.5 lg:grid-cols-[minmax(0,560px)_160px]">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="grid grid-cols-[1fr_80px_48px] items-center gap-2 px-0.5 text-[11px] font-extrabold uppercase tracking-[0.04em] text-subtle sm:grid-cols-[minmax(220px,360px)_90px_56px]">
                <span>Scheme</span>
                <span>Qty</span>
                <span>Action</span>
              </div>
              {(row.schemes.length ? row.schemes : [{ scheme: "", schemeQty: "" }]).map(
                (schemeRow, schemeIndex) => (
                  <div
                    className="grid grid-cols-[1fr_80px_48px] items-center gap-2 rounded-md border border-line bg-surface p-2 sm:grid-cols-[minmax(220px,360px)_90px_56px]"
                    key={`${index}-${schemeIndex}`}
                  >
                    <Select
                      aria-label="Scheme"
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
                    </Select>
                    <Input
                      type="text"
                      aria-label="Scheme quantity"
                      value={schemeRow.schemeQty}
                      placeholder="0"
                      onChange={(e) =>
                        handleSchemeChange(index, schemeIndex, "schemeQty", e.target.value)
                      }
                      disabled={row.confirmed}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveScheme(index, schemeIndex)}
                      disabled={row.confirmed}
                      aria-label="Remove scheme"
                      title="Remove scheme"
                    >
                      <HiMinus aria-hidden="true" />
                    </Button>
                  </div>
                ),
              )}
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => handleAddScheme(index)}
                disabled={row.confirmed}
              >
                <HiPlus aria-hidden="true" /> Add Scheme
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface p-3">
              <span className="text-[11px] font-extrabold text-ink-soft">Total Ltrs</span>
              <Input
                type="text"
                name="totalLtrs"
                aria-label="Total Ltrs"
                className="bg-white font-extrabold text-ink"
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
              <small className="text-[11px] leading-snug text-subtle">
                Base ltrs plus selected scheme quantity
              </small>
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
      <div className="grid min-h-0 grid-rows-[auto_1fr] md:h-full md:grid-cols-[30%_70%] md:grid-rows-1">
        <aside className="min-h-0 max-h-[34%] overflow-y-auto border-b border-line bg-surface p-3.5 pb-5 md:max-h-none md:border-b-0 md:border-r">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">
              Filters
            </span>
            {activeFacetCount > 0 && (
              <Button variant="link" size="inline" onClick={() => clearPickerFacets(index)}>
                Clear all
              </Button>
            )}
          </div>
          {facetGroups.map((group) => (
            <div
              className="mt-4 border-t border-line pt-3.5 first:mt-0 first:border-t-0 first:pt-0"
              key={group.key}
            >
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-subtle">
                {group.label}
              </div>
              {group.options.length === 0 ? (
                <div className="text-[12px] text-line-strong">—</div>
              ) : (
                <div className="flex max-h-[190px] flex-col gap-0.5 overflow-y-auto">
                  {group.options.map((option) => {
                    const active = row[group.key] === option.value;
                    return (
                      <button
                        type="button"
                        key={`${group.key}-${option.value}`}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full cursor-pointer appearance-none items-center justify-between gap-2",
                          "rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] leading-snug",
                          "[font-family:inherit] transition-colors",
                          active
                            ? "border-brand bg-card font-semibold text-brand"
                            : "border-transparent bg-transparent text-ink-soft hover:bg-brand-soft",
                        )}
                        onClick={() =>
                          setPickerFacet(index, group.key, active ? "" : option.value)
                        }
                      >
                        <span className="min-w-0 truncate">{option.value}</span>
                        <em
                          className={cn(
                            "flex-none text-[11px] font-semibold not-italic",
                            active ? "text-brand" : "text-subtle",
                          )}
                        >
                          {option.count}
                        </em>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="relative px-4 pb-2.5 pt-3.5">
            <HiMagnifyingGlass
              aria-hidden="true"
              className="pointer-events-none absolute left-[26px] top-1/2 -translate-y-[40%] text-[16px] text-subtle"
            />
            <Input
              type="text"
              autoFocus
              aria-label="Search products"
              className="h-[42px] pl-9 pr-9 text-[14px]"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search any product — name, code, brand, sub group..."
            />
            {itemSearch && (
              <button
                type="button"
                className="absolute right-6 top-1/2 grid size-[22px] -translate-y-[40%] cursor-pointer appearance-none place-items-center rounded-full border-0 bg-surface-strong text-[15px] leading-none text-body [font-family:inherit] hover:bg-line-strong"
                onClick={() => setItemSearch("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="px-4 pb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-subtle">
            {results.length} product{results.length === 1 ? "" : "s"}
            {activeFacetCount > 0 || term ? " matching" : " available"}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3.5">
            {results.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="m-0 mb-1 text-[14px] font-semibold text-body">
                  Nothing matches that.
                </p>
                <span className="text-[12.5px] text-subtle">
                  Try fewer words, or clear a filter on the left.
                </span>
              </div>
            ) : (
              results.map((product) => {
                const active = product.item_name === row.item;
                return (
                  <button
                    type="button"
                    key={`${product.item_code}-${product.category}`}
                    className={cn(
                      "flex w-full cursor-pointer appearance-none items-center justify-between gap-3",
                      "rounded-[10px] border px-3 py-2.5 text-left [font-family:inherit] transition-colors",
                      active
                        ? "border-brand bg-brand-soft"
                        : "border-transparent bg-transparent hover:border-brand-line hover:bg-brand-soft/50",
                    )}
                    onClick={() => selectProductForRow(index, product)}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13.5px] font-semibold leading-snug text-ink">
                        {product.item_name}
                      </span>
                      <span className="text-[11.5px] text-subtle">
                        {[product.category, product.brand, product.variety]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-2.5">
                      <span className="rounded-full bg-surface-strong px-2.5 py-0.5 text-[11px] font-semibold text-body">
                        {getProductType(product.item_name)}
                      </span>
                      {!isFocOrder && product.basic_rate !== null && product.basic_rate !== "" && (
                        <span className="min-w-[62px] text-right text-[12.5px] font-bold text-ink">
                          ₹ {product.basic_rate}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderItemModal = () => {
    const row = itemModalIndex === null ? null : rows[itemModalIndex];

    return (
      <Dialog
        open={row != null}
        onOpenChange={(next) => {
          // Escape and the backdrop mean Cancel, which puts the row back the
          // way it was — the same as the Cancel button. Anything else would
          // leave a half-built row behind in the list.
          if (!next) cancelItemModal();
        }}
      >
        {row != null && itemModalIndex !== null && (
          <DialogContent
            title={itemModalIsNew ? "Add item" : "Edit item"}
            // The picker needs room for a facet rail beside a result list; the
            // quantity form does not.
            size={isPickingItem ? "xl" : "md"}
            className={cn(isPickingItem && "h-[min(680px,88vh)]")}
          >
            <DialogHeader className="items-start">
              <div className="min-w-0">
                <div className={EYEBROW}>{itemModalIsNew ? "Add item" : "Edit item"}</div>
                <DialogTitle className="mt-0.5">
                  {isPickingItem ? "Choose a product" : row.item || "Select a product"}
                </DialogTitle>
              </div>
            </DialogHeader>

            <DialogBody className={cn(isPickingItem && "overflow-hidden p-0")}>
              {isPickingItem ? (
                renderItemPicker(row, itemModalIndex)
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3.5 rounded-md border border-brand-line bg-brand-soft/40 px-3.5 py-3">
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-bold tracking-tight text-ink">
                        {row.item}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {[row.category, row.brand, row.variety, row.type]
                          .filter(Boolean)
                          .map((part) => (
                            <span
                              className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-body"
                              key={part}
                            >
                              {part}
                            </span>
                          ))}
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        setItemSearch("");
                        setIsPickingItem(true);
                      }}
                    >
                      Change item
                    </Button>
                  </div>

                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))]">
                    {/*
                      Eight fields, four of them read-only derivations. The
                      editable ones stay in the same order they have always
                      been in — Boxes, Qty, then price — because that is the
                      order the numbers arrive off a purchase order.
                    */}
                    <Field label="Boxes">
                      {(control) => (
                        <Input
                          {...control}
                          type="number"
                          name="boxes"
                          value={row.boxes}
                          onChange={(e) => handleRowChange(itemModalIndex, e)}
                        />
                      )}
                    </Field>
                    <Field label="Qty">
                      {(control) => (
                        <Input
                          {...control}
                          type="number"
                          name="qty"
                          value={row.qty}
                          onChange={(e) => handleRowChange(itemModalIndex, e)}
                        />
                      )}
                    </Field>
                    <Field label="Pcs">
                      {(control) => (
                        <Input
                          {...control}
                          type="number"
                          value={row.pcs ? Number(row.pcs).toFixed(1) : ""}
                          readOnly
                        />
                      )}
                    </Field>
                    <Field label="Ltrs">
                      {(control) => (
                        <Input {...control} type="number" value={row.ltrs} readOnly />
                      )}
                    </Field>
                    <Field label="Price List">
                      {(control) => (
                        <Input
                          {...control}
                          type="number"
                          value={row.priceListBasic}
                          readOnly
                        />
                      )}
                    </Field>
                    <Field label="Basic Price">
                      {(control) => (
                        <Input
                          {...control}
                          type="number"
                          name="basicPrice"
                          value={row.basicPrice}
                          onChange={(e) => handleRowChange(itemModalIndex, e)}
                        />
                      )}
                    </Field>
                    <Field label="Tax %">
                      {(control) => (
                        <Input
                          {...control}
                          type="text"
                          value={Number(row.tax).toFixed(2)}
                          readOnly
                        />
                      )}
                    </Field>
                    <Field label="Amount">
                      {(control) => (
                        <Input {...control} type="number" value={row.amount} readOnly />
                      )}
                    </Field>
                  </div>

                  {row.item && !isFocOrder && renderSchemePanel(row, itemModalIndex)}

                  {/* The reason this row will not confirm. It was an `alert()`,
                      which covers the fields it is talking about and has to be
                      dismissed before they can be looked at. */}
                  <FieldError message={confirmProblems[row.uid]} />
                </>
              )}
            </DialogBody>

            <DialogFooter>
              {isPickingItem && row.item && (
                <Button className="mr-auto" onClick={() => setIsPickingItem(false)}>
                  ← Back to quantities
                </Button>
              )}
              <Button onClick={cancelItemModal}>Cancel</Button>
              {!isPickingItem && (
                <Button variant="primary" onClick={confirmItemModal}>
                  {itemModalIsNew ? "Add Item" : "Save Changes"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    );
  };

  const renderItemSummaryCard = (row: SalesRow, index: number) => (
    <Fragment key={`sum-${index}`}>
      <div className="flex items-center gap-3.5 rounded-md border border-line bg-card px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-semibold text-ink">
            {row.item || "Item"}
          </span>
          <span className="text-[12px] text-subtle">
            {row.type ? `${row.type} · ` : ""}
            {row.boxes ? `${row.boxes} box · ` : ""}
            Qty {row.qty || 0}
          </span>
        </div>
        <span className="whitespace-nowrap text-[15px] font-bold text-ink">
          ₹ {Number(row.amount || 0).toFixed(2)}
        </span>
        <div className="flex flex-none gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openEditItem(index)}
            aria-label="Edit item"
            title="Edit item"
          >
            <HiOutlinePencil aria-hidden="true" />
          </Button>
          <Button
            variant="danger"
            size="icon"
            onClick={() => handleDeleteRow(index)}
            aria-label="Delete item"
            title="Delete item"
          >
            <HiOutlineTrash aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Free lines belonging to the item above. No edit/delete: they follow the
          parent, so you change them by changing it. They are indented, tinted
          and dashed so they read as part of the line above rather than as
          another thing that was ordered. */}
      {getDerivedLines(row, index).map((line) => (
        <div
          className="ml-6 flex items-center gap-3.5 rounded-md border border-dashed border-line bg-surface px-4 py-2"
          key={line.key}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[14px] font-semibold text-body">
              {line.itemName}
              <span
                className={cn(
                  "ml-2 inline-block rounded-full px-1.5 py-px align-middle text-[11px] font-semibold tracking-[0.02em]",
                  // The two kinds are tinted apart so a combo's free half and
                  // a scheme giveaway are told apart at a glance rather than
                  // by reading the sub-text.
                  line.kind === "combo" ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand",
                )}
              >
                {line.kind === "combo" ? "Combo" : "Scheme"}
              </span>
            </span>
            <span className="text-[12px] text-subtle">
              {line.note}
              {line.itemCode ? ` · ${line.itemCode}` : ""} · Qty {line.qtyLabel}
            </span>
          </div>
          <span className="whitespace-nowrap text-[15px] font-semibold text-body">₹ 0.00</span>
          {/* Keeps the amount column aligned with the paid rows above. */}
          <div className="w-control-sm flex-none" aria-hidden="true" />
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
    controlId?: string;
    children: React.ReactNode;
  }) => (
    <div className={cn("relative", config.open ? "z-[1300]" : "z-[1]")} ref={config.refEl}>
      <Input
        id={config.controlId}
        type="text"
        className="pr-8"
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
      <span
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle transition-transform",
          config.open && "rotate-180",
        )}
        aria-hidden="true"
      >
        <HiChevronDown />
      </span>
      {config.open && (
        <div className={MENU}>
          {/* A real listbox of real options. These were anonymous <button>s,
              which meant the only handle a test had was a class name — and
              a screen reader got "button" with no sense of a set. */}
          <div role="listbox" aria-label={config.placeholder} className="max-h-60 overflow-y-auto p-1.5">
            {config.children}
          </div>
        </div>
      )}
    </div>
  );

  /** The dispatch and company pickers: a button, not a search box. */
  const renderTriggerSelect = (config: {
    refEl: React.RefObject<HTMLDivElement | null>;
    open: boolean;
    toggle: () => void;
    label: string;
    selectedLabel: string;
    placeholder: string;
    controlId?: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <div
      className={cn("relative", config.open ? "z-[1300]" : "z-[1]", config.className)}
      ref={config.refEl}
    >
      <button
        type="button"
        id={config.controlId}
        className={cn(
          "flex h-control w-full cursor-pointer appearance-none items-center justify-between gap-2",
          "rounded-sm border border-line-strong bg-card px-3 text-[13px] text-ink",
          "[font-family:inherit] shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          "transition-colors hover:border-brand hover:shadow-focus",
          "focus-visible:border-brand focus-visible:outline-none focus-visible:shadow-focus",
        )}
        aria-haspopup="listbox"
        aria-expanded={config.open}
        aria-label={config.label}
        onClick={config.toggle}
      >
        <span className="min-w-0 truncate text-left">
          {config.selectedLabel || config.placeholder}
        </span>
        <HiChevronDown aria-hidden="true" className="flex-none text-subtle" />
      </button>
      {config.open && (
        <div className={MENU}>
          <div role="listbox" aria-label={config.label} className="max-h-60 overflow-y-auto p-1.5">
            {config.children}
          </div>
        </div>
      )}
    </div>
  );

  /**
   * The props every option in every picker carries.
   *
   * `role="option"` + `aria-selected`, not just a class: these were anonymous
   * `<button>`s, so a screen reader heard "button" with no sense of belonging
   * to a set, and a test had nothing to hold but a class name.
   */
  const optionProps = (selected: boolean) => ({
    role: "option" as const,
    "aria-selected": selected,
    className: cn(
      OPTION,
      selected && "bg-surface shadow-[inset_3px_0_0_var(--color-line-strong)]",
    ),
  });

  const emptyOption = (text: string) => (
    <div className="px-3 py-3.5 text-[13px] text-subtle">{text}</div>
  );

  const renderStepParty = () => (
    <div className={cn(PANEL, "p-5 motion-safe:animate-page")}>
      <div className="mb-4.5">
        <div className={EYEBROW}>Step 1</div>
        <h2 className="m-0 mt-1 text-[19px] font-bold tracking-tight text-ink">
          Party Information
        </h2>
        <p className="m-0 mt-1 text-[13px] text-subtle">
          Choose the party — bill-to and ship-to fill in automatically.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Party Name" span="full" error={problems.header.parties}>
          {(control) =>
            renderCombo({
              refEl: partyDropdownRef,
              open: partyDropdownOpen,
              setOpen: setPartyDropdownOpen,
              search: partySearch,
              setSearch: setPartySearch,
              selectedLabel: selectedPartyLabel,
              placeholder: "Search party...",
              controlId: control.id,
              children:
                filteredParties.length > 0 ? (
                  filteredParties.map((party) => (
                    <button
                      type="button"
                      key={`${party.value}-${party.category || ""}`}
                      {...optionProps(
                        party.value === formData.parties &&
                          String(party.category || "").toUpperCase() ===
                            selectedPartyCategory.toUpperCase(),
                      )}
                      onClick={() => handlePartySelect(party.value, party.category || "")}
                    >
                      <span className="text-[13px] font-medium text-ink">{party.label}</span>
                      <span className="text-[11px] text-subtle">
                        {[party.value, party.category].filter(Boolean).join(" | ")}
                      </span>
                    </button>
                  ))
                ) : (
                  emptyOption("No parties found")
                ),
            })
          }
        </Field>

        <Field label="Bill To Address" error={problems.header.billAddress}>
          {(control) =>
            renderCombo({
              refEl: billDropdownRef,
              open: billDropdownOpen,
              setOpen: setBillDropdownOpen,
              search: billSearch,
              setSearch: setBillSearch,
              selectedLabel: selectedBillAddressLabel,
              placeholder: "Search bill to...",
              controlId: control.id,
              children:
                filteredBillAddresses.length > 0 ? (
                  filteredBillAddresses.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      {...optionProps(String(b.id) === formData.billAddress)}
                      onClick={() => handleBillAddressSelect(String(b.id))}
                    >
                      <span className="text-[13px] font-medium text-ink">
                        {b.address_name || b.full_address || b.address_id}
                      </span>
                    </button>
                  ))
                ) : (
                  emptyOption("No addresses found")
                ),
            })
          }
        </Field>

        <Field label="Ship To Address" error={problems.header.shipAddress}>
          {(control) =>
            renderCombo({
              refEl: shipDropdownRef,
              open: shipDropdownOpen,
              setOpen: setShipDropdownOpen,
              search: shipSearch,
              setSearch: setShipSearch,
              selectedLabel: selectedShipAddressLabel,
              placeholder: "Search ship to...",
              controlId: control.id,
              children:
                filteredShipAddresses.length > 0 ? (
                  filteredShipAddresses.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      {...optionProps(String(s.id) === formData.shipAddress)}
                      onClick={() => handleShipAddressSelect(String(s.id))}
                    >
                      <span className="text-[13px] font-medium text-ink">
                        {s.address_name || s.full_address || s.address_id}
                      </span>
                    </button>
                  ))
                ) : (
                  emptyOption("No addresses found")
                ),
            })
          }
        </Field>

        <Field label="Dispatch From">
          {(control) => (
            <div className="relative flex items-center gap-2">
              {renderTriggerSelect({
                refEl: dispatchDropdownRef,
                open: dispatchDropdownOpen,
                toggle: () => setDispatchDropdownOpen((prev) => !prev),
                label: "Dispatch From",
                selectedLabel: selectedDispatchLabel,
                placeholder: "--select--",
                controlId: control.id,
                className: "min-w-0 flex-1",
                children:
                  branch.length > 0 ? (
                    branch.map((d) => (
                      <button
                        type="button"
                        key={d.bpl_id}
                        {...optionProps(String(d.bpl_id) === formData.dispatch)}
                        onClick={() => handleDispatchSelect(String(d.bpl_id))}
                      >
                        <span className="text-[13px] font-medium text-ink">{d.bpl_name}</span>
                      </button>
                    ))
                  ) : (
                    emptyOption("No dispatch locations found")
                  ),
              })}
              <div className="relative flex-none" ref={dispatchInfoRef}>
                <button
                  type="button"
                  className={cn(
                    "size-[30px] cursor-pointer appearance-none rounded-full border border-line-strong",
                    "bg-surface font-serif text-[13px] font-bold italic text-subtle",
                    "transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand",
                    "focus-visible:outline-none focus-visible:shadow-focus",
                  )}
                  onClick={() => setDispatchInfoOpen((prev) => !prev)}
                  aria-label="Dispatch location details"
                  aria-expanded={dispatchInfoOpen}
                  title="Dispatch location details"
                >
                  i
                </button>
                {dispatchInfoOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-60 rounded-[10px] border border-line bg-card p-3.5 shadow-panel">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">
                      Dispatch location
                    </div>
                    {selectedDispatch ? (
                      <dl className="m-0 flex flex-col gap-[7px]">
                        <div className="flex justify-between gap-3">
                          <dt className="text-[12px] text-subtle">Name</dt>
                          <dd className="m-0 text-right text-[12px] font-semibold text-ink">
                            {selectedDispatch.bpl_name || "—"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-[12px] text-subtle">Branch ID</dt>
                          <dd className="m-0 text-right text-[12px] font-semibold text-ink">
                            {selectedDispatch.bpl_id ?? "—"}
                          </dd>
                        </div>
                        {selectedDispatch.address && (
                          <div className="flex justify-between gap-3">
                            <dt className="text-[12px] text-subtle">Address</dt>
                            <dd className="m-0 text-right text-[12px] font-semibold text-ink">
                              {selectedDispatch.address}
                            </dd>
                          </div>
                        )}
                      </dl>
                    ) : (
                      <p className="m-0 text-[12px] leading-relaxed text-subtle">
                        This is the default dispatch branch for your orders.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <input type="hidden" name="dispatch" value={formData.dispatch} />
            </div>
          )}
        </Field>

        <Field label="Date">
          {(control) => (
            <Input {...control} type="date" name="date" value={formData.date} readOnly />
          )}
        </Field>

        <Field label="Delivery Date" error={problems.header.Deliverydate}>
          {(control) => (
            <Input
              {...control}
              type="date"
              name="Deliverydate"
              value={formData.Deliverydate}
              onChange={handleChange}
            />
          )}
        </Field>
      </div>
    </div>
  );

  const renderStepItems = () => (
    <div className={cn(PANEL, "p-5 motion-safe:animate-page")}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className={EYEBROW}>Step 2</div>
          <h2 className="m-0 mt-1 text-[19px] font-bold tracking-tight text-ink">Items</h2>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[12px] text-subtle">
            {/* Counts the free lines too, so the number matches what is listed. */}
            {visibleLineCount} item{visibleLineCount === 1 ? "" : "s"}
          </span>
          <strong className="text-[18px] font-bold text-ink">₹ {totalAmount.toFixed(2)}</strong>
        </div>
      </div>
      {confirmedRows.length > 0 ? (
        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (row.confirmed ? renderItemSummaryCard(row, index) : null))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-md border-[1.5px] border-dashed border-line-strong bg-surface px-4 py-9 text-center">
          <p className="m-0 text-[14px] font-semibold text-ink-soft">No items added yet.</p>
          <span className="text-[12px] text-subtle">
            Click “Add Item” to start building this order.
          </span>
        </div>
      )}
      <button
        type="button"
        className={cn(
          "mt-3.5 w-full cursor-pointer appearance-none rounded-md border-[1.5px] border-dashed border-line-strong",
          "bg-surface p-3 text-[13px] font-semibold text-brand [font-family:inherit]",
          "transition-colors hover:border-brand hover:bg-brand-soft",
          "focus-visible:outline-none focus-visible:shadow-focus",
        )}
        onClick={openAddItem}
      >
        + Add Item
      </button>
    </div>
  );

  const renderStepSummary = () => (
    <div className={cn(PANEL, "p-5 motion-safe:animate-page")}>
      <div className="mb-4.5">
        <div className={EYEBROW}>Step 3</div>
        <h2 className="m-0 mt-1 text-[19px] font-bold tracking-tight text-ink">Order Summary</h2>
      </div>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
        {canEditPoNumber && (
          <Field
            label={poField.label}
            required={poField.required}
            error={problems.header.poNumber}
          >
            {(control) => (
              <Input
                {...control}
                type="text"
                name="poNumber"
                value={formData.poNumber}
                onChange={handleChange}
                placeholder="Enter PO number"
                // Bound, not hardcoded. Inert today because renderWizard() is
                // rendered outside the <form>, but it goes live the moment a
                // form element wraps this — see the 3.4 migration notes.
                required={poField.required}
              />
            )}
          </Field>
        )}
        {isMartOrder && <WarehouseField form={form} />}
        <Field label="Company">
          {(control) =>
            renderTriggerSelect({
              refEl: companyDropdownRef,
              open: companyDropdownOpen,
              toggle: () => setCompanyDropdownOpen((prev) => !prev),
              label: "Company",
              selectedLabel: selectedCompanyLabel,
              placeholder: "Select Company",
              controlId: control.id,
              children:
                company.length > 0 ? (
                  company.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      {...optionProps(String(item.id) === formData.company)}
                      onClick={() => handleCompanySelect(String(item.id))}
                    >
                      <span className="text-[13px] font-medium text-ink">{item.name}</span>
                    </button>
                  ))
                ) : (
                  emptyOption("No companies found")
                ),
            })
          }
        </Field>
      </div>

      <div className="my-4.5 overflow-hidden rounded-md border border-line">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-[13px] text-subtle">Total</span>
          <strong className="text-[14px] font-semibold text-ink">
            ₹ {totalAmount.toFixed(2)}
          </strong>
        </div>
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-[13px] text-subtle">Tax</span>
          <strong className="text-[14px] font-semibold text-ink">₹ {taxAmount.toFixed(2)}</strong>
        </div>
        <div className="flex items-center justify-between bg-brand-soft px-4 py-2.5">
          <span className="text-[13px] text-brand">Grand Total</span>
          <strong className="text-[18px] font-bold text-brand">₹ {grandTotal.toFixed(2)}</strong>
        </div>
      </div>

      <Field label="Comment" span="full">
        {(control) => (
          <Textarea
            {...control}
            name="comment"
            rows={3}
            placeholder="Add a note..."
            value={formData.comment}
            onChange={(e) => setFormData((prev) => ({ ...prev, comment: e.target.value }))}
          />
        )}
      </Field>
    </div>
  );

  const renderStepReview = () => (
    <div className={cn(PANEL, "p-5 motion-safe:animate-page")}>
      <div className="mb-4.5">
        <div className={EYEBROW}>Step 4</div>
        <h2 className="m-0 mt-1 text-[19px] font-bold tracking-tight text-ink">
          Review &amp; Submit
        </h2>
        <p className="m-0 mt-1 text-[13px] text-subtle">Confirm the details below before saving.</p>
      </div>
      {/* Everything still wrong, on the step that has the Save button. The
          individual messages are on steps 1 and 3, which the user has left by
          the time they press it — a message they have to navigate back to is
          only half an answer. */}
      <ProblemSummary problems={problems} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 rounded-md border border-brand-line bg-brand-soft px-4.5 py-4">
          <span className={EYEBROW}>Party</span>
          <strong className="text-[20px] font-extrabold tracking-tight text-ink">
            {selectedPartyLabel || "—"}
          </strong>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { label: "Bill To", value: selectedBillAddressLabel },
            { label: "Ship To", value: selectedShipAddressLabel },
            { label: "Dispatch", value: selectedDispatchLabel },
            { label: "Delivery Date", value: formData.Deliverydate },
          ].map((entry) => (
            <div className="flex flex-col gap-0.5" key={entry.label}>
              <span className="text-[11px] font-semibold uppercase tracking-[0.02em] text-subtle">
                {entry.label}
              </span>
              <em className="text-[13px] font-medium not-italic text-ink-soft">
                {entry.value || "—"}
              </em>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-md border border-line">
          <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-subtle">
              Items
            </span>
            <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-subtle">
              {visibleLineCount}
            </span>
          </div>
          {/* Free lines are listed here too. This is the last screen before the
              order is saved, so it has to match what actually gets sent. */}
          {rows.map((row, index) =>
            row.confirmed ? (
              <Fragment key={`rev-${index}`}>
                <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                  <strong className="min-w-0 flex-1 text-[14px] font-bold text-ink">
                    {row.item || "Item"}
                  </strong>
                  <span className="text-[12px] text-subtle">Qty {row.qty || 0}</span>
                  <span className="text-[12px] font-bold text-ink">
                    ₹ {Number(row.amount || 0).toFixed(2)}
                  </span>
                </div>
                {getDerivedLines(row, index).map((line) => (
                  <div
                    className="flex items-center gap-3 border-b border-line bg-surface py-2.5 pl-[34px] pr-4 last:border-b-0"
                    key={line.key}
                  >
                    <strong className="min-w-0 flex-1 text-[14px] font-semibold text-body">
                      {line.itemName}
                      <span
                        className={cn(
                          "ml-2 inline-block rounded-full px-1.5 py-px align-middle text-[11px] font-semibold",
                          line.kind === "combo"
                            ? "bg-ok-soft text-ok"
                            : "bg-brand-soft text-brand",
                        )}
                      >
                        {line.kind === "combo" ? "Combo" : "Scheme"}
                      </span>
                    </strong>
                    <span className="text-[12px] text-subtle">Qty {line.qtyLabel}</span>
                    <span className="text-[12px] font-semibold text-body">₹ 0.00</span>
                  </div>
                ))}
              </Fragment>
            ) : null,
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          {formData.poNumber && (
            <div className="flex items-start justify-between gap-4">
              <span className="flex-none text-[12px] font-semibold uppercase tracking-[0.02em] text-subtle">
                {poField.label}
              </span>
              <strong className="text-right text-[14px] font-bold text-ink">
                {formData.poNumber}
              </strong>
            </div>
          )}
          {formData.comment && (
            <div className="flex items-start justify-between gap-4">
              <span className="flex-none text-[12px] font-semibold uppercase tracking-[0.02em] text-subtle">
                Comments
              </span>
              <strong className="text-right text-[14px] font-bold text-ink">
                {formData.comment}
              </strong>
            </div>
          )}
          <div className="flex items-start justify-between gap-4 border-t border-dashed border-line-strong pt-3">
            <span className="flex-none text-[12px] font-semibold uppercase tracking-[0.02em] text-subtle">
              Grand Total
            </span>
            <strong className="text-right text-[20px] font-bold text-brand">
              ₹ {grandTotal.toFixed(2)}
            </strong>
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

  /**
   * The stepper.
   *
   * An ordered list rather than a row of buttons, and each node carries
   * `aria-current="step"` — the tick and the blue fill were the only thing
   * saying where you were, which is nothing at all to a screen reader.
   */
  const renderStepper = () => (
    <ol className={cn(PANEL, "m-0 flex list-none items-center gap-1.5 px-4.5 py-3.5")}>
      {wizardSteps.map((step, i) => {
        const active = currentStep === step.n;
        const complete = currentStep > step.n;
        return (
          <Fragment key={step.n}>
            <li className="flex-none">
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                className={cn(
                  "inline-flex cursor-pointer appearance-none items-center gap-2.5 rounded-lg border-0",
                  "bg-transparent px-1.5 py-1 [font-family:inherit] transition-opacity",
                  "focus-visible:outline-none focus-visible:shadow-focus",
                  "disabled:cursor-default disabled:opacity-55",
                )}
                onClick={() => {
                  if (step.n < currentStep) setCurrentStep(step.n);
                }}
                disabled={step.n > currentStep}
              >
                <span
                  className={cn(
                    "inline-flex size-[26px] flex-shrink-0 items-center justify-center rounded-full",
                    "border-[1.5px] text-[12px] font-bold",
                    complete && "border-transparent bg-brand text-white",
                    active && "border-brand bg-brand-soft text-brand",
                    !complete && !active && "border-transparent bg-surface-strong text-subtle",
                  )}
                >
                  {complete ? "✓" : step.n}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-[13px] font-semibold max-sm:hidden",
                    active ? "text-ink" : complete ? "text-ink-soft" : "text-subtle",
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
            {i < wizardSteps.length - 1 && (
              <li
                aria-hidden="true"
                className={cn(
                  "h-0.5 min-w-4 flex-1 rounded-sm",
                  complete ? "bg-brand" : "bg-line",
                )}
              />
            )}
          </Fragment>
        );
      })}
    </ol>
  );

  const renderWizardFooter = () => (
    <div
      className={cn(
        PANEL,
        "sticky bottom-0 flex items-center gap-3 px-4.5 py-3.5",
        // Translucent, so the content scrolling under it stays half-visible
        // rather than being hidden by a solid bar.
        "bg-card/90 backdrop-blur-[8px] shadow-[0_-2px_16px_rgba(15,23,42,0.05)]",
      )}
    >
      {currentStep > 1 ? (
        <Button onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}>Back</Button>
      ) : (
        <Button onClick={handleClearForm}>Clear</Button>
      )}
      <div className="flex-1" />
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
      <Button
        onClick={handleSaveDraft}
        disabled={isSaving || isSavingDraft || !formData.parties}
      >
        {isSavingDraft ? "Saving Draft..." : "Save as Draft"}
      </Button>
      {currentStep < 4 ? (
        <Button
          variant="primary"
          disabled={!canAdvance(currentStep)}
          onClick={() => {
            if (canAdvance(currentStep)) setCurrentStep((s) => Math.min(4, s + 1));
          }}
        >
          Continue
        </Button>
      ) : (
        <Button
          variant="primary"
          disabled={isSaving || confirmedRows.length === 0}
          onClick={handleWizardSubmit}
        >
          {isSaving ? "Saving..." : "Save Order"}
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4.5">
      {renderStepper()}
      <div className="min-h-[200px]">
        {currentStep === 1 && renderStepParty()}
        {currentStep === 2 && renderStepItems()}
        {currentStep === 3 && renderStepSummary()}
        {currentStep === 4 && renderStepReview()}
      </div>
      {renderWizardFooter()}
      {renderItemModal()}
    </div>
  );
}
