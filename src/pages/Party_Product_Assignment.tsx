import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSapProducts } from "../lib/sapQueries";
// SheetJS (422 kB) is fetched at import time, not page-load time — see
// utils/xlsxLoader.ts. Reading uploaded workbooks only; writing goes
// through excelExport.
import { loadXlsx, type WorkBook, type XlsxModule } from "../utils/xlsxLoader";
import { startSheetsExport } from "../utils/excelExport";
import type { Product } from "../services/ordersService";
import { sapService, type Party } from "../services/sapService";
import { userService } from "../services/userService";
import api from "../services/api";
import "../styles/Party_Product_Assignment.css";

interface PartyProduct {
  id: number;
  item_code: string;
  item_name: string;
  category: string;
  brand: string;
  variety: string;
  sal_pack_unit: string;
  basic_rate: number;
}

type SearchableParty = Party & {
  CardCode?: string | number | null;
  CardName?: string | null;
};

type ImportRow = {
  card_code: string;
  party_category: string | null;
  item_code: string;
  product_category: string;
  basic_rate: number;
};

type ImportPartyRow = {
  card_code: string;
  party_category: string | null;
};

type ImportProductRow = {
  item_code: string;
  product_category: string;
  basic_rate: number;
};

type ImportSummary = {
  totalRows: number;
  imported: number;
  parties?: number;
  products?: number;
  added: number;
  updated: number;
  errors: string[];
};

const asText = (value: unknown) => String(value ?? "").trim();
const normalizeSearch = (value: unknown) => asText(value).toLowerCase();
const normalizeHeader = (value: unknown) => normalizeSearch(value).replace(/[^a-z0-9]/g, "");

const getPartyCode = (party: SearchableParty) => asText(party.card_code || party.CardCode);
const getPartyName = (party: SearchableParty) => asText(party.card_name || party.CardName);
const getPartyCategory = (party: SearchableParty) => asText(party.category);
const normalizeCategory = (value: unknown) => asText(value).toUpperCase();
const getPartySelectionKey = (party: SearchableParty) =>
  `${getPartyCode(party)}||${normalizeCategory(getPartyCategory(party))}`;
const getPartyKey = (party: SearchableParty) =>
  [getPartyCode(party), asText(party.category), asText(party.id)].filter(Boolean).join("-");

const getSelectionFromKey = (key: string) => {
  const [cardCode, category = ""] = key.split("||");
  return {
    card_code: cardCode,
    category: category || null,
  };
};

const getPartyMetaLine = (party: SearchableParty) =>
  [getPartyCode(party), party.state, getPartyCategory(party)].filter(Boolean).join(" | ");

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

const getImportValue = (row: Record<string, unknown>, aliases: string[]) => {
  const aliasSet = new Set(aliases.map(normalizeHeader));
  const match = Object.entries(row).find(([key]) => aliasSet.has(normalizeHeader(key)));
  return match ? match[1] : "";
};

const getWorksheetRows = (XLSX: XlsxModule, workbook: WorkBook, sheetNames: string[]) => {
  const normalizedNames = sheetNames.map(normalizeHeader);
  const sheetName = workbook.SheetNames.find((name) => normalizedNames.includes(normalizeHeader(name)));
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
};

const parseRate = (value: unknown) => {
  const raw = asText(value).replace(/,/g, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
};

/** Stable empty, so the counters and `availableProducts` memo settle. */
const NO_PARTY_PRODUCTS: PartyProduct[] = [];

export default function Party_Product_Assignment() {
  const [parties, setParties] = useState<Party[]>([]);
  const [allParties, setAllParties] = useState<Party[]>([]);
  const queryClient = useQueryClient();
  /* Shared ["sap","products"] key. The old code did `setProducts(await
     sapService.getProducts())` with NO Array.isArray guard — the only consumer
     in the repo that did not coerce — so a non-array body made every product
     lookup below throw. */
  //
  // The cast is the pre-existing situation made visible, not a new risk: this
  // page types its catalogue as `ordersService.Product` (which adds
  // sal_factor2 / tax_rate / basic_rate) while `/sap/products/` is typed as
  // `sapService.Product`. The old code assigned the untyped `response.data`
  // straight into the richer type, so the same assumption was already being
  // made — silently.
  const { items: sapProducts } = useSapProducts();
  const products = sapProducts as unknown as Product[];
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  /*
   * Exactly one party selected -> that party's products. `enabled` replaces the
   * effect that used to do this, INCLUDING its `else { setAssignedProducts([]) }`
   * branch: with the query disabled there is no data and every reader falls back
   * to the same stable empty.
   */
  const singleSelection =
    selectedParties.length === 1 ? getSelectionFromKey(selectedParties[0]) : null;
  const partyProductsKey = [
    "party",
    "products",
    singleSelection?.card_code ?? null,
    singleSelection?.category ?? null,
  ] as const;
  const { data: assignedProducts = NO_PARTY_PRODUCTS } = useQuery({
    queryKey: partyProductsKey,
    enabled: Boolean(singleSelection),
    queryFn: async () => {
      const res = await userService.getPartyProducts(
        singleSelection!.card_code,
        singleSelection!.category,
      );
      return (res.data?.products || res.products || []) as PartyProduct[];
    },
  });
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const [showAddModal, setShowAddModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [selectedNewProducts, setSelectedNewProducts] = useState<Product[]>([]);
  const [newProductRates, setNewProductRates] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const partySearchRequestRef = useRef(0);

  useEffect(() => {
    fetchParties();
    // `fetchProducts` is gone — products come from the shared ["sap","products"]
    // query above, which the five Sap Sync tabs also render from.
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetchParties(partySearch);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [partySearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchParties = async (search = "") => {
    const requestId = ++partySearchRequestRef.current;
    try {
      const searchValue = search.trim();
      const response = searchValue
        ? await api.get("/sap/parties/", { params: { search: searchValue } })
        : { data: await sapService.getParties() };
      const partyList = getPartyList(response.data);

      if (requestId !== partySearchRequestRef.current) return;

      if (!searchValue) {
        setAllParties(partyList);
      }

      setParties((prev) => mergeParties(searchValue ? [...allParties, ...partyList, ...prev] : partyList));
    } catch (error) {
      console.error("Error fetching parties:", error);
      if (requestId === partySearchRequestRef.current && !search.trim()) {
        setParties([]);
        setAllParties([]);
      }
    }
  };

  /** Re-read the selected party's products. Was a direct fetch + setState. */
  const fetchPartyProducts = () =>
    queryClient.invalidateQueries({ queryKey: ["party", "products"] });


  const handleRemoveProduct = async (product: PartyProduct) => {
    if (selectedParties.length !== 1) return;
    if (!window.confirm(`Are you sure you want to remove ${product.item_name}?`)) return;
    try {
      const selectedParty = getSelectionFromKey(selectedParties[0]);
      await userService.removePartyProduct(selectedParty.card_code, product.item_code, product.category);
      alert("Product removed successfully");
      fetchPartyProducts();
    } catch (error) {
      console.error("Error removing product:", error);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedNewProducts.length === 0 || selectedParties.length === 0) return;
    setIsSaving(true);
    try {
      const payload = selectedNewProducts.map((p) => ({
        item_code: p.item_code,
        category: p.category,
        basic_rate: Number(newProductRates[`${p.item_code}-${p.category}`]) || 0,
      }));

      const partySelections = selectedParties.map(getSelectionFromKey);
      const cardCodes = [...new Set(partySelections.map((party) => party.card_code))];

      await api.post("/auth/bulk-party/assign-products/", {
        card_codes: cardCodes,
        party_selections: partySelections,
        products: payload,
      });

      const label = selectedParties.length > 1
        ? `${selectedParties.length} parties`
        : getPartyName(partyOptions.find((p) => getPartySelectionKey(p) === selectedParties[0]) || ({} as SearchableParty)) || getSelectionFromKey(selectedParties[0]).card_code;
      alert(`Products assigned to ${label} successfully`);

      setShowAddModal(false);
      setSelectedNewProducts([]);
      setNewProductRates({});
      setModalSearch("");

      if (selectedParties.length === 1) {
        void fetchPartyProducts();
      }
    } catch (error) {
      console.error("Error assigning products:", error);
      alert("Failed to assign products");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadTemplate = () => {
    const partyRows = [
      {
        "Party Code": "C001",
        "Party Category": "",
      },
      {
        "Party Code": "C002",
        "Party Category": "",
      },
    ];
    const productRows = [
      {
        "Item Code": "FG001",
        "Product Category": "OIL",
        "Basic Rate": 150.5,
      },
      {
        "Item Code": "FG002",
        "Product Category": "BEVERAGES",
        "Basic Rate": 120,
      },
    ];
    startSheetsExport(
      [
        { sheetName: "Parties", rows: partyRows },
        { sheetName: "Products", rows: productRows },
      ],
      "party-product-assignment-template.xlsx",
    );
  };

  const handleImportExcel = async (file: File) => {
    setIsImporting(true);
    setImportSummary(null);

    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await loadXlsx();
    const workbook = XLSX.read(buffer, { type: "array" });
      const partyRows = getWorksheetRows(XLSX, workbook, ["Parties", "Party"]);
      const productRows = getWorksheetRows(XLSX, workbook, ["Products", "Product"]);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const singleSheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const errors: string[] = [];
      const parsedParties: ImportPartyRow[] = [];
      const parsedProducts: ImportProductRow[] = [];
      const parsedRows: ImportRow[] = [];
      const partyLookup = new Set(partyOptions.map((party) => getPartySelectionKey(party)));
      const productLookup = new Set(
        products.map((product) => `${asText(product.item_code)}||${normalizeCategory(product.category)}`)
      );
      const hasSeparateSheets = partyRows.length > 0 || productRows.length > 0;

      if (hasSeparateSheets) {
        partyRows.forEach((row, index) => {
          const rowNumber = index + 2;
          const cardCode = asText(getImportValue(row, ["Party Code", "Card Code", "card_code", "CardCode"]));
          const partyCategory = normalizeCategory(
            getImportValue(row, ["Party Category", "Party Cat", "Party Type", "party_category"])
          );

          if (!cardCode) {
            errors.push(`Parties row ${rowNumber}: Party Code is required.`);
            return;
          }

          const partyKey = `${cardCode}||${partyCategory}`;
          if (partyCategory && partyLookup.size > 0 && !partyLookup.has(partyKey)) {
            errors.push(`Parties row ${rowNumber}: Party ${cardCode} with category ${partyCategory} was not found.`);
            return;
          }

          parsedParties.push({
            card_code: cardCode,
            party_category: partyCategory || null,
          });
        });

        productRows.forEach((row, index) => {
          const rowNumber = index + 2;
          const itemCode = asText(getImportValue(row, ["Item Code", "Product Code", "item_code", "ItemCode"]));
          const productCategory = normalizeCategory(
            getImportValue(row, ["Product Category", "Category", "product_category"])
          );
          const basicRate = parseRate(getImportValue(row, ["Basic Rate", "Price List (Basic)", "Rate", "basic_rate"]));

          if (!itemCode || !productCategory || Number.isNaN(basicRate)) {
            errors.push(`Products row ${rowNumber}: Item Code, Product Category and Basic Rate are required.`);
            return;
          }

          const productKey = `${itemCode}||${productCategory}`;
          if (productLookup.size > 0 && !productLookup.has(productKey)) {
            errors.push(`Products row ${rowNumber}: Product ${itemCode} with category ${productCategory} was not found.`);
            return;
          }

          parsedProducts.push({
            item_code: itemCode,
            product_category: productCategory,
            basic_rate: basicRate,
          });
        });

        parsedParties.forEach((party) => {
          parsedProducts.forEach((product) => {
            parsedRows.push({
              card_code: party.card_code,
              party_category: party.party_category,
              item_code: product.item_code,
              product_category: product.product_category,
              basic_rate: product.basic_rate,
            });
          });
        });
      } else {
        singleSheetRows.forEach((row, index) => {
          const rowNumber = index + 2;
          const cardCode = asText(getImportValue(row, ["Party Code", "Card Code", "card_code", "CardCode"]));
          const partyCategory = normalizeCategory(
            getImportValue(row, ["Party Category", "Party Cat", "Party Type", "party_category"])
          );
          const itemCode = asText(getImportValue(row, ["Item Code", "Product Code", "item_code", "ItemCode"]));
          const productCategory = normalizeCategory(
            getImportValue(row, ["Product Category", "Category", "product_category"])
          );
          const basicRate = parseRate(getImportValue(row, ["Basic Rate", "Price List (Basic)", "Rate", "basic_rate"]));

          if (!cardCode || !itemCode || !productCategory || Number.isNaN(basicRate)) {
            errors.push(`Row ${rowNumber}: Party Code, Item Code, Product Category and Basic Rate are required.`);
            return;
          }

          const partyKey = `${cardCode}||${partyCategory}`;
          if (partyCategory && partyLookup.size > 0 && !partyLookup.has(partyKey)) {
            errors.push(`Row ${rowNumber}: Party ${cardCode} with category ${partyCategory} was not found.`);
            return;
          }

          const productKey = `${itemCode}||${productCategory}`;
          if (productLookup.size > 0 && !productLookup.has(productKey)) {
            errors.push(`Row ${rowNumber}: Product ${itemCode} with category ${productCategory} was not found.`);
            return;
          }

          parsedRows.push({
            card_code: cardCode,
            party_category: partyCategory || null,
            item_code: itemCode,
            product_category: productCategory,
            basic_rate: basicRate,
          });
        });
      }

      if (!parsedRows.length) {
        setImportSummary({
          totalRows: hasSeparateSheets ? partyRows.length + productRows.length : singleSheetRows.length,
          imported: 0,
          parties: hasSeparateSheets ? parsedParties.length : undefined,
          products: hasSeparateSheets ? parsedProducts.length : undefined,
          added: 0,
          updated: 0,
          errors,
        });
        alert("No valid rows found in the Excel file.");
        return;
      }

      const groupedRows = new Map<string, ImportRow[]>();
      parsedRows.forEach((row) => {
        const key = `${row.card_code}||${row.party_category || ""}`;
        groupedRows.set(key, [...(groupedRows.get(key) || []), row]);
      });

      let added = 0;
      let updated = 0;
      const apiErrors = [...errors];

      for (const [key, rows] of groupedRows) {
        const [cardCode, category = ""] = key.split("||");
        const response = await api.post("/auth/bulk-party/assign-products/", {
          card_codes: [cardCode],
          party_selections: [{ card_code: cardCode, category: category || null }],
          products: rows.map((row) => ({
            item_code: row.item_code,
            category: row.product_category,
            basic_rate: row.basic_rate,
          })),
        });

        const data = response.data?.data || {};
        added += Number(data.added || 0);
        updated += Number(data.updated || 0);
        if (Array.isArray(data.errors)) {
          apiErrors.push(...data.errors);
        }
      }

      setImportSummary({
        totalRows: hasSeparateSheets ? partyRows.length + productRows.length : singleSheetRows.length,
        imported: parsedRows.length,
        parties: hasSeparateSheets ? parsedParties.length : undefined,
        products: hasSeparateSheets ? parsedProducts.length : undefined,
        added,
        updated,
        errors: apiErrors,
      });

      if (selectedParties.length === 1) {
        void fetchPartyProducts();
      }

      alert(`Excel import complete. Added: ${added}, Updated: ${updated}`);
    } catch (error) {
      console.error("Error importing party products:", error);
      alert("Failed to import Excel file.");
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  const handleEditRate = async (product: PartyProduct) => {
    if (selectedParties.length !== 1) return;
    const selectedParty = getSelectionFromKey(selectedParties[0]);
    const newRate = prompt(`Enter new basic rate for ${product.item_name}:`, product.basic_rate.toString());
    if (newRate === null) return;
    const parsedRate = parseFloat(newRate);
    if (isNaN(parsedRate) || parsedRate < 0) {
      alert("Invalid rate entered.");
      return;
    }
    try {
      await userService.editRate(selectedParty.card_code, product.item_code, product.category, parsedRate);
      alert("Rate updated successfully");
      // The ONLY mutation on this page that patches instead of refetching —
      // drop it and the rate edit disappears from the screen entirely.
      queryClient.setQueryData<PartyProduct[]>(partyProductsKey, (prev) =>
        (prev ?? []).map((p) =>
          p.item_code === product.item_code && p.category === product.category
            ? { ...p, basic_rate: parsedRate }
            : p,
        ),
      );
    } catch (error) {
      console.error("Error updating rate:", error);
      alert("Failed to update rate.");
    }
  };

  const toggleParty = (partyKey: string) => {
    setSelectedParties((prev) =>
      prev.includes(partyKey) ? prev.filter((p) => p !== partyKey) : [...prev, partyKey]
    );
  };

  const removeSelectedParty = (partyKey: string) => {
    setSelectedParties((prev) => prev.filter((p) => p !== partyKey));
  };

  const partyOptions = mergeParties([...allParties, ...parties]);
  const searchTerm = normalizeSearch(partySearch);
  const filteredParties = partyOptions.filter((p) => {
    if (!searchTerm) return true;

    return [
      getPartyCode(p),
      getPartyName(p),
      p.state,
      p.main_group,
      p.category,
    ].some((value) => normalizeSearch(value).includes(searchTerm));
  });

  const isSingleParty = selectedParties.length === 1;
  const selectedPartyDetails = isSingleParty
    ? partyOptions.find((p) => getPartySelectionKey(p) === selectedParties[0])
    : null;
  const selectedPartyCategories = new Set(
    selectedParties
      .map((partyKey) => getSelectionFromKey(partyKey).category)
      .filter(Boolean)
      .map(normalizeCategory)
  );

  const displayProducts = assignedProducts.filter((p) =>
    categoryFilter === "ALL" ? true : p.category === categoryFilter
  );

  const totalProducts = assignedProducts.length;
  const oilCount = assignedProducts.filter((p) => p.category === "OIL").length;
  const beverageCount = assignedProducts.filter((p) => p.category === "BEVERAGES").length;
  const martCount = assignedProducts.filter((p) => p.category === "MART").length;

  const availableProducts = products.filter(
    (p) =>
      (selectedPartyCategories.size === 0 || selectedPartyCategories.has(normalizeCategory(p.category))) &&
      !assignedProducts.some((ap) => ap.item_code === p.item_code && ap.category === p.category)
  );

  const filteredAvailable = availableProducts.filter(
    (p) =>
      (p.item_name || "").toLowerCase().includes(modalSearch.toLowerCase()) ||
      (p.item_code || "").toLowerCase().includes(modalSearch.toLowerCase())
  );

  const modalTitle =
    selectedParties.length > 1
      ? `Add Products to ${selectedParties.length} Parties`
      : `Add Products to ${selectedPartyDetails ? `${getPartyName(selectedPartyDetails)} (${getPartyCategory(selectedPartyDetails)})` : ""}`;

  return (
    <div className="pa-page app-page">

      {/* Party Selector Card */}
      <div className="ppa-card">
        <div className="ppa-head">
          <h1 className="ppa-title">Party Product Assignment</h1>
        </div>

        <div className="ppa-upload">
          <div>
            <h2 className="ppa-upload-title">Excel Upload</h2>
            <p className="ppa-upload-hint">
              Use separate sheets: Parties has Party Code and optional Party Category; Products has Item Code, Product Category and Basic Rate.
            </p>
          </div>
          <div className="ppa-upload-actions">
            <button type="button" onClick={handleDownloadTemplate} className="ppa-btn-template">
              Download Template
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={isImporting}
              className="ppa-btn-upload"
            >
              {isImporting ? "Importing..." : "Upload Excel"}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="ppa-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  handleImportExcel(file);
                }
              }}
            />
          </div>
          {importSummary && (
            <div className="ppa-import-summary">
              {importSummary.parties !== undefined && importSummary.products !== undefined
                ? `Mapped ${importSummary.products} products to ${importSummary.parties} parties. `
                : `Imported ${importSummary.imported} of ${importSummary.totalRows} rows. `}
              Assignments processed {importSummary.imported}. Added {importSummary.added}, updated {importSummary.updated}.
              {importSummary.errors.length > 0 && (
                <div className="ppa-import-errors">
                  {importSummary.errors.slice(0, 5).map((error) => (
                    <div key={error}>{error}</div>
                  ))}
                  {importSummary.errors.length > 5 && (
                    <div>{importSummary.errors.length - 5} more rows had issues.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div ref={dropdownRef} className="ppa-picker">
          <label className="ppa-picker-label">Search &amp; select one or more parties</label>
          <div className="ppa-picker-field">
            <input
              type="text"
              placeholder="Type name or code to search..." aria-label="Type name or code to search"
              className="ppa-input"
              value={partySearch}
              onChange={(e) => {
                setPartySearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
            />
          </div>

          {showDropdown && (
            <div className="ppa-dropdown">
              {filteredParties.length > 0 ? (
                filteredParties.map((party) => {
                  const partyName = getPartyName(party);
                  const partyKey = getPartySelectionKey(party);
                  const isChecked = selectedParties.includes(partyKey);
                  return (
                    <div
                      key={getPartyKey(party)}
                      className={`ppa-dropdown-row${isChecked ? " is-checked" : ""}`}
                      onClick={() => toggleParty(partyKey)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="ppa-dropdown-check"
                      />
                      <div>
                        <div className="ppa-dropdown-name">{partyName || "Unnamed party"}</div>
                        <div className="ppa-dropdown-meta">{getPartyMetaLine(party)}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="ppa-dropdown-empty">No parties found</div>
              )}
            </div>
          )}
        </div>

        {/* Selected party chips */}
        {selectedParties.length > 0 && (
          <div className="ppa-chips">
            {selectedParties.map((partyKey) => {
              const p = partyOptions.find((x) => getPartySelectionKey(x) === partyKey);
              const fallback = getSelectionFromKey(partyKey);
              return (
                <span key={partyKey} className="ppa-chip">
                  {p ? getPartyName(p) || fallback.card_code : fallback.card_code}
                  <span className="ppa-chip-category">
                    {p ? getPartyCategory(p) : fallback.category}
                  </span>
                  <button
                    onClick={() => removeSelectedParty(partyKey)}
                    className="ppa-chip-remove"
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {selectedParties.length > 1 && (
              <button onClick={() => setSelectedParties([])} className="ppa-chip-clear">
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Multi-party assignment panel */}
      {selectedParties.length > 1 && (
        <div className="ppa-card ppa-card--multi">
          <div className="ppa-panel-head">
            <div>
              <h2 className="ppa-title">Multi-Party Assignment</h2>
              <p className="ppa-panel-sub">
                {selectedParties.length} parties selected — products will be assigned to all of them at once.
              </p>
            </div>
            <button className="ppa-btn-add-all" onClick={() => setShowAddModal(true)}>
              + Add Products to All
            </button>
          </div>

          <div className="ppa-party-list">
            {selectedParties.map((partyKey) => {
              const p = partyOptions.find((x) => getPartySelectionKey(x) === partyKey);
              const fallback = getSelectionFromKey(partyKey);
              return (
                <div key={partyKey} className="ppa-party-pill">
                  <span className="ppa-party-pill-name">
                    {p ? getPartyName(p) || fallback.card_code : fallback.card_code}
                  </span>
                  <span className="ppa-party-pill-meta">
                    {p ? getPartyMetaLine(p) : [fallback.card_code, fallback.category].filter(Boolean).join(" | ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single-party product details */}
      {selectedPartyDetails && (
        <div className="ppa-card">
          <div className="ppa-detail-head">
            <div>
              <h2 className="ppa-title">{getPartyName(selectedPartyDetails)}</h2>
              <div className="ppa-detail-meta">
                <span className="ppa-detail-code">{getPartyCode(selectedPartyDetails)}</span>
                <span className="ppa-detail-where">
                  {selectedPartyDetails.state || "Unknown State"} •{" "}
                  {selectedPartyDetails.main_group || "Unknown Group"} •{" "}
                  {getPartyCategory(selectedPartyDetails) || "Unknown Category"}
                </span>
              </div>
            </div>
            <button className="ppa-btn-add" onClick={() => setShowAddModal(true)}>
              + Add Products
            </button>
          </div>

          <div className="ppa-stats">
            {[
              { label: "Total Assigned", value: totalProducts, tone: "total" },
              { label: "Oil", value: oilCount, tone: "oil" },
              { label: "Beverages", value: beverageCount, tone: "beverages" },
              { label: "Mart", value: martCount, tone: "mart" },
            ].map(({ label, value, tone }) => (
              <div key={label} className={`ppa-stat ppa-stat--${tone}`}>
                <div className="ppa-stat-value">{value}</div>
                <div className="ppa-stat-label">{label}</div>
              </div>
            ))}
          </div>

          <div className="ppa-filters">
            {["ALL", "OIL", "BEVERAGES", "MART"].map((cat) => (
              <button
                key={cat}
                className={`ppa-filter${categoryFilter === cat ? " is-active" : ""}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {displayProducts.length > 0 ? (
            <div className="ppa-grid">
              {displayProducts.map((product) => (
                <div key={`${product.item_code}-${product.category}`} className="ppa-product">
                  <div>
                    <div className="ppa-product-top">
                      <span className="ppa-product-code">{product.item_code}</span>
                      <div className="ppa-product-tags">
                        <span
                          className={`ppa-badge ppa-badge--${
                            product.category === "OIL"
                              ? "oil"
                              : product.category === "BEVERAGES"
                              ? "beverages"
                              : "mart"
                          }`}
                        >
                          {product.category}
                        </span>
                        <button
                          className="ppa-product-remove"
                          onClick={() => handleRemoveProduct(product)}
                          title="Remove Product"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="ppa-product-name">{product.item_name}</div>
                    <div className="ppa-product-meta">
                      {product.brand || "-"} • {product.variety || "-"} • {product.sal_pack_unit || "-"}
                    </div>
                  </div>
                  <div className="ppa-product-foot">
                    <div>
                      <div className="ppa-rate-label">Rate</div>
                      <div className="ppa-rate-value">
                        ₹{Number(product.basic_rate || 0).toFixed(2)}
                      </div>
                    </div>
                    <button className="ppa-rate-edit" onClick={() => handleEditRate(product)}>
                      Edit Rate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ppa-empty">No products found for the selected filter.</div>
          )}
        </div>
      )}

      {/* Add Products Modal */}
      {showAddModal && (
        <div className="ppa-modal-overlay">
          <div className="ppa-modal">
            <div className="ppa-modal-head">
              <h2 className="ppa-modal-title">{modalTitle}</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedNewProducts([]);
                  setNewProductRates({});
                  setModalSearch("");
                }}
                className="ppa-modal-close"
              >
                ×
              </button>
            </div>

            <div className="ppa-modal-search">
              <input
                type="text"
                placeholder="Search available products..." aria-label="Search available products"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="ppa-input"
              />
            </div>

            <div className="ppa-modal-body">
              {filteredAvailable.length > 0 ? (
                <div className="ppa-modal-grid">
                  {filteredAvailable.map((product) => {
                    const isSelected = selectedNewProducts.some(
                      (p) => p.item_code === product.item_code && p.category === product.category
                    );
                    return (
                      <div
                        key={`${product.item_code}-${product.category}`}
                        className={`ppa-modal-row${isSelected ? " is-selected" : ""}`}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedNewProducts(
                              selectedNewProducts.filter(
                                (p) => !(p.item_code === product.item_code && p.category === product.category)
                              )
                            );
                          } else {
                            setSelectedNewProducts([...selectedNewProducts, product]);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="ppa-modal-check"
                        />
                        <div className="ppa-modal-row-body">
                          <div className="ppa-modal-row-name">{product.item_name}</div>
                          <div className="ppa-modal-row-meta">
                            {product.item_code} • {product.category}
                          </div>
                          {isSelected && (
                            <div className="ppa-modal-rate" onClick={(e) => e.stopPropagation()}>
                              <label className="ppa-modal-rate-label">Rate (₹)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                aria-label={`Rate for ${product.item_name}`}
                                value={newProductRates[`${product.item_code}-${product.category}`] || ""}
                                onChange={(e) =>
                                  setNewProductRates((prev) => ({
                                    ...prev,
                                    [`${product.item_code}-${product.category}`]: e.target.value,
                                  }))
                                }
                                className="ppa-input"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="ppa-modal-empty">No products match your search</div>
              )}
            </div>

            <div className="ppa-modal-foot">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedNewProducts([]);
                  setNewProductRates({});
                  setModalSearch("");
                }}
                className="ppa-btn-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={isSaving || selectedNewProducts.length === 0}
                className="ppa-btn-save"
              >
                {isSaving
                  ? "Saving..."
                  : selectedParties.length > 1
                  ? `Add ${selectedNewProducts.length} Products to ${selectedParties.length} Parties`
                  : `Add ${selectedNewProducts.length} Products`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
