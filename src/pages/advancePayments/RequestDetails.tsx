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
  returnMethodLabel,
  typeLabel,
  type AdvanceRequestEntry,
} from "./approvalData";
import { Badge } from "../../components/ui/badge";
import { AttachmentReadingTable } from "./AttachmentReading";
import { formatSize } from "./attachments";
import { PAYMENT_MODES } from "./constants";
import { SapAttachmentLink } from "./SapAttachmentLink";
import { STATUS_LABEL, formatDateTime, priorityLabel } from "./requestLabels";
import {
  REFERENCE_KINDS,
  allocationRows,
  allocationTotals,
  dueFirst,
  dueLabel,
  formatDate,
  formatINR,
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
        <DetailField
          label={c.partnerLabel}
          value={form.partnerName || form.partner}
          hint={form.partnerName ? form.partner : undefined}
        />
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
        <DetailField label="Department" value={form.departmentName} />
        <DetailField label="Sub-department" value={form.subDepartmentName} />
        <DetailField
          label="Payment Purpose"
          value={
            form.budget
              ? `${form.budgetName || form.budget} / ${form.subBudgetName || form.subBudget}`
              : ""
          }
        />
        <DetailField label="Ownership" value={form.ownership} />
        <DetailField label="Payment Date" value={form.paymentDate ? formatDate(form.paymentDate) : ""} />
        <DetailField label="Priority" value={priorityLabel(entry)} />
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
                {f.name}
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
            <TableHead>{def.dateLabel}</TableHead>
            <TableHead className="text-right">Open Amount</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="text-right">Payment Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dueFirst(rows, (row) => row.document).map(({ document: doc, allocation, calc }) => (
            <React.Fragment key={doc.id}>
            <TableRow data-due={dueLabel(doc) ? "true" : undefined} className={dueLabel(doc) ? "bg-bad-soft/40" : undefined}>
              <TableCell className="font-semibold text-ink">
                {doc.number}
                {dueLabel(doc) ? (
                  <span className="ml-1.5 align-middle">
                    <Badge tone="bad">{dueLabel(doc)}</Badge>
                  </span>
                ) : null}
                {doc.reference ? (
                  <span className="block text-[11px] font-normal text-subtle">Ref {doc.reference}</span>
                ) : null}
                {doc.attachment ? (
                  <span className="block text-[12px] font-normal">
                    <SapAttachmentLink attachment={doc.attachment} compact />
                  </span>
                ) : null}
              </TableCell>
              <TableCell>{formatDate(doc.date)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(doc.open)}</TableCell>
              <TableCell>
                {PAYMENT_MODES.find((m) => m.value === allocation.mode)?.label}
                {allocation.mode === "PERCENT" && allocation.percentage
                  ? ` · ${Number(allocation.percentage)}%`
                  : ""}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-ink">
                {calc.payment !== null ? formatINR(calc.payment) : "—"}
              </TableCell>
            </TableRow>
            {showReading && doc.attachment ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="bg-surface">
                  <p className="m-0 mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-subtle">
                    Read from {doc.number}&apos;s SAP attachment
                  </p>
                  <AttachmentReadingTable attachment={doc.attachment} stored={doc.reading} />
                </TableCell>
              </TableRow>
            ) : null}
            </React.Fragment>
          ))}
          <TableRow className="bg-surface hover:bg-surface">
            <TableCell className="font-semibold text-ink" colSpan={2}>
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
