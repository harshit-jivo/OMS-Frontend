/**
 * Everything the Add Sales page KNOWS, with nothing it draws.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `Add_Sales.tsx` was 4,282 lines holding two mutually exclusive forms — the
 * 4-step wizard and an 850-line legacy `<form>` — over one shared pile of
 * state. The refactor plan (3.4) cannot start until those two are separable,
 * and they cannot be separated while the state they share is declared inline
 * between them.
 *
 * So this is step 1, and it is deliberately a MOVE, not a rewrite: the state,
 * effects, fetchers, derivations and handlers below are the same code in the
 * same order, lifted out whole. Anything that returns JSX stayed behind.
 *
 * The hook returns one object rather than a tuple of ninety values. Callers
 * destructure what they need, and `SalesOrderForm` is its inferred type, so a
 * value added here needs no second declaration to reach a consumer.
 *
 * `useWizard` is decided from `location.state` and never changes for the life
 * of a mount, which is what makes one hook safe for both forms: only ever one
 * of them is rendered against it.
 */
import { useState, useEffect, useRef } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";

import { getCurrentUser } from "@/services/authService";
import { ordersService } from "@/services/ordersService";
import type {
  CreateOrder,
  Order,
  OrderItem,
  Product,
  PartyProduct,
  SchemeProduct,
} from "@/services/ordersService";
import { schemeService } from "@/services/schemeService";
import type { PreviewLine, SchemeProposal } from "@/services/schemeService";
import { useUILabels, useFieldConfig } from "@/services/uiConfig";
import { userService } from "@/services/userService";

import {
  createEmptyRow,
  nextRowUid,
  rowProblem,
  type SalesRow,
  type SalesRowScheme,
} from "../salesOrderRow";
import { type OrderHeaderInput, type PoFieldConfig } from "./orderHeaderSchema";
import { NO_PROBLEMS, hasProblems, orderProblems } from "./orderProblems";
import {
  FOC_TOKEN_BASIC_PRICE,
  applyFocPricingToRow,
  computeLandingPrice,
  recalculateRowTotals as recalculateRowTotalsFor,
} from "./rowTotals";

export type RowDropdownOption = {
  value: string;
  label: string;
};

/** The Add Item facet rail, widest first — picking one clears the ones below. */
export type PickerFacet = "category" | "brand" | "variety" | "type";
export const PICKER_FACETS: PickerFacet[] = ["category", "brand", "variety", "type"];

/* The four option lists this form fetches. The services return `response.data`
 * untyped, so these were `any[]` and every read of `.value` / `.bpl_id` /
 * `.name` was unchecked. Each type below is exactly the fields this file and
 * its two form components actually read — not a guess at the full API row. */
type PartyOption = {
  value: string;
  label?: string | null;
  /** The party's name as SAP spells it. Sent on the order payload, where
   *  `label` (which carries the category suffix) would be wrong. */
  card_name?: string | null;
  category?: string | null;
  state?: string | null;
};

type BranchOption = {
  bpl_id: string | number;
  bpl_name?: string | null;
  /** Shown on the wizard's review step, and only there. */
  address?: string | null;
};

type CompanyOption = { id: string | number; name?: string | null };

type AddressOption = {
  id: string | number;
  address_id?: string | number | null;
  address_name?: string | null;
  full_address?: string | null;
};

const normalizeOptionText = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

/** The signed-in user's category, which the API has returned three different
 *  ways over time: a nested object, a flat `category_name`, or a bare string.
 *  The `||` chain (not `??`) is deliberate — an empty string falls through to
 *  the next shape, which is what made it work across all three. */
type ProfileCategory =
  | { category?: string | null; name?: string | null }
  | string
  | null
  | undefined;

const getUserCategoryText = (user: { category?: ProfileCategory; category_name?: string | null } | null | undefined) => {
  const category = user?.category;
  const nested = typeof category === "object" && category !== null ? category : undefined;
  return String(
    nested?.category || nested?.name || user?.category_name ||
      (typeof category === "string" ? category : "") || "",
  ).trim();
};

/** Remove every "(card_code)" occurrence from a party name. The party list's
 *  label is "Name (CODE)", and saving that label back into card_name — then
 *  re-appending the code on the next edit — makes the code pile up
 *  ("Name (CODE) (CODE) (CODE)"). Stripping first keeps card_name the clean name. */
const stripCardCode = (name: string | null | undefined, code: string | null | undefined) => {
  const text = String(name ?? "").trim();
  const trimmedCode = String(code ?? "").trim();
  if (!text || !trimmedCode) return text;
  const escaped = trimmedCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\s*\\(\\s*${escaped}\\s*\\)`, "g"), "").trim();
};

type EditOrderLocationState = {
  editOrderId?: number;
  returnTo?: string;
  mode?: "edit" | "duplicate";
  allowPoNumber?: boolean;
};

type EditOrderFallback = {
  cardName: string;
  partyLabel: string;
  billAddress: string;
  shipAddress: string;
};

type OrderSaveSuccess = {
  orderId: string;
  nextStage: string;
  message: string;
};

export type AddSalesProps = {
  focMode?: boolean;
};

const emptyEditOrderFallback: EditOrderFallback = {
  cardName: "",
  partyLabel: "",
  billAddress: "",
  shipAddress: "",
};

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDefaultDeliveryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return formatDateInput(date);
};

export function useSalesOrderForm({ focMode = false }: AddSalesProps = {}) {
  const { t } = useUILabels();
  const { field } = useFieldConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = (location.state as EditOrderLocationState | null) ?? null;
  const editOrderId =
    typeof locationState?.editOrderId === "number" ? locationState.editOrderId : null;
  const mode = locationState?.mode ?? (editOrderId ? "edit" : "create");
  const returnTo = locationState?.returnTo || "/Order_Tracking";
  const isEditMode = mode === "edit" && editOrderId !== null;
  const isDuplicateMode = mode === "duplicate" && editOrderId !== null;
  const isLoadingFromOrder = isEditMode || isDuplicateMode;
  const isFocMode = focMode && !isLoadingFromOrder;
  const [userDefaultCategory, setUserDefaultCategory] = useState("");
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [selectedPartyCategory, setSelectedPartyCategory] = useState("");
  const [partySearch, setPartySearch] = useState("");
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const [dispatchDropdownOpen, setDispatchDropdownOpen] = useState(false);
  const [billSearch, setBillSearch] = useState("");
  const [billDropdownOpen, setBillDropdownOpen] = useState(false);
  const [shipSearch, setShipSearch] = useState("");
  const [shipDropdownOpen, setShipDropdownOpen] = useState(false);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [openRowDropdown, setOpenRowDropdown] = useState<string | null>(null);
  const [branch, setBranch] = useState<BranchOption[]>([]);
  const [billAddress, setBillAddress] = useState<AddressOption[]>([]);
  const [shipAddress, setShipAddress] = useState<AddressOption[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<CompanyOption[]>([]);
  const [partyProducts, setPartyProducts] = useState<PartyProduct[]>([]);
  // The legacy picker's options, keyed by `row.uid` — see SalesRow for why a
  // position key was not safe here.
  const [schemeOptions, setSchemeOptions] = useState<Record<string, SchemeProduct[]>>({});
  const [stateCode, setStateCode] = useState<string | null>(null);
  // v2 engine proposals, keyed by `row.uid`. Resolved from the party's targeting
  // (vendor / state / main group), not chosen by the user. See schemeService.
  const [schemeProposals, setSchemeProposals] = useState<Record<string, SchemeProposal[]>>({});
  const [editOrderFallback, setEditOrderFallback] =
    useState<EditOrderFallback>(emptyEditOrderFallback);
  /**
   * Whether the user has tried to save yet.
   *
   * Problems are computed on every render, but showing them before the first
   * submit means a form that is red the moment it opens. After that first
   * attempt they stay live, so a field stops complaining as soon as it is
   * fixed rather than at the next submit.
   */
  const [submitAttempted, setSubmitAttempted] = useState(false);
  /** Why a row would not confirm, by `row.uid`. Set on a failed confirm, cleared on a good one. */
  const [confirmProblems, setConfirmProblems] = useState<Record<string, string>>({});
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<OrderSaveSuccess | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [lastSaveWasDraft, setLastSaveWasDraft] = useState(false);
  const [isLoadingEditOrder, setIsLoadingEditOrder] = useState(false);
  const [editOrderIsFoc, setEditOrderIsFoc] = useState(false);
  const [editOrderIsDraft, setEditOrderIsDraft] = useState(false);
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const dispatchDropdownRef = useRef<HTMLDivElement>(null);
  const dispatchInfoRef = useRef<HTMLDivElement>(null);
  const billDropdownRef = useRef<HTMLDivElement>(null);
  const shipDropdownRef = useRef<HTMLDivElement>(null);
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    parties: "",
    dispatch: "",
    date: formatDateInput(new Date()),
    billAddress: "",
    shipAddress: "",
    Deliverydate: getDefaultDeliveryDate(),
    poNumber: "",
    company: "",
    comment: "",
    // Company-3 (Mart) orders pick a dispatch warehouse, sent as
    // `warehouse_code` on submit. Defaults to GP-FGM.
    warehouse: "GP-FGM",
  });

  /**
   * The line items, held by react-hook-form.
   *
   * WHY, given `useState<SalesRow[]>` worked
   * ---------------------------------------
   * Step 7 replaces the `alert()` chain with a message beside the field that
   * caused it, and a row field's address is `rows.3.boxes` — something only a
   * field array can name. `useFieldArray` is what lets step 7 exist; on its own
   * it changes nothing a user can see, which is why this step is verified by
   * the same 76 screenshots rather than by new ones.
   *
   * It was blocked until step 3: `remove` and `move` renumber silently, and the
   * two scheme maps beside `rows` were keyed by position, so any reorder handed
   * one row's schemes to another with nothing to hook. Keyed by `row.uid`, that
   * is no longer possible.
   *
   * `keyName` is left at RHF's default ("id") on purpose — pointing it at `uid`
   * would have RHF overwrite our own identity with one of its own, which is
   * exactly the thing the scheme maps must not have happen.
   */
  const rowForm = useForm<{ rows: SalesRow[] }>({
    defaultValues: { rows: [createEmptyRow()] },
  });
  const rowArray = useFieldArray({ control: rowForm.control, name: "rows" });
  /**
   * The live rows.
   *
   * `form.watch(...)`, NOT `useWatch({ control, name: "rows" })` — and that is
   * not a style preference. `useWatch` delivers its value through a
   * subscription, so within the render it triggers, `rows` is still the
   * PREVIOUS array. These inputs are controlled from it, so a keystroke landed
   * in `update()`, the re-render painted the value from before that keystroke,
   * and the character was gone: typing "12" into Boxes left "2". `watch` reads
   * the form's current values at render time, so the input shows what was just
   * typed into it.
   *
   * `fields` from `useFieldArray` is not used for rendering at all: it is a
   * snapshot refreshed only on array operations, and the components key on
   * `row.uid` rather than on RHF's generated id.
   */
  const rows = rowForm.watch("rows");

  /**
   * The old `setRows`, kept so the twenty call sites that only ever replaced
   * the whole list did not have to become twenty different array operations.
   *
   * Wholesale replacement is the right operation for those — resetting the
   * form, loading an order for edit, seeding a default category. It is the
   * WRONG one for editing a single row, because `replace` rebuilds every field
   * in the array; the per-row handlers below use `update`, `append` and
   * `remove` instead.
   */
  const setRows = (next: SalesRow[] | ((prev: SalesRow[]) => SalesRow[])) =>
    rowArray.replace(typeof next === "function" ? next(rowForm.getValues("rows")) : next);

  /**
   * Change ONE row, leaving the rest of the array alone.
   *
   * Every per-row handler used to map over the whole list to rebuild one
   * element. The components render from the watched values and key on
   * `row.uid`, so React reconciles by identity either way — but the old shape
   * made "which row does this handler touch" a thing you worked out from a
   * comparison inside a `.map`, and it is now the first argument.
   */
  /** Add one row to the end. */
  const appendRow = (row: SalesRow) => rowArray.append(row);

  const updateRow = (index: number, updater: (row: SalesRow) => SalesRow) => {
    const current = rowForm.getValues("rows")[index];
    if (!current) return;
    rowArray.update(index, updater(current));
  };
  const [currentStep, setCurrentStep] = useState(1);
  const [dispatchInfoOpen, setDispatchInfoOpen] = useState(false);
  const [itemModalIndex, setItemModalIndex] = useState<number | null>(null);
  const [itemModalSnapshot, setItemModalSnapshot] = useState<SalesRow | null>(null);
  const [itemModalIsNew, setItemModalIsNew] = useState(false);
  // The Add Item modal opens on the product picker — one search box over the
  // whole party catalogue, with the facet rail as the slower route to the same
  // place. Once a product is picked the modal switches to its quantity fields.
  const [isPickingItem, setIsPickingItem] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const isFocOrder = isFocMode || editOrderIsFoc;
  // Admin-controlled PO field behaviour (label + enabled + required). Defaults
  // preserve the original hardcoded behaviour if config hasn't loaded yet.
  const poField = field("po_number", {
    label: "PO Number",
    enabled: true,
    required: false,
  });
  // PO is available to anyone on the order-create page (not billing-only); the
  // admin `enabled` flag decides whether it shows. In EDIT mode the original
  // `allowPoNumber` guard is preserved so editing an existing order doesn't
  // newly expose PO where it wasn't intended.
  const canEditPoNumber = poField.enabled && (!isEditMode || locationState?.allowPoNumber === true);
  // The guided 4-step wizard is used for both the standard create flow and the
  // FOC create flow, so Add Sales and Add FOC share the same UI. FOC-specific
  // behaviour (price forced to 0, no scheme panel) is handled via `isFocOrder`.
  // Edit and Duplicate modes keep the original single-page form.
  const useWizard = mode === "create" && !isLoadingFromOrder;

  // Use Effects
  useEffect(() => {
    fetchPartyName();
    fetchBranch();
    fetchProducts();
    fetchCompany();
    fetchCurrentUserProfile();
  }, []);

  useEffect(() => {
    if (!isLoadingFromOrder) {
      setEditOrderIsFoc(false);
      setEditOrderIsDraft(false);
    }
  }, [isLoadingFromOrder]);

  const fetchCurrentUserProfile = async () => {
    try {
      const user = await getCurrentUser();
      const profileCategory = getUserCategoryText(user);
      setUserDefaultCategory(profileCategory);
      if (profileCategory && !isLoadingFromOrder) {
        setSelectedPartyCategory((current) => current || profileCategory);
      }
    } catch (error) {
      console.log("Error fetching current user:", error);
      setUserDefaultCategory("");
    }
  };

  useEffect(() => {
    if (isLoadingFromOrder || formData.dispatch || branch.length === 0) return;
    setFormData((prev) => ({
      ...prev,
      dispatch: prev.dispatch || String(branch[0]?.bpl_id || ""),
    }));
  }, [branch, formData.dispatch, isLoadingFromOrder]);

  useEffect(() => {
    if (isLoadingFromOrder || formData.company || company.length === 0) return;
    const jivoCompany = company.find((item) =>
      normalizeOptionText(item?.name).includes("jivo wellness"),
    );
    if (!jivoCompany) return;
    setFormData((prev) => ({
      ...prev,
      company: prev.company || String(jivoCompany.id || ""),
    }));
  }, [company, formData.company, isLoadingFromOrder]);

  // For a Mart order (party category MART) auto-select the Mart company so the
  // Company field shows "Mart" rather than a blank picker, and the Warehouse panel
  // (company 3 = mart) shows with its default. Runs in create AND edit. Company 3
  // is already treated as Mart, so it is left untouched.
  useEffect(() => {
    if (company.length === 0) return;
    if (normalizeOptionText(selectedPartyCategory) !== "mart") return;
    if (Number(formData.company) === 3) return;
    const mart = company.find((item) => normalizeOptionText(item?.name).includes("mart"));
    if (!mart || String(formData.company) === String(mart.id)) return;
    setFormData((prev) => ({ ...prev, company: String(mart.id) }));
  }, [company, selectedPartyCategory, formData.company]);

  useEffect(() => {
    if (isLoadingFromOrder || !userDefaultCategory) return;

    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.category || row.confirmed) return row;
        const matchedCategory =
          category.find(
            (itemCategory) =>
              normalizeOptionText(itemCategory) === normalizeOptionText(userDefaultCategory),
          ) || (category.length === 0 ? userDefaultCategory : "");

        return matchedCategory ? { ...row, category: matchedCategory } : row;
      }),
    );
    // `setRows` is a plain function now rather than a `useState` setter, so it
    // is a new identity on every render and listing it would re-run this on
    // every render. It reads nothing from the render it was created in — it
    // calls `getValues` — so leaving it out is safe rather than merely quiet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, isLoadingFromOrder, userDefaultCategory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
        setPartyDropdownOpen(false);
      }
      if (billDropdownRef.current && !billDropdownRef.current.contains(event.target as Node)) {
        setBillDropdownOpen(false);
      }
      if (
        dispatchDropdownRef.current &&
        !dispatchDropdownRef.current.contains(event.target as Node)
      ) {
        setDispatchDropdownOpen(false);
      }
      if (dispatchInfoRef.current && !dispatchInfoRef.current.contains(event.target as Node)) {
        setDispatchInfoOpen(false);
      }
      if (shipDropdownRef.current && !shipDropdownRef.current.contains(event.target as Node)) {
        setShipDropdownOpen(false);
      }
      if (
        companyDropdownRef.current &&
        !companyDropdownRef.current.contains(event.target as Node)
      ) {
        setCompanyDropdownOpen(false);
      }
      if (!(event.target as Element).closest(".sl-row-dropdown")) {
        setOpenRowDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch Functions

  const fetchCompany = async () => {
    try {
      const data = await userService.getCompany();
      setCompany(data);
    } catch (error) {
      console.log("Error fetching Company:", error);
    }
  };

  const fetchPartyName = async () => {
    try {
      const data = await ordersService.getPartyName();
      setParties(data);
    } catch (error) {
      console.log("Error fetching parties name:", error);
    }
  };

  const fetchBranch = async () => {
    try {
      const data = await ordersService.getBranches();
      setBranch(data);
    } catch (error) {
      console.log("Error fetching dispatch data:", error);
    }
  };

  const fetchPartyAddresses = async (card_code: string, partyCategory = "") => {
    try {
      const data = await ordersService.getPartyAdd(card_code, partyCategory);
      const billTo = Array.isArray(data.bill_to) ? data.bill_to : [];
      const shipTo = Array.isArray(data.ship_to) ? data.ship_to : [];
      setBillAddress(billTo.length > 0 ? billTo : shipTo);
      setShipAddress(shipTo.length > 0 ? shipTo : billTo);
      return data;
    } catch (error) {
      console.log("Error fetching addresses:", error);
      return null;
    }
  };

  const fetchPartyCategories = async (card_code: string, partyCategory = "") => {
    try {
      let partyProductsData = await ordersService.getPartyProduct(card_code);
      if (partyCategory) {
        partyProductsData = partyProductsData.filter(
          (p: PartyProduct) =>
            String(p.category || "").toUpperCase() === partyCategory.toUpperCase(),
        );
      }
      setPartyProducts(partyProductsData);

      console.log("Fetched party products:", partyProductsData);
      const categories = [
        ...new Set(partyProductsData.map((p: PartyProduct) => p.category)),
      ] as string[];
      setCategory(categories);

      return partyProductsData;
    } catch (error) {
      console.log("Error fetching categories:", error);
      return [];
    }
  };

  const fetchProducts = async () => {
    const data = await ordersService.getProducts();
    setProducts(data);
  };

  const getProductType = (itemName: string) => {
    const match = itemName.match(/(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i);
    return match ? `${match[1]} ${match[2].toUpperCase()}` : "Others";
  };

  const valueToString = (value: string | number | null | undefined) =>
    value === null || value === undefined || value === "" ? "" : String(value);

  const getPartyStateCode = (cardCode: string, partyCategory = "") => {
    const selectedParty = parties.find(
      (party) =>
        party.value === cardCode &&
        (!partyCategory ||
          String(party.category || "").toUpperCase() === partyCategory.toUpperCase()),
    );
    return selectedParty?.state ? String(selectedParty.state) : "";
  };

  const mergeOrderItemsIntoPartyProducts = (sourceProducts: PartyProduct[], order: Order) => {
    const productMap = new Map<string, PartyProduct>();

    sourceProducts.forEach((product) => {
      const key = `${product.item_code || product.item_name}|${product.category || ""}`;
      productMap.set(key, product);
    });

    order.items?.forEach((item) => {
      const key = `${item.item_code || item.item_name}|${item.category || ""}`;
      if (productMap.has(key)) return;

      productMap.set(key, {
        item_code: item.item_code || "",
        item_name: item.item_name || "",
        category: item.category || "",
        brand: item.brand || "",
        variety: item.variety || "",
        sal_factor2: item.pcs || "",
        sal_pack_unit:
          Number(item.qty) > 0 ? String(Number(item.ltrs || 0) / Number(item.qty)) : "",
        tax_rate: item.tax_rate || "",
        basic_rate: item.price_list_basic || "",
      });
    });

    return Array.from(productMap.values());
  };

  const mapOrderToRows = (order: Order): SalesRow[] => {
    // Combo companion lines are re-derived from their parent on every render, so
    // loading them back as editable rows would both duplicate them in the list
    // and send them twice on save.
    const orderItems = (Array.isArray(order.items) ? order.items : []).filter(
      (item) => !item.is_auto_free,
    );

    return orderItems.length > 0
      ? orderItems.map((item) => {
          const itemWithExtras = item as OrderItem & {
            scheme?: number | string | null;
            is_scheme_visible?: boolean;
          };
          const itemSchemes =
            Array.isArray(item.schemes) && item.schemes.length > 0
              ? item.schemes.map((scheme) => ({
                  scheme: scheme.scheme_id ? String(scheme.scheme_id) : "",
                  schemeQty: valueToString(scheme.scheme_qty ?? scheme.qty_scheme),
                }))
              : [];
          const schemeId = itemSchemes[0]?.scheme || item.scheme_id || itemWithExtras.scheme;
          const isSchemeVisible = Boolean(
            itemSchemes.length ||
            schemeId ||
            item.scheme_name ||
            item.scheme_qty ||
            itemWithExtras.is_scheme_visible,
          );

          return {
            // A loaded order's lines get uids the same way a typed one does —
            // the maps keyed by them do not care where a row came from.
            uid: nextRowUid(),
            category: item.category || "",
            brand: item.brand || "",
            variety: item.variety || "",
            type: item.item_type || getProductType(item.item_name || ""),
            item: item.item_name || "",
            isScheme: isSchemeVisible,
            scheme: schemeId ? String(schemeId) : "",
            schemeQty: isSchemeVisible
              ? valueToString(itemSchemes[0]?.schemeQty || item.scheme_qty)
              : "",
            schemes: itemSchemes.length
              ? itemSchemes
              : isSchemeVisible && schemeId
                ? [{ scheme: String(schemeId), schemeQty: valueToString(item.scheme_qty) }]
                : [],
            // schemeLtrs: isSchemeVisible && schemeLtrs > 0 ? String(schemeLtrs) : "",
            pcs: valueToString(item.pcs),
            qty: valueToString(item.qty),
            ltrs: valueToString(item.ltrs),
            boxes: valueToString(item.boxes),
            // Landing is always basic + tax% (recomputed, not the stored value)
            // so the edit side shows the same figure the create side does.
            basicPrice: valueToString(item.basic_price),
            priceListBasic: computeLandingPrice(item.basic_price, item.tax_rate),
            tax: valueToString(item.tax_rate),
            amount: valueToString(item.total),
            confirmed: true,
          };
        })
      : [createEmptyRow()];
  };

  const getOrderCategory = (order: Order) => {
    const categories = [
      ...new Set(
        (order.items || [])
          .map((item) =>
            String(item.category || "")
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
    ];

    return categories.length === 1 ? categories[0] : "";
  };

  useEffect(() => {
    if (!isLoadingFromOrder || !editOrderId) {
      return;
    }

    let isCancelled = false;

    const loadEditOrder = async () => {
      setIsLoadingEditOrder(true);

      try {
        const order = await ordersService.getOrderDetails(editOrderId);
        if (isCancelled) return;
        const loadedOrderIsFoc = Boolean(order.is_foc);
        const orderCategory = getOrderCategory(order);
        setEditOrderIsFoc(loadedOrderIsFoc);
        setEditOrderIsDraft(
          String(order.status_display || "")
            .trim()
            .toLowerCase() === "draft",
        );
        setSelectedPartyCategory(orderCategory);

        // Strip any codes a previous save may have baked into card_name so they
        // don't accumulate on this (and every subsequent) edit.
        const cleanCardName = stripCardCode(order.card_name, order.card_code);

        setEditOrderFallback({
          cardName: cleanCardName,
          partyLabel: cleanCardName
            ? [cleanCardName, `(${order.card_code})`, orderCategory].filter(Boolean).join(" ")
            : order.card_code || "",
          billAddress: order.bill_to_address || "",
          shipAddress: order.ship_to_address || "",
        });

        setParties((prev) =>
          prev.some(
            (party) =>
              party.value === order.card_code &&
              String(party.category || "").toUpperCase() === orderCategory,
          )
            ? prev
            : [
                {
                  value: order.card_code,
                  card_code: order.card_code,
                  card_name: cleanCardName,
                  label: cleanCardName ? `${cleanCardName} (${order.card_code})` : order.card_code,
                  category: orderCategory,
                  state: "",
                },
                ...prev,
              ],
        );

        const [, fetchedPartyProducts] = await Promise.all([
          fetchPartyAddresses(order.card_code, orderCategory),
          fetchPartyCategories(order.card_code, orderCategory),
        ]);
        if (isCancelled) return;

        const mergedPartyProducts = mergeOrderItemsIntoPartyProducts(fetchedPartyProducts, order);
        setPartyProducts(mergedPartyProducts);
        setCategory([
          ...new Set(
            mergedPartyProducts
              .map((product) => product.category)
              .filter((itemCategory): itemCategory is string => Boolean(itemCategory)),
          ),
        ]);

        setFormData({
          parties: order.card_code || "",
          dispatch: order.dispatch_from_id ? String(order.dispatch_from_id) : "",
          date: order.created_at
            ? String(order.created_at).split("T")[0]
            : formatDateInput(new Date()),
          billAddress: order.bill_to_id ? String(order.bill_to_id) : "",
          shipAddress: order.ship_to_id ? String(order.ship_to_id) : "",
          Deliverydate: isDuplicateMode ? getDefaultDeliveryDate() : order.delivery_date || "",
          poNumber: isDuplicateMode ? "" : order.po_number || "",
          company: order.company ? String(order.company) : "",
          // Pick the warehouse straight from the saved order; default to GP-FGM
          // for orders placed before the picker existed.
          warehouse: order.warehouse_code || "GP-FGM",
          comment: isDuplicateMode ? "" : order.remarks || "",
        });
        const orderStateCode = order.party_state || "";
        setStateCode(orderStateCode || null);

        const mappedRows = mapOrderToRows(order).map((row) =>
          loadedOrderIsFoc ? applyFocPricingToRow(row) : row,
        );
        setRows(mappedRows);

        const hasSchemeRows = mappedRows.some((row) => row.isScheme);
        if (hasSchemeRows && orderStateCode) {
          const schemes = await ordersService.getSchemeProducts(orderStateCode);
          if (isCancelled) return;

          // const uniqueSchemes = getUniqueSchemes(schemes);
          const nextSchemeOptions: Record<string, SchemeProduct[]> = {};
          mappedRows.forEach((row) => {
            if (row.isScheme) {
              nextSchemeOptions[row.uid] = schemes;
            }
          });
          setSchemeOptions(nextSchemeOptions);
        } else {
          setSchemeOptions({});
        }
      } catch (error) {
        console.log("Error loading order for edit:", error);
        alert("Unable to load this order for editing.");
        navigate(returnTo);
      } finally {
        if (!isCancelled) {
          setIsLoadingEditOrder(false);
        }
      }
    };

    void loadEditOrder();

    return () => {
      isCancelled = true;
    };
  }, [editOrderId, isLoadingFromOrder, isDuplicateMode, navigate, returnTo]);

  /**
   * Write one row's scheme options.
   *
   * Every write goes through here because the map is keyed by uid and a
   * COMPUTED NUMBER KEY compiles cleanly against `Record<string, …>` — three
   * `{ ...prev, [index]: [] }` writes survived the re-key silently, storing
   * under "0" what would only ever be read back under "row-1". Taking a
   * `string` makes passing an index a type error instead of a shrug.
   */
  const setRowSchemeOptions = (uid: string, options: SchemeProduct[]) =>
    setSchemeOptions((prev) => ({ ...prev, [uid]: options }));

  /**
   * Load (or clear) the legacy scheme picker's options for one row.
   *
   * Takes the row's uid, not its index: the caller usually has the index to
   * hand, but by the time the response lands the row may have moved, and the
   * index would then write another row's options.
   */
  const fetchSchemesForRow = async (uid: string, shouldFetch: boolean) => {
    if (!shouldFetch || !stateCode) {
      setRowSchemeOptions(uid, []);
      return;
    }

    try {
      const schemes = await ordersService.getSchemeProducts(stateCode);
      setRowSchemeOptions(uid, schemes);
    } catch (error) {
      console.log("Error fetching schemes:", error);
      setRowSchemeOptions(uid, []);
    }
  };

  // -------------------------------
  // ----------Handle fxns----------
  // --------------------------------

  /**
   * Judge the order and, if anything is wrong, put the reasons on the form.
   *
   * This was a chain of six `alert()` calls that each returned at the first
   * failure — six submits to discover six empty fields, each answered by a
   * dialog that had to be dismissed before the form could be looked at again.
   * The rules did not change; where the answers are delivered did.
   */
  const validateBeforeSave = () => {
    setSubmitAttempted(true);
    return !hasProblems(liveProblems);
  };

  const getNextStageLabel = (data: { status?: unknown; message?: unknown } | null | undefined) => {
    const status = String(data?.status || "").trim();
    const message = String(data?.message || "").trim();
    const source = `${status} ${message}`.toLowerCase();

    if (source.includes("rate")) return "Rate Approval";
    if (source.includes("auditor")) return "Auditor Approval";
    if (source.includes("billing")) return "Billing";

    return status || message || "Next approval stage";
  };

  const resetOrderForm = () => {
    setFormData({
      parties: "",
      dispatch: branch[0]?.bpl_id ? String(branch[0].bpl_id) : "",
      date: formatDateInput(new Date()),
      billAddress: "",
      shipAddress: "",
      Deliverydate: getDefaultDeliveryDate(),
      poNumber: "",
      company: String(
        company.find((item) => normalizeOptionText(item?.name).includes("jivo wellness"))?.id || "",
      ),
      comment: "",
      warehouse: "GP-FGM",
    });

    setSelectedPartyCategory(userDefaultCategory);
    setCategory([]);
    setPartyProducts([]);
    setRows([{ ...createEmptyRow(), category: userDefaultCategory }]);
    setSchemeOptions({});
    setCurrentStep(1);
    setDispatchInfoOpen(false);
    setItemModalIndex(null);
    setItemModalSnapshot(null);
    setItemModalIsNew(false);
  };

  /** The zero-priced companion lines a combo pack contributes to the payload.
   *
   * Scheme giveaways are deliberately absent: they ride on the parent line's
   * `schemes[]`, which sync_service already fans out into its own zero-priced
   * SAP line. Adding them here as well would ship the free stock twice.
   */
  const buildComboFreeItems = () =>
    rows.flatMap((row, index) => {
      if (!row.confirmed) return [];
      const parent = getRowProduct(row);
      return getDerivedLines(row, index)
        .filter((line) => line.kind === "combo")
        .map((line) => ({
          item_code: line.itemCode,
          item_name: line.itemName,
          category: row.category,
          brand: row.brand,
          variety: row.variety,
          item_type: row.type,

          qty: line.qty,
          pcs: 0,
          boxes: 0,
          ltrs: 0,

          price_list_basic: 0,
          basic_price: 0,
          tax_rate: Number(row.tax) || 0,
          total: 0,
          scheme_id: undefined as number | undefined,
          scheme_qty: 0,
          schemes: [] as { scheme_id: number; scheme_qty: number }[],
          is_scheme: false,
          total_ltrs: 0,

          is_auto_free: true,
          combo_source_code: parent?.item_code || "",
        }));
    });

  /** The address string to persist for a selected id. Mirrors how the address is
   *  shown on screen (name first, then the full address), so an address that has
   *  a full_address but a blank address_name is still saved instead of "". */
  const resolveAddressText = (
    list: Array<{
      id: number | string;
      address_name?: string | null;
      full_address?: string | null;
    }>,
    id: string,
  ) => {
    const match = list.find((address) => String(address.id) === String(id));
    return match?.address_name || match?.full_address || "";
  };

  const submitOrder = async () => {
    const selectedParty = parties.find(
      (p) =>
        p.value === formData.parties &&
        (!selectedPartyCategory ||
          String(p.category || "").toUpperCase() === selectedPartyCategory.toUpperCase()),
    );

    const payload = {
      ...(isEditMode ? { order_id: editOrderId } : {}),
      card_code: formData.parties,
      // Save the clean party name (never the "Name (CODE)" label), stripped of any
      // code so it cannot pile up across edits.
      card_name: stripCardCode(
        selectedParty?.card_name || editOrderFallback.cardName || "",
        formData.parties,
      ),
      bill_to_id: Number(formData.billAddress),
      bill_to_address: resolveAddressText(billAddress, formData.billAddress),
      ship_to_id: Number(formData.shipAddress),
      ship_to_address: resolveAddressText(shipAddress, formData.shipAddress),
      dispatch_from_id: Number(formData.dispatch),
      dispatch_from_name:
        branch.find((d) => String(d.bpl_id) === String(formData.dispatch))?.bpl_name || "",

      delivery_date: formData.Deliverydate,
      ...(canEditPoNumber ? { po_number: formData.poNumber.trim() } : {}),
      // Warehouse is only chosen on Mart orders; others send "" so SAP sync
      // falls back to the per-category default.
      warehouse_code: isMartOrder ? formData.warehouse : "",
      remarks: formData.comment.trim(),
      is_foc: isFocOrder,
      company: Number(formData.company),

      total_amount: totalAmount,
      tax_amount: taxAmount,
      grand_total: grandTotal,

      // Straight filter-then-map. This used to pair each row with its ORIGINAL
      // index first, because `schemeProposals` was keyed by position and
      // dropping the unconfirmed rows renumbered them. Keyed by uid, the
      // pairing has nothing left to protect.
      items: rows
        .filter((row) => row.confirmed)
        .map((row) => ({
          item_code:
            partyProducts.find(
              (p) =>
                p.item_name === row.item &&
                p.category === row.category &&
                (p.brand || "") === (row.brand || "") &&
                (p.variety || "") === (row.variety || ""),
            )?.item_code || "",

          item_name: row.item,
          category: row.category,
          brand: row.brand,
          variety: row.variety,
          item_type: row.type,

          qty: Number(row.qty),
          pcs: Number(row.pcs),
          boxes: Number(row.boxes),
          ltrs: Number(row.ltrs),

          price_list_basic: isFocOrder ? 0 : Number(row.priceListBasic),
          basic_price: Number(row.basicPrice),
          tax_rate: Number(row.tax),
          total: Number(row.amount || 0),
          scheme_id:
            row.isScheme && row.schemes[0]?.scheme ? Number(row.schemes[0].scheme) : undefined,
          scheme_qty: row.isScheme
            ? row.schemes.reduce((sum, scheme) => sum + Number(scheme.schemeQty || 0), 0)
            : 0,
          // Hand-picked legacy schemes, plus whatever the v2 engine resolved for
          // this line. Both travel on `schemes[]`; the backend distinguishes them
          // by which id is set and fans each out into its own zero-priced SAP line.
          schemes: [
            ...(row.isScheme
              ? row.schemes
                  .filter((scheme) => scheme.scheme && Number(scheme.schemeQty || 0) > 0)
                  .map((scheme) => ({
                    scheme_id: Number(scheme.scheme),
                    scheme_qty: Number(scheme.schemeQty || 0),
                  }))
              : []),
            ...(schemeProposals[row.uid] || []).map((proposal) => ({
              scheme_v2_id: proposal.scheme_id,
              benefit_id: proposal.benefit_id,
              // Snapshot: SAP ships this exact item, so editing the scheme later
              // cannot change what an already-approved order sends.
              benefit_item_code: proposal.benefit_item_code,
              // A SAP DocumentLine quantity is always pieces, so a scheme written
              // in cartons ships as qty x pack size. `benefit_uom`/`benefit_qty`
              // keep the original wording for the UI and for audit.
              scheme_qty: Number(proposal.qty_pieces),
              computed_qty: Number(proposal.qty_pieces),
              benefit_uom: proposal.free_uom,
              benefit_qty: Number(proposal.qty),
              is_manual_override: false,
              scope_type: proposal.scope_type,
              scope_value: proposal.scope_value,
            })),
          ],
          // scheme_ltrs: row.isScheme ? Number(row.schemeLtrs || 0) : 0,
          is_scheme: row.isScheme || (schemeProposals[row.uid] || []).length > 0,
          total_ltrs:
            Number(row.ltrs) +
            (row.isScheme
              ? row.schemes.reduce((sum, scheme) => sum + Number(scheme.schemeQty || 0), 0)
              : 0),
        }))
        .concat(buildComboFreeItems()),
    };

    try {
      setIsSaving(true);
      console.log("Submitting Payload:", payload);
      const data = await ordersService.createOrder(payload);

      console.log("API Response:", data);
      setShowSaveConfirm(false);
      setSaveSuccess({
        orderId: String(data?.order_number || data?.id || editOrderId || "-"),
        nextStage: getNextStageLabel(data),
        message: isEditMode
          ? "Order updated successfully"
          : isFocOrder
            ? "FOC order created successfully"
            : "Order created successfully",
      });

      if (!isLoadingFromOrder) {
        resetOrderForm();
      }
    } catch (error) {
      console.error(error);

      console.error("Payload:", JSON.stringify(payload, null, 2));

      alert(isEditMode ? "Error updating order ❌" : "Error creating new order ❌");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateBeforeSave()) {
      return;
    }

    setShowSaveConfirm(true);
  };

  // Save the order (even if incomplete) as a draft. Drafts skip validation and
  // the approval flow; they can be resumed later from the Drafts page.
  const handleSaveDraft = async () => {
    // Include any row the user has started filling in, not just confirmed ones.
    const draftRows = rows.filter((row) => row.item || row.category || Number(row.qty) > 0);

    const selectedPartyForDraft = parties.find(
      (p) =>
        p.value === formData.parties &&
        (!selectedPartyCategory ||
          String(p.category || "").toUpperCase() === selectedPartyCategory.toUpperCase()),
    );

    const payload: Record<string, unknown> = {
      card_code: formData.parties,
      card_name: stripCardCode(
        selectedPartyForDraft?.card_name || editOrderFallback.cardName || "",
        formData.parties,
      ),
      bill_to_id: Number(formData.billAddress) || 0,
      bill_to_address: resolveAddressText(billAddress, formData.billAddress),
      ship_to_id: Number(formData.shipAddress) || 0,
      ship_to_address: resolveAddressText(shipAddress, formData.shipAddress),
      dispatch_from_id: Number(formData.dispatch) || 0,
      dispatch_from_name:
        branch.find((d) => String(d.bpl_id) === String(formData.dispatch))?.bpl_name || "",
      delivery_date: formData.Deliverydate || null,
      ...(canEditPoNumber ? { po_number: formData.poNumber.trim() } : {}),
      warehouse_code: isMartOrder ? formData.warehouse : "",
      remarks: formData.comment.trim(),
      is_foc: isFocOrder,
      company: Number(formData.company) || 0,
      total_amount: totalAmount,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      items: draftRows.map((row) => ({
        item_code:
          partyProducts.find(
            (p) =>
              p.item_name === row.item &&
              p.category === row.category &&
              (p.brand || "") === (row.brand || "") &&
              (p.variety || "") === (row.variety || ""),
          )?.item_code || "",
        item_name: row.item,
        category: row.category,
        brand: row.brand,
        variety: row.variety,
        item_type: row.type,
        qty: Number(row.qty) || 0,
        pcs: Number(row.pcs) || 0,
        boxes: Number(row.boxes) || 0,
        ltrs: Number(row.ltrs) || 0,
        price_list_basic: isFocOrder ? 0 : Number(row.priceListBasic) || 0,
        basic_price: Number(row.basicPrice) || 0,
        tax_rate: Number(row.tax) || 0,
        total: Number(row.amount) || 0,
        scheme_id:
          row.isScheme && row.schemes[0]?.scheme ? Number(row.schemes[0].scheme) : undefined,
        scheme_qty: row.isScheme
          ? row.schemes.reduce((sum, scheme) => sum + Number(scheme.schemeQty || 0), 0)
          : 0,
        schemes: row.isScheme
          ? row.schemes
              .filter((scheme) => scheme.scheme && Number(scheme.schemeQty || 0) > 0)
              .map((scheme) => ({
                scheme_id: Number(scheme.scheme),
                scheme_qty: Number(scheme.schemeQty || 0),
              }))
          : [],
        is_scheme: row.isScheme,
        total_ltrs:
          (Number(row.ltrs) || 0) +
          (row.isScheme
            ? row.schemes.reduce((sum, scheme) => sum + Number(scheme.schemeQty || 0), 0)
            : 0),
      })),
    };

    // Only update in place when resuming an existing draft. Duplicating a live
    // order, or starting fresh, creates a brand-new draft.
    const draftOrderId = editOrderIsDraft && editOrderId ? editOrderId : undefined;

    try {
      setIsSavingDraft(true);
      // `Partial<CreateOrder>`, not `any`: the draft payload is the same shape
      // as a submitted order minus the fields the backend fills in, which is
      // exactly what `saveDraft` declares it takes.
      const data = await ordersService.saveDraft(payload as Partial<CreateOrder>, draftOrderId);
      setLastSaveWasDraft(true);
      setSaveSuccess({
        orderId: String(data?.order_number || data?.id || draftOrderId || "-"),
        nextStage: "Saved as Draft",
        message: "Draft saved successfully",
      });
    } catch (error) {
      console.error("Error saving draft:", error);
      alert("Error saving draft ❌");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSuccessClose = () => {
    setSaveSuccess(null);
    if (lastSaveWasDraft) {
      setLastSaveWasDraft(false);
      navigate("/Drafts");
      return;
    }
    if (isLoadingFromOrder) {
      navigate(returnTo);
    }
  };

  const handleClearForm = () => {
    if (isLoadingFromOrder) {
      navigate(returnTo);
      return;
    }

    resetOrderForm();
    setShowSaveConfirm(false);
  };

  const handleAddRow = () => {
    if (rows.some((row) => !row.confirmed)) {
      return;
    }
    rowArray.append(createEmptyRow());
  };

  const handleRowSchemeToggle = (index: number, isScheme: boolean) => {
    updateRow(index, (row) => {
      const schemes = isScheme
        ? row.schemes.length
          ? row.schemes
          : [{ scheme: row.scheme, schemeQty: row.schemeQty }]
        : [];
      return {
        ...row,
        confirmed: false,
        isScheme: isScheme,
        scheme: schemes[0]?.scheme || "",
        schemeQty: schemes[0]?.schemeQty || "",
        schemes,
        // schemeLtrs: "",
      };
    });
    void fetchSchemesForRow(rows[index].uid, isScheme);
  };

  const handleAddScheme = (index: number) => {
    updateRow(index, (row) => ({
      ...row,
      confirmed: false,
      isScheme: true,
      schemes: [...row.schemes, { scheme: "", schemeQty: "" }],
    }));
    void fetchSchemesForRow(rows[index].uid, true);
  };

  const handleSchemeChange = (
    rowIndex: number,
    schemeIndex: number,
    field: keyof SalesRowScheme,
    value: string,
  ) => {
    updateRow(rowIndex, (row) => {
      const schemes = row.schemes.map((scheme, currentSchemeIndex) =>
        currentSchemeIndex === schemeIndex ? { ...scheme, [field]: value } : scheme,
      );
      return {
        ...row,
        confirmed: false,
        scheme: schemes[0]?.scheme || "",
        schemeQty: schemes[0]?.schemeQty || "",
        schemes,
      };
    });
  };

  const handleRemoveScheme = (rowIndex: number, schemeIndex: number) => {
    updateRow(rowIndex, (row) => {
      const schemes = row.schemes.filter(
        (_, currentSchemeIndex) => currentSchemeIndex !== schemeIndex,
      );
      return {
        ...row,
        confirmed: false,
        isScheme: schemes.length > 0,
        scheme: schemes[0]?.scheme || "",
        schemeQty: schemes[0]?.schemeQty || "",
        schemes,
      };
    });
  };

  // ---------------------------------------------------------------------
  // Free lines derived from a confirmed row.
  //
  // Two different things arrive here and they are NOT symmetric:
  //
  //  * A combo pack ("A + B") ships B free. That is a real order line — the SAP
  //    push emits it as a zero-priced DocumentLine — so it goes into the payload
  //    as its own item carrying `is_auto_free` / `combo_source_code`.
  //
  //  * A scheme giveaway is already carried by the parent line's `schemes[]`,
  //    which `sync_service` fans out into its own zero-priced SAP line. Sending
  //    it a second time as an item would ship the stock twice, so the scheme row
  //    below is display-only: it makes the giveaway visible in the item list
  //    without touching what goes over the wire.
  //
  // Both are derived from `rows` on every render rather than stored, so editing
  // a quantity or deleting the parent can never leave a stale free line behind.
  // ---------------------------------------------------------------------
  type DerivedLine = {
    kind: "combo" | "scheme";
    key: string;
    itemCode: string;
    itemName: string;
    qty: number;
    /** How the quantity reads to a human — carries the unit when it is not pieces. */
    qtyLabel: string;
    note: string;
  };

  const findPartyProduct = (row: SalesRow) =>
    partyProducts.find(
      (p) =>
        p.item_name === row.item &&
        p.category === row.category &&
        (p.brand || "") === (row.brand || "") &&
        (p.variety || "") === (row.variety || ""),
    );

  /** The combo companion a row contributes, or null. Shared by the item list and
   *  by the scheme preview, so the engine sees the same free half the user does. */
  const getComboCompanion = (row: SalesRow) => {
    const product = findPartyProduct(row);
    if (!product?.is_combo || !product.free_item_code) return null;
    const perUnit = Number(product.free_qty_per_unit ?? 1) || 1;
    const qty = Number(row.qty || 0) * perUnit;
    if (qty <= 0) return null;
    return {
      parentItemCode: product.item_code,
      itemCode: product.free_item_code,
      itemName: product.free_item?.item_name || product.free_item_code,
      qty,
    };
  };

  const getDerivedLines = (row: SalesRow, index: number): DerivedLine[] => {
    const lines: DerivedLine[] = [];

    // Combo free half. `free_item` is null until the pack is mapped on the
    // Combo Mapping page, and then nothing is added — same as before.
    const companion = getComboCompanion(row);
    if (companion) {
      lines.push({
        kind: "combo",
        key: `combo-${index}-${companion.itemCode}`,
        itemCode: companion.itemCode,
        itemName: companion.itemName,
        qty: companion.qty,
        qtyLabel: String(companion.qty),
        note: `Free with ${row.item}`,
      });
    }

    // Scheme giveaways the v2 engine resolved for this row. These come from
    // targeting (a vendor, or a whole state) rather than from the picker, so the
    // salesperson never chooses them — they just appear.
    (schemeProposals[row.uid] || []).forEach((proposal) => {
      lines.push({
        kind: "scheme",
        key: `v2-${index}-${proposal.scheme_id}-${proposal.benefit_id}`,
        itemCode: proposal.benefit_item_code,
        itemName:
          products.find((p) => p.item_code === proposal.benefit_item_code)?.item_name ||
          partyProducts.find((p) => p.item_code === proposal.benefit_item_code)?.item_name ||
          proposal.benefit_item_code,
        // Shown in the unit the scheme was written in. A carton giveaway also
        // spells out the pieces, because that is the number that ships.
        qty: Number(proposal.qty),
        qtyLabel:
          proposal.free_uom === "BOX"
            ? `${Number(proposal.qty)} box${Number(proposal.qty) === 1 ? "" : "es"} (${Number(
                proposal.qty_pieces,
              )} pcs)`
            : `${Number(proposal.qty)}`,
        note: `${proposal.scheme_name} · via ${proposal.scope_type}${
          proposal.scope_value ? ` ${proposal.scope_value}` : ""
        }`,
      });
    });

    // Scheme giveaways picked by hand from the legacy picker.
    if (row.isScheme) {
      row.schemes.forEach((entry, schemeIndex) => {
        const qty = Number(entry.schemeQty || 0);
        if (!entry.scheme || qty <= 0) return;
        const option = (schemeOptions[row.uid] || []).find(
          (s) => String(s.scheme_id) === String(entry.scheme),
        );
        lines.push({
          kind: "scheme",
          key: `scheme-${index}-${schemeIndex}-${entry.scheme}`,
          itemCode: option?.item_code || "",
          itemName: option?.item_name || option?.scheme_name || "Scheme item",
          qty,
          qtyLabel: String(qty),
          note: option?.scheme_name ? `Scheme: ${option.scheme_name}` : "Scheme",
        });
      });
    }

    return lines;
  };

  const getRowProduct = (row: SalesRow) =>
    partyProducts.find(
      (p) =>
        p.item_name === row.item &&
        p.category === row.category &&
        (p.brand || "") === (row.brand || "") &&
        (p.variety || "") === (row.variety || ""),
    ) ||
    partyProducts.find((p) => p.item_name === row.item && p.category === row.category) ||
    partyProducts.find((p) => p.item_name === row.item) ||
    products.find((p) => p.item_name === row.item);

  const getProductTaxRate = (product: PartyProduct | Product) => {
    if (product.tax_rate !== null && product.tax_rate !== undefined && product.tax_rate !== "") {
      return product.tax_rate;
    }

    const fallbackProduct = products.find(
      (p) =>
        p.item_code === product.item_code ||
        (p.item_name === product.item_name && p.category === product.category),
    );

    return fallbackProduct?.tax_rate ?? "";
  };

  const applyFocPricing = (row: SalesRow) => {
    if (!isFocOrder) return row;
    return applyFocPricingToRow(row);
  };

  /** `rowTotals.recalculateRowTotals`, with the product and the FOC flag this
   *  form already knows filled in. */
  const recalculateRowTotals = (row: SalesRow, source: "boxes" | "qty" | "price") =>
    recalculateRowTotalsFor(row, source, getRowProduct(row), isFocOrder);

  const handleRowChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    let row = { ...rows[index] };
    row.confirmed = false;

    // Assign by the input's `name`. The row's fields are all strings, but the
    // name is only known at runtime, so the index has to be widened — to
    // `Record<string, unknown>`, not `any`, which keeps `row` itself typed.
    (row as unknown as Record<string, unknown>)[name] = value;

    //  ITEM SELECT
    if (name === "item") {
      row.qty = "";
      row.ltrs = "";
      row.boxes = "";
      row.basicPrice = "";
      row.amount = "";
      row.isScheme = false;
      row.scheme = "";
      row.schemeQty = "";
      row.schemes = [];
      // row.schemeLtrs = "";

      const partyProduct =
        partyProducts.find(
          (p) =>
            p.item_name === value &&
            p.category === row.category &&
            (p.brand || "") === (row.brand || "") &&
            (p.variety || "") === (row.variety || ""),
        ) ||
        partyProducts.find((p) => p.item_name === value && p.category === row.category) ||
        partyProducts.find((p) => p.item_name === value);

      if (partyProduct) {
        const match = partyProduct.item_name.match(/(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i);
        row.type = match ? `${match[1]} ${match[2].toUpperCase()}` : "Others";
        row.pcs = String(partyProduct.sal_factor2 ?? "");
        row.tax = String(getProductTaxRate(partyProduct));
        // Basic Price = the product's basic rate (pre-tax). Landing Price is that
        // rate plus tax. Both must fill on select — the Basic column was blank
        // before because only Landing (priceListBasic) was being set.
        row.basicPrice =
          isFocOrder || partyProduct.basic_rate == null
            ? isFocOrder
              ? FOC_TOKEN_BASIC_PRICE
              : ""
            : String(partyProduct.basic_rate);
        row.priceListBasic = isFocOrder ? "0" : computeLandingPrice(row.basicPrice, row.tax);
        void fetchSchemesForRow(row.uid, true);
      } else {
        void fetchSchemesForRow(row.uid, false);
      }
    }

    if (name === "category" || name === "brand" || name === "variety" || name === "type") {
      row.item = "";
      row.isScheme = false;
      row.scheme = "";
      row.schemeQty = "";
      row.schemes = [];
      // row.schemeLtrs = "";
      row.pcs = "";
      row.qty = "";
      row.ltrs = "";
      row.boxes = "";
      row.priceListBasic = "";
      row.basicPrice = "";
      row.tax = "";
      row.amount = "";
      setRowSchemeOptions(row.uid, []);
    }

    //  CALCULATIONS
    //  (boxes → qty)
    //
    // This ran TWICE for a boxes change: an identical block sat here, and the
    // `name === "boxes" || name === "scheme"` block below recomputed every one
    // of the same three values from the same unchanged inputs and overwrote
    // them with the same results. Commented out rather than deleted so the
    // duplication is on the record.
    //
    // if (name === "boxes") {
    //   const boxes = Number(row.boxes) || 0;
    //   const product =
    //     partyProducts.find((p) => p.item_name === row.item) ||
    //     products.find((p) => p.item_name === row.item);
    //   if (product) {
    //     const factor = Number(product.sal_factor2) || 1;
    //     const qty = boxes * factor;
    //     row.qty = String(qty);
    //     row.ltrs = String(Number(product.sal_pack_unit) * qty);
    //     const basic = Number(row.priceListBasic) || 0;
    //     const market = Number(row.basicPrice) || 0;
    //     const price = market > 0 ? market : basic;
    //     row.amount = (price * qty).toFixed(2);
    //   }
    // }
    //
    // NOTE: this is NOT `recalculateRowTotals(row, "boxes")` and must not be
    // replaced by it. That helper prices strictly off `basicPrice` and rewrites
    // `priceListBasic`; this one falls back to `priceListBasic` when there is no
    // basic rate, and leaves it alone. Two different pricing rules on two
    // different paths — a real inconsistency, and not one to fix by accident
    // inside a refactor.
    if (name === "boxes" || name === "scheme") {
      const boxes = Number(row.boxes) || 0;

      const product =
        partyProducts.find((p) => p.item_name === row.item) ||
        products.find((p) => p.item_name === row.item);

      if (product) {
        const factor = Number(product.sal_factor2) || 1;

        const qty = boxes * factor;
        row.qty = String(qty);

        row.ltrs = String(Number(product.sal_pack_unit) * qty);

        const basic = Number(row.priceListBasic) || 0;
        const market = Number(row.basicPrice) || 0;
        const price = market > 0 ? market : basic;

        row.amount = (price * qty).toFixed(2);
      }

      //if (row.isScheme && row.scheme) {
      // const schemes = schemeOptions[index] || [];
      // const schemeObj = schemes.find(
      //   (s) => String(s.scheme_id) === String(row.scheme)
      // );

      // if (schemeObj) {
      //   const match = schemeObj.scheme_name.match(/(\d+\.?\d*)/);
      //   const multiplier = match ? parseFloat(match[1]) : 1;
      //   const schemeName = (schemeObj.scheme_name || "").toLowerCase();

      //   const calculatedQty = schemeName.includes("box")
      //     ? boxes * multiplier
      //     : (Number(row.qty) || 0) * multiplier;

      //   row.schemeQty = String(calculatedQty);

      //   // const sPackUnit = Number((schemeObj as any).sal_pack_unit || product?.sal_pack_unit || 0);
      //   // row.schemeLtrs = (sPackUnit * calculatedQty).toFixed(2);
      // } else {
      //   row.schemeQty = "";
      //   // row.schemeLtrs = "";
      // }
      // }
    }

    if (name === "qty") {
      row = recalculateRowTotals(row, "qty");
    }

    if (name === "basicPrice") {
      row = recalculateRowTotals(row, "price");
    }

    rowArray.update(index, applyFocPricing(row));
  };

  const handleRowSelect = (index: number, name: string, value: string) => {
    handleRowChange(index, {
      target: { name, value },
    } as React.ChangeEvent<HTMLSelectElement>);
    setOpenRowDropdown(null);
  };

  const handleDeleteRow = (index: number) => {
    const removed = rows[index];
    rowArray.remove(index);
    // The form is never rowless — an empty item table has no "+ Add Item" on
    // the legacy path, so deleting the last row would leave a screen with no
    // way forward.
    if (rows.length <= 1) rowArray.append(createEmptyRow());
    // Both maps are keyed by row uid, so nothing needs renumbering — this used
    // to shift every key above `index` down by one, and any code path that
    // reordered rows without repeating that fix-up handed one row's schemes to
    // another. Dropping the deleted row's own entry is housekeeping, not
    // correctness: an orphan key belongs to no row and is never read.
    const dropUid = <T>(prev: Record<string, T>) => {
      const rest = { ...prev };
      delete rest[removed.uid];
      return rest;
    };
    setSchemeOptions(dropUid);
    setSchemeProposals(dropUid);
  };

  const handlePartySelect = (value: string, partyCategory = "") => {
    const nextStateCode = getPartyStateCode(value, partyCategory);
    setEditOrderFallback(emptyEditOrderFallback);
    setSelectedPartyCategory(partyCategory);
    setFormData((prev) => ({
      ...prev,
      parties: value,
      billAddress: "",
      shipAddress: "",
    }));
    setPartySearch("");
    setPartyDropdownOpen(false);
    setBillSearch("");
    setBillDropdownOpen(false);
    setShipSearch("");
    setShipDropdownOpen(false);
    setBillAddress([]);
    setShipAddress([]);
    setCategory([]);
    setPartyProducts([]);
    setRows([{ ...createEmptyRow(), category: partyCategory || userDefaultCategory }]);
    setSchemeOptions({});
    setStateCode(nextStateCode || null);
    fetchPartyAddresses(value, partyCategory);
    fetchPartyCategories(value, partyCategory);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (name === "parties") {
      handlePartySelect(value);
    }
  };

  const handleBillAddressSelect = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      billAddress: value,
    }));
    setBillSearch("");
    setBillDropdownOpen(false);
  };

  const handleShipAddressSelect = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      shipAddress: value,
    }));
    setShipSearch("");
    setShipDropdownOpen(false);
  };

  const handleDispatchSelect = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      dispatch: value,
    }));
    setDispatchDropdownOpen(false);
  };

  const handleCompanySelect = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      company: value,
    }));
    setCompanyDropdownOpen(false);
  };

  // Brand and sub-group are metadata copied off the chosen product, and part of
  // the catalogue legitimately leaves them blank — requiring them here made
  // those products impossible to order. The item itself is what must be set.
  // rowProblem() is module-scope and exported (above the component) so the
  // rules it encodes can be unit-tested without mounting this 4,200-line page.

  // Superseded by rowProblem() above — both confirm gates now want the reason,
  // not a boolean. Kept commented in case a caller needs the predicate again.
  // const isRowValid = (row: SalesRow) => rowProblem(row) === null;

  /**
   * Confirm one row, or say why not. Returns whether it was confirmed.
   *
   * The reason used to go to `alert()`. It goes into `confirmProblems`, keyed
   * by uid, so the form can put it under the row it is about — and so the
   * caller (the wizard's item modal) can branch on the outcome without
   * re-running the rules and risking a different answer.
   */
  const handleConfirmRow = (index: number) => {
    const row = rows[index];

    const problem = rowProblem(row);
    if (problem) {
      setConfirmProblems((prev) => ({ ...prev, [row.uid]: problem }));
      return false;
    }

    setConfirmProblems((prev) => {
      const rest = { ...prev };
      delete rest[row.uid];
      return rest;
    });
    updateRow(index, (item) => ({ ...item, confirmed: true }));
    return true;
  };

  const handleEditRow = (index: number) => {
    updateRow(index, (item) => ({ ...item, confirmed: false }));
  };

  // ---------------------------------------------------------------------
  // v2 scheme engine
  //
  // The engine decides which schemes reach this party (by vendor, state, main
  // group, ...) and how much each gives, so the order form asks it rather than
  // making the salesperson pick from a dropdown. The call is a dry run — it
  // writes nothing — and is keyed on a signature of the confirmed lines so it
  // only re-fires when something it cares about actually changed.
  // ---------------------------------------------------------------------
  const buildPreviewLines = () => {
    const lines: PreviewLine[] = [];
    const rowUidByLine: string[] = [];

    rows.forEach((row) => {
      if (!row.confirmed) return;
      const product = findPartyProduct(row);
      const itemCode = product?.item_code || "";
      if (!itemCode) return;

      lines.push({
        item_code: itemCode,
        item_name: row.item,
        category: row.category,
        sub_group: row.variety,
        brand: row.brand,
        item_type: row.type,
        qty: Number(row.qty) || 0,
        pcs: Number(row.pcs) || 0,
        boxes: Number(row.boxes) || 0,
        ltrs: Number(row.ltrs) || 0,
      });
      rowUidByLine.push(row.uid);

      // The combo's free half has to be in the payload for FREE_LINE triggers to
      // have anything to measure. It is attributed back to the parent row.
      const companion = getComboCompanion(row);
      if (companion) {
        lines.push({
          item_code: companion.itemCode,
          item_name: companion.itemName,
          category: row.category,
          qty: companion.qty,
          is_auto_free: true,
          combo_source_code: companion.parentItemCode,
        });
        rowUidByLine.push(row.uid);
      }
    });

    return { lines, rowUidByLine };
  };

  const previewSignature = JSON.stringify({
    card: formData.parties,
    category: selectedPartyCategory,
    lines: buildPreviewLines().lines.map((l) => [l.item_code, l.qty, l.is_auto_free ?? false]),
  });

  useEffect(() => {
    const { lines, rowUidByLine } = buildPreviewLines();

    if (!formData.parties || lines.length === 0) {
      setSchemeProposals({});
      return;
    }

    let cancelled = false;
    // Debounced: quantities are typed, and every keystroke would otherwise be a
    // round trip.
    const timer = window.setTimeout(async () => {
      try {
        // Gate on the PARTY's category (its business line / company), not on a
        // product row's category. The engine then only proposes schemes whose
        // own category matches the party's, and its per-line guard drops any
        // product line of a different category — so a scheme is auto-fetched
        // only when party category == product category == scheme category.
        const response = await schemeService.preview(
          formData.parties,
          selectedPartyCategory || "",
          lines,
        );
        if (cancelled) return;

        const byRow: Record<string, SchemeProposal[]> = {};
        response.proposals.forEach((proposal) => {
          const rowUid = rowUidByLine[proposal.line_index];
          if (rowUid === undefined) return;
          // A scheme with no rule leaves the quantity to the user; there is
          // nothing to show as a line until someone types one.
          if (proposal.qty_is_user_supplied || Number(proposal.qty) <= 0) return;
          (byRow[rowUid] = byRow[rowUid] || []).push(proposal);
        });
        setSchemeProposals(byRow);
      } catch (error) {
        // A failed preview must never block order entry — the form simply shows
        // no engine-resolved schemes.
        console.error("Error previewing schemes:", error);
        if (!cancelled) setSchemeProposals({});
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSignature]);

  /**
   * The header, as `orderHeaderSchema` wants it, and the admin PO config it
   * needs to judge the PO field. Both are exported so the wizard's step gates
   * and the save gate ask the SAME rules — they used to be written twice, in
   * two files, and the save path did not check the header at all.
   */
  const orderHeader: OrderHeaderInput = {
    parties: formData.parties,
    billAddress: formData.billAddress,
    shipAddress: formData.shipAddress,
    dispatch: formData.dispatch,
    Deliverydate: formData.Deliverydate,
    company: formData.company,
    poNumber: formData.poNumber,
  };

  const poConfig: PoFieldConfig = {
    canEdit: canEditPoNumber,
    required: poField.required,
    label: poField.label,
  };

  const liveProblems = orderProblems(orderHeader, poConfig, rows);
  /** What the forms render. Empty until the first save attempt. */
  const problems = submitAttempted ? liveProblems : NO_PROBLEMS;

  const confirmedRows = rows.filter((row) => row.confirmed);
  const canAddMoreItems = rows.length > 0 && rows.every((row) => row.confirmed);

  // Paid lines + the free lines derived from them.
  const visibleLineCount = rows.reduce(
    (sum, row, index) => (row.confirmed ? sum + 1 + getDerivedLines(row, index).length : sum),
    0,
  );

  const calculatedTotalAmount = confirmedRows.reduce((sum, row) => {
    const amount = Number(row.amount);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const calculatedTaxAmount = confirmedRows.reduce((sum, row) => {
    const amount = Number(row.amount);
    const taxRate = Number(row.tax);
    return sum + (isNaN(amount) ? 0 : (amount * taxRate) / 100);
  }, 0);

  const totalAmount = calculatedTotalAmount;
  const taxAmount = calculatedTaxAmount;
  const grandTotal = totalAmount + taxAmount;

  const filteredParties = parties.filter((party) => {
    const search = partySearch.trim().toLowerCase();
    if (!search) return true;
    return (
      String(party.label || "")
        .toLowerCase()
        .includes(search) ||
      String(party.value || "")
        .toLowerCase()
        .includes(search) ||
      String(party.category || "")
        .toLowerCase()
        .includes(search)
    );
  });
  const filteredBillAddresses = billAddress.filter((address) => {
    const search = billSearch.trim().toLowerCase();
    const label = String(address.address_name || address.full_address || address.address_id || "");
    if (!search) return true;
    return label.toLowerCase().includes(search);
  });
  const filteredShipAddresses = shipAddress.filter((address) => {
    const search = shipSearch.trim().toLowerCase();
    const label = String(address.address_name || address.full_address || address.address_id || "");
    if (!search) return true;
    return label.toLowerCase().includes(search);
  });
  const selectedParty = parties.find(
    (party) =>
      party.value === formData.parties &&
      (!selectedPartyCategory ||
        String(party.category || "").toUpperCase() === selectedPartyCategory.toUpperCase()),
  );
  const selectedPartyLabel = selectedParty
    ? [selectedParty.label, selectedParty.category].filter(Boolean).join(" | ")
    : editOrderFallback.partyLabel || "";
  const selectedBillAddress = billAddress.find(
    (address) => String(address.id) === formData.billAddress,
  );
  const selectedShipAddress = shipAddress.find(
    (address) => String(address.id) === formData.shipAddress,
  );
  const selectedDispatch = branch.find((dispatch) => String(dispatch.bpl_id) === formData.dispatch);
  const selectedCompany = company.find((item) => String(item.id) === formData.company);
  // The Mart company from the list, and whether this is a Mart order. "Company 3
  // means mart": it's Mart when company is 3, when the selected company is the
  // Mart row, OR when the party's category is MART. Driving it partly off the
  // party category keeps the Warehouse panel visible even after the Company
  // dropdown is opened/changed (it no longer hides the moment company drifts off 3).
  const martCompany = company.find((item) => normalizeOptionText(item?.name).includes("mart"));
  const isMartOrder =
    Number(formData.company) === 3 ||
    (!!martCompany && String(formData.company) === String(martCompany.id)) ||
    normalizeOptionText(selectedPartyCategory) === "mart";
  const selectedBillAddressLabel =
    selectedBillAddress?.address_name ||
    selectedBillAddress?.full_address ||
    (selectedBillAddress?.address_id != null ? String(selectedBillAddress.address_id) : "") ||
    (formData.billAddress ? editOrderFallback.billAddress : "") ||
    "";
  const selectedShipAddressLabel =
    selectedShipAddress?.address_name ||
    selectedShipAddress?.full_address ||
    (selectedShipAddress?.address_id != null ? String(selectedShipAddress.address_id) : "") ||
    (formData.shipAddress ? editOrderFallback.shipAddress : "") ||
    "";
  const selectedDispatchLabel = selectedDispatch?.bpl_name || "";
  // Fall back to the Mart company name (or literally "Mart") for a Mart order
  // whose company id isn't in the list, so the field never shows "Select Company".
  const selectedCompanyLabel =
    selectedCompany?.name || (isMartOrder ? martCompany?.name || "Mart" : "") || "";

  // The legacy "Optional promotion" picker reads `scheme_product`, which is NOT
  // category-aware — it lists every scheme in the party's state regardless of
  // business line. MART has no schemes, so the panel must be hidden for a MART
  // line/party (as it already is for a company-3 Mart order); otherwise an
  // OIL/BEVERAGES scheme from the same state would leak into a MART order. The
  // category-gated auto-fetch (v2 engine) is unaffected — this only governs the
  // manual picker's visibility.
  const isSchemePanelHidden = (row: SalesRow) => {
    if (isMartOrder) return true;
    const category = String(row.category || selectedPartyCategory || "")
      .trim()
      .toUpperCase();
    return category === "MART";
  };

  return {
    t,
    field,
    location,
    isEditMode,
    isDuplicateMode,
    isLoadingFromOrder,
    isFocMode,
    userDefaultCategory,
    parties,
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
    openRowDropdown,
    setOpenRowDropdown,
    branch,
    billAddress,
    shipAddress,
    category,
    products,
    company,
    partyProducts,
    schemeOptions,
    setRowSchemeOptions,
    showSaveConfirm,
    setShowSaveConfirm,
    saveSuccess,
    setSaveSuccess,
    isSaving,
    isSavingDraft,
    isLoadingEditOrder,
    editOrderIsDraft,
    partyDropdownRef,
    dispatchDropdownRef,
    dispatchInfoRef,
    billDropdownRef,
    shipDropdownRef,
    companyDropdownRef,
    formData,
    setFormData,
    rows,
    setRows,
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
    useWizard,
    getProductType,
    fetchSchemesForRow,
    validateBeforeSave,
    submitOrder,
    handleSubmit,
    handleSaveDraft,
    handleSuccessClose,
    handleClearForm,
    handleAddRow,
    handleRowSchemeToggle,
    handleAddScheme,
    handleSchemeChange,
    handleRemoveScheme,
    getDerivedLines,
    getProductTaxRate,
    applyFocPricing,
    handleRowChange,
    handleRowSelect,
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
    submitAttempted,
    confirmProblems,
    canAddMoreItems,
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
    // Consumed by nobody since the split — both are inputs to the labels above
    // (`selectedCompanyLabel`, `isMartOrder`) rather than values a form draws.
    // Kept commented rather than removed: they are the natural handles if a
    // form ever needs the company row itself.
    // selectedCompany,
    // martCompany,
    selectedBillAddressLabel,
    selectedShipAddressLabel,
    selectedDispatchLabel,
    selectedCompanyLabel,
  };
}

/** The whole form, as the two view components receive it. */
export type SalesOrderForm = ReturnType<typeof useSalesOrderForm>;
