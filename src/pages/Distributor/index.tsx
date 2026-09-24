import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { userService } from "../../services/userService";
import { ordersService, type MartOrderPayload } from "../../services/ordersService";
import { showToast } from "@/lib/toastStore";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/form";
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
import { useAuth } from "@/auth";

const COMPANY_MART = 3; // company 3 = Mart, stamped on every distributor order
/** A `/orders/party-products/` row as it arrives — untyped by the service, and
 *  read here field by field to build a `PartyProduct`. Only the fields this
 *  file reads are declared. */
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
  updated_at?: string | null;
};

const DEFAULT_WAREHOUSE_CODE = "GP-FGM"; // distributor orders default to GP-FGM

type PartyAddress = {
  id: number;
  full_address: string;
  address_name?: string | null;
  gst_number?: string | null;
};

/**
 * Distributor — an editable line-item table scoped to the logged-in
 * distributor's assigned party, and (on THIS page only) further scoped to the
 * MART category.
 *
 * Flow on open:
 *   1. Resolve the current user's assigned party via
 *      `userService.getUserParties(user_id)` (the first assigned party).
 *   2. Load that party's assigned products via
 *      `userService.getPartyProducts(card_code)` — which carries each product's
 *      `basic_rate` — and keep ONLY the MART-category ones.
 *   3. There is no category picker: each row is a Product (searchable dropdown)
 *      → Basic Rate (auto) → Qty → Cancel, drawn straight from the MART list.
 *
 * "Add" appends a new row. "Submit" gathers the completed rows (frontend only —
 * nothing is saved yet).
 */
const CATEGORY = "MART"; // this page only ever deals with the MART category

/** Stable empty, so `productOptions` does not re-sort on every render. */
const NO_PRODUCTS: PartyProduct[] = [];

// TYPE column in Add Sales is the pack size parsed from the item name (e.g.
// "1 LTR"), NOT the SAP U_TYPE. Mirror Add_Sales.getProductType exactly so a
// distributor order edits/opens identically to a billing order.
const getProductType = (itemName: string) => {
  const m = (itemName || "").match(/(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : "Others";
};

// Indian grouping (e.g. 12,34,567.00) for the footer totals.
const inr = (n: number, decimals = 2) =>
  n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

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
  // When this party-product assignment was last updated (ISO string). Used to
  // block ordering products not refreshed in the current month.
  updated_at: string | null;
};

type Row = {
  id: number;
  item_code: string;
  // Boxes and Qty are BOTH editable and kept in sync: editing one recomputes
  // the other via the product's sal_factor2 (qty = boxes * factor). Ltrs /
  // amount derive from qty, matching Add Sales.
  boxes: number;
  qty: number;
  // Per-row validation message (e.g. stale product blocked from ordering).
  error?: string;
};

// True when an ISO datetime falls in the current calendar month/year. A product
// whose party-product assignment wasn't updated this month cannot be ordered.
const isCurrentMonth = (iso: string | null | undefined): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  );
};

/** One labelled figure in the totals strip below the table. */
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

function Distributor() {
  /*
   * The whole bootstrap is ONE query, not three chained ones.
   *
   * Party -> that party's MART products -> that party's MART addresses is a
   * strict chain, and the page's own gates are composed from all of it:
   * `noProducts` is `!loading && !error && martProducts.length === 0`, and the
   * product picker's placeholder and disabled state read the same flags. Split
   * into three `enabled`-gated queries, the two downstream ones report
   * `isPending: true` FOREVER while disabled, so a distributor with no party
   * assigned would sit on "Loading…" instead of being told what is wrong.
   *
   * `userId` is read during render rather than in an effect — the old code did
   * `if (!userId) { setError(...); setLoading(false); return; }` inside the
   * fetch effect, which is a setState-in-effect the moment the fetch leaves.
   */
  // From the session, not from `localStorage` directly. `Number(undefined)` is
  // NaN where `Number(null)` was 0, so the `?? ""` keeps the falsy check below
  // ("no user, no bootstrap") behaving exactly as it did.
  const { session } = useAuth();
  const userId = Number(session?.userId ?? "");

  // "Duplicate order" — opened from View Orders with the source order's id in
  // navigation state. The order is fetched and its lines / addresses prefill
  // this fresh order; nothing is saved against the original.
  const location = useLocation();
  const duplicateOrderId: number | undefined = location.state?.duplicateOrderId;

  const bootstrap = useQuery({
    queryKey: ["distributor", "bootstrap", userId],
    enabled: Boolean(userId),
    // The party-product assignment carries a month gate (`isCurrentMonth`
    // below) that decides whether an order may be placed at all, so this must
    // not be served from a long-lived cache across a month boundary.
    staleTime: 0,
    queryFn: async () => {
      const partiesRes = await userService.getUserParties(userId);
      const parties = partiesRes?.data?.parties ?? [];
      // "Every distributor is assigned one party" — take the first.
      const assigned = parties[0];
      if (!assigned)
        return {
          party: null,
          martProducts: NO_PRODUCTS,
          billAddresses: [] as PartyAddress[],
          shipAddresses: [] as PartyAddress[],
        };

      // The RICHER orders endpoint — the same one Add Sales uses — so we get
      // sal_factor2 / sal_pack_unit / tax_rate / brand / variety needed to
      // compute the line exactly like a billing order.
      const prodList = await ordersService.getPartyProduct(assigned.card_code);
      const martProducts: PartyProduct[] = (Array.isArray(prodList) ? prodList : [])
        .filter((p: PartyProductRow) => (p.category || "").toUpperCase() === CATEGORY)
        .map((p: PartyProductRow) => ({
          // `?? ""` because the row type says these can be absent. They never
          // are in practice; the coercion is what keeps that assumption from
          // being made silently, as it was while this was `any`.
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
          updated_at: p.updated_at ?? null,
        }));

      // Scope addresses to MART so a party that also has addresses in other
      // categories cannot surface a non-MART (wrong) one here. A failure is
      // tolerated: addresses are re-validated at submit time. The FULL lists
      // are returned (not just the first of each) so the distributor can pick
      // the bill-to / ship-to when the party has more than one.
      let billAddresses: PartyAddress[] = [];
      let shipAddresses: PartyAddress[] = [];
      try {
        const addr = await ordersService.getPartyAdd(assigned.card_code, CATEGORY);
        billAddresses = Array.isArray(addr?.bill_to) ? addr.bill_to : [];
        shipAddresses = Array.isArray(addr?.ship_to) ? addr.ship_to : [];
      } catch {
        /* ignore */
      }

      return {
        party: { card_code: assigned.card_code, card_name: assigned.card_name },
        martProducts,
        billAddresses,
        shipAddresses,
      };
    },
  });

  const party = bootstrap.data?.party ?? null;
  const martProducts = bootstrap.data?.martProducts ?? NO_PRODUCTS;
  const billAddresses = bootstrap.data?.billAddresses ?? [];
  const shipAddresses = bootstrap.data?.shipAddresses ?? [];
  const loading = Boolean(userId) && bootstrap.isPending;

  const error = !userId
    ? "Could not identify the logged-in user. Please log in again."
    : bootstrap.isError
      ? "Failed to load your assigned party / products. Please try again."
      : bootstrap.isSuccess && !party
        ? "No party is assigned to your account. Please contact an administrator."
        : "";

  // Monotonic id so React keys stay stable as rows are added/removed.
  const nextId = useRef(1);
  const makeRow = (): Row => ({
    id: nextId.current++,
    item_code: "",
    boxes: 0,
    qty: 0,
  });

  // Bill-to (B) and ship-to (S) address the distributor picks. Defaults to the
  // first of each once the lists load (see the effect below); the party usually
  // has one of each, so the picker is a confirmation more than a choice.
  const [billToId, setBillToId] = useState<string>("");
  const [shipToId, setShipToId] = useState<string>("");

  // Default the selection to the first address, and re-default if the current
  // pick is no longer in the list (e.g. after the party's addresses reload).
  useEffect(() => {
    if (billAddresses.length && !billAddresses.some((a) => String(a.id) === billToId)) {
      setBillToId(String(billAddresses[0].id));
    }
  }, [billAddresses, billToId]);
  useEffect(() => {
    if (shipAddresses.length && !shipAddresses.some((a) => String(a.id) === shipToId)) {
      setShipToId(String(shipAddresses[0].id));
    }
  }, [shipAddresses, shipToId]);

  const billTo = billAddresses.find((a) => String(a.id) === billToId) ?? null;
  const shipTo = shipAddresses.find((a) => String(a.id) === shipToId) ?? null;

  // Address dropdown options — the address name (falling back to the full
  // address) as the label, with the full address as a searchable second line.
  const addressOptions = (list: PartyAddress[]) =>
    list.map((a) => ({
      value: String(a.id),
      label: a.address_name || a.full_address,
      hint: a.address_name ? a.full_address : undefined,
    }));
  const billToOptions = useMemo(() => addressOptions(billAddresses), [billAddresses]);
  const shipToOptions = useMemo(() => addressOptions(shipAddresses), [shipAddresses]);

  const [rows, setRows] = useState<Row[]>([makeRow()]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch the order being duplicated (its full line items live on the detail
  // endpoint, not the list). Only runs when arriving via "Duplicate".
  const dupQuery = useQuery({
    queryKey: ["distributor", "duplicate", duplicateOrderId],
    enabled: Boolean(duplicateOrderId),
    staleTime: 0,
    queryFn: () => ordersService.getOrderDetails(duplicateOrderId as number),
  });

  // Seed the form from the duplicated order ONCE, after both it and the party's
  // products have loaded (the rows need the product list to compute qty/boxes).
  const seededFromDuplicate = useRef(false);
  useEffect(() => {
    if (seededFromDuplicate.current) return;
    const src = dupQuery.data;
    if (!src || martProducts.length === 0) return;
    seededFromDuplicate.current = true;

    const items = src.items ?? [];
    if (items.length) {
      setRows(
        items.map((it) => ({
          id: nextId.current++,
          item_code: it.item_code,
          boxes: Number(it.boxes) || 0,
          qty: Number(it.qty) || 0,
        })),
      );
    }
    // Prefill the addresses if the source order's picks exist for this party.
    if (src.bill_to_id != null) setBillToId(String(src.bill_to_id));
    if (src.ship_to_id != null) setShipToId(String(src.ship_to_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupQuery.data, martProducts]);

  // Product dropdown options (MART products), sorted by name. The item code is
  // appended in brackets — `Item name (ITEMCODE)` — so it shows on screen AND
  // is matched by the SearchSelect's search (which looks at the label), letting
  // the distributor find a product by either its name or its code.
  const productOptions = useMemo(
    () =>
      [...martProducts]
        .sort((a, b) => a.item_name.localeCompare(b.item_name))
        .map((p) => ({
          value: p.item_code,
          label: `${p.item_name} (${p.item_code})`,
        })),
    [martProducts],
  );

  // --- row mutations --------------------------------------------------------
  const addRow = () => setRows((prev) => [...prev, makeRow()]);

  const removeRow = (id: number) =>
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [makeRow()]; // always keep one row
    });

  const setProduct = (id: number, item_code: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (!item_code) return { ...r, item_code: "", error: undefined };

        // Freshness gate: the product's party-product assignment must have been
        // updated in the current month, otherwise it cannot be ordered.
        const product = martProducts.find((p) => p.item_code === item_code);
        if (product && !isCurrentMonth(product.updated_at)) {
          return {
            ...r,
            item_code: "",
            boxes: 0,
            qty: 0,
            error:
              "This product wasn't updated this month and can't be ordered. Please contact an administrator.",
          };
        }

        // Re-sync qty from any existing box count against the new product.
        const factor = Number(product?.sal_factor2) || 1;
        return { ...r, item_code, qty: r.boxes * factor, error: undefined };
      }),
    );

  const factorFor = (id: number, rows: Row[]) => {
    const row = rows.find((r) => r.id === id);
    const product = martProducts.find((p) => p.item_code === row?.item_code);
    return Number(product?.sal_factor2) || 1;
  };

  // Boxes and Qty stay in sync: qty = boxes * factor. Editing either recomputes
  // the other so the distributor can enter whichever is convenient.
  const setBoxes = (id: number, raw: string) => {
    const boxes = Math.max(0, Number(raw) || 0);
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? // Clear the "enter a quantity" validation once a quantity exists.
            { ...r, boxes, qty: boxes * factorFor(id, prev), error: undefined }
          : r,
      ),
    );
  };

  const setQty = (id: number, raw: string) => {
    const qty = Math.max(0, Number(raw) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const factor = factorFor(id, prev);
        return { ...r, qty, boxes: factor ? qty / factor : qty, error: undefined };
      }),
    );
  };

  // One row's derived figures, computed exactly like Add Sales'
  // `recalculateRowTotals` so a distributor order saves identical numbers to a
  // billing order:
  //   pcs   = sal_factor2 (units per case, shown as-is)
  //   qty   = boxes * sal_factor2   (factor falls back to 1, mirroring Add Sales)
  //   ltrs  = sal_pack_unit * qty
  //   amount = basic_rate * qty     (tax is applied on the order total, not here)
  const deriveRow = (row: Row) => {
    const product = martProducts.find((p) => p.item_code === row.item_code);
    const rate = product?.basic_rate ?? 0;
    const pcs = Number(product?.sal_factor2) || 0;
    const factor = Number(product?.sal_factor2) || 1;
    const pack = Number(product?.sal_pack_unit) || 0;
    // qty is stored on the row (kept in sync with boxes); ltrs / amount follow.
    const boxes = row.boxes || 0;
    const qty = row.qty || 0;
    const ltrs = pack * qty;
    const amount = rate * qty;
    return { product, rate, pcs, factor, pack, boxes, qty, ltrs, amount };
  };

  // --- totals / submit ------------------------------------------------------
  // A line counts once it has a product AND a box count — a zero-box row is not
  // yet an order line.
  const completedRows = rows.filter((r) => r.item_code && r.qty > 0);
  const totalProducts = completedRows.length;
  const totalBoxes = completedRows.reduce((sum, r) => sum + (r.boxes || 0), 0);
  const totalQty = completedRows.reduce((sum, r) => sum + deriveRow(r).qty, 0);
  const totalLtrs = completedRows.reduce((sum, r) => sum + deriveRow(r).ltrs, 0);
  const totalAmount = completedRows.reduce(
    (sum, r) => sum + deriveRow(r).amount,
    0,
  );
  // Total PCS = total pieces ordered (boxes × units-per-case), i.e. totalQty.
  const totalPcs = totalQty;
  // Tax per line = amount × the product's own tax_rate%, summed. Grand total is
  // the pre-tax amount plus that — the figure the order actually bills at.
  const totalTax = completedRows.reduce((sum, r) => {
    const { amount, product } = deriveRow(r);
    return sum + amount * ((Number(product?.tax_rate) || 0) / 100);
  }, 0);
  const grandTotal = totalAmount + totalTax;

  const onSubmit = async () => {
    if (!party) {
      showToast({
        tone: "error",
        title: "Cannot submit",
        message: "No party is assigned to your account.",
      });
      return;
    }
    if (!billTo || !shipTo) {
      showToast({
        tone: "error",
        title: "Cannot submit",
        message:
          "This party has no bill-to / ship-to address configured. Please contact an administrator.",
      });
      return;
    }
    // Validation: a row with a product selected MUST have a quantity. Mark the
    // offending rows and block the submit rather than silently dropping them.
    const missingQty = rows.filter((r) => r.item_code && r.qty <= 0);
    if (missingQty.length) {
      const ids = new Set(missingQty.map((r) => r.id));
      setRows((prev) =>
        prev.map((r) =>
          ids.has(r.id) ? { ...r, error: "Enter a quantity for this product." } : r,
        ),
      );
      showToast({
        tone: "error",
        title: "Quantity required",
        message: "Enter a quantity for every product you have selected.",
      });
      return;
    }

    if (!completedRows.length) {
      showToast({
        tone: "error",
        title: "Nothing to submit",
        message: "Add at least one product with a quantity.",
      });
      return;
    }

    // Build the order payload: DISTRIBUTOR / company 3, today's delivery date,
    // first bill & ship address, MART line items (no scheme). Reuses the
    // standard /orders/create/ endpoint so it saves in the same tables.
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const payload: MartOrderPayload = {
      order_type: "DISTRIBUTOR",
      card_code: party.card_code,
      card_name: party.card_name,
      bill_to_id: billTo.id,
      bill_to_address: billTo.full_address,
      ship_to_id: shipTo.id,
      ship_to_address: shipTo.full_address,
      delivery_date: today,
      po_number: "",
      company: COMPANY_MART,
      // Every distributor order ships from GP-FGM by default. Mart Approval can
      // change it later on the Add Sales edit screen.
      warehouse_code: DEFAULT_WAREHOUSE_CODE,
      total_amount: totalAmount,
      items: completedRows.map((r) => {
        // Boxes-driven derivation, identical to Add Sales (see deriveRow).
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
      const res = await ordersService.createMartOrder(payload);
      const orderNo = res?.order_number ?? null;
      showToast({
        tone: "success",
        title: "Order created successfully",
        message: orderNo
          ? `Order ${orderNo} has been created successfully.`
          : "Your order has been created successfully.",
        orderNumber: orderNo,
      });
      setRows([makeRow()]); // reset the form for the next order
    } catch (e) {
      const detail =
        messageFrom(e, "Failed to submit the order. Please try again.");
      showToast({ tone: "error", title: "Could not submit the order", message: detail });
    } finally {
      setSubmitting(false);
    }
  };

  const noProducts = !loading && !error && martProducts.length === 0;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Distributor" }, { label: "Place an order" }]} />

      <PageHeader
        // The party name + code IS the heading now, at the big title size —
        // the generic "Distributor" title and the "Ordering for…" description
        // were removed as redundant with it.
        title={
          party ? `${party.card_name} (${party.card_code})` : "Distributor"
        }
      />

      {duplicateOrderId && dupQuery.data ? (
        <Notice tone="info" title="Duplicated order">
          Prefilled from {dupQuery.data.order_number}. Review the lines and
          submit — this creates a brand-new order and leaves the original
          unchanged.
        </Notice>
      ) : null}

      {error ? (
        <Notice tone="bad" title="Could not load your products">
          {error}
        </Notice>
      ) : null}

      {noProducts ? (
        <Notice tone="hold" title="Nothing to order">
          No MART products are assigned to your party yet. Ask your account
          manager to assign them before placing an order.
        </Notice>
      ) : null}

      {loading ? (
        <Card>
          <PageLoader label="Loading your products…" />
        </Card>
      ) : !error ? (
        <>
          {/* Bill-to / ship-to pickers. The party usually has one of each, so
              these confirm the address the order posts against; when it has
              several, the distributor chooses here. `overflow-visible` so each
              SearchSelect panel is not clipped by the card. */}
          <Card className="overflow-visible p-4">
            {/* Bill-to and ship-to side by side, 50/50. Each picker is
                `multiline`, so a long address (village + khasra numbers) WRAPS
                and shows in full rather than truncating at half width. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label
                  htmlFor="dist-bill-to"
                  className="mb-1 block text-[12.5px] font-bold text-ink"
                >
                  Bill to
                </label>
                <SearchSelect
                  id="dist-bill-to"
                  value={billToId}
                  options={billToOptions}
                  onChange={(v) => setBillToId(String(v))}
                  disabled={loading || billAddresses.length === 0}
                  placeholder={
                    loading
                      ? "Loading…"
                      : billAddresses.length === 0
                        ? "No bill-to address"
                        : "Select bill-to address"
                  }
                  searchPlaceholder="Search address…"
                  emptyText="No address matches"
                  multiline
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="dist-ship-to"
                  className="mb-1 block text-[12.5px] font-bold text-ink"
                >
                  Ship to
                </label>
                <SearchSelect
                  id="dist-ship-to"
                  value={shipToId}
                  options={shipToOptions}
                  onChange={(v) => setShipToId(String(v))}
                  disabled={loading || shipAddresses.length === 0}
                  placeholder={
                    loading
                      ? "Loading…"
                      : shipAddresses.length === 0
                        ? "No ship-to address"
                        : "Select ship-to address"
                  }
                  searchPlaceholder="Search address…"
                  emptyText="No address matches"
                  multiline
                />
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            {/*
              The body scrolls after ~8 rows (`max-h`), with the header pinned
              (`sticky`). The product picker's panel would normally be clipped
              by this scroll container, so it renders through a PORTAL instead
              (`portal` on the SearchSelect below) and is never cut off.
            */}
            <Table
              density="compact"
              containerClassName="max-h-[26rem] overflow-y-auto"
            >
              <TableHeader className="sticky top-0 z-[1]">
                <TableRow className="bg-surface hover:bg-surface [&>th]:bg-surface [&_th]:font-bold [&_th]:text-ink">
                  <TableHead className="min-w-[260px]">Product</TableHead>
                  <TableHead className="text-right">Basic Rate</TableHead>
                  <TableHead className="text-right">PCS</TableHead>
                  <TableHead className="w-[110px]">Boxes</TableHead>
                  <TableHead className="w-[110px]">Qty</TableHead>
                  <TableHead className="text-right">Ltrs</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const { rate, pcs, ltrs, amount } = deriveRow(row);
                  const hasItem = Boolean(row.item_code);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="min-w-[260px] align-top">
                        {/*
                          Was `./SearchableSelect` — 130 lines of hand-written
                          combobox with its own outside-click listener, its own
                          highlight cursor and an `onMouseDown` that existed
                          only to beat its own input's blur. `ui/dropdown` is
                          the same control (DESIGN_SYSTEM §5a), and it was the
                          last importer of `Distributor.css`.
                        */}
                        <SearchSelect
                          id={"product-" + row.id}
                          value={row.item_code}
                          options={productOptions}
                          onChange={(code) => setProduct(row.id, String(code))}
                          disabled={loading || martProducts.length === 0}
                          placeholder={loading ? "Loading…" : "Search product…"}
                          searchPlaceholder="Product name or code…"
                          emptyText="No product matches"
                          // The MART list runs to hundreds of items.
                          maxShown={60}
                          // Escape the scrolling table container (see Card note).
                          portal
                          // Match the page's standard control size (was 14px,
                          // which read as oversized next to everything else).
                          textClassName="text-[12.5px]"
                        />
                        {/* A stale party-product assignment blocks the line.
                            The message sits under the product it is about,
                            not in a summary at the bottom. */}
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
                          // Just the icon, in bold red — no filled background.
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
                disabled={loading || martProducts.length === 0}
                // Filled green by default (not the outline-until-hover success
                // look), so "Add row" reads as the affirmative action it is.
                className="border-transparent bg-green-600 text-white hover:bg-green-700 hover:text-white"
              >
                <HiOutlinePlus aria-hidden="true" /> Add row
              </Button>
            </div>
          </Card>

          {/* All the order calculations, below the lines. */}
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryItem label="Products" value={inr(totalProducts, 0)} />
              <SummaryItem label="Total PCS" value={inr(totalPcs, 0)} />
              <SummaryItem label="Total Boxes" value={inr(totalBoxes, 0)} />
              <SummaryItem label="Total Ltrs" value={inr(totalLtrs)} />
              <SummaryItem label="Total Amount" value={`₹${inr(totalAmount)}`} />
              <SummaryItem
                label="Grand Total (incl. tax)"
                value={`₹${inr(grandTotal)}`}
                highlight
              />
            </div>
          </Card>

          {/* Submit sits at the very bottom-right, after the totals — the last
              thing on the page, once everything above has been reviewed. */}
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={onSubmit}
              disabled={totalProducts === 0 || submitting}
              className="px-8"
            >
              {submitting ? "Submitting…" : "Submit order"}
            </Button>
          </div>
        </>
      ) : null}
    </Page>
  );
}

export default Distributor;
