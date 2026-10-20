/**
 * An Expense paid to a vendor names the bill it pays (user, 2026-10-20).
 *
 * The REQUESTER gives the vendor's Bill Number and its Doc Date (the date on
 * the bill), and attaches the bill (the form refuses Submit without a file).
 * What SAP knows is filled in for them, not shown: the bill's category (Item
 * or Service, how SAP books this vendor's bills — the newest when it has
 * both), and the first line's G/L account from that category's latest bill,
 * unless they chose another there. The Accounts desk sees and sets the
 * category (`ExpenseEditor`); the expense type follows from the G/L account
 * and is not asked of anyone.
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { Field, Input } from "../../components/ui/form";
import { advancePaymentService, type AdvancePaymentCompany } from "../../services/advancePaymentService";

import { formatDate, type RequestForm } from "./rules";

export function VendorExpenseBill({
  company,
  form,
  onChange,
  today,
}: {
  company: AdvancePaymentCompany | null;
  form: RequestForm;
  onChange: (patch: Partial<RequestForm>) => void;
  today: string;
}) {
  const vendor = form.partner;
  const history = useQuery({
    queryKey: ["advance-payments", "vendor-expense-history", company, vendor],
    queryFn: () => advancePaymentService.vendorExpenseHistory(company!, vendor),
    enabled: Boolean(company && vendor),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const rows = history.data ?? [];
  // The newest category with an expense account on its latest bill — else the newest at all.
  const withAccount = rows.find((r) => r.accounts.length > 0);
  const newest = (withAccount ?? rows[0])?.category ?? "";

  // The category SAP books this vendor's bills in, until the desk says otherwise.
  useEffect(() => {
    if (newest && !form.expenseCategory) onChange({ expenseCategory: newest });
  }, [newest, form.expenseCategory, onChange]);

  // The G/L of that category's latest bill — or, if it has none, of the latest
  // bill that has one — onto the first line, as soon as the vendor is picked;
  // not over a G/L the requester chose there themselves.
  const chosen = rows.find((r) => r.category === form.expenseCategory && r.accounts.length > 0) ?? withAccount;
  const latest = chosen?.accounts[0];
  const first = form.expenseLines[0];
  const filled = useRef("");
  useEffect(() => {
    if (!latest || !first) return;
    if (first.glAccount === latest.code) return;
    if (first.glAccount && first.glAccount !== filled.current) return;
    filled.current = latest.code;
    onChange({
      expenseLines: [
        { ...first, glAccount: latest.code, glName: latest.name, glUnknown: false },
        ...form.expenseLines.slice(1),
      ],
    });
  }, [latest, first, form.expenseLines, onChange]);

  const note = !vendor
    ? ""
    : history.isFetching
      ? "Reading this vendor's bills in SAP…"
      : history.isError
        ? "Could not read this vendor's bills in SAP: choose the G/L account below."
        : latest && chosen?.bill
          ? `G/L ${latest.code} ${latest.name} filled in from the vendor's latest bill in SAP, ` +
            `${chosen.bill.doc_num}${chosen.bill.doc_date ? ` of ${formatDate(chosen.bill.doc_date)}` : ""}.`
          : "No expense bill from this vendor in SAP yet: choose the G/L account below.";

  return (
    <>
      {note ? (
        <p className="m-0 text-[12px] text-subtle md:col-span-3" data-slot="vendor-gl-note">
          {note}
        </p>
      ) : null}
      <Field label="Bill Number" required hint="The vendor's own number on the bill.">
        {(f) => (
          <Input
            {...f}
            value={form.expenseBillNumber}
            maxLength={100}
            onChange={(e) => onChange({ expenseBillNumber: e.target.value })}
          />
        )}
      </Field>

      <Field label="Doc Date" required hint="The date on the bill. Attach the bill below.">
        {(f) => (
          <Input
            {...f}
            type="date"
            max={today}
            value={form.expenseBillDate}
            onChange={(e) => onChange({ expenseBillDate: e.target.value })}
          />
        )}
      </Field>
    </>
  );
}
