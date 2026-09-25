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
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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

import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapCashAccount,
  type SapHouseBank,
  type SapPartnerBankAccount,
} from "../../services/advancePaymentService";

import { attachFile, formatSize, type FileAttachment } from "./attachments";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_MB } from "./constants";
import { FormSection, RupeeInput } from "./PaymentSections";
import {
  NOTE_DENOMINATIONS,
  PAYOUT_METHODS,
  cashBreakdownError,
  changeMethod,
  defaultMethodFor,
  methodAmountError,
  methodsFor,
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
  files: FileAttachment[];
  onChange: (files: FileAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = React.useState("");

  const add = (incoming: FileList | null) => {
    if (!incoming) return;
    const tooBig: string[] = [];
    const accepted: FileAttachment[] = [];
    Array.from(incoming).forEach((f) => {
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) tooBig.push(f.name);
      else accepted.push(attachFile(f));
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
  banks,
  banksNote,
  cashAccounts,
  cashNote,
}: {
  line: PayoutLine;
  index: number;
  canRemove: boolean;
  readOnly: boolean;
  onChange: (next: PayoutLine) => void;
  onRemove: () => void;
  /** The company's SAP house banks — every one, postable or not. */
  banks: SapHouseBank[];
  /** Loading / failure / empty, for the From Bank Account hint. */
  banksNote: string;
  /** The company's SAP cash accounts. */
  cashAccounts: SapCashAccount[];
  cashNote: string;
}) {
  const n = index + 1;
  const isCash = line.method === "CASH";
  const accounts: ReadonlyArray<{ value: string; label: string }> = isCash
    ? cashAccounts.map((acct) => ({
        value: acct.acct_code,
        label: `${acct.acct_name} — ${acct.acct_code}`,
      }))
    : banks.map((bank) => ({
        value: bank.key,
        // The G/L's own name, which carries the bank and account number the
        // person paying recognises ("ICICI BANK-629305042322"), then the G/L.
        label: `${bank.gl_name} — ${bank.gl_account}`,
      }));
  const patch = (p: Partial<PayoutLine>) => onChange({ ...line, ...p });
  const amount = Number(line.amount) || 0;
  // The methods this line's amount may use. The current one stays listed even
  // when the amount has moved past it, so the select never goes blank; the
  // error under it says why it no longer fits.
  const allowed = methodsFor(amount);
  const options = PAYOUT_METHODS.filter(
    (m) => allowed.includes(m.value) || m.value === line.method,
  );
  const methodError = methodAmountError(line.method, amount);

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
          <Field
            label={`Payment Method ${n}`}
            required
            error={methodError ?? undefined}
            hint="UPI below ₹1,00,000 · RTGS above ₹2,00,000 · IMPS below ₹5,00,000 · Cash up to ₹10,000."
          >
            {(f) => (
              <Select
                {...f}
                value={line.method}
                onChange={(e) => onChange(changeMethod(line, e.target.value as PayoutMethod))}
              >
                {options.map((m) => (
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
            hint={
              isCash
                ? cashNote
                : banksNote
            }
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

        {/* Proof, for every method but cash — OPTIONAL. Nothing in
            `validatePayout` asks for it, and the label says so, so an
            approver is not left wondering whether it blocks the approval. */}
        {!isCash ? (
          <FileList
            label={`${
              line.method === "CHEQUE"
                ? "Cheque Image"
                : line.method === "UPI"
                  ? "Payment Screenshot"
                  : "Payment Advice / Screenshot"
            } (optional)`}
            files={line.attachments}
            onChange={(attachments) => patch({ attachments })}
            disabled={readOnly}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ── The payee's account, from SAP ───────────────────────────────────────── */

/** Pseudo-value of the To Account picker for "type it in myself". */
const MANUAL = "__manual__";

/**
 * To Account Number and IFSC.
 *
 * When SAP holds accounts for the payee, the number is PICKED from them. The
 * default is pre-filled, and the IFSC comes with the account, read-only,
 * because an IFSC typed against an account SAP already knows is the one way
 * to send money to the right account at the wrong branch. "Enter another
 * account" opens both fields for typing, for a payee whose details SAP does
 * not have or has out of date.
 *
 * An Employee is a G/L account, not a business partner, so there is nothing in
 * SAP to pick from and the fields are typed, as before.
 *
 * TYPING IS LOCKED behind `manualEntry` when the page passes it: the typed
 * fields stay read-only until the user has confirmed their password, and
 * "Enter another account" asks for it first.
 */
function PayToAccount({
  value,
  onChange,
  accounts,
  loading,
  error,
  lookedUp,
  manualEntry,
}: {
  value: PayoutDetails;
  onChange: (next: PayoutDetails) => void;
  accounts: SapPartnerBankAccount[];
  loading: boolean;
  error: string;
  /** False for an employee (no SAP partner to ask about). */
  lookedUp: boolean;
  manualEntry?: ManualEntry;
}) {
  const chosen = value.toAccountManual
    ? undefined
    : accounts.find((a) => a.account_number === value.toAccountNumber);
  const typing = value.toAccountManual || accounts.length === 0;
  const locked = Boolean(manualEntry && !manualEntry.unlocked);

  const pick = (key: string) => {
    if (key === MANUAL) {
      const toManual = () => onChange({ ...value, toAccountManual: true, toAccountNumber: "", toIfsc: "" });
      if (locked) manualEntry!.unlock(toManual);
      else toManual();
      return;
    }
    const account = accounts.find((a) => a.account_number === key);
    if (!account) return;
    onChange({
      ...value,
      toAccountManual: false,
      toAccountNumber: account.account_number,
      toIfsc: account.ifsc,
      // SAP's account holder name IS the name "as per bank records".
      beneficiaryName: account.account_name
        ? account.account_name.toUpperCase()
        : value.beneficiaryName,
    });
  };

  const hint = !lookedUp
    ? "Employee accounts are not held in SAP. Type the payee's details."
    : loading
      ? "Reading the payee's accounts from SAP…"
      : error
        ? error
        : accounts.length === 0
          ? "SAP has no bank account for this payee. Type the details."
          : typing
            ? "Typed by hand, not one of the payee's SAP accounts."
            : chosen?.is_default
              ? "The payee's default account in SAP."
              : "One of the payee's accounts in SAP.";

  return (
    <>
      <Field label="To Account Number" required hint={hint}>
        {(f) =>
          accounts.length > 0 ? (
            <Select
              {...f}
              value={typing ? MANUAL : (chosen?.account_number ?? "")}
              onChange={(e) => pick(e.target.value)}
            >
              <option value="" disabled hidden>
                Select account
              </option>
              {accounts.map((a) => (
                <option key={`${a.id ?? "dflt"}-${a.account_number}`} value={a.account_number}>
                  {a.account_number}
                  {a.bank_name ? ` · ${a.bank_name}` : ""}
                  {a.is_default ? " (default)" : ""}
                </option>
              ))}
              <option value={MANUAL}>Enter another account…</option>
            </Select>
          ) : (
            <Input
              {...f}
              inputMode="numeric"
              placeholder="Payee's account number"
              value={value.toAccountNumber}
              readOnly={locked}
              onChange={(e) =>
                onChange({ ...value, toAccountNumber: e.target.value.replace(/[^0-9]/g, "") })
              }
            />
          )
        }
      </Field>

      {typing && accounts.length > 0 ? (
        <Field label="Account Number (typed)" required>
          {(f) => (
            <Input
              {...f}
              inputMode="numeric"
              placeholder="Payee's account number"
              value={value.toAccountNumber}
              readOnly={locked}
              onChange={(e) =>
                onChange({ ...value, toAccountNumber: e.target.value.replace(/[^0-9]/g, "") })
              }
            />
          )}
        </Field>
      ) : null}

      <Field
        label="IFSC"
        required
        hint={chosen && !chosen.ifsc_valid ? "SAP's IFSC for this account does not look valid." : undefined}
      >
        {(f) => (
          <Input
            {...f}
            placeholder="e.g. HDFC0001234"
            maxLength={11}
            value={value.toIfsc}
            // From SAP with the account: not retyped against a known account.
            readOnly={!typing || locked}
            className={!typing ? "bg-surface font-semibold" : undefined}
            onChange={(e) => onChange({ ...value, toIfsc: e.target.value.toUpperCase() })}
          />
        )}
      </Field>

      {typing && locked ? (
        <div className="flex items-center gap-2 md:col-span-3">
          <Button variant="secondary" size="xs" onClick={() => manualEntry!.unlock(() => {})}>
            Enter bank details by hand
          </Button>
          <span className="text-[11.5px] text-subtle">Asks for your password first.</span>
        </div>
      ) : null}
    </>
  );
}

/** How the page lets the payee's account be typed: after a password check. */
export interface ManualEntry {
  unlocked: boolean;
  /** Ask for the password; `then` runs once it is confirmed. */
  unlock: (then: () => void) => void;
}

/* ── The whole box ───────────────────────────────────────────────────────── */

export function PayoutDetailsForm({
  value,
  onChange,
  requestAmount,
  readOnly = false,
  company,
  payeeCardCode = "",
  manualEntry,
}: {
  value: PayoutDetails;
  onChange: (next: PayoutDetails) => void;
  /** What the request asks to pay — the methods must add up to it. */
  requestAmount: number;
  readOnly?: boolean;
  /**
   * The request's company. It picks the house banks the money may leave from:
   * an OIL request leaves from an OIL account and nothing else.
   */
  company: AdvancePaymentCompany | "";
  /**
   * The payee's SAP card code (a vendor or an imprest account). Empty for an
   * Employee, who is a G/L account with no bank details in SAP.
   */
  payeeCardCode?: string;
  /** Lock typing the payee's account behind a password (the Payment stage). */
  manualEntry?: ManualEntry;
}) {
  const banksQuery = useQuery({
    queryKey: ["advance-payments", "house-banks", company],
    queryFn: () => advancePaymentService.houseBanks(company as AdvancePaymentCompany),
    enabled: company !== "",
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const cashQuery = useQuery({
    queryKey: ["advance-payments", "cash-accounts", company],
    queryFn: () => advancePaymentService.cashAccounts(company as AdvancePaymentCompany),
    enabled: company !== "",
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const cashAccounts = cashQuery.data ?? [];
  const cashNote = !company
    ? "Choose a company first."
    : cashQuery.isFetching && !cashQuery.data
      ? `Reading ${company}'s cash accounts from SAP…`
      : cashQuery.isError
        ? advancePaymentError(cashQuery.error)
        : cashAccounts.length === 0
          ? `SAP has no cash account for ${company}.`
          : `${company}'s cash accounts in SAP.`;
  const banks = banksQuery.data ?? [];
  const banksNote = !company
    ? "Choose a company first."
    : banksQuery.isFetching && !banksQuery.data
      ? `Reading ${company}'s bank accounts from SAP…`
      : banksQuery.isError
        ? advancePaymentError(banksQuery.error)
        : banks.length === 0
          ? `SAP has no house bank for ${company}.`
          : `${company}'s bank accounts in SAP.`;

  const payeeQuery = useQuery({
    queryKey: ["advance-payments", "partner-bank-accounts", company, payeeCardCode],
    queryFn: () =>
      advancePaymentService.partnerBankAccounts(company as AdvancePaymentCompany, payeeCardCode),
    enabled: company !== "" && payeeCardCode !== "",
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const payeeAccounts: SapPartnerBankAccount[] = payeeQuery.data ?? [];

  // Pre-fill the payee's DEFAULT account once it arrives — but only into an
  // empty payout that the approver has not already typed into or deliberately
  // cleared, and never on a request that has been decided.
  const payeeDefault = payeeAccounts.find((a) => a.is_default) ?? payeeAccounts[0];
  useEffect(() => {
    if (readOnly || !payeeDefault) return;
    if (value.toAccountNumber || value.toAccountManual) return;
    onChange({
      ...value,
      toAccountNumber: payeeDefault.account_number,
      toIfsc: payeeDefault.ifsc,
      beneficiaryName: payeeDefault.account_name
        ? payeeDefault.account_name.toUpperCase()
        : value.beneficiaryName,
    });
    // Keyed on the default itself: `value` and `onChange` change on every
    // keystroke, and re-running on those is exactly what must not happen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeeDefault?.account_number, readOnly]);

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
          <PayToAccount
            value={value}
            onChange={onChange}
            accounts={payeeAccounts}
            loading={payeeQuery.isFetching && !payeeQuery.data}
            error={payeeQuery.isError ? advancePaymentError(payeeQuery.error) : ""}
            lookedUp={payeeCardCode !== ""}
            manualEntry={readOnly ? undefined : manualEntry}
          />
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
              banks={banks}
              banksNote={banksNote}
              cashAccounts={cashAccounts}
              cashNote={cashNote}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {!readOnly ? (
            <Button
              variant="secondary"
              size="sm"
              // A new line starts on the method the UNALLOCATED amount may use.
              onClick={() =>
                onChange({
                  ...value,
                  lines: [
                    ...value.lines,
                    newPayoutLine(defaultMethodFor(Math.max(requestAmount - allocated, 0))),
                  ],
                })
              }
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
