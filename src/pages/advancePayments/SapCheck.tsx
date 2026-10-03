/**
 * The request's documents against SAP as it is NOW — the check Final makes
 * before it posts. From Payment on, so a PO amended, a bill part-paid outside
 * OMS, or a document closed or cancelled since the request was raised is
 * fixed at Payment (or sent back to the creator), not discovered at Final.
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
import { advancePaymentError, advancePaymentService } from "../../services/advancePaymentService";

import { formatINR } from "./rules";

const money = (value: string) => formatINR(Number(value));
const STATUS = { OPEN: "Open", CLOSED: "Closed", CANCELLED: "Cancelled", GONE: "Not in SAP" } as const;

export function SapCheck({ requestId }: { requestId: number }) {
  const query = useQuery({
    queryKey: ["advance-payments", "sap-check", requestId],
    queryFn: () => advancePaymentService.sapCheck(requestId),
    staleTime: 30_000,
    retry: 1,
  });

  if (query.data && query.data.results.length === 0) return null;

  return (
    <Card className="p-4 md:p-5" aria-label="Checked against SAP now">
      <CardHeader>
        <CardTitle>Checked Against SAP Now</CardTitle>
        {query.data ? (
          <Badge tone={query.data.ok ? (query.data.changed ? "hold" : "ok") : "bad"}>
            {query.data.ok ? (query.data.changed ? "Changed, still fits" : "Unchanged") : "Does not fit any more"}
          </Badge>
        ) : null}
      </CardHeader>
      {query.isPending ? <p className="m-0 text-[13px] text-subtle">Reading the documents from SAP…</p> : null}
      {query.isError ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {advancePaymentError(query.error)}
        </p>
      ) : null}
      {query.data ? (
        <>
          {!query.data.ok ? (
            <p role="alert" className="m-0 mb-3 text-[13px] text-danger">
              SAP has changed since this request was raised, and Final cannot post it as it is. Correct the
              payment, or return it to the creator.
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Document</TableHead>
                  <TableHead>In SAP</TableHead>
                  <TableHead className="text-right">Open When Raised</TableHead>
                  <TableHead className="text-right">Open Now</TableHead>
                  <TableHead className="text-right">Held by Other Requests</TableHead>
                  <TableHead className="text-right">Left for This</TableHead>
                  <TableHead className="text-right">This Request Pays</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.results.map((row) => (
                  <TableRow key={row.document_id} data-ok={row.ok ? "true" : "false"}>
                    <TableCell className="font-medium text-ink">
                      {row.sap_doc_num || row.sap_doc_entry}
                      {row.message ? (
                        <span className="block text-[11.5px] font-normal text-danger">{row.message}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge tone={row.status === "OPEN" ? "ok" : "bad"}>{STATUS[row.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.open_when_raised)}</TableCell>
                    <TableCell className={row.changed ? "text-right font-semibold tabular-nums text-hold" : "text-right tabular-nums"}>
                      {money(row.open_now)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.held_by_others)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.available_now)}</TableCell>
                    <TableCell className={row.ok ? "text-right tabular-nums" : "text-right font-semibold tabular-nums text-danger"}>
                      {money(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </Card>
  );
}
