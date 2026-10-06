/**
 * TDS at the Payment stage: tick, pick the rate, then the section; the
 * methods follow the net. Blocked where SAP already deducted TDS on a bill;
 * read-only after Payment.
 */
import * as React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { advancePaymentService, type TdsOptions } from "../../services/advancePaymentService";
import { renderPage } from "../../test/renderPage";

import { EMPTY_PAYOUT, netPayable, newPayoutLine, tdsAmountFor, validatePayout, type PayoutDetails } from "./payout";
import { TdsSection, type TdsContext } from "./TdsSection";

const OPTIONS: TdsOptions = {
  rates: ["1", "2", "10"],
  codes: [
    { code: "194C", name: "TDS ON CONTRACTOR HUF INDIVIDUALS @ 1 %", rate: "1", account: "2133003",
      account_name: "", assigned: true },
    { code: "C194", name: "194C TDS ON CONTRACTER- COMPANY", rate: "2", account: "2133006", account_name: "",
      assigned: true },
    { code: "194H", name: "194H TDS ON COMMISSION OR BROKERAGE 2 %", rate: "2", account: "2133007",
      account_name: "", assigned: false },
    { code: "94JB", name: "194J TDS ON PROFESSIONAL SERVICES 10 %", rate: "10", account: "2133005",
      account_name: "", assigned: false },
  ],
  bills_with_tds: [],
};

vi.mock("../../services/advancePaymentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/advancePaymentService")>();
  return { ...actual, advancePaymentService: { tdsOptions: vi.fn(async () => OPTIONS) } };
});

const CONTEXT: TdsContext = { company: "OIL", cardCode: "VENDA000062", bills: [] };

function Harness({ readOnly = false, start }: { readOnly?: boolean; start?: PayoutDetails }) {
  const [value, setValue] = React.useState<PayoutDetails>(
    start ?? { ...EMPTY_PAYOUT, lines: [{ ...newPayoutLine("NEFT"), amount: "100000" }] },
  );
  return (
    <>
      <TdsSection value={value} onChange={setValue} requestAmount={100000} context={CONTEXT} readOnly={readOnly} />
      <output aria-label="state">{JSON.stringify({ tds: value.tds, line: value.lines[0]?.amount })}</output>
    </>
  );
}

const state = () => JSON.parse(screen.getByLabelText("state").textContent ?? "{}");

describe("TDS at the Payment stage", () => {
  it("rounds to the rupee, and the methods pay the rest", () => {
    expect(tdsAmountFor(123456, 2)).toBe(2469);
    const payout = { ...EMPTY_PAYOUT, beneficiaryName: "X", lines: [{ ...newPayoutLine("CASH"), amount: "98000" }],
      tds: { code: "C194", label: "", rate: 2, account: "2133006", amount: 2000 } };
    expect(netPayable(payout, 100000)).toBe(98000);
    expect(validatePayout({ ...payout, lines: [{ ...payout.lines[0], amount: "100000" }] }, 100000).problems)
      .toContain("The payment methods add up to ₹1,00,000, but the request pays ₹98,000 after TDS of ₹2,000.");
  });

  it("is ticked, then a rate, then a section at that rate; the single method follows the net", async () => {
    const user = userEvent.setup();
    renderPage(<Harness />);
    const box = await screen.findByLabelText("Deduct TDS");
    await vi.waitFor(() => expect((box as HTMLInputElement).disabled).toBe(false));
    await user.click(box);
    // The first rate SAP has a code at, and the vendor's code at it.
    expect(state()).toMatchObject({ tds: { code: "194C", rate: 1, amount: 1000 }, line: "99000" });

    await user.selectOptions(screen.getByLabelText(/^TDS Rate/), "2");
    expect(state()).toMatchObject({ tds: { code: "C194", rate: 2, amount: 2000, account: "2133006" }, line: "98000" });
    // Only the sections at 2%, the vendor's own first.
    const sections = [...(screen.getByLabelText(/^TDS Section/) as HTMLSelectElement).options].map((o) => o.value);
    expect(sections).toEqual(["C194", "194H"]);
    await user.selectOptions(screen.getByLabelText(/^TDS Section/), "194H");
    expect(state().tds).toMatchObject({ code: "194H", account: "2133007" });
    expect(screen.getByText("Booked to account 2133007.")).toBeTruthy();

    // No 5%: SAP has no code at it.
    expect([...(screen.getByLabelText(/^TDS Rate/) as HTMLSelectElement).options].map((o) => o.value))
      .toEqual(["1", "2", "10"]);

    await user.click(screen.getByLabelText("Deduct TDS"));
    expect(state()).toMatchObject({ tds: null, line: "100000" });
  });

  it("is blocked where SAP already deducted TDS on a bill", async () => {
    vi.mocked(advancePaymentService.tdsOptions).mockResolvedValueOnce({
      ...OPTIONS, bills_with_tds: [{ doc_entry: 501, doc_num: 126226523, tds: "2400" }],
    });
    renderPage(<Harness />);
    expect(await screen.findByText(/SAP already deducted it on bill 126226523/)).toBeTruthy();
    expect((screen.getByLabelText("Deduct TDS") as HTMLInputElement).disabled).toBe(true);
  });

  it("is read-only after Payment", () => {
    renderPage(
      <Harness
        readOnly
        start={{ ...EMPTY_PAYOUT, tds: { code: "C194", label: "194C TDS ON CONTRACTER- COMPANY", rate: 2,
          account: "2133006", amount: 2000 } }}
      />,
    );
    expect(screen.queryByLabelText("Deduct TDS")).toBeNull();
    expect(screen.getByText(/₹2,000 deducted at 2% under 194C TDS ON CONTRACTER- COMPANY/)).toBeTruthy();
    expect(screen.getByText(/payee receives ₹98,000/)).toBeTruthy();
  });
});
