import { Fragment, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ordersService } from "../services/ordersService";
import { userService } from "../services/userService";
import { getCurrentUser } from "../services/authService";
import type {
  Order,
  OrderItem,
  Product,
  PartyProduct,
  RowType,
  SchemeProduct,
} from "../services/ordersService";
import "../styles/Add_Sales.css";

type SalesRow = RowType & {
  confirmed: boolean;
  // schemeLtrs?: string;
  schemeItemCode?: string;
  schemes: SalesRowScheme[];
};

type SalesRowScheme = {
  scheme: string;
  schemeQty: string;
};

type RowDropdownOption = {
  value: string;
  label: string;
};

const createEmptyRow = (): SalesRow => ({
  category: "",
  brand: "",
  variety: "",
  type: "",
  item: "",
  isScheme: false,
  scheme: "",
  schemeQty: "",
  // schemeLtrs: "",
  pcs: "",
  qty: "",
  ltrs: "",
  boxes: "",
  priceListBasic: "",
  basicPrice: "",
  tax: "",
  amount: "",
  confirmed: false,
  schemes: [],
});

const applyFocPricingToRow = (row: SalesRow): SalesRow => ({
  ...row,
  isScheme: false,
  scheme: "",
  schemeQty: "",
  schemes: [],
  priceListBasic: "0",
  amount:
    Number(row.qty) > 0 && Number(row.basicPrice) > 0
      ? (Number(row.qty) * Number(row.basicPrice)).toFixed(2)
      : "",
});

const normalizeOptionText = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const getUserCategoryText = (user: any) =>
  String(
    user?.category?.category ||
      user?.category?.name ||
      user?.category_name ||
      user?.category ||
      "",
  ).trim();

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

type AddSalesProps = {
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

export default function Add_Sales({ focMode = false }: AddSalesProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState =
    (location.state as EditOrderLocationState | null) ?? null;
  const editOrderId =
    typeof locationState?.editOrderId === "number"
      ? locationState.editOrderId
      : null;
  const mode = locationState?.mode ?? (editOrderId ? "edit" : "create");
  const returnTo = locationState?.returnTo || "/Order_Tracking";
  const isEditMode = mode === "edit" && editOrderId !== null;
  const isDuplicateMode = mode === "duplicate" && editOrderId !== null;
  const isLoadingFromOrder = isEditMode || isDuplicateMode;
  const isFocMode = focMode && !isLoadingFromOrder;
  const [userRole, setUserRole] = useState("");
  const [userDefaultCategory, setUserDefaultCategory] = useState("");
  const [parties, setParties] = useState<any[]>([]);
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
  const [branch, setBranch] = useState<any[]>([]);
  const [billAddress, setBillAddress] = useState<any[]>([]);
  const [shipAddress, setShipAddress] = useState<any[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<any[]>([]);
  const [partyProducts, setPartyProducts] = useState<PartyProduct[]>([]);
  const [schemeOptions, setSchemeOptions] = useState<
    Record<number, SchemeProduct[]>
  >({});
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [editOrderFallback, setEditOrderFallback] = useState<EditOrderFallback>(
    emptyEditOrderFallback,
  );
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
  });

  const [rows, setRows] = useState<SalesRow[]>([createEmptyRow()]);
  const isBillingUser = userRole.toLowerCase() === "billing";
  const isFocOrder = isFocMode || editOrderIsFoc;
  const canEditPoNumber =
    isBillingUser && (!isEditMode || locationState?.allowPoNumber === true);

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
      const role = user?.role_name || user?.role || user?.role_display || "";
      setUserRole(typeof role === "object" ? role.name || "" : String(role));
      const profileCategory = getUserCategoryText(user);
      setUserDefaultCategory(profileCategory);
      if (profileCategory && !isLoadingFromOrder) {
        setSelectedPartyCategory((current) => current || profileCategory);
      }
    } catch (error) {
      console.log("Error fetching current user:", error);
      setUserRole("");
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

  useEffect(() => {
    if (isLoadingFromOrder || !userDefaultCategory) return;

    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.category || row.confirmed) return row;
        const matchedCategory =
          category.find(
            (itemCategory) =>
              normalizeOptionText(itemCategory) ===
              normalizeOptionText(userDefaultCategory),
          ) || (category.length === 0 ? userDefaultCategory : "");

        return matchedCategory ? { ...row, category: matchedCategory } : row;
      }),
    );
  }, [category, isLoadingFromOrder, userDefaultCategory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        partyDropdownRef.current &&
        !partyDropdownRef.current.contains(event.target as Node)
      ) {
        setPartyDropdownOpen(false);
      }
      if (
        billDropdownRef.current &&
        !billDropdownRef.current.contains(event.target as Node)
      ) {
        setBillDropdownOpen(false);
      }
      if (
        dispatchDropdownRef.current &&
        !dispatchDropdownRef.current.contains(event.target as Node)
      ) {
        setDispatchDropdownOpen(false);
      }
      if (
        shipDropdownRef.current &&
        !shipDropdownRef.current.contains(event.target as Node)
      ) {
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
      let data = await userService.getCompany();
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
      let data = await ordersService.getBranches();
      setBranch(data);
    } catch (error) {
      console.log("Error fetching dispatch data:", error);
    }
  };

  const fetchPartyAddresses = async (card_code: string, partyCategory = "") => {
    try {
      let data = await ordersService.getPartyAdd(card_code, partyCategory);
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
            String(p.category || "").toUpperCase() ===
            partyCategory.toUpperCase(),
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
    let data = await ordersService.getProducts();
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
          String(party.category || "").toUpperCase() ===
            partyCategory.toUpperCase()),
    );
    return selectedParty?.state ? String(selectedParty.state) : "";
  };

  const mergeOrderItemsIntoPartyProducts = (
    sourceProducts: PartyProduct[],
    order: Order,
  ) => {
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
          Number(item.qty) > 0
            ? String(Number(item.ltrs || 0) / Number(item.qty))
            : "",
        tax_rate: item.tax_rate || "",
        basic_rate: item.price_list_basic || "",
      });
    });

    return Array.from(productMap.values());
  };

  const mapOrderToRows = (order: Order): SalesRow[] => {
    const orderItems = Array.isArray(order.items) ? order.items : [];

    return orderItems.length > 0
      ? orderItems.map((item) => {
          const itemWithExtras = item as OrderItem & {
            scheme?: number | string | null;
            is_scheme_visible?: boolean;
          };
          const itemSchemes = Array.isArray(item.schemes) && item.schemes.length > 0
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
            category: item.category || "",
            brand: item.brand || "",
            variety: item.variety || "",
            type: item.item_type || getProductType(item.item_name || ""),
            item: item.item_name || "",
            isScheme: isSchemeVisible,
            scheme: schemeId ? String(schemeId) : "",
            schemeQty: isSchemeVisible ? valueToString(itemSchemes[0]?.schemeQty || item.scheme_qty) : "",
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
            priceListBasic: valueToString(item.price_list_basic),
            basicPrice: valueToString(item.basic_price),
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
          .map((item) => String(item.category || "").trim().toUpperCase())
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
          String(order.status_display || "").trim().toLowerCase() === "draft",
        );
        setSelectedPartyCategory(orderCategory);

        setEditOrderFallback({
          cardName: order.card_name || "",
          partyLabel: order.card_name
            ? [order.card_name, `(${order.card_code})`, orderCategory]
                .filter(Boolean)
                .join(" ")
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
                  label: order.card_name
                    ? `${order.card_name} (${order.card_code})`
                    : order.card_code,
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

        const mergedPartyProducts = mergeOrderItemsIntoPartyProducts(
          fetchedPartyProducts,
          order,
        );
        setPartyProducts(mergedPartyProducts);
        setCategory([
          ...new Set(
            mergedPartyProducts
              .map((product) => product.category)
              .filter((itemCategory): itemCategory is string =>
                Boolean(itemCategory),
              ),
          ),
        ]);

        setFormData({
          parties: order.card_code || "",
          dispatch: order.dispatch_from_id
            ? String(order.dispatch_from_id)
            : "",
          date: order.created_at
            ? String(order.created_at).split("T")[0]
            : formatDateInput(new Date()),
          billAddress: order.bill_to_id ? String(order.bill_to_id) : "",
          shipAddress: order.ship_to_id ? String(order.ship_to_id) : "",
          Deliverydate: isDuplicateMode ? getDefaultDeliveryDate() : order.delivery_date || "",
          poNumber: isDuplicateMode ? "" : order.po_number || "",
          company: order.company ? String(order.company) : "",
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
          const nextSchemeOptions: Record<number, SchemeProduct[]> = {};
          mappedRows.forEach((row, index) => {
            if (row.isScheme) {
              nextSchemeOptions[index] = schemes;
              console.log(`Assigned schemes to row ${index}:`, schemes);
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

  const fetchSchemesForRow = async (index: number, shouldFetch: boolean) => {
    if (!shouldFetch || !stateCode) {
      setSchemeOptions((prev) => ({ ...prev, [index]: [] }));
      return;
    }

    try {
      const schemes = await ordersService.getSchemeProducts(stateCode);

      setSchemeOptions((prev) => ({
        ...prev,
        [index]: schemes,
      }));
    } catch (error) {
      console.log("Error fetching schemes:", error);
      setSchemeOptions((prev) => ({ ...prev, [index]: [] }));
    }
  };

  // -------------------------------
  // ----------Handle fxns----------
  // --------------------------------

  const validateBeforeSave = () => {
    const confirmedRows = rows.filter((row) => row.confirmed);

    if (confirmedRows.length === 0) {
      alert("Please confirm at least one item before submitting the order.");
      return false;
    }

    if (rows.some((row) => !row.confirmed && row.item)) {
      alert("Please confirm the current item before submitting the order.");
      return false;
    }

    return true;
  };

  const getNextStageLabel = (data: any) => {
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
        company.find((item) =>
          normalizeOptionText(item?.name).includes("jivo wellness"),
        )?.id || "",
      ),
      comment: "",
    });

    setSelectedPartyCategory(userDefaultCategory);
    setCategory([]);
    setPartyProducts([]);
    setRows([{ ...createEmptyRow(), category: userDefaultCategory }]);
    setSchemeOptions({});
  };

  const submitOrder = async () => {
    const confirmedRows = rows.filter((row) => row.confirmed);

    const selectedParty = parties.find(
      (p) =>
        p.value === formData.parties &&
        (!selectedPartyCategory ||
          String(p.category || "").toUpperCase() ===
            selectedPartyCategory.toUpperCase()),
    );

    const payload = {
      ...(isEditMode ? { order_id: editOrderId } : {}),
      card_code: formData.parties,
      card_name: selectedParty?.label || editOrderFallback.cardName || "",
      bill_to_id: Number(formData.billAddress),
      bill_to_address:
        billAddress.find((b) => b.id === Number(formData.billAddress))
          ?.address_name || "",
      ship_to_id: Number(formData.shipAddress),
      ship_to_address:
        shipAddress.find((s) => s.id === Number(formData.shipAddress))
          ?.address_name || "",
      dispatch_from_id: Number(formData.dispatch),
      dispatch_from_name:
        branch.find((d) => d.bpl_id === Number(formData.dispatch))?.bpl_name ||
        "",

      delivery_date: formData.Deliverydate,
      ...(canEditPoNumber ? { po_number: formData.poNumber.trim() } : {}),
      remarks: formData.comment.trim(),
      is_foc: isFocOrder,
      company: Number(formData.company),

      total_amount: totalAmount,
      tax_amount: taxAmount,
      grand_total: grandTotal,

      items: confirmedRows.map((row) => ({
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
        scheme_id: row.isScheme && row.schemes[0]?.scheme ? Number(row.schemes[0].scheme) : undefined,
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
        // scheme_ltrs: row.isScheme ? Number(row.schemeLtrs || 0) : 0,
        is_scheme: row.isScheme,
        total_ltrs:
          Number(row.ltrs) +
          (row.isScheme ? row.schemes.reduce((sum, scheme) => sum + Number(scheme.schemeQty || 0), 0) : 0),
      })),
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

      alert(
        isEditMode
          ? "Error updating order ❌"
          : "Error creating new order ❌",
      );
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
          String(p.category || "").toUpperCase() ===
            selectedPartyCategory.toUpperCase()),
    );

    const payload: Record<string, unknown> = {
      card_code: formData.parties,
      card_name: selectedPartyForDraft?.label || editOrderFallback.cardName || "",
      bill_to_id: Number(formData.billAddress) || 0,
      bill_to_address:
        billAddress.find((b) => b.id === Number(formData.billAddress))?.address_name || "",
      ship_to_id: Number(formData.shipAddress) || 0,
      ship_to_address:
        shipAddress.find((s) => s.id === Number(formData.shipAddress))?.address_name || "",
      dispatch_from_id: Number(formData.dispatch) || 0,
      dispatch_from_name:
        branch.find((d) => d.bpl_id === Number(formData.dispatch))?.bpl_name || "",
      delivery_date: formData.Deliverydate || null,
      ...(canEditPoNumber ? { po_number: formData.poNumber.trim() } : {}),
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
        scheme_id: row.isScheme && row.schemes[0]?.scheme ? Number(row.schemes[0].scheme) : undefined,
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
      const data = await ordersService.saveDraft(payload as any, draftOrderId);
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
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const handleRowSchemeToggle = (index: number, isScheme: boolean) => {
    setRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex === index) {
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
        }
        return row;
      }),
    );
    void fetchSchemesForRow(index, isScheme);
  };

  const handleAddScheme = (index: number) => {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              confirmed: false,
              isScheme: true,
              schemes: [...row.schemes, { scheme: "", schemeQty: "" }],
            }
          : row,
      ),
    );
    void fetchSchemesForRow(index, true);
  };

  const handleSchemeChange = (
    rowIndex: number,
    schemeIndex: number,
    field: keyof SalesRowScheme,
    value: string,
  ) => {
    setRows((prev) =>
      prev.map((row, currentRowIndex) => {
        if (currentRowIndex !== rowIndex) return row;
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
      }),
    );
  };

  const handleRemoveScheme = (rowIndex: number, schemeIndex: number) => {
    setRows((prev) =>
      prev.map((row, currentRowIndex) => {
        if (currentRowIndex !== rowIndex) return row;
        const schemes = row.schemes.filter((_, currentSchemeIndex) => currentSchemeIndex !== schemeIndex);
        return {
          ...row,
          confirmed: false,
          isScheme: schemes.length > 0,
          scheme: schemes[0]?.scheme || "",
          schemeQty: schemes[0]?.schemeQty || "",
          schemes,
        };
      }),
    );
  };

  const getRowProduct = (row: SalesRow) =>
    partyProducts.find(
      (p) =>
        p.item_name === row.item &&
        p.category === row.category &&
        (p.brand || "") === (row.brand || "") &&
        (p.variety || "") === (row.variety || ""),
    ) ||
    partyProducts.find(
      (p) => p.item_name === row.item && p.category === row.category,
    ) ||
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

  const recalculateRowTotals = (row: SalesRow, source: "boxes" | "qty" | "price") => {
    const product = getRowProduct(row);
    if (!product) return applyFocPricing(row);

    const factor = Number(product.sal_factor2) || 1;
    const packUnit = Number(product.sal_pack_unit) || 0;
    let qty = Number(row.qty) || 0;

    if (source === "boxes") {
      qty = (Number(row.boxes) || 0) * factor;
      row.qty = qty > 0 ? String(qty) : "";
    }

    if (source === "qty") {
      row.boxes = qty > 0 && factor > 0 ? String(qty / factor) : "";
    }

    row.ltrs = qty > 0 ? String(packUnit * qty) : "";

    const basic = Number(row.priceListBasic) || 0;
    const market = Number(row.basicPrice) || 0;
    const price = market > 0 ? market : basic;
    row.amount = qty > 0 && price > 0 ? (price * qty).toFixed(2) : "";

    return applyFocPricing(row);
  };

  const handleRowChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    let updatedRows = [...rows];
    let row = { ...updatedRows[index] };
    row.confirmed = false;

    // assign value (RowType is all strings)
    (row as any)[name] = value;

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
        partyProducts.find(
          (p) => p.item_name === value && p.category === row.category,
        ) ||
        partyProducts.find((p) => p.item_name === value);

      if (partyProduct) {
        const match = partyProduct.item_name.match(
          /(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i,
        );
        row.type = match ? `${match[1]} ${match[2].toUpperCase()}` : "Others";
        row.pcs = String(partyProduct.sal_factor2 ?? "");
        row.tax = String(getProductTaxRate(partyProduct));
        row.priceListBasic = isFocOrder ? "0" : String(partyProduct.basic_rate ?? "");
        void fetchSchemesForRow(index, true);
      } else {
        void fetchSchemesForRow(index, false);
      }
    }

    if (
      name === "category" ||
      name === "brand" ||
      name === "variety" ||
      name === "type"
    ) {
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
      setSchemeOptions((prev) => ({ ...prev, [index]: [] }));
    }

    //  CALCULATIONS
    //  (boxes → qty)
    if (name === "boxes") {
      const boxes = Number(row.boxes) || 0;

      const product =
        partyProducts.find((p) => p.item_name === row.item) ||
        products.find((p) => p.item_name === row.item);

      if (product) {
        const factor = Number(product.sal_factor2) || 1;

        // ✅ qty from boxes
        const qty = boxes * factor;
        row.qty = String(qty);

        // ✅ liters
        row.ltrs = String(Number(product.sal_pack_unit) * qty);

        // ✅ amount
        const basic = Number(row.priceListBasic) || 0;
        const market = Number(row.basicPrice) || 0;
        const price = market > 0 ? market : basic;

        row.amount = (price * qty).toFixed(2);
      }
    }
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

    updatedRows[index] = applyFocPricing(row);
    setRows(updatedRows);
  };

  const handleRowSelect = (index: number, name: string, value: string) => {
    handleRowChange(index, {
      target: { name, value },
    } as React.ChangeEvent<HTMLSelectElement>);
    setOpenRowDropdown(null);
  };

  const handleDeleteRow = (index: number) => {
    const updatedRows = rows.filter((_, i) => i !== index);
    setRows(updatedRows.length > 0 ? updatedRows : [createEmptyRow()]);
    setSchemeOptions((prev) => {
      const next: Record<number, SchemeProduct[]> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const currentIndex = Number(key);
        if (currentIndex < index) next[currentIndex] = value;
        if (currentIndex > index) next[currentIndex - 1] = value;
      });
      return next;
    });
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

  const handleChange = (e: React.ChangeEvent<any>) => {
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

  const isRowValid = (row: SalesRow) =>
    row.category &&
    row.brand &&
    row.variety &&
    row.type &&
    row.item &&
    Number(row.qty) > 0 &&
    (!row.isScheme ||
      row.schemes.every((scheme) => scheme.scheme && Number(scheme.schemeQty || 0) > 0));

  const handleConfirmRow = (index: number) => {
    const row = rows[index];

    if (!isRowValid(row)) {
      alert("Please complete this item before confirming it.");
      return;
    }

    setRows((prev) =>
      prev.map((item, rowIndex) =>
        rowIndex === index ? { ...item, confirmed: true } : item,
      ),
    );
  };

  const handleEditRow = (index: number) => {
    setRows((prev) =>
      prev.map((item, rowIndex) =>
        rowIndex === index ? { ...item, confirmed: false } : item,
      ),
    );
  };

  const confirmedRows = rows.filter((row) => row.confirmed);
  const canAddMoreItems = rows.length > 0 && rows.every((row) => row.confirmed);

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
    const label = String(
      address.address_name || address.full_address || address.address_id || "",
    );
    if (!search) return true;
    return label.toLowerCase().includes(search);
  });
  const filteredShipAddresses = shipAddress.filter((address) => {
    const search = shipSearch.trim().toLowerCase();
    const label = String(
      address.address_name || address.full_address || address.address_id || "",
    );
    if (!search) return true;
    return label.toLowerCase().includes(search);
  });
  const selectedParty = parties.find(
    (party) =>
      party.value === formData.parties &&
      (!selectedPartyCategory ||
        String(party.category || "").toUpperCase() ===
          selectedPartyCategory.toUpperCase()),
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
  const selectedDispatch = branch.find(
    (dispatch) => String(dispatch.bpl_id) === formData.dispatch,
  );
  const selectedCompany = company.find(
    (item) => String(item.id) === formData.company,
  );
  const selectedBillAddressLabel =
    selectedBillAddress?.address_name ||
    selectedBillAddress?.full_address ||
    selectedBillAddress?.address_id ||
    (formData.billAddress ? editOrderFallback.billAddress : "") ||
    "";
  const selectedShipAddressLabel =
    selectedShipAddress?.address_name ||
    selectedShipAddress?.full_address ||
    selectedShipAddress?.address_id ||
    (formData.shipAddress ? editOrderFallback.shipAddress : "") ||
    "";
  const selectedDispatchLabel = selectedDispatch?.bpl_name || "";
  const selectedCompanyLabel = selectedCompany?.name || "";
  const renderRowDropdown = (
    rowIndex: number,
    name: keyof SalesRow,
    value: string,
    options: RowDropdownOption[],
    disabled: boolean,
  ) => {
    const dropdownId = `${rowIndex}-${String(name)}`;
    const selected = options.find((option) => option.value === value);
    const isOpen = openRowDropdown === dropdownId;

    return (
      <div className={`sl-row-dropdown${isOpen ? " open" : ""}`}>
        <button
          type="button"
          className="sl-row-dropdown-trigger"
          disabled={disabled}
          onClick={() => setOpenRowDropdown((current) => current === dropdownId ? null : dropdownId)}
        >
          <span>{selected?.label || "--select--"}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="#64748b"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {isOpen && (
          <div className="sl-row-dropdown-menu">
            <button
              type="button"
              className={`sl-row-dropdown-option${!value ? " is-selected" : ""}`}
              onClick={() => handleRowSelect(rowIndex, String(name), "")}
            >
              --select--
            </button>
            {options.map((option) => (
              <button
                type="button"
                key={`${dropdownId}-${option.value}`}
                className={`sl-row-dropdown-option${option.value === value ? " is-selected" : ""}`}
                onClick={() => handleRowSelect(rowIndex, String(name), option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="sl-page app-page">
      <div className="sl-header app-page-head">
        <div>
          <h1 className="sl-title app-page-title">
            {isEditMode
              ? isFocOrder
                ? "Edit FOC Order"
                : "Edit Sales Order"
              : isDuplicateMode
                ? isFocOrder
                  ? "Duplicate FOC Order"
                  : "Duplicate Sales Order"
                : isFocMode
                  ? "FOC Order"
                  : "Add Sales Order"}
          </h1>
        </div>
      </div>

      {isEditMode && isLoadingEditOrder && (
        <div className="sl-section-label">
          Loading existing order details...
        </div>
      )}

      <form className="sl-form" onSubmit={handleSubmit}>
        {/* Party Name */}
        <div className="sl-section-label">Order Details</div>
        <div className="sl-grid sl-order-grid">
          <div className="sl-field">
            <label className="sl-label">Party Name</label>
            <div
              className={`sl-party-dropdown${partyDropdownOpen ? " open" : ""}`}
              ref={partyDropdownRef}
            >
              <button
                type="button"
                className="sl-party-trigger"
                onClick={() => setPartyDropdownOpen((prev) => !prev)}
              >
                <span>{selectedPartyLabel || "--select--"}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 4.5L6 7.5L9 4.5"
                    stroke="#64748b"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {partyDropdownOpen && (
                <div className="sl-party-menu">
                  <div className="sl-party-search-wrap">
                    <input
                      type="text"
                      className="sl-party-search"
                      placeholder="Search party..."
                      value={partySearch}
                      onChange={(e) => setPartySearch(e.target.value)}
                    />
                  </div>
                  <div className="sl-party-options">
                    {filteredParties.length > 0 ? (
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
                          onClick={() =>
                            handlePartySelect(party.value, party.category || "")
                          }
                        >
                          <span className="sl-party-option-label">
                            {party.label}
                          </span>
                          <span className="sl-party-option-code">
                            {[party.value, party.category]
                              .filter(Boolean)
                              .join(" | ")}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="sl-party-empty">No parties found</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dispatch */}
          <div className="sl-field">
            <label className="sl-label">Dispatch From</label>
            <div
              className={`sl-party-dropdown${dispatchDropdownOpen ? " open" : ""}`}
              ref={dispatchDropdownRef}
            >
              <button
                type="button"
                className="sl-party-trigger"
                onClick={() => setDispatchDropdownOpen((prev) => !prev)}
              >
                <span>{selectedDispatchLabel || "--select--"}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 4.5L6 7.5L9 4.5"
                    stroke="#64748b"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {dispatchDropdownOpen && (
                <div className="sl-party-menu">
                  <div className="sl-party-options">
                    <button
                      type="button"
                      className={`sl-party-option${!formData.dispatch ? " is-selected" : ""}`}
                      onClick={() => handleDispatchSelect("")}
                    >
                      <span className="sl-party-option-label">--select--</span>
                    </button>
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
              <input type="hidden" name="dispatch" value={formData.dispatch} required />
            </div>
          </div>

          {/* Date */}
          <div className="sl-field">
            <label className="sl-label">Date</label>
            <div className="sl-input-wrap">
              <input type="date" name="date" value={formData.date} readOnly />
              <div className="sl-focus-line" />
            </div>
          </div>

          {/* Bill To */}
          <div className="sl-field">
                <label className="sl-label">Bill To Address</label>
                <div
                  className={`sl-party-dropdown${billDropdownOpen ? " open" : ""}`}
                  ref={billDropdownRef}
                >
                  <button
                    type="button"
                    className="sl-party-trigger"
                    onClick={() => setBillDropdownOpen((prev) => !prev)}
                  >
                    <span>{selectedBillAddressLabel || "--select--"}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="#64748b"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {billDropdownOpen && (
                    <div className="sl-party-menu">
                      <div className="sl-party-search-wrap">
                        <input
                          type="text"
                          className="sl-party-search"
                          placeholder="Search bill to..."
                          value={billSearch}
                          onChange={(e) => setBillSearch(e.target.value)}
                        />
                      </div>
                      <div className="sl-party-options">
                        {filteredBillAddresses.length > 0 ? (
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
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <input
                  type="hidden"
                  name="billAddress"
                  value={formData.billAddress}
                  required
                />
          </div>

          {/* Ship To */}
          <div className="sl-field">
                <label className="sl-label">Ship To Address</label>
                <div
                  className={`sl-party-dropdown${shipDropdownOpen ? " open" : ""}`}
                  ref={shipDropdownRef}
                >
                  <button
                    type="button"
                    className="sl-party-trigger"
                    onClick={() => setShipDropdownOpen((prev) => !prev)}
                  >
                    <span>{selectedShipAddressLabel || "--select--"}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="#64748b"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {shipDropdownOpen && (
                    <div className="sl-party-menu">
                      <div className="sl-party-search-wrap">
                        <input
                          type="text"
                          className="sl-party-search"
                          placeholder="Search ship to..."
                          value={shipSearch}
                          onChange={(e) => setShipSearch(e.target.value)}
                        />
                      </div>
                      <div className="sl-party-options">
                        {filteredShipAddresses.length > 0 ? (
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
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <input
                  type="hidden"
                  name="shipAddress"
                  value={formData.shipAddress}
                  required
                />
          </div>

          {/* Delivery Date */}
          <div className="sl-field">
            <label className="sl-label" htmlFor="Deliverydate">
              Delivery Date
            </label>
            <div className="sl-input-wrap">
              <input
                type="date"
                name="Deliverydate"
                value={formData.Deliverydate}
                onChange={handleChange}
                required
              />
              <div className="sl-focus-line" />
            </div>
          </div>

        </div>

        <div className="sl-table-wrap">
          <table className="sl-table">
            <colgroup>
              <col className="sl-col-category" />
              <col className="sl-col-brand" />
              <col className="sl-col-variety" />
              <col className="sl-col-type" />
              <col className="sl-col-item" />
              <col className="sl-col-pcs" />
              <col className="sl-col-boxes" />
              <col className="sl-col-qty" />
              <col className="sl-col-ltrs" />
              <col className="sl-col-price-list-basic" />
              <col className="sl-col-basic-price" />
              <col className="sl-col-tax" />
              <col className="sl-col-amount" />
              <col className="sl-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Category</th>
                <th>Brand</th>
                <th>Sub Group</th>
                <th>Type</th>
                <th>Item</th>
                <th>Pcs</th>
                <th>Boxes</th>
                <th>Qty</th>
                <th>Ltrs</th>
                <th>Price List (Basic)</th>
                <th>Basic Price</th>
                <th>Tax %</th>
                <th>Amount</th>
                <th>X</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => (
                <Fragment key={index}>
                  <tr key={`main-${index}`}>
                    <td>
                      {renderRowDropdown(
                        index,
                        "category",
                        row.category,
                        category.map((c) => ({ value: c, label: c })),
                        row.confirmed && !isEditMode,
                      )}
                    </td>

                    <td>
                      {renderRowDropdown(
                        index,
                        "brand",
                        row.brand,
                        [
                          ...new Set(
                            partyProducts
                              .filter((p) => p.category === row.category)
                              .map((p) => p.brand),
                          ),
                        ].map((b) => ({ value: b ?? "", label: b || "Unknown" })),
                        row.confirmed && !isEditMode,
                      )}
                    </td>

                    <td>
                      {renderRowDropdown(
                        index,
                        "variety",
                        row.variety,
                        [
                          ...new Set(
                            partyProducts
                              .filter(
                                (p) =>
                                  p.category === row.category &&
                                  (p.brand || "") === (row.brand || ""),
                              )
                              .map((p) => p.variety),
                          ),
                        ].map((v) => ({ value: v ?? "", label: v || "Unknown" })),
                        row.confirmed && !isEditMode,
                      )}
                    </td>

                    <td>
                      {renderRowDropdown(
                        index,
                        "type",
                        row.type,
                        [
                          ...new Set(
                            partyProducts
                              .filter(
                                (p) =>
                                  p.category === row.category &&
                                  (p.brand || "") === (row.brand || "") &&
                                  (p.variety || "") === (row.variety || ""),
                              )
                              .map((p) => {
                                const match = p.item_name.match(
                                  /(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i,
                                );
                                return match
                                  ? `${match[1]} ${match[2].toUpperCase()}`
                                  : "Others";
                              }),
                          ),
                        ]
                          .sort((a, b) => {
                            if (a === "Others") return 1;
                            if (b === "Others") return -1;
                            return parseFloat(a) - parseFloat(b);
                          })
                          .map((t) => ({ value: t, label: t })),
                        row.confirmed && !isEditMode,
                      )}
                    </td>

                    <td>
                      {renderRowDropdown(
                        index,
                        "item",
                        row.item,
                        partyProducts
                          .filter(
                            (p) =>
                              p.category === row.category &&
                              (p.brand || "") === (row.brand || "") &&
                              (p.variety || "") === (row.variety || "") &&
                              (row.type
                                ? getProductType(p.item_name) === row.type
                                : true),
                          )
                          .map((p) => ({ value: p.item_name, label: p.item_name })),
                        row.confirmed && !isEditMode,
                      )}
                    </td>

                    <td className="sl-pcs-cell">
                      <input
                        className="sl-compact-number-input"
                        type="number"
                        value={row.pcs ? Number(row.pcs).toFixed(1) : ""}
                        readOnly
                      />
                    </td>

                    <td className="sl-boxes-cell">
                      <input
                        type="number"
                        name="boxes"
                        className="sl-size-input"
                        value={row.boxes}
                        onChange={(e) => handleRowChange(index, e)}
                        disabled={row.confirmed && !isEditMode}
                        required
                      />
                    </td>

                    <td className="sl-qty-cell">
                      <input
                        type="number"
                        name="qty"
                        className="sl-size-input"
                        value={row.qty}
                        onChange={(e) => handleRowChange(index, e)}
                        disabled={row.confirmed && !isEditMode}
                        required
                      />
                    </td>

                    <td className="sl-ltrs-cell">
                      <input className="sl-compact-number-input" type="number" value={row.ltrs} readOnly />
                    </td>

                    <td className="sl-price-list-basic-cell">
                      <input className="sl-compact-number-input" type="number" value={row.priceListBasic} readOnly />
                    </td>

                    <td>
                      <input
                        type="number"
                        name="basicPrice"
                        value={row.basicPrice}
                        onChange={(e) => handleRowChange(index, e)}
                        disabled={row.confirmed && !isEditMode}
                      />
                    </td>

                    <td>
                      <input
                        type="text"
                        value={Number(row.tax).toFixed(2)}
                        readOnly
                      />
                    </td>

                    <td>
                      <input type="number" value={row.amount} readOnly />
                    </td>

                    <td className="sl-row-actions">
                      {!row.confirmed ? (
                        <button
                          type="button"
                          className="sl-confirm-item-btn"
                          onClick={() => handleConfirmRow(index)}
                        >
                          Confirm
                        </button>
                      ) : (
                        <>
                          <span className="sl-row-confirmed-badge">
                            Confirmed
                          </span>
                          <button
                            type="button"
                            className="sl-edit-item-btn"
                            onClick={() => handleEditRow(index)}
                          >
                            Edit
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="sl-delete-btn"
                        onClick={() => handleDeleteRow(index)}
                        aria-label={`Delete item ${index + 1}`}
                        title="Delete item"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 6h18"
                          />
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
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M10 11v6M14 11v6"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>

                  {row.item && !isFocOrder && (
                    <tr key={`scheme-${index}`} className="sl-scheme-row-wrap">
                      <td colSpan={14}>
                        <div
                          className={`sl-scheme-panel${
                            row.isScheme ? " is-active" : ""
                          }`}
                        >
                          <div className="sl-scheme-panel-head">
                            <div>
                              <div className="sl-scheme-eyebrow">
                                Optional promotion
                              </div>
                              <div className="sl-scheme-title">
                                Add scheme to this item
                              </div>
                            </div>
                            <div className="sl-scheme-toggle-compact">
                              <span className="sl-scheme-toggle-label">
                                {row.isScheme ? "Enabled" : "Disabled"}
                              </span>
                              <label className="sl-switch">
                                <input
                                  type="checkbox"
                                  checked={row.isScheme}
                                  onChange={(e) =>
                                    handleRowSchemeToggle(
                                      index,
                                      e.target.checked
                                    )
                                  }
                                  disabled={row.confirmed && !isEditMode}
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
                                {(row.schemes.length
                                  ? row.schemes
                                  : [{ scheme: "", schemeQty: "" }]
                                ).map((schemeRow, schemeIndex) => (
                                  <div
                                    className="sl-scheme-table-row"
                                    key={`${index}-${schemeIndex}`}
                                  >
                                    <select
                                      value={schemeRow.scheme}
                                      onChange={(e) =>
                                        handleSchemeChange(
                                          index,
                                          schemeIndex,
                                          "scheme",
                                          e.target.value
                                        )
                                      }
                                      disabled={
                                        (row.confirmed && !isEditMode) ||
                                        !(schemeOptions[index] || []).length
                                      }
                                    >
                                      <option value="">Select Scheme...</option>
                                      {(schemeOptions[index] || []).map(
                                        (scheme) => (
                                          <option
                                            key={scheme.scheme_id}
                                            value={scheme.scheme_id}
                                          >
                                            {scheme.scheme_name}
                                          </option>
                                        )
                                      )}
                                    </select>
                                    <input
                                      type="text"
                                      value={schemeRow.schemeQty}
                                      placeholder="0"
                                      onChange={(e) =>
                                        handleSchemeChange(
                                          index,
                                          schemeIndex,
                                          "schemeQty",
                                          e.target.value
                                        )
                                      }
                                      disabled={row.confirmed && !isEditMode}
                                    />
                                    <button
                                      type="button"
                                      className="sl-remove-scheme-btn"
                                      onClick={() =>
                                        handleRemoveScheme(index, schemeIndex)
                                      }
                                      disabled={row.confirmed && !isEditMode}
                                      aria-label="Remove scheme"
                                      title="Remove scheme"
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          d="M5 12h14"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="sl-add-scheme-btn"
                                  onClick={() => handleAddScheme(index)}
                                  disabled={row.confirmed && !isEditMode}
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      d="M12 5v14M5 12h14"
                                    />
                                  </svg>
                                  Add Scheme
                                </button>
                              </div>

                              <div className="sl-scheme-total-card">
                                <span className="sl-scheme-field-label">
                                  Total Ltrs
                                </span>
                                <input
                                  type="text"
                                  name="totalLtrs"
                                  value={
                                    row.schemes.length
                                      ? (
                                          Number(row.ltrs) +
                                          row.schemes.reduce(
                                            (sum, scheme) =>
                                              sum +
                                              Number(scheme.schemeQty || 0),
                                            0
                                          )
                                        ).toFixed(2)
                                      : Number(row.ltrs).toFixed(2)
                                  }
                                  readOnly
                                />
                                <small>
                                  Base ltrs plus selected scheme quantity
                                </small>
                              </div>
                            </div>
                          )}

                          {/* <div className="sl-scheme-qty-field">
                            <label className="sl-scheme-field-label">Scheme Ltrs</label>
                            <input
                              type="text"
                              name="schemeLtrs"
                              value={row.isScheme && row.schemeLtrs ? Number(row.schemeLtrs).toFixed(2) : ""}
                              readOnly
                            />
                          </div> */}

                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {canAddMoreItems && (
          <button type="button" className="sl-add-row" onClick={handleAddRow}>
            <span>+ Add Item</span>
          </button>
        )}

        <div className="sl-section-label">Summary</div>
        <div className="sl-grid sl-summary-grid">
          {canEditPoNumber && (
            <div className="sl-field">
              <label className="sl-label" htmlFor="poNumber">
                PO Number
              </label>
              <div className="sl-input-wrap">
                <input
                  type="text"
                  id="poNumber"
                  name="poNumber"
                  value={formData.poNumber}
                  onChange={handleChange}
                  placeholder="Enter PO number"
                />
                <div className="sl-focus-line" />
              </div>
            </div>
          )}

          <div className="sl-field">
            <label className="sl-label">Company</label>
            <div
              className={`sl-party-dropdown${companyDropdownOpen ? " open" : ""}`}
              ref={companyDropdownRef}
            >
              <button
                type="button"
                className="sl-party-trigger"
                onClick={() => setCompanyDropdownOpen((prev) => !prev)}
              >
                <span>{selectedCompanyLabel || "Select Company"}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 4.5L6 7.5L9 4.5"
                    stroke="#64748b"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {companyDropdownOpen && (
                <div className="sl-party-menu">
                  <div className="sl-party-options">
                    <button
                      type="button"
                      className={`sl-party-option${!formData.company ? " is-selected" : ""}`}
                      onClick={() => handleCompanySelect("")}
                    >
                      <span className="sl-party-option-label">Select Company</span>
                    </button>
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
              <input type="hidden" name="company" value={formData.company} required />
            </div>
          </div>

          <div className="sl-field">
            <label className="sl-label">Total</label>
            <div className="sl-input-wrap">
              <input type="text" value={totalAmount.toFixed(2)} readOnly />
              <div className="sl-focus-line" />
            </div>
          </div>
          <div className="sl-field">
            <label className="sl-label">Tax</label>
            <div className="sl-input-wrap">
              <input type="text" value={taxAmount} readOnly />
              <div className="sl-focus-line" />
            </div>
          </div>

          <div className="sl-field">
            <label className="sl-label">Grand Total</label>
            <div className="sl-input-wrap">
              <input
                type="text"
                name="gtotal"
                value={grandTotal.toFixed(1)}
                readOnly
              />
              <div className="sl-focus-line" />
            </div>
          </div>

          <div className="sl-field sl-full">
            <label className="sl-label" htmlFor="comment">Comment</label>
            <div className="sl-input-wrap sl-input-wrap-textarea">
              <textarea
                id="comment"
                name="comment"
                rows={2}
                placeholder="Add a note..."
                value={formData.comment}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, comment: e.target.value }))
                }
              />
              <div className="sl-focus-line" />
            </div>
          </div>
        </div>

        <div className="sl-actions">
          <button
            type="submit"
            className="sl-btn-save"
            disabled={
              isSaving ||
              confirmedRows.length === 0 ||
              rows.some((row) => !row.confirmed && row.item)
            }
          >
            <span>
              {isEditMode
                ? "Update Order"
                : isDuplicateMode
                  ? "Create as New"
                  : isFocMode
                    ? "Create FOC Order"
                    : "Save Order"}
            </span>
          </button>
          {(!isEditMode || editOrderIsDraft) && (
            <button
              type="button"
              className="sl-btn-draft"
              onClick={handleSaveDraft}
              disabled={isSaving || isSavingDraft}
            >
              <span>{isSavingDraft ? "Saving Draft..." : "Save as Draft"}</span>
            </button>
          )}
          <button
            type="button"
            className="sl-btn-clear"
            onClick={handleClearForm}
          >
            <span>{isLoadingFromOrder ? "Cancel" : "Clear"}</span>
          </button>
        </div>
      </form>

      {showSaveConfirm && (
        <div className="sl-modal-overlay">
          <div
            className="sl-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sl-save-confirm-title"
          >
            <div id="sl-save-confirm-title" className="sl-modal-title">
              {isEditMode
                ? "Confirm Update"
                : isDuplicateMode
                  ? "Confirm New Order"
                  : isFocMode
                    ? "Confirm FOC Order"
                  : "Confirm Save"}
            </div>
            <p className="sl-modal-text">
              {isEditMode
                ? "Are you sure you want to update this order?"
                  : isDuplicateMode
                    ? "Are you sure you want to create a new order based on this one?"
                  : isFocMode
                    ? "Are you sure you want to create this FOC order?"
                  : "Are you sure you want to save this order?"}
            </p>
            <div className="sl-modal-actions">
              <button
                type="button"
                className="sl-modal-btn sl-modal-btn-secondary"
                onClick={() => setShowSaveConfirm(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sl-modal-btn sl-modal-btn-primary"
                onClick={submitOrder}
                disabled={isSaving}
              >
                {isSaving
                  ? isEditMode
                    ? "Updating..."
                    : "Creating..."
                  : isEditMode
                    ? "Yes, Update"
                    : isFocMode
                      ? "Yes, Create FOC"
                      : "Yes, Create New"}
              </button>
            </div>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="sl-modal-overlay">
          <div className="sl-modal sl-success-modal">
            <div className="sl-success-mark" aria-hidden="true" />
            <div className="sl-modal-title">{saveSuccess.message}</div>
            <div className="sl-success-details">
              <div className="sl-success-row">
                <span>Order ID</span>
                <strong>{saveSuccess.orderId}</strong>
              </div>
              <div className="sl-success-row">
                <span>Received Next By</span>
                <strong>{saveSuccess.nextStage}</strong>
              </div>
            </div>
            <div className="sl-modal-actions">
              <button
                type="button"
                className="sl-modal-btn"
                onClick={handleSuccessClose}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

