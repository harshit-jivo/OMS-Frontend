/**
 * Record each transfer's UTR once the payment has been made.
 *
 * The approver (or accounts) uploads the proof for a payment line: the bank's
 * advice, a screenshot, or the whole statement, as a PDF, Excel/CSV or photo.
 * The server finds the UTR and checks it against THIS line: its amount, the
 * account it was paid to, and the invoices the request pays
 * (`/advance-payments/payment-proof/`). Nothing is taken on trust: the UTR
 * is shown with every check, can be corrected, or another reference from the
 * same file chosen, and is only recorded when "Record UTR" is pressed.
 */
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { HiOutlineCheckCircle, HiOutlineDocumentMagnifyingGlass, HiOutlineXCircle } from "react-icons/hi2";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Field, Input } from "../../components/ui/form";
import {
  advancePaymentService,
  type AdvancePaymentCompany,
  type PaymentProofResult,
  type ProofCheck,
} from "../../services/advancePaymentService";

import { isTransfer, PAYOUT_METHODS, type PayoutLine, type UtrProof } from "./payout";
import { formatINR } from "./rules";

const ACCEPT = ".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp";

const SOURCE_LABEL: Record<string, string> = {
  "pdf-text": "read from the PDF's text",
  ocr: "read by OCR",
  "pdf-text+ocr": "read from the PDF, part by OCR",
  excel: "read from the Excel file",
  csv: "read from the CSV file",
};

async function proofError(error: unknown): Promise<string> {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data;
  return data?.message || "The proof could not be read.";
}

function CheckRow({ label, value, pass, fail, unknown }: {
  label: string;
  value: ProofCheck;
  pass: string;
  fail: string;
  unknown: string;
}) {
  return (
    <li className="flex items-start gap-2 text-[13px]">
      {value === true ? (
        <HiOutlineCheckCircle className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
      ) : value === false ? (
        <HiOutlineXCircle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
      ) : (
        <span className="mt-0.5 size-4 shrink-0 text-center text-subtle" aria-hidden>
          –
        </span>
      )}
      <span>
        <span className="font-medium text-ink">{label}: </span>
        {value === true ? pass : value === false ? fail : unknown}
      </span>
    </li>
  );
}

export interface ProofContext {
  company: AdvancePaymentCompany;
  /** The account the payment went TO. */
  toAccount: string;
  /** The payee in SAP, whose other accounts the server then knows; "" for an employee. */
  cardCode: string;
  /** The invoice / bill numbers the request pays. */
  invoices: string[];
  recordedBy: string;
}

function LineProof({
  line,
  index,
  context,
  onRecord,
}: {
  line: PayoutLine;
  index: number;
  context: ProofContext;
  onRecord: (utr: string, proof: UtrProof | undefined) => void;
}) {
  const n = index + 1;
  const [file, setFile] = React.useState<File | null>(null);
  const [utr, setUtr] = React.useState("");
  const [error, setError] = React.useState("");
  const [editing, setEditing] = React.useState(!line.utr);
  const methodLabel = PAYOUT_METHODS.find((m) => m.value === line.method)?.label ?? line.method;

  const read = useMutation({
    mutationFn: (f: File) =>
      advancePaymentService.readPaymentProof(f, {
        company: context.company,
        amount: line.amount,
        toAccount: context.toAccount,
        cardCode: context.cardCode,
        invoices: context.invoices,
      }),
    onMutate: () => setError(""),
    onSuccess: (result) => setUtr(result.utr ?? ""),
    onError: async (err) => setError(await proofError(err)),
  });
  const result: PaymentProofResult | undefined = read.data;

  if (line.utr && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line p-3" data-slot="utr-recorded">
        <span className="font-medium text-ink">
          Method {n} · {methodLabel} · {formatINR(Number(line.amount) || 0)}
        </span>
        <Badge tone="ok">UTR {line.utr}</Badge>
        {line.utrProof ? (
          <span className="text-[12px] text-subtle">
            from {line.utrProof.fileName} · recorded by {line.utrProof.recordedBy}
          </span>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    );
  }

  const channelMismatch =
    result?.channel && ["NEFT", "RTGS", "IMPS", "UPI"].includes(result.channel) && result.channel !== line.method;

  return (
    <div className="space-y-3 rounded-card border border-line p-3">
      <div className="font-medium text-ink">
        Method {n} · {methodLabel} · {formatINR(Number(line.amount) || 0)}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label={`Payment proof (method ${n})`} hint="Bank advice, screenshot or statement: PDF, Excel, CSV or photo.">
          {(f) => (
            <Input
              {...f}
              type="file"
              accept={ACCEPT}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                read.reset();
                setError("");
              }}
            />
          )}
        </Field>
        <Button
          variant="secondary"
          disabled={!file || read.isPending}
          onClick={() => file && read.mutate(file)}
        >
          <HiOutlineDocumentMagnifyingGlass className="size-4" aria-hidden />
          {read.isPending ? "Reading…" : "Read proof"}
        </Button>
      </div>
      {read.isPending ? (
        <p className="text-[12px] text-subtle">A photo or scanned statement can take up to a minute.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-3" data-slot="proof-result">
          <p className="text-[12px] text-subtle">
            {result.file_name}: {result.kind === "statement" ? "a statement" : "a payment advice"},{" "}
            {SOURCE_LABEL[result.source] ?? result.source}. {result.references_found}{" "}
            {result.references_found === 1 ? "reference" : "references"} found.
          </p>
          {result.utr ? (
            <>
              <ul className="space-y-1">
                <CheckRow
                  label="Amount"
                  value={result.checks.amount}
                  pass={`${formatINR(Number(line.amount) || 0)}, as paid`}
                  fail={`the proof shows ${result.amount !== null ? formatINR(result.amount) : "another amount"}, not ${formatINR(Number(line.amount) || 0)}`}
                  unknown="not shown next to this reference"
                />
                <CheckRow
                  label="Account"
                  value={result.checks.account}
                  pass={`paid to ${context.toAccount}`}
                  fail={`the proof shows ${result.checks.account_other ?? "another account"}, another account of this payee`}
                  unknown={context.toAccount ? "not shown on the proof" : "no account to check against"}
                />
                <CheckRow
                  label="Invoice"
                  value={result.checks.invoice}
                  pass="the invoice number is in the remarks"
                  fail="another invoice"
                  unknown={context.invoices.length ? "not in the remarks (banks often leave it out)" : "no invoice on this request"}
                />
              </ul>
              {channelMismatch ? (
                <p className="text-[13px] text-hold">
                  This reference looks like {result.channel}, but the line is {methodLabel}. Check it is the right payment.
                </p>
              ) : null}
              {result.row_text ? (
                <p className="rounded-sm bg-surface px-2 py-1 font-mono text-[12px] text-subtle" title="The line the UTR was read from">
                  {result.row_text}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] text-hold">
              No UTR-like reference was found in this file. Type it below, or try the bank&apos;s advice instead of a screenshot.
            </p>
          )}

          {result.candidates.length ? (
            <div className="flex flex-wrap items-center gap-1 text-[12px]">
              <span className="text-subtle">Other references in this file:</span>
              {result.candidates.map((c) => (
                <Button key={c.utr} variant="ghost" size="sm" onClick={() => setUtr(c.utr)} title={c.row_text}>
                  {c.utr}
                  {c.amount !== null ? ` · ${formatINR(c.amount)}` : ""}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {result || line.utr ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label={`UTR (method ${n})`}>
            {(f) => (
              <Input
                {...f}
                value={utr}
                maxLength={30}
                onChange={(e) => setUtr(e.target.value.toUpperCase().replace(/\s/g, ""))}
                placeholder="e.g. HDFCN52026092312345678"
              />
            )}
          </Field>
          <Button
            variant="primary"
            disabled={utr.trim().length < 6}
            onClick={() => {
              onRecord(
                utr.trim(),
                result
                  ? {
                      fileName: result.file_name,
                      source: result.source,
                      readUtr: result.utr,
                      checks: {
                        amount: result.checks.amount,
                        account: result.checks.account,
                        invoice: result.checks.invoice,
                      },
                      recordedBy: context.recordedBy,
                      recordedOn: new Date().toISOString(),
                    }
                  : line.utrProof,
              );
              setEditing(false);
            }}
          >
            Record UTR
          </Button>
          {line.utr ? (
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PaymentProofPanel({
  lines,
  context,
  onRecord,
}: {
  lines: PayoutLine[];
  context: ProofContext;
  onRecord: (lineId: string, utr: string, proof: UtrProof | undefined) => void;
}) {
  const transfers = lines.map((line, index) => ({ line, index })).filter(({ line }) => isTransfer(line.method));
  if (!transfers.length) {
    return <p className="text-[13px] text-subtle">No bank transfers on this request: nothing to record a UTR for.</p>;
  }
  return (
    <div className="space-y-3">
      {transfers.map(({ line, index }) => (
        <LineProof
          key={line.id}
          line={line}
          index={index}
          context={context}
          onRecord={(utr, proof) => onRecord(line.id, utr, proof)}
        />
      ))}
    </div>
  );
}
