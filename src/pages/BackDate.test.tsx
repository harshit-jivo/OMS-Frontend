import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import BackDate from "./BackDate";
import { backdateService } from "../services/backdateService";

/**
 * The BackDate requester page.
 *
 * Creating a request used to be a modal. It is a TAB now, and the KPI cards
 * are the list's filter — both are behaviours nothing else in the suite would
 * catch: the route smoke test only mounts the page, and `tsc` is perfectly
 * happy with a card that counts something and does nothing when clicked.
 */
const REQUESTS = [
  {
    id: 11,
    company: "OIL",
    company_label: "OIL",
    companies: ["OIL"],
    sap_username: "USER12",
    document_type: 13,
    from_date: "2026-01-01",
    to_date: "2026-01-31",
    time_limit: null,
    action: "A",
    action_label: "Add",
    remarks: "",
    created_by_username: "mukesh",
    created_at: "2026-02-01T10:00:00Z",
    flow: null,
    current_stage: null,
  },
];

const INSIGHTS = { pending: 3, approved: 5, rejected: 2, total: 10 };

function stub() {
  vi.spyOn(backdateService, "listRequests").mockResolvedValue(
    REQUESTS as never,
  );
  vi.spyOn(backdateService, "insights").mockResolvedValue(INSIGHTS as never);
  vi.spyOn(backdateService, "sapUsers").mockResolvedValue([
    { user_id: 1, user_code: "USER12" },
  ] as never);
  vi.spyOn(backdateService, "documentTypes").mockResolvedValue([
    { object_type: 13, name: "A/R Invoice" },
  ] as never);
  vi.spyOn(backdateService, "createRequest").mockResolvedValue({} as never);
  vi.spyOn(backdateService, "history").mockResolvedValue({
    actions: [
      {
        id: 1, backdate: 11, action: "CREATE", action_label: "Created",
        stage: null, stage_name: "", acted_by: 1,
        acted_by_username: "mukesh", remarks: "", action_data: null,
        acted_at: "2026-02-01T10:00:00Z",
      },
      {
        id: 2, backdate: 11, action: "UPDATE", action_label: "Updated",
        stage: null, stage_name: "", acted_by: 1,
        acted_by_username: "mukesh", remarks: "Dates corrected",
        action_data: {
          from_date: { old: "2026-01-01", new: "2026-01-05" },
          document_type: { old: 13, new: 15 },
        },
        acted_at: "2026-02-01T11:00:00Z",
      },
      {
        id: 3, backdate: 11, action: "APPROVE", action_label: "Approved",
        stage: 11, stage_name: "Finance Approval", acted_by: 2,
        acted_by_username: "tannu", remarks: "ok", action_data: null,
        acted_at: "2026-02-02T09:00:00Z",
      },
    ],
  } as never);
}

describe("BackDate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stub();
  });

  it("offers creating as a tab, not a header button", async () => {
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    // The only header action left is Refresh — "New Request" moved into the
    // tab strip, so it must NOT also exist as a button.
    expect(screen.queryByRole("button", { name: /new request/i })).toBeNull();
    expect(screen.getByRole("tab", { name: /new request/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy();
  });

  it("shows the create form only on the create tab", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    expect(screen.queryByText("New BackDate Request")).toBeNull();
    // The status filter belongs to the list, so it goes away with it.
    expect(screen.getByLabelText(/filter requests by status/i)).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: /new request/i }));

    expect(screen.getByText("New BackDate Request")).toBeTruthy();
    expect(screen.getByRole("button", { name: /submit request/i })).toBeTruthy();
    expect(screen.queryByLabelText(/filter requests by status/i)).toBeNull();
  });

  it("raises ONE request however many companies are ticked", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });
    await user.click(screen.getByRole("tab", { name: /new request/i }));

    const company = screen.getByLabelText(/company/i);
    expect(company.textContent).toContain("OIL");

    await user.click(company);
    await user.click(screen.getByRole("checkbox", { name: "BEVERAGES" }));
    await user.keyboard("{Escape}");

    await user.click(screen.getByLabelText(/action/i));
    await user.click(screen.getByRole("checkbox", { name: "Update" }));
    await user.keyboard("{Escape}");

    await user.type(
      screen.getByLabelText(/rights expire/i),
      "2026-12-31T18:30",
    );

    // Two companies and both actions is still ONE business decision, so the
    // button never offers to submit more than one.
    expect(screen.queryByRole("button", { name: /submit 2 requests/i }))
      .toBeNull();
    await user.click(screen.getByRole("button", { name: "Submit Request" }));

    await waitFor(() =>
      expect(backdateService.createRequest).toHaveBeenCalledTimes(1),
    );
    const [body] = vi.mocked(backdateService.createRequest).mock.calls[0];
    // The companies travel together INSIDE the request.
    expect(body.company).toEqual(["OIL", "BEVERAGES"]);
    expect(body.action).toBe("A,U");
  });

  it("reports one submission, not one per company", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });
    await user.click(screen.getByRole("tab", { name: /new request/i }));

    await user.click(screen.getByLabelText(/company/i));
    await user.click(screen.getByRole("checkbox", { name: "BEVERAGES" }));
    await user.keyboard("{Escape}");
    await user.type(
      screen.getByLabelText(/rights expire/i),
      "2026-12-31T18:30",
    );
    await user.click(screen.getByRole("button", { name: "Submit Request" }));

    expect(await screen.findByText(/request submitted successfully/i))
      .toBeTruthy();
    expect(screen.queryByText(/2 BackDate requests/i)).toBeNull();
  });

  it("refuses to submit without an expiry", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });
    await user.click(screen.getByRole("tab", { name: /new request/i }));

    await user.click(screen.getByRole("button", { name: /submit request/i }));

    // Caught before the fan-out, or one missing field would be reported once
    // per company.
    expect(backdateService.createRequest).not.toHaveBeenCalled();
    expect(screen.getByText(/SAP ignores back-posting rights/i)).toBeTruthy();
  });

  it("sends a single action unchanged", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });
    await user.click(screen.getByRole("tab", { name: /new request/i }));

    await user.type(
      screen.getByLabelText(/rights expire/i),
      "2026-12-31T18:30",
    );
    await user.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() =>
      expect(backdateService.createRequest).toHaveBeenCalledTimes(1),
    );
    const [body] = vi.mocked(backdateService.createRequest).mock.calls[0];
    expect(body.action).toBe("A");
    expect(body.company).toEqual(["OIL"]);
    expect(body.time_limit).toBe("2026-12-31T18:30");
  });

  it("labels the action plainly, with no trailing explanation", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });
    await user.click(screen.getByRole("tab", { name: /new request/i }));

    await user.click(screen.getByLabelText(/action/i));
    expect(screen.getByRole("checkbox", { name: "Add" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Update" })).toBeTruthy();
    expect(screen.queryByText(/create back-dated documents/i)).toBeNull();
  });

  it("shows the counts on the KPI cards", async () => {
    render(<BackDate />);
    const pending = await screen.findByRole("button", { name: /pending/i });
    expect(within(pending).getByText("3")).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /^total/i })).getByText("10"),
    ).toBeTruthy();
  });

  it("filters the list from a KPI card and returns to the entries tab", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(screen.getByRole("tab", { name: /new request/i }));
    expect(screen.getByText("New BackDate Request")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /pending/i }));

    // Back on the list, scoped to the status that was clicked — the select
    // and the request it sent must agree.
    await waitFor(() =>
      expect(backdateService.listRequests).toHaveBeenCalledWith({
        status: "PENDING",
      }),
    );
    const select = screen.getByLabelText(
      /filter requests by status/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("PENDING");
    expect(screen.getByRole("button", { name: /pending/i }).getAttribute("aria-pressed"))
      .toBe("true");
  });

  it("narrows both the list and the counts by company", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.selectOptions(
      screen.getByLabelText(/filter requests by company/i),
      "BEVERAGES",
    );

    // The counts head the list, so they take the same filter — otherwise the
    // card says 3 over a table showing 1.
    await waitFor(() =>
      expect(backdateService.listRequests).toHaveBeenLastCalledWith({
        company: "BEVERAGES",
      }),
    );
    expect(backdateService.insights).toHaveBeenLastCalledWith({
      company: "BEVERAGES",
    });
  });

  it("combines the company and status filters", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.selectOptions(
      screen.getByLabelText(/filter requests by company/i),
      "OIL",
    );
    await user.click(screen.getByRole("button", { name: /pending/i }));

    await waitFor(() =>
      expect(backdateService.listRequests).toHaveBeenLastCalledWith({
        company: "OIL",
        status: "PENDING",
      }),
    );
  });

  it("renders an UPDATE as a readable diff of the changed fields", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(await screen.findByRole("button", { name: /details/i }));
    await screen.findByText("Approval history");

    // The diff is its own list; the detail block above it repeats some of the
    // same labels, so the assertions are scoped to the diff.
    const updated = screen.getByText("Updated").closest("li") as HTMLElement;
    const diff = within(updated);
    // Field labels, not column names, and only the fields that changed.
    expect(diff.getByText("From date")).toBeTruthy();
    expect(diff.getByText("Document type")).toBeTruthy();
    expect(diff.queryByText("To date")).toBeNull();
    // Old and new both shown, so the reader can see what it was.
    expect(diff.getByText("13")).toBeTruthy();
    expect(diff.getByText("15")).toBeTruthy();
  });

  it("shows the stage name the server resolved, not a stored copy", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(await screen.findByRole("button", { name: /details/i }));
    expect(await screen.findByText(/Finance Approval/)).toBeTruthy();
  });

  it("clears the filter from the Total card", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(screen.getByRole("button", { name: /rejected/i }));
    await waitFor(() =>
      expect(backdateService.listRequests).toHaveBeenCalledWith({
        status: "REJECTED",
      }),
    );

    await user.click(screen.getByRole("button", { name: /^total/i }));
    await waitFor(() =>
      expect(backdateService.listRequests).toHaveBeenLastCalledWith({}),
    );
  });
});
