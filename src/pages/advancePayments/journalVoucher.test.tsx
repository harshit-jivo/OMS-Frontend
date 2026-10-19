/**
 * Accounts quote a journal entry by its Journal Voucher ("JV 7101"); OMS lists
 * it by the journal entry's own number. The JV is shown beside it and found by
 * the picker's search (user, 2026-10-19).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { SapLedgerDocument } from "../../services/advancePaymentService";
import { ReferenceDetails } from "./PaymentSections";
import { allocationTotals } from "./rules";
import { ledgerToDocument } from "./sapMapping";

/** Two open journal credits on Ziyaul Haque's imprest account (Oil), as SAP lists them. */
function credit(transId: number, docNum: string, voucher: number | null, open: string): SapLedgerDocument {
  return {
    trans_id: transId,
    line_id: 1,
    doc_type_code: 30,
    doc_type: "Journal Entry",
    doc_entry: null,
    doc_num: docNum,
    party_ref: "",
    voucher_num: voucher,
    document_date: "2026-10-01",
    posting_date: "2026-10-01",
    due_date: "2026-10-01",
    direction: "CREDIT",
    total_amount: open,
    open_amount: open,
    settled_amount: "0",
    currency: "INR",
    remarks: "trf to ziyaul sir",
  } as SapLedgerDocument;
}

const JV_7101 = credit(239206, "1026900015", 7101, "35988");
const JV_7049 = credit(237985, "926900080", 7049, "10169");
const NO_JV = credit(99878, "325920043", null, "0.56");

describe("a journal entry's Journal Voucher", () => {
  it("is shown as its reference, and absent when it was posted directly", () => {
    expect(ledgerToDocument(JV_7101, "ORGV000044", "employee")!.reference).toBe("JV 7101");
    expect(ledgerToDocument(NO_JV, "ORGV000044", "employee")!.reference).toBeUndefined();
  });

  it("finds the entry when its JV number is searched", async () => {
    const documents = [JV_7101, JV_7049, NO_JV].map((d) => ledgerToDocument(d, "ORGV000044", "employee")!);
    const user = userEvent.setup();
    render(
      <ReferenceDetails
        kind="IMPREST_JOURNAL"
        documents={documents}
        value={[]}
        onChange={() => {}}
        hasPartner
        partnerLabel="Employee"
        live
        rows={[]}
        totals={allocationTotals([])}
        onAllocationChange={() => {}}
      />,
    );

    await user.click(screen.getByLabelText(/^Journal Entries/));
    await user.type(screen.getByPlaceholderText("Search journal entry or JV number…"), "7101");
    const options = within(screen.getByRole("group")).getAllByRole("checkbox");
    expect(options).toHaveLength(1);
    const row = options[0].closest("label")!;
    expect(row.textContent).toContain("1026900015");
    expect(row.textContent).toContain("Ref JV 7101");
  });
});
