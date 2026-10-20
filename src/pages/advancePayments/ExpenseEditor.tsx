/**
 * The Accounts desk's correction of an Expense request (the Payment desk's, before 2026-10-20).
 *
 * The requester's own — company, who is paid and every amount — are shown,
 * not edited (return the request to change one). The desk sets the budget
 * head (Department) and Sub Budget, the Month, the bill's category, number and
 * Doc Date (paid to a vendor, 2026-10-20), and each line's G/L, GST, month,
 * TDS and remarks. The expense type follows from the G/L accounts; the
 * posting date is the day it is posted to SAP — neither is asked. The
 * server checks it as it checks the requester's form, and logs it as "Edited
 * at Payment" with who made each change (`ExpenseEditHistory`).
 */
import { SearchSelect } from "../../components/ui/dropdown";
import { DetailField, DetailGrid } from "../../components/ui/detail";
import { Field, FormGrid, Input, Select } from "../../components/ui/form";
import {
  advancePaymentError,
  type AdvancePaymentCompany,
} from "../../services/advancePaymentService";

import { ExpenseDetails, type ExpenseTds } from "./ExpenseDetails";
import { useBudgetOptions } from "./expenseLookups";
import { FormSection } from "./PaymentSections";
import {
  EXPENSE_CATEGORIES,
  applyChange,
  todayIso,
  vendorExpense,
  type ExpenseCategory,
  type RequestForm,
} from "./rules";

/** Keep a saved choice SAP no longer lists showing, by its saved name. */
function withSaved(
  options: Array<{ value: string; label: string; hint: string }>,
  code: string,
  name: string,
) {
  return code && !options.some((o) => o.value === code)
    ? [{ value: code, label: name || code, hint: "" }, ...options]
    : options;
}

export function ExpenseEditor({
  form,
  onChange,
  tds,
}: {
  form: RequestForm;
  /** The whole form after the change: `applyChange` has cleared what it made stale. */
  onChange: (next: RequestForm) => void;
  /** SAP's TDS codes for this payee. */
  tds: ExpenseTds;
}) {
  const company = (form.company || null) as AdvancePaymentCompany | null;
  const change = (patch: Partial<RequestForm>) => onChange(applyChange(form, patch));
  const budgets = useBudgetOptions(company);
  const budgetError = budgets.query.isError ? advancePaymentError(budgets.query.error) : undefined;

  return (
    <div className="space-y-5" data-slot="expense-editor">
      <FormSection
        title="Payee & Budget"
        description="The company and who is paid are as raised: return the request to change them."
      >
        <DetailGrid>
          <DetailField label="Company" value={form.company} />
          <DetailField label="Pay To" value={form.payee} hint={form.partner || undefined} />
        </DetailGrid>
        <FormGrid className="md:grid-cols-2">
          <Field label="Department" required error={budgetError}>
            {(f) => (
              <SearchSelect<string>
                id={f.id}
                value={form.budget}
                onChange={(next) =>
                  change({ budget: next, budgetName: budgets.heads.find((o) => o.value === next)?.label ?? "" })
                }
                placeholder="Select department"
                searchPlaceholder="Search department…"
                emptyText="No department matches"
                loading={budgets.query.isFetching}
                options={withSaved(budgets.heads, form.budget, form.budgetName)}
              />
            )}
          </Field>
          <Field label="Sub Budget" required error={budgetError}>
            {(f) => (
              <SearchSelect<string>
                id={f.id}
                value={form.subBudget}
                onChange={(next) =>
                  change({
                    subBudget: next,
                    subBudgetName: budgets.subs.find((o) => o.value === next)?.label ?? "",
                  })
                }
                placeholder="Select sub budget"
                searchPlaceholder="Search sub budget…"
                emptyText="No sub budget matches"
                loading={budgets.query.isFetching}
                options={withSaved(budgets.subs, form.subBudget, form.subBudgetName)}
              />
            )}
          </Field>
        </FormGrid>
      </FormSection>
      {/* Paid to a vendor: the bill it pays — how SAP books it, its number, its date. */}
      {vendorExpense(form) ? (
        <FormSection title="Bill" description="The vendor's bill this expense pays: check it against the attachment.">
          <FormGrid className="md:grid-cols-3">
            <Field label="Category" required hint="How SAP books this vendor's bills.">
              {(f) => (
                <Select
                  {...f}
                  value={form.expenseCategory}
                  onChange={(e) => change({ expenseCategory: e.target.value as ExpenseCategory | "" })}
                >
                  <option value="" disabled hidden>
                    Item or Service
                  </option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Bill Number" required>
              {(f) => (
                <Input
                  {...f}
                  value={form.expenseBillNumber}
                  maxLength={100}
                  onChange={(e) => change({ expenseBillNumber: e.target.value })}
                />
              )}
            </Field>
            <Field label="Doc Date" required hint="The date on the bill. Posted to SAP on the day it is posted.">
              {(f) => (
                <Input
                  {...f}
                  type="date"
                  max={todayIso()}
                  value={form.expenseBillDate}
                  onChange={(e) => change({ expenseBillDate: e.target.value })}
                />
              )}
            </Field>
          </FormGrid>
        </FormSection>
      ) : null}
      <ExpenseDetails
        company={company}
        form={form}
        onChange={change}
        atPayment
        tds={tds}
        description="Every line needs its G/L account and a month before approving. GST and TDS are yours to set; TDS is on the taxable amount. Changes are saved as edited at Payment, by you."
      />
    </div>
  );
}
