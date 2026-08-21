import { useEffect, useMemo, useRef, useState } from "react";
import { userService } from "../../services/userService";
import { ordersService, type MartOrderPayload } from "../../services/ordersService";
import SearchableSelect from "./SearchableSelect";
import "../../styles/Distributor/Distributor.css";

const COMPANY_MART = 3; // company 3 = Mart, stamped on every distributor order
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
  const [party, setParty] = useState<{
    card_code: string;
    card_name: string;
  } | null>(null);
  const [martProducts, setMartProducts] = useState<PartyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Monotonic id so React keys stay stable as rows are added/removed.
  const nextId = useRef(1);
  const makeRow = (): Row => ({
    id: nextId.current++,
    item_code: "",
    boxes: 0,
    qty: 0,
  });

  // First bill-to (B) and ship-to (S) address for the party — auto-picked.
  const [billTo, setBillTo] = useState<PartyAddress | null>(null);
  const [shipTo, setShipTo] = useState<PartyAddress | null>(null);

  const [rows, setRows] = useState<Row[]>([makeRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  useEffect(() => {
    const userId = Number(localStorage.getItem("user_id"));
    if (!userId) {
      setError("Could not identify the logged-in user. Please log in again.");
      setLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      try {
        // 1. Which party is assigned to this distributor?
        const partiesRes = await userService.getUserParties(userId);
        const parties = partiesRes?.data?.parties ?? [];
        if (!parties.length) {
          if (alive) {
            setError(
              "No party is assigned to your account. Please contact an administrator.",
            );
          }
          return;
        }

        // "Every distributor is assigned one party" — take the first.
        const assigned = parties[0];
        if (alive) {
          setParty({
            card_code: assigned.card_code,
            card_name: assigned.card_name,
          });
        }

        // 2. That party's assigned products (MART only). Use the RICHER orders
        //    endpoint — the same one Add Sales uses — so we get sal_factor2 /
        //    sal_pack_unit / tax_rate / brand / variety needed to compute the
        //    line exactly like a billing order.
        const prodList = await ordersService.getPartyProduct(assigned.card_code);
        const list: PartyProduct[] = (Array.isArray(prodList) ? prodList : [])
          .filter((p: any) => (p.category || "").toUpperCase() === CATEGORY)
          .map((p: any) => ({
            item_code: p.item_code,
            item_name: p.item_name,
            category: p.category,
            basic_rate: Number(p.basic_rate) || 0,
            brand: p.brand || "",
            variety: p.variety || p.sub_group || "",
            sub_group: p.sub_group || p.variety || "",
            sal_factor2: Number(p.sal_factor2) || 0,
            sal_pack_unit: Number(p.sal_pack_unit) || 0,
            tax_rate: Number(p.tax_rate) || 0,
            updated_at: p.updated_at ?? null,
          }));
        if (alive) setMartProducts(list);

        // 3. Auto-pick the party's first MART bill-to and ship-to address.
        //    Scope to the MART category so a party that also has addresses in
        //    other categories can't surface a non-MART (wrong) address here.
        try {
          const addr = await ordersService.getPartyAdd(assigned.card_code, CATEGORY);
          if (alive) {
            setBillTo((addr?.bill_to ?? [])[0] ?? null);
            setShipTo((addr?.ship_to ?? [])[0] ?? null);
          }
        } catch {
          /* addresses are validated at submit time; ignore load failure here */
        }
      } catch {
        if (alive) {
          setError(
            "Failed to load your assigned party / products. Please try again.",
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

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
      setSubmitMsg({ kind: "err", text: "No party is assigned to your account." });
      return;
    }
    if (!billTo || !shipTo) {
      setSubmitMsg({
        kind: "err",
        text: "This party has no bill-to / ship-to address configured. Please contact an administrator.",
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
    setSubmitMsg(null);
    try {
      const res = await ordersService.createMartOrder(payload);
      setSubmitMsg({
        kind: "ok",
        text: `Order ${res?.order_number ?? ""} submitted for Mart approval.`,
      });
      setRows([makeRow()]); // reset the form for the next order
    } catch (e: any) {
      const detail =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        "Failed to submit the order. Please try again.";
      setSubmitMsg({ kind: "err", text: detail });
    } finally {
      setSubmitting(false);
    }
  };

  const noProducts = !loading && !error && martProducts.length === 0;

  return (
    <div className="distributor-page">
      <h2 className="distributor-title">Distributor</h2>

      {party && (
        <p className="distributor-party">
          Party: <strong>{party.card_name}</strong>{" "}
          <span className="distributor-party-code">({party.card_code})</span>
        </p>
      )}

      {/* Bill To / Ship To are resolved internally for the order payload but not
          shown to the distributor. */}

      {error && <div className="distributor-error">{error}</div>}
      {noProducts && (
        <div className="distributor-error">
          No MART products are assigned to your party yet.
        </div>
      )}

      {!error && (
        <>
          <div className="distributor-table-wrap">
            <table className="distributor-table">
              <thead>
                <tr>
                  <th className="distributor-prod-col">Product</th>
                  <th className="distributor-rate-col">Basic Rate</th>
                  <th className="distributor-num-col">PCS</th>
                  <th className="distributor-qty-col">Boxes</th>
                  <th className="distributor-num-col">Qty</th>
                  <th className="distributor-num-col">Ltrs</th>
                  <th className="distributor-num-col">Amount</th>
                  <th className="distributor-action-col"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const { rate, pcs, ltrs, amount } = deriveRow(row);
                  const hasItem = Boolean(row.item_code);
                  return (
                    <tr key={row.id}>
                      <td className="distributor-prod-col">
                        <SearchableSelect
                          value={row.item_code}
                          options={productOptions}
                          onChange={(code) => setProduct(row.id, code)}
                          disabled={loading || martProducts.length === 0}
                          placeholder={
                            loading ? "Loading…" : "Search product…"
                          }
                        />
                        {row.error && (
                          <div className="distributor-row-error">
                            {row.error}
                          </div>
                        )}
                      </td>
                      <td className="distributor-rate-col">
                        {hasItem ? rate.toFixed(2) : "—"}
                      </td>
                      <td className="distributor-num-col">
                        {hasItem ? pcs : "—"}
                      </td>
                      <td className="distributor-qty-col">
                        <input
                          type="number"
                          min={0}
                          value={row.boxes || ""}
                          onChange={(e) => setBoxes(row.id, e.target.value)}
                          placeholder="0"
                          disabled={!hasItem}
                        />
                      </td>
                      <td className="distributor-qty-col">
                        <input
                          type="number"
                          min={0}
                          value={row.qty || ""}
                          onChange={(e) => setQty(row.id, e.target.value)}
                          placeholder="0"
                          disabled={!hasItem}
                        />
                      </td>
                      <td className="distributor-num-col">
                        {hasItem ? ltrs.toFixed(2) : "—"}
                      </td>
                      <td className="distributor-num-col">
                        {hasItem ? amount.toFixed(2) : "—"}
                      </td>
                      <td className="distributor-action-col">
                        <button
                          type="button"
                          className="distributor-remove"
                          onClick={() => removeRow(row.id)}
                          aria-label="Remove row"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="distributor-actions">
            <button
              type="button"
              className="distributor-add"
              onClick={addRow}
              disabled={loading || martProducts.length === 0}
            >
              + Add
            </button>
          </div>

          {/* Totals + submit */}
          <div className="distributor-footer">
            <div className="distributor-totals">
              <span>
                Total Products: <strong>{totalProducts}</strong>
              </span>
              <span>
                Total Boxes: <strong>{totalBoxes}</strong>
              </span>
              <span>
                Total Quantity: <strong>{inr(totalQty, 0)}</strong>
              </span>
              <span>
                Total Ltrs: <strong>{inr(totalLtrs)}</strong>
              </span>
              <span>
                Total Amount: <strong>{inr(totalAmount)}</strong>
              </span>
            </div>
            <button
              type="button"
              className="distributor-submit"
              onClick={onSubmit}
              disabled={totalProducts === 0 || submitting}
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>

          {submitMsg && (
            <div
              className={
                submitMsg.kind === "ok"
                  ? "distributor-success"
                  : "distributor-error"
              }
            >
              {submitMsg.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Distributor;
