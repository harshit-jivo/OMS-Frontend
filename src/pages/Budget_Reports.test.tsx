import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BudgetReports from "./Budget_Reports";
import { budgetService, type BudgetItem, type BudgetReport } from "../services/budgetService";
import { renderPage } from "../test/renderPage";

/**
 * Budget Reports: everyone's items for a month, per-approver tallies, export.
 * What matters is that the filters reach the server exactly as chosen (the
 * page and the export read the same ones), and that nothing here decides.
 */
function item(id: number): BudgetItem {
  return {
    id,
    company: "OIL",
    route: "MED_MKT",
    budget_code: "Med_Mkt",
    amount: "2322.00",
    status: "PENDING",
    status_label: "Pending",
    version: 1,
    workflow: "BUD_OIL_MED_MKT",
    current_stage: "Budget Owner Approval",
    current_user: { id: 9, name: "Karanpreet Singh", username: "karanpreet" },
    total_stage: 1,
    waiting_since: "2026-10-01T10:00:00Z",
    sap_status: null,
    sap_status_text: "",
    sap_written_at: null,
    draft: {
      id: 100 + id,
      company: "OIL",
      obj_type: 18,
      obj_type_label: "A/P invoice",
      draft_entry: 54447,
      doc_num: null,
      doc_date: "2026-10-01",
      card_code: "V9",
      card_name: "Facebook India",
      sap_created_by: "manager",
      comments: "",
      status: "PENDING",
      synced_at: null,
      created_at: null,
    },
    lines: [],
    can: { approve: false, reject: false, retry_sap: false },
  };
}

const REPORT: BudgetReport = {
  summary: {
    total: { count: 1, amount: "2322.00" },
    pending: { count: 1, amount: "2322.00" },
    approved: { count: 0, amount: "0" },
    rejected: { count: 0, amount: "0" },
    gone: { count: 0, amount: "0" },
    superseded: { count: 0, amount: "0" },
  },
  approvers: [{ user_id: 9, name: "Karanpreet Singh", pending: 1, approved: 4, auto_approved: 0, rejected: 1, total: 6 }],
  items: [item(1)],
  truncated: false,
};

beforeEach(() => {
  vi.spyOn(budgetService, "report").mockResolvedValue(REPORT);
});

afterEach(() => vi.restoreAllMocks());

describe("Budget reports", () => {
  it("shows each approver's tally and the items, with nothing to decide", async () => {
    renderPage(<BudgetReports />, { route: "/Budget_Reports" });
    const approvers = await screen.findByRole("table", { name: "Approvers" });
    const row = within(approvers).getByText("Karanpreet Singh").closest("tr") as HTMLElement;
    expect(within(row).getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Facebook India")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("asks for this month by default, and sends a search as typed", async () => {
    renderPage(<BudgetReports />, { route: "/Budget_Reports" });
    await screen.findByText("Facebook India");
    const month = vi.mocked(budgetService.report).mock.calls[0][0].month;
    expect(month).toMatch(/^\d{4}-\d{2}$/);

    await userEvent.type(screen.getByLabelText("Draft no., vendor or budget head"), "54447{Enter}");
    await waitFor(() =>
      expect(budgetService.report).toHaveBeenLastCalledWith(expect.objectContaining({ q: "54447", month })),
    );
  });

  it("exports the same filters the page shows", async () => {
    const exportReport = vi.spyOn(budgetService, "exportReport").mockResolvedValue(new Blob(["x"]));
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    // jsdom cannot follow a download link; the click itself is all that is asserted on.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderPage(<BudgetReports />, { route: "/Budget_Reports" });
    await screen.findByText("Facebook India");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "PENDING");
    await userEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await waitFor(() => expect(exportReport).toHaveBeenCalledWith(expect.objectContaining({ status: "PENDING" })));
  });
});
