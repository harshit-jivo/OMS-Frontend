/**
 * Party Product Assignment — which products a party may be sold, and at what
 * basic rate.
 *
 * One party selected shows and edits that party's catalogue; several selected
 * is a bulk-assign mode, because the common job is "give these forty parties
 * the new SKU".
 */
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowUpTray,
  HiOutlineCube,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/dropdown";
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Field, Input } from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Stat,
  StatRow,
} from "@/components/ui/page";
import { SegmentedControl } from "@/components/ui/segmented";
import { showToast } from "@/lib/toastStore";
import { useSapParties, useSapProducts } from "../lib/sapQueries";
// SheetJS (422 kB) is fetched at import time, not page-load time — see
// utils/xlsxLoader.ts. Reading uploaded workbooks only; writing goes
// through excelExport.
import { loadXlsx, type WorkBook, type XlsxModule } from "../utils/xlsxLoader";
import { startSheetsExport } from "../utils/excelExport";
import type { Product } from "../services/ordersService";
import type { Party } from "../services/sapService";
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

type ImportPartyRow = { card_code: string; party_category: string | null };
type ImportProductRow = { item_code: string; product_category: string; basic_rate: number };

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
  getPartyCode(party) + "||" + normalizeCategory(getPartyCategory(party));
const getPartyKey = (party: SearchableParty) =>
  [getPartyCode(party), asText(party.category), asText(party.id)].filter(Boolean).join("-");

const getSelectionFromKey = (key: string) => {
  const [cardCode, category = ""] = key.split("||");
  return { card_code: cardCode, category: category || null };
};

const getPartyMetaLine = (party: SearchableParty) =>
  [getPartyCode(party), party.state, getPartyCategory(party)].filter(Boolean).join(" · ");

const mergeParties = (partyList: Party[]) => {
  const seen = new Set<string>();
  return partyList.filter((party) => {
    const key = getPartyKey(party);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getImportValue = (row: Record<string, unknown>, aliases: string[]) => {
  const aliasSet = new Set(aliases.map(normalizeHeader));
  const match = Object.entries(row).find(([key]) => aliasSet.has(normalizeHeader(key)));
  return match ? match[1] : "";
};

const getWorksheetRows = (XLSX: XlsxModule, workbook: WorkBook, sheetNames: string[]) => {
  const normalizedNames = sheetNames.map(normalizeHeader);
  const sheetName = workbook.SheetNames.find((name) =>
    normalizedNames.includes(normalizeHeader(name)),
  );
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
  });
};

const parseRate = (value: unknown) => {
  const raw = asText(value).replace(/,/g, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const money = (value: unknown) => "₹" + Number(value || 0).toFixed(2);

/** Stable empty, so the counters and `availableProducts` memo settle. */
const NO_PARTY_PRODUCTS: PartyProduct[] = [];

const CATEGORY_FILTERS = ["ALL", "OIL", "BEVERAGES", "MART"] as const;

export default function Party_Product_Assignment() {
  const queryClient = useQueryClient();

  /*
   * Parties come from the shared ["sap","parties"] key, as they do on Party
   * Assignment and the five SAP Sync tabs.
   *
   * This page used to run its own fetch path instead: a mount fetch for the
   * whole list, PLUS a 250ms-debounced `/sap/parties/?search=` on every
   * keystroke, PLUS a `partySearchRequestRef` counter to discard out-of-order
   * responses. All of it sat behind a list the page had already downloaded in
   * full, so the searching is done here now and the race cannot happen.
   */
  const { items: rawParties } = useSapParties();
  const partyOptions = useMemo(() => mergeParties(rawParties), [rawParties]);

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
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const [showAddModal, setShowAddModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [selectedNewProducts, setSelectedNewProducts] = useState<Product[]>([]);
  const [newProductRates, setNewProductRates] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  /** The product a removal has been asked about. `window.confirm` before. */
  const [confirmRemove, setConfirmRemove] = useState<PartyProduct | null>(null);
  /** The product whose rate is being edited, and the draft value. */
  const [rateEdit, setRateEdit] = useState<PartyProduct | null>(null);
  const [rateDraft, setRateDraft] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);

  /** Re-read the selected party's products. Was a direct fetch + setState. */
  const fetchPartyProducts = () =>
    queryClient.invalidateQueries({ queryKey: ["party", "products"] });

  const handleRemoveProduct = async () => {
    const product = confirmRemove;
    if (!product || selectedParties.length !== 1) return;
    setConfirmRemove(null);
    try {
      const selectedParty = getSelectionFromKey(selectedParties[0]);
      await userService.removePartyProduct(
        selectedParty.card_code,
        product.item_code,
        product.category,
      );
      showToast({
        title: "Product removed",
        message: product.item_name + " is no longer assigned to this party.",
      });
      void fetchPartyProducts();
    } catch (error) {
      console.error("Error removing product:", error);
      showToast({
        title: "Could not remove the product",
        // The old handler swallowed this failure entirely — it logged and
        // returned, so the row stayed and nothing said why.
        message: "It is still assigned. Check your connection and try again.",
      });
    }
  };

  /* ── Rate editing ────────────────────────────────────────────────────────
   * This was `prompt("Enter new basic rate for …")` followed by
   * `alert("Invalid rate entered.")` — a box that cannot validate until after
   * it closes, for a PRICE. Now it is a real number field and the confirm is
   * disabled until the value is one, per DESIGN_SYSTEM §6.
   */
  const parsedDraft = Number(rateDraft.replace(/,/g, ""));
  const rateValid = rateDraft.trim() !== "" && Number.isFinite(parsedDraft) && parsedDraft >= 0;

  const openRateEdit = (product: PartyProduct) => {
    setRateDraft(String(product.basic_rate ?? ""));
    setRateEdit(product);
  };

  const saveRate = async () => {
    const product = rateEdit;
    if (!product || !rateValid || selectedParties.length !== 1) return;
    const selectedParty = getSelectionFromKey(selectedParties[0]);
    setSavingRate(true);
    try {
      await userService.editRate(
        selectedParty.card_code,
        product.item_code,
        product.category,
        parsedDraft,
      );
      // The ONLY mutation on this page that patches instead of refetching —
      // drop it and the rate edit disappears from the screen entirely.
      queryClient.setQueryData<PartyProduct[]>(partyProductsKey, (prev) =>
        (prev ?? []).map((p) =>
          p.item_code === product.item_code && p.category === product.category
            ? { ...p, basic_rate: parsedDraft }
            : p,
        ),
      );
      showToast({
        title: "Rate updated",
        message: product.item_name + " is now " + money(parsedDraft) + ".",
      });
      setRateEdit(null);
    } catch (error) {
      console.error("Error updating rate:", error);
      showToast({ title: "Could not update the rate", message: "The old rate still applies." });
    } finally {
      setSavingRate(false);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedNewProducts.length === 0 || selectedParties.length === 0) return;
    setIsSaving(true);
    try {
      const payload = selectedNewProducts.map((p) => ({
        item_code: p.item_code,
        category: p.category,
        basic_rate: Number(newProductRates[p.item_code + "-" + p.category]) || 0,
      }));

      const partySelections = selectedParties.map(getSelectionFromKey);
      const cardCodes = [...new Set(partySelections.map((party) => party.card_code))];

      await api.post("/auth/bulk-party/assign-products/", {
        card_codes: cardCodes,
        party_selections: partySelections,
        products: payload,
      });

      const label =
        selectedParties.length > 1
          ? selectedParties.length + " parties"
          : getPartyName(
              partyOptions.find((p) => getPartySelectionKey(p) === selectedParties[0]) ||
                ({} as SearchableParty),
            ) || getSelectionFromKey(selectedParties[0]).card_code;
      showToast({
        title: "Products assigned",
        message:
          selectedNewProducts.length +
          " product" +
          (selectedNewProducts.length === 1 ? "" : "s") +
          " assigned to " +
          label +
          ".",
      });

      closeAddModal();
      if (selectedParties.length === 1) void fetchPartyProducts();
    } catch (error) {
      console.error("Error assigning products:", error);
      showToast({
        title: "Could not assign the products",
        message: "Nothing was changed. Check your connection and try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setSelectedNewProducts([]);
    setNewProductRates({});
    setModalSearch("");
  };

  const handleDownloadTemplate = () => {
    const partyRows = [
      { "Party Code": "C001", "Party Category": "" },
      { "Party Code": "C002", "Party Category": "" },
    ];
    const productRows = [
      { "Item Code": "FG001", "Product Category": "OIL", "Basic Rate": 150.5 },
      { "Item Code": "FG002", "Product Category": "BEVERAGES", "Basic Rate": 120 },
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
      const singleSheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: "",
      });
      const errors: string[] = [];
      const parsedParties: ImportPartyRow[] = [];
      const parsedProducts: ImportProductRow[] = [];
      const parsedRows: ImportRow[] = [];
      const partyLookup = new Set(partyOptions.map((party) => getPartySelectionKey(party)));
      const productLookup = new Set(
        products.map(
          (product) => asText(product.item_code) + "||" + normalizeCategory(product.category),
        ),
      );
      const hasSeparateSheets = partyRows.length > 0 || productRows.length > 0;

      if (hasSeparateSheets) {
        partyRows.forEach((row, index) => {
          const rowNumber = index + 2;
          const cardCode = asText(
            getImportValue(row, ["Party Code", "Card Code", "card_code", "CardCode"]),
          );
          const partyCategory = normalizeCategory(
            getImportValue(row, ["Party Category", "Party Cat", "Party Type", "party_category"]),
          );

          if (!cardCode) {
            errors.push("Parties row " + rowNumber + ": Party Code is required.");
            return;
          }

          const partyKey = cardCode + "||" + partyCategory;
          if (partyCategory && partyLookup.size > 0 && !partyLookup.has(partyKey)) {
            errors.push(
              "Parties row " +
                rowNumber +
                ": Party " +
                cardCode +
                " with category " +
                partyCategory +
                " was not found.",
            );
            return;
          }

          parsedParties.push({ card_code: cardCode, party_category: partyCategory || null });
        });

        productRows.forEach((row, index) => {
          const rowNumber = index + 2;
          const itemCode = asText(
            getImportValue(row, ["Item Code", "Product Code", "item_code", "ItemCode"]),
          );
          const productCategory = normalizeCategory(
            getImportValue(row, ["Product Category", "Category", "product_category"]),
          );
          const basicRate = parseRate(
            getImportValue(row, ["Basic Rate", "Price List (Basic)", "Rate", "basic_rate"]),
          );

          if (!itemCode || !productCategory || Number.isNaN(basicRate)) {
            errors.push(
              "Products row " +
                rowNumber +
                ": Item Code, Product Category and Basic Rate are required.",
            );
            return;
          }

          const productKey = itemCode + "||" + productCategory;
          if (productLookup.size > 0 && !productLookup.has(productKey)) {
            errors.push(
              "Products row " +
                rowNumber +
                ": Product " +
                itemCode +
                " with category " +
                productCategory +
                " was not found.",
            );
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
          const cardCode = asText(
            getImportValue(row, ["Party Code", "Card Code", "card_code", "CardCode"]),
          );
          const partyCategory = normalizeCategory(
            getImportValue(row, ["Party Category", "Party Cat", "Party Type", "party_category"]),
          );
          const itemCode = asText(
            getImportValue(row, ["Item Code", "Product Code", "item_code", "ItemCode"]),
          );
          const productCategory = normalizeCategory(
            getImportValue(row, ["Product Category", "Category", "product_category"]),
          );
          const basicRate = parseRate(
            getImportValue(row, ["Basic Rate", "Price List (Basic)", "Rate", "basic_rate"]),
          );

          if (!cardCode || !itemCode || !productCategory || Number.isNaN(basicRate)) {
            errors.push(
              "Row " +
                rowNumber +
                ": Party Code, Item Code, Product Category and Basic Rate are required.",
            );
            return;
          }

          const partyKey = cardCode + "||" + partyCategory;
          if (partyCategory && partyLookup.size > 0 && !partyLookup.has(partyKey)) {
            errors.push(
              "Row " +
                rowNumber +
                ": Party " +
                cardCode +
                " with category " +
                partyCategory +
                " was not found.",
            );
            return;
          }

          const productKey = itemCode + "||" + productCategory;
          if (productLookup.size > 0 && !productLookup.has(productKey)) {
            errors.push(
              "Row " +
                rowNumber +
                ": Product " +
                itemCode +
                " with category " +
                productCategory +
                " was not found.",
            );
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
          totalRows: hasSeparateSheets
            ? partyRows.length + productRows.length
            : singleSheetRows.length,
          imported: 0,
          parties: hasSeparateSheets ? parsedParties.length : undefined,
          products: hasSeparateSheets ? parsedProducts.length : undefined,
          added: 0,
          updated: 0,
          errors: errors.length ? errors : ["No valid rows were found in the file."],
        });
        return;
      }

      const groupedRows = new Map<string, ImportRow[]>();
      parsedRows.forEach((row) => {
        const key = row.card_code + "||" + (row.party_category || "");
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
        if (Array.isArray(data.errors)) apiErrors.push(...data.errors);
      }

      setImportSummary({
        totalRows: hasSeparateSheets
          ? partyRows.length + productRows.length
          : singleSheetRows.length,
        imported: parsedRows.length,
        parties: hasSeparateSheets ? parsedParties.length : undefined,
        products: hasSeparateSheets ? parsedProducts.length : undefined,
        added,
        updated,
        errors: apiErrors,
      });

      if (selectedParties.length === 1) void fetchPartyProducts();
    } catch (error) {
      console.error("Error importing party products:", error);
      setImportSummary({
        totalRows: 0,
        imported: 0,
        added: 0,
        updated: 0,
        errors: ["The file could not be read. Check it is a valid .xlsx, .xls or .csv."],
      });
    } finally {
      setIsImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  /* ── Derived ──────────────────────────────────────────────────────────── */

  const partyPickerOptions = useMemo<MultiSelectOption<string>[]>(
    () =>
      partyOptions.map((party) => ({
        value: getPartySelectionKey(party),
        label: getPartyName(party) || getPartyCode(party),
        hint: getPartyMetaLine(party),
        keywords: asText(party.main_group),
      })),
    [partyOptions],
  );

  const isSingleParty = selectedParties.length === 1;
  const selectedPartyDetails = isSingleParty
    ? partyOptions.find((p) => getPartySelectionKey(p) === selectedParties[0])
    : null;
  const selectedPartyCategories = new Set(
    selectedParties
      .map((partyKey) => getSelectionFromKey(partyKey).category)
      .filter(Boolean)
      .map(normalizeCategory),
  );

  const displayProducts = assignedProducts.filter((p) =>
    categoryFilter === "ALL" ? true : p.category === categoryFilter,
  );

  const totalProducts = assignedProducts.length;
  const oilCount = assignedProducts.filter((p) => p.category === "OIL").length;
  const beverageCount = assignedProducts.filter((p) => p.category === "BEVERAGES").length;
  const martCount = assignedProducts.filter((p) => p.category === "MART").length;

  const availableProducts = products.filter(
    (p) =>
      (selectedPartyCategories.size === 0 ||
        selectedPartyCategories.has(normalizeCategory(p.category))) &&
      !assignedProducts.some((ap) => ap.item_code === p.item_code && ap.category === p.category),
  );

  const filteredAvailable = availableProducts.filter(
    (p) =>
      (p.item_name || "").toLowerCase().includes(modalSearch.toLowerCase()) ||
      (p.item_code || "").toLowerCase().includes(modalSearch.toLowerCase()),
  );

  const modalTitle =
    selectedParties.length > 1
      ? "Add products to " + selectedParties.length + " parties"
      : "Add products to " +
        (selectedPartyDetails
          ? getPartyName(selectedPartyDetails) +
            " (" +
            getPartyCategory(selectedPartyDetails) +
            ")"
          : "");

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Order Config" }, { label: "Party Products" }]} />

      <PageHeader
        eyebrow="Order Config"
        title="Party Product Assignment"
        description="Which products a party may be sold, and the basic rate each is sold at."
        actions={
          <>
            <Button variant="ghost" onClick={handleDownloadTemplate}>
              <HiOutlineArrowDownTray aria-hidden="true" />
              Template
            </Button>
            <Button
              variant="ghost"
              onClick={() => fileInput.current?.click()}
              disabled={isImporting}
            >
              <HiOutlineArrowUpTray aria-hidden="true" />
              {isImporting ? "Importing…" : "Bulk import"}
            </Button>
          </>
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        aria-label="Upload Excel file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImportExcel(file);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Choose parties</CardTitle>
          {selectedParties.length > 1 && (
            <Button variant="ghost" size="xs" onClick={() => setSelectedParties([])}>
              Clear all
            </Button>
          )}
        </CardHeader>

        <Field
          label="Parties"
          hint="One party to see and edit its catalogue; several to assign the same products to all of them."
        >
          {(control) => (
            <MultiSelect
              {...control}
              value={selectedParties}
              onChange={setSelectedParties}
              options={partyPickerOptions}
              searchable
              searchPlaceholder="Party name, code, state or group…"
              placeholder="Search and select parties"
              maxShown={60}
              emptyText="No parties loaded"
              selectAll={false}
              className="max-w-[520px]"
            />
          )}
        </Field>

        {selectedParties.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {selectedParties.map((partyKey) => {
              const p = partyOptions.find((x) => getPartySelectionKey(x) === partyKey);
              const fallback = getSelectionFromKey(partyKey);
              return (
                <span
                  key={partyKey}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-strong py-0.5 pl-2.5 pr-1 text-[12px] text-ink"
                >
                  {p ? getPartyName(p) || fallback.card_code : fallback.card_code}
                  <span className="text-[11px] text-subtle">
                    {p ? getPartyCategory(p) : fallback.category}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 rounded-full"
                    onClick={() =>
                      setSelectedParties((prev) => prev.filter((k) => k !== partyKey))
                    }
                    aria-label={"Remove " + (p ? getPartyName(p) : fallback.card_code)}
                  >
                    <HiOutlineXMark />
                  </Button>
                </span>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Multi-party assignment ── */}
      {selectedParties.length > 1 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Multi-party assignment</CardTitle>
              <p className="m-0 mt-0.5 text-[12px] text-subtle">
                {selectedParties.length} parties selected — products are assigned to all of them
                at once.
              </p>
            </div>
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              <HiOutlinePlus aria-hidden="true" />
              Add products to all
            </Button>
          </CardHeader>

          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 p-0">
            {selectedParties.map((partyKey) => {
              const p = partyOptions.find((x) => getPartySelectionKey(x) === partyKey);
              const fallback = getSelectionFromKey(partyKey);
              return (
                <li
                  key={partyKey}
                  className="rounded-sm border border-line bg-surface px-3 py-2 text-[13px]"
                >
                  <span className="block truncate font-semibold text-ink">
                    {p ? getPartyName(p) || fallback.card_code : fallback.card_code}
                  </span>
                  <span className="text-[11.5px] text-subtle">
                    {p
                      ? getPartyMetaLine(p)
                      : [fallback.card_code, fallback.category].filter(Boolean).join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ── One party's catalogue ── */}
      {selectedParties.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineCube}
            title="No party selected"
            hint="Pick one party to see what it is assigned, or several to bulk-assign."
          />
        </Card>
      ) : selectedPartyDetails ? (
        <>
          <StatRow>
            <Stat label="Total assigned" value={totalProducts} icon={HiOutlineCube} />
            <Stat label="Oil" value={oilCount} />
            <Stat label="Beverages" value={beverageCount} />
            <Stat label="Mart" value={martCount} />
          </StatRow>

          <Card className="p-0">
            <CardHeader className="mb-0 flex-wrap gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <CardTitle>{getPartyName(selectedPartyDetails)}</CardTitle>
                <p className="m-0 mt-0.5 text-[12px] text-subtle">
                  <span className="font-mono text-ink">
                    {getPartyCode(selectedPartyDetails)}
                  </span>{" "}
                  · {selectedPartyDetails.state || "Unknown state"} ·{" "}
                  {selectedPartyDetails.main_group || "Unknown group"} ·{" "}
                  {getPartyCategory(selectedPartyDetails) || "Unknown category"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  size="xs"
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={CATEGORY_FILTERS.map((cat) => ({ value: cat, label: cat }))}
                  aria-label="Filter by category"
                />
                <Button variant="primary" size="xs" onClick={() => setShowAddModal(true)}>
                  <HiOutlinePlus aria-hidden="true" />
                  Add products
                </Button>
              </div>
            </CardHeader>

            {displayProducts.length === 0 ? (
              <EmptyState
                icon={HiOutlineCube}
                title={
                  categoryFilter === "ALL"
                    ? "Nothing assigned to this party"
                    : "No " + categoryFilter + " products assigned"
                }
                hint="This party cannot be sold anything until a product is assigned to it."
              />
            ) : (
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2 p-4">
                {displayProducts.map((product) => (
                  <li
                    key={product.item_code + "-" + product.category}
                    className="flex flex-col justify-between gap-2 rounded-sm border border-line bg-card p-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[11.5px] text-subtle">
                          {product.item_code}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Badge tone="info">{product.category}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            onClick={() => setConfirmRemove(product)}
                            aria-label={"Remove " + product.item_name}
                          >
                            <HiOutlineXMark />
                          </Button>
                        </span>
                      </div>
                      <p className="m-0 mt-1 text-[13px] font-semibold text-ink">
                        {product.item_name}
                      </p>
                      <p className="m-0 text-[11.5px] text-subtle">
                        {[product.brand, product.variety, product.sal_pack_unit]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="flex items-end justify-between gap-2 border-t border-line pt-2">
                      <span>
                        <span className="block text-[11px] uppercase tracking-wide text-subtle">
                          Rate
                        </span>
                        <span className="text-[15px] font-bold text-ink tabular-nums">
                          {money(product.basic_rate)}
                        </span>
                      </span>
                      <Button size="xs" onClick={() => openRateEdit(product)}>
                        Edit rate
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}

      {/* ── Add products ── */}
      <Dialog
        open={showAddModal}
        onOpenChange={(next) => {
          if (!next) closeAddModal();
        }}
      >
        {showAddModal && (
          <DialogContent title={modalTitle} size="lg">
            <DialogHeader>
              <DialogTitle>{modalTitle}</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <FilterBar className="border-0 bg-transparent p-0">
                <FilterSearch
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="Product name or code…"
                  fieldClassName="min-w-[240px]"
                />
                <FilterCount>
                  {filteredAvailable.length} available · {selectedNewProducts.length} chosen
                </FilterCount>
              </FilterBar>

              {filteredAvailable.length === 0 ? (
                <EmptyState
                  icon={HiOutlineCube}
                  title="No products match"
                  hint="Products already assigned to this party are not listed."
                />
              ) : (
                <ul className="m-0 max-h-[380px] list-none divide-y divide-line overflow-y-auto rounded-sm border border-line p-0">
                  {filteredAvailable.map((product) => {
                    const key = product.item_code + "-" + product.category;
                    const isSelected = selectedNewProducts.some(
                      (p) => p.item_code === product.item_code && p.category === product.category,
                    );
                    return (
                      <li key={key} className={isSelected ? "bg-brand-soft" : ""}>
                        <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 text-[13px]">
                          <input
                            type="checkbox"
                            className="mt-1 size-3.5 shrink-0 accent-brand"
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) {
                                setSelectedNewProducts(
                                  selectedNewProducts.filter(
                                    (p) =>
                                      !(
                                        p.item_code === product.item_code &&
                                        p.category === product.category
                                      ),
                                  ),
                                );
                              } else {
                                setSelectedNewProducts([...selectedNewProducts, product]);
                              }
                            }}
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="font-semibold text-ink">{product.item_name}</span>
                            <span className="text-[11.5px] text-subtle">
                              {product.item_code} · {product.category}
                            </span>
                            {isSelected && (
                              // Clicks inside the rate field must not toggle
                              // the checkbox the label wraps.
                              <span
                                className="mt-1 flex items-center gap-2"
                                onClick={(e) => e.preventDefault()}
                              >
                                <span className="text-[11.5px] text-subtle">Rate (₹)</span>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  aria-label={"Rate for " + product.item_name}
                                  value={newProductRates[key] || ""}
                                  onChange={(e) =>
                                    setNewProductRates((prev) => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))
                                  }
                                  className="h-control-sm w-32"
                                />
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DialogBody>
            <DialogFooter>
              <Button onClick={closeAddModal} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleBulkAssign()}
                disabled={isSaving || selectedNewProducts.length === 0}
                title={
                  selectedNewProducts.length === 0 ? "Tick at least one product first." : undefined
                }
              >
                {isSaving
                  ? "Saving…"
                  : selectedParties.length > 1
                    ? "Add " +
                      selectedNewProducts.length +
                      " products to " +
                      selectedParties.length +
                      " parties"
                    : "Add " + selectedNewProducts.length + " products"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Edit one rate ── */}
      <Dialog
        open={Boolean(rateEdit)}
        onOpenChange={(next) => {
          if (!next && !savingRate) setRateEdit(null);
        }}
      >
        {rateEdit && (
          <DialogContent title="Edit rate" size="sm">
            <DialogHeader>
              <DialogTitle>Basic rate for {rateEdit.item_name}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Field
                label="Basic rate (₹)"
                required
                hint={"Currently " + money(rateEdit.basic_rate) + ". Zero or more."}
                error={
                  rateDraft.trim() !== "" && !rateValid
                    ? "Enter a number of zero or more."
                    : undefined
                }
              >
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    min="0"
                    step="0.01"
                    value={rateDraft}
                    onChange={(e) => setRateDraft(e.target.value)}
                    autoFocus
                  />
                )}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setRateEdit(null)} disabled={savingRate}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void saveRate()}
                disabled={savingRate || !rateValid}
                title={rateValid ? undefined : "Enter a rate of zero or more first."}
              >
                {savingRate ? "Saving…" : "Save rate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Remove one product ── */}
      <Dialog
        open={Boolean(confirmRemove)}
        onOpenChange={(next) => {
          if (!next) setConfirmRemove(null);
        }}
      >
        {confirmRemove && (
          <DialogContent title="Remove product" size="sm">
            <DialogHeader>
              <DialogTitle>Remove {confirmRemove.item_name}?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Notice tone="hold">
                This party can no longer be sold this product, and its {money(confirmRemove.basic_rate)}{" "}
                rate is forgotten. Orders already placed are unaffected.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setConfirmRemove(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => void handleRemoveProduct()}>
                Remove product
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── What the import did ── */}
      <Dialog
        open={Boolean(importSummary)}
        onOpenChange={(next) => {
          if (!next) setImportSummary(null);
        }}
      >
        {importSummary && (
          <DialogContent title="Import result" size="md">
            <DialogHeader>
              <DialogTitle>
                {importSummary.errors.length ? "Import finished with errors" : "Import complete"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <p className="m-0 text-[13px] text-body">
                {importSummary.parties !== undefined && importSummary.products !== undefined
                  ? "Mapped " +
                    importSummary.products +
                    " products to " +
                    importSummary.parties +
                    " parties."
                  : "Read " +
                    importSummary.imported +
                    " of " +
                    importSummary.totalRows +
                    " rows."}
              </p>
              <div className="flex gap-4">
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ok">
                    {importSummary.added}
                  </strong>
                  added
                </span>
                <span className="text-[13px]">
                  <strong className="block text-[20px] font-bold text-ink">
                    {importSummary.updated}
                  </strong>
                  updated
                </span>
                <span className="text-[13px]">
                  <strong
                    className={
                      "block text-[20px] font-bold " +
                      (importSummary.errors.length ? "text-bad" : "text-ink")
                    }
                  >
                    {importSummary.errors.length}
                  </strong>
                  failed
                </span>
              </div>

              {importSummary.errors.length > 0 && (
                <>
                  <Notice tone="bad">
                    These rows were not applied. Everything else was — the import does not roll
                    back.
                  </Notice>
                  {/* Every error, not the first five. The old summary showed
                      five and said "N more rows had issues", so the list of
                      which rows to fix was unreachable. */}
                  <ul className="m-0 max-h-64 list-none space-y-1 overflow-y-auto rounded-sm border border-line bg-surface p-2 text-[12px] text-body">
                    {importSummary.errors.map((message, index) => (
                      <li key={index} className="border-b border-line/60 pb-1 last:border-0">
                        {message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => setImportSummary(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
