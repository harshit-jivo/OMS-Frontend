/**
 * Pay only some of a request's bills (user, 2026-10-22): at the Payment or
 * Audit desk, untick the bills, POs or journal entries not to be paid now.
 * They are taken off the request and freed to be raised again, the amount
 * becomes what the ticked ones pay, and the creator is told why.
 */
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Checkbox, Field, Textarea } from "../../components/ui/form";
import { Card, CardHeader, CardTitle } from "../../components/ui/page";
import type { ApiRequestDocument } from "../../services/advancePaymentService";

import { formatINR } from "./rules";

const KIND_LABEL: Record<ApiRequestDocument["kind"], string> = { BILL: "Bill", PO: "PO", LEDGER: "Journal / ledger" };

function signed(doc: ApiRequestDocument): number {
  const amount = Number(doc.amount) || 0;
  return doc.direction === "DEBIT" ? -amount : amount;
}

export function KeepDocuments({
  documents,
  busy,
  onKeep,
}: {
  documents: ApiRequestDocument[];
  busy: boolean;
  onKeep: (keep: number[], remarks: string) => void;
}) {
  const withIds = documents.filter((d): d is ApiRequestDocument & { id: number } => typeof d.id === "number");
  const [kept, setKept] = useState<Set<number>>(() => new Set(withIds.map((d) => d.id)));
  const [remarks, setRemarks] = useState("");
  if (withIds.length < 2) return null;

  const dropped = withIds.filter((d) => !kept.has(d.id));
  const pays = withIds.filter((d) => kept.has(d.id)).reduce((sum, d) => sum + signed(d), 0);
  const toggle = (id: number, on: boolean) =>
    setKept((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const ready = dropped.length > 0 && kept.size > 0 && pays > 0 && remarks.trim() !== "";

  return (
    <Card className="p-4 md:p-5">
      <CardHeader>
        <CardTitle>Pay only some of these</CardTitle>
      </CardHeader>
      <p className="m-0 mb-3 text-[13px] text-body">
        Untick what is not to be paid now. It is taken off this request and freed to be raised again, and the
        creator is told why.
      </p>
      <div className="space-y-2">
        {withIds.map((d) => (
          <Checkbox
            key={d.id}
            checked={kept.has(d.id)}
            disabled={busy}
            onChange={(e) => toggle(d.id, e.target.checked)}
            label={
              <span className="tabular-nums">
                {KIND_LABEL[d.kind]} {d.sap_doc_num || d.sap_doc_entry}
                {d.vendor_ref ? <span className="text-subtle"> · {d.vendor_ref}</span> : null} ·{" "}
                {d.direction === "DEBIT" ? "− " : ""}
                {formatINR(Number(d.amount) || 0)}
              </span>
            }
          />
        ))}
      </div>
      {dropped.length ? (
        <div className="mt-3 space-y-2">
          <p className="m-0 text-[13px] text-ink">
            Taking off <span className="font-semibold">{dropped.length}</span>; the request will pay{" "}
            <span className="font-semibold tabular-nums">{formatINR(pays)}</span>.
          </p>
          <Field label="Why they are not paid" required>
            {(f) => (
              <Textarea
                {...f}
                rows={2}
                placeholder="The creator is told this"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={busy}
              />
            )}
          </Field>
          <Button
            variant="secondary"
            size="xs"
            disabled={!ready || busy}
            onClick={() => onKeep([...kept], remarks.trim())}
          >
            Take off {dropped.length} and notify the creator
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
