import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { ordersService, type MartOrderPayload } from "../../services/ordersService";
import type { Order } from "../../services/ordersService";
import { showToast } from "@/lib/toastStore";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/dropdown";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Card, Notice, Page, PageHeader } from "@/components/ui/page";
import { PageLoader } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { HiOutlinePlus, HiOutlineXMark } from "react-icons/hi2";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { messageFrom } from "@/lib/apiError";

/**
 * Mart Approval — Edit Order.
 *
 * The Mart counterpart of Add Sales' edit mode, deliberately SEPARATE from it:
 * a distributor (company 3 / Mart) order never enters the billing / auditor /
 * rate-approval flow, so it needs neither the wizard nor the legacy form's
 * machinery. This is the distributor place-order form (see `Distributor/`),
 * turned into an editor: it loads an existing order, prefills every line, and
 * lets the Mart Approver change ANY field — products, quantities, the basic
 * rate per line, the dispatch warehouse, the bill-to / ship-to addresses, the
 * delivery date and the PO number — then re-saves it through the same
 * `/orders/create/` endpoint (with `order_id`), keeping it in the Mart flow.
 *
 * Reached with `location.state = { editOrderId, returnTo }` from the Mart
 * Approval queue and the distributor order tracker's SAP-failed action.
 */

const COMPANY_MART = 3;
const CATEGORY = "MART";
const WAREHOUSE_OPTIONS = ["DL-MP", "GP-FGM"];

// Today, YYYY-MM-DD — the order date is stamped as today and shown read-only.
const TODAY = new Date().toISOString().slice(0, 10);

/** Company code → display name. Distributor orders are always Mart (3). */
const companyName = (company: string | number | undefined): string => {
  switch (String(company ?? "").trim()) {
    case "1":
      return "Oil";
    case "2":
      return "Beverage";
    case "3":
      return "Mart";
    default:
      return String(company ?? "-");
  }
};

type BranchOption = { bpl_id: string | number; bpl_name?: string | null };

type PartyProductRow = {
  item_code?: string;
  item_name?: string;
  category?: string;
  basic_rate?: number | string;
  brand?: string;
  variety?: string;
  sub_group?: string;
  sal_factor2?: number | string;
  sal_pack_unit?: number | string;
  tax_rate?: number | string;
};

type PartyProduct = {
  item_code: string;
  item_name: string;
  category: string;
  basic_rate: number;
  brand: string;
  variety: string;
  sub_group: string;
  sal_factor2: number;
  sal_pack_unit: number;
  tax_rate: number;
};

type PartyAddress = {
  id: number;
  full_address: string;
  address_name?: string | null;
  gst_number?: string | null;
};

type Row = {
  id: number;
  item_code: string;
  // Boxes and Qty are kept in sync via the product's sal_factor2, exactly like
  // the place-order page. The basic rate is NOT stored on the row — it is read
  // straight from the selected product, so it always matches the product.
  boxes: number;
  qty: number;
  error?: string;
};

const NO_PRODUCTS: PartyProduct[] = [];

// TYPE column = pack size parsed from the item name (e.g. "1 LTR"), mirroring
// the place-order page so an edited order stays identical to how it was placed.
const getProductType = (itemName: string) => {
  const m = (itemName || "").match(/(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : "Others";
};

const inr = (n: number, decimals = 2) =>
  n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/** A labelled, read-only value styled like a disabled input. */
function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-[12.5px] font-bold text-ink">{label}</label>
      <div className="flex h-control items-center truncate rounded-md border border-line bg-surface px-3 text-[13px] text-ink">
        {value || "—"}
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-subtle">
        {label}
      </p>
      <p
        className={cn(
          "m-0 mt-1 truncate text-lg font-bold tabular-nums",
          highlight ? "text-brand" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export default function Distributor_Edit_Order() {
  const navigate = useNavigate();
  const location = useLocation();
  const editOrderId: number | undefined = location.state?.editOrderId;
  const returnTo: string = location.state?.returnTo || "/Mart_Approval";

  // ── Bootstrap: order + its party's MART products + MART addresses ──────────
  const bootstrap = useQuery({
    queryKey: ["mart-edit", "bootstrap", editOrderId],
    enabled: Boolean(editOrderId),
    staleTime: 0,
    queryFn: async () => {
      const order = await ordersService.getOrderDetails(editOrderId as number);
      const cardCode = order.card_code;

      const prodList = await ordersService.getPartyProduct(cardCode);
      const martProducts: PartyProduct[] = (Array.isArray(prodList) ? prodList : [])
        .filter((p: PartyProductRow) => (p.category || "").toUpperCase() === CATEGORY)
        .map((p: PartyProductRow) => ({
          item_code: p.item_code ?? "",
          item_name: p.item_name ?? "",
          category: p.category ?? "",
          basic_rate: Number(p.basic_rate) || 0,
          brand: p.brand || "",
          variety: p.variety || p.sub_group || "",
          sub_group: p.sub_group || p.variety || "",
          sal_factor2: Number(p.sal_factor2) || 0,
          sal_pack_unit: Number(p.sal_pack_unit) || 0,
          tax_rate: Number(p.tax_rate) || 0,
        }));

      let billAddresses: PartyAddress[] = [];
      let shipAddresses: PartyAddress[] = [];
      try {
        const addr = await ordersService.getPartyAdd(cardCode, CATEGORY);
        billAddresses = Array.isArray(addr?.bill_to) ? addr.bill_to : [];
        shipAddresses = Array.isArray(addr?.ship_to) ? addr.ship_to : [];
      } catch {
        /* addresses re-validated at submit */
      }

      let branches: BranchOption[] = [];
      try {
        const data = await ordersService.getBranches();
        branches = Array.isArray(data) ? data : [];
      } catch {
        /* dispatch dropdown falls back to the order's own value */
      }

      return { order, martProducts, billAddresses, shipAddresses, branches };
    },
  });

  const order: Order | null = bootstrap.data?.order ?? null;
  const martProducts = bootstrap.data?.martProducts ?? NO_PRODUCTS;
  const billAddresses = bootstrap.data?.billAddresses ?? [];
  const shipAddresses = bootstrap.data?.shipAddresses ?? [];
  const branches = bootstrap.data?.branches ?? [];
  const loading = Boolean(editOrderId) && bootstrap.isPending;

  const error = !editOrderId
    ? "No order was selected to edit. Open an order from the Mart Approval queue."
    : bootstrap.isError
      ? "Failed to load the order. Please go back and try again."
      : "";

  // Products by code — the party's MART list, PLUS any product already on the
  // order that is no longer assigned, so an existing line still renders and
  // computes rather than silently vanishing.
  const productByCode = useMemo(() => {
    const map = new Map<string, PartyProduct>();
    for (const p of martProducts) map.set(p.item_code, p);
    for (const it of order?.items ?? []) {
      if (!map.has(it.item_code)) {
        map.set(it.item_code, {
          item_code: it.item_code,
          item_name: it.item_name,
          category: it.category || CATEGORY,
          basic_rate: Number(it.basic_price) || 0,
          brand: it.brand || "",
          variety: it.variety || it.sub_group || "",
          sub_group: it.sub_group || it.variety || "",
          sal_factor2: Number(it.pcs) || 0,
          sal_pack_unit: 0,
          tax_rate: Number(it.tax_rate) || 0,
        });
      }
    }
    return map;
  }, [martProducts, order]);

  const productOptions = useMemo(
    () =>
      Array.from(productByCode.values())
        .sort((a, b) => a.item_name.localeCompare(b.item_name))
        .map((p) => ({ value: p.item_code, label: `${p.item_name} (${p.item_code})` })),
    [productByCode],
  );

  // ── Editable state, seeded from the loaded order exactly once ─────────────
  const nextId = useRef(1);
  const makeRow = (): Row => ({
    id: nextId.current++,
    item_code: "",
    boxes: 0,
    qty: 0,
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [billToId, setBillToId] = useState<string>("");
  const [shipToId, setShipToId] = useState<string>("");
  const [warehouse, setWarehouse] = useState<string>("GP-FGM");
  const [dispatchId, setDispatchId] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [poNumber, setPoNumber] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !order) return;
    seeded.current = true;

    const items = order.items ?? [];
    setRows(
      items.length
        ? items.map((it) => ({
            id: nextId.current++,
            item_code: it.item_code,
            boxes: Number(it.boxes) || 0,
            qty: Number(it.qty) || 0,
          }))
        : [makeRow()],
    );
    setBillToId(order.bill_to_id != null ? String(order.bill_to_id) : "");
    setShipToId(order.ship_to_id != null ? String(order.ship_to_id) : "");
    setWarehouse((order.warehouse_code || "").trim() || "GP-FGM");
    setDispatchId(order.dispatch_from_id != null ? String(order.dispatch_from_id) : "");
    setDeliveryDate(order.delivery_date || TODAY);
    setPoNumber(order.po_number || "");
    setComment(order.remarks || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  // Resolve the address pick once the list loads: keep the current choice if it
  // is valid, otherwise fall back to the address the order was SAVED with, and
  // only then to the first in the list. A functional updater is used (rather
  // than reading `billToId` from the closure) because this effect and the
  // `[order]` init effect above run in the SAME commit — a stale `billToId`
  // closure here would clobber the just-restored saved id with the first
  // address, which is exactly the "shows the first address, not the one the
  // distributor selected" bug on the Mart edit screen.
  const resolveAddressId = (
    list: PartyAddress[],
    current: string,
    savedId: number | null | undefined,
  ) => {
    if (!list.length) return current;
    if (list.some((a) => String(a.id) === current)) return current;
    const saved = savedId != null ? String(savedId) : "";
    if (list.some((a) => String(a.id) === saved)) return saved;
    return String(list[0].id);
  };
  useEffect(() => {
    setBillToId((cur) => resolveAddressId(billAddresses, cur, order?.bill_to_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billAddresses, order]);
  useEffect(() => {
    setShipToId((cur) => resolveAddressId(shipAddresses, cur, order?.ship_to_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipAddresses, order]);

  const billTo = billAddresses.find((a) => String(a.id) === billToId) ?? null;
  const shipTo = shipAddresses.find((a) => String(a.id) === shipToId) ?? null;

  const addressOptions = (list: PartyAddress[]) =>
    list.map((a) => ({
      value: String(a.id),
      label: a.address_name || a.full_address,
      hint: a.address_name ? a.full_address : undefined,
    }));
  const billToOptions = useMemo(() => addressOptions(billAddresses), [billAddresses]);
  const shipToOptions = useMemo(() => addressOptions(shipAddresses), [shipAddresses]);

  // ── Row mutations ─────────────────────────────────────────────────────────
  const addRow = () => setRows((prev) => [...prev, makeRow()]);

  const removeRow = (id: number) =>
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [makeRow()];
    });

  const factorFor = (item_code: string) =>
    Number(productByCode.get(item_code)?.sal_factor2) || 1;

  const setProduct = (id: number, item_code: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (!item_code) return { ...r, item_code: "", error: undefined };
        // Basic Rate and PCS are read straight from the product, so switching
        // the product re-syncs both; only qty is recomputed from boxes here.
        const factor = factorFor(item_code);
        return { ...r, item_code, qty: r.boxes * factor, error: undefined };
      }),
    );

  const setBoxes = (id: number, raw: string) => {
    const boxes = Math.max(0, Number(raw) || 0);
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, boxes, qty: boxes * factorFor(r.item_code), error: undefined }
          : r,
      ),
    );
  };

  const setQty = (id: number, raw: string) => {
    const qty = Math.max(0, Number(raw) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const factor = factorFor(r.item_code);
        return { ...r, qty, boxes: factor ? qty / factor : qty, error: undefined };
      }),
    );
  };

  const deriveRow = (row: Row) => {
    const product = productByCode.get(row.item_code);
    // Basic Rate and PCS come from the product, so they always reflect the
    // currently selected item.
    const rate = Number(product?.basic_rate) || 0;
    const pcs = Number(product?.sal_factor2) || 0;
    const pack = Number(product?.sal_pack_unit) || 0;
    const boxes = row.boxes || 0;
    const qty = row.qty || 0;
    const ltrs = pack * qty;
    const amount = rate * qty;
    return { product, rate, pcs, pack, boxes, qty, ltrs, amount };
  };

  // ── Totals ────────────────────────────────────────────────────────────────
  const completedRows = rows.filter((r) => r.item_code && r.qty > 0);
  const totalProducts = completedRows.length;
  const totalBoxes = completedRows.reduce((s, r) => s + (r.boxes || 0), 0);
  const totalQty = completedRows.reduce((s, r) => s + deriveRow(r).qty, 0);
  const totalLtrs = completedRows.reduce((s, r) => s + deriveRow(r).ltrs, 0);
  const totalAmount = completedRows.reduce((s, r) => s + deriveRow(r).amount, 0);
  const totalTax = completedRows.reduce((s, r) => {
    const { amount, product } = deriveRow(r);
    return s + amount * ((Number(product?.tax_rate) || 0) / 100);
  }, 0);
  const grandTotal = totalAmount + totalTax;

  // ── Submit ────────────────────────────────────────────────────────────────
  const onSubmit = async () => {
    if (!order) return;
    if (!billTo || !shipTo) {
      showToast({
        title: "Cannot save",
        message: "Pick a bill-to and a ship-to address before saving.",
      });
      return;
    }

    const missingQty = rows.filter((r) => r.item_code && r.qty <= 0);
    if (missingQty.length) {
      const ids = new Set(missingQty.map((r) => r.id));
      setRows((prev) =>
        prev.map((r) =>
          ids.has(r.id) ? { ...r, error: "Enter a quantity for this product." } : r,
        ),
      );
      showToast({
        title: "Quantity required",
        message: "Enter a quantity for every product you have selected.",
      });
      return;
    }
    if (!completedRows.length) {
      showToast({
        title: "Nothing to save",
        message: "Add at least one product with a quantity.",
      });
      return;
    }

    const dispatch = branches.find((b) => String(b.bpl_id) === dispatchId);
    const payload: MartOrderPayload = {
      order_id: order.id,
      order_type: "DISTRIBUTOR",
      card_code: order.card_code,
      card_name: order.card_name,
      bill_to_id: billTo.id,
      bill_to_address: billTo.full_address,
      ship_to_id: shipTo.id,
      ship_to_address: shipTo.full_address,
      delivery_date: deliveryDate || TODAY,
      po_number: poNumber || "",
      company: COMPANY_MART,
      warehouse_code: warehouse || "GP-FGM",
      ...(dispatch
        ? {
            dispatch_from_id: Number(dispatch.bpl_id),
            dispatch_from_name: dispatch.bpl_name || "",
          }
        : {}),
      remarks: comment,
      total_amount: totalAmount,
      items: completedRows.map((r) => {
        const { product: p, rate, pcs, boxes, qty, ltrs, amount } = deriveRow(r);
        return {
          item_code: r.item_code,
          item_name: p?.item_name || r.item_code,
          category: CATEGORY,
          brand: p?.brand || "",
          variety: p?.variety || "",
          sub_group: p?.sub_group || "",
          item_type: getProductType(p?.item_name || ""),
          pcs,
          boxes,
          qty,
          ltrs,
          price_list_basic: rate,
          basic_price: rate,
          tax_rate: p?.tax_rate || 0,
          total: amount,
          total_ltrs: ltrs,
        };
      }),
    };

    setSubmitting(true);
    try {
      await ordersService.createMartOrder(payload);
      showToast({
        tone: "success",
        title: "Order updated",
        message: `Order ${order.order_number} has been updated.`,
        orderNumber: order.order_number,
      });
      navigate(returnTo);
    } catch (e) {
      showToast({
        title: "Could not update the order",
        message: messageFrom(e, "Failed to update the order. Please try again."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page>
      <Breadcrumbs
        items={[
          { label: "Mart Approval", onClick: () => navigate(returnTo) },
          { label: "Edit order" },
        ]}
      />

      <PageHeader title={order ? order.order_number : "Edit order"} />

      {error ? (
        <Notice tone="bad" title="Could not open the order">
          {error}
        </Notice>
      ) : null}

      {loading ? (
        <Card>
          <PageLoader label="Loading the order…" />
        </Card>
      ) : !error && order ? (
        <>
          {/* Order header, row by row:
              1) Party name (full width)
              2) Bill to / Ship to
              3) Date (read-only) / Delivery date / Dispatch from
              4) Warehouse / Company (read-only) / PO number */}
          <Card className="overflow-visible p-4">
            {/* Row 1 — party name, full width */}
            <ReadonlyField
              label="Party Name"
              value={`${order.card_name} (${order.card_code})`}
            />

            {/* Row 2 — bill to / ship to */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label
                  htmlFor="edit-bill-to"
                  className="mb-1 block text-[12.5px] font-bold text-ink"
                >
                  Bill to
                </label>
                <SearchSelect
                  id="edit-bill-to"
                  value={billToId}
                  options={billToOptions}
                  onChange={(v) => setBillToId(String(v))}
                  disabled={billAddresses.length === 0}
                  placeholder={
                    billAddresses.length === 0 ? "No bill-to address" : "Select bill-to address"
                  }
                  searchPlaceholder="Search address…"
                  emptyText="No address matches"
                  multiline
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="edit-ship-to"
                  className="mb-1 block text-[12.5px] font-bold text-ink"
                >
                  Ship to
                </label>
                <SearchSelect
                  id="edit-ship-to"
                  value={shipToId}
                  options={shipToOptions}
                  onChange={(v) => setShipToId(String(v))}
                  disabled={shipAddresses.length === 0}
                  placeholder={
                    shipAddresses.length === 0 ? "No ship-to address" : "Select ship-to address"
                  }
                  searchPlaceholder="Search address…"
                  emptyText="No address matches"
                  multiline
                />
              </div>
            </div>

            {/* Row 3 — date (read-only) / delivery date / dispatch from */}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <ReadonlyField label="Date" value={TODAY} />
              <div className="min-w-0">
                <label
                  htmlFor="edit-delivery"
                  className="mb-1 block text-[12.5px] font-bold text-ink"
                >
                  Delivery date
                </label>
                <Input
                  id="edit-delivery"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="edit-dispatch"
                  className="mb-1 block text-[12.5px] font-bold text-ink"
                >
                  Dispatch From
                </label>
                <Select
                  id="edit-dispatch"
                  value={dispatchId}
                  onChange={(e) => setDispatchId(e.target.value)}
                >
                  <option value="">Select dispatch…</option>
                  {branches.map((b) => (
                    <option key={b.bpl_id} value={String(b.bpl_id)}>
                      {b.bpl_name || b.bpl_id}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Row 4 — warehouse / company (read-only) / PO number */}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="min-w-0">
                <label
                  htmlFor="edit-warehouse"
                  className="mb-1 block text-[12.5px] font-bold text-ink"
                >
                  Warehouse
                </label>
                <Select
                  id="edit-warehouse"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                >
                  {WAREHOUSE_OPTIONS.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </div>
              <ReadonlyField label="Company" value={companyName(order.company)} />
              <div className="min-w-0">
                <label
                  htmlFor="edit-po"
                  className="mb-1 block text-[12.5px] font-bold text-ink"
                >
                  PO number
                </label>
                <Input
                  id="edit-po"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          </Card>

          {/* Editable line items. */}
          <Card className="overflow-hidden p-0">
            <Table density="compact" containerClassName="max-h-[26rem] overflow-y-auto">
              <TableHeader className="sticky top-0 z-[1]">
                <TableRow className="bg-surface hover:bg-surface [&>th]:bg-surface [&_th]:font-bold [&_th]:text-ink">
                  <TableHead className="min-w-[260px]">Product</TableHead>
                  <TableHead className="text-right">Basic Rate</TableHead>
                  <TableHead className="text-right">PCS</TableHead>
                  <TableHead className="text-right">Tax %</TableHead>
                  <TableHead className="min-w-[96px]">Boxes</TableHead>
                  <TableHead className="min-w-[96px]">Qty</TableHead>
                  <TableHead className="text-right">Ltrs</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const { rate, pcs, ltrs, amount, product } = deriveRow(row);
                  const hasItem = Boolean(row.item_code);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="min-w-[260px] align-top">
                        <SearchSelect
                          id={"product-" + row.id}
                          value={row.item_code}
                          options={productOptions}
                          onChange={(code) => setProduct(row.id, String(code))}
                          disabled={productOptions.length === 0}
                          placeholder="Search product…"
                          searchPlaceholder="Product name or code…"
                          emptyText="No product matches"
                          maxShown={60}
                          portal
                          textClassName="text-[12.5px]"
                        />
                        {row.error ? (
                          <p className="mt-1 text-[11.5px] leading-snug text-danger">
                            {row.error}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasItem ? rate.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasItem ? pcs : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasItem ? `${Number(product?.tax_rate) || 0}%` : "—"}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={row.boxes || ""}
                          onChange={(e) => setBoxes(row.id, e.target.value)}
                          placeholder="0"
                          aria-label="Boxes"
                          disabled={!hasItem}
                          className="h-control-sm min-w-[80px] text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={row.qty || ""}
                          onChange={(e) => setQty(row.id, e.target.value)}
                          placeholder="0"
                          aria-label="Qty"
                          disabled={!hasItem}
                          className="h-control-sm min-w-[80px] text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasItem ? ltrs.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-ink">
                        {hasItem ? amount.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(row.id)}
                          aria-label="Remove row"
                          title="Remove row"
                          className="bg-transparent text-red-600 hover:bg-red-50 hover:text-red-700 [&_svg]:[stroke-width:2.5]"
                        >
                          <HiOutlineXMark aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex justify-end border-t border-line p-2">
              <Button
                variant="success"
                size="sm"
                onClick={addRow}
                disabled={productOptions.length === 0}
                className="border-transparent bg-green-600 text-white hover:bg-green-700 hover:text-white"
              >
                <HiOutlinePlus aria-hidden="true" /> Add row
              </Button>
            </div>
          </Card>

          {/* Comment on the left, order totals on the right. */}
          <Card className="p-4">
            <div className="grid gap-6 lg:grid-cols-5 lg:gap-16">
              <div className="min-w-0 lg:col-span-2">
                <label
                  htmlFor="edit-comment"
                  className="mb-1 block text-[12.5px] font-bold text-ink"
                >
                  Comment
                </label>
                <Textarea
                  id="edit-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={6}
                  placeholder="Add a note for this order (optional)"
                />
              </div>

              <div className="grid w-fit grid-cols-2 gap-x-8 gap-y-4 self-start sm:grid-cols-3 lg:col-span-3 lg:ml-auto">
                <SummaryItem label="Total QTY" value={inr(totalQty, 0)} />
                <SummaryItem label="Total Boxes" value={inr(totalBoxes, 0)} />
                <SummaryItem label="Total Ltrs" value={inr(totalLtrs)} />
                <SummaryItem label="Total Amount" value={`₹${inr(totalAmount)}`} />
                <SummaryItem
                  label="Grand Total (incl. tax)"
                  value={`₹${inr(grandTotal)}`}
                  highlight
                />
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate(returnTo)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={onSubmit}
              disabled={totalProducts === 0 || submitting}
              className="px-8"
            >
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </>
      ) : null}
    </Page>
  );
}
