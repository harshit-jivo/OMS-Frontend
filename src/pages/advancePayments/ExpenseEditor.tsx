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
 *
 * Paid to a vendor, the Expense is booked in SAP as an A/P invoice (the step
 * after the GRPO; no payment, 2026-10-20), so the desk also sets what the
 * invoice needs: the SAP branch and due date, and — a Service bill — each
 * line's tax code, Variety, State and GST location; an Item bill is copied
 * from its GRPO instead (`GrpoPicker`). No bank details are asked.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { SearchSelect } from "../../components/ui/dropdown";
import { DetailField, DetailGrid } from "../../components/ui/detail";
import { Field, FormGrid, Input, Select } from "../../components/ui/form";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
} from "../../services/advancePaymentService";

import { GST_TAX_CODE } from "./constants";
import { ExpenseDetails, type ExpenseTds } from "./ExpenseDetails";
import { useBudgetOptions } from "./expenseLookups";
import { GrpoFields } from "./GrpoFields";
import { GrpoPicker } from "./GrpoPicker";
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

  // Booked as an A/P invoice: what its fields are picked from.
  const booksInvoice = vendorExpense(form);
  const itemBill = booksInvoice && form.expenseCategory === "ITEM";
  const optionsQuery = useQuery({
    queryKey: ["advance-payments", "ap-invoice-options", company],
    queryFn: () => advancePaymentService.apInvoiceOptions(company!),
    enabled: booksInvoice && company !== null,
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const monthsQuery = useQuery({
    queryKey: ["advance-payments", "expense-months", company],
    queryFn: () => advancePaymentService.expenseMonths(company!),
    enabled: booksInvoice && company !== null,
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const options = optionsQuery.data;
  const branch = options?.branches.find((b) => String(b.bpl_id) === form.expenseBranch);
  const companyVariety = monthsQuery.data?.variety ?? "";

  // What SAP can say is filled in, never over the desk's own choice: the
  // branch SAP books most service bills to, and on each line the company's
  // Variety, the branch's State and the tax code of its recorded GST.
  useEffect(() => {
    if (!booksInvoice || !options) return;
    const patch: Partial<RequestForm> = {};
    const fallback = options.branches.find((b) => b.bpl_id === options.default_branch);
    const theBranch = branch ?? (form.expenseBranch ? undefined : fallback);
    if (!form.expenseBranch && fallback) {
      patch.expenseBranch = String(fallback.bpl_id);
      patch.expenseBranchName = fallback.name;
    }
    if (!itemBill) {
      let touched = false;
      const lines = form.expenseLines.map((line) => {
        const next = { ...line };
        if (!next.variety && companyVariety && options.varieties.some((v) => v.code === companyVariety)) {
          next.variety = companyVariety;
        }
        if (!next.state && theBranch?.state && options.states.some((s) => s.code === theBranch.state)) {
          next.state = theBranch.state;
        }
        const fromGst = GST_TAX_CODE[next.gstCode];
        if (!next.taxCode && fromGst && options.tax_codes.some((t) => t.code === fromGst)) next.taxCode = fromGst;
        touched ||= next.variety !== line.variety || next.state !== line.state || next.taxCode !== line.taxCode;
        return next;
      });
      if (touched) patch.expenseLines = lines;
    }
    if (Object.keys(patch).length) change(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fills blanks once the lists are read
  }, [booksInvoice, itemBill, options, companyVariety, form.expenseBranch]);

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
      {/* Paid to a vendor: the bill, booked in SAP as an A/P invoice. */}
      {booksInvoice ? (
        <FormSection
          title="Bill — A/P invoice"
          description="Booked in SAP as the vendor's A/P invoice when Expense Audit approves; the payment is made against it later. Check it against the attachment."
        >
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
            <Field label="Bill Number" required hint="The Vendor Ref. No.; SAP keeps it in capitals.">
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
            <Field
              label="Branch"
              required
              error={optionsQuery.isError ? advancePaymentError(optionsQuery.error) : undefined}
              hint="The SAP branch the invoice is booked to; its series follows."
            >
              {(f) => (
                <Select
                  {...f}
                  value={form.expenseBranch}
                  disabled={!options}
                  onChange={(e) =>
                    change({
                      expenseBranch: e.target.value,
                      expenseBranchName:
                        options?.branches.find((b) => String(b.bpl_id) === e.target.value)?.name ?? "",
                    })
                  }
                >
                  <option value="" disabled hidden>
                    {optionsQuery.isFetching ? "Reading SAP…" : "Choose the branch"}
                  </option>
                  {form.expenseBranch && !branch ? (
                    <option value={form.expenseBranch}>{form.expenseBranchName || form.expenseBranch}</option>
                  ) : null}
                  {options?.branches.map((b) => (
                    <option key={b.bpl_id} value={String(b.bpl_id)}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Due Date" hint="Blank: SAP works it out from the vendor's payment terms.">
              {(f) => (
                <Input
                  {...f}
                  type="date"
                  min={form.expenseBillDate || undefined}
                  value={form.expenseDueDate}
                  onChange={(e) => change({ expenseDueDate: e.target.value })}
                />
              )}
            </Field>
          </FormGrid>
        </FormSection>
      ) : null}
      {itemBill ? (
        <FormSection
          title="GRPO"
          description="An Item bill is booked by copying its GRPO: the one whose vendor ref is the bill number, or one you pick."
        >
          <GrpoPicker company={company} form={form} onChange={change} />
        </FormSection>
      ) : null}
      {itemBill && form.expenseGrpoEntry ? (
        <FormSection
          title="GRPO Details"
          description="Everything the GRPO carries, as the A/P invoice will get it: correct the bilty, transport and litres for this bill; the rest stay as the GRPO has them."
        >
          <GrpoFields
            company={company}
            docEntry={form.expenseGrpoEntry}
            changes={form.expenseGrpoFields}
            onChange={(expenseGrpoFields) => change({ expenseGrpoFields })}
          />
        </FormSection>
      ) : null}
      <ExpenseDetails
        company={company}
        form={form}
        onChange={change}
        atPayment
        tds={tds}
        apInvoice={booksInvoice && !itemBill ? options : undefined}
        branchLocation={branch?.location ?? null}
        description={
          booksInvoice && !itemBill
            ? "Every line needs its G/L account, month, SAP tax code, Variety and State. TDS is SAP's withholding on the invoice: one code for it. Changes are saved as edited at Accounts, by you."
            : "Every line needs its G/L account and a month before approving. GST and TDS are yours to set; TDS is on the taxable amount. Changes are saved as edited at Payment, by you."
        }
      />
    </div>
  );
}
