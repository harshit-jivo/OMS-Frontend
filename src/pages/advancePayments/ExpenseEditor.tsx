/**
 * The Payment desk's correction of an Expense request: direct or indirect,
 * vendor / payee, budget head, sub budget, month, TDS, electricity and every
 * line (taxable amount, GST, G/L, month, TDS, remarks). The server checks it as it checks the requester's form, and logs
 * it as "Edited at Payment" with who made each change (`ExpenseEditHistory`).
 */
import { useState } from "react";

import { SearchSelect } from "../../components/ui/dropdown";
import { Field, FormGrid, Input, Select } from "../../components/ui/form";
import {
  advancePaymentError,
  type AdvancePaymentCompany,
} from "../../services/advancePaymentService";

import { PAYMENT_AGAINST_OPTIONS, type PaymentAgainst } from "./constants";
import { ExpenseDetails, type ExpenseTds } from "./ExpenseDetails";
import { useBudgetOptions, useSapVendors } from "./expenseLookups";
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

const KINDS = PAYMENT_AGAINST_OPTIONS.filter(
  (o) => o.value === "DIRECT_EXPENSE" || o.value === "INDIRECT_EXPENSE",
);

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
  const [search, setSearch] = useState("");
  const vendors = useSapVendors(company, search.trim());
  const budgets = useBudgetOptions(company);
  const vendorOptions = withSaved(
    (vendors.data ?? []).map((v) => ({ value: v.value, label: v.label, hint: v.code })),
    form.partner,
    form.partnerName,
  );
  const budgetError = budgets.query.isError ? advancePaymentError(budgets.query.error) : undefined;

  return (
    <div className="space-y-5" data-slot="expense-editor">
      <FormSection title="Payee & Budget">
        <FormGrid className="md:grid-cols-2">
          <Field
            label="Payment Against"
            required
            hint="Changing it clears the lines' G/L accounts."
          >
            {(f) => (
              <Select
                {...f}
                value={form.paymentAgainst}
                onChange={(e) => change({ paymentAgainst: e.target.value as PaymentAgainst })}
              >
                {KINDS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Vendor"
            hint="Optional — a SAP vendor, if it is one."
            error={vendors.isError ? advancePaymentError(vendors.error) : undefined}
          >
            {(f) => (
              <SearchSelect<string>
                id={f.id}
                value={form.partner}
                onChange={(next) =>
                  change({
                    partner: next,
                    partnerName: vendorOptions.find((o) => o.value === next)?.label ?? "",
                  })
                }
                placeholder="No vendor (optional)"
                searchPlaceholder="Search name or code…"
                clearLabel="No vendor"
                emptyText="No match in SAP"
                onQueryChange={setSearch}
                loading={vendors.isFetching}
                options={vendorOptions}
              />
            )}
          </Field>
          <Field label="Pay To" required>
            {(f) => (
              <Input
                {...f}
                maxLength={200}
                value={form.payee}
                onChange={(e) => change({ payee: e.target.value })}
              />
            )}
          </Field>
          <Field label="Department" required hint="The budget head." error={budgetError}>
            {(f) => (
              <SearchSelect<string>
                id={f.id}
                value={form.budget}
                onChange={(next) =>
                  change({
                    budget: next,
                    budgetName: budgets.heads.find((o) => o.value === next)?.label ?? "",
                  })
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
      <ExpenseDetails
        company={company}
        form={form}
        onChange={change}
        atPayment
        tds={tds}
        description="Every line needs its G/L account and a month before approving; TDS is on the taxable amount. Changes are saved as edited at Payment, by you."
      />
    </div>
  );
}
