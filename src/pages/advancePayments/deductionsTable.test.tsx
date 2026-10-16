import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";

import type { AdvanceRequestEntry } from "./approvalData";
import type { OpenDocument } from "./constants";
import { DocumentLines } from "./RequestDetails";
import { EMPTY_ALLOCATION, EMPTY_FORM } from "./rules";

const bill = (entry: number, open: number): OpenDocument => ({
  id: `PCH-${entry}`,
  number: String(609264300 + entry),
  date: "2026-09-20",
  partner: "VENDA001019",
  original: open,
  paid: 0,
  open,
});

const bills = [bill(69, 1161061), bill(80, 728630)];
const entry = {
  form: {
    ...EMPTY_FORM,
    company: "MART",
    type: "VENDOR",
    paymentAgainst: "AGAINST_BILL",
    partner: "VENDA001019",
    selected: bills,
    allocations: Object.fromEntries(bills.map((b) => [b.id, { ...EMPTY_ALLOCATION, amount: String(b.open) }])),
  },
} as unknown as AdvanceRequestEntry;

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  vi.spyOn(advancePaymentService, "documentHistory").mockResolvedValue({
    summary: { reserved: "0", paid: "0", requests: 0 },
    results: [],
  } as never);
});

describe("the desk's bills table, from Payment on", () => {
  it("shows each bill's TDS and debit notes in SAP, and their totals", async () => {
    const lookup = vi.spyOn(advancePaymentService, "documentDeductions").mockResolvedValue([
      { doc_entry: 69, tds: "23695", bills: null, debits: { amount: "8140", notes: [725025903] } },
      { doc_entry: 80, tds: "14870", bills: null, debits: { amount: "0", notes: [] } },
    ]);
    renderPage(<DocumentLines entry={entry} showDeductions />);
    expect(await screen.findByText("Deducted in SAP")).toBeTruthy();
    expect(lookup).toHaveBeenCalledWith("MART", "bill", [69, 80]);
    const first = screen.getByText("609264369").closest("tr")!;
    expect(within(first).getByText(/TDS ₹23,695/)).toBeTruthy();
    expect(within(first).getByText(/Debit note ₹8,140/)).toBeTruthy();
    const total = screen.getByText("Total").closest("tr")!;
    expect(within(total).getByText(/TDS ₹38,565/)).toBeTruthy();
  });

  it("asks SAP nothing before Payment", () => {
    const lookup = vi.spyOn(advancePaymentService, "documentDeductions");
    renderPage(<DocumentLines entry={entry} />);
    expect(screen.queryByText("Deducted in SAP")).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
