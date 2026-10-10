/**
 * The vendor's money paid but not yet adjusted, from their SAP ledger.
 *
 * Shown beside a vendor's POs (raising Against PO, and on the desk from
 * Payment on). A payment made straight in SAP "on account" is linked to no
 * PO, so the PO's open amount never falls by it — OMS cannot tell which PO it
 * was for, and so deducts NOTHING (decided 2026-10-07). It shows the ledger
 * instead, so whoever raises or approves an advance can see "₹8,02,400 already
 * paid on 6 Oct" before paying the same PO again.
 *
 * Only beside POs OMS tracks: created in SAP on or after the cut-off
 * (`ADVANCE_PAYMENT_TRACK_FROM`, 6 Oct 2026). For older POs nothing is shown
 * (decided 2026-10-07), and nothing shows until a PO is chosen.
 */
import { useQuery } from "@tanstack/react-query";

import { Notice } from "../../components/ui/page";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
} from "../../services/advancePaymentService";

import { formatDate, formatINR } from "./rules";

export function VendorOnAccount({
  company,
  cardCode,
  poEntries,
}: {
  company: AdvancePaymentCompany | "" | null | undefined;
  cardCode: string;
  /** The POs in question (DocEntries). None chosen: nothing is shown. */
  poEntries: number[];
}) {
  const entries = [...poEntries].filter((e) => Number.isFinite(e) && e > 0).sort((a, b) => a - b);
  const query = useQuery({
    queryKey: ["advance-payments", "vendor-on-account", company, cardCode, entries.join(",")],
    queryFn: () => advancePaymentService.vendorOnAccount(company as AdvancePaymentCompany, cardCode, entries),
    enabled: Boolean(company && cardCode && entries.length),
    staleTime: 60_000,
    retry: false,
  });

  if (!company || !cardCode || entries.length === 0 || query.isPending) return null;
  if (query.isError) {
    return (
      <Notice tone="hold" title="Vendor ledger">
        Could not read the vendor&apos;s on-account payments from SAP: {advancePaymentError(query.error)}
      </Notice>
    );
  }
  const rows = query.data.results;
  // Every PO in question predates the cut-off: OMS does not reconcile those.
  if (!query.data.applies || rows.length === 0) return null;

  const outside = Number(query.data.outside_oms);
  return (
    <Notice tone="hold" title="Already paid on account" data-slot="vendor-on-account">
      {formatINR(Number(query.data.total_open))} on the vendor&apos;s ledger, not yet adjusted against a bill
      {outside > 0 ? <> ({formatINR(outside)} paid outside OMS)</> : null}. Check it is not an advance for this
      PO.
      <ul className="m-0 mt-2 list-none space-y-0.5 p-0 text-[12.5px]">
        {rows.map((row) => (
          <li key={`${row.trans_id}-${row.line_id}`}>
            {formatDate(row.posting_date ?? "")} · {row.doc_type} {row.doc_num} ·{" "}
            <strong className="tabular-nums">{formatINR(Number(row.open))}</strong> open
            {Number(row.paid) !== Number(row.open) ? ` of ${formatINR(Number(row.paid))}` : ""}
            {row.oms_request ? ` · paid by OMS (${row.oms_request})` : " · paid outside OMS"}
          </li>
        ))}
      </ul>
    </Notice>
  );
}

export default VendorOnAccount;
