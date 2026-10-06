import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BudgetSettings from "./Budget_Settings";
import { budgetService } from "../services/budgetService";
import { renderPage } from "../test/renderPage";

/**
 * Budget auto-approval settings: the page must send back the exempt users it
 * was given (by id), and must not save an hours value the server would refuse.
 */
beforeEach(() => {
  vi.spyOn(budgetService, "settings").mockResolvedValue({
    auto_approve_enabled: false,
    auto_approve_hours: 48,
    exempt_users: [{ id: 5, name: "Kamal", username: "kamal1" }],
    last_sync: {},
    updated_at: null,
  });
  vi.spyOn(budgetService, "health").mockResolvedValue([
    { company: "OIL", last_synced_at: null, pending: 4, sap_write_failed: 0 },
  ]);
  vi.spyOn(budgetService, "users").mockResolvedValue([
    { id: 5, name: "Kamal", username: "kamal1" },
    { id: 6, name: "Taran", username: "taran" },
  ]);
});

afterEach(() => vi.restoreAllMocks());

describe("Budget settings", () => {
  it("saves the switch, the hours and the exempt users", async () => {
    const save = vi.spyOn(budgetService, "saveSettings").mockResolvedValue({
      auto_approve_enabled: true,
      auto_approve_hours: 24,
      exempt_users: [{ id: 5, name: "Kamal", username: "kamal1" }],
      last_sync: {},
      updated_at: null,
    });
    renderPage(<BudgetSettings />, { route: "/Budget_Settings" });

    const hours = await screen.findByDisplayValue("48");
    await userEvent.click(screen.getByLabelText(/Auto-approve/));
    await userEvent.clear(hours);
    await userEvent.type(hours, "24");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        auto_approve_enabled: true,
        auto_approve_hours: 24,
        exempt_user_ids: [5],
      }),
    );
  });

  it("refuses hours outside 1 to 720", async () => {
    const save = vi.spyOn(budgetService, "saveSettings");
    renderPage(<BudgetSettings />, { route: "/Budget_Settings" });

    const hours = await screen.findByDisplayValue("48");
    await userEvent.clear(hours);
    await userEvent.type(hours, "0");

    expect(await screen.findByText("A whole number of hours, 1 to 720.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });
});
