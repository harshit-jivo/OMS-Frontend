import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CreditLimit from "./Credit_Limit";
import { creditLimitService } from "../services/creditLimitService";
import { sapService } from "../services/sapService";
import { renderPage } from "../test/renderPage";

/**
 * The Credit Limit requester page: one or more parties are picked from the
 * synced party table and each is read live from SAP, which gates the form;
 * the document is required for one party and optional for several; a
 * refused line is marked on its row; the detail dialog shows stage progress
 * and history.
 */
const REQUEST = {
  id: 21,
  company: "OIL",
  card_code: "C001",
  card_name: "Sharma Traders",
  main_group: "Retail",
  current_balance: "1500.00",
  current_credit_limit: "50000.00",
  new_credit_limit: "75000.00",
  valid_till: "2099-12-31",
  remarks: "Festive season",
  attachment_name: "letter.pdf",
  invoice_log: null,
  created_by_username: "mukesh",
  created_at: "2026-10-01T10:00:00Z",
  flow: {
    status: "PENDING",
    workflow_code: "CL_OIL",
    current_stage_name: "Finance",
    current_stage_sequence: 1,
    current_user_username: "tannu",
    total_stage: 2,
    sap_response: "",
    updated_at: "2026-10-01T10:00:00Z",
  },
};

const CUSTOMER = {
  card_code: "C001",
  card_name: "Sharma Traders",
  card_type: "C",
  main_group: "Retail",
  balance: "1500.00",
  credit_limit: "50000.00",
};

const PARTIES = [
  // The synced name differs on purpose: the form must show SAP's live one.
  { id: 1, card_code: "C001", card_name: "Sharma Traders (synced)", main_group: "Retail", state: "Punjab" },
  { id: 2, card_code: "C002", card_name: "Gupta Stores", main_group: "Wholesale", state: "Haryana" },
];

function stub() {
  vi.spyOn(sapService, "getPartiesByCategory").mockResolvedValue(PARTIES as never);
  vi.spyOn(creditLimitService, "listRequests").mockResolvedValue([REQUEST] as never);
  vi.spyOn(creditLimitService, "customer").mockImplementation(
    async (_company, code) =>
      (code === "C001"
        ? CUSTOMER
        : { ...CUSTOMER, card_code: code, card_name: "Gupta Stores Pvt" }) as never,
  );
  vi.spyOn(creditLimitService, "createRequest").mockResolvedValue([{ id: 22 }] as never);
  vi.spyOn(creditLimitService, "history").mockResolvedValue({
    actions: [
      {
        action: "CREATE", stage_name: "", acted_by_username: "mukesh",
        remarks: "Festive season", acted_at: "2026-10-01T10:00:00Z",
      },
    ],
    stages: [
      {
        stage_id: 1, sequence: 1, stage_name: "Finance", status: "AWAITING",
        reviewer: "tannu", acted_by: "", acted_at: null, remarks: "",
      },
      {
        stage_id: 2, sequence: 2, stage_name: "Director", status: "UPCOMING",
        reviewer: "navdeep", acted_by: "", acted_at: null, remarks: "",
      },
    ],
  } as never);
}

describe("CreditLimit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stub();
  });

  it("lists my requests and filters by status", async () => {
    const user = userEvent.setup();
    renderPage(<CreditLimit />);

    expect(await screen.findByText("Sharma Traders")).toBeTruthy();
    expect(creditLimitService.listRequests).toHaveBeenCalledWith({});

    await user.click(screen.getByRole("radio", { name: "Approved" }));
    await waitFor(() =>
      expect(creditLimitService.listRequests).toHaveBeenLastCalledWith({
        status: "APPROVED",
      }),
    );
  });

  it("shows stage progress and history in the detail dialog", async () => {
    const user = userEvent.setup();
    renderPage(<CreditLimit />);
    await user.click(await screen.findByRole("button", { name: /^view$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Director")).toBeTruthy();
    expect(within(dialog).getByText("Awaiting review")).toBeTruthy();
    expect(within(dialog).getByText("Not yet reached")).toBeTruthy();
    expect(within(dialog).getByText("Raised")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /letter\.pdf/ })).toBeTruthy();
  });

  /* --- new request: one or more parties ---------------------------- */

  async function openForm(user: ReturnType<typeof userEvent.setup>) {
    renderPage(<CreditLimit />);
    await user.click(await screen.findByRole("tab", { name: /new request/i }));
  }

  /** Tick the given synced names in the picker and add them. */
  async function addParties(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
    await user.click(screen.getByRole("button", { name: /select parties|add more parties/i }));
    const picker = await screen.findByRole("dialog", { name: /select parties/i });
    for (const name of names) await user.click(await within(picker).findByText(name));
    await user.click(within(picker).getByRole("button", { name: /^add (party|\d+ parties)$/i }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /select parties/i })).toBeNull(),
    );
  }

  async function fillLine(
    user: ReturnType<typeof userEvent.setup>,
    code: string,
    limit: string,
  ) {
    await user.type(await screen.findByLabelText(`New credit limit for ${code}`), limit);
    await user.type(screen.getByLabelText(`Valid till for ${code}`), "2099-12-31");
  }

  it("adds several parties at once and reads each one live from SAP", async () => {
    const user = userEvent.setup();
    await openForm(user);
    await user.selectOptions(screen.getByLabelText(/company/i), "BEVERAGES");
    await addParties(user, "Sharma Traders (synced)", "Gupta Stores");

    expect(sapService.getPartiesByCategory).toHaveBeenCalledWith("BEVERAGES");
    expect(creditLimitService.customer).toHaveBeenCalledWith("BEVERAGES", "C001");
    expect(creditLimitService.customer).toHaveBeenCalledWith("BEVERAGES", "C002");
    // The LIVE name from SAP replaces the synced one.
    expect(await screen.findByText("Sharma Traders")).toBeTruthy();
    expect(screen.getByRole("button", { name: /submit 2 requests/i })).toBeTruthy();

    // Parties already on the form are locked in the picker.
    await user.click(screen.getByRole("button", { name: /add more parties/i }));
    const picker = await screen.findByRole("dialog", { name: /select parties/i });
    const box = await within(picker).findByRole("checkbox", { name: /select gupta stores/i });
    expect((box as HTMLInputElement).disabled).toBe(true);
  });

  it("requires a supporting document for a single party", async () => {
    const user = userEvent.setup();
    await openForm(user);
    await addParties(user, "Sharma Traders (synced)");
    await fillLine(user, "C001", "75000");

    await user.click(screen.getByRole("button", { name: /submit request/i }));
    expect(await screen.findByText(/supporting document is required/i)).toBeTruthy();
    expect(creditLimitService.createRequest).not.toHaveBeenCalled();

    const file = new File(["x"], "letter.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/supporting document/i), file);
    await user.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() =>
      expect(creditLimitService.createRequest).toHaveBeenCalledWith({
        company: "OIL",
        lines: [{ card_code: "C001", new_credit_limit: "75000", valid_till: "2099-12-31" }],
        remarks: "",
        attachment: file,
      }),
    );
    expect(await screen.findByText(/request #22 submitted/i)).toBeTruthy();
  });

  it("submits several parties without a document", async () => {
    vi.spyOn(creditLimitService, "createRequest").mockResolvedValue([
      { id: 22 },
      { id: 23 },
    ] as never);
    const user = userEvent.setup();
    await openForm(user);
    await addParties(user, "Sharma Traders (synced)", "Gupta Stores");
    await fillLine(user, "C001", "75000");
    await fillLine(user, "C002", "9000");
    expect(screen.getByText(/optional when several parties/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /submit 2 requests/i }));
    await waitFor(() =>
      expect(creditLimitService.createRequest).toHaveBeenCalledWith({
        company: "OIL",
        lines: [
          { card_code: "C001", new_credit_limit: "75000", valid_till: "2099-12-31" },
          { card_code: "C002", new_credit_limit: "9000", valid_till: "2099-12-31" },
        ],
        remarks: "",
        attachment: null,
      }),
    );
    expect(await screen.findByText(/2 credit limit requests submitted \(#22, #23\)/i)).toBeTruthy();
  });

  it("marks the party the server refused", async () => {
    vi.spyOn(creditLimitService, "createRequest").mockRejectedValue({
      response: {
        status: 409,
        data: {
          success: false,
          message: "Nothing was submitted: one party could not be raised.",
          errors: {
            lines: [{ index: 1, card_code: "C002", message: "No workflow is configured." }],
          },
        },
      },
    });
    const user = userEvent.setup();
    await openForm(user);
    await addParties(user, "Sharma Traders (synced)", "Gupta Stores");
    await fillLine(user, "C001", "75000");
    await fillLine(user, "C002", "9000");
    await user.click(screen.getByRole("button", { name: /submit 2 requests/i }));

    expect(await screen.findByText("No workflow is configured.")).toBeTruthy();
    expect(screen.getByText(/nothing was submitted/i)).toBeTruthy();
  });

  it("clears the parties when the company changes", async () => {
    const user = userEvent.setup();
    await openForm(user);
    await addParties(user, "Sharma Traders (synced)");
    expect(await screen.findByLabelText("New credit limit for C001")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText(/company/i), "MART");
    expect(screen.queryByLabelText("New credit limit for C001")).toBeNull();
    expect(
      (screen.getByRole("button", { name: /submit request/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows the server's reason when SAP has no such customer", async () => {
    vi.spyOn(creditLimitService, "customer").mockRejectedValue({
      response: {
        status: 404,
        data: { success: false, message: "SAP has no customer C001 in OIL." },
      },
    });
    const user = userEvent.setup();
    await openForm(user);
    await addParties(user, "Sharma Traders (synced)");

    expect(await screen.findByText("SAP has no customer C001 in OIL.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });
});
