/**
 * A request, read-only — shown to the approver on the desk and to the
 * requester from their Entries tab, so both see the same record the same way.
 */
import * as React from "react";
import { HiOutlineDocumentText } from "react-icons/hi2";

import { DetailField, DetailGrid } from "../../components/ui/detail";
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
  paymentAgainstLabel,
  requestAmount,
  returnMethodLabel,
  typeLabel,
  type AdvanceRequestEntry,
} from "./approvalData";
import { monthLabel } from "./expenseLookups";
import { Badge } from "../../components/ui/badge";
import { AttachmentReadingTable } from "./AttachmentReading";
import { formatSize } from "./attachments";
import { GST_OPTIONS, PAYMENT_MODES } from "./constants";
import { DocumentHistory } from "./DocumentHistory";
import { SapAttachmentLink, SapAttachmentList } from "./SapAttachmentLink";
import { historyTargetOf, sapDocumentOf } from "./sapMapping";
import { STATUS_LABEL, formatDateTime } from "./requestLabels";
import { EditChanges } from "./RequestProgress";
import { RequestFileName } from "./RequestFileLink";
import {
  REFERENCE_KINDS,
  allocationRows,
  allocationTotals,
  dueFirst,
  dueLabel,
  expenseNet,
  expenseTds,
  expenseTotal,
  formatDate,
  formatINR,
  lineGst,
  lineInvoice,
  lineTaxable,
  lineTds,
  resolveCase,
} from "./rules";

export function RequestSummary({ entry }: { entry: AdvanceRequestEntry }) {
  const { form } = entry;
  const c = resolveCase(form);
  const emi = c.installments && form.emiAmount ? Number(form.emiAmount) : null;

  return (
    <div className="space-y-4">
      <DetailGrid>
        <DetailField label="Company" value={form.company} />
        <DetailField label="Type" value={typeLabel(form)} />
        <DetailField label="Payment Against" value={paymentAgainstLabel(form)} />
        {c.expense ? (
          <>
            <DetailField label="Pay To" value={form.payee} hint={form.partner || undefined} />
            <DetailField label="Amount" value={formatINR(requestAmount(form))} strong />
            {expenseTds(form) ? (
              <DetailField
                label="TDS · Paid"
                value={`${formatINR(expenseTds(form))} · ${formatINR(expenseNet(form))}`}
              />
            ) : null}
            <DetailField
              label="Month"
              value={form.effectMonth ? `${monthLabel(form.effectMonth)} (${form.effectMonth})` : "Set by the Payment desk"}
            />
            <DetailField label="Electricity" value={form.isElectricity ? "Yes — the Director approves too" : "No"} />
          </>
        ) : (
          <DetailField
            label={c.partnerLabel}
            value={form.partnerName || form.partner}
            hint={form.partnerName ? form.partner : undefined}
          />
        )}
        {c.plainAmount ? (
          <DetailField label="Amount" value={formatINR(Number(form.amount) || 0)} strong />
        ) : null}
        {c.expectedDate ? (
          <DetailField label="Expected Bill Date" value={form.expectedDate ? formatDate(form.expectedDate) : ""} />
        ) : null}
        {c.expectedBillDate ? (
          <DetailField
            label="Expected Bill Date"
            value={form.expectedBillDate ? formatDate(form.expectedBillDate) : ""}
          />
        ) : null}
        {c.repayment ? (
          <>
            <DetailField label="Return Method" value={returnMethodLabel(form)} />
            {c.installments ? (
              <DetailField
                label="EMI"
                value={emi !== null ? `${form.installments} × ${formatINR(emi)}` : ""}
              />
            ) : null}
            {/* The same dates the form asked for, under the same names. */}
            {form.returnMethod === "EMI" ? (
              <>
                <DetailField
                  label="EMI Start Date"
                  value={form.expectedFromDate ? formatDate(form.expectedFromDate) : ""}
                />
                <DetailField
                  label="Expected To Date"
                  value={form.expectedToDate ? formatDate(form.expectedToDate) : ""}
                />
              </>
            ) : form.returnMethod === "ONE_TIME" ? (
              <DetailField
                label="Return Date"
                value={form.expectedToDate ? formatDate(form.expectedToDate) : ""}
              />
            ) : (
              <DetailField
                label="Expected Period"
                value={
                  form.expectedFromDate && form.expectedToDate
                    ? `${formatDate(form.expectedFromDate)} – ${formatDate(form.expectedToDate)}`
                    : ""
                }
              />
            )}
          </>
        ) : null}
        {/* The budget head; a request raised before budget heads shows its old OMS department. */}
        <DetailField
          label="Department"
          value={form.budgetName || form.budget || entry.api.department?.name || ""}
        />
        {c.expense ? (
          <DetailField label="Sub Budget" value={form.subBudgetName || form.subBudget || "Set by the Payment desk"} />
        ) : (
          <DetailField label="Payment Purpose" value={form.purposeLabel || form.purpose} />
        )}
        {form.departmentHead ? <DetailField label="Department Head" value={form.departmentHeadName} /> : null}
        {c.expense ? null : <DetailField label="Ownership" value={form.ownership} />}
        <DetailField label="Payment Date" value={form.paymentDate ? formatDate(form.paymentDate) : ""} />
        <DetailField label="Remarks" value={form.remarks} span="full" />
      </DetailGrid>

      <div>
        <p className="m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">
          Attachments
        </p>
        {entry.files.length ? (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {entry.files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2.5 py-1 text-[12.5px] text-ink"
              >
                <HiOutlineDocumentText className="size-4 text-subtle" aria-hidden="true" />
                <RequestFileName file={f} />
                <span className="text-[11px] text-subtle">{formatSize(f.size)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[12.5px] text-subtle">None.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Who corrected the Expense at Payment, when, and what changed — Was → Now.
 * Shown to every stage that sees the lines, so Audit knows what Payment did.
 */
export function ExpenseEditHistory({ entry }: { entry: AdvanceRequestEntry }) {
  const edits = (entry.api.logs ?? []).filter((log) => log.action === "PAYMENT_EDITED");
  if (edits.length === 0) return null;
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4" data-slot="expense-edit-history">
      <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">Edited at Payment</p>
      {edits.map((log) => (
        <div key={log.id}>
          <p className="m-0 text-[12.5px] text-ink">
            <span className="font-semibold">{log.actor?.name ?? "—"}</span>
            {log.stage_name ? <span className="text-subtle"> · {log.stage_name}</span> : null}
            <span className="text-subtle"> · {formatDateTime(log.created_on)}</span>
          </p>
          <EditChanges log={log} />
        </div>
      ))}
    </div>
  );
}

/** An Expense's lines: amount, G/L, month, remarks — read-only, with the Payment desk's edits. */
export function ExpenseLines({ entry }: { entry: AdvanceRequestEntry }) {
  const { form } = entry;
  if (form.type !== "EXPENSE") return null;
  const missing = form.expenseLines.filter((l) => !l.glAccount).length;
  return (
    <Card className="p-4 md:p-5">
      <CardHeader>
        <CardTitle>Expense Lines</CardTitle>
        {missing ? (
          <Badge tone="hold">{missing === 1 ? "1 line without a G/L" : `${missing} lines without a G/L`}</Badge>
        ) : null}
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>GST</TableHead>
            <TableHead className="text-right">TDS</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead>G/L account</TableHead>
            <TableHead>Month</TableHead>
            <TableHead>Remarks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {form.expenseLines.map((line, index) => {
            const month = line.effectMonth || form.effectMonth;
            const tds = lineTds(line, form);
            return (
              <TableRow key={line.id}>
                <TableCell className="tabular-nums text-subtle">{index + 1}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-ink">
                  {formatINR(lineInvoice(line))}
                </TableCell>
                <TableCell>
                  {line.gstCode ? GST_OPTIONS.find((o) => o.value === line.gstCode)?.label ?? line.gstCode : "—"}
                  {line.gstCode ? (
                    <span className="block text-[11px] text-subtle">
                      Taxable {formatINR(lineTaxable(line))} · GST {formatINR(lineGst(line))}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {tds ? formatINR(tds) : "—"}
                  {tds && line.tdsCode ? <span className="block text-[11px] text-subtle">{line.tdsCode}</span> : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(lineInvoice(line) - tds)}</TableCell>
                <TableCell>
                  {line.glAccount ? (
                    <span>
                      <span className="font-medium text-ink">{line.glAccount}</span>
                      {line.glName ? <span className="text-subtle"> · {line.glName}</span> : null}
                    </span>
                  ) : (
                    <span className="text-subtle">Payment desk to choose</span>
                  )}
                </TableCell>
                <TableCell>
                  {month ? monthLabel(month) : <span className="text-subtle">Payment desk to set</span>}
                  {line.effectMonth && line.effectMonth !== form.effectMonth ? (
                    <span className="block text-[11px] text-subtle">its own month</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-body">{line.remarks || "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="m-0 mt-2 text-right text-[13px] text-body" data-slot="expense-lines-total">
        Total <span className="font-semibold text-ink">{formatINR(expenseTotal(form.expenseLines))}</span>
        {expenseTds(form) ? (
          <>
            {" "}
            · TDS {formatINR(expenseTds(form))} · Paid{" "}
            <span className="font-semibold text-ink">{formatINR(expenseNet(form))}</span>
          </>
        ) : null}
      </p>
      <ExpenseEditHistory entry={entry} />
    </Card>
  );
}

/** The documents and what each line pays — read-only. Nothing for a plain amount. */
/**
 * The request's bills or POs and what each is paid, due ones first.
 *
 * `showReading` adds, under each document, what reading its SAP attachment
 * found and how that compares with SAP: for the Payment stage onwards only,
 * never for the requester (the reading is an approver's check).
 */
export function DocumentLines({
  entry,
  showReading = false,
}: {
  entry: AdvanceRequestEntry;
  showReading?: boolean;
}) {
  const c = resolveCase(entry.form);
  if (!c.reference) return null;
  const def = REFERENCE_KINDS[c.reference];
  const rows = allocationRows(entry.form);
  const totals = allocationTotals(rows);

  return (
    <Card className="p-4 md:p-5">
      <CardHeader>
        <CardTitle>
          {def.pluralLabel} &amp; Amounts ({rows.length})
        </CardTitle>
        <span className={c.liveDocuments ? "text-[12px] font-medium text-ok" : "text-[12px] font-medium text-hold"}>
          {c.liveDocuments ? "From SAP" : "Sample data"}
        </span>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{def.numberLabel}</TableHead>
            <TableHead>Vendor Ref.</TableHead>
            <TableHead>{def.dateLabel}</TableHead>
            <TableHead className="text-right">Open Amount</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="text-right">Payment Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dueFirst(rows, (row) => row.document).map(({ document: doc, allocation, calc }) => {
            const source = sapDocumentOf(doc, entry.form.company);
            const history = historyTargetOf(doc, entry.form.company);
            const debit = doc.ledger?.direction === "DEBIT";
            return (
            <React.Fragment key={doc.id}>
            <TableRow data-due={dueLabel(doc) ? "true" : undefined} className={dueLabel(doc) ? "bg-bad-soft/40" : undefined}>
              <TableCell className="font-semibold text-ink">
                {doc.number}
                {doc.ledger ? (
                  <span className="ml-1.5 align-middle">
                    <Badge tone={debit ? "hold" : "ok"}>{debit ? "Dr" : "Cr"}</Badge>
                  </span>
                ) : null}
                {dueLabel(doc) ? (
                  <span className="ml-1.5 align-middle">
                    <Badge tone="bad">{dueLabel(doc)}</Badge>
                  </span>
                ) : null}
                {doc.attachment ? (
                  <span className="block text-[12px] font-normal">
                    <SapAttachmentLink attachment={doc.attachment} compact />
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="font-medium text-ink">{doc.reference || "—"}</TableCell>
              <TableCell>{formatDate(doc.date)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(doc.open)}</TableCell>
              <TableCell>
                {PAYMENT_MODES.find((m) => m.value === allocation.mode)?.label}
                {allocation.mode === "PERCENT" && allocation.percentage
                  ? ` · ${Number(allocation.percentage)}%`
                  : ""}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-ink">
                {calc.payment !== null ? `${debit ? "− " : ""}${formatINR(calc.payment)}` : "—"}
              </TableCell>
            </TableRow>
            {source ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6}>
                  <p className="m-0 mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-subtle">
                    {doc.number}&apos;s SAP attachments
                  </p>
                  <SapAttachmentList {...source} />
                </TableCell>
              </TableRow>
            ) : null}
            {history ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6}>
                  <p className="m-0 mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-subtle">
                    OMS payments against {doc.number}
                  </p>
                  <DocumentHistory target={history} />
                </TableCell>
              </TableRow>
            ) : null}
            {showReading && doc.reading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="bg-surface">
                  <p className="m-0 mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-subtle">
                    Read from {doc.number}&apos;s SAP attachment
                  </p>
                  <AttachmentReadingTable stored={doc.reading} />
                </TableCell>
              </TableRow>
            ) : null}
            </React.Fragment>
            );
          })}
          <TableRow className="bg-surface hover:bg-surface">
            <TableCell className="font-semibold text-ink" colSpan={3}>
              Total
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{formatINR(totals.open)}</TableCell>
            <TableCell />
            <TableCell className="text-right text-base font-bold tabular-nums text-ink">
              {formatINR(totals.payment)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  );
}

/** Where the request stands — who decided it and why, or where it is waiting. */
export function DecisionSummary({ entry }: { entry: AdvanceRequestEntry }) {
  const flow = entry.api.flow;
  if (!entry.decision) {
    const waiting = flow?.current_stage
      ? `Waiting at ${flow.current_stage}${flow.current_user ? ` (${flow.current_user.name})` : ""}.`
      : "Waiting for approval.";
    return (
      <p className="m-0 text-[13px] text-body">
        {waiting} Raised by {entry.requestedBy} on {formatDateTime(entry.requestedOn)}.
      </p>
    );
  }
  const verb = DECIDED_LABEL[entry.decision.status];
  return (
    <DetailGrid>
      <DetailField label="Status" value={STATUS_LABEL[entry.decision.status]} strong />
      <DetailField label={`${verb} By`} value={entry.decision.by} />
      <DetailField label={`${verb} On`} value={formatDateTime(entry.decision.on)} />
      <DetailField label="Remarks" value={entry.decision.remarks} span="full" />
    </DetailGrid>
  );
}

const DECIDED_LABEL = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
} as const;
