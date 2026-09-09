/**
 * Everything about one tracker invoice, read-only — the row-click view.
 *
 * Entry and Queue each had one: Entry's a flat 20-row grid with the stage
 * events as a table and the payment underneath, Queue's grouped into six
 * sections with no events at all. This is the union, grouped: a reader looks
 * for "the amounts" or "who has it now", not row 14 of 20.
 */
import { HiOutlineMapPin } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionHeading } from "@/components/ui/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Invoice } from "@/services/trackerService";

import { decisionTone, fmtDT, fmtDate, fmtMonth, money } from "./format";

type Row = [string, React.ReactNode];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="space-y-2.5">
      <SectionHeading>{title}</SectionHeading>
      <DetailGrid>
        {rows.map(([label, value]) => (
          <DetailField key={label} label={label} value={value} />
        ))}
      </DetailGrid>
    </section>
  );
}

export default function InvoiceDetailDialog({
  invoice,
  loading = false,
  onClose,
  onTimeline,
}: {
  invoice: Invoice | null;
  /** The row was shown at once and the full record is still arriving. */
  loading?: boolean;
  onClose: () => void;
  /** Offered as a footer action when given. */
  onTimeline?: (invoice: Invoice) => void;
}) {
  const inv = invoice;
  return (
    <Dialog open={Boolean(inv)} onOpenChange={(next) => !next && onClose()}>
      {inv && (
        <DialogContent title="Invoice detail" size="lg">
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {inv.invoice_number}
                <Badge tone="info" outlined>
                  {inv.current_stage_name}
                </Badge>
                {inv.status === "COMPLETED" ? (
                  <Badge tone="ok" outlined>
                    Completed
                  </Badge>
                ) : null}
              </DialogTitle>
              <DialogDescription>
                {inv.party_name}
                {loading ? " · loading…" : ""}
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-6">
            <Section
              title="Invoice"
              rows={[
                ["Invoice No.", inv.invoice_number],
                ["Invoice date", fmtDate(inv.invoice_date)],
                ["Effective month", fmtMonth(inv.effective_month)],
                ["Mode", inv.mode_name],
                ["Status", inv.status === "COMPLETED" ? "Completed" : "In progress"],
              ]}
            />
            <Section
              title="Party"
              rows={[
                ["Party name", inv.party_name],
                ["Party code", inv.party_code],
                ["Party GSTIN", inv.party_gstin],
              ]}
            />
            <Section
              title="Amounts"
              rows={[
                ["Taxable value", `₹${money(inv.taxable_value)}`],
                ["GST type", inv.gst_type_name],
                ["GST rate", inv.gst_rate_label],
                ["GST amount", `₹${money(inv.gst_amount)}`],
                [
                  "Additional charge",
                  inv.additional_charge_type
                    ? `${inv.additional_charge_type_display ?? inv.additional_charge_type} — ₹${money(inv.additional_charge_amount)}`
                    : "None",
                ],
                ["Invoice value", `₹${money(inv.invoice_value)}`],
                ...(Number(inv.debit_amount) > 0
                  ? ([
                      ["Debit (pre-audit)", `− ₹${money(inv.debit_amount)}`],
                      ["Net value", `₹${money(inv.net_invoice_value)}`],
                    ] as Row[])
                  : []),
                ...(Number(inv.hold_amount) > 0
                  ? ([["Hold amount", `₹${money(inv.hold_amount)}`]] as Row[])
                  : []),
              ]}
            />
            <Section
              title="Classification"
              rows={[
                ["Category", inv.category_name],
                ["Unit", inv.unit_name],
                ["Branch", inv.branch_name],
              ]}
            />
            <Section
              title="Workflow"
              rows={[
                ["Current stage", inv.current_stage_name],
                ["Entered stage", fmtDT(inv.current_stage_entered_at)],
                [
                  "Days at stage",
                  <span key="days" className={inv.is_overdue ? "font-semibold text-bad" : undefined}>
                    {inv.days_at_stage}
                    {inv.is_overdue ? " · overdue" : ""}
                  </span>,
                ],
                ...(inv.arrived_via_return
                  ? ([
                      [
                        "Returned by",
                        `${inv.returned_from || "—"}${inv.returned_by ? ` (${inv.returned_by})` : ""}`,
                      ],
                      ["Return reason", inv.return_reason],
                    ] as Row[])
                  : []),
              ]}
            />
            <Section
              title="Audit"
              rows={[
                ["Created by", inv.created_by_name],
                ["Created on", fmtDT(inv.created_at)],
                ["Last updated", fmtDT(inv.updated_at)],
              ]}
            />

            {inv.events && inv.events.length > 0 && (
              <section className="space-y-2.5">
                <SectionHeading>Stage events</SectionHeading>
                <div className="overflow-x-auto rounded-md border border-line">
                  <Table density="compact">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Stage</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>By</TableHead>
                        <TableHead>Entered</TableHead>
                        <TableHead>Exited</TableHead>
                        <TableHead className="text-right">Days</TableHead>
                        <TableHead>Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inv.events.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="font-medium text-ink">{ev.stage_name}</TableCell>
                          <TableCell>{ev.event_type}</TableCell>
                          <TableCell>
                            {ev.stage_status ? (
                              <Badge tone={decisionTone(ev.stage_status)} outlined>
                                {ev.stage_status.replace(/_/g, " ")}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>{ev.acted_by_name || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(ev.entered_at)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {ev.exited_at ? fmtDate(ev.exited_at) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{ev.days_spent ?? "—"}</TableCell>
                          <TableCell className="max-w-[260px] whitespace-normal">
                            {ev.remarks || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}

            {inv.payment && (
              <Section
                title="Payment"
                rows={[
                  ["Discount", `₹${money(inv.payment.discount_amount)}`],
                  ["TDS", `₹${money(inv.payment.tds_amount)}`],
                  ["Paid", `₹${money(inv.payment.paid_amount)}`],
                  ["Open balance", `₹${money(inv.payment.open_balance)}`],
                  [
                    "Status",
                    <Badge key="st" tone={inv.payment.status === "PAID" ? "ok" : "hold"} outlined>
                      {inv.payment.status}
                    </Badge>,
                  ],
                ]}
              />
            )}
          </DialogBody>

          <DialogFooter>
            {onTimeline ? (
              <Button variant="ghost" className="mr-auto" onClick={() => onTimeline(inv)}>
                <HiOutlineMapPin aria-hidden="true" /> View timeline
              </Button>
            ) : null}
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
