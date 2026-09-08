/**
 * The running total beside the order picker — what the invoice currently
 * amounts to, and the button that takes it to review.
 */
import { HiOutlineDocumentText } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, EmptyState, Notice } from "@/components/ui/page";
import { formatMoney, lineKey } from "./salesInvoice.utils";
import type { SalesInvoiceState } from "./useSalesInvoice";

type Props = {
  state: SalesInvoiceState;
};

export default function InvoiceDraftPanel({ state }: Props) {
  const selectedOrderCount = new Set(state.selectedLineList.map((line) => line.DocEntry)).size;
  const nothingSelected = state.selectedLineList.length === 0;

  return (
    <Card className="lg:sticky lg:top-4">
      <CardHeader className="mb-3 flex-col items-start gap-0">
        <CardTitle>Invoice draft</CardTitle>
        <p className="m-0 text-[12px] text-subtle">
          {state.selectedLineList.length} line{state.selectedLineList.length === 1 ? "" : "s"} from{" "}
          {selectedOrderCount} order{selectedOrderCount === 1 ? "" : "s"}
        </p>
      </CardHeader>

      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1.5 border-y border-line py-3 text-[13px]">
        <dt className="text-subtle">Total qty</dt>
        <dd className="m-0 text-right tabular-nums text-ink">{state.totals.totalQty}</dd>
        <dt className="text-subtle">Taxable</dt>
        <dd className="m-0 text-right tabular-nums text-ink">
          {formatMoney(state.totals.taxable)}
        </dd>
        <dt className="text-subtle">Tax</dt>
        <dd className="m-0 text-right tabular-nums text-ink">{formatMoney(state.totals.tax)}</dd>
        <dt className="font-semibold text-ink">Grand total</dt>
        <dd className="m-0 text-right text-[15px] font-bold tabular-nums text-ink">
          {formatMoney(state.totals.grandTotal)}
        </dd>
      </dl>

      <div className="my-3 max-h-[280px] overflow-y-auto">
        {nothingSelected ? (
          <EmptyState
            icon={HiOutlineDocumentText}
            title="Nothing selected yet"
            hint="Lines you tick on the left appear here."
          />
        ) : (
          <ul className="m-0 list-none space-y-1.5 p-0">
            {state.selectedLineList.map((line) => (
              <li
                className="rounded-sm border border-line bg-surface px-2.5 py-2 text-[12px]"
                key={lineKey(line.DocEntry, line.LineNum)}
              >
                <span className="block font-semibold text-ink">
                  SO #{line.DocNum} — {line.Dscription}
                </span>
                <span className="block tabular-nums text-subtle">
                  {line.invoiceQty} × {formatMoney(line.Price)} ={" "}
                  {formatMoney(line.invoiceQty * line.Price)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.draftError && (
        <Notice tone="bad" className="mb-3">
          {state.draftError}
        </Notice>
      )}

      <Button
        variant="primary"
        className="w-full"
        disabled={nothingSelected || state.loadingDraftDetails}
        title={nothingSelected ? "Tick at least one order line first." : undefined}
        onClick={state.createInvoiceDraft}
      >
        {state.loadingDraftDetails ? "Loading…" : "Review selected lines"}
      </Button>

      {/*
        The raw payload, for support. A `<details>` rather than a dialog: it is
        read perhaps twice a year, by someone already looking at the screen and
        reading it out over the phone.
      */}
      <details className="mt-3 text-[12px]">
        <summary className="cursor-pointer text-subtle hover:text-ink">Draft payload</summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-sm border border-line bg-surface p-2 font-mono text-[11px] text-body">
          {JSON.stringify(state.payload, null, 2)}
        </pre>
      </details>
    </Card>
  );
}
