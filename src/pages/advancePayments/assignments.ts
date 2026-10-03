/**
 * Bills and POs sent to this user: the open list, and the request form filled
 * from one of them.
 */
import { useQuery } from "@tanstack/react-query";

import { advancePaymentService, type ApiAssignment } from "../../services/advancePaymentService";

import { EMPTY_FORM, applyChange, availableOf, type RequestForm } from "./rules";
import { invoiceToDocument, purchaseOrderToDocument } from "./sapMapping";

export const ASSIGNED_KEY = ["advance-payments", "assignments", "mine", "OPEN"] as const;

/** The open assignments sent to me. */
export function useAssignedToMe() {
  return useQuery({
    queryKey: ASSIGNED_KEY,
    queryFn: () => advancePaymentService.assignments("mine", "OPEN"),
    staleTime: 30_000,
  });
}

/**
 * The request form, filled from the assigned document AS SAP HAS IT NOW:
 * company, Vendor, Against Bill / PO, the vendor and the document. The
 * amount and the rest are the requester's. Throws a sentence when the
 * document is no longer open, or other OMS requests already hold all of it.
 */
export async function formFromAssignment(a: ApiAssignment): Promise<RequestForm> {
  const label = `${a.kind === "BILL" ? "Bill" : "PO"} ${a.sap_doc_num}`;
  const documents =
    a.kind === "BILL"
      ? (await advancePaymentService.openVendorInvoices(a.company, a.card_code)).map((d) =>
          invoiceToDocument(d, a.company),
        )
      : (await advancePaymentService.openVendorPurchaseOrders(a.company, a.card_code)).map((d) =>
          purchaseOrderToDocument(d, a.company),
        );
  const doc = documents.find((d) => d.id === `${a.kind === "BILL" ? "PCH" : "POR"}-${a.sap_doc_entry}`);
  if (!doc) throw new Error(`${label} is no longer open in SAP, or other OMS requests already hold all of it.`);
  if (availableOf(doc) <= 0) throw new Error(`Other OMS requests already hold all of ${label}.`);
  // Through the form's own change rules, answer by answer, as a person picking
  // them would: each step sets up what the next depends on (the document's
  // payment line among them).
  const steps: Array<Partial<RequestForm>> = [
    { company: a.company, type: "VENDOR" },
    { paymentAgainst: a.kind === "BILL" ? "AGAINST_BILL" : "AGAINST_PO" },
    { partner: a.card_code, partnerName: a.card_name },
    { selected: [doc] },
  ];
  return steps.reduce<RequestForm>((form, patch) => applyChange(form, patch), EMPTY_FORM);
}
