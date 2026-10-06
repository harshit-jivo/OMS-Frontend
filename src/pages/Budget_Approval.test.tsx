import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BudgetApproval from "./Budget_Approval";
import { budgetService, type BudgetItem } from "../services/budgetService";
import { renderPage } from "../test/renderPage";

/**
 * The budget approval desk.
 *
 * What is worth pinning here is what the server relies on the page to send:
 * the item's `version` with every decision (a stale screen is refused), and a
 * reason with every rejection. And that Approve is only offered where the
 * server said this user may act.
 */
function item(id: number, overrides: Partial<BudgetItem> = {}): BudgetItem {
  return {
    id,
    company: "OIL",
    route: "FACTORY",
    budget_code: "Factory",
    amount: "12500.00",
    status: "PENDING",
    status_label: "Pending",
    version: 3,
    workflow: "BUD_OIL_FACTORY",
    current_stage: "Department Head Approval",
    current_user: { id: 7, name: "Navdeep", username: "navdeep" },
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
      draft_entry: 5000 + id,
      doc_num: null,
      doc_date: "2026-10-01",
      card_code: "V001",
      card_name: "Acme Traders",
      sap_created_by: "manager",
      comments: "",
      status: "PENDING",
      synced_at: "2026-10-01T10:00:00Z",
      created_at: "2026-10-01T10:00:00Z",
    },
    lines: [],
    can: { approve: true, reject: true, retry_sap: false },
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(budgetService, "queue").mockResolvedValue([item(1)]);
  vi.spyOn(budgetService, "history").mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

async function rowFor(label: string) {
  const cell = await screen.findByText(label);
  return cell.closest("tr") as HTMLElement;
}

describe("Budget approval desk", () => {
  it("lists what is waiting, without showing any budget figure", async () => {
    renderPage(<BudgetApproval />, { route: "/Budget_Approval" });
    const row = await rowFor("A/P invoice 5001");
    expect(within(row).getByText("Acme Traders")).toBeInTheDocument();
    expect(within(row).getByText("Factory")).toBeInTheDocument();
    expect(screen.queryByText(/budget left|remaining|balance/i)).toBeNull();
  });

  it("approves with the item's version", async () => {
    const approve = vi.spyOn(budgetService, "approve").mockResolvedValue({
      item: item(1, { status: "APPROVED" }),
      message: "Approved.",
    });
    renderPage(<BudgetApproval />, { route: "/Budget_Approval" });
    const row = await rowFor("A/P invoice 5001");

    await userEvent.click(within(row).getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(approve).toHaveBeenCalledWith(1, "", 3));
  });

  it("will not reject without a reason", async () => {
    const reject = vi.spyOn(budgetService, "reject").mockResolvedValue({
      item: item(1, { status: "REJECTED" }),
      message: "Rejected.",
    });
    renderPage(<BudgetApproval />, { route: "/Budget_Approval" });
    const row = await rowFor("A/P invoice 5001");

    await userEvent.click(within(row).getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await within(dialog).findByText("Say why, when rejecting.")).toBeInTheDocument();
    expect(reject).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByRole("textbox"), "Not this month");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith(1, "Not this month", 3));
  });

  it("offers no decision where the server says this user may not act", async () => {
    vi.mocked(budgetService.queue).mockResolvedValue([
      item(2, { can: { approve: false, reject: false, retry_sap: false } }),
    ]);
    renderPage(<BudgetApproval />, { route: "/Budget_Approval" });
    const row = await rowFor("A/P invoice 5002");
    expect(within(row).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Reject" })).toBeNull();
  });
});
