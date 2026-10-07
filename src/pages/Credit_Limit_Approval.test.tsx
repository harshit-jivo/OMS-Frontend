import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CreditLimitApproval from "./Credit_Limit_Approval";
import { creditLimitService } from "../services/creditLimitService";
import { renderPage } from "../test/renderPage";

/**
 * The Credit Limit approval desk: queue vs history, deciding only from the
 * detail dialog, a reason required to reject, and a SAP refusal shown verbatim
 * with the request left pending.
 */
function request(id: number, status: "PENDING" | "APPROVED") {
  return {
    id,
    company: "OIL",
    card_code: "C00" + id,
    card_name: "Customer " + id,
    main_group: "Retail",
    current_balance: "1500.00",
    current_credit_limit: "50000.00",
    new_credit_limit: "75000.00",
    valid_till: "2099-12-31",
    remarks: "",
    attachments: [{ id: 5, name: "letter.pdf" }],
    invoice_log: null,
    created_by_username: "mukesh",
    created_at: "2026-10-01T10:00:00Z",
    flow: {
      status,
      workflow_code: "CL_OIL",
      current_stage_name: status === "PENDING" ? "Finance" : "",
      current_stage_sequence: status === "PENDING" ? 1 : null,
      current_user_username: status === "PENDING" ? "tannu" : "",
      total_stage: 1,
      sap_response: "",
      updated_at: "2026-10-01T10:00:00Z",
    },
  };
}

function stub() {
  vi.spyOn(creditLimitService, "approvalQueue").mockResolvedValue(
    [request(31, "PENDING")] as never,
  );
  vi.spyOn(creditLimitService, "approvalHistory").mockResolvedValue(
    [request(30, "APPROVED")] as never,
  );
  vi.spyOn(creditLimitService, "history").mockResolvedValue({
    actions: [],
    stages: [
      {
        stage_id: 1, sequence: 1, stage_name: "Finance", status: "AWAITING",
        reviewer: "tannu", acted_by: "", acted_at: null, remarks: "",
      },
    ],
  } as never);
  vi.spyOn(creditLimitService, "approve").mockResolvedValue(
    { ...request(31, "APPROVED") } as never,
  );
  vi.spyOn(creditLimitService, "reject").mockResolvedValue({} as never);
}

async function openDetail(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /^view$/i }));
  return screen.findByRole("dialog");
}

describe("CreditLimitApproval", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stub();
  });

  it("opens on the queue and switches to history", async () => {
    const user = userEvent.setup();
    renderPage(<CreditLimitApproval />);

    expect(await screen.findByText("Customer 31")).toBeTruthy();
    expect(creditLimitService.approvalQueue).toHaveBeenCalledWith({});
    expect(creditLimitService.approvalHistory).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: /history/i }));
    expect(await screen.findByText("Customer 30")).toBeTruthy();

    await user.click(screen.getByRole("radio", { name: "Approved" }));
    await waitFor(() =>
      expect(creditLimitService.approvalHistory).toHaveBeenLastCalledWith({
        status: "APPROVED",
      }),
    );
  });

  it("decides only from the detail dialog, which shows the limits", async () => {
    const user = userEvent.setup();
    renderPage(<CreditLimitApproval />);
    await screen.findByText("Customer 31");
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();

    const dialog = await openDetail(user);
    expect(within(dialog).getByText("Current limit")).toBeTruthy();
    expect(within(dialog).getByText("New limit")).toBeTruthy();
    expect(within(dialog).getByText("Main group")).toBeTruthy();
    expect(await within(dialog).findByText("Awaiting review")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /^approve$/i })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /^reject$/i })).toBeTruthy();
  });

  it("offers no decision on a request from history", async () => {
    const user = userEvent.setup();
    renderPage(<CreditLimitApproval />);
    await screen.findByText("Customer 31");
    await user.click(screen.getByRole("tab", { name: /history/i }));
    await screen.findByText("Customer 30");

    const dialog = await openDetail(user);
    expect(within(dialog).queryByRole("button", { name: /^approve$/i })).toBeNull();
  });

  it("requires a reason to reject", async () => {
    const user = userEvent.setup();
    renderPage(<CreditLimitApproval />);
    const dialog = await openDetail(user);
    await user.click(within(dialog).getByRole("button", { name: /^reject$/i }));

    const decision = await screen.findByRole("dialog", { name: /reject credit limit/i });
    await user.click(within(decision).getByRole("button", { name: /^reject$/i }));
    expect(within(decision).getByText(/give a reason/i)).toBeTruthy();
    expect(creditLimitService.reject).not.toHaveBeenCalled();

    await user.type(within(decision).getByLabelText(/reason for rejection/i), "Overdue");
    await user.click(within(decision).getByRole("button", { name: /^reject$/i }));
    await waitFor(() =>
      expect(creditLimitService.reject).toHaveBeenCalledWith(31, "Overdue"),
    );
    expect(await screen.findByText(/request #31 rejected/i)).toBeTruthy();
  });

  it("approves, and says when the limit reached SAP", async () => {
    const user = userEvent.setup();
    renderPage(<CreditLimitApproval />);
    const dialog = await openDetail(user);
    await user.click(within(dialog).getByRole("button", { name: /^approve$/i }));

    const decision = await screen.findByRole("dialog", { name: /approve credit limit/i });
    await user.click(within(decision).getByRole("button", { name: /^approve$/i }));

    await waitFor(() => expect(creditLimitService.approve).toHaveBeenCalledWith(31, ""));
    expect(await screen.findByText(/new credit limit is set in sap/i)).toBeTruthy();
  });

  it("shows SAP's refusal and keeps the dialog open", async () => {
    vi.spyOn(creditLimitService, "approve").mockRejectedValue({
      response: {
        status: 502,
        data: {
          success: false,
          message: "SAP refused the new credit limit.",
          errors: { sap: "Credit limit exceeds the allowed maximum" },
        },
      },
    });
    const user = userEvent.setup();
    renderPage(<CreditLimitApproval />);
    const dialog = await openDetail(user);
    await user.click(within(dialog).getByRole("button", { name: /^approve$/i }));

    const decision = await screen.findByRole("dialog", { name: /approve credit limit/i });
    await user.click(within(decision).getByRole("button", { name: /^approve$/i }));

    expect(
      await within(decision).findByText(/SAP refused the new credit limit\./),
    ).toBeTruthy();
    expect(within(decision).getByText(/allowed maximum/)).toBeTruthy();
  });
  it("opens the request a notification links to", async () => {
    vi.spyOn(creditLimitService, "getRequest").mockResolvedValue(request(21, "PENDING") as never);
    renderPage(<CreditLimitApproval />, { route: "/Credit_Limit_Approval?request=21" });

    const dialog = await screen.findByRole("dialog");
    expect(creditLimitService.getRequest).toHaveBeenCalledWith(21);
    expect(within(dialog).getByRole("button", { name: /^approve$/i })).toBeTruthy();
  });
});
