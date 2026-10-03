/**
 * What OMS has paid and reserved against one SAP document: every request
 * that touched it, what each paid, and what was open when it was raised.
 * Read from OMS (`/document-history/`), not SAP.
 */
import { useQuery } from "@tanstack/react-query";

import { Badge } from "../../components/ui/badge";
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
} from "../../services/advancePaymentService";

import { formatINR } from "./rules";
import type { HistoryTarget } from "./sapMapping";
import { formatDateTime } from "./requestLabels";

const EFFECT = {
  RESERVED: { tone: "hold", label: "Reserved" },
  PAID: { tone: "ok", label: "Paid" },
  RELEASED: { tone: "neutral", label: "Released" },
} as const;

const money = (value: string) => formatINR(Number(value));

export function DocumentHistory({ target }: { target: HistoryTarget }) {
  const query = useQuery({
    queryKey: ["advance-payments", "document-history", target.company, target.kind, target.docEntry, target.line],
    queryFn: () =>
      advancePaymentService.documentHistory(target.company, target.kind, target.docEntry, target.line),
    staleTime: 30_000,
    retry: 1,
  });

  if (query.isPending) return <span className="text-[12px] text-subtle">Reading OMS's payments…</span>;
  if (query.isError) {
    return (
      <span role="alert" className="text-[12px] text-danger">
        {advancePaymentError(query.error)}
      </span>
    );
  }
  const { summary, results } = query.data;
  if (!results.length) return <span className="text-subtle">No OMS payment against it yet.</span>;

  return (
    <div className="flex min-w-0 flex-col gap-2" aria-label="OMS payment history">
      <span className="text-[12px] text-body">
        Paid via OMS <strong className="tabular-nums">{money(summary.paid)}</strong> · Reserved{" "}
        <strong className="tabular-nums">{money(summary.reserved)}</strong> · {summary.requests}{" "}
        {summary.requests === 1 ? "request" : "requests"}
      </span>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Request</TableHead>
              <TableHead>Effect</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Open Then</TableHead>
              <TableHead>Raised</TableHead>
              <TableHead>SAP Payment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((row) => (
              <TableRow key={row.request_id}>
                <TableCell className="font-medium text-ink">{row.request_no}</TableCell>
                <TableCell>
                  <Badge tone={EFFECT[row.effect].tone}>{EFFECT[row.effect].label}</Badge>
                  {row.unadjusted !== null ? (
                    <span className="block text-[11px] text-subtle">
                      {Number(row.unadjusted) > 0
                        ? `${money(row.unadjusted)} still on account`
                        : "Set off against a bill"}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(row.amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(row.open_amount)}</TableCell>
                <TableCell>
                  {row.raised_on ? formatDateTime(row.raised_on) : "—"}
                  {row.raised_by ? <span className="block text-[11px] text-subtle">{row.raised_by}</span> : null}
                </TableCell>
                <TableCell>{row.sap_payment ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
