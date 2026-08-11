import { useEffect, useMemo, useRef, useState } from "react";
import { sapService } from "../services/sapService";
import { userService } from "../services/userService";
import type { ComboMapping } from "../services/userService";

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

export default function Combo_Mapping() {
  const [combos, setCombos] = useState<ComboMapping[]>([]);
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Editor state for the one combo currently open.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftFreeItem, setDraftFreeItem] = useState("");
  const [draftQty, setDraftQty] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);

  const loadCombos = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      setCombos(await userService.getComboMappings());
    } catch (error) {
      console.error("Error loading combo mappings:", error);
      setLoadError("Could not load combo packs. Check that you are signed in and try again.");
      setCombos([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCombos();

    const loadProducts = async () => {
      try {
        const data = await sapService.getProducts();
        const list = Array.isArray(data) ? data : data?.results || [];
        // A combo can never be its own free half, so keep them out of the picker.
        setProducts(list.filter((p: CatalogueProduct) => !asText(p.item_name).includes("+")));
      } catch (error) {
        console.error("Error loading products:", error);
        setProducts([]);
      }
    };

    void loadProducts();
  }, []);

  const visibleCombos = useMemo(() => {
    const term = search.trim().toLowerCase();
    return combos.filter((combo) => {
      if (showUnmappedOnly && combo.free_item_code) return false;
      if (!term) return true;
      return (
        combo.item_name?.toLowerCase().includes(term) ||
        combo.item_code.toLowerCase().includes(term) ||
        combo.category.toLowerCase().includes(term) ||
        (combo.free_item?.item_name || "").toLowerCase().includes(term) ||
        (combo.free_item_code || "").toLowerCase().includes(term)
      );
    });
  }, [combos, search, showUnmappedOnly]);

  const mappedCount = combos.filter((combo) => combo.free_item_code).length;

  // Products whose name shares words with the combo's post-"+" half float to the
  // top, so the likely free item is the first thing in the list.
  const pickerResults = useMemo(() => {
    const combo = combos.find((c) => comboKey(c) === editingKey);
    const term = pickerSearch.trim().toLowerCase();

    const matches = term
      ? products.filter(
          (p) =>
            p.item_name?.toLowerCase().includes(term) ||
            p.item_code?.toLowerCase().includes(term),
        )
      : products;

    if (term || !combo) return matches.slice(0, 60);

    const hintWords = freeHalfOf(combo.item_name || "")
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
  }, [combos, editingKey, pickerSearch, products]);

  const openEditor = (combo: ComboMapping) => {
    setEditingKey(comboKey(combo));
    setDraftFreeItem(combo.free_item_code || "");
    setDraftQty(combo.free_qty_per_unit != null ? String(combo.free_qty_per_unit) : "");
    setPickerSearch("");
    setNotice(null);
    window.setTimeout(() => pickerInputRef.current?.focus(), 0);
  };

  const closeEditor = () => {
    setEditingKey(null);
    setDraftFreeItem("");
    setDraftQty("");
    setPickerSearch("");
  };

  const save = async (combo: ComboMapping, freeItemCode: string) => {
    const key = comboKey(combo);
    setSavingKey(key);
    setNotice(null);
    try {
      const response = await userService.saveComboMapping({
        item_code: combo.item_code,
        category: combo.category,
        free_item_code: freeItemCode,
        free_qty_per_unit: draftQty.trim() ? Number(draftQty) : null,
      });
      setNotice({ tone: "ok", text: response?.message || "Mapping saved" });
      closeEditor();
      await loadCombos();
    } catch (error: any) {
      console.error("Error saving combo mapping:", error);
      setNotice({
        tone: "error",
        text: error?.response?.data?.message || "Could not save the mapping",
      });
    } finally {
      setSavingKey(null);
    }
  };

  const clearMapping = async (combo: ComboMapping) => {
    if (!window.confirm(`Remove the free item from ${combo.item_name}?`)) return;
    const key = comboKey(combo);
    setSavingKey(key);
    setNotice(null);
    try {
      const response = await userService.saveComboMapping({
        item_code: combo.item_code,
        category: combo.category,
        free_item_code: "",
        free_qty_per_unit: null,
      });
      setNotice({ tone: "ok", text: response?.message || "Mapping cleared" });
      closeEditor();
      await loadCombos();
    } catch (error: any) {
      console.error("Error clearing combo mapping:", error);
      setNotice({
        tone: "error",
        text: error?.response?.data?.message || "Could not clear the mapping",
      });
    } finally {
      setSavingKey(null);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    marginBottom: "24px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#94a3b8",
  };

  return (
    <div className="app-page">
      <div style={cardStyle}>
        <div style={{ marginBottom: "20px" }}>
          <h1
            style={{
              margin: "0 0 4px",
              fontSize: "24px",
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Combo Mapping
          </h1>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
            A combo pack is named "A + B" and carries B free of cost. Map each combo to
            the product it gives away — adding the combo to a sales order then adds a
            zero-priced line for that product with the same number of pieces.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
            padding: "14px 16px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search combo or free item..."
            style={{
              flex: "1 1 260px",
              padding: "9px 12px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "#334155",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={showUnmappedOnly}
              onChange={(event) => setShowUnmappedOnly(event.target.checked)}
            />
            Unmapped only
          </label>
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            {mappedCount} of {combos.length} mapped
          </span>
        </div>

        {notice && (
          <div
            style={{
              marginTop: "16px",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              background: notice.tone === "ok" ? "#dcfce7" : "#fee2e2",
              color: notice.tone === "ok" ? "#15803d" : "#b91c1c",
            }}
          >
            {notice.text}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        {isLoading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
            Loading combo packs...
          </div>
        ) : loadError ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#b91c1c" }}>{loadError}</div>
        ) : visibleCombos.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
            {combos.length === 0
              ? "No combo packs are assigned to any party yet."
              : "No combo packs match this filter."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {visibleCombos.map((combo) => {
              const key = comboKey(combo);
              const isEditing = editingKey === key;
              const isSaving = savingKey === key;

              return (
                <div
                  key={key}
                  style={{
                    border: `1px solid ${isEditing ? "#3b82f6" : "#e2e8f0"}`,
                    borderRadius: "10px",
                    padding: "16px",
                    background: isEditing ? "#f8fbff" : "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "16px",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                      <div style={labelStyle}>Combo</div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                        {combo.item_name}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                        {combo.item_code} · {combo.category} · {combo.party_count}{" "}
                        {combo.party_count === 1 ? "party" : "parties"}
                      </div>
                    </div>

                    <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                      <div style={labelStyle}>Free item</div>
                      {combo.free_item_code ? (
                        <>
                          <div style={{ fontSize: "14px", fontWeight: 600, color: "#15803d" }}>
                            {combo.free_item?.item_name || `${combo.free_item_code} (not in SAP)`}
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                            {combo.free_item_code} ·{" "}
                            {combo.free_qty_per_unit
                              ? `${combo.free_qty_per_unit} free per piece`
                              : "same pieces as the combo"}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: "14px", color: "#b45309", fontWeight: 600 }}>
                          Not mapped
                        </div>
                      )}
                      {combo.is_partially_mapped && (
                        <div style={{ fontSize: "12px", color: "#b45309", marginTop: "4px" }}>
                          Only {combo.mapped_party_count} of {combo.party_count} parties carry this
                          mapping. Saving applies it to all of them.
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => (isEditing ? closeEditor() : openEditor(combo))}
                        disabled={isSaving}
                        style={{
                          padding: "8px 14px",
                          border: "1px solid #cbd5e1",
                          background: "#fff",
                          color: "#334155",
                          borderRadius: "8px",
                          cursor: isSaving ? "not-allowed" : "pointer",
                          fontWeight: 600,
                          fontSize: "13px",
                        }}
                      >
                        {isEditing ? "Cancel" : combo.free_item_code ? "Change" : "Map"}
                      </button>
                      {combo.free_item_code && (
                        <button
                          type="button"
                          onClick={() => clearMapping(combo)}
                          disabled={isSaving}
                          style={{
                            padding: "8px 14px",
                            border: "1px solid #fecaca",
                            background: "#fff",
                            color: "#b91c1c",
                            borderRadius: "8px",
                            cursor: isSaving ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            fontSize: "13px",
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div
                      style={{
                        marginTop: "16px",
                        paddingTop: "16px",
                        borderTop: "1px solid #e2e8f0",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                          marginBottom: "12px",
                        }}
                      >
                        <input
                          ref={pickerInputRef}
                          type="text"
                          value={pickerSearch}
                          onChange={(event) => setPickerSearch(event.target.value)}
                          placeholder={`Search a product — suggestions match "${freeHalfOf(combo.item_name || "") || combo.item_name}"`}
                          style={{
                            flex: "1 1 320px",
                            padding: "9px 12px",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            fontSize: "14px",
                          }}
                        />
                        <div style={{ flex: "0 1 220px" }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draftQty}
                            onChange={(event) => setDraftQty(event.target.value)}
                            placeholder="Free per piece (blank = 1)"
                            style={{
                              width: "100%",
                              padding: "9px 12px",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              fontSize: "14px",
                            }}
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          maxHeight: "260px",
                          overflowY: "auto",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                        }}
                      >
                        {pickerResults.length === 0 ? (
                          <div style={{ padding: "16px", fontSize: "13px", color: "#64748b" }}>
                            No suggestions. Type a product name or item code to search.
                          </div>
                        ) : (
                          pickerResults.map((product) => {
                            const isChosen = draftFreeItem === product.item_code;
                            return (
                              <button
                                key={`${product.item_code}-${product.category}`}
                                type="button"
                                onClick={() => setDraftFreeItem(product.item_code)}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  padding: "9px 12px",
                                  border: "none",
                                  borderBottom: "1px solid #f1f5f9",
                                  background: isChosen ? "#eff6ff" : "#fff",
                                  cursor: "pointer",
                                  fontSize: "13px",
                                  color: "#0f172a",
                                }}
                              >
                                <span style={{ fontWeight: isChosen ? 700 : 500 }}>
                                  {product.item_name}
                                </span>
                                <span style={{ color: "#64748b" }}>
                                  {"  "}
                                  {product.item_code} · {product.category}
                                  {product.sal_factor2 ? ` · ${Number(product.sal_factor2)} per box` : ""}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          alignItems: "center",
                          marginTop: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => save(combo, draftFreeItem)}
                          disabled={!draftFreeItem || isSaving}
                          style={{
                            padding: "9px 16px",
                            border: "none",
                            background: draftFreeItem ? "#2563eb" : "#cbd5e1",
                            color: "#fff",
                            borderRadius: "8px",
                            cursor: !draftFreeItem || isSaving ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            fontSize: "13px",
                          }}
                        >
                          {isSaving ? "Saving..." : "Save mapping"}
                        </button>
                        <span style={{ fontSize: "13px", color: "#64748b" }}>
                          {draftFreeItem
                            ? `Applies ${draftFreeItem} to all ${combo.party_count} ${
                                combo.party_count === 1 ? "party" : "parties"
                              }`
                            : "Pick the product this combo gives away"}
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
