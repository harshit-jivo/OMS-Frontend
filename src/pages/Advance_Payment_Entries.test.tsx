/**
 * The creator's Entries list: a pending request says at which stage it waits,
 * and on whom (user, 2026-10-19).
 */
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../services/advancePaymentService";
import { renderPage } from "../test/renderPage";
import Advance_Payment_Request from "./Advance_Payment_Request";
import { apiRequest } from "./advancePayments/testRequests";

const TARAN = { id: 14, username: "taran", name: "Taran" };

const ROWS = [
  apiRequest(184, {
    partner_name: "SBP (FOOD & HYGIENE) PVT LTD",
    flow: {
      status: "PENDING", workflow: "AP_X", current_stage: "Payment Approval", current_role: "PAYMENT",
      current_user: TARAN, cycle: 1, version: 3, total_stages: 5, awaiting_me: false,
    },
  }),
  apiRequest(161, { partner_name: "CVS PACKAGING PRIVATE LIMITED", status: "COMPLETED" }),
];

afterEach(() => vi.restoreAllMocks());

describe("Entries", () => {
  it("shows where a pending request waits and on whom; a settled one shows only its status", async () => {
    vi.spyOn(advancePaymentService, "requests").mockResolvedValue(ROWS);
    renderPage(<Advance_Payment_Request />, { route: "/Advance_Payment_Request" });

    const pending = (await screen.findByText("AP-2026-0184")).closest("tr")!;
    expect(within(pending).getByText("Pending")).toBeTruthy();
    expect(within(pending).getByText("Payment Approval")).toBeTruthy();
    expect(within(pending).getByText("Taran")).toBeTruthy();

    const done = screen.getByText("AP-2026-0161").closest("tr")!;
    expect(within(done).queryByText("Payment Approval")).toBeNull();
    expect(within(done).queryByText("Taran")).toBeNull();
  });
});
