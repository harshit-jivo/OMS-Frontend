/**
 * Expense lookups shared by the form (`ExpenseDetails`) and the desk
 * (`RequestDetails.ExpenseLines`): SAP's expense G/L accounts, and how an
 * Effective Month code reads.
 */
import { useQuery } from "@tanstack/react-query";

import {
  SAP_MAX_ROWS,
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapExpenseAccount,
} from "../../services/advancePaymentService";

import { PARTNER_CODE_PREFIX } from "./rules";
import { vendorToPartner, withCodePrefix } from "./sapMapping";

/**
 * The company's expense G/L accounts of one kind (direct or indirect), as
 * picker options. Shared with the desk.
 */
export function useExpenseAccounts(
  company: AdvancePaymentCompany | null,
  kind: "DIRECT" | "INDIRECT" | null,
) {
  const query = useQuery({
    queryKey: ["advance-payments", "expense-accounts", company],
    queryFn: () => advancePaymentService.expenseAccounts(company!),
    enabled: company !== null,
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const accounts = (query.data ?? []).filter((a) => !kind || a.kind === kind);
  return { query, accounts, options: accountOptions(accounts) };
}

export function accountOptions(accounts: SapExpenseAccount[]) {
  return accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}`, hint: a.group }));
}

/**
 * SAP's TDS codes the Payment desk may deduct (at 1, 2, 5 or 10%), the
 * vendor's own first when one is named; and the rate of a code.
 */
export function useTdsCodes(
  company: AdvancePaymentCompany | null,
  cardCode: string,
  enabled = true,
) {
  const query = useQuery({
    queryKey: ["advance-payments", "tds-options", company, cardCode, ""],
    queryFn: () => advancePaymentService.tdsOptions(company!, cardCode, []),
    enabled: enabled && company !== null,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const codes = query.data?.codes ?? [];
  const rateOf = (code: string) => {
    const found = codes.find((c) => c.code === code);
    return found ? Number(found.rate) : null;
  };
  return { query, codes, rateOf };
}

/** "10-2026" -> "Oct 2026". */
export function monthLabel(code: string): string {
  const [month, year] = code.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return Number.isNaN(date.getTime()) || !year
    ? code
    : date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

/** SAP's vendors (VENDA…) matching `search`: an Expense's optional vendor. */
export function useSapVendors(company: AdvancePaymentCompany | null, search: string) {
  const prefix = PARTNER_CODE_PREFIX.SAP_VENDORS;
  return useQuery({
    queryKey: ["advance-payments", "partners", "SAP_VENDORS", company, search],
    queryFn: async () =>
      withCodePrefix(
        await advancePaymentService.vendors(company!, search || prefix || "", SAP_MAX_ROWS),
        prefix,
      ).map(vendorToPartner),
    enabled: company !== null,
    staleTime: 60_000,
    retry: 1,
  });
}

/** The company's budget heads and sub budgets, as picker options. */
export function useBudgetOptions(company: AdvancePaymentCompany | null) {
  const query = useQuery({
    queryKey: ["advance-payments", "budgets", company],
    queryFn: () => advancePaymentService.budgets(company!),
    enabled: company !== null,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const of = (kind: "BUDGET" | "SUB_BUDGET") =>
    (query.data ?? [])
      .filter((b) => b.kind === kind)
      .map((b) => ({ value: b.code, label: b.name, hint: b.code === b.name ? "" : b.code }));
  return { query, heads: of("BUDGET"), subs: of("SUB_BUDGET") };
}
