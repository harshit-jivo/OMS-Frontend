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

  it("approves the ticked rows together, each with its own version", async () => {
    vi.mocked(budgetService.queue).mockResolvedValue([item(1), item(2, { version: 7 }), item(3)]);
    const bulk = vi.spyOn(budgetService, "approveBulk").mockResolvedValue({
      results: [
        { id: 1, ok: true, approved: true, message: "Approved." },
        { id: 2, ok: true, approved: true, message: "Approved." },
      ],
      approved: 2,
      refused: 0,
      message: "2 of 2 approved.",
    });
    renderPage(<BudgetApproval />, { route: "/Budget_Approval" });
    await userEvent.click(within(await rowFor("A/P invoice 5001")).getByRole("checkbox"));
    await userEvent.click(within(await rowFor("A/P invoice 5002")).getByRole("checkbox"));

    await userEvent.click(screen.getByRole("button", { name: "Approve selected (2)" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve 2" }));

    await waitFor(() =>
      expect(bulk).toHaveBeenCalledWith(
        [
          { id: 1, version: 3 },
          { id: 2, version: 7 },
        ],
        "",
      ),
    );
  });

  it("keeps the bulk dialog open on what was refused", async () => {
    vi.mocked(budgetService.queue).mockResolvedValue([item(1), item(2)]);
    vi.spyOn(budgetService, "approveBulk").mockResolvedValue({
      results: [
        { id: 1, ok: true, approved: true, message: "Approved." },
        { id: 2, ok: false, approved: false, message: "It changed since you opened it. Reload it and try again." },
      ],
      approved: 1,
      refused: 1,
      message: "1 of 2 approved.",
    });
    renderPage(<BudgetApproval />, { route: "/Budget_Approval" });
    await userEvent.click(await screen.findByRole("checkbox", { name: /every approvable row/ }));
    await userEvent.click(screen.getByRole("button", { name: "Approve selected (2)" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve 2" }));

    expect(await within(dialog).findByText(/A\/P invoice 5002 · Factory: It changed since you opened it/)).toBeInTheDocument();
  });

  it("opens the item a notification was about, with its SAP attachments", async () => {
    const detail = { ...item(1).draft, items: [{ ...item(1), stages: [], logs: [] }] };
    vi.spyOn(budgetService, "draft").mockResolvedValue(detail);
    vi.spyOn(budgetService, "attachments").mockResolvedValue([
      { line: 1, file_name: "Tax invoice.pdf", date: "2026-08-13" },
    ]);
    renderPage(<BudgetApproval />, { route: "/Budget_Approval?itemId=1" });

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("button", { name: "Tax invoice.pdf" })).toBeInTheDocument();
    // Still the reader's to decide, so the dialog carries the decision too.
    expect(within(dialog).getByRole("button", { name: "Approve" })).toBeInTheDocument();
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
