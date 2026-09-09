/**
 * One sales order in the picker: a collapsible header over its open lines.
 */
import { useState } from "react";
import { HiOutlineChevronRight } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
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
  const selectedCount = openLines.filter(
    (line) => state.selectedLines[lineKey(order.DocEntry, line.LineNum)],
  ).length;
  const docNum = order.DocNum || order.DocEntry;

  // Already carried by another invoice log. SAP still reports the SO as open
  // until that invoice posts, so without this the same order gets invoiced
  // twice. Flagged rather than disabled — a supervisor may still have a
  // legitimate reason to proceed.
  const usedBy = state.usedSalesOrders?.[String(docNum)];
  const usedLabel = usedBy ? USED_STATUS_LABELS[usedBy.status] || "Already in a log" : "";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-card border bg-card transition-colors",
        selectedCount ? "border-brand-line" : "border-line",
        usedBy && "border-hold/50 bg-hold-soft/30",
      )}
    >
      <header className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          /* The whole header toggles. It was a `div role="button"` with a
             keydown handler standing in for one — a real button gets Enter
             and Space for free. The §1.1 reset applies because preflight is
             not imported. */
          className="flex min-w-0 flex-1 cursor-pointer appearance-none items-center gap-2 border-0 bg-transparent p-0 text-left [font-family:inherit]"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <HiOutlineChevronRight
            aria-hidden="true"
            className={cn("shrink-0 text-subtle transition-transform", expanded && "rotate-90")}
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink">
              SO #{docNum}
              {usedBy && (
                <Badge
                  tone="hold"
                  title={
                    "Invoice log #" +
                    usedBy.log_id +
                    (usedBy.sap_doc_num ? " · SAP invoice " + usedBy.sap_doc_num : "") +
                    (usedBy.created_at ? " · " + formatDateDisplay(usedBy.created_at) : "")
                  }
                >
                  {usedLabel}
                </Badge>
              )}
            </span>
            <span className="block text-[11.5px] text-subtle">
              DocEntry {order.DocEntry} · {formatDateDisplay(order.DocDate)} · Due{" "}
              {formatDateDisplay(order.DocDueDate)}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[12px] tabular-nums text-subtle">
            {selectedCount}/{openLines.length} selected
          </span>
          <Button
            size="sm"
            variant={selectedCount > 0 ? "secondary" : "primary"}
            onClick={() => state.toggleOrder(order)}
            disabled={openLines.length === 0}
            title={openLines.length === 0 ? "This order has no open lines." : undefined}
          >
            {selectedCount > 0 ? "Clear order" : "Select order"}
          </Button>
        </div>
      </header>

      {expanded && (
        <ul className="m-0 list-none divide-y divide-line border-t border-line p-0">
          {lines.map((line) => {
            const key = lineKey(order.DocEntry, line.LineNum);
            const selected = state.selectedLines[key];
            const disabled = toNumber(line.OpenQty) <= 0;

            return (
              <li
                className={cn(
                  "flex flex-wrap items-start gap-3 px-3 py-2.5 text-[13px]",
                  selected && "bg-brand-soft",
                  // A fully-invoiced line: shown for context, not selectable.
                  disabled && "opacity-55",
                )}
                key={key}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-3.5 shrink-0 accent-brand"
                  checked={Boolean(selected)}
                  disabled={disabled}
                  aria-label={"Select " + (line.Dscription || line.ItemCode || "sales order line")}
                  onChange={() => state.toggleLine(order, line)}
                />

                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-mono text-[11.5px] text-subtle">
                      {line.ItemCode || "—"}
                    </span>
                    <strong className="font-semibold text-ink">
                      {line.Dscription || "Unnamed SAP line"}
                    </strong>
                  </div>
                  <p className="m-0 flex flex-wrap gap-x-3 text-[11.5px] text-subtle">
                    <span>{line.WhsCode || "—"}</span>
                    <span>{line.TaxCode || line.VatGroup || "—"}</span>
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-end gap-3">
                  <span className="text-[11.5px] tabular-nums text-subtle">
                    Open {line.OpenQty}
                  </span>
                  <span className="text-[11.5px] tabular-nums text-subtle">
                    {formatMoney(toNumber(line.Price))}
                  </span>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-subtle">Invoice qty</span>
                    <Input
                      type="number"
                      min="1"
                      max={line.OpenQty}
                      required={Boolean(selected)}
                      disabled={!selected}
                      value={selected?.invoiceQty || ""}
                      onChange={(event) =>
                        state.updateLine(key, { invoiceQty: toNumber(event.target.value) })
                      }
                      className="h-control-sm w-24 text-right tabular-nums"
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
