/**
 * "Assigned to Me": SAP bills and POs sent to this user (from the "Send
 * Bills & POs" page) to raise a payment request from. Raising one re-reads
 * the document live from SAP and opens the request form filled from it.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { advancePaymentError, advancePaymentService, type ApiAssignment } from "../../services/advancePaymentService";

import { formFromAssignment, useAssignedToMe } from "./assignments";
import { formatDate, formatINR, type RequestForm } from "./rules";
import { formatDateTime } from "./requestLabels";

export function AssignedToMe({
  onRaise,
}: {
  /** Open the request form filled from the document. */
  onRaise: (form: RequestForm, assignment: ApiAssignment) => void;
}) {
  const client = useQueryClient();
  const assigned = useAssignedToMe();
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState("");
  const dismiss = useMutation({
    mutationFn: (id: number) => advancePaymentService.assignmentAction(id, "dismiss"),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["advance-payments", "assignments"] }),
    onError: (err) => setError(advancePaymentError(err)),
  });

  const raise = async (a: ApiAssignment) => {
    setOpening(a.id);
    setError("");
    try {
      onRaise(await formFromAssignment(a), a);
    } catch (err) {
      setError(err instanceof Error && !("response" in err) ? err.message : advancePaymentError(err));
    } finally {
      setOpening(null);
    }
  };

  const rows = assigned.data ?? [];
  return (
    <div className="space-y-3">
      {assigned.isError ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {advancePaymentError(assigned.error)}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <Table aria-label="Assigned to me">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Document</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Open When Sent</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-6 text-center text-subtle">
                  {assigned.isLoading ? "Loading…" : "Nothing has been sent to you."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium text-ink">
                    {a.kind === "BILL" ? "Bill" : "PO"} {a.sap_doc_num}
                    <span className="block text-[11px] text-subtle">
                      {a.company}
                      {a.vendor_ref ? ` · Ref ${a.vendor_ref}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    {a.card_name}
                    <span className="block text-[11px] text-subtle">{a.card_code}</span>
                  </TableCell>
                  <TableCell>{a.due_date ? formatDate(a.due_date) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(Number(a.open_amount))}</TableCell>
                  <TableCell>
                    {a.assigned_by.name}
                    <span className="block text-[11px] text-subtle">{formatDateTime(a.created_on)}</span>
                  </TableCell>
                  <TableCell className="max-w-[16rem] whitespace-pre-line text-[12.5px]">{a.note || "—"}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex gap-2">
                      <Button size="xs" onClick={() => void raise(a)} disabled={opening !== null}>
                        {opening === a.id ? "Opening…" : "Raise Request"}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => dismiss.mutate(a.id)}
                        disabled={dismiss.isPending}
                      >
                        Dismiss
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
