/**
 * Staff Orders — an internal order raised against an employee ID rather than a
 * party, priced from each product's staff rate.
 *
 * Rows are built and then Confirmed; a confirmed row locks and the totals
 * count only confirmed rows, which is why Add Item is unavailable until every
 * row is confirmed.
 */
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChangeEvent, FormEvent } from "react";
import { HiOutlinePlus, HiOutlineTrash } from "react-icons/hi2";

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
import { DetailFields } from "@/components/ui/detail";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import {
  Card,
  Notice,
  Page,
  PageHeader,
  SectionHeading,
  Stat,
  StatRow,
} from "@/components/ui/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { showToast } from "@/lib/toastStore";
import { ordersService } from "../services/ordersService";
import type { Product } from "../services/ordersService";
import { userService } from "../services/userService";
import { useUILabels } from "../services/uiConfig";

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
  return year + "-" + month + "-" + day;
};

const getProductType = (itemName: string) => {
  const match = itemName.match(/(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i);
  return match ? match[1] + " " + match[2].toUpperCase() : "Others";
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

const money = (n: number, decimals = 2) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export default function Staff() {
  const { t } = useUILabels();
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
  const categories = staffData?.categoryOptions ?? NO_CATEGORIES;

  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOrderNumber, setSavedOrderNumber] = useState("");
  const [formData, setFormData] = useState({
    dispatch: "",
    date: formatDateInput(new Date()),
  });
  const [rows, setRows] = useState<StaffRow[]>([createEmptyRow()]);

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
  };

  const handleRowChange = (
    index: number,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    updateRowField(index, e.target.name, e.target.value);
  };

  const isRowValid = (row: StaffRow) =>
    Boolean(row.category) &&
    Boolean(row.type) &&
    Boolean(row.item) &&
    Number(row.qty) > 0 &&
    Number(row.priceListBasic) >= 0;

  const handleConfirmRow = (index: number) => {
    // Guarded by the button's `disabled` too — this is the second lock, not
    // the message. The `alert("Please complete this item…")` it replaces fired
    // AFTER the press, which is the pattern DESIGN_SYSTEM §6 exists to end.
    if (!isRowValid(rows[index])) return;

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

  const handleClear = () => {
    setEmployeeName("");
    setFormData({ dispatch: "", date: formatDateInput(new Date()) });
    setRows([createEmptyRow()]);
    setShowSuccess(false);
    setSavedOrderNumber("");
  };

  /*
   * Everything the save needs. Four `alert()` calls checked these AFTER the
   * button was pressed; the button says so instead, and stays disabled.
   */
  const blockers: string[] = [];
  if (!formData.dispatch) blockers.push("choose where it dispatches from");
  if (!employeeName.trim()) blockers.push("enter an employee ID");
  if (!confirmedRows.length) blockers.push("confirm at least one item");
  if (rows.some((row) => !row.confirmed && row.item)) blockers.push("confirm the item in progress");
  const canSave = blockers.length === 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || isSaving) return;

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
      console.error("Error saving staff order:", error);
      showToast({
        title: "Could not save the staff order",
        message: "Nothing was submitted. Check your connection and try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  /** Pack types available within a row's chosen category. */
  const typeOptionsFor = (category: string) =>
    [
      ...new Set(
        products
          .filter((product) => normalizeCategory(product.category) === normalizeCategory(category))
          .map((product) => getProductType(product.item_name)),
      ),
    ].sort((a, b) => {
      if (a === "Others") return 1;
      if (b === "Others") return -1;
      return parseFloat(a) - parseFloat(b);
    });

  /** Items within a row's chosen category and (optional) type. */
  const itemOptionsFor = (category: string, type: string) =>
    products.filter((product) => {
      const sameCategory =
        normalizeCategory(product.category) === normalizeCategory(category);
      const sameType = type ? getProductType(product.item_name) === type : true;
      return sameCategory && sameType;
    });

  const dispatchName = useMemo(
    () =>
      branches.find((branch) => String(branch.bpl_id) === String(formData.dispatch))?.bpl_name ||
      "",
    [branches, formData.dispatch],
  );

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Orders" }, { label: "Staff Orders" }]} />

      <PageHeader
        eyebrow="Orders"
        title="Staff Orders"
        description="An internal order against an employee ID, priced from each product's staff rate."
      />

      {/* One failing endpoint used to blank the branch list, the category list
          AND the item catalogue at once, with only a console.log to show for
          it — three empty dropdowns that look like configuration, not failure. */}
      {staffLoadFailed && (
        <Notice tone="bad" title="Could not load the form">
          Branches, categories or the item catalogue failed to load, so those lists are empty
          because of the failure rather than because there is nothing in them. Refresh to try
          again.
        </Notice>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 sm:space-y-6">
        <Card>
          <FormGrid>
            <Field label="Employee ID" required>
              {(control) => (
                <Input
                  {...control}
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="Enter employee ID"
                  required
                />
              )}
            </Field>

            <Field label="Dispatch from" required>
              {(control) => (
                <Select
                  {...control}
                  value={formData.dispatch}
                  onChange={(e) => setFormData((prev) => ({ ...prev, dispatch: e.target.value }))}
                  required
                >
                  <option value="">Select a branch</option>
                  {branches.map((branch) => (
                    <option key={branch.bpl_id} value={branch.bpl_id}>
                      {branch.bpl_name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Date" hint="Today. Staff orders dispatch same-day.">
              {(control) => <Input {...control} type="date" value={formData.date} readOnly />}
            </Field>
          </FormGrid>
        </Card>

        <section className="space-y-3">
          <SectionHeading>Items</SectionHeading>

          {/*
            `overflow-x-auto`, and the two pickers below are native <select>s
            because of it.

            They were hand-rolled popups positioned with
            `getBoundingClientRect()` — viewport coordinates, which only work
            on a `position: fixed` element. The rule that made them fixed
            (`.staff-order-table .staff-floating-menu`) is COMMENTED OUT in
            `Add_Sales.css`, so they were absolutely positioned inside this
            scrolling wrapper using fixed-position numbers, and landed in the
            wrong place. A native select's list is drawn by the browser outside
            the document, so it can neither be clipped by this container nor
            mispositioned by it. The lists are short — items are already scoped
            to one category and one pack type.
          */}
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[130px]">Category</TableHead>
                    <TableHead className="min-w-[110px]">Type</TableHead>
                    <TableHead className="min-w-[200px]">Item</TableHead>
                    <TableHead className="text-right">Pcs</TableHead>
                    <TableHead className="w-[92px]">Boxes</TableHead>
                    <TableHead className="w-[92px]">Qty</TableHead>
                    <TableHead className="text-right">Ltrs</TableHead>
                    <TableHead className="text-right">
                      {t("price_list", "Price List (Basic)")}
                    </TableHead>
                    <TableHead className="text-right">Tax %</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right" aria-label="Actions" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => {
                    const typeOptions = typeOptionsFor(row.category);
                    const itemOptions = itemOptionsFor(row.category, row.type);
                    const rowValid = isRowValid(row);

                    return (
                      <Fragment key={index}>
                        <TableRow className={row.confirmed ? "bg-ok-soft/40" : ""}>
                          <TableCell>
                            <Select
                              name="category"
                              value={row.category}
                              onChange={(e) => handleRowChange(index, e)}
                              disabled={row.confirmed}
                              aria-label={"Category for item " + (index + 1)}
                              className="h-control-sm"
                              required
                            >
                              <option value="">Select</option>
                              {categories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </Select>
                          </TableCell>

                          <TableCell>
                            <Select
                              name="type"
                              value={row.type}
                              onChange={(e) => handleRowChange(index, e)}
                              disabled={row.confirmed || !row.category}
                              aria-label={"Pack type for item " + (index + 1)}
                              className="h-control-sm"
                            >
                              <option value="">
                                {row.category ? "Select" : "Category first"}
                              </option>
                              {typeOptions.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </Select>
                          </TableCell>

                          <TableCell>
                            <Select
                              name="item"
                              value={row.item}
                              onChange={(e) => handleRowChange(index, e)}
                              disabled={row.confirmed || !row.category}
                              aria-label={"Item " + (index + 1)}
                              className="h-control-sm"
                              required
                            >
                              <option value="">
                                {row.category ? "Select" : "Category first"}
                              </option>
                              {itemOptions.map((product) => (
                                <option
                                  key={
                                    (product.item_code || product.item_name) +
                                    "-" +
                                    (product.category || "")
                                  }
                                  value={product.item_name}
                                >
                                  {product.item_name}
                                  {product.item_code ? " · " + product.item_code : ""}
                                </option>
                              ))}
                            </Select>
                          </TableCell>

                          <TableCell className="text-right tabular-nums text-subtle">
                            {row.pcs ? Number(row.pcs).toFixed(1) : "—"}
                          </TableCell>

                          <TableCell>
                            <Input
                              type="number"
                              name="boxes"
                              value={row.boxes}
                              onChange={(e) => handleRowChange(index, e)}
                              disabled={row.confirmed}
                              aria-label={"Boxes for item " + (index + 1)}
                              className="h-control-sm text-right tabular-nums"
                            />
                          </TableCell>

                          <TableCell>
                            <Input
                              type="number"
                              name="qty"
                              value={row.qty}
                              onChange={(e) => handleRowChange(index, e)}
                              disabled={row.confirmed}
                              aria-label={"Quantity for item " + (index + 1)}
                              className="h-control-sm text-right tabular-nums"
                              required
                            />
                          </TableCell>

                          <TableCell className="text-right tabular-nums text-subtle">
                            {row.ltrs || "—"}
                          </TableCell>

                          <TableCell className="text-right tabular-nums text-subtle">
                            {row.priceListBasic || "—"}
                          </TableCell>

                          <TableCell className="text-right tabular-nums text-subtle">
                            {row.tax ? Number(row.tax).toFixed(2) : "—"}
                          </TableCell>

                          <TableCell className="text-right font-semibold tabular-nums text-ink">
                            {row.amount || "—"}
                          </TableCell>

                          <TableCell>
                            <span className="flex items-center justify-end gap-1">
                              {row.confirmed ? (
                                <>
                                  <Badge tone="ok">Confirmed</Badge>
                                  <Button size="xs" onClick={() => handleEditRow(index)}>
                                    Edit
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="xs"
                                  variant="success"
                                  onClick={() => handleConfirmRow(index)}
                                  disabled={!rowValid}
                                  title={
                                    rowValid
                                      ? undefined
                                      : "Choose a category, type and item, and enter a quantity."
                                  }
                                >
                                  Confirm
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteRow(index)}
                                aria-label={"Delete item " + (index + 1)}
                                title="Delete item"
                              >
                                <HiOutlineTrash />
                              </Button>
                            </span>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="border-t border-line px-4 py-3">
              <Button
                onClick={handleAddRow}
                disabled={!canAddMoreItems}
                title={canAddMoreItems ? undefined : "Confirm the current item first."}
              >
                <HiOutlinePlus aria-hidden="true" />
                Add item
              </Button>
            </div>
          </Card>
        </section>

        <StatRow>
          <Stat label="Total" value={"₹" + money(totalAmount)} />
          <Stat label="Tax" value={"₹" + money(taxAmount)} />
          <Stat label="Grand total" value={"₹" + money(grandTotal)} tone="brand" />
        </StatRow>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" onClick={handleClear} disabled={isSaving}>
            Clear
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSaving || !canSave}
            // Says which of the four things is missing, rather than an alert
            // after the press naming only the first.
            title={canSave ? undefined : "First " + blockers.join(", ") + "."}
          >
            {isSaving ? "Saving…" : "Save staff order"}
          </Button>
        </div>
      </form>

      <Dialog
        open={showSuccess}
        onOpenChange={(next) => {
          if (!next) setShowSuccess(false);
        }}
      >
        {showSuccess && (
          <DialogContent title="Staff order saved" size="sm">
            <DialogHeader>
              <DialogTitle>Staff order prepared</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <DetailFields
                items={[
                  ["Employee", employeeName || "—"],
                  ["Dispatch from", dispatchName || "—"],
                  ["Order no.", savedOrderNumber || "—"],
                  ["Status", <Badge key="s" tone="ok">Saved</Badge>],
                ]}
              />
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => setShowSuccess(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
