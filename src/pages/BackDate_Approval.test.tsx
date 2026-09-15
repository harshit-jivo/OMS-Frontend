import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BackDateApproval from "./BackDate_Approval";
import { backdateService } from "../services/backdateService";

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
    document_type: 2,
    from_date: "2026-09-15",
    to_date: "2026-09-15",
    time_limit: null,
    action: "A",
    action_label: "Add",
    remarks: "",
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
const INSIGHTS = { pending: 1, approved: 1, rejected: 0, total: 2 };

function stub() {
  vi.spyOn(backdateService, "approvalQueue").mockResolvedValue(QUEUE as never);
  vi.spyOn(backdateService, "approvalHistory").mockResolvedValue(
    HISTORY as never,
  );
  vi.spyOn(backdateService, "approvalInsights").mockResolvedValue(
    INSIGHTS as never,
  );
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
    await screen.findByRole("button", { name: /^approve$/i });

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
    await screen.findByRole("button", { name: /^approve$/i });

    await user.click(screen.getByRole("button", { name: /approved/i }));

    await waitFor(() =>
      expect(backdateService.approvalHistory).toHaveBeenCalledWith({
        status: "APPROVED",
      }),
    );
    // A request already decided offers no decision — the server would refuse
    // it, so the buttons are not drawn.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull(),
    );
  });

  it("merges the queue and the history when no status is chosen", async () => {
    const user = userEvent.setup();
    render(<BackDateApproval />);
    await screen.findByRole("button", { name: /^approve$/i });

    await user.click(screen.getByRole("button", { name: /^total/i }));

    await waitFor(() =>
      expect(backdateService.approvalHistory).toHaveBeenCalledWith({}),
    );
    // Both rows show, and only the queued one keeps its decision buttons.
    expect(await screen.findByText("USER013")).toBeTruthy();
    expect(screen.getByText("USER012")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^approve$/i })).toHaveLength(1);
  });

  it("passes the company filter to every call", async () => {
    const user = userEvent.setup();
    render(<BackDateApproval />);
    await screen.findByRole("button", { name: /^approve$/i });

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
});
