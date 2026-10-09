/**
 * A PO as SAP holds it — header, every line, what was made from it, and its
 * attachments — read live from SAP. For the approvers from the Payment stage
 * on, beside the request's own PO lines: what the payment is weighed against.
 */
import { useQuery } from "@tanstack/react-query";

import { Badge } from "../../components/ui/badge";
import { DetailField, DetailGrid } from "../../components/ui/detail";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
} from "../../services/advancePaymentService";

import type { AdvanceRequestEntry } from "./approvalData";
import { CollapsibleCard } from "./CollapsibleCard";
import { SapAttachmentList } from "./SapAttachmentLink";
import { sapDocumentOf } from "./sapMapping";
import { formatDate, formatINR } from "./rules";

const money = (value: string | null | undefined) => formatINR(Number(value ?? 0));
const quantity = (value: string | null | undefined) =>
  value === null || value === undefined ? "—" : Number(value).toLocaleString("en-IN");
const percent = (value: string | null | undefined) => (value && Number(value) ? `${Number(value)}%` : "—");
const statusTone = (status: string) => (status === "Open" ? "info" : status === "Cancelled" ? "bad" : "neutral");

function OnePurchaseOrder({
  company,
  docEntry,
  number,
}: {
  company: AdvancePaymentCompany;
  docEntry: number;
  number: string;
}) {
  const query = useQuery({
    queryKey: ["advance-payments", "purchase-order", company, docEntry],
    queryFn: () => advancePaymentService.purchaseOrder(company, docEntry),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Closed until clicked, like the ledger: its status on the closed line.
  return (
    <CollapsibleCard
      title={`Purchase Order ${number} in SAP`}
      label={`Purchase order ${number} in SAP`}
      summary={query.data ? query.data.header.status : query.isPending ? "Reading from SAP…" : undefined}
    >

      {query.isPending ? <p className="m-0 text-[13px] text-subtle">Reading the purchase order from SAP…</p> : null}
      {query.isError ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {advancePaymentError(query.error)}
        </p>
      ) : null}

      {query.data ? (
        <div className="flex flex-col gap-5">
          <DetailGrid>
            <DetailField label="PO Number" value={query.data.header.doc_num ?? docEntry} strong />
            <DetailField label="Vendor" value={`${query.data.header.card_name} (${query.data.header.card_code})`} />
            <DetailField label="Vendor Ref." value={query.data.header.vendor_ref} />
            <DetailField label="Posting Date" value={formatDate(query.data.header.doc_date ?? "")} />
            <DetailField label="Delivery Date" value={formatDate(query.data.header.delivery_date ?? "")} />
            <DetailField label="Document Date" value={formatDate(query.data.header.document_date ?? "")} />
            <DetailField label="Branch" value={query.data.header.branch} />
            <DetailField label="Payment Terms" value={query.data.header.payment_terms} />
            <DetailField label="Buyer" value={query.data.header.buyer} />
            <DetailField label="Owner" value={query.data.header.owner} />
            <DetailField label="Created By" value={query.data.header.created_by} />
            <DetailField label="Created On" value={formatDate(query.data.header.created_on ?? "")} />
            <DetailField
              label="Currency"
              value={
                query.data.header.currency && query.data.header.currency !== "INR"
                  ? `${query.data.header.currency} @ ${query.data.header.rate}`
                  : query.data.header.currency
              }
            />
            <DetailField label="Discount" value={`${money(query.data.header.discount)} (${percent(query.data.header.discount_percent)})`} />
            <DetailField label="Freight" value={money(query.data.header.freight)} />
            <DetailField label="Tax" value={money(query.data.header.tax)} />
            <DetailField label="TDS" value={money(query.data.header.tds)} />
            <DetailField label="Rounding" value={money(query.data.header.rounding)} />
            <DetailField label="Document Total" value={money(query.data.header.doc_total)} strong />
            <DetailField label="Received / Paid to Date" value={money(query.data.header.paid_to_date)} />
            <DetailField label="Down Payment" value={money(query.data.header.down_payment)} />
            <DetailField label="Pay To" span="full" value={<span className="whitespace-pre-line">{query.data.header.pay_to}</span>} />
            <DetailField label="Ship To" span="full" value={<span className="whitespace-pre-line">{query.data.header.ship_to}</span>} />
            <DetailField label="Remarks" span="full" value={query.data.header.remarks} />
            <DetailField label="Journal Remark" span="full" value={query.data.header.journal_memo} />
          </DetailGrid>

          <div className="min-w-0">
            <h3 className="m-0 mb-2 text-[13px] font-semibold text-ink">Lines ({query.data.lines.length})</h3>
            <div className="overflow-x-auto">
              <Table aria-label={`Lines of purchase order ${number}`}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Open Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Disc.</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.lines.map((line) => (
                    <TableRow key={line.line}>
                      <TableCell className="tabular-nums">{line.line + 1}</TableCell>
                      <TableCell>
                        <span className="block font-medium text-ink">{line.description || line.item_code}</span>
                        <span className="block text-[11px] text-subtle">
                          {[line.item_code, line.account && `G/L ${line.account}`].filter(Boolean).join(" · ")}
                        </span>
                        {line.note ? <span className="block text-[11px] text-subtle">{line.note}</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {quantity(line.quantity)} {line.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{quantity(line.open_quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(line.price)}</TableCell>
                      <TableCell className="text-right tabular-nums">{percent(line.discount_percent)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(line.line_total)}</TableCell>
                      <TableCell>
                        {line.tax_code || "—"}
                        {line.tax && Number(line.tax) ? (
                          <span className="block text-[11px] text-subtle">{money(line.tax)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-ink">
                        {money(line.gross_total)}
                      </TableCell>
                      <TableCell>{line.warehouse || "—"}</TableCell>
                      <TableCell>{line.delivery_date ? formatDate(line.delivery_date) : "—"}</TableCell>
                      <TableCell>{[line.budget, line.sub_budget].filter(Boolean).join(" / ") || "—"}</TableCell>
                      <TableCell>{line.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="m-0 mb-2 text-[13px] font-semibold text-ink">
              Made From It ({query.data.follow_on.length})
            </h3>
            {query.data.follow_on.length ? (
              <Table aria-label={`Documents made from purchase order ${number}`}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Document</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor Ref.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.follow_on.map((doc) => (
                    <TableRow key={`${doc.kind}-${doc.doc_entry}`}>
                      <TableCell>{doc.kind_label}</TableCell>
                      <TableCell className="font-medium text-ink">{doc.doc_num ?? doc.doc_entry}</TableCell>
                      <TableCell>{doc.doc_date ? formatDate(doc.doc_date) : "—"}</TableCell>
                      <TableCell>{doc.vendor_ref || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(doc.doc_total)}</TableCell>
                      <TableCell>
                        <Badge tone={statusTone(doc.status)}>{doc.status || "—"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="m-0 text-[13px] text-subtle">No goods receipt or invoice has been made from it yet.</p>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="m-0 mb-2 text-[13px] font-semibold text-ink">SAP Attachments</h3>
            <SapAttachmentList company={company} kind="po" docEntry={docEntry} />
          </div>
        </div>
      ) : null}
    </CollapsibleCard>
  );
}

/** Every PO a request pays, in full from SAP. Nothing for a request without POs. */
export function PurchaseOrderDetails({ entry }: { entry: AdvanceRequestEntry }) {
  const pos = entry.form.selected
    .map((doc) => ({ doc, source: sapDocumentOf(doc, entry.form.company) }))
    .filter(({ source }) => source?.kind === "po");
  if (!pos.length) return null;
  return (
    <>
      {pos.map(({ doc, source }) => (
        <OnePurchaseOrder key={doc.id} company={source!.company} docEntry={source!.docEntry} number={doc.number} />
      ))}
    </>
  );
}
