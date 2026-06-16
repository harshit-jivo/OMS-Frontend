import { useCallback, useEffect, useMemo, useState } from "react";
import { HiArrowPath, HiEye, HiInbox, HiXMark } from "react-icons/hi2";
import { apiFetch } from "./SalesInvoice/useSalesInvoice";
import { toNumber } from "./SalesInvoice/salesInvoice.utils";
import "../styles/InvoiceReview.css";

// SAP approval (WddStatus) codes the invoice-drafts endpoint filters on:
// W = pending approval, Y = approved, R = rejected. The response itself does not
// carry the status, so the active filter determines what's shown.
type StatusCode = "W" | "Y" | "R";

const STATUS_FILTERS: Array<{ code: StatusCode; label: string; badge: string }> = [
  { code: "W", label: "Pending", badge: "pending" },
  { code: "Y", label: "Approved", badge: "approved" },
  { code: "R", label: "Rejected", badge: "rejected" },
];

// The endpoint returns one row per draft *line item*; rows sharing a document are
// grouped (by DocNum) into a single draft below.
type DraftRow = {
  DocEntry?: number;
  DocNum?: number;
  DocDate?: string;
  DocDueDate?: string;
  CardCode?: string;
  CardName?: string;
  Address?: string;
  Address2?: string;
  ShipToCode?: string;
  U_OMS_REF?: string | null;
  LineNum?: number;
  BaseRef?: string;
  ItemCode?: string;
  Dscription?: string;
  ShipDate?: string;
  OpenQty?: number;
  Price?: number;
  LineTotal?: number;
  WhsCode?: string;
  [key: string]: unknown;
};

type DraftGroup = {
  key: string;
  header: DraftRow;
  lines: DraftRow[];
  total: number;
  docEntries: number[];
  omsRefs: string[];
  baseRefs: string[];
};

const formatAmount = (value: unknown) => {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

// SAP addresses arrive as carriage-return separated lines ("CITY\rPIN\rIN").
const formatAddress = (value?: string) =>
  value
    ? value
        .split(/\r\n?/)
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ")
    : "—";

const orDash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

// Quantity isn't returned directly, but LineTotal = Price × Qty for these rows.
const lineQty = (line: DraftRow): string => {
  const price = toNumber(line.Price);
  if (price <= 0) return "—";
  const qty = toNumber(line.LineTotal) / price;
  return (Math.round(qty * 1000) / 1000).toLocaleString("en-IN");
};

// The SAP proxy returns rows wrapped as { data: [...] }; tolerate a few shapes.
const extractRows = (payload: unknown): DraftRow[] => {
  if (Array.isArray(payload)) return payload as DraftRow[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "results", "value"]) {
      if (Array.isArray(obj[key])) return obj[key] as DraftRow[];
    }
  }
  return [];
};

// Collapse the flat line rows into one entry per draft document. Keyed by DocNum
// when present (a single invoice number can span several DocEntry rows), otherwise
// by DocEntry so 0/blank doc numbers don't all merge together.
const groupDrafts = (rows: DraftRow[]): DraftGroup[] => {
  const groups = new Map<string, DraftGroup>();
  const order: string[] = [];

  rows.forEach((row) => {
    const key = row.DocNum ? `N${row.DocNum}` : `E${row.DocEntry ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, header: row, lines: [], total: 0, docEntries: [], omsRefs: [], baseRefs: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.lines.push(row);
    group.total += toNumber(row.LineTotal);
    if (row.DocEntry !== undefined && row.DocEntry !== null && !group.docEntries.includes(row.DocEntry)) {
      group.docEntries.push(row.DocEntry);
    }
    if (row.U_OMS_REF && !group.omsRefs.includes(String(row.U_OMS_REF))) group.omsRefs.push(String(row.U_OMS_REF));
    if (row.BaseRef && !group.baseRefs.includes(String(row.BaseRef))) group.baseRefs.push(String(row.BaseRef));
  });

  return order.map((key) => groups.get(key) as DraftGroup);
};

export default function InvoiceReview() {
  const [statusCode, setStatusCode] = useState<StatusCode>("W");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DraftGroup | null>(null);

  const activeFilter = STATUS_FILTERS.find((filter) => filter.code === statusCode) ?? STATUS_FILTERS[0];

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<unknown>(`/api/hana/invoice-drafts/?statusCode=${statusCode}`);
      setRows(extractRows(data));
    } catch (err) {
      console.error(err);
      setRows([]);
      setError("Unable to load invoice drafts from SAP HANA.");
    } finally {
      setLoading(false);
    }
  }, [statusCode]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const drafts = useMemo(() => groupDrafts(rows), [rows]);

  return (
    <div className="ir-page">
      <header className="ir-header">
        <div>
          <h1>Invoice Review</h1>
        </div>
        <button type="button" className="ir-btn ir-btn-ghost" onClick={loadDrafts} disabled={loading}>
          <HiArrowPath className={loading ? "ir-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <nav className="ir-filters" aria-label="Filter invoice drafts by approval status">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.code}
            type="button"
            className={`ir-filter${statusCode === filter.code ? " is-active" : ""}`}
            onClick={() => setStatusCode(filter.code)}
          >
            {filter.label}
          </button>
        ))}
      </nav>

      {error && <div className="ir-banner ir-banner-error">{error}</div>}

      <section className="ir-card">
        {loading ? (
          <div className="ir-empty">Loading invoice drafts…</div>
        ) : drafts.length === 0 ? (
          <div className="ir-empty">
            <HiInbox aria-hidden="true" />
            <span>No invoice drafts found for this status.</span>
          </div>
        ) : (
          <div className="ir-table-wrap">
            <table className="ir-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Party</th>
                  <th className="ir-num">Amount</th>
                  <th>Status</th>
                  <th>Doc Date</th>
                  <th className="ir-num">Items</th>
                  <th className="ir-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr key={draft.key}>
                    <td>{draft.header.DocNum ? draft.header.DocNum : `Draft ${orDash(draft.docEntries.join(", "))}`}</td>
                    <td>{orDash(draft.header.CardName)}</td>
                    <td className="ir-num">{formatAmount(draft.total)}</td>
                    <td>
                      <span className={`ir-badge ir-badge-${activeFilter.badge}`}>{activeFilter.label}</span>
                    </td>
                    <td>{formatDate(draft.header.DocDate)}</td>
                    <td className="ir-num">{draft.lines.length}</td>
                    <td className="ir-actions-col">
                      <div className="ir-row-actions">
                        <button
                          type="button"
                          className="ir-btn ir-btn-ghost ir-btn-sm"
                          onClick={() => setSelected(draft)}
                        >
                          <HiEye aria-hidden="true" />
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="ir-modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <section
            className="ir-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Invoice draft ${selected.header.DocNum ?? selected.key}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ir-modal-head">
              <div>
                <span className="ir-eyebrow">Invoice Draft</span>
                <h2>Invoice #{orDash(selected.header.DocNum)}</h2>
                <p>{orDash(selected.header.CardName)}</p>
              </div>
              <button
                type="button"
                className="ir-icon-btn"
                aria-label="Close details"
                onClick={() => setSelected(null)}
              >
                <HiXMark aria-hidden="true" />
              </button>
            </header>

            <div className="ir-modal-body">
              <dl className="ir-meta-grid">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`ir-badge ir-badge-${activeFilter.badge}`}>{activeFilter.label}</span>
                  </dd>
                </div>
                <div><dt>Invoice No.</dt><dd>{orDash(selected.header.DocNum)}</dd></div>
                <div><dt>Draft Entry</dt><dd>{orDash(selected.docEntries.join(", "))}</dd></div>
                <div><dt>Customer Code</dt><dd>{orDash(selected.header.CardCode)}</dd></div>
                <div><dt>Total Amount</dt><dd>{formatAmount(selected.total)}</dd></div>
                <div><dt>Doc Date</dt><dd>{formatDate(selected.header.DocDate)}</dd></div>
                <div><dt>Due Date</dt><dd>{formatDate(selected.header.DocDueDate)}</dd></div>
                <div><dt>Ship To</dt><dd>{orDash(selected.header.ShipToCode)}</dd></div>
                <div><dt>OMS Ref</dt><dd>{orDash(selected.omsRefs.join(", "))}</dd></div>
                <div><dt>Source Ref</dt><dd>{orDash(selected.baseRefs.join(", "))}</dd></div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>Address</dt>
                  <dd>{formatAddress(selected.header.Address)}</dd>
                </div>
              </dl>

              <h3 className="ir-section-title">Line Items</h3>
              <div className="ir-table-wrap">
                <table className="ir-table ir-table-compact">
                  <thead>
                    <tr>
                      <th>Item Code</th>
                      <th>Description</th>
                      <th>Warehouse</th>
                      <th className="ir-num">Qty</th>
                      <th className="ir-num">Price</th>
                      <th className="ir-num">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line, index) => (
                      <tr key={`${line.DocEntry ?? ""}-${line.LineNum ?? index}`}>
                        <td>{orDash(line.ItemCode)}</td>
                        <td>{orDash(line.Dscription)}</td>
                        <td>{orDash(line.WhsCode)}</td>
                        <td className="ir-num">{lineQty(line)}</td>
                        <td className="ir-num">{formatAmount(line.Price)}</td>
                        <td className="ir-num">{formatAmount(line.LineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <details className="ir-raw">
                <summary>Raw draft</summary>
                <pre>{JSON.stringify(selected.lines, null, 2)}</pre>
              </details>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
