/**
 * The desk's check against SAP now: a PO cut below what the request pays is
 * flagged before Final, with what changed.
 */
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderPage } from "../../test/renderPage";

import { SapCheck } from "./SapCheck";

const CHECK = {
  ok: false,
  changed: true,
  results: [
    {
      document_id: 1, kind: "PO" as const, sap_doc_entry: 14008, sap_line: 0, sap_doc_num: "126226600",
      status: "OPEN" as const, open_when_raised: "100.00", open_now: "50", held_by_others: "0", available_now: "50",
      amount: "60.00", changed: true, ok: false,
      message: "Purchase order 126226600: this request pays 60.00, but only 50 is left — SAP shows 50 open now " +
        "(it was 100.00 when raised).",
    },
  ],
};

vi.mock("../../services/advancePaymentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/advancePaymentService")>();
  return { ...actual, advancePaymentService: { sapCheck: vi.fn(async () => CHECK) } };
});

describe("checked against SAP now", () => {
  it("says what changed and that Final cannot post it as it is", async () => {
    renderPage(<SapCheck requestId={14} />);
    const card = await screen.findByRole("region", { name: "Checked against SAP now" });
    expect(await within(card).findByText("Does not fit any more")).toBeTruthy();
    expect(within(card).getByRole("alert").textContent).toMatch(/Final cannot post it as it is/);
    expect(within(card).getByText(/only 50 is left/)).toBeTruthy();
    expect(within(card).getByText("₹100")).toBeTruthy(); // open when raised
    expect(within(card).getByText("₹60")).toBeTruthy(); // what this request pays
  });
});
