import { useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { formatDateDisplay, formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState, SalesOrder } from "./useSalesInvoice";

type Props = {
  order: SalesOrder;
  state: SalesInvoiceState;
};

export default function SOCard({ order, state }: Props) {
  const [expanded, setExpanded] = useState(false);
  const lines = state.getOrderLines(order);
  const openLines = lines.filter((line) => toNumber(line.OpenQty) > 0);
  const selectedCount = openLines.filter((line) => state.selectedLines[lineKey(order.DocEntry, line.LineNum)]).length;
  const docNum = order.DocNum || order.DocEntry;

  return (
    <article className={`si-so-card ${expanded ? "is-expanded" : ""}`} style={{ display: "block", background: "#fff", color: "#0f172a" }}>
      <header
        className="si-so-head"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
        style={{ display: "flex", minHeight: 66, background: "#f8fbff", color: "#0f172a", cursor: "pointer" }}
      >
        <div style={{ display: "block", minWidth: 0 }}>
          <h3 style={{ color: "#172554", fontSize: 15, fontWeight: 850, margin: 0 }}>
            <span className={`si-accordion-caret ${expanded ? "is-open" : ""}`} aria-hidden="true">
              <HiChevronRight />
            </span>
            SO #{docNum}
          </h3>
          <p style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 4 }}>
            DocEntry {order.DocEntry} - {formatDateDisplay(order.DocDate)} - Due {formatDateDisplay(order.DocDueDate)}
          </p>
        </div>
        <div className="si-so-actions" style={{ display: "flex", alignItems: "center" }}>
          <span style={{ display: "inline-flex", color: "#475569", fontSize: 12, fontWeight: 800 }}>
            {selectedCount}/{openLines.length} selected
          </span>
          <button
            className={selectedCount > 0 ? "si-btn si-btn-outline" : "si-btn si-btn-primary"}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              state.toggleOrder(order);
            }}
            disabled={openLines.length === 0}
          >
            {selectedCount > 0 ? "Clear order" : "Select order"}
          </button>
        </div>
      </header>

      {expanded && <div className="si-line-list" style={{ display: "grid" }}>
        {lines.map((line) => {
          const key = lineKey(order.DocEntry, line.LineNum);
          const selected = state.selectedLines[key];
          const disabled = toNumber(line.OpenQty) <= 0;

          return (
            <div
              className={`si-line-row ${selected ? "is-selected" : "is-dimmed"} ${disabled ? "is-disabled" : ""}`}
              key={key}
              style={{
                display: "grid",
                minHeight: 74,
                background: selected ? "#f0f9ff" : "#fff",
                color: "#0f172a",
                opacity: disabled ? 0.55 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(selected)}
                disabled={disabled}
                onChange={() => state.toggleLine(order, line)}
              />
              <div className="si-line-copy" style={{ display: "grid", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
                  <span className="si-item-badge" style={{ display: "inline-flex", color: "#1d4ed8", fontSize: 11 }}>
                    {line.ItemCode || "-"}
                  </span>
                  <strong style={{ display: "inline", color: "#0f172a", fontSize: 13, fontWeight: 850 }}>
                    {line.Dscription || "Unnamed SAP line"}
                  </strong>
                </div>
                <p style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7, margin: 0 }}>
                  <span style={{ display: "inline-flex", color: "#475569", fontSize: 11 }}>{line.WhsCode || "-"}</span>
                  <span style={{ display: "inline-flex", color: "#475569", fontSize: 11 }}>{line.TaxCode || line.VatGroup || "-"}</span>
                </p>
              </div>
              <div className="si-line-side" style={{ display: "grid", color: "#64748b", fontSize: 11, fontWeight: 800 }}>
                <span style={{ display: "inline-flex" }}>Open qty: {line.OpenQty}</span>
                <span style={{ display: "inline-flex" }}>Price: {formatMoney(toNumber(line.Price))}</span>
                <label>
                  Invoice qty
                  <input
                    type="number"
                    min="1"
                    max={line.OpenQty}
                    required={Boolean(selected)}
                    disabled={!selected}
                    value={selected?.invoiceQty || ""}
                    onChange={(event) => state.updateLine(key, { invoiceQty: toNumber(event.target.value) })}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>}
    </article>
  );
}
