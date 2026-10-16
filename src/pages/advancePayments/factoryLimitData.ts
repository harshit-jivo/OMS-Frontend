/**
 * The Factory daily limit's data for the request form and the page: the
 * query, and why an amount cannot be raised today. Kept apart from the
 * components (`FactoryLimit.tsx`) so fast refresh keeps working.
 */
import { useQuery } from "@tanstack/react-query";

import {
  advancePaymentService,
  type FactoryLimit,
  type FactoryLimitCompany,
} from "../../services/advancePaymentService";
import { FACTORY_LIMIT_COMPANIES, countsAgainstFactoryLimit, formatINR } from "./rules";

/**
 * Switched off for now (user, 2026-10-16): the request form neither shows the
 * limit nor holds Submit back. Turn on with the server's
 * `ADVANCE_PAYMENT_FACTORY_LIMIT` setting, and the menu link in `navigation.ts`.
 */
export const FACTORY_DAILY_LIMIT_ON = false;

export const FACTORY_LIMIT_KEY = ["advance-payments", "factory-limit"] as const;

export const COMPANY_LABEL: Record<string, string> = { OIL: "Oil", BEVERAGES: "Beverages" };

/** Today's limit for the company, read only when the request counts against it. */
export function useFactoryLimit(company: string, budget: string, purpose: string, enabled = true) {
  const counts =
    FACTORY_DAILY_LIMIT_ON && enabled && countsAgainstFactoryLimit(company, budget, purpose);
  const query = useQuery({
    queryKey: [...FACTORY_LIMIT_KEY, company],
    queryFn: () => advancePaymentService.factoryLimit(company as FactoryLimitCompany),
    enabled: counts && FACTORY_LIMIT_COMPANIES.includes(company),
    staleTime: 30_000,
    retry: 1,
  });
  return { counts, query };
}

/** Why `amount` cannot be raised today, or null. */
export function factoryLimitError(data: FactoryLimit | undefined, amount: number): string | null {
  if (!data?.enabled || !data.limit || data.left === null || amount <= 0) return null;
  const left = Number(data.left);
  if (amount <= left) return null;
  return (
    `This request (${formatINR(amount)}) is ${formatINR(amount - left)} over today's Factory limit for ` +
    `${COMPANY_LABEL[data.company] ?? data.company}: ${formatINR(Number(data.limit.amount))}, ` +
    `${formatINR(Number(data.used))} already raised, ${formatINR(left)} left.`
  );
}
