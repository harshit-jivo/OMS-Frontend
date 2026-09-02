import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChangeEvent, FormEvent } from "react";
import { ordersService } from "../services/ordersService";
import type { Product } from "../services/ordersService";
import { userService } from "../services/userService";
import { useUILabels } from "../services/uiConfig";
import "../styles/Add_Sales.css";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type StaffRow = {
  category: string;
  type: string;
  item: string;
  pcs: string;
  boxes: string;
  qty: string;
  ltrs: string;
  priceListBasic: string;
  tax: string;
  amount: string;
  confirmed: boolean;
};

const createEmptyRow = (): StaffRow => ({
  category: "",
  type: "",
  item: "",
  pcs: "",
  boxes: "",
  qty: "",
  ltrs: "",
  priceListBasic: "",
  tax: "",
  amount: "",
  confirmed: false,
});

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getProductType = (itemName: string) => {
  const match = itemName.match(/(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i);
  return match ? `${match[1]} ${match[2].toUpperCase()}` : "Others";
};

/** The three envelopes this API has used for a list: bare, `{data}`, and
 *  `{results}` (DRF pagination). */
const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const envelope = value as { data?: unknown; results?: unknown } | null | undefined;
  if (Array.isArray(envelope?.data)) return envelope.data;
  if (Array.isArray(envelope?.results)) return envelope.results;
  return [];
};

const getCategoryText = (value: unknown) => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  const row = value as { category?: unknown; name?: unknown; label?: unknown } | null | undefined;
  return String(row?.category || row?.name || row?.label || "").trim();
};

const normalizeCategory = (value: unknown) => getCategoryText(value).toUpperCase();

/** Stable empties, so the row/total memos settle. */
type BranchOption = { bpl_id: number | string; bpl_name: string };
const NO_ROWS: BranchOption[] = [];
const NO_PRODUCTS: Product[] = [];
const NO_CATEGORIES: string[] = [];

export default function Staff() {
  const { t } = useUILabels();
  const typeDropdownRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const itemDropdownRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const typeTriggerRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const itemTriggerRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [employeeName, setEmployeeName] = useState("");
  /*
   * One query for all three, matching the original `Promise.all`. That grouping
   * is load-bearing: `categoryOptions` is the UNION of the master category list
   * and the categories present on the products, so the two must be read
   * together or the dropdown can show a category no product has.
   *
   * The old version wrapped all three in a single try whose catch was a
   * `console.log` with no state written — one failing endpoint silently blanked
   * the Dispatch From select, the Category select and the whole item catalogue
   * at once, with nothing on screen to say so.
   */
  const { data: staffData, isError: staffLoadFailed } = useQuery({
    queryKey: ["staff", "page"],
    queryFn: async () => {
      const [branchData, productData, categoryData] = await Promise.all([
        ordersService.getBranches(),
        ordersService.getStaffProducts(),
        userService.getCategories(),
      ]);
      const products = asArray(productData) as Product[];
      const productCategories = products
        .map((product) => getCategoryText(product.category))
        .filter(Boolean);
      const masterCategories = asArray(categoryData).map(getCategoryText).filter(Boolean);
      return {
        branches: asArray(branchData) as BranchOption[],
        products,
        categoryOptions: [...new Set([...masterCategories, ...productCategories])],
      };
    },
  });
  const branches = staffData?.branches ?? NO_ROWS;
  const products = staffData?.products ?? NO_PRODUCTS;
  const categoryOptions = staffData?.categoryOptions ?? NO_CATEGORIES;
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOrderNumber, setSavedOrderNumber] = useState("");
  const [typeSearch, setTypeSearch] = useState<Record<number, string>>({});
  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<Record<number, boolean>>({});
  const [itemDropdownOpen, setItemDropdownOpen] = useState<Record<number, boolean>>({});
  const [dropdownPosition, setDropdownPosition] = useState<
    Record<string, { top: number; left: number; width: number }>
  >({});
  const [formData, setFormData] = useState({
    dispatch: "",
    date: formatDateInput(new Date()),
  });
  const [rows, setRows] = useState<StaffRow[]>([createEmptyRow()]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const typeClicked = Object.values(typeDropdownRefs.current).some((ref) =>
        ref?.contains(target),
      );
      const itemClicked = Object.values(itemDropdownRefs.current).some((ref) =>
        ref?.contains(target),
      );

      if (!typeClicked) setTypeDropdownOpen({});
      if (!itemClicked) setItemDropdownOpen({});
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const categories = useMemo(() => categoryOptions, [categoryOptions]);

  const confirmedRows = rows.filter((row) => row.confirmed);
  const canAddMoreItems = rows.length > 0 && rows.every((row) => row.confirmed);
  const totalAmount = confirmedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const taxAmount = confirmedRows.reduce(
    (sum, row) => sum + (Number(row.amount || 0) * Number(row.tax || 0)) / 100,
    0,
  );
  const grandTotal = totalAmount + taxAmount;

  const getRowProduct = (row: StaffRow) =>
    products.find(
      (product) =>
        product.item_name === row.item &&
        normalizeCategory(product.category) === normalizeCategory(row.category),
    ) || products.find((product) => product.item_name === row.item);

  const recalculateRow = (row: StaffRow, source: "boxes" | "qty" | "price") => {
    const product = getRowProduct(row);
    if (!product) return row;

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
    row.amount =
      qty > 0 && Number(row.priceListBasic) > 0
        ? (qty * Number(row.priceListBasic)).toFixed(2)
        : "";

    return row;
  };

  const updateRowField = (index: number, name: string, value: string) => {
    setRows((currentRows) => {
      const nextRows = [...currentRows];
      let row = { ...nextRows[index], [name]: value, confirmed: false };

      if (name === "category") {
        row = {
          ...row,
          type: "",
          item: "",
          pcs: "",
          boxes: "",
          qty: "",
          ltrs: "",
          priceListBasic: "",
          tax: "",
          amount: "",
        };
      }

      if (name === "type") {
        row = {
          ...row,
          item: "",
          pcs: "",
          boxes: "",
          qty: "",
          ltrs: "",
          priceListBasic: "",
          tax: "",
          amount: "",
        };
      }

      if (name === "item") {
        const product = products.find(
          (item) =>
            item.item_name === value &&
            normalizeCategory(item.category) === normalizeCategory(row.category),
        );

        row.boxes = "";
        row.qty = "";
        row.ltrs = "";
        row.amount = "";

        if (product) {
          row.type = getProductType(product.item_name);
          row.pcs = String(product.sal_factor2 ?? "");
          row.priceListBasic = String(product.staff_rate ?? "");
          row.tax = String(product.tax_rate ?? "");
        }
      }

      if (name === "boxes") row = recalculateRow(row, "boxes");
      if (name === "qty") row = recalculateRow(row, "qty");

      nextRows[index] = row;
      return nextRows;
    });

    if (name === "category") {
      setTypeSearch((prev) => ({ ...prev, [index]: "" }));
      setItemSearch((prev) => ({ ...prev, [index]: "" }));
      setTypeDropdownOpen((prev) => ({ ...prev, [index]: false }));
      setItemDropdownOpen((prev) => ({ ...prev, [index]: false }));
    }

    if (name === "type") {
      setItemSearch((prev) => ({ ...prev, [index]: "" }));
      setTypeSearch((prev) => ({ ...prev, [index]: "" }));
      setTypeDropdownOpen((prev) => ({ ...prev, [index]: false }));
      setItemDropdownOpen((prev) => ({ ...prev, [index]: false }));
    }

    if (name === "item") {
      setItemSearch((prev) => ({ ...prev, [index]: "" }));
      setItemDropdownOpen((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleRowChange = (index: number, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    updateRowField(index, e.target.name, e.target.value);
  };

  const isRowValid = (row: StaffRow) =>
    row.category && row.type && row.item && Number(row.qty) > 0 && Number(row.priceListBasic) >= 0;

  const handleConfirmRow = (index: number) => {
    if (!isRowValid(rows[index])) {
      alert("Please complete this item before confirming it.");
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row, rowIndex) => (rowIndex === index ? { ...row, confirmed: true } : row)),
    );
  };

  const handleEditRow = (index: number) => {
    setRows((currentRows) =>
      currentRows.map((row, rowIndex) => (rowIndex === index ? { ...row, confirmed: false } : row)),
    );
  };

  const handleDeleteRow = (index: number) => {
    setRows((currentRows) => {
      const nextRows = currentRows.filter((_, rowIndex) => rowIndex !== index);
      return nextRows.length ? nextRows : [createEmptyRow()];
    });
  };

  const handleAddRow = () => {
    if (!canAddMoreItems) return;
    setRows((currentRows) => [...currentRows, createEmptyRow()]);
  };

  const openTypeDropdown = (index: number) => {
    const rect = typeTriggerRefs.current[index]?.getBoundingClientRect();
    if (!rect) return;

    setItemDropdownOpen({});
    setDropdownPosition((prev) => ({
      ...prev,
      [`type-${index}`]: {
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 260),
      },
    }));
    setTypeDropdownOpen((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const openItemDropdown = (index: number) => {
    const rect = itemTriggerRefs.current[index]?.getBoundingClientRect();
    if (!rect) return;

    setTypeDropdownOpen({});
    setDropdownPosition((prev) => ({
      ...prev,
      [`item-${index}`]: {
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 320),
      },
    }));
    setItemDropdownOpen((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleClear = () => {
    setEmployeeName("");
    setFormData({ dispatch: "", date: formatDateInput(new Date()) });
    setRows([createEmptyRow()]);
    setTypeSearch({});
    setItemSearch({});
    setTypeDropdownOpen({});
    setItemDropdownOpen({});
    setShowSuccess(false);
    setSavedOrderNumber("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.dispatch) {
      alert("Please select dispatch from.");
      return;
    }

    if (!employeeName.trim()) {
      alert("Please enter Employee ID.");
      return;
    }

    if (!confirmedRows.length) {
      alert("Please confirm at least one item before saving.");
      return;
    }

    if (rows.some((row) => !row.confirmed && row.item)) {
      alert("Please confirm the current item before saving.");
      return;
    }

    const selectedBranch = branches.find(
      (branch) => String(branch.bpl_id) === String(formData.dispatch),
    );

    const payload = {
      order_type: "STAFF" as const,
      employee_id: employeeName.trim(),
      card_code: "",
      card_name: employeeName.trim(),
      bill_to_id: 0,
      bill_to_address: "",
      ship_to_id: 0,
      ship_to_address: "",
      dispatch_from_id: Number(formData.dispatch),
      dispatch_from_name: selectedBranch?.bpl_name || "",
      delivery_date: formData.date,
      company: 0,
      total_amount: totalAmount,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      items: confirmedRows.map((row) => {
        const product = getRowProduct(row);

        return {
          item_code: product?.item_code || "",
          item_name: row.item,
          category: row.category,
          brand: "",
          variety: "",
          item_type: row.type,
          qty: Number(row.qty || 0),
          pcs: Number(row.pcs || 0),
          boxes: Number(row.boxes || 0),
          ltrs: Number(row.ltrs || 0),
          price_list_basic: Number(row.priceListBasic || 0),
          basic_price: 0,
          tax_rate: Number(row.tax || 0),
          total: Number(row.amount || 0),
          schemes: [],
          total_ltrs: Number(row.ltrs || 0),
        };
      }),
    };

    try {
      setIsSaving(true);
      const response = await ordersService.createOrder(payload);
      setSavedOrderNumber(String(response?.order_number || ""));
      setShowSuccess(true);
      setRows([createEmptyRow()]);
    } catch (error) {
      console.log("Error saving staff order:", error);
      alert("Failed to save staff order.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="sl-page app-page">
      <div className="sl-header app-page-head">
        <div>
          <h1 className="sl-title app-page-title">Staff Orders</h1>
        </div>
      </div>

      {/* One failing endpoint used to blank the branch list, the category list
          AND the item catalogue at once, with only a console.log to show for
          it — three empty dropdowns that look like configuration, not failure. */}
      {staffLoadFailed && (
        <div className="sl-field-error" role="alert">
          Could not load branches, categories or the item catalogue. Refresh to try again.
        </div>
      )}

      <form className="sl-form" onSubmit={handleSubmit}>
        <div className="sl-section-label">Order Details</div>
        <div className="sl-grid sl-order-grid">
          <div className="sl-field">
            <label className="sl-label" htmlFor="employeeName">
              Employee ID
            </label>
            <div className="sl-input-wrap">
              <input
                id="employeeName"
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Enter Employee ID"
                required
              />
            </div>
          </div>

          <div className="sl-field">
            <label className="sl-label" htmlFor="dispatch">
              Dispatch From
            </label>
            <div className="sl-input-wrap">
              <select
                id="dispatch"
                name="dispatch"
                value={formData.dispatch}
                onChange={(e) => setFormData((prev) => ({ ...prev, dispatch: e.target.value }))}
                required
              >
                <option value="">--select--</option>
                {branches.map((branch) => (
                  <option key={branch.bpl_id} value={branch.bpl_id}>
                    {branch.bpl_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="sl-field">
            <label className="sl-label" htmlFor="date">
              Date
            </label>
            <div className="sl-input-wrap">
              <input id="date" type="date" value={formData.date} readOnly />
            </div>
          </div>
        </div>

        <div className="sl-table-wrap">
          <Table density="compact">
            <colgroup>
              <col className="sl-col-category" />
              <col className="sl-col-type" />
              <col className="sl-col-item" />
              <col className="sl-col-pcs" />
              <col className="sl-col-boxes" />
              <col className="sl-col-qty" />
              <col className="sl-col-ltrs" />
              <col className="sl-col-price-list-basic" />
              <col className="sl-col-tax" />
              <col className="sl-col-amount" />
              <col className="sl-col-actions" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Pcs</TableHead>
                <TableHead>Boxes</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Ltrs</TableHead>
                <TableHead>{t("price_list", "Price List (Basic)")}</TableHead>
                <TableHead>Tax %</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>X</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const typeOptions = [
                  ...new Set(
                    products
                      .filter(
                        (product) =>
                          normalizeCategory(product.category) === normalizeCategory(row.category),
                      )
                      .map((product) => getProductType(product.item_name)),
                  ),
                ].sort((a, b) => {
                  if (a === "Others") return 1;
                  if (b === "Others") return -1;
                  return parseFloat(a) - parseFloat(b);
                });
                const filteredTypeOptions = typeOptions.filter((type) =>
                  type.toLowerCase().includes((typeSearch[index] || "").toLowerCase()),
                );
                const itemOptions = products.filter((product) => {
                  const sameCategory =
                    normalizeCategory(product.category) === normalizeCategory(row.category);

                  const sameType = row.type ? getProductType(product.item_name) === row.type : true;

                  return sameCategory && sameType;
                });
                const filteredItemOptions = itemOptions.filter((product) =>
                  product.item_name.toLowerCase().includes((itemSearch[index] || "").toLowerCase()),
                );

                return (
                  <Fragment key={index}>
                    <TableRow>
                      <TableCell>
                        <select
                          name="category"
                          value={row.category}
                          onChange={(e) => handleRowChange(index, e)}
                          disabled={row.confirmed}
                          required
                        >
                          <option value="">--select--</option>
                          {categories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </TableCell>

                      <TableCell>
                        <div
                          className={`sl-party-dropdown${typeDropdownOpen[index] ? " open" : ""}`}
                          ref={(node) => {
                            typeDropdownRefs.current[index] = node;
                          }}
                        >
                          <button
                            type="button"
                            className="sl-party-trigger"
                            ref={(node) => {
                              typeTriggerRefs.current[index] = node;
                            }}
                            onClick={() => openTypeDropdown(index)}
                            disabled={row.confirmed || !row.category}
                          >
                            <span className="sl-party-trigger-text">
                              {row.type || (row.category ? "--select--" : "Select category first")}
                            </span>
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
                          {typeDropdownOpen[index] && (
                            <div
                              className="sl-party-menu staff-floating-menu"
                              style={dropdownPosition[`type-${index}`]}
                            >
                              <div className="sl-party-search-wrap">
                                <input
                                  type="text"
                                  className="sl-party-search"
                                  value={typeSearch[index] || ""}
                                  onChange={(e) =>
                                    setTypeSearch((prev) => ({
                                      ...prev,
                                      [index]: e.target.value,
                                    }))
                                  }
                                  placeholder="Search type..."
                                  autoFocus
                                />
                              </div>
                              <div className="sl-party-options">
                                {filteredTypeOptions.length > 0 ? (
                                  filteredTypeOptions.map((type) => (
                                    <button
                                      type="button"
                                      key={type}
                                      className="sl-party-option"
                                      onClick={() => updateRowField(index, "type", type)}
                                    >
                                      <span className="sl-party-option-label">{type}</span>
                                    </button>
                                  ))
                                ) : (
                                  <div className="sl-party-empty">No types found</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div
                          className={`sl-party-dropdown${itemDropdownOpen[index] ? " open" : ""}`}
                          ref={(node) => {
                            itemDropdownRefs.current[index] = node;
                          }}
                        >
                          <button
                            type="button"
                            className="sl-party-trigger"
                            ref={(node) => {
                              itemTriggerRefs.current[index] = node;
                            }}
                            onClick={() => openItemDropdown(index)}
                            disabled={row.confirmed || !row.category}
                          >
                            <span className="sl-party-trigger-text">
                              {row.item || (row.category ? "--select--" : "Select category first")}
                            </span>
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
                          {itemDropdownOpen[index] && (
                            <div
                              className="sl-party-menu staff-floating-menu"
                              style={dropdownPosition[`item-${index}`]}
                            >
                              <div className="sl-party-search-wrap">
                                <input
                                  type="text"
                                  className="sl-party-search"
                                  value={itemSearch[index] || ""}
                                  onChange={(e) =>
                                    setItemSearch((prev) => ({
                                      ...prev,
                                      [index]: e.target.value,
                                    }))
                                  }
                                  placeholder="Search item..."
                                  autoFocus
                                />
                              </div>
                              <div className="sl-party-options">
                                {filteredItemOptions.length > 0 ? (
                                  filteredItemOptions.map((product) => (
                                    <button
                                      type="button"
                                      key={`${product.item_code || product.item_name}-${product.category || ""}`}
                                      className="sl-party-option"
                                      onClick={() =>
                                        updateRowField(index, "item", product.item_name)
                                      }
                                    >
                                      <span className="sl-party-option-label">
                                        {product.item_name}
                                      </span>
                                      {product.item_code && (
                                        <span className="sl-party-option-code">
                                          {product.item_code}
                                        </span>
                                      )}
                                    </button>
                                  ))
                                ) : (
                                  <div className="sl-party-empty">No items found</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="sl-pcs-cell">
                        <input
                          className="sl-compact-number-input"
                          type="number"
                          value={row.pcs ? Number(row.pcs).toFixed(1) : ""}
                          readOnly
                        />
                      </TableCell>

                      <TableCell className="sl-boxes-cell">
                        <input
                          className="sl-size-input"
                          type="number"
                          name="boxes"
                          value={row.boxes}
                          onChange={(e) => handleRowChange(index, e)}
                          disabled={row.confirmed}
                          required
                        />
                      </TableCell>

                      <TableCell className="sl-qty-cell">
                        <input
                          className="sl-size-input"
                          type="number"
                          name="qty"
                          value={row.qty}
                          onChange={(e) => handleRowChange(index, e)}
                          disabled={row.confirmed}
                          required
                        />
                      </TableCell>

                      <TableCell className="sl-ltrs-cell">
                        <input
                          className="sl-compact-number-input"
                          type="number"
                          value={row.ltrs}
                          readOnly
                        />
                      </TableCell>

                      <TableCell className="sl-price-list-basic-cell">
                        <input
                          className="sl-compact-number-input"
                          type="number"
                          value={row.priceListBasic}
                          readOnly
                        />
                      </TableCell>

                      <TableCell>
                        <input
                          type="text"
                          value={row.tax ? Number(row.tax).toFixed(2) : ""}
                          readOnly
                        />
                      </TableCell>

                      <TableCell>
                        <input type="number" value={row.amount} readOnly />
                      </TableCell>

                      <TableCell className="sl-row-actions">
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
                            <span className="sl-row-confirmed-badge">Confirmed</span>
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
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M10 11v6M14 11v6"
                            />
                          </svg>
                        </button>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {canAddMoreItems && (
          <button type="button" className="sl-add-row" onClick={handleAddRow}>
            <span>+ Add Item</span>
          </button>
        )}

        <div className="sl-section-label">Summary</div>
        <div className="sl-grid sl-summary-grid">
          <div className="sl-field">
            <label className="sl-label">Total</label>
            <div className="sl-input-wrap">
              <input type="text" value={totalAmount.toFixed(2)} readOnly />
            </div>
          </div>

          <div className="sl-field">
            <label className="sl-label">Tax</label>
            <div className="sl-input-wrap">
              <input type="text" value={taxAmount.toFixed(2)} readOnly />
            </div>
          </div>

          <div className="sl-field">
            <label className="sl-label">Grand Total</label>
            <div className="sl-input-wrap">
              <input type="text" value={grandTotal.toFixed(1)} readOnly />
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
            <span>{isSaving ? "Saving..." : "Save Staff Order"}</span>
          </button>
          <button type="button" className="sl-btn-clear" onClick={handleClear}>
            <span>Clear</span>
          </button>
        </div>
      </form>

      <Dialog
        open={Boolean(showSuccess)}
        onOpenChange={(next) => {
          if (!next) setShowSuccess(false);
        }}
      >
        {showSuccess && (
          <DialogContent
            title="Saved"
            variant="bare"
            size="auto"
            showClose={false}
            className="sl-modal sl-success-modal"
          >
            <div className="sl-success-mark" aria-hidden="true" />
            <div className="sl-modal-title">Staff order prepared successfully</div>
            <div className="sl-success-details">
              <div className="sl-success-row">
                <span>Employee</span>
                <strong>{employeeName || "-"}</strong>
              </div>
              <div className="sl-success-row">
                <span>Status</span>
                <strong>Saved</strong>
              </div>
              <div className="sl-success-row">
                <span>Order No.</span>
                <strong>{savedOrderNumber || "-"}</strong>
              </div>
            </div>
            <div className="sl-modal-actions">
              <button type="button" className="sl-modal-btn" onClick={() => setShowSuccess(false)}>
                OK
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
