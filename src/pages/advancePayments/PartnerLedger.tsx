/**
 * The payee's open ledger in SAP: every open item against them (bills,
 * credit memos, payments on account, journals), read from the journal lines
 * as SAP's own ageing report reads them (`GET /advance-payments/open-documents/`).
 *
 * Shown on the approval desk from the Payment stage on, beside the current
 * balance (`requestLabels.showsBalance`): it is what a payment is weighed
 * against, and it is not shown to the requester.
 */
import { useQuery } from "@tanstack/react-query";

import { Badge } from "../../components/ui/badge";
import { Card, CardHeader, CardTitle } from "../../components/ui/page";
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
import { formatDate, formatINR } from "./rules";

const money = (value: string | null | undefined) => Number(value ?? 0) || 0;

export function PartnerLedger({ entry }: { entry: AdvanceRequestEntry }) {
  const company = entry.form.company as AdvancePaymentCompany;
  const cardCode = entry.form.partner;
  const query = useQuery({
    queryKey: ["advance-payments", "partner-ledger", company, cardCode],
    queryFn: () => advancePaymentService.partnerLedger(company, cardCode),
    staleTime: 60_000,
    retry: 1,
  });
  const rows = query.data?.results ?? [];
  const summary = query.data?.summary;

  return (
    <Card className="p-4 md:p-5">
      <CardHeader>
        <CardTitle>Ledger in SAP ({entry.form.partnerName})</CardTitle>
        {summary ? (
          <span className="text-[12px] text-subtle">
            {summary.open_count} open · Dr {formatINR(money(summary.open_debit))} · Cr{" "}
            {formatINR(money(summary.open_credit))}
            {summary.overdue_count ? ` · ${summary.overdue_count} overdue` : ""}
          </span>
        ) : null}
      </CardHeader>
      {query.isError ? (
        <p className="m-0 text-[13px] text-bad">{advancePaymentError(query.error)}</p>
      ) : query.isLoading ? (
        <p className="m-0 text-[13px] text-subtle">Reading the ledger from SAP…</p>
      ) : rows.length === 0 ? (
        <p className="m-0 text-[13px] text-subtle">Nothing open in SAP.</p>
      ) : (
        <Table aria-label="Open ledger items">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Document</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const overdue = (row.days_overdue ?? 0) > 0;
              const open = formatINR(money(row.open_amount));
              return (
                <TableRow
                  key={`${row.trans_id}-${row.doc_type_code}-${row.doc_num}`}
                  className={overdue ? "bg-bad-soft/40" : undefined}
                >
                  <TableCell>
                    <span className="font-semibold text-ink">
                      {row.doc_type} {row.doc_num}
                    </span>
                    {row.party_ref ? (
                      <span className="block text-[11px] text-subtle">Ref {row.party_ref}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.posting_date ? formatDate(row.posting_date) : "—"}</TableCell>
                  <TableCell>
                    {row.due_date ? formatDate(row.due_date) : "—"}
                    {overdue ? (
                      <span className="ml-1.5 align-middle">
                        <Badge tone="bad">{row.days_overdue} days overdue</Badge>
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.direction === "DEBIT" ? open : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.direction === "CREDIT" ? open : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
