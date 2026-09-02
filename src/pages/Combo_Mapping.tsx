import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSapProducts } from "../lib/sapQueries";
import { userService } from "../services/userService";
import type { ComboMapping } from "../services/userService";
import { messageFrom } from "@/lib/apiError";
import "../styles/Combo_Mapping.css";

type CatalogueProduct = {
  item_code: string;
  item_name: string;
  category: string;
  sal_factor2?: string | number | null;
};

const asText = (value: unknown) => String(value ?? "").trim();
const comboKey = (combo: Pick<ComboMapping, "item_code" | "category">) =>
  `${combo.item_code}||${combo.category}`;

/** The half of a combo name that names the free product: everything after "+". */
const freeHalfOf = (itemName: string) => asText(itemName.split("+").slice(1).join("+"));

/** The half that names the paid product: everything before the first "+". */
const parentHalfOf = (itemName: string) => asText(itemName.split("+")[0] || "");

/** Which half of the combo the product list is currently choosing for. */
type PickerTarget = "parent" | "free";

/** Stable empty, so `visibleCombos` settles. */
const NO_COMBOS: ComboMapping[] = [];

export default function Combo_Mapping() {
  const queryClient = useQueryClient();
  const {
    data: combos = NO_COMBOS,
    isPending: isLoading,
    isError: combosFailed,
  } = useQuery({
    queryKey: ["combo-mappings"],
    queryFn: () => userService.getComboMappings(),
  });
  const loadError = combosFailed
    ? "Could not load combo packs. Check that you are signed in and try again."
    : "";

  /* Shared ["sap","products"] key. The filter is this page's own business: a
     combo can never be its own free half, so combos stay out of the picker. */
  const { items: allProducts } = useSapProducts();
  const products = useMemo(
    () =>
      (allProducts as unknown as CatalogueProduct[]).filter(
        (p) => !asText(p.item_name).includes("+"),
      ),
    [allProducts],
  );
  const [search, setSearch] = useState("");
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Editor state for the one combo currently open.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftParentItem, setDraftParentItem] = useState("");
  const [draftFreeItem, setDraftFreeItem] = useState("");
  // One product list serves both halves; this says which one a click fills.
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>("parent");
  const [draftQty, setDraftQty] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);

  const loadCombos = () => queryClient.invalidateQueries({ queryKey: ["combo-mappings"] });

  const visibleCombos = useMemo(() => {
    const term = search.trim().toLowerCase();
    return combos.filter((combo) => {
      if (showUnmappedOnly && combo.parent_item_code && combo.free_item_code) return false;
      if (!term) return true;
      return (
        combo.item_name?.toLowerCase().includes(term) ||
        combo.item_code.toLowerCase().includes(term) ||
        combo.category.toLowerCase().includes(term) ||
        (combo.free_item?.item_name || "").toLowerCase().includes(term) ||
        (combo.free_item_code || "").toLowerCase().includes(term) ||
        (combo.parent_item?.item_name || "").toLowerCase().includes(term) ||
        (combo.parent_item_code || "").toLowerCase().includes(term)
      );
    });
  }, [combos, search, showUnmappedOnly]);

  const mappedCount = combos.filter(
    (combo) => combo.parent_item_code && combo.free_item_code,
  ).length;

  // Products whose name shares words with the combo's post-"+" half float to the
  // top, so the likely free item is the first thing in the list.
  const pickerResults = useMemo(() => {
    const combo = combos.find((c) => comboKey(c) === editingKey);
    const term = pickerSearch.trim().toLowerCase();

    const matches = term
      ? products.filter(
          (p) =>
            p.item_name?.toLowerCase().includes(term) || p.item_code?.toLowerCase().includes(term),
        )
      : products;

    if (term || !combo) return matches.slice(0, 60);

    const hintWords = (
      pickerTarget === "parent"
        ? parentHalfOf(combo.item_name || "")
        : freeHalfOf(combo.item_name || "")
    )
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2 && !/^\d+$/.test(word));

    const score = (product: CatalogueProduct) => {
      const name = (product.item_name || "").toLowerCase();
      return hintWords.reduce((sum, word) => sum + (name.includes(word) ? 1 : 0), 0);
    };

    return [...matches]
      .map((product) => ({ product, score: score(product) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map((entry) => entry.product);
  }, [combos, editingKey, pickerSearch, pickerTarget, products]);

  const openEditor = (combo: ComboMapping) => {
    setEditingKey(comboKey(combo));
    setDraftParentItem(combo.parent_item_code || "");
    setDraftFreeItem(combo.free_item_code || "");
    setPickerTarget("parent");
    setDraftQty(combo.free_qty_per_unit != null ? String(combo.free_qty_per_unit) : "");
    setPickerSearch("");
    setNotice(null);
    window.setTimeout(() => pickerInputRef.current?.focus(), 0);
  };

  const closeEditor = () => {
    setEditingKey(null);
    setDraftParentItem("");
    setDraftFreeItem("");
    setPickerTarget("parent");
    setDraftQty("");
    setPickerSearch("");
  };

  const save = async (combo: ComboMapping, parentItemCode: string, freeItemCode: string) => {
    const key = comboKey(combo);
    setSavingKey(key);
    setNotice(null);
    try {
      const response = await userService.saveComboMapping({
        item_code: combo.item_code,
        category: combo.category,
        parent_item_code: parentItemCode,
        free_item_code: freeItemCode,
        free_qty_per_unit: draftQty.trim() ? Number(draftQty) : null,
      });
      setNotice({ tone: "ok", text: response?.message || "Mapping saved" });
      closeEditor();
      await loadCombos();
    } catch (error) {
      console.error("Error saving combo mapping:", error);
      setNotice({
        tone: "error",
        text: messageFrom(error, "Could not save the mapping"),
      });
    } finally {
      setSavingKey(null);
    }
  };

  const clearMapping = async (combo: ComboMapping) => {
    if (!window.confirm(`Remove the parent and free item from ${combo.item_name}?`)) return;
    const key = comboKey(combo);
    setSavingKey(key);
    setNotice(null);
    try {
      const response = await userService.saveComboMapping({
        item_code: combo.item_code,
        category: combo.category,
        parent_item_code: "",
        free_item_code: "",
        free_qty_per_unit: null,
      });
      setNotice({ tone: "ok", text: response?.message || "Mapping cleared" });
      closeEditor();
      await loadCombos();
    } catch (error) {
      console.error("Error clearing combo mapping:", error);
      setNotice({
        tone: "error",
        text: messageFrom(error, "Could not clear the mapping"),
      });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="app-page">
      <div className="cmb-card">
        <div className="cmb-head">
          <h1 className="cmb-title">Combo Mapping</h1>
          <p className="cmb-intro">
            A combo pack is named "A + B" and carries B free of cost. Map each combo to the product
            it gives away — adding the combo to a sales order then adds a zero-priced line for that
            product with the same number of pieces.
          </p>
        </div>

        <div className="cmb-filters">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search combo or free item..."
            className="cmb-search"
          />
          <label className="cmb-toggle">
            <input
              type="checkbox"
              checked={showUnmappedOnly}
              onChange={(event) => setShowUnmappedOnly(event.target.checked)}
            />
            Unmapped only
          </label>
          <span className="cmb-count">
            {mappedCount} of {combos.length} mapped
          </span>
        </div>

        {notice && (
          <div className={`cmb-notice cmb-notice--${notice.tone}`}>{notice.text}</div>
        )}
      </div>

      <div className="cmb-card">
        {isLoading ? (
          <div className="cmb-state">Loading combo packs...</div>
        ) : loadError ? (
          <div className="cmb-state cmb-state--error">{loadError}</div>
        ) : visibleCombos.length === 0 ? (
          <div className="cmb-state">
            {combos.length === 0
              ? "No combo packs are assigned to any party yet."
              : "No combo packs match this filter."}
          </div>
        ) : (
          <div className="cmb-rows">
            {visibleCombos.map((combo) => {
              const key = comboKey(combo);
              const isEditing = editingKey === key;
              const isSaving = savingKey === key;
              // Both halves or neither -- the API refuses a half-filled mapping
              // because ordering needs a parent to price and a free item to give.
              const bothHalvesChosen = Boolean(draftParentItem && draftFreeItem);

              return (
                <div key={key} className={`cmb-row${isEditing ? " is-editing" : ""}`}>
                  <div className="cmb-row-main">
                    <div className="cmb-col cmb-col--combo">
                      <div className="cmb-label">Combo</div>
                      <div className="cmb-name">{combo.item_name}</div>
                      <div className="cmb-sub">
                        {combo.item_code} · {combo.category} · {combo.party_count}{" "}
                        {combo.party_count === 1 ? "party" : "parties"}
                      </div>
                    </div>

                    <div className="cmb-col">
                      <div className="cmb-label">Parent (paid) item</div>
                      {combo.parent_item_code ? (
                        <>
                          <div className="cmb-name cmb-name--parent">
                            {combo.parent_item?.item_name ||
                              `${combo.parent_item_code} (not in SAP)`}
                          </div>
                          <div className="cmb-sub">{combo.parent_item_code} · priced line</div>
                        </>
                      ) : (
                        <div className="cmb-unmapped">Not mapped</div>
                      )}
                    </div>

                    <div className="cmb-col">
                      <div className="cmb-label">Free item</div>
                      {combo.free_item_code ? (
                        <>
                          <div className="cmb-name cmb-name--free">
                            {combo.free_item?.item_name || `${combo.free_item_code} (not in SAP)`}
                          </div>
                          <div className="cmb-sub">
                            {combo.free_item_code} ·{" "}
                            {combo.free_qty_per_unit
                              ? `${combo.free_qty_per_unit} free per piece`
                              : "same pieces as the combo"}
                          </div>
                        </>
                      ) : (
                        <div className="cmb-unmapped">Not mapped</div>
                      )}
                      {combo.is_partially_mapped && (
                        <div className="cmb-partial">
                          Only {combo.mapped_party_count} of {combo.party_count} parties carry this
                          mapping. Saving applies it to all of them.
                        </div>
                      )}
                    </div>

                    <div className="cmb-actions">
                      <button
                        type="button"
                        onClick={() => (isEditing ? closeEditor() : openEditor(combo))}
                        disabled={isSaving}
                        className="cmb-btn"
                      >
                        {isEditing ? "Cancel" : combo.free_item_code ? "Change" : "Map"}
                      </button>
                      {combo.free_item_code && (
                        <button
                          type="button"
                          onClick={() => clearMapping(combo)}
                          disabled={isSaving}
                          className="cmb-btn cmb-btn--clear"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="cmb-editor">
                      {/* Two halves, picked one at a time from the list below.
                          Nothing is pre-selected: the names are inconsistent
                          enough that a guess is wrong often enough to matter. */}
                      <div className="cmb-targets">
                        {(
                          [
                            ["parent", "Parent (paid)", draftParentItem],
                            ["free", "Free", draftFreeItem],
                          ] as [PickerTarget, string, string][]
                        ).map(([target, label, value]) => {
                          const active = pickerTarget === target;
                          return (
                            <button
                              key={target}
                              type="button"
                              onClick={() => {
                                setPickerTarget(target);
                                setPickerSearch("");
                                window.setTimeout(() => pickerInputRef.current?.focus(), 0);
                              }}
                              className={`cmb-target${active ? " is-active" : ""}`}
                            >
                              {label}: <span className="cmb-target-value">{value || "not selected"}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="cmb-editor-fields">
                        <input
                          ref={pickerInputRef}
                          type="text"
                          value={pickerSearch}
                          onChange={(event) => setPickerSearch(event.target.value)}
                          placeholder={`Search the ${
                            pickerTarget === "parent" ? "paid (parent)" : "free"
                          } product — suggestions match "${
                            (pickerTarget === "parent"
                              ? parentHalfOf(combo.item_name || "")
                              : freeHalfOf(combo.item_name || "")) || combo.item_name
                          }"`}
                          className="cmb-picker-search"
                        />
                        <div className="cmb-qty-wrap">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draftQty}
                            onChange={(event) => setDraftQty(event.target.value)}
                            placeholder="Free per piece (blank = 1)"
                            className="cmb-qty"
                          />
                        </div>
                      </div>

                      <div className="cmb-picker">
                        {pickerResults.length === 0 ? (
                          <div className="cmb-picker-empty">
                            No suggestions. Type a product name or item code to search.
                          </div>
                        ) : (
                          pickerResults.map((product) => {
                            const activeValue =
                              pickerTarget === "parent" ? draftParentItem : draftFreeItem;
                            const isChosen = activeValue === product.item_code;
                            return (
                              <button
                                key={`${product.item_code}-${product.category}`}
                                type="button"
                                onClick={() =>
                                  pickerTarget === "parent"
                                    ? setDraftParentItem(product.item_code)
                                    : setDraftFreeItem(product.item_code)
                                }
                                className={`cmb-picker-row${isChosen ? " is-chosen" : ""}`}
                              >
                                <span className="cmb-picker-name">{product.item_name}</span>
                                <span className="cmb-picker-meta">
                                  {"  "}
                                  {product.item_code} · {product.category}
                                  {product.sal_factor2
                                    ? ` · ${Number(product.sal_factor2)} per box`
                                    : ""}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div className="cmb-save-bar">
                        <button
                          type="button"
                          onClick={() => save(combo, draftParentItem, draftFreeItem)}
                          disabled={!bothHalvesChosen || isSaving}
                          className={`cmb-btn-save${bothHalvesChosen ? " is-ready" : ""}`}
                        >
                          {isSaving ? "Saving..." : "Save mapping"}
                        </button>
                        <span className="cmb-save-hint">
                          {bothHalvesChosen
                            ? `Splits into ${draftParentItem} + ${draftFreeItem} for all ${
                                combo.party_count
                              } ${combo.party_count === 1 ? "party" : "parties"}`
                            : !draftParentItem && !draftFreeItem
                              ? "Pick the paid product, then the one it gives away"
                              : !draftParentItem
                                ? "Still needs the paid (parent) product"
                                : "Still needs the free product"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
