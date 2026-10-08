/**
 * The Payment desk's correction of an Expense request.
 *
 * The requester's own — company, budget head, who is paid and every amount —
 * are shown, not edited (return the request to change one). The desk sets the
 * Sub Budget and Month, and each line's G/L, GST, month, TDS and remarks. The
 * server checks it as it checks the requester's form, and logs it as "Edited
 * at Payment" with who made each change (`ExpenseEditHistory`).
 */
import { SearchSelect } from "../../components/ui/dropdown";
import { DetailField, DetailGrid } from "../../components/ui/detail";
import { Field, FormGrid } from "../../components/ui/form";
import {
  advancePaymentError,
  type AdvancePaymentCompany,
} from "../../services/advancePaymentService";

import { ExpenseDetails, type ExpenseTds } from "./ExpenseDetails";
import { useBudgetOptions } from "./expenseLookups";
import { FormSection } from "./PaymentSections";
import { applyChange, type RequestForm } from "./rules";

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
        description="As raised: return the request to change these."
      >
        <DetailGrid>
          <DetailField label="Company" value={form.company} />
          <DetailField label="Department" value={form.budgetName || form.budget} />
          <DetailField label="Pay To" value={form.payee} hint={form.partner || undefined} />
        </DetailGrid>
        <FormGrid className="md:grid-cols-2">
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
