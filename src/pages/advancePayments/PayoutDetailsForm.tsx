/**
 * "Payment & Bank Details" — what the APPROVER fills in before approving.
 *
 * Presentation only: the shape and every rule live in `payout.ts`. Laid out
 * like the app's Receive Payment method cards (see that file's header), so
 * the outgoing record reads like the incoming one.
 *
 * Read-only once the request is decided: the whole box sits in a disabled
 * <fieldset>, which disables every control inside it natively — one switch
 * rather than a `disabled` on each of twenty inputs that the next field added
 * would forget.
 */
import * as React from "react";
import { useRef } from "react";
import {
  HiOutlineBanknotes,
  HiOutlineDocumentText,
  HiOutlinePaperClip,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi2";

import { Button } from "../../components/ui/button";
import { Field, FormGrid, Input, Select } from "../../components/ui/form";
import { cn } from "@/lib/utils";

import { formatSize, type MockAttachment } from "./attachments";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_MB } from "./constants";
import { FormSection, RupeeInput } from "./PaymentSections";
import {
  NOTE_DENOMINATIONS,
  PAYOUT_METHODS,
  UPI_REFERENCE_MAX,
  accountsFor,
  cashBreakdownError,
  changeMethod,
  newPayoutLine,
  noteRowsTotal,
  payoutTotal,
  type CashNoteRow,
  type PayoutDetails,
  type PayoutLine,
  type PayoutMethod,
} from "./payout";
import { formatINR } from "./rules";

/* ── A small file list with an "Add" button ─────────────────────────────── */

function FileList({
  label,
  files,
  onChange,
  disabled,
}: {
  label: string;
  files: MockAttachment[];
  onChange: (files: MockAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = React.useState("");

  const add = (incoming: FileList | null) => {
    if (!incoming) return;
    const tooBig: string[] = [];
    const accepted: MockAttachment[] = [];
    Array.from(incoming).forEach((f) => {
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) tooBig.push(f.name);
      else accepted.push({ id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`, name: f.name, size: f.size });
    });
    if (accepted.length) onChange([...files, ...accepted]);
    setRejected(tooBig.length ? `Over ${MAX_FILE_SIZE_MB} MB, not added: ${tooBig.join(", ")}` : "");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-body">{label}</span>
        {!disabled ? (
          <Button variant="secondary" size="xs" onClick={() => inputRef.current?.click()}>
            <HiOutlinePaperClip className="size-3.5" aria-hidden="true" />
            Add files
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          className="hidden"
          aria-label={label}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {rejected ? <p className="m-0 text-[11.5px] text-danger">{rejected}</p> : null}
      {files.length > 0 ? (
        <ul className="m-0 list-none space-y-1 p-0">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-sm border border-line bg-card px-2.5 py-1.5"
            >
              <HiOutlineDocumentText className="size-4 shrink-0 text-subtle" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{f.name}</span>
              <span className="shrink-0 text-[11px] text-subtle">{formatSize(f.size)}</span>
              {!disabled ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                  className="text-subtle hover:text-danger"
                >
                  <HiOutlineTrash className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[11.5px] text-subtle">No files.</p>
      )}
    </div>
  );
}

/* ── Cash note breakdown ─────────────────────────────────────────────────── */

function NoteBreakdown({
  line,
  onChange,
  readOnly,
}: {
  line: PayoutLine;
  onChange: (rows: CashNoteRow[]) => void;
  readOnly: boolean;
}) {
  const error = cashBreakdownError(line);
  const setRow = (id: string, patch: Partial<CashNoteRow>) =>
    onChange(line.noteRows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2 rounded-sm border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink">Cash Note Breakdown</span>
        <span className="text-[12px] tabular-nums text-subtle">
          Counted {formatINR(noteRowsTotal(line.noteRows))}
        </span>
      </div>

      {line.noteRows.map((row, index) => (
        <div key={row.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
          <Select
            aria-label={`Denomination ${index + 1}`}
            value={row.denomination ?? ""}
            onChange={(e) =>
              setRow(row.id, { denomination: e.target.value ? Number(e.target.value) : null })
            }
            className="h-control-sm"
          >
            <option value="" disabled hidden>
              Note
            </option>
            {NOTE_DENOMINATIONS.map((d) => (
              <option key={d} value={d}>
                ₹{d}
              </option>
            ))}
          </Select>
          <Input
            aria-label={`Quantity ${index + 1}`}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="Qty"
            value={row.quantity}
            onChange={(e) => setRow(row.id, { quantity: e.target.value.replace(/[^0-9]/g, "") })}
            className="h-control-sm"
          />
          <span className="min-w-[5rem] text-right text-[12.5px] tabular-nums text-ink">
            {formatINR((row.denomination ?? 0) * (Number(row.quantity) || 0))}
          </span>
          {!readOnly ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove note row ${index + 1}`}
              onClick={() => onChange(line.noteRows.filter((r) => r.id !== row.id))}
              className="text-subtle hover:text-danger"
            >
              <HiOutlineTrash className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ))}

      {!readOnly ? (
        <Button
          variant="secondary"
          size="xs"
          onClick={() =>
            onChange([
              ...line.noteRows,
              { id: `note-${line.id}-${line.noteRows.length + 1}-${Date.now()}`, denomination: null, quantity: "" },
            ])
          }
        >
          <HiOutlinePlus className="size-3.5" aria-hidden="true" />
          Add note
        </Button>
      ) : null}

      {error ? <p className="m-0 text-[11.5px] leading-snug text-danger">{error}</p> : null}
    </div>
  );
}

/* ── One payment method card ─────────────────────────────────────────────── */

function MethodCard({
  line,
  index,
  canRemove,
  readOnly,
  onChange,
  onRemove,
}: {
  line: PayoutLine;
  index: number;
  canRemove: boolean;
  readOnly: boolean;
  onChange: (next: PayoutLine) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const isCash = line.method === "CASH";
  const accounts = accountsFor(line.method);
  const patch = (p: Partial<PayoutLine>) => onChange({ ...line, ...p });
  const amount = Number(line.amount) || 0;

  return (
    <div className="rounded-card border border-line bg-card">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-brand-soft text-brand">
          <HiOutlineBanknotes className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">
            Payment Method {n}
          </p>
          <p className="m-0 text-[13.5px] font-semibold text-ink">
            {PAYOUT_METHODS.find((m) => m.value === line.method)?.label}
          </p>
        </div>
        <span className={cn("text-[13px] font-bold tabular-nums", amount > 0 ? "text-ink" : "text-subtle")}>
          {formatINR(amount)}
        </span>
        {!readOnly ? (
          <Button
            variant="ghost"
            size="icon"
            title="Remove this payment method"
            aria-label={`Remove payment method ${n}`}
            disabled={!canRemove}
            onClick={onRemove}
            className="text-subtle hover:text-danger"
          >
            <HiOutlineTrash className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className="space-y-3 p-3">
        <FormGrid className="md:grid-cols-3">
          <Field label={`Payment Method ${n}`} required>
            {(f) => (
              <Select
                {...f}
                value={line.method}
                onChange={(e) => onChange(changeMethod(line, e.target.value as PayoutMethod))}
              >
                {PAYOUT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={`Amount (method ${n})`} required>
            {(f) => (
              <RupeeInput
                {...f}
                placeholder="Enter amount"
                value={line.amount}
                onChange={(e) => patch({ amount: e.target.value })}
              />
            )}
          </Field>

          {/* OUR account the money leaves from. The receive-payment card asks
              the same question the other way round — which account it lands
              in. Cleared on a method change: a drawer cannot send a UPI. */}
          <Field
            label={`${isCash ? "From Cash Account" : "From Bank Account"} (method ${n})`}
            required
            hint="Sample accounts — the live list comes from /payments/banks/."
          >
            {(f) => (
              <Select
                {...f}
                value={line.fromAccount}
                onChange={(e) => patch({ fromAccount: e.target.value })}
              >
                <option value="" disabled hidden>
                  {isCash ? "Select cash account" : "Select bank account"}
                </option>
                {accounts.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FormGrid>

        {line.method === "UPI" ? (
          <FormGrid className="md:grid-cols-3">
            <Field
              label={`UPI Reference / UTR (method ${n})`}
              hint="Optional — add it once the transfer is made."
            >
              {(f) => (
                <Input
                  {...f}
                  placeholder="Enter UPI Transaction ID"
                  maxLength={UPI_REFERENCE_MAX}
                  value={line.reference}
                  onChange={(e) => patch({ reference: e.target.value.toUpperCase() })}
                />
              )}
            </Field>
          </FormGrid>
        ) : null}

        {line.method === "CHEQUE" ? (
          <FormGrid className="md:grid-cols-3">
            <Field label={`Cheque Number (method ${n})`} required>
              {(f) => (
                <Input
                  {...f}
                  inputMode="numeric"
                  placeholder="Enter cheque number"
                  value={line.chequeNumber}
                  onChange={(e) => patch({ chequeNumber: e.target.value.replace(/[^0-9]/g, "") })}
                />
              )}
            </Field>
            <Field
              label={`Cheque Bank (method ${n})`}
              hint="The bank the cheque is drawn on — ours, since we are paying."
            >
              {(f) => (
                <Input
                  {...f}
                  placeholder="e.g. HDFC"
                  value={line.chequeBank}
                  onChange={(e) => patch({ chequeBank: e.target.value.toUpperCase() })}
                />
              )}
            </Field>
            <Field label={`Cheque Date (method ${n})`} required>
              {(f) => (
                <Input
                  {...f}
                  type="date"
                  value={line.chequeDate}
                  onChange={(e) => patch({ chequeDate: e.target.value })}
                />
              )}
            </Field>
          </FormGrid>
        ) : null}

        {isCash ? (
          <NoteBreakdown
            line={line}
            readOnly={readOnly}
            onChange={(noteRows) => patch({ noteRows })}
          />
        ) : null}

        {/* Every method but cash has a document behind it. */}
        {!isCash ? (
          <FileList
            label={line.method === "CHEQUE" ? "Cheque Image" : "Payment Screenshot"}
            files={line.attachments}
            onChange={(attachments) => patch({ attachments })}
            disabled={readOnly}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ── The whole box ───────────────────────────────────────────────────────── */

export function PayoutDetailsForm({
  value,
  onChange,
  requestAmount,
  readOnly = false,
}: {
  value: PayoutDetails;
  onChange: (next: PayoutDetails) => void;
  /** What the request asks to pay — the methods must add up to it. */
  requestAmount: number;
  readOnly?: boolean;
}) {
  const allocated = payoutTotal(value);
  const balanced = Math.round(allocated * 100) === Math.round(requestAmount * 100);
  const setLine = (id: string, next: PayoutLine) =>
    onChange({ ...value, lines: value.lines.map((l) => (l.id === id ? next : l)) });

  return (
    <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-5 border-0 p-0">
      <FormSection
        title="Pay To"
        description="The payee's bank details, as finance has verified them."
      >
        <FormGrid className="md:grid-cols-3">
          <Field label="Beneficiary Name" required>
            {(f) => (
              <Input
                {...f}
                placeholder="As per bank records"
                value={value.beneficiaryName}
                onChange={(e) => onChange({ ...value, beneficiaryName: e.target.value.toUpperCase() })}
              />
            )}
          </Field>
          <Field label="To Account Number" required hint="Not needed when paying in cash only.">
            {(f) => (
              <Input
                {...f}
                inputMode="numeric"
                placeholder="Payee's account number"
                value={value.toAccountNumber}
                onChange={(e) =>
                  onChange({ ...value, toAccountNumber: e.target.value.replace(/[^0-9]/g, "") })
                }
              />
            )}
          </Field>
          <Field label="IFSC" required>
            {(f) => (
              <Input
                {...f}
                placeholder="e.g. HDFC0001234"
                maxLength={11}
                value={value.toIfsc}
                onChange={(e) => onChange({ ...value, toIfsc: e.target.value.toUpperCase() })}
              />
            )}
          </Field>
        </FormGrid>

        <FileList
          label="Bank Detail Attachments"
          files={value.bankAttachments}
          onChange={(bankAttachments) => onChange({ ...value, bankAttachments })}
          disabled={readOnly}
        />
      </FormSection>

      <FormSection
        title="Payment Methods"
        description="How the money goes out — split it across methods if it leaves more than one way."
      >
        <div className="space-y-3">
          {value.lines.map((line, index) => (
            <MethodCard
              key={line.id}
              line={line}
              index={index}
              readOnly={readOnly}
              canRemove={value.lines.length > 1}
              onChange={(next) => setLine(line.id, next)}
              onRemove={() => onChange({ ...value, lines: value.lines.filter((l) => l.id !== line.id) })}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {!readOnly ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ ...value, lines: [...value.lines, newPayoutLine("UPI")] })}
            >
              <HiOutlinePlus className="size-4" aria-hidden="true" />
              Add Payment Method
            </Button>
          ) : (
            <span />
          )}
          <output
            aria-label="Allocated to payment methods"
            className={cn(
              "rounded-sm px-2.5 py-1 text-[12.5px] font-semibold tabular-nums",
              balanced ? "bg-ok-soft text-ok" : "bg-hold-soft text-hold",
            )}
          >
            {formatINR(allocated)} of {formatINR(requestAmount)} allocated
          </output>
        </div>
      </FormSection>
    </fieldset>
  );
}
