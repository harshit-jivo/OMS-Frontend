import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService, type ApiRequest } from "../services/advancePaymentService";
import { renderPage } from "../test/renderPage";
import Advance_Payment_Approval from "./Advance_Payment_Approval";
import { apiRequest, logRow } from "./advancePayments/testRequests";

const ME = { id: 7, username: "hod", name: "HOD" };
const DIRECTOR = { id: 8, username: "director", name: "Director" };

function waitingAt(stage: string, user: typeof ME, fields: Partial<ApiRequest> = {}) {
  const base = apiRequest(15);
  return apiRequest(15, {
    flow: {
      status: "PENDING", workflow: "AP_X", current_stage: stage, current_role: "APPROVAL",
      current_user: user, cycle: 1, version: 4, total_stages: 5, awaiting_me: user.id === ME.id,
    },
    my_decision: logRow("APPROVED", "Approved", { actor: ME, stage_name: "HOD Approval" }),
    ...fields,
    can: { ...base.can, ...(fields.can ?? {}) },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("changing a decision", () => {
  it("takes the approval back while the next stage has not decided, then offers the decision again", async () => {
    const atDirector = waitingAt("Director Approval", DIRECTOR, { can: { ...apiRequest(1).can, change_decision: true } });
    const backWithMe = waitingAt("HOD Approval", ME, {
      can: { ...apiRequest(1).can, approve: true, reject: true, return_to_creator: true },
    });
    vi.spyOn(advancePaymentService, "requests").mockResolvedValue([atDirector]);
    vi.spyOn(advancePaymentService, "request").mockResolvedValue(atDirector);
    const act = vi.spyOn(advancePaymentService, "act").mockResolvedValue(backWithMe);
    const user = userEvent.setup();
    renderPage(<Advance_Payment_Approval />, { route: "/Advance_Payment_Approval" });

    await user.click(await screen.findByRole("button", { name: /All entries/ }));
    await user.click(await screen.findByRole("button", { name: "View AP-2026-0015" }));
    expect(await screen.findByText(/^You approved this/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Approve$/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Change decision" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Remarks/), "Wrong vendor");
    await user.click(within(dialog).getByRole("button", { name: "Take back my approval" }));

    expect(act).toHaveBeenCalledWith(15, "change-decision", "Wrong vendor", 4);
    expect(await screen.findByRole("button", { name: /^Approve$/ })).toBeTruthy();
    expect(screen.queryByText(/^You approved this/)).toBeNull();
  });

  it("offers nothing once it has moved further on", async () => {
    const atAudit = waitingAt("Audit Approval", DIRECTOR, { can: { ...apiRequest(1).can, change_decision: false } });
    vi.spyOn(advancePaymentService, "requests").mockResolvedValue([atAudit]);
    vi.spyOn(advancePaymentService, "request").mockResolvedValue(atAudit);
    const user = userEvent.setup();
    renderPage(<Advance_Payment_Approval />, { route: "/Advance_Payment_Approval" });

    await user.click(await screen.findByRole("button", { name: /All entries/ }));
    await user.click(await screen.findByRole("button", { name: "View AP-2026-0015" }));
    await screen.findByRole("heading", { name: "AP-2026-0015" });
    expect(screen.queryByRole("button", { name: "Change decision" })).toBeNull();
  });
});
