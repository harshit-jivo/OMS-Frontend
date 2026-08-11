import { useEffect, useMemo, useRef, useState } from "react";
import { userService } from "../../services/userService";
import { ordersService, type MartOrderPayload } from "../../services/ordersService";
import SearchableSelect from "./SearchableSelect";
import "../../styles/Distributor/Distributor.css";

const COMPANY_MART = 3; // company 3 = Mart, stamped on every distributor order

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

type Row = {
  id: number;
  item_code: string;
  quantity: number;
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
    quantity: 0,
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
          }));
        if (alive) setMartProducts(list);

        // 3. Auto-pick the party's first bill-to and ship-to address.
        try {
          const addr = await ordersService.getPartyAdd(assigned.card_code);
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

  // item_code -> basic_rate, for quick auto-fill.
  const rateLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of martProducts) map.set(p.item_code, p.basic_rate);
    return map;
  }, [martProducts]);

  const basicRateOf = (item_code: string) =>
    item_code ? rateLookup.get(item_code) ?? 0 : 0;

  // --- row mutations --------------------------------------------------------
  const addRow = () => setRows((prev) => [...prev, makeRow()]);

  const removeRow = (id: number) =>
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [makeRow()]; // always keep one row
    });

  const setProduct = (id: number, item_code: string) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, item_code } : r)),
    );

  const setQty = (id: number, raw: string) => {
    const quantity = Math.max(0, Number(raw) || 0);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, quantity } : r)));
  };

  // --- totals / submit ------------------------------------------------------
  const completedRows = rows.filter((r) => r.item_code);
  const totalProducts = completedRows.length;
  const totalQty = completedRows.reduce((sum, r) => sum + r.quantity, 0);
  const totalAmount = completedRows.reduce(
    (sum, r) => sum + r.quantity * basicRateOf(r.item_code),
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
      total_amount: totalAmount,
      items: completedRows.map((r) => {
        const p = martProducts.find((x) => x.item_code === r.item_code);
        const rate = p?.basic_rate ?? 0;
        const qty = r.quantity;
        // Same derivation as Add Sales' recalculateRowTotals:
        //   pcs   = sal_factor2 (units per box)
        //   boxes = qty / sal_factor2
        //   ltrs  = sal_pack_unit * qty
        //   total = price * qty
        const factor = p?.sal_factor2 || 0;
        const pack = p?.sal_pack_unit || 0;
        const pcs = factor;
        const boxes = factor > 0 ? qty / factor : 0;
        const ltrs = pack * qty;
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
          total: rate * qty,
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
                  <th className="distributor-qty-col">Qty</th>
                  <th className="distributor-action-col"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rate = basicRateOf(row.item_code);
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
                      </td>
                      <td className="distributor-rate-col">
                        {row.item_code ? rate.toFixed(2) : "—"}
                      </td>
                      <td className="distributor-qty-col">
                        <input
                          type="number"
                          min={0}
                          value={row.quantity || ""}
                          onChange={(e) => setQty(row.id, e.target.value)}
                          placeholder="0"
                        />
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
                Total Quantity: <strong>{totalQty}</strong>
              </span>
              <span>
                Total Amount: <strong>{totalAmount.toFixed(2)}</strong>
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
