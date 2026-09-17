import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BackDateApproval from "./BackDate_Approval";
import { backdateService } from "../services/backdateService";

/**
 * Both pages are ROUTED pages: they read `?requestId=` so a notification can
 * open one entry rather than dropping the reader on the list. That needs a
 * router in the tree, so every `render` below goes through this wrapper and
 * the call sites stay unchanged.
 */
const render = (ui: React.ReactElement, route = "/") =>
  rtlRender(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);


/**
 * The BackDate approval desk.
 *
 * The status tabs became KPI cards plus a dropdown, which moved a real
 * decision into this page: Pending and the decided statuses come from two
 * DIFFERENT endpoints, so "All" is a merge, and only the queue half of that
 * merge may be actioned. Nothing else in the suite would catch an Approve
 * button offered on a request this user cannot decide.
 */
function request(id: number, company: string, withStage = true) {
  return {
    id,
    company,
    company_label: company,
    companies: [company],
    sap_username: "USER0" + id,
    document_type_name: "Business Partner",
    from_date: "2026-09-15",
    to_date: "2026-09-15",
    time_limit: null,
    action: "A",
    action_label: "Add",
    created_by_username: "admin",
    created_at: "2026-09-15T10:00:00Z",
    updated_at: "2026-09-15T10:00:00Z",
    // Where a request is now lives on the FLOW — there is no task table and
    // no per-request copy of the stage's configuration.
    flow: {
      id: 100 + id,
      backdate: id,
      status: withStage ? "PENDING" : "APPROVED",
      hana_status: null,
      hana_status_text: "",
      workflow: 1,
      workflow_code: "BKDT_OIL",
      current_user: withStage ? 7 : null,
      current_user_username: withStage ? "Navdeep" : "",
      effective_user_username: withStage ? "Navdeep" : "",
      has_active_replacement: false,
      current_stage: withStage ? 11 : null,
      current_stage_name: withStage ? "stage1" : "",
      current_stage_sequence: withStage ? 1 : null,
      total_stage: 1,
      created_at: "2026-09-15T10:00:00Z",
      updated_at: "2026-09-15T10:00:00Z",
    },
  };
}

const QUEUE = [request(13, "BEVERAGES")];
const HISTORY = [request(12, "OIL", false)];
const INSIGHTS = {
  pending: 1, approved: 1, completed: 1, rejected: 0, total: 2,
};

function stub() {
  vi.spyOn(backdateService, "approvalQueue").mockResolvedValue(QUEUE as never);
  vi.spyOn(backdateService, "approvalHistory").mockResolvedValue(
    HISTORY as never,
  );
  vi.spyOn(backdateService, "approvalInsights").mockResolvedValue(
    INSIGHTS as never,
  );
  // Only reached by a deep link to a request that is not in the list.
  vi.spyOn(backdateService, "getRequest").mockResolvedValue(
    request(13, "BEVERAGES") as never,
  );
  vi.spyOn(backdateService, "history").mockResolvedValue({
    actions: [],
    stages: [
      {
        stage_id: 11, sequence: 1, stage_name: "Manager Approval",
        status: "AWAITING", reviewer: "Navdeep",
        configured_reviewer: "Navdeep", has_active_replacement: false,
        acted_by: "", acted_at: null, remarks: "",
      },
      {
        stage_id: 12, sequence: 2, stage_name: "Finance Approval",
        status: "UPCOMING", reviewer: "tannu",
        configured_reviewer: "tannu", has_active_replacement: false,
        acted_by: "", acted_at: null, remarks: "",
      },
    ],
  } as never);
}

describe("BackDateApproval", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stub();
  });

  it("heads the desk with counts instead of status tabs", async () => {
    render(<BackDateApproval />);
    const pending = await screen.findByRole("button", { name: /pending/i });

    expect(within(pending).getByText("1")).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /^total/i })).getByText("2"),
    ).toBeTruthy();
    // The old tab strip is gone.
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("opens on the queue, which is the only list with anything to do", async () => {
    render(<BackDateApproval />);
    await screen.findByRole("button", { name: /^details$/i });

    expect(backdateService.approvalQueue).toHaveBeenCalledWith({});
    expect(backdateService.approvalHistory).not.toHaveBeenCalled();
    const status = screen.getByLabelText(
      /filter requests by status/i,
    ) as HTMLSelectElement;
    expect(status.value).toBe("PENDING");
  });

  it("switches to decided requests from the Approved card", async () => {
    const user = userEvent.setup();
    render(<BackDateApproval />);
    await screen.findByRole("button", { name: /^details$/i });

    await user.click(screen.getByRole("button", { name: /approved/i }));

    await waitFor(() =>
      expect(backdateService.approvalHistory).toHaveBeenCalledWith({
        status: "APPROVED",
      }),
    );
  });

  it("offers only Details and Progress in the row", async () => {
    render(<BackDateApproval />);
    await screen.findByRole("button", { name: /^details$/i });

    // Deciding moved into the detail dialog: a one-click Approve from a table
    // row is a decision made without reading what is being agreed to.
    expect(screen.getByRole("button", { name: /^progress$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^reject$/i })).toBeNull();
  });

  it("decides from inside the detail dialog", async () => {
    const user = userEvent.setup();
    render(<BackDateApproval />);
    await user.click(await screen.findByRole("button", { name: /^details$/i }));

    // The queued request is actionable, so the dialog offers the decision.
    expect(await screen.findByRole("button", { name: /^approve$/i }))
      .toBeTruthy();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeTruthy();
  });

  /**
   * Arriving from a notification.
   *
   * The push says "request #13 needs your approval". Landing on the desk with
   * forty rows and leaving the approver to find it is most of the way to not
   * having sent the notification at all.
   */
  it("opens the request a notification names, ready to decide", async () => {
    render(<BackDateApproval />, "/BackDate_Approval?requestId=13");

    // The dialog opens by itself — no Details click — and because #13 is in
    // the QUEUE, it opens with the decision available.
    expect(await screen.findByRole("button", { name: /^approve$/i }))
      .toBeTruthy();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeTruthy();
    // It never had to fetch: the row was already on screen.
    expect(backdateService.getRequest).not.toHaveBeenCalled();
  });

  it("opens a request that is no longer in the queue, read-only", async () => {
    // Somebody else decided it between the push and the click. Showing it
    // without buttons is the honest answer; showing buttons that 403 is not.
    vi.spyOn(backdateService, "getRequest").mockResolvedValue(
      request(99, "OIL", false) as never,
    );
    render(<BackDateApproval />, "/BackDate_Approval?requestId=99");

    await waitFor(() =>
      expect(backdateService.getRequest).toHaveBeenCalledWith(99),
    );
    expect(await screen.findByText("USER099")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
  });

  it("ignores a request id that no longer exists", async () => {
    // Deleted, or another user's. Nothing to show and nothing the reader can
    // do about it, so the desk simply loads.
    vi.spyOn(backdateService, "getRequest").mockRejectedValue(
      new Error("not found"),
    );
    render(<BackDateApproval />, "/BackDate_Approval?requestId=4242");

    expect(await screen.findByRole("button", { name: /^details$/i }))
      .toBeTruthy();
  });

  it("shows every stage in the progress dialog, reached or not", async () => {
    const user = userEvent.setup();
    render(<BackDateApproval />);
    await user.click(await screen.findByRole("button", { name: /^progress$/i }));

    // The stage AHEAD is shown too — a requester chasing an approval needs to
    // know somebody else comes after this one.
    expect(await screen.findByText("Manager Approval")).toBeTruthy();
    expect(screen.getByText("Finance Approval")).toBeTruthy();
    expect(screen.getByText("Awaiting review")).toBeTruthy();
    expect(screen.getByText("Not yet reached")).toBeTruthy();
  });

  it("searches by id and by SAP user", async () => {
    const user = userEvent.setup();
    render(<BackDateApproval />);
    await screen.findByRole("button", { name: /^details$/i });

    await user.type(screen.getByLabelText(/search requests/i), "USER013");

    // Debounced, and the counts take the same term so a card cannot disagree
    // with the table beneath it.
    await waitFor(() =>
      expect(backdateService.approvalQueue).toHaveBeenLastCalledWith({
        search: "USER013",
      }),
    );
    expect(backdateService.approvalInsights).toHaveBeenLastCalledWith({
      search: "USER013",
    });
  });

  it("merges the queue and the history when no status is chosen", async () => {
    const user = userEvent.setup();
    render(<BackDateApproval />);
    await screen.findByRole("button", { name: /^details$/i });

    await user.click(screen.getByRole("button", { name: /^total/i }));

    await waitFor(() =>
      expect(backdateService.approvalHistory).toHaveBeenCalledWith({}),
    );
    // The SAP user column is gone; the id is what identifies a row now.
    expect(await screen.findByText("#13")).toBeTruthy();
    expect(screen.getByText("#12")).toBeTruthy();
  });

  it("passes the company filter to every call", async () => {
    const user = userEvent.setup();
    render(<BackDateApproval />);
    await screen.findByRole("button", { name: /^details$/i });

    await user.selectOptions(
      screen.getByLabelText(/filter requests by company/i),
      "BEVERAGES",
    );

    await waitFor(() =>
      expect(backdateService.approvalQueue).toHaveBeenLastCalledWith({
        company: "BEVERAGES",
      }),
    );
    expect(backdateService.approvalInsights).toHaveBeenLastCalledWith({
      company: "BEVERAGES",
    });
  });

  it("shows what SAP said before closing, not after", async () => {
    // The approver used to lose the response the instant it arrived and have
    // to hunt for it under Completed > Details.
    vi.spyOn(backdateService, "approve").mockResolvedValue({
      flow_id: 1,
      flow_status: "APPROVED",
      hana_status: "SUCCESS",
      hana_status_text: JSON.stringify({
        results: [{
          branch: "OIL", status: "SUCCESS", sap_row_id: 130,
          response: "OPEN_BKDT accepted: USER01, G/L Accounts.",
        }],
      }),
    } as never);

    const user = userEvent.setup();
    render(<BackDateApproval />);
    await user.click(await screen.findByRole("button", { name: /^details$/i }));
    await user.click(await screen.findByRole("button", { name: /^approve$/i }));
    await user.click(await screen.findByRole("button", { name: /^approve$/i }));

    // The dialog stays, showing SAP's own words and the row id.
    expect(await screen.findByText(/OPEN_BKDT accepted/)).toBeTruthy();
    expect(screen.getByText(/SAP accepted the grant/i)).toBeTruthy();
    expect(screen.getByText(/SAP row id 130/)).toBeTruthy();

    // And it only closes when the approver says so.
    await user.click(screen.getByRole("button", { name: /^done$/i }));
    await waitFor(() =>
      expect(screen.queryByText(/OPEN_BKDT accepted/)).toBeNull(),
    );
  });
});
