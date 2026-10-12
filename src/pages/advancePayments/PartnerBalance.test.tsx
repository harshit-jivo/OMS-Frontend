import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";

import type { AdvanceRequestEntry } from "./approvalData";
import { PartnerBalance } from "./PartnerBalance";

const entry = (company: string, partner: string) =>
  ({ form: { company, partner, type: "VENDOR" } }) as unknown as AdvanceRequestEntry;

afterEach(() => vi.restoreAllMocks());

describe("PartnerBalance", () => {
  it("shows the other company's balance when the same code is the same business", async () => {
    vi.spyOn(advancePaymentService, "vendors").mockResolvedValue([
      { card_code: "VENDA000279", balance: "25699905" } as never,
    ]);
    vi.spyOn(advancePaymentService, "partnerBalances").mockResolvedValue([
      { company: "OIL", card_code: "VENDA000279", card_name: "DIL EXIM", balance: "25699905", matched_by: "self" },
      { company: "BEVERAGES", card_code: "VENDA000279", card_name: "DIL EXIM", balance: "-50000", matched_by: "PAN" },
    ]);
    renderPage(<PartnerBalance entry={entry("OIL", "VENDA000279")} />);
    expect(await screen.findByText("Balance in Beverages")).toBeTruthy();
  });

  it("shows the same business under another code, with that code", async () => {
    vi.spyOn(advancePaymentService, "vendors").mockResolvedValue([
      { card_code: "VENDA000948", balance: "-4635" } as never,
    ]);
    vi.spyOn(advancePaymentService, "partnerBalances").mockResolvedValue([
      { company: "BEVERAGES", card_code: "VENDA000948", card_name: "ARNAV", balance: "-4635", matched_by: "self" },
      { company: "OIL", card_code: "VENDA000956", card_name: "ARNAV", balance: "-111404.82", matched_by: "bank account" },
    ]);
    renderPage(<PartnerBalance entry={entry("BEVERAGES", "VENDA000948")} />);
    expect(await screen.findByText("Balance in Oil (VENDA000956)")).toBeTruthy();
  });

  it("shows only its own company when SAP finds no same business elsewhere", async () => {
    vi.spyOn(advancePaymentService, "vendors").mockResolvedValue([
      { card_code: "VENDA001056", balance: "-1703088" } as never,
    ]);
    const balances = vi.spyOn(advancePaymentService, "partnerBalances").mockResolvedValue([
      { company: "BEVERAGES", card_code: "VENDA001056", card_name: "S.N. INDUSTRIES", balance: "-1703088", matched_by: "self" },
    ]);
    renderPage(<PartnerBalance entry={entry("BEVERAGES", "VENDA001056")} />);
    expect(await screen.findByText("Current Balance")).toBeTruthy();
    await vi.waitFor(() => expect(balances).toHaveBeenCalledWith("BEVERAGES", "VENDA001056"));
    expect(screen.queryByText(/^Balance in /)).toBeNull();
  });
});
