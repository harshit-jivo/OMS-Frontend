import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../services/advancePaymentService";
import { renderPage } from "../test/renderPage";
import Advance_Payment_Register from "./Advance_Payment_Register";
import { apiRequest, logRow } from "./advancePayments/testRequests";

const TARAN = { id: 14, username: "taran", name: "Taran" };

const ROWS = [
  apiRequest(15, {
    partner_name: "Packster Packaging",
    flow: {
      status: "PENDING", workflow: "AP_X", current_stage: "Payment Approval", current_role: "PAYMENT",
      current_user: TARAN, cycle: 1, version: 3, total_stages: 5, awaiting_me: false,
    },
    approvers: [{ username: "bhupinder", name: "Bhupinder Singh" }],
    last_activity: { action: "APPROVED", label: "Approved", by: "Bhupinder Singh", stage: "HOD Approval", on: "2026-10-08T12:00:00+05:30" },
  }),
  apiRequest(16, { partner_name: "Vaishnodevi Refoils", status: "COMPLETED", logs: [logRow("COMPLETED", "Completed")] }),
];

afterEach(() => vi.restoreAllMocks());

describe("All Payment Requests", () => {
  it("lists every request with where it is and who decided, and opens one in full", async () => {
    vi.spyOn(advancePaymentService, "requests").mockResolvedValue(ROWS);
    vi.spyOn(advancePaymentService, "request").mockResolvedValue(ROWS[0]);
    const user = userEvent.setup();
    renderPage(<Advance_Payment_Register />, { route: "/Advance_Payment_Register" });

    const row = (await screen.findByText("AP-2026-0015")).closest("tr")!;
    expect(within(row).getByText("Payment Approval · Taran")).toBeTruthy();
    expect(within(row).getByText("Bhupinder Singh")).toBeTruthy();
    expect(advancePaymentService.requests).toHaveBeenCalledWith("all");
    expect(screen.getByText(/^2 of 2/)).toBeTruthy();

    await user.type(screen.getByRole("searchbox", { name: "Search" }), "Vaishnodevi");
    expect(screen.queryByText("AP-2026-0015")).toBeNull();
    expect(screen.getByText(/^1 of 2/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Clear filters \(1\)/ }));

    await user.click(screen.getByRole("button", { name: "View AP-2026-0015" }));
    expect(await screen.findByRole("heading", { name: "AP-2026-0015" })).toBeTruthy();
    expect(screen.getByText("History")).toBeTruthy();
  });
});
