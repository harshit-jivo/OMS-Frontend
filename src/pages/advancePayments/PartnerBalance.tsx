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
        hint={balance ? `${balance.meaning}, as SAP holds it now.` : undefined}
      />
    </DetailGrid>
  );
}
