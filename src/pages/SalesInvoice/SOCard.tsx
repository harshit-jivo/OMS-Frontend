import { useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { formatDateDisplay, formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState, SalesOrder } from "./useSalesInvoice";

type Props = {
  order: SalesOrder;
  state: SalesInvoiceState;
};

/** What an in-flight log's status means for someone about to invoice the SO. */
const USED_STATUS_LABELS: Record<string, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved, not posted",
  EDITED: "Being reworked",
  ERROR: "Failed, in a log",
  CL_RAISED: "Credit limit raised",
  POSTED_TO_SAP: "Already invoiced",
};

export default function SOCard({ order, state }: Props) {
  const [expanded, setExpanded] = useState(false);
  const lines = state.getOrderLines(order);
  const openLines = lines.filter((line) => toNumber(line.OpenQty) > 0);
  const selectedCount = openLines.filter((line) => state.selectedLines[lineKey(order.DocEntry, line.LineNum)]).length;
  const docNum = order.DocNum || order.DocEntry;

  // Already carried by another invoice log. SAP still reports the SO as open
  // until that invoice posts, so without this the same order gets invoiced
  // twice. Dimmed and badged rather than disabled — a supervisor may still have
  // a legitimate reason to proceed.
  const usedBy = state.usedSalesOrders?.[String(docNum)];
  const usedLabel = usedBy ? USED_STATUS_LABELS[usedBy.status] || "Already in a log" : "";

  return (
    <article
      className={`si-so-card ${expanded ? "is-expanded" : ""} ${usedBy ? "is-already-logged" : ""} ${selectedCount ? "has-selected-lines" : ""}`}
    >
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
      >
        <div className="si-so-head-info">
          <h3>
            <span className={`si-accordion-caret ${expanded ? "is-open" : ""}`} aria-hidden="true">
              <HiChevronRight />
            </span>
            SO #{docNum}
            {usedBy && (
              <span
                className="si-so-used-badge"
                title={`Invoice log #${usedBy.log_id}${usedBy.sap_doc_num ? ` · SAP invoice ${usedBy.sap_doc_num}` : ""}${usedBy.created_at ? ` · ${formatDateDisplay(usedBy.created_at)}` : ""}`}
              >
                {usedLabel}
              </span>
            )}
          </h3>
          <p>
            DocEntry {order.DocEntry} - {formatDateDisplay(order.DocDate)} - Due {formatDateDisplay(order.DocDueDate)}
          </p>
        </div>
        <div className="si-so-actions">
          <span>
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

      {expanded && <div className="si-line-list">
        {lines.map((line) => {
          const key = lineKey(order.DocEntry, line.LineNum);
          const selected = state.selectedLines[key];
          const disabled = toNumber(line.OpenQty) <= 0;

          return (
            <div
              className={`si-line-row ${selected ? "is-selected" : "is-dimmed"} ${disabled ? "is-disabled" : ""}`}
              key={key}
            >
              <input
                type="checkbox"
                checked={Boolean(selected)}
                disabled={disabled}
                aria-label={`Select ${line.Dscription || line.ItemCode || "sales order line"}`}
                onChange={() => state.toggleLine(order, line)}
              />
              <div className="si-line-copy">
                <div>
                  <span className="si-item-badge">
                    {line.ItemCode || "-"}
                  </span>
                  <strong>
                    {line.Dscription || "Unnamed SAP line"}
                  </strong>
                </div>
                <p>
                  <span>{line.WhsCode || "-"}</span>
                  <span>{line.TaxCode || line.VatGroup || "-"}</span>
                </p>
              </div>
              <div className="si-line-side">
                <span>Open qty: {line.OpenQty}</span>
                <span>Price: {formatMoney(toNumber(line.Price))}</span>
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
