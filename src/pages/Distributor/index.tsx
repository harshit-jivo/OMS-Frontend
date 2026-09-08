import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { userService } from "../../services/userService";
import { ordersService, type MartOrderPayload } from "../../services/ordersService";
import { showToast } from "@/lib/toastStore";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/form";
import { Card, Notice, Page, PageHeader, Stat, StatRow } from "@/components/ui/page";
import {
  HiOutlineArchiveBox,
  HiOutlineBeaker,
  HiOutlineCube,
  HiOutlineCurrencyRupee,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
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

type PartyAddress = { id: number; full_address: string };

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
      if (!assigned) return { party: null, martProducts: NO_PRODUCTS, billTo: null, shipTo: null };

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
      // tolerated: addresses are re-validated at submit time.
      let billTo: PartyAddress | null = null;
      let shipTo: PartyAddress | null = null;
      try {
        const addr = await ordersService.getPartyAdd(assigned.card_code, CATEGORY);
        billTo = (addr?.bill_to ?? [])[0] ?? null;
        shipTo = (addr?.ship_to ?? [])[0] ?? null;
      } catch {
        /* ignore */
      }

      return {
        party: { card_code: assigned.card_code, card_name: assigned.card_name },
        martProducts,
        billTo,
        shipTo,
      };
    },
  });

  const party = bootstrap.data?.party ?? null;
  const martProducts = bootstrap.data?.martProducts ?? NO_PRODUCTS;
  const billTo = bootstrap.data?.billTo ?? null;
  const shipTo = bootstrap.data?.shipTo ?? null;
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

  // First bill-to (B) and ship-to (S) address for the party — auto-picked.

  const [rows, setRows] = useState<Row[]>([makeRow()]);
  const [submitting, setSubmitting] = useState(false);

  // Product dropdown options (MART products), sorted by name.
  const productOptions = useMemo(
    () =>
      [...martProducts]
        .sort((a, b) => a.item_name.localeCompare(b.item_name))
        .map((p) => ({ value: p.item_code, label: p.item_name })),
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
        r.id === id ? { ...r, boxes, qty: boxes * factorFor(id, prev) } : r,
      ),
    );
  };

  const setQty = (id: number, raw: string) => {
    const qty = Math.max(0, Number(raw) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const factor = factorFor(id, prev);
        return { ...r, qty, boxes: factor ? qty / factor : qty };
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

  const onSubmit = async () => {
    if (!party) {
      showToast({
        title: "Cannot submit",
        message: "No party is assigned to your account.",
      });
      return;
    }
    if (!billTo || !shipTo) {
      showToast({
        title: "Cannot submit",
        message:
          "This party has no bill-to / ship-to address configured. Please contact an administrator.",
      });
      return;
    }
    if (!completedRows.length) return;

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
      showToast({
        title: "Order submitted",
        message: `${res?.order_number ?? "The order"} is with Mart approval.`,
        orderNumber: res?.order_number ?? null,
      });
      setRows([makeRow()]); // reset the form for the next order
    } catch (e) {
      const detail =
        messageFrom(e, "Failed to submit the order. Please try again.");
      showToast({ title: "Could not submit the order", message: detail });
    } finally {
      setSubmitting(false);
    }
  };

  const noProducts = !loading && !error && martProducts.length === 0;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Distributor" }, { label: "Place an order" }]} />

      <PageHeader
        title="Distributor"
        description={
          party
            ? `Ordering for ${party.card_name} (${party.card_code}).`
            : "Pick your products and quantities, then submit for approval."
        }
        actions={
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={totalProducts === 0 || submitting}
          >
            {submitting ? "Submitting…" : "Submit order"}
          </Button>
        }
      />

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

      {!error ? (
        <>
          {/* The running totals, above the lines rather than under them.
              "What am I about to commit to" is the thing being watched while
              the quantities are typed, and a footer strip means scrolling to
              the bottom to see it change. */}
          <StatRow>
            <Stat
              icon={HiOutlineCube}
              tone="neutral"
              label="Products"
              value={totalProducts}
              loading={loading}
            />
            <Stat
              icon={HiOutlineArchiveBox}
              tone="neutral"
              label="Boxes"
              value={totalBoxes}
              loading={loading}
            />
            <Stat
              icon={HiOutlineBeaker}
              tone="neutral"
              label="Total Ltrs"
              value={inr(totalLtrs)}
              loading={loading}
            />
            <Stat
              icon={HiOutlineCurrencyRupee}
              tone="brand"
              label="Total Amount"
              value={inr(totalAmount)}
              hint={`${inr(totalQty, 0)} qty`}
              loading={loading}
            />
          </StatRow>

          <Card className="overflow-visible p-0">
            {/*
              `overflow-visible`, NOT the usual `overflow-x-auto` wrapper: each
              row holds a `SearchSelect` whose panel is absolutely positioned,
              and a scroll container would clip it to the table. The table is
              narrow enough here that nothing needs to scroll.
            */}
            <Table density="compact">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
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
                          className="h-control-sm text-right tabular-nums"
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
                          className="h-control-sm text-right tabular-nums"
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
                          className="text-subtle hover:bg-danger-soft hover:text-danger"
                        >
                          <HiOutlineXMark aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="border-t border-line p-2">
              <Button
                variant="ghost"
                block
                onClick={addRow}
                disabled={loading || martProducts.length === 0}
              >
                <HiOutlinePlus aria-hidden="true" /> Add row
              </Button>
            </div>
          </Card>
        </>
      ) : null}
    </Page>
  );
}

export default Distributor;
