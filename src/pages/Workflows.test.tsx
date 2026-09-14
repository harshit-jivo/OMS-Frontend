import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Workflows from "./Workflows";
import { workflowService } from "../services/workflowService";
import { userService } from "../services/userService";

/**
 * The Workflows configuration page.
 *
 * These cases pin the things that were actually wrong on screen, because each
 * one failed in a way the type-checker and the route smoke test both passed:
 *
 *  * Every dialog opened with NO visible heading. `DialogContent`'s `title`
 *    prop is the accessible name and renders `sr-only` by design, so a form
 *    that omits `DialogHeader` opens straight onto its first field. It is
 *    invisible to `tsc`, and a smoke test that only mounts the page never
 *    opens a dialog.
 *  * The stage list is a PROGRESSION, and a table of rows with a "Sequence"
 *    column stated that as a number instead of showing it.
 *  * The query form asked for "Key Column" — a SQL detail almost nobody
 *    overrides — in the slot where the query's owning workflow belongs.
 *
 * `useCan` is mocked to grant the permission: this file is about the page's
 * behaviour once you are allowed in, and the permission gate is covered by
 * `routeAccess`.
 */
vi.mock("../auth", async () => {
  const actual = await vi.importActual<typeof import("../auth")>("../auth");
  return { ...actual, useCan: () => true };
});

const MODULE = {
  id: 22,
  code: "TESTFLOW",
  name: "Workflow Test Harness",
  workflow_count: 2,
};

const WORKFLOW = {
  id: 37,
  module: 22,
  module_code: "TESTFLOW",
  code: "TESTFLOW_OIL_HIGHVALUE",
  name: "High Value Approval (OIL only)",
  company: "OIL" as const,
  is_active: true,
  queries: [],
  stages: [],
};

const STAGES = [
  { id: 36, workflow: 37, name: "Manager Review", sequence: 1, user: 8, user_username: "tannu", is_active: true },
  { id: 37, workflow: 37, name: "Finance Check", sequence: 2, user: 9, user_username: "testnewuesr2", is_active: true },
  { id: 38, workflow: 37, name: "Director Sign-off", sequence: 3, user: 10, user_username: "muskan2", is_active: false },
];

const DIRECTORY = [
  { id: 8, username: "mukesh", name: "Mukesh", email: "m@x.co", role: "1",
    role_name: "Manager", is_active: true },
  { id: 9, username: "ravi", name: "Ravi", email: "r@x.co", role: "1",
    role_name: "Manager", is_active: true },
  { id: 10, username: "suresh", name: "Suresh", email: "s@x.co", role: "1",
    role_name: "Director", is_active: true },
];

/** What `?user=` returns: stages from several workflows, joined up. */
const ASSIGNMENTS = [
  {
    id: 36, workflow: 37, workflow_code: "BUDGET_STANDARD",
    workflow_name: "Standard Budget", company: "ALL" as const,
    module_id: 22, module_code: "BUDGET", module_name: "Budget Approval",
    name: "Finance Approval", sequence: 2, user: 8, user_username: "mukesh",
    effective_user: 8, effective_user_username: "mukesh",
    has_active_replacement: false, is_active: true,
  },
  {
    id: 44, workflow: 38, workflow_code: "ORDER_STANDARD",
    workflow_name: "Standard Order", company: "OIL" as const,
    module_id: 23, module_code: "ORDER", module_name: "Order Approval",
    name: "Manager Approval", sequence: 1, user: 8, user_username: "mukesh",
    // Covered today by a temporary replacement — the CONFIGURED user is
    // still mukesh, which is the distinction the view has to make visible.
    effective_user: 9, effective_user_username: "ravi",
    has_active_replacement: true, is_active: true,
  },
];

function stubServices({ stages = STAGES } = {}) {
  vi.spyOn(workflowService, "listModules").mockResolvedValue([MODULE]);
  vi.spyOn(workflowService, "listWorkflows").mockResolvedValue([WORKFLOW]);
  vi.spyOn(workflowService, "listQueries").mockResolvedValue([]);
  vi.spyOn(workflowService, "listStages").mockResolvedValue(stages);
  vi.spyOn(workflowService, "listReplacements").mockResolvedValue([]);
  vi.spyOn(workflowService, "listStagesForUser").mockResolvedValue(ASSIGNMENTS);
  // The page fills its user pickers from the directory, so the By User view
  // renders nothing without this.
  vi.spyOn(userService, "getUsers").mockResolvedValue(DIRECTORY as never);
}

/** Switch tabs by their visible name. */
async function openTab(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("tab", { name }));
}

describe("Workflows page", () => {
  describe("dialogs", () => {
    it("shows a visible heading, not only an accessible name", async () => {
      stubServices();
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Workflows");
      await user.click(await screen.findByRole("button", { name: /create workflow/i }));

      const dialog = await screen.findByRole("dialog");
      // A heading element, so it survives even though DialogContent also
      // renders the same string sr-only for the accessible name.
      expect(
        within(dialog).getByRole("heading", { name: "Create Workflow" }),
      ).toBeVisible();
    });

    it("shows the dialog's supporting detail beside the heading", async () => {
      stubServices();
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");
      await user.click(await screen.findByRole("button", { name: /add stage/i }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByRole("heading", { name: "Create Stage" })).toBeVisible();
      // Scoped to the visible element: `DialogContent` also renders the same
      // string sr-only, which is what `aria-describedby` points at. Both are
      // meant to be there, so the assertion has to say which one it wants.
      expect(
        within(dialog).getByText(`Workflow: ${WORKFLOW.code}`, {
          selector: '[data-slot="dialog-description"]',
        }),
      ).toBeVisible();
    });
  });

  describe("query form", () => {
    it("asks for the owning workflow instead of a key column", async () => {
      stubServices();
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Queries");
      await user.click(await screen.findByRole("button", { name: /add query/i }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("Workflow")).toBeVisible();
      // The field it replaced must be gone, not merely moved down the form.
      expect(within(dialog).queryByText(/key column/i)).toBeNull();
    });

    it("posts the workflow chosen in the dialog", async () => {
      stubServices();
      const create = vi
        .spyOn(workflowService, "createQuery")
        .mockResolvedValue({ ...WORKFLOW, id: 1 } as never);
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Queries");
      await user.click(await screen.findByRole("button", { name: /add query/i }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByLabelText(/^name/i), "high-value");
      await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).toMatchObject({ workflow: WORKFLOW.id });
    });

    it("posts company as one value and sends no removed fields", async () => {
      stubServices();
      const create = vi
        .spyOn(workflowService, "createQuery")
        .mockResolvedValue({ ...WORKFLOW, id: 1 } as never);
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Queries");
      await user.click(await screen.findByRole("button", { name: /add query/i }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByLabelText(/^name/i), "high-value");
      await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      const body = create.mock.calls[0][0] as Record<string, unknown>;
      // `ALL` is the stored value, not a null plus a scope flag.
      expect(body.company).toBe("ALL");
      // The three removed columns must not reappear in the payload under any
      // name — the backend would ignore them, which is how a stale client
      // silently stops meaning what its author thinks it means.
      expect(body).not.toHaveProperty("company_scope");
      expect(body).not.toHaveProperty("type");
      expect(body).not.toHaveProperty("key_column");
    });
  });

  describe("stages", () => {
    it("renders the stages as an ordered progression", async () => {
      stubServices();
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");

      // An ordered list, because the order IS the meaning — a stage cannot
      // open until the one before it completes.
      const steps = await screen.findAllByRole("listitem");
      const names = steps.map((s) => s.textContent ?? "");
      expect(names[0]).toContain("Manager Review");
      expect(names[1]).toContain("Finance Check");
      expect(names[2]).toContain("Director Sign-off");
    });

    it("names the approver on each stage", async () => {
      stubServices();
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");
      expect(await screen.findByText("tannu")).toBeVisible();
      expect(screen.getByText("testnewuesr2")).toBeVisible();
    });

    it("says how many stages actually run when some are deactivated", async () => {
      stubServices();
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");
      // One of the three fixtures is inactive, and an inactive stage is
      // SKIPPED at runtime — so the count a reader needs is the active one.
      expect(
        await screen.findByText(/2 of 3 stages active/i),
      ).toBeVisible();
    });
  });

  describe("module and workflow pickers", () => {
    it("explains an empty workflow picker rather than showing a blank control", async () => {
      stubServices();
      vi.spyOn(workflowService, "listWorkflows").mockResolvedValue([]);
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");
      expect(
        await screen.findByText(/has no workflows yet/i),
      ).toBeVisible();
    });
  });

  describe("user assignment management", () => {
    /**
     * The non-negotiable rule of this feature: the stage is the stable step,
     * and its user is the current responsibility. Changing the user is ONE
     * PATCH of ONE field — no new workflow, no new stage, and above all no
     * "reassign the entries waiting there" step, because nothing about those
     * entries changes.
     */
    it("changes one stage's user with a single PATCH of that stage", async () => {
      stubServices();
      const update = vi
        .spyOn(workflowService, "updateStage")
        .mockResolvedValue(STAGES[0] as never);
      const createStage = vi.spyOn(workflowService, "createStage");
      const createWorkflow = vi.spyOn(workflowService, "createWorkflow");
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");
      const rows = await screen.findAllByRole("button", { name: "Edit" });
      await user.click(rows[0]);

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByRole("heading", { name: "Edit Stage User" }),
      ).toBeVisible();
      await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

      await waitFor(() => expect(update).toHaveBeenCalled());
      // Exactly one stage, and only its user.
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toBe(STAGES[0].id);
      expect(Object.keys(update.mock.calls[0][1])).toEqual(["user"]);
      // Nothing was duplicated.
      expect(createStage).not.toHaveBeenCalled();
      expect(createWorkflow).not.toHaveBeenCalled();
    });

    it("never offers to reassign pending entries", async () => {
      stubServices();
      vi.spyOn(workflowService, "updateStage").mockResolvedValue(STAGES[0] as never);
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");
      await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
      const dialog = await screen.findByRole("dialog");

      // No CONTROL and no count that would imply an entry-migration step.
      // (The explanatory copy says "nothing to reassign", so this checks for
      // the affordance rather than for the word.)
      expect(
        within(dialog).queryByRole("button", { name: /reassign|migrate/i }),
      ).toBeNull();
      expect(
        within(dialog).queryByRole("checkbox", { name: /reassign|migrate/i }),
      ).toBeNull();
      for (const forbidden of [/affected entries/i, /entries to update/i,
                               /pending entries/i, /entries to migrate/i]) {
        expect(within(dialog).queryByText(forbidden)).toBeNull();
      }
      // And it says so positively, because "nothing moves" is the part people
      // do not believe without being told.
      expect(
        within(dialog).getByText(/entries already waiting at it stay where they are/i),
      ).toBeVisible();
    });

    it("lists every workflow and stage a selected user is assigned to", async () => {
      stubServices();
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");
      await user.click(screen.getByRole("radio", { name: "By User" }));
      await user.click(await screen.findByRole("button", { name: /select a user/i }));
      await user.click(await screen.findByRole("option", { name: "mukesh" }));

      // Module, workflow, stage and company for each row — the join, not a
      // stored assignment table.
      expect(await screen.findByText("BUDGET")).toBeVisible();
      expect(screen.getByText("BUDGET_STANDARD")).toBeVisible();
      expect(screen.getByText("Finance Approval")).toBeVisible();
      expect(screen.getByText("ORDER_STANDARD")).toBeVisible();
      expect(screen.getByText(/2 workflow stage/i)).toBeVisible();
    });

    it("offers no bulk replacement anywhere in the By User view", async () => {
      stubServices();
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");
      await user.click(screen.getByRole("radio", { name: "By User" }));
      await user.click(await screen.findByRole("button", { name: /select a user/i }));
      await user.click(await screen.findByRole("option", { name: "mukesh" }));
      await screen.findByText(/2 workflow stage assignments/i);

      // A single click that rewrote every stage this person owns, across every
      // module, has no natural review step and no undo. It is deliberately not
      // offered — the only user change is Edit, on one row.
      for (const gone of [/replace all/i, /replace everywhere/i,
                          /bulk replace/i, /bulk change/i,
                          /replace user globally/i]) {
        expect(screen.queryByRole("button", { name: gone })).toBeNull();
        expect(screen.queryByText(gone)).toBeNull();
      }
      expect(
        (await screen.findAllByRole("button", { name: "Edit" })).length,
      ).toBe(2);
    });

    it("edits one row's stage and sends only that stage's user", async () => {
      stubServices();
      const update = vi
        .spyOn(workflowService, "updateStage")
        .mockResolvedValue(ASSIGNMENTS[0] as never);
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");
      await user.click(screen.getByRole("radio", { name: "By User" }));
      await user.click(await screen.findByRole("button", { name: /select a user/i }));
      await user.click(await screen.findByRole("option", { name: "mukesh" }));

      const editButtons = await screen.findAllByRole("button", { name: "Edit" });
      await user.click(editButtons[1]);          // the ORDER_STANDARD row

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByRole("heading", { name: "Edit Stage User" }),
      ).toBeVisible();
      // The dialog names what is being changed, so the wrong row is obvious.
      expect(within(dialog).getByText("ORDER")).toBeVisible();
      expect(
        within(dialog).getByText("Stage").nextElementSibling,
      ).toHaveTextContent("Manager Approval");

      await user.click(within(dialog).getByLabelText(/new user/i));
      await user.click(await screen.findByRole("option", { name: /ravi/ }));
      await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

      await waitFor(() => expect(update).toHaveBeenCalled());
      expect(update).toHaveBeenCalledTimes(1);
      // ONLY that stage, and only its user.
      expect(update.mock.calls[0][0]).toBe(ASSIGNMENTS[1].id);
      expect(update.mock.calls[0][1]).toEqual({ user: 9 });
    });

    it("shows the assigned user and flags a temporary stand-in", async () => {
      stubServices();
      const user = userEvent.setup();
      render(<Workflows />);

      await openTab(user, "Stages");
      await user.click(screen.getByRole("radio", { name: "By User" }));
      await user.click(await screen.findByRole("button", { name: /select a user/i }));
      await user.click(await screen.findByRole("option", { name: "mukesh" }));

      // The CONFIGURED user is what the column shows; the stand-in is called
      // out as temporary so the two are never confused.
      expect((await screen.findAllByText("mukesh")).length).toBeGreaterThan(0);
      expect(screen.getByText(/covered by ravi/i)).toBeVisible();
      expect(screen.getByText(/temporary replacement/i)).toBeVisible();
    });
  });
});
