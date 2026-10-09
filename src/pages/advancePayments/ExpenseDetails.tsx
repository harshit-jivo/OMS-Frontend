/**
 * An Expense request's own section: Electricity and the lines — each an
 * amount to an expense G/L account.
 *
 * The requester gives each line's amount and picks its G/L account; one who
 * does not know it ticks so and says in the remarks what it is for, and the
 * Payment desk picks it. `atPayment` (the desk) keeps the amounts and the
 * lines as raised and adds what only the desk sets: each line's G/L, GST (how
 * much of the amount is tax), month and TDS — one code for the request, any
 * line its own or none — deducted on the taxable amount; and the Month.
 */
import { useQuery } from "@tanstack/react-query";
import { HiOutlinePlus, HiOutlineXMark } from "react-icons/hi2";

import { Button } from "../../components/ui/button";
import { SearchSelect } from "../../components/ui/dropdown";
import { Checkbox, Field, FormGrid, Input, Select } from "../../components/ui/form";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type TdsCode,
} from "../../services/advancePaymentService";

import { GST_OPTIONS, type GstCode } from "./constants";
import { monthLabel, useExpenseAccounts } from "./expenseLookups";
import { FormSection, RupeeInput } from "./PaymentSections";
import {
  MAX_EXPENSE_LINES,
  NO_TDS,
  expenseNet,
  expenseTds,
  expenseTotal,
  formatINR,
  lineGst,
  lineInvoice,
  lineTaxable,
  lineTds,
  newExpenseLine,
  plainAmountError,
  type ExpenseLineForm,
  type RequestForm,
} from "./rules";

const REQUESTER_NOTE =
  "Each line: its amount and G/L account. Don't know the account? Tick so and say what it is for — the Payment desk picks it.";

/** The desk's TDS: SAP's codes, and the rate of one. */
export interface ExpenseTds {
  codes: TdsCode[];
  rateOf: (code: string) => number | null;
  loading: boolean;
  error?: string;
}

const tdsLabel = (c: TdsCode) => `${c.name || c.code} (${Number(c.rate)}%)`;
const KIND_LABEL = { DIRECT: "Direct", INDIRECT: "Indirect" } as const;

/** Small read-only figure inside a line. */
function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-[11.5px] font-medium text-subtle">{label}</p>
      <p
        className={`m-0 py-1.5 text-[13px] tabular-nums ${strong ? "font-semibold text-ink" : "text-body"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function ExpenseDetails({
  company,
  form,
  onChange,
  description = REQUESTER_NOTE,
  atPayment = false,
  tds,
}: {
  company: AdvancePaymentCompany | null;
  form: RequestForm;
  onChange: (patch: Partial<RequestForm>) => void;
  /** Under the section's title: the requester's note by default. */
  description?: string;
  /** The Payment desk: amounts fixed; G/L, GST, month and TDS its own. */
  atPayment?: boolean;
  /** The desk's TDS codes (with `atPayment`). */
  tds?: ExpenseTds;
}) {
  const accounts = useExpenseAccounts(company, null);
  const monthsQuery = useQuery({
    queryKey: ["advance-payments", "expense-months", company],
    queryFn: () => advancePaymentService.expenseMonths(company!),
    enabled: atPayment && company !== null,
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const months = monthsQuery.data?.months ?? [];
  // A month saved on the request that SAP no longer lists keeps showing.
  const monthChoices = [
    ...new Set([...months, form.effectMonth, ...form.expenseLines.map((l) => l.effectMonth)]),
  ].filter(Boolean);

  // Direct and indirect accounts in one list, each saying which it is: one
  // request is one kind, and the server says so if the lines mix them.
  const accountChoices = accounts.accounts.map((a) => ({
    value: a.code,
    label: `${a.code} · ${a.name}`,
    hint: `${KIND_LABEL[a.kind]} · ${a.group}`,
  }));
  // A line's account SAP no longer lists keeps showing, by its saved name.
  form.expenseLines.forEach((line) => {
    if (line.glAccount && !accountChoices.some((o) => o.value === line.glAccount)) {
      accountChoices.unshift({
        value: line.glAccount,
        label: `${line.glAccount} · ${line.glName}`,
        hint: "",
      });
    }
  });

  const lines = form.expenseLines;
  const setLine = (id: string, patch: Partial<ExpenseLineForm>) =>
    onChange({
      expenseLines: lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    });
  const rateOf = atPayment ? tds?.rateOf : undefined;
  const codes = tds?.codes ?? [];
  const requestTds = codes.find((c) => c.code === form.expenseTdsCode);
  const lookupError = accounts.query.isError
    ? advancePaymentError(accounts.query.error)
    : monthsQuery.isError
      ? advancePaymentError(monthsQuery.error)
      : undefined;

  const glPicker = (line: ExpenseLineForm, id: string) => (
    <SearchSelect<string>
      id={id}
      value={line.glAccount}
      onChange={(next) =>
        setLine(line.id, {
          glAccount: next,
          glName: accounts.accounts.find((a) => a.code === next)?.name ?? "",
        })
      }
      disabled={!company}
      placeholder="Choose the G/L account"
      searchPlaceholder="Search account or name…"
      emptyText="No expense account matches"
      loading={accounts.query.isFetching}
      options={accountChoices}
      maxShown={120}
    />
  );

  return (
    <FormSection title="Expense" description={description}>
      <FormGrid className="md:grid-cols-3">
        {atPayment ? (
          <Field
            label="Month"
            required
            hint={lookupError ? undefined : "SAP's Effective Month for every line without its own."}
            error={lookupError}
          >
            {(f) => (
              <Select
                {...f}
                value={form.effectMonth}
                disabled={!company}
                onChange={(e) => onChange({ effectMonth: e.target.value })}
              >
                <option value="" disabled hidden>
                  Select month
                </option>
                {monthChoices.map((code) => (
                  <option key={code} value={code}>
                    {monthLabel(code)} ({code})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {atPayment ? (
          <Field
            label="TDS"
            hint={
              tds?.error
                ? undefined
                : "On each line's taxable amount. A line may have its own, or none."
            }
            error={tds?.error}
          >
            {(f) => (
              <Select
                {...f}
                value={form.expenseTdsCode}
                onChange={(e) => onChange({ expenseTdsCode: e.target.value })}
              >
                <option value="">No TDS</option>
                {form.expenseTdsCode && !requestTds ? (
                  <option value={form.expenseTdsCode}>{form.expenseTdsCode}</option>
                ) : null}
                {codes.map((c) => (
                  <option key={c.code} value={c.code}>
                    {tdsLabel(c)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <div className="flex items-end pb-1.5">
          <Checkbox
            label="Electricity expense"
            hint="Marks it as an electricity expense, for the record."
            checked={form.isElectricity}
            onChange={(e) => onChange({ isElectricity: e.target.checked })}
          />
        </div>
      </FormGrid>

      <div className="space-y-3" data-slot="expense-lines">
        {lines.map((line, index) => {
          const n = index + 1;
          const amountError = plainAmountError(line.amount)
            ? "Enter an amount above zero."
            : undefined;
          const lineTdsAmount = lineTds(line, form, rateOf);
          return (
            <fieldset
              key={line.id}
              aria-label={`Line ${n}`}
              className="m-0 space-y-2 rounded-sm border border-line bg-card p-3"
            >
              <div className="flex items-center justify-between">
                <p className="m-0 text-[12.5px] font-semibold text-ink">Line {n}</p>
                {atPayment ? null : (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${n}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      onChange({ expenseLines: lines.filter((l) => l.id !== line.id) })
                    }
                  >
                    <HiOutlineXMark className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
              {atPayment ? (
                <FormGrid className="md:grid-cols-3">
                  <Figure label="Amount" value={formatINR(lineInvoice(line))} strong />
                  <Field
                    label="GST"
                    hint={`Taxable ${formatINR(lineTaxable(line))} · GST ${formatINR(lineGst(line))}`}
                  >
                    {(f) => (
                      <Select
                        {...f}
                        value={line.gstCode}
                        onChange={(e) => setLine(line.id, { gstCode: e.target.value as GstCode })}
                      >
                        {GST_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Figure
                    label="TDS · Paid"
                    value={`${formatINR(lineTdsAmount)} · ${formatINR(lineInvoice(line) - lineTdsAmount)}`}
                  />
                  <Field label="G/L account" required error={lookupError}>
                    {(f) => glPicker(line, f.id)}
                  </Field>
                  <Field label="Line remarks" className="md:col-span-2">
                    {(f) => (
                      <Input
                        {...f}
                        maxLength={254}
                        value={line.remarks}
                        onChange={(e) => setLine(line.id, { remarks: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Line month">
                    {(f) => (
                      <Select
                        {...f}
                        value={line.effectMonth}
                        onChange={(e) => setLine(line.id, { effectMonth: e.target.value })}
                      >
                        <option value="">
                          {form.effectMonth
                            ? `Request's (${monthLabel(form.effectMonth)})`
                            : "Request's month"}
                        </option>
                        {monthChoices.map((code) => (
                          <option key={code} value={code}>
                            {monthLabel(code)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Line TDS">
                    {(f) => (
                      <Select
                        {...f}
                        value={line.tdsOverride}
                        onChange={(e) => setLine(line.id, { tdsOverride: e.target.value })}
                      >
                        <option value="">
                          {requestTds ? `Request's (${tdsLabel(requestTds)})` : "Request's (none)"}
                        </option>
                        <option value={NO_TDS}>No TDS</option>
                        {line.tdsOverride &&
                        line.tdsOverride !== NO_TDS &&
                        !codes.some((c) => c.code === line.tdsOverride) ? (
                          <option value={line.tdsOverride}>{line.tdsOverride}</option>
                        ) : null}
                        {codes.map((c) => (
                          <option key={c.code} value={c.code}>
                            {tdsLabel(c)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </FormGrid>
              ) : (
                <FormGrid className="md:grid-cols-3">
                  <Field label="Amount" required error={amountError}>
                    {(f) => (
                      <RupeeInput
                        {...f}
                        placeholder="Enter amount"
                        value={line.amount}
                        onChange={(e) => setLine(line.id, { amount: e.target.value })}
                      />
                    )}
                  </Field>
                  {line.glUnknown ? (
                    <Field label="What is it for?" required className="md:col-span-2">
                      {(f) => (
                        <Input
                          {...f}
                          maxLength={254}
                          placeholder="e.g. Diesel for the factory generator, September"
                          value={line.remarks}
                          onChange={(e) => setLine(line.id, { remarks: e.target.value })}
                        />
                      )}
                    </Field>
                  ) : (
                    <Field
                      label="G/L account"
                      required
                      error={lookupError}
                      className="md:col-span-2"
                    >
                      {(f) => glPicker(line, f.id)}
                    </Field>
                  )}
                  <Checkbox
                    className="md:col-span-3"
                    label="I don't know the G/L account"
                    hint="Say what it is for instead: the Payment desk picks the account."
                    checked={line.glUnknown}
                    onChange={(e) =>
                      setLine(line.id, {
                        glUnknown: e.target.checked,
                        // One or the other: a G/L, or what it is for.
                        ...(e.target.checked ? { glAccount: "", glName: "" } : { remarks: "" }),
                      })
                    }
                  />
                </FormGrid>
              )}
            </fieldset>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {atPayment ? (
            <span />
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={lines.length >= MAX_EXPENSE_LINES}
              onClick={() => onChange({ expenseLines: [...lines, newExpenseLine()] })}
            >
              <HiOutlinePlus className="size-4" aria-hidden="true" />
              Add line
            </Button>
          )}
          <p className="m-0 text-[13px] text-body" data-slot="expense-total">
            Total <span className="font-semibold text-ink">{formatINR(expenseTotal(lines))}</span>
            {atPayment ? (
              <>
                {" "}
                · TDS {formatINR(expenseTds(form, rateOf))} · Paid{" "}
                <span className="font-semibold text-ink">
                  {formatINR(expenseNet(form, rateOf))}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </FormSection>
  );
}
