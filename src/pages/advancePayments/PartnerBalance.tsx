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
 * Each balance says where the payee STANDS in words under the amount:
 * payable to them (Cr), receivable from them (Dr), or nothing outstanding —
 * and for how many days it has been on that side (from its SAP ledger:
 * `sap_relations.standing`).
 *
 * Beside it, the balance in Oil / Beverages wherever the same business is
 * there, under the same card code or another one, found by GSTIN, PAN, bank
 * account or name (`sap_relations.partner_balances`). Another code is shown
 * beside the company.
 */
import { useQuery } from "@tanstack/react-query";

import { DetailField, DetailGrid } from "../../components/ui/detail";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapPartnerCompanyBalance,
} from "../../services/advancePaymentService";
import type { AdvanceRequestEntry } from "./approvalData";
import { balanceSide, formatDate, formatINR } from "./rules";

const COMPANY_NAME: Record<string, string> = { OIL: "Oil", BEVERAGES: "Beverages", MART: "Mart" };

/** "for 51 days (since 24 Aug 2026)", "since today", or nothing when it is not known. */
export function standingFor(days: number | null | undefined, since: string | null | undefined): string {
  if (days == null || !since) return "";
  if (days <= 0) return "since today";
  return `for ${days} day${days === 1 ? "" : "s"} (since ${formatDate(since)})`;
}

/** The amount with its side, and under it where the payee stands, and for how long. */
function BalanceValue({
  side,
  standing = null,
  primary = false,
}: {
  side: ReturnType<typeof balanceSide>;
  standing?: SapPartnerCompanyBalance | null;
  primary?: boolean;
}) {
  const howLong = side.side ? standingFor(standing?.days, standing?.since) : "";
  return (
    <span className="flex flex-col">
      <span
        data-slot={primary ? "partner-balance" : undefined}
        className={side.side === "Cr" ? "text-bad" : side.side === "Dr" ? "text-ok" : undefined}
      >
        {formatINR(side.amount)}
        {side.side ? ` ${side.side}` : ""}
      </span>
      <span data-slot="partner-stand" className="text-xs font-normal text-subtle">
        {side.meaning}
        {howLong ? ` ${howLong}` : ""}
      </span>
    </span>
  );
}

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
  const companies = useQuery({
    queryKey: ["advance-payments", "partner-balances", company, cardCode],
    queryFn: () => advancePaymentService.partnerBalances(company, cardCode),
    staleTime: 60_000,
    retry: 1,
  });
  const own = (companies.data ?? []).find((row) => row.matched_by === "self") ?? null;
  const others = (companies.data ?? []).filter((row) => row.company !== company);

  return (
    <DetailGrid>
      <DetailField
        label="Current Balance"
        strong
        value={
          query.isError
            ? advancePaymentError(query.error)
            : balance
              ? <BalanceValue side={balance} standing={own} primary />
              : query.isFetching
                ? "Loading…"
                : "Not found in SAP"
        }
      />
      {others.map((row) => {
        const side = row.balance != null ? balanceSide(row.balance, who) : null;
        const company = COMPANY_NAME[row.company] ?? row.company;
        return (
          <DetailField
            key={`${row.company}:${row.card_code}`}
            label={row.card_code === cardCode ? `Balance in ${company}` : `Balance in ${company} (${row.card_code})`}
            strong
            value={
              row.error ? (
                <span className="text-subtle">Could not read SAP</span>
              ) : side ? (
                <BalanceValue side={side} standing={row} />
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
