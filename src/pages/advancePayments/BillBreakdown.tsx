/**
 * One A/P invoice as SAP booked it: taxable, GST, TDS and net, each line's
 * G/L account, and the GST, TDS and payable accounts
 * (`GET /advance-payments/bill-breakdown/`).
 *
 * For the desk from the Payment stage on — what a payment against the bill is
 * checked against. Closed until opened, and only read from SAP then: a request
 * may pay many bills, and each is three queries.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { HiChevronRight } from "react-icons/hi2";

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

import { formatINR } from "./rules";

const money = (value: string | null | undefined) => formatINR(Number(value ?? 0) || 0);
const account = (code: string, name: string) => (code ? (name ? `${code} · ${name}` : code) : "—");
const rate = (value: string) => `${Number(value) || 0}%`;

function Breakdown({ company, docEntry }: { company: AdvancePaymentCompany; docEntry: number }) {
  const query = useQuery({
    queryKey: ["advance-payments", "bill-breakdown", company, docEntry],
    queryFn: () => advancePaymentService.billBreakdown(company, docEntry),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  if (query.isPending) return <p className="m-0 text-[13px] text-subtle">Reading the bill from SAP…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="m-0 text-[13px] text-danger">
        {advancePaymentError(query.error)}
      </p>
    );
  }
  const { header: h, lines, gst, tds } = query.data;
  const extras = Number(h.freight) || Number(h.discount) || Number(h.rounding);

  return (
    <div className="flex flex-col gap-3">
      <DetailGrid>
        <DetailField label="Taxable" value={money(h.taxable)} />
        <DetailField label="GST" value={money(h.gst)} />
        <DetailField label="Invoice Total" value={money(h.gross)} />
        <DetailField label="TDS" value={Number(h.tds) ? `− ${money(h.tds)}` : "None"} />
        <DetailField label="Net Payable" value={money(h.net)} strong />
        <DetailField label="Paid / Balance" value={`${money(h.paid)} / ${money(h.balance)}`} />
        {extras ? (
          <DetailField
            label="Freight · Discount · Rounding"
            value={`${money(h.freight)} · ${money(h.discount)} · ${money(h.rounding)}`}
          />
        ) : null}
        <DetailField label="Payable Account" value={account(h.payable_account, h.payable_account_name)} />
      </DetailGrid>

      <Table aria-label={`G/L lines of bill ${h.doc_num ?? h.doc_entry}`}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Line</TableHead>
            <TableHead>G/L Account</TableHead>
            <TableHead>Tax Code</TableHead>
            <TableHead className="text-right">Taxable</TableHead>
            <TableHead className="text-right">GST</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.line}>
              <TableCell>{l.description || l.item_code || `Line ${l.line + 1}`}</TableCell>
              <TableCell>{account(l.account, l.account_name)}</TableCell>
              <TableCell>{l.tax_code || "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{money(l.taxable)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(l.gst)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {gst.length || tds.length ? (
        <Table aria-label={`Taxes on bill ${h.doc_num ?? h.doc_entry}`}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Tax</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">On</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gst.map((g) => (
              <TableRow key={`gst-${g.code}-${g.account}`}>
                <TableCell>{g.code}</TableCell>
                <TableCell>{account(g.account, g.account_name)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(g.base)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(g.amount)}</TableCell>
              </TableRow>
            ))}
            {tds.map((t) => (
              <TableRow key={`tds-${t.code}`}>
                <TableCell>
                  TDS {t.code} @ {rate(t.rate)}
                  {t.name ? <span className="block text-[11px] text-subtle">{t.name}</span> : null}
                </TableCell>
                <TableCell>{account(t.account, t.account_name)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(t.taxable)}</TableCell>
                <TableCell className="text-right tabular-nums">− {money(t.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

/** A bill's breakdown behind a click; nothing is read from SAP until it is opened. */
export function BillBreakdown({
  company,
  docEntry,
  label,
}: {
  company: AdvancePaymentCompany;
  docEntry: number;
  label: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <details className="group" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
        <HiChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
        {label}
      </summary>
      <div className="mt-2">{open ? <Breakdown company={company} docEntry={docEntry} /> : null}</div>
    </details>
  );
}
