import { useEffect, useMemo, useState } from "react";
import { sapService } from "../services/sapService";
import type { Party, SapSalesOrder, SapSalesOrderLine } from "../services/sapService";
import "../styles/Sales_Invoice.css";

type SelectedLine = {
  docEntry: number;
  docNum: number;
  lineNum: number;
  itemCode: string;
  description: string;
  openQty: number;
  invoiceQty: number;
  price: number;
  taxPercent: number;
  whsCode: string;
  taxCode: string;
};

const formatAmount = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const lineKey = (docEntry: number, lineNum: number) => `${docEntry}-${lineNum}`;

export default function SalesInvoice() {
  const [parties, setParties] = useState<Party[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [salesOrders, setSalesOrders] = useState<SapSalesOrder[]>([]);
  const [selectedLines, setSelectedLines] = useState<Record<string, SelectedLine>>({});
  const [loadingParties, setLoadingParties] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadParties = async () => {
      setLoadingParties(true);
      setError("");

      try {
        const data = await sapService.getOpenParties();
        setParties(data);
      } catch (loadError) {
        console.error("Error loading open parties:", loadError);
        setError("Unable to load open parties.");
      } finally {
        setLoadingParties(false);
      }
    };

    loadParties();
  }, []);

  useEffect(() => {
    const loadOrders = async () => {
      if (!selectedParty) {
        setSalesOrders([]);
        setSelectedLines({});
        return;
      }

      setLoadingOrders(true);
      setError("");
      setSelectedLines({});

      try {
        const data = await sapService.getOpenSalesOrders(selectedParty.card_code);
        setSalesOrders(data);
      } catch (loadError) {
        console.error("Error loading open sales orders:", loadError);
        setError("Unable to load open sales orders for this party.");
      } finally {
        setLoadingOrders(false);
      }
    };

    loadOrders();
  }, [selectedParty]);

  const filteredParties = useMemo(() => {
    const query = partySearch.trim().toLowerCase();
    if (!query) return parties;

    return parties.filter((party) =>
      [party.card_code, party.card_name, party.state, party.main_group, party.chain]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [parties, partySearch]);

  const selectedLineList = useMemo(() => Object.values(selectedLines), [selectedLines]);

  const totals = useMemo(() => {
    return selectedLineList.reduce(
      (sum, line) => {
        const taxable = line.invoiceQty * line.price;
        const tax = taxable * (line.taxPercent / 100);
        return {
          qty: sum.qty + line.invoiceQty,
          taxable: sum.taxable + taxable,
          tax: sum.tax + tax,
          grand: sum.grand + taxable + tax,
        };
      },
      { qty: 0, taxable: 0, tax: 0, grand: 0 },
    );
  }, [selectedLineList]);

  const invoicePayload = useMemo(
    () => ({
      card_code: selectedParty?.card_code || "",
      card_name: selectedParty?.card_name || "",
      lines: selectedLineList.map((line) => ({
        base_doc_entry: line.docEntry,
        base_doc_num: line.docNum,
        base_line_num: line.lineNum,
        item_code: line.itemCode,
        quantity: line.invoiceQty,
        warehouse_code: line.whsCode,
        tax_code: line.taxCode,
      })),
    }),
    [selectedLineList, selectedParty],
  );

  const toggleLine = (order: SapSalesOrder, line: SapSalesOrderLine) => {
    const key = lineKey(order.DocEntry, line.LineNum);

    setSelectedLines((current) => {
      const next = { ...current };

      if (next[key]) {
        delete next[key];
        return next;
      }

      next[key] = {
        docEntry: order.DocEntry,
        docNum: order.DocNum,
        lineNum: line.LineNum,
        itemCode: line.ItemCode,
        description: line.Dscription,
        openQty: Number(line.OpenQty || 0),
        invoiceQty: Number(line.OpenQty || 0),
        price: Number(line.Price || 0),
        taxPercent: Number(line.VatPrcnt || 0),
        whsCode: line.WhsCode,
        taxCode: line.TaxCode,
      };

      return next;
    });
  };

  const toggleOrder = (order: SapSalesOrder) => {
    const openLines = order.lines.filter((line) => Number(line.OpenQty || 0) > 0);
    const allSelected = openLines.every((line) => selectedLines[lineKey(order.DocEntry, line.LineNum)]);

    setSelectedLines((current) => {
      const next = { ...current };

      openLines.forEach((line) => {
        const key = lineKey(order.DocEntry, line.LineNum);

        if (allSelected) {
          delete next[key];
        } else if (!next[key]) {
          next[key] = {
            docEntry: order.DocEntry,
            docNum: order.DocNum,
            lineNum: line.LineNum,
            itemCode: line.ItemCode,
            description: line.Dscription,
            openQty: Number(line.OpenQty || 0),
            invoiceQty: Number(line.OpenQty || 0),
            price: Number(line.Price || 0),
            taxPercent: Number(line.VatPrcnt || 0),
            whsCode: line.WhsCode,
            taxCode: line.TaxCode,
          };
        }
      });

      return next;
    });
  };

  const updateInvoiceQty = (key: string, value: string) => {
    const nextQty = Number(value);

    setSelectedLines((current) => {
      const selected = current[key];
      if (!selected) return current;

      return {
        ...current,
        [key]: {
          ...selected,
          invoiceQty: Math.min(Math.max(nextQty || 0, 0), selected.openQty),
        },
      };
    });
  };

  return (
    <div className="si-page">
      <div className="si-head">
        <div>
          <h2 className="si-title">Sales Invoice Builder</h2>
          <p className="si-subtitle">Select a party with open sales orders, pick SAP sales order lines, and prepare an invoice draft.</p>
        </div>
        <span className="si-pill">Open sales orders</span>
      </div>

      {error && <div className="si-alert">{error}</div>}

      <div className="si-layout">
        <section className="si-panel si-party-panel">
          <div className="si-panel-head">
            <div>
              <h3>Party</h3>
              <p>{parties.length} parties with open sales orders</p>
            </div>
          </div>

          <input
            className="si-search"
            value={partySearch}
            onChange={(event) => setPartySearch(event.target.value)}
            placeholder="Search by code, name, state, group"
          />

          <div className="si-party-list">
            {loadingParties ? (
              <div className="si-empty">Loading parties...</div>
            ) : filteredParties.length === 0 ? (
              <div className="si-empty">No matching open parties found.</div>
            ) : (
              filteredParties.map((party) => (
                <button
                  key={party.card_code}
                  className={`si-party ${selectedParty?.card_code === party.card_code ? "active" : ""}`}
                  onClick={() => setSelectedParty(party)}
                >
                  <span className="si-party-name">{party.card_name}</span>
                  <span className="si-party-meta">
                    {party.card_code}
                    {party.open_sales_order_count !== undefined
                      ? ` - ${party.open_sales_order_count} open SO`
                      : ""}
                    {party.state ? ` - ${party.state}` : ""} {party.main_group ? ` - ${party.main_group}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="si-panel si-orders-panel">
          <div className="si-panel-head">
            <div>
              <h3>Open Sales Orders</h3>
              <p>{selectedParty ? `${selectedParty.card_code} - ${selectedParty.card_name}` : "Choose a party to load open orders"}</p>
            </div>
          </div>

          {!selectedParty ? (
            <div className="si-empty si-large-empty">Select a party from the left to view open sales orders.</div>
          ) : loadingOrders ? (
            <div className="si-empty si-large-empty">Loading open sales orders...</div>
          ) : salesOrders.length === 0 ? (
            <div className="si-empty si-large-empty">No open sales orders found for this party.</div>
          ) : (
            <div className="si-orders">
              {salesOrders.map((order) => {
                const selectedCount = order.lines.filter((line) => selectedLines[lineKey(order.DocEntry, line.LineNum)]).length;

                return (
                  <article className="si-order" key={order.DocEntry}>
                    <div className="si-order-head">
                      <div>
                        <h4>SO #{order.DocNum}</h4>
                        <p>
                          DocEntry {order.DocEntry} - {formatDate(order.DocDate)} - Due {formatDate(order.DocDueDate)}
                        </p>
                      </div>
                      <div className="si-order-actions">
                        <span>{selectedCount}/{order.lines.length} lines</span>
                        <button onClick={() => toggleOrder(order)}>
                          {selectedCount === order.lines.length ? "Clear order" : "Select order"}
                        </button>
                      </div>
                    </div>

                    <div className="si-lines">
                      {order.lines.map((line) => {
                        const key = lineKey(order.DocEntry, line.LineNum);
                        const selected = selectedLines[key];
                        const disabled = Number(line.OpenQty || 0) <= 0;

                        return (
                          <div className={`si-line ${selected ? "selected" : ""}`} key={key}>
                            <label className="si-check">
                              <input
                                type="checkbox"
                                checked={Boolean(selected)}
                                disabled={disabled}
                                onChange={() => toggleLine(order, line)}
                              />
                              <span />
                            </label>

                            <div className="si-line-main">
                              <strong>{line.Dscription}</strong>
                              <span>
                                {line.ItemCode} - Line {line.LineNum} - {line.WhsCode} - {line.TaxCode}
                              </span>
                            </div>

                            <div className="si-line-numbers">
                              <span>Open: {line.OpenQty}</span>
                              <span>Price: {formatAmount(Number(line.Price || 0))}</span>
                              {selected && (
                                <input
                                  type="number"
                                  min="0"
                                  max={selected.openQty}
                                  value={selected.invoiceQty}
                                  onChange={(event) => updateInvoiceQty(key, event.target.value)}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="si-panel si-summary">
          <div className="si-panel-head">
            <div>
              <h3>Invoice Draft</h3>
              <p>{selectedLineList.length} selected lines</p>
            </div>
          </div>

          <div className="si-summary-grid">
            <span>Total Qty</span>
            <strong>{totals.qty}</strong>
            <span>Taxable</span>
            <strong>{formatAmount(totals.taxable)}</strong>
            <span>Tax</span>
            <strong>{formatAmount(totals.tax)}</strong>
            <span>Grand Total</span>
            <strong>{formatAmount(totals.grand)}</strong>
          </div>

          <div className="si-draft-lines">
            {selectedLineList.length === 0 ? (
              <div className="si-empty">Selected lines will appear here.</div>
            ) : (
              selectedLineList.map((line) => (
                <div className="si-draft-line" key={lineKey(line.docEntry, line.lineNum)}>
                  <span>{line.description}</span>
                  <strong>
                    {line.invoiceQty} × {formatAmount(line.price)}
                  </strong>
                </div>
              ))
            )}
          </div>

          <button className="si-create-btn" disabled={selectedLineList.length === 0}>
            Push invoice endpoint pending
          </button>

          <details className="si-payload">
            <summary>Draft payload</summary>
            <pre>{JSON.stringify(invoicePayload, null, 2)}</pre>
          </details>
        </aside>
      </div>
    </div>
  );
}
