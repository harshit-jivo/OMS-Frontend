import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ComplianceRules from "./Compliance_Rules";
import { legalService, type ComplianceRule } from "../services/legalService";
import { __resetToasts, subscribeToToasts, type ToastData } from "@/lib/toastStore";

/**
 * The page reports success through the toast store rather than an inline line
 * that pushes the form down. `NotificationToaster` is mounted by the app shell,
 * which this test does not render, so the store is what the assertions read.
 */
let toasts: ToastData[] = [];
let unsubscribe = () => {};

beforeEach(() => {
  __resetToasts();
  toasts = [];
  unsubscribe = subscribeToToasts((items) => {
    toasts = items;
  });
});

afterEach(() => {
  unsubscribe();
  __resetToasts();
});

/**
 * The Compliance Rules screen.
 *
 * This page is the only way the legal desk changes what a label is judged
 * against, so the cases worth pinning are the ones where a silent failure
 * would be expensive:
 *
 *  * `code` is frozen on an existing rule. Reports already issued cite it as
 *    `rule_id`; a screen that let it be edited would orphan them, and the
 *    server would silently drop the change so nothing would look wrong here.
 *  * Save sends the rule TEXT. It reaches the model verbatim, so a form that
 *    posted a stale draft would change the checker's behaviour invisibly.
 *  * The on/off toggle is the common edit (stop checking a rule) and must not
 *    require opening the editor.
 *  * A load failure explains itself — the likely cause is an unmigrated
 *    server, which is not something a blank page communicates.
 *
 * The service is mocked rather than the network: it is this page's real
 * boundary, and mocking axios would test the service's URL building twice.
 */

const RULES: ComplianceRule[] = [
  {
    id: 1,
    code: "FSSAI_LICENCE",
    name: "FSSAI logo and licence number",
    rule_text: "A 14-digit FSSAI licence number must be present.",
    critical_tokens: ["FSSAI"],
    is_critical: true,
    is_active: true,
    sort_order: 10,
  },
  {
    id: 2,
    code: "BARCODE_PRESENT",
    name: "Barcode",
    rule_text: "A scannable barcode must be present.",
    critical_tokens: [],
    is_critical: false,
    is_active: false,
    sort_order: 20,
  },
];

const listRules = (rules = RULES) =>
  vi.spyOn(legalService, "listRules").mockResolvedValue(rules.map((r) => ({ ...r })));

afterEach(() => vi.restoreAllMocks());

/** Render and wait for the initial load to settle. */
async function renderPage(rules = RULES) {
  listRules(rules);
  render(<ComplianceRules />);
  await screen.findByRole("heading", { name: /Compliance Rules/i });
  return userEvent.setup();
}

describe("Compliance Rules", () => {
  it("lists the rules with their code, position and state", async () => {
    await renderPage();

    expect(await screen.findByText("FSSAI logo and licence number")).toBeInTheDocument();
    expect(screen.getByText("FSSAI_LICENCE")).toBeInTheDocument();
    expect(screen.getByText("critical")).toBeInTheDocument();
    // One of two rules is active. The count moved out of the card heading and
    // into a KPI beside the total, so the two numbers are read together
    // instead of one being parenthesised inside the other.
    const active = screen.getByText("Active rules").closest("[data-slot='stat']");
    expect(within(active as HTMLElement).getByText("1")).toBeInTheDocument();
    const total = screen.getByText("Total rules").closest("[data-slot='stat']");
    expect(within(total as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("freezes the code of an existing rule", async () => {
    const user = await renderPage();

    await user.click(await screen.findByText("FSSAI logo and licence number"));

    const code = screen.getByDisplayValue("FSSAI_LICENCE");
    expect(code).toBeDisabled();
    expect(
      screen.getByText(/reports already issued cite this code/i),
    ).toBeInTheDocument();
  });

  it("saves the edited rule text, without the code", async () => {
    const update = vi
      .spyOn(legalService, "updateRule")
      .mockImplementation(async (id, patch) => ({
        ...RULES[0],
        ...patch,
        id,
      }) as ComplianceRule);
    const user = await renderPage();

    await user.click(await screen.findByText("FSSAI logo and licence number"));

    const textarea = screen.getByDisplayValue(
      "A 14-digit FSSAI licence number must be present.",
    );
    await user.clear(textarea);
    await user.type(textarea, "The licence number must be exactly 14 digits.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [id, patch] = update.mock.calls[0];
    expect(id).toBe(1);
    expect(patch.rule_text).toBe("The licence number must be exactly 14 digits.");
    // The server freezes `code`; sending it would imply renaming works.
    expect(patch).not.toHaveProperty("code");
    // The confirmation is a toast now rather than a line that pushes the form
    // down as it appears — `NotificationToaster` is mounted by the app shell,
    // which this test does not render, so the store is what it asserts on.
    await waitFor(() =>
      expect(toasts.some((t) => /uses this wording/i.test(t.message))).toBe(true),
    );
  });

  it("keeps Save disabled until something actually changes", async () => {
    const user = await renderPage();

    await user.click(await screen.findByText("Barcode"));

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.type(screen.getByDisplayValue("Barcode"), " scan");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("turns a rule off from the list, without opening it", async () => {
    const update = vi
      .spyOn(legalService, "updateRule")
      .mockResolvedValue({ ...RULES[0], is_active: false });
    const user = await renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: /Deactivate FSSAI logo and licence number/i,
      }),
    );

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(1, { is_active: false }),
    );
  });

  it("normalises a new rule's code to an identifier", async () => {
    const create = vi
      .spyOn(legalService, "createRule")
      .mockImplementation(async (draft) => ({ ...draft, id: 99 }) as ComplianceRule);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: /New rule/i }));
    await user.type(screen.getByPlaceholderText("FSSAI_LICENCE"), "net quantity!");
    await user.type(
      screen.getByPlaceholderText("FSSAI logo and licence number"),
      "Net quantity",
    );
    await user.type(
      screen.getByPlaceholderText(/The FSSAI logo must appear/),
      "Net quantity must be declared in metric units.",
    );
    await user.click(screen.getByRole("button", { name: "Create rule" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].code).toBe("NET_QUANTITY_");
  });

  it("puts a new rule after the last one rather than jumping the queue", async () => {
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: /New rule/i }));

    // Highest existing sort_order is 20.
    expect(screen.getByRole("spinbutton")).toHaveValue(30);
  });

  it("splits the OCR wording into tokens", async () => {
    const update = vi
      .spyOn(legalService, "updateRule")
      .mockResolvedValue({ ...RULES[1], critical_tokens: ["Best Before", "Use By"] });
    const user = await renderPage();

    await user.click(await screen.findByText("Barcode"));
    await user.type(
      screen.getByPlaceholderText("Best Before, Use By"),
      "Best Before, Use By",
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1].critical_tokens).toEqual(["Best Before", "Use By"]);
  });

  it("explains a failed load instead of rendering an empty list", async () => {
    vi.spyOn(legalService, "listRules").mockRejectedValue(new Error("boom"));
    render(<ComplianceRules />);

    expect(await screen.findByText(/migrate legal/i)).toBeInTheDocument();
  });

  it("surfaces the server's own message when a save is rejected", async () => {
    vi.spyOn(legalService, "updateRule").mockRejectedValue({
      response: { data: { code: ["Rule with this code already exists."] } },
    });
    const user = await renderPage();

    await user.click(await screen.findByText("Barcode"));
    await user.type(screen.getByDisplayValue("Barcode"), "!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText(/Rule with this code already exists/i),
    ).toBeInTheDocument();
  });

  it("says what to do when there are no rules at all", async () => {
    await renderPage([]);

    const list = await screen.findByText(/A label check refuses until at least one exists/i);
    expect(list).toBeInTheDocument();
  });

  /*
   * These two used to drive `window.confirm`. The warning is a Dialog now —
   * same words, same "does nothing if declined" — because a `confirm` box
   * cannot show the rule code in the page's own type, and because the design
   * system retired it (DESIGN_SYSTEM.md §6).
   */
  it("warns that deleting breaks issued reports, and does nothing if declined", async () => {
    const remove = vi.spyOn(legalService, "deleteRule").mockResolvedValue();
    const user = await renderPage();

    await user.click(await screen.findByText("Barcode"));
    await user.click(screen.getByRole("button", { name: /^Delete$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/no longer be explainable/i);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes when confirmed", async () => {
    const remove = vi.spyOn(legalService, "deleteRule").mockResolvedValue();
    const user = await renderPage();

    await user.click(await screen.findByText("Barcode"));
    await user.click(screen.getByRole("button", { name: /^Delete$/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete rule" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(2));
    await waitFor(() =>
      expect(screen.queryByText("Barcode")).not.toBeInTheDocument(),
    );
  });

  it("orders the list by position", async () => {
    await renderPage();

    const list = (await screen.findByText("FSSAI_LICENCE")).closest("ul");
    const names = within(list as HTMLElement)
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => text.includes("position"));
    expect(names[0]).toContain("FSSAI_LICENCE");
  });
});
