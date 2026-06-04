import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { Product } from "../services/ordersService";
import { sapService, type Party } from "../services/sapService";
import { userService } from "../services/userService";
import api from "../services/api";

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

const getWorksheetRows = (workbook: XLSX.WorkBook, sheetNames: string[]) => {
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

export default function Party_Product_Assignment() {
  const [parties, setParties] = useState<Party[]>([]);
  const [allParties, setAllParties] = useState<Party[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [assignedProducts, setAssignedProducts] = useState<PartyProduct[]>([]);
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
    fetchProducts();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetchParties(partySearch);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [partySearch]);

  useEffect(() => {
    if (selectedParties.length === 1) {
      const selectedParty = getSelectionFromKey(selectedParties[0]);
      fetchPartyProducts(selectedParty.card_code, selectedParty.category);
    } else {
      setAssignedProducts([]);
    }
  }, [selectedParties]);

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

  const fetchProducts = async () => {
    try {
      const data = await sapService.getProducts();
      setProducts(data);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const fetchPartyProducts = async (card_code: string, category?: string | null) => {
    try {
      const res = await userService.getPartyProducts(card_code, category);
      setAssignedProducts(res.data?.products || res.products || []);
    } catch (error) {
      console.error("Error fetching party products:", error);
      setAssignedProducts([]);
    }
  };

  const handleRemoveProduct = async (product: PartyProduct) => {
    if (selectedParties.length !== 1) return;
    if (!window.confirm(`Are you sure you want to remove ${product.item_name}?`)) return;
    try {
      const selectedParty = getSelectionFromKey(selectedParties[0]);
      await userService.removePartyProduct(selectedParty.card_code, product.item_code, product.category);
      alert("Product removed successfully");
      fetchPartyProducts(selectedParty.card_code, selectedParty.category);
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
        const selectedParty = getSelectionFromKey(selectedParties[0]);
        fetchPartyProducts(selectedParty.card_code, selectedParty.category);
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
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(partyRows), "Parties");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productRows), "Products");
    XLSX.writeFile(workbook, "party-product-assignment-template.xlsx");
  };

  const handleImportExcel = async (file: File) => {
    setIsImporting(true);
    setImportSummary(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const partyRows = getWorksheetRows(workbook, ["Parties", "Party"]);
      const productRows = getWorksheetRows(workbook, ["Products", "Product"]);
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
          const basicRate = parseRate(getImportValue(row, ["Basic Rate", "Basic Price", "Rate", "basic_rate"]));

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
          const basicRate = parseRate(getImportValue(row, ["Basic Rate", "Basic Price", "Rate", "basic_rate"]));

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
        const selectedParty = getSelectionFromKey(selectedParties[0]);
        fetchPartyProducts(selectedParty.card_code, selectedParty.category);
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
      setAssignedProducts((prev) =>
        prev.map((p) =>
          p.item_code === product.item_code && p.category === product.category
            ? { ...p, basic_rate: parsedRate }
            : p
        )
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
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          marginBottom: "24px",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ margin: "0 0 4px", fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
            Party Product Assignment
          </h1>
          {/* <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Search &amp; select one or more parties to assign products.</p> */}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
            padding: "16px",
            marginBottom: "24px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Excel Upload
            </h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Use separate sheets: Parties has Party Code and optional Party Category; Products has Item Code, Product Category and Basic Rate.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              style={{
                padding: "9px 14px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Download Template
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={isImporting}
              style={{
                padding: "9px 14px",
                border: "none",
                background: "#16a34a",
                color: "#fff",
                borderRadius: "8px",
                cursor: isImporting ? "not-allowed" : "pointer",
                fontWeight: 600,
                opacity: isImporting ? 0.75 : 1,
              }}
            >
              {isImporting ? "Importing..." : "Upload Excel"}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  handleImportExcel(file);
                }
              }}
            />
          </div>
          {importSummary && (
            <div
              style={{
                flexBasis: "100%",
                paddingTop: "12px",
                borderTop: "1px solid #e2e8f0",
                fontSize: "13px",
                color: "#475569",
              }}
            >
              {importSummary.parties !== undefined && importSummary.products !== undefined
                ? `Mapped ${importSummary.products} products to ${importSummary.parties} parties. `
                : `Imported ${importSummary.imported} of ${importSummary.totalRows} rows. `}
              Assignments processed {importSummary.imported}. Added {importSummary.added}, updated {importSummary.updated}.
              {importSummary.errors.length > 0 && (
                <div style={{ marginTop: "8px", color: "#b91c1c" }}>
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

        <div ref={dropdownRef} style={{ position: "relative", maxWidth: "480px", zIndex: 10 }}>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#334155",
              marginBottom: "8px",
            }}
          >
            Search &amp; select one or more parties
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Type name or code to search..."
              style={{
                width: "100%",
                height: "var(--input-h, 40px)",
                padding: "0 12px",
                background: "rgba(248, 250, 252, 0.9)",
                border: "1px solid #cbd5e1",
                borderRadius: "var(--radius-sm, 8px)",
                fontSize: "var(--font-ui, 13px)",
              color: "#0f172a",
                outline: "none",
                boxSizing: "border-box",
              }}
              value={partySearch}
              onChange={(e) => {
                setPartySearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
            />
          </div>

          {showDropdown && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: "4px",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "var(--radius-md, 12px)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                maxHeight: "250px",
                overflowY: "auto",
              }}
            >
              {filteredParties.length > 0 ? (
                filteredParties.map((party) => {
                  const partyName = getPartyName(party);
                  const partyKey = getPartySelectionKey(party);
                  const isChecked = selectedParties.includes(partyKey);
                  return (
                    <div
                      key={getPartyKey(party)}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        borderBottom: "1px solid #f1f5f9",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        background: isChecked ? "#eff6ff" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isChecked) e.currentTarget.style.backgroundColor = "#f8fafc";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isChecked ? "#eff6ff" : "transparent";
                      }}
                      onClick={() => toggleParty(partyKey)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        style={{
                          width: "15px",
                          height: "15px",
                          accentColor: "#2563eb",
                          pointerEvents: "none",
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 500, color: "#0f172a" }}>{partyName || "Unnamed party"}</div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
                          {getPartyMetaLine(party)}
                        </div>

                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: "10px 14px", color: "#64748b" }}>No parties found</div>
              )}
            </div>
          )}
        </div>

        {/* Selected party chips */}
        {selectedParties.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px" }}>
            {selectedParties.map((partyKey) => {
              const p = partyOptions.find((x) => getPartySelectionKey(x) === partyKey);
              const fallback = getSelectionFromKey(partyKey);
              return (
                <span
                  key={partyKey}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "20px",
                    padding: "4px 10px",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    color: "#1d4ed8",
                  }}
                >
                  {p ? getPartyName(p) || fallback.card_code : fallback.card_code}
                  <span style={{ color: "#64748b", fontSize: "0.75rem", fontWeight: 600 }}>
                    {p ? getPartyCategory(p) : fallback.category}
                  </span>
                  <button
                    onClick={() => removeSelectedParty(partyKey)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#64748b",
                      fontSize: "1rem",
                      lineHeight: 1,
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {selectedParties.length > 1 && (
              <button
                onClick={() => setSelectedParties([])}
                style={{
                  background: "none",
                  border: "1px solid #fca5a5",
                  borderRadius: "20px",
                  padding: "4px 10px",
                  fontSize: "0.8rem",
                  color: "#ef4444",
                  cursor: "pointer",
                }}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Multi-party assignment panel */}
      {selectedParties.length > 1 && (
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            marginBottom: "24px",
            border: "1px solid #bfdbfe",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                Multi-Party Assignment
              </h2>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#475569" }}>
                {selectedParties.length} parties selected — products will be assigned to all of them at once.
              </p>
            </div>
            <button
              style={{
                background: "#2563eb",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: "8px",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
              onClick={() => setShowAddModal(true)}
            >
              + Add Products to All
            </button>
          </div>

          <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {selectedParties.map((partyKey) => {
              const p = partyOptions.find((x) => getPartySelectionKey(x) === partyKey);
              const fallback = getSelectionFromKey(partyKey);
              return (
                <div
                  key={partyKey}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    fontSize: "0.85rem",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{p ? getPartyName(p) || fallback.card_code : fallback.card_code}</span>
                  <span style={{ color: "#64748b", marginLeft: "6px" }}>
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
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "24px",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                {getPartyName(selectedPartyDetails)}
              </h2>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: "0.875rem",
                    color: "#475569",
                    fontWeight: 600,
                    background: "#f1f5f9",
                    padding: "4px 8px",
                    borderRadius: "4px",
                  }}
                >
                  {getPartyCode(selectedPartyDetails)}
                </span>
                <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
                  {selectedPartyDetails.state || "Unknown State"} •{" "}
                  {selectedPartyDetails.main_group || "Unknown Group"} •{" "}
                  {getPartyCategory(selectedPartyDetails) || "Unknown Category"}
                </span>
              </div>
            </div>
            <button
              style={{
                background: "#2563eb",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                fontWeight: 500,
                cursor: "pointer",
              }}
              onClick={() => setShowAddModal(true)}
            >
              + Add Products
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            {[
              { label: "Total Assigned", value: totalProducts, bg: "#f8fafc", border: "#e2e8f0", color: "#0f172a", labelColor: "#64748b" },
              { label: "Oil", value: oilCount, bg: "#fffbeb", border: "#fde68a", color: "#d97706", labelColor: "#b45309" },
              { label: "Beverages", value: beverageCount, bg: "#eff6ff", border: "#bfdbfe", color: "#2563eb", labelColor: "#1d4ed8" },
              { label: "Mart", value: martCount, bg: "#f1f5f9", border: "#cbd5e1", color: "#334155", labelColor: "#475569" },
            ].map(({ label, value, bg, border, color, labelColor }) => (
              <div
                key={label}
                style={{
                  background: bg,
                  padding: "16px",
                  borderRadius: "8px",
                  border: `1px solid ${border}`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{value}</div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: labelColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginTop: "4px",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            {["ALL", "OIL", "BEVERAGES", "MART"].map((cat) => (
              <button
                key={cat}
                style={{
                  padding: "6px 16px",
                  borderRadius: "20px",
                  border: categoryFilter === cat ? "none" : "1px solid #cbd5e1",
                  background: categoryFilter === cat ? "#1e293b" : "#fff",
                  color: categoryFilter === cat ? "#fff" : "#475569",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {displayProducts.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "16px",
              }}
            >
              {displayProducts.map((product) => (
                <div
                  key={`${product.item_code}-${product.category}`}
                  style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "8px",
                      }}
                    >
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b", fontFamily: "monospace" }}>
                        {product.item_code}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            color: "#fff",
                            background:
                              product.category === "OIL"
                                ? "#f59e0b"
                                : product.category === "BEVERAGES"
                                ? "#3b82f6"
                                : "#1e3a5f",
                          }}
                        >
                          {product.category}
                        </span>
                        <button
                          style={{
                            background: "none",
                            border: "none",
                            color: "#ef4444",
                            fontSize: "1.25rem",
                            cursor: "pointer",
                            lineHeight: 1,
                            padding: 0,
                          }}
                          onClick={() => handleRemoveProduct(product)}
                          title="Remove Product"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 600, color: "#0f172a", marginBottom: "4px", lineHeight: 1.4 }}>
                      {product.item_name}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      {product.brand || "-"} • {product.variety || "-"} • {product.sal_pack_unit || "-"}
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: "16px",
                      paddingTop: "12px",
                      borderTop: "1px solid #f1f5f9",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>Basic Rate</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#16a34a" }}>
                        ₹{Number(product.basic_rate || 0).toFixed(2)}
                      </div>
                    </div>
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                      }}
                      onClick={() => handleEditRate(product)}
                    >
                      Edit Rate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                background: "#f8fafc",
                borderRadius: "8px",
                border: "1px dashed #cbd5e1",
                color: "#64748b",
              }}
            >
              No products found for the selected filter.
            </div>
          )}
        </div>
      )}

      {/* Add Products Modal */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "800px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#0f172a" }}>{modalTitle}</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedNewProducts([]);
                  setNewProductRates({});
                  setModalSearch("");
                }}
                style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#64748b" }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0" }}>
              <input
                type="text"
                placeholder="Search available products..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                style={{
                  width: "100%",
                  height: "var(--input-h, 40px)",
                  padding: "0 12px",
                  background: "rgba(248, 250, 252, 0.9)",
                  border: "1px solid #cbd5e1",
                  borderRadius: "var(--radius-sm, 8px)",
                  fontSize: "var(--font-ui, 13px)",
              color: "#0f172a",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px", background: "#f8fafc" }}>
              {filteredAvailable.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                    gap: "12px",
                  }}
                >
                  {filteredAvailable.map((product) => {
                    const isSelected = selectedNewProducts.some(
                      (p) => p.item_code === product.item_code && p.category === product.category
                    );
                    return (
                      <div
                        key={`${product.item_code}-${product.category}`}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          padding: "12px",
                          border: `1px solid ${isSelected ? "#bfdbfe" : "#e2e8f0"}`,
                          borderRadius: "8px",
                          cursor: "pointer",
                          background: isSelected ? "#eff6ff" : "#fff",
                        }}
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
                          style={{
                            marginTop: "4px",
                            marginRight: "12px",
                            width: "16px",
                            height: "16px",
                            accentColor: "#2563eb",
                            pointerEvents: "none",
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0f172a" }}>
                            {product.item_name}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                            {product.item_code} • {product.category}
                          </div>
                          {isSelected && (
                            <div style={{ marginTop: "12px" }} onClick={(e) => e.stopPropagation()}>
                              <label
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#475569",
                                  display: "block",
                                  marginBottom: "4px",
                                  fontWeight: 500,
                                }}
                              >
                                Basic Rate (₹)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={newProductRates[`${product.item_code}-${product.category}`] || ""}
                                onChange={(e) =>
                                  setNewProductRates((prev) => ({
                                    ...prev,
                                    [`${product.item_code}-${product.category}`]: e.target.value,
                                  }))
                                }
                                style={{
                                  width: "100%",
                                  height: "var(--input-h, 40px)",
                                  padding: "0 12px",
                                  background: "rgba(248, 250, 252, 0.9)",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "var(--radius-sm, 8px)",
                                  fontSize: "var(--font-ui, 13px)",
                              color: "#0f172a",
                                  outline: "none",
                                  boxSizing: "border-box",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#64748b" }}>
                  No products match your search
                </div>
              )}
            </div>

            <div
              style={{
                padding: "20px 24px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedNewProducts([]);
                  setNewProductRates({});
                  setModalSearch("");
                }}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 500,
                  color: "#475569",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={isSaving || selectedNewProducts.length === 0}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 500,
                  opacity: isSaving || selectedNewProducts.length === 0 ? 0.7 : 1,
                }}
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
