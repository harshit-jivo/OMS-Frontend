/**
 * Step 3 — confirm the quantities before a draft is built.
 *
 * One card per selected sales order, each showing ALL its lines (not just the
 * ticked ones), so a line left out is visibly left out rather than absent.
 */
import { HiOutlineDocumentText } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, EmptyState, Notice } from "@/components/ui/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateDisplay, formatMoney, lineKey, toNumber } from "./salesInvoice.utils";
import type { SalesInvoiceState, SalesOrder } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

const orderHasSelection = (order: SalesOrder, state: SalesInvoiceState) =>
  state
    .getOrderLines(order)
    .some((line) => state.selectedLines[lineKey(order.DocEntry, line.LineNum)]);

export default function LinesStep({ state }: Props) {
  const selectedOrders = state.salesOrders.filter((order) => orderHasSelection(order, state));
  const selectedOrderCount = new Set(state.selectedLineList.map((line) => line.DocEntry)).size;
  const hasInvalidQty = state.selectedLineList.some(
    (line) => toNumber(line.invoiceQty) < 1 || toNumber(line.invoiceQty) > toNumber(line.OpenQty),
  );
  const canProceed =
    state.selectedLineList.length > 0 && !hasInvalidQty && !state.loadingDraftDetails;

  const clearOrder = (order: SalesOrder) => {
    state.getOrderLines(order).forEach((line) => {
      state.removeLine(lineKey(order.DocEntry, line.LineNum));
    });
  };

  const selectOrder = (order: SalesOrder) => {
    state.getOrderLines(order).forEach((line) => {
      if (
        !state.selectedLines[lineKey(order.DocEntry, line.LineNum)] &&
        toNumber(line.OpenQty) > 0
      ) {
        state.toggleLine(order, line);
      }
    });
  };

  return (
    <div className="space-y-4">
      {state.draftError && <Notice tone="bad">{state.draftError}</Notice>}

      {selectedOrders.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineDocumentText}
            title="No lines selected"
            hint="Go back to the orders step and tick at least one line."
            action={<Button onClick={() => state.setStep(2)}>Back to orders</Button>}
          />
        </Card>
      ) : (
        selectedOrders.map((order) => {
          const lines = state.getOrderLines(order);
          const selectedLines = lines.filter(
            (line) => state.selectedLines[lineKey(order.DocEntry, line.LineNum)],
          );
          const subtotal = selectedLines.reduce((sum, line) => {
            const selected = state.selectedLines[lineKey(order.DocEntry, line.LineNum)];
            return sum + toNumber(selected?.invoiceQty) * toNumber(selected?.Price);
          }, 0);

          return (
            <Card className="overflow-hidden p-0" key={order.DocEntry}>
              <CardHeader className="mb-0 flex-wrap border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <CardTitle>SO #{order.DocNum}</CardTitle>
                  <p className="m-0 mt-0.5 text-[11.5px] text-subtle">
                    DocEntry {order.DocEntry} · {formatDateDisplay(order.DocDate)} → Due{" "}
                    {formatDateDisplay(order.DocDueDate)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="xs" onClick={() => selectOrder(order)}>
                    Select all
                  </Button>
                  <Button size="xs" onClick={() => clearOrder(order)}>
                    Clear all
                  </Button>
                </div>
              </CardHeader>

              <div className="overflow-x-auto">
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" aria-label="Include" />
                      <TableHead>Item</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Whse / Tax</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="w-[110px]">Invoice qty</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const key = lineKey(order.DocEntry, line.LineNum);
                      const selected = state.selectedLines[key];
                      const checked = Boolean(selected);
                      const qty = toNumber(selected?.invoiceQty);
                      const price = toNumber(selected?.Price ?? line.Price);
                      const overOpen = checked && qty > toNumber(line.OpenQty);
                      const underOne = checked && qty < 1;

                      return (
                        <TableRow className={checked ? "bg-brand-soft" : ""} key={key}>
                          <TableCell>
                            <input
                              type="checkbox"
                              className="size-3.5 accent-brand"
                              checked={checked}
                              aria-label={
                                "Include " + (line.Dscription || line.ItemCode || "line")
                              }
                              onChange={() => state.toggleLine(order, line)}
                            />
                          </TableCell>
                          <TableCell>
                            <code className="font-mono text-[11.5px] text-subtle">
                              {line.ItemCode || "—"}
                            </code>
                          </TableCell>
                          <TableCell className="font-semibold text-ink">
                            {line.Dscription || "Unnamed SAP line"}
                          </TableCell>
                          <TableCell>
                            <span className="flex flex-wrap gap-1">
                              <Badge tone="neutral">{line.WhsCode || "—"}</Badge>
                              <Badge tone="neutral">
                                {line.TaxCode || line.VatGroup || "—"}
                              </Badge>
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{line.OpenQty}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(toNumber(line.Price))}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              max={line.OpenQty}
                              disabled={!checked}
                              value={checked ? qty : ""}
                              placeholder="—"
                              aria-label={
                                "Invoice qty for " + (line.Dscription || line.ItemCode || "line")
                              }
                              aria-invalid={overOpen || underOne || undefined}
                              onChange={(event) =>
                                state.updateLine(key, { invoiceQty: toNumber(event.target.value) })
                              }
                              className={
                                "h-control-sm text-right tabular-nums " +
                                (overOpen || underOne ? "border-bad" : "")
                              }
                              // The reason the Proceed button below is disabled,
                              // said on the field that causes it.
                              title={
                                overOpen
                                  ? "More than the open quantity of " + line.OpenQty
                                  : underOne
                                    ? "Must be at least 1"
                                    : undefined
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-ink">
                            {checked ? formatMoney(qty * price) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[12px]">
                <strong className="font-semibold tabular-nums text-ink">
                  Subtotal {formatMoney(subtotal)}
                </strong>
                <span className="text-subtle">
                  {selectedLines.length}/{lines.length} lines selected
                </span>
              </div>
            </Card>
          );
        })
      )}

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <strong className="block text-[13px] font-semibold text-ink">
            {state.selectedLineList.length} line{state.selectedLineList.length === 1 ? "" : "s"}{" "}
            across {selectedOrderCount} order{selectedOrderCount === 1 ? "" : "s"}
          </strong>
          <span className="text-[12px] tabular-nums text-subtle">
            Qty {state.totals.totalQty} · Taxable {formatMoney(state.totals.taxable)} · Tax{" "}
            {formatMoney(state.totals.tax)} · Grand total{" "}
            {formatMoney(state.totals.grandTotal)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => state.setStep(2)}>Back to orders</Button>
          <Button
            variant="primary"
            disabled={!canProceed}
            title={
              state.selectedLineList.length === 0
                ? "Select at least one line."
                : hasInvalidQty
                  ? "One or more invoice quantities are outside the open quantity."
                  : undefined
            }
            onClick={state.proceedToDraft}
          >
            {state.loadingDraftDetails ? "Loading draft…" : "Proceed to draft"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
