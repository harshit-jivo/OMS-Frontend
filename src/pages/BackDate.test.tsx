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
    document_type_name: "G/L Accounts",
    from_date: "2026-01-01",
    to_date: "2026-01-31",
    time_limit: null,
    action: "A",
    action_label: "Add",
    created_by_username: "mukesh",
    created_at: "2026-02-01T10:00:00Z",
    flow: null,
    current_stage: null,
  },
];

// `completed` is a SUBSET of `approved`, so `total` excludes it.
/** A finished flow, for the tests that care what SAP said. */
const FLOW = {
  id: 1,
  backdate: 11,
  status: "APPROVED",
  hana_status: null,
  sap_payload: null,
  hana_status_text: "",
  workflow: 1,
  workflow_code: "BKDT_OIL",
  current_user: null,
  current_user_username: "",
  effective_user_username: "",
  has_active_replacement: false,
  current_stage: null,
  current_stage_name: "",
  current_stage_sequence: null,
  total_stage: 1,
  created_at: "2026-02-01T10:00:00Z",
  updated_at: "2026-02-02T09:00:00Z",
};

const INSIGHTS = {
  pending: 3, approved: 5, completed: 4, rejected: 2, total: 10,
};

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
          document_type_name: { old: "A/R Invoice", new: "Delivery" },
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
    stages: [
      {
        stage_id: 11, sequence: 1, stage_name: "Finance Approval",
        status: "APPROVED", reviewer: "tannu", configured_reviewer: "tannu",
        has_active_replacement: false, acted_by: "tannu",
        acted_at: "2026-02-02T09:00:00Z", remarks: "ok",
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

  it("raises ONE request per company, and never per action", async () => {
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

    // Two companies is two requests — each grant is approved on its own and
    // written to its own SAP schema. Both ACTIONS stay on each one.
    await user.click(screen.getByRole("button", { name: "Submit 2 Requests" }));

    await waitFor(() =>
      expect(backdateService.createRequest).toHaveBeenCalledTimes(2),
    );
    const sent = vi
      .mocked(backdateService.createRequest)
      .mock.calls.map(([body]) => `${body.company}/${body.action}`);
    expect(sent).toEqual(["OIL/A,U", "BEVERAGES/A,U"]);
  });

  it("reports how many requests were raised", async () => {
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
    await user.click(screen.getByRole("button", { name: "Submit 2 Requests" }));

    expect(await screen.findByText(/2 BackDate requests submitted/i))
      .toBeTruthy();
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
    // ONE company, not a list of one.
    expect(body.company).toBe("OIL");
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

  it("shows SAP's exact response, and never the payload", async () => {
    vi.mocked(backdateService.listRequests).mockResolvedValue([
      {
        ...REQUESTS[0],
        flow: {
          ...FLOW,
          status: "APPROVED",
          hana_status: "FAILED",
          hana_status_text: JSON.stringify({
            results: [{
              branch: "OIL", status: "FAILED",
              response: 'RuntimeError: (259, "invalid userid USER12")',
            }],
          }),
          sap_payload: { calls: [{ branch: "OIL", parameters: { USERID: "USER12" } }] },
        },
      },
    ] as never);
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(await screen.findByRole("button", { name: /progress/i }));

    // SAP's own words, verbatim — that is the whole point of the column.
    expect(await screen.findByText(/invalid userid USER12/)).toBeTruthy();
    // And no way to pull up the request parameters beside them.
    expect(screen.queryByText(/show payload/i)).toBeNull();
    expect(screen.queryByText(/USERID/)).toBeNull();
  });

  it("does not call a successful SAP write FAILED", async () => {
    // An older row stores a plain sentence rather than the JSON shape. Reading
    // it as a failure printed a red FAILED beside a green "rights applied".
    vi.mocked(backdateService.listRequests).mockResolvedValue([
      {
        ...REQUESTS[0],
        flow: {
          ...FLOW,
          status: "APPROVED",
          hana_status: "SUCCESS",
          hana_status_text: "Rights applied in SAP for USER01 (OIL).",
        },
      },
    ] as never);
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(await screen.findByRole("button", { name: /progress/i }));

    expect(await screen.findByText(/Rights applied in SAP/)).toBeTruthy();
    expect(screen.queryByText(/refused/i)).toBeNull();
  });

  it("offers Completed as its own card and filter", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    const card = await screen.findByRole("button", { name: /completed/i });
    expect(card).toBeTruthy();
    // It is a SUBSET of approved, so the card says so rather than leaving a
    // reader to wonder why the two numbers differ.
    expect(screen.getByText(/rights reached SAP/i)).toBeTruthy();

    await user.click(card);
    await waitFor(() =>
      expect(backdateService.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "COMPLETED" }),
      ),
    );
  });

  it("renders an UPDATE as a readable diff on the progress line", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    // The edit belongs to the request's PROGRESS — it happened between the
    // creation and the approval — so that is where the diff is shown.
    await user.click(await screen.findByRole("button", { name: /progress/i }));

    const updated = (await screen.findByText("Updated"))
      .closest("li") as HTMLElement;
    const diff = within(updated);
    // Field labels, not column names, and only the fields that changed.
    expect(diff.getByText("From date")).toBeTruthy();
    expect(diff.getByText("Document type")).toBeTruthy();
    expect(diff.queryByText("To date")).toBeNull();
    // The document reads by NAME in the diff too — "13 → 15" says nothing.
    // Old and new are BOTH shown, so the reader can see what it was; dates
    // are localised on the way out, so the document name is what this can
    // assert literally.
    expect(diff.getByText("A/R Invoice")).toBeTruthy();
    expect(diff.getByText("Delivery")).toBeTruthy();
  });

  it("shows the stage name the server resolved, not a stored copy", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(await screen.findByRole("button", { name: /progress/i }));
    expect(await screen.findByText(/Finance Approval/)).toBeTruthy();
  });

  it("opens the progress with the creation as its first event", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(await screen.findByRole("button", { name: /progress/i }));

    // A progress line that starts at the first approver is missing the event
    // that began the entry.
    const created = (await screen.findByText("Created"))
      .closest("li") as HTMLElement;
    expect(within(created).getByText("mukesh")).toBeTruthy();
    expect(within(created).getByText("Created by")).toBeTruthy();
  });

  it("shows the document type by NAME, not by its number", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(await screen.findByRole("button", { name: /details/i }));

    // "13" means nothing to the person approving.
    expect(await screen.findByText("G/L Accounts")).toBeTruthy();
  });

  it("does not offer Edit when the server says this caller may not", async () => {
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(await screen.findByRole("button", { name: /details/i }));
    await screen.findByText("G/L Accounts");

    // The fixture carries no `can_edit`, which is the server declining. A
    // button that 403s on click is worse than no button.
    expect(screen.queryByRole("button", { name: /edit this request/i }))
      .toBeNull();
  });

  it("offers Edit when the server says this caller may", async () => {
    vi.mocked(backdateService.listRequests).mockResolvedValue(
      [{ ...REQUESTS[0], can_edit: true }] as never,
    );
    const user = userEvent.setup();
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    await user.click(await screen.findByRole("button", { name: /details/i }));

    expect(await screen.findByRole("button", { name: /edit this request/i }))
      .toBeTruthy();
  });

  it("shows only the agreed columns in the table", async () => {
    render(<BackDate />);
    await screen.findByRole("tab", { name: /entries/i });

    for (const heading of ["ID", "Company", "From Date", "To Date",
                           "Time Limit", "Created By"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeTruthy();
    }
    // Everything else is in Details or Progress, so the table stays scannable.
    for (const gone of ["SAP User", "Document Type", "Status", "Waiting On",
                        "Window"]) {
      expect(screen.queryByRole("columnheader", { name: gone })).toBeNull();
    }
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
