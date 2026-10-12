/**
 * The payee's current balance in SAP, read fresh: Cr is payable to them, Dr
 * is owed by them (advances paid and not yet settled).
 *
 * Shown on the approval desk only, from the Payment stage on
 * (`requestLabels.showsBalance`):
 * it is what Payment, Audit and Final weigh a payment against, and it is
 * NOT shown to the requester while they raise it. Vendors and Employee
 * Imprest accounts are business partners and have one; an Employee advance
 * is paid to a G/L account, which the desk does not read here.
 *
 * Beside it, the balance in Oil / Beverages — only where the SAME card code
 * is the SAME business there (same PAN, else same name): a code can be
 * another partner in the other company (`sap_relations.partner_balances`).
 */
import { useQuery } from "@tanstack/react-query";

import { DetailField, DetailGrid } from "../../components/ui/detail";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
} from "../../services/advancePaymentService";
import type { AdvanceRequestEntry } from "./approvalData";
import { balanceSide, formatINR } from "./rules";

const COMPANY_NAME: Record<string, string> = { OIL: "Oil", BEVERAGES: "Beverages", MART: "Mart" };

export function PartnerBalance({ entry }: { entry: AdvanceRequestEntry }) {
  const company = entry.form.company as AdvancePaymentCompany;
  const cardCode = entry.form.partner;
  const who = entry.form.type === "EMPLOYEE_IMPREST" ? "the imprest holder" : "the vendor";
  const query = useQuery({
    queryKey: ["advance-payments", "partner-balance", company, cardCode],
    queryFn: async () => {
      // The partner lookup searches names AND codes; keep the exact code.
      const rows = await advancePaymentService.vendors(company, cardCode, 50);
      return rows.find((row) => row.card_code === cardCode) ?? null;
    },
    staleTime: 60_000,
    retry: 1,
  });
  const balance = query.data ? balanceSide(query.data.balance, who) : null;
  const others = useQuery({
    queryKey: ["advance-payments", "partner-balances", company, cardCode],
    queryFn: async () =>
      (await advancePaymentService.partnerBalances(company, cardCode)).filter((row) => row.company !== company),
    staleTime: 60_000,
    retry: 1,
  });

  return (
    <DetailGrid>
      <DetailField
        label="Current Balance"
        strong
        value={
          query.isError
            ? advancePaymentError(query.error)
            : balance
              ? (
                  <span
                    data-slot="partner-balance"
                    className={balance.side === "Cr" ? "text-bad" : balance.side === "Dr" ? "text-ok" : undefined}
                  >
                    {formatINR(balance.amount)}
                    {balance.side ? ` ${balance.side}` : ""}
                  </span>
                )
              : query.isFetching
                ? "Loading…"
                : "Not found in SAP"
        }
      />
      {(others.data ?? []).map((row) => {
        const side = row.balance != null ? balanceSide(row.balance, who) : null;
        return (
          <DetailField
            key={row.company}
            label={`Balance in ${COMPANY_NAME[row.company] ?? row.company}`}
            strong
            value={
              row.error ? (
                <span className="text-subtle">Could not read SAP</span>
              ) : side ? (
                <span className={side.side === "Cr" ? "text-bad" : side.side === "Dr" ? "text-ok" : undefined}>
                  {formatINR(side.amount)}
                  {side.side ? ` ${side.side}` : ""}
                </span>
              ) : (
                "—"
              )
            }
          />
        );
      })}
    </DetailGrid>
  );
}
