import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CreditLimit from "./Credit_Limit";
import { creditLimitService } from "../services/creditLimitService";
import { sapService } from "../services/sapService";
import { renderPage } from "../test/renderPage";

/**
 * The Credit Limit requester page: the party is picked from the synced
 * party table and then read live from SAP, which gates the form; the
 * multipart submit carries what the backend needs, and the detail dialog
 * shows stage progress and history.
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

async function pickSharma(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /select party/i }));
  const picker = await screen.findByRole("dialog", { name: /select party/i });
  await user.click(await within(picker).findByText("Sharma Traders (synced)"));
  await screen.findByRole("group", { name: /customer from sap/i });
}

function stub() {
  vi.spyOn(sapService, "getPartiesByCategory").mockResolvedValue(PARTIES as never);
  vi.spyOn(creditLimitService, "listRequests").mockResolvedValue([REQUEST] as never);
  vi.spyOn(creditLimitService, "customer").mockResolvedValue(CUSTOMER as never);
  vi.spyOn(creditLimitService, "createRequest").mockResolvedValue({ id: 22 } as never);
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

  it("picks the party from the company's party table, then reads it live", async () => {
    const user = userEvent.setup();
    renderPage(<CreditLimit />);
    await user.click(await screen.findByRole("tab", { name: /new request/i }));

    const submit = screen.getByRole("button", { name: /submit request/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await user.selectOptions(screen.getByLabelText(/company/i), "BEVERAGES");
    await user.click(screen.getByRole("button", { name: /select party/i }));

    const picker = await screen.findByRole("dialog", { name: /select party/i });
    expect(sapService.getPartiesByCategory).toHaveBeenCalledWith("BEVERAGES");
    expect(await within(picker).findByText("Gupta Stores")).toBeTruthy();

    // Client-side search over code and name.
    await user.type(within(picker).getByLabelText(/search parties/i), "sharma");
    expect(within(picker).queryByText("Gupta Stores")).toBeNull();
    await user.click(within(picker).getByText("Sharma Traders (synced)"));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /select party/i })).toBeNull(),
    );
    expect(creditLimitService.customer).toHaveBeenCalledWith("BEVERAGES", "C001");
    const facts = await screen.findByRole("group", { name: /customer from sap/i });
    // The LIVE name from SAP, not the synced one.
    expect(within(facts).getByText("Sharma Traders")).toBeTruthy();
    expect(within(facts).getByText("Retail")).toBeTruthy();
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("forgets the party when the company changes", async () => {
    const user = userEvent.setup();
    renderPage(<CreditLimit />);
    await user.click(await screen.findByRole("tab", { name: /new request/i }));
    await pickSharma(user);

    await user.selectOptions(screen.getByLabelText(/company/i), "MART");
    expect(screen.queryByRole("group", { name: /customer from sap/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^select party$/i })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /submit request/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("submits the request as multipart with the attachment", async () => {
    const user = userEvent.setup();
    renderPage(<CreditLimit />);
    await user.click(await screen.findByRole("tab", { name: /new request/i }));
    await pickSharma(user);

    await user.type(screen.getByLabelText(/new credit limit/i), "75000");
    await user.type(screen.getByLabelText(/valid till/i), "2099-12-31");
    const file = new File(["x"], "letter.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/attachment/i), file);
    await user.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() =>
      expect(creditLimitService.createRequest).toHaveBeenCalledWith({
        company: "OIL",
        card_code: "C001",
        new_credit_limit: "75000",
        valid_till: "2099-12-31",
        remarks: "",
        attachment: file,
      }),
    );
    expect(await screen.findByText(/request #22 submitted/i)).toBeTruthy();
  });

  it("shows the server's reason when SAP has no such customer", async () => {
    vi.spyOn(creditLimitService, "customer").mockRejectedValue({
      response: {
        status: 404,
        data: { success: false, message: "SAP has no customer C001 in OIL." },
      },
    });
    const user = userEvent.setup();
    renderPage(<CreditLimit />);
    await user.click(await screen.findByRole("tab", { name: /new request/i }));
    await user.click(screen.getByRole("button", { name: /select party/i }));
    const picker = await screen.findByRole("dialog", { name: /select party/i });
    await user.click(await within(picker).findByText("Sharma Traders (synced)"));

    expect(await screen.findByText("SAP has no customer C001 in OIL.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });
});
