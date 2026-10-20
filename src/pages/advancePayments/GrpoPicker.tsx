/**
 * An Item bill's GRPO (user, 2026-10-20): the Expense module is the step after
 * the GRPO, and SAP books an item A/P invoice only by copying it from one.
 *
 * The vendor's open GRPOs are read from SAP, and the one whose vendor ref is
 * the bill number the requester typed is picked by itself. When none matches
 * — the bill number was typed differently on the GRPO, or the GRPO has none —
 * the Accounts desk picks one of the vendor's open GRPOs by hand.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "../../components/ui/badge";
import { Notice } from "../../components/ui/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapOpenGrpo,
} from "../../services/advancePaymentService";

import { expenseTotal, formatDate, formatINR, type RequestForm } from "./rules";

const money = (value: string) => formatINR(Number(value) || 0);

export function GrpoPicker({
  company,
  form,
  onChange,
}: {
  company: AdvancePaymentCompany | null;
  form: RequestForm;
  onChange: (patch: Partial<RequestForm>) => void;
}) {
  const query = useQuery({
    queryKey: ["advance-payments", "open-grpos", company, form.partner, form.expenseBillNumber],
    queryFn: () => advancePaymentService.openGrpos(company!, form.partner, form.expenseBillNumber),
    enabled: Boolean(company && form.partner),
    staleTime: 60_000,
    retry: 1,
  });
  const grpos = query.data ?? [];
  const matched = grpos.filter((g) => g.matches);
  const chosen = grpos.find((g) => String(g.doc_entry) === form.expenseGrpoEntry);

  const choose = (grpo: SapOpenGrpo) =>
    onChange({
      expenseGrpoEntry: String(grpo.doc_entry),
      expenseGrpoNum: String(grpo.doc_num),
      // The invoice is booked to the GRPO's branch unless one is chosen.
      ...(form.expenseBranch || grpo.bpl_id === null
        ? {}
        : { expenseBranch: String(grpo.bpl_id), expenseBranchName: grpo.bpl_name }),
    });

  // The one GRPO of this bill: picked by itself.
  const only = matched.length === 1 ? matched[0] : undefined;
  useEffect(() => {
    if (only && !form.expenseGrpoEntry) choose(only);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when it is found
  }, [only?.doc_entry, form.expenseGrpoEntry]);

  if (!form.partner) return null;
  if (query.isError) {
    return (
      <Notice tone="bad" title="Could not read the vendor's GRPOs from SAP">
        {advancePaymentError(query.error)}
      </Notice>
    );
  }
  if (query.isFetching && !grpos.length) {
    return <p className="m-0 text-[12.5px] text-subtle">Reading the vendor's open GRPOs in SAP…</p>;
  }
  if (!grpos.length) {
    return (
      <Notice tone="bad" title="No open GRPO">
        {form.payee || form.partner} has no open GRPO in SAP. An Item bill is booked by copying its GRPO: ask
        the store to post the GRPO, or set the Category to Service.
      </Notice>
    );
  }

  // Bill-number matches first; with none, every open GRPO, to pick by hand.
  const shown = matched.length ? matched : grpos;
  const total = expenseTotal(form.expenseLines);
  return (
    <div className="space-y-3" data-slot="grpo-picker">
      {matched.length ? null : (
        <Notice tone="hold" title="No GRPO matches the bill number">
          No open GRPO of this vendor has vendor ref “{form.expenseBillNumber || "—"}”. Choose the GRPO this bill
          is for from the vendor's open GRPOs below.
        </Notice>
      )}
      <Table density="compact" aria-label="Open GRPOs">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">Choose</span>
            </TableHead>
            <TableHead>GRPO</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Vendor Ref</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead className="text-right">Open amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((g) => (
            <TableRow key={g.doc_entry} data-state={chosen?.doc_entry === g.doc_entry ? "selected" : undefined}>
              <TableCell>
                <input
                  type="radio"
                  name="expense-grpo"
                  className="size-4 accent-brand"
                  aria-label={`GRPO ${g.doc_num}`}
                  checked={chosen?.doc_entry === g.doc_entry}
                  onChange={() => choose(g)}
                />
              </TableCell>
              <TableCell className="tabular-nums">
                {g.doc_num} {g.matches ? <Badge tone="ok">Bill number matches</Badge> : null}
              </TableCell>
              <TableCell>{g.doc_date ? formatDate(g.doc_date) : "—"}</TableCell>
              <TableCell>{g.vendor_ref || "—"}</TableCell>
              <TableCell>{g.bpl_name || "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{money(g.open_amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {form.expenseGrpoEntry && !chosen && !query.isFetching ? (
        <Notice tone="bad" title={`GRPO ${form.expenseGrpoNum || form.expenseGrpoEntry} is no longer open`}>
          It has been invoiced, closed or cancelled in SAP since it was chosen. Choose another.
        </Notice>
      ) : null}

      {chosen ? (
        <div className="space-y-2" data-slot="grpo-lines">
          <p className="m-0 text-[12.5px] text-body">
            The A/P invoice copies GRPO <span className="font-semibold text-ink">{chosen.doc_num}</span>'s open lines
            — item, quantity, price, tax and warehouse — from SAP.
          </p>
          <Table density="compact" aria-label={`GRPO ${chosen.doc_num} lines`}>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Open qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead className="text-right">Open amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chosen.lines.map((ln) => (
                <TableRow key={ln.line_num}>
                  <TableCell>{ln.item_code || "—"}</TableCell>
                  <TableCell>{ln.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(ln.open_qty)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(ln.price)}</TableCell>
                  <TableCell>{ln.tax_code || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(ln.open_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {Math.abs((Number(chosen.open_amount) || 0) - total) >= 1 ? (
            <Notice tone="hold" title="The amounts differ">
              GRPO {chosen.doc_num}'s open lines come to {money(chosen.open_amount)} before tax; the request is for{" "}
              {formatINR(total)}. Check it against the bill.
            </Notice>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
