/**
 * Send Bills & POs: tick open SAP documents, choose someone who can raise payment requests,
 * send; the Sent tab follows them.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../services/advancePaymentService";
import { renderPage } from "../test/renderPage";
import Advance_Payment_Dispatch from "./Advance_Payment_Dispatch";
import { SAP_OPEN_INVOICES, SAP_VENDORS } from "./advancePayments/testData";

vi.mock("../services/advancePaymentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/advancePaymentService")>();
  return {
    ...actual,
    advancePaymentService: {
      vendors: vi.fn(async () => SAP_VENDORS),
      openForDispatch: vi.fn(async () => ({ rows: SAP_OPEN_INVOICES, total: SAP_OPEN_INVOICES.length })),
      assignmentRecipients: vi.fn(async () => [{ id: 21, name: "Rahul", username: "rahul" }]),
      sendAssignments: vi.fn(async (body: { documents: unknown[] }) => body.documents.map((_d, i) => ({ id: i }))),
      assignments: vi.fn(async () => [
        {
          id: 5, company: "OIL", kind: "BILL", sap_doc_entry: 10256, sap_doc_num: "10256", card_code: "VENDA000101",
          card_name: "ABC Technologies", vendor_ref: "", doc_date: null, due_date: null, doc_total: "250000",
          open_amount: "150000", note: "", status: "RAISED", assigned_to: { id: 21, name: "Rahul", username: "rahul" },
          assigned_by: { id: 1, name: "Tester", username: "tester" },
          request: { id: 40, request_no: "AP-2026-0040", status: "IN_APPROVAL" }, created_on: "2026-09-30T10:00:00+05:30",
        },
      ]),
      assignmentAction: vi.fn(),
    },
  };
});

async function pick(user: ReturnType<typeof userEvent.setup>, label: RegExp, option: RegExp) {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("Send Bills & POs", () => {
  it("sends the ticked bills to someone who can raise payment requests", async () => {
    const user = userEvent.setup();
    renderPage(<Advance_Payment_Dispatch />, { route: "/Advance_Payment_Dispatch" });
    await user.selectOptions(screen.getByLabelText(/^Company/), "OIL");
    const table = await screen.findByRole("table", { name: "Open documents" });
    expect(advancePaymentService.openForDispatch).toHaveBeenCalledWith("BILL", "OIL", {
      cardCode: "",
      search: "",
      fromDate: expect.stringMatching(/^\d{4}-\d{2}-01$/),
      offset: 0,
      limit: 50,
    });
    await user.click(within(table).getByRole("checkbox", { name: "Select 10256" }));
    await user.click(within(table).getByRole("checkbox", { name: "Select 10263" }));
    await pick(user, /^Send To/, /Rahul/);
    await user.type(screen.getByLabelText(/^Note/), "Pay these this week");
    await user.click(screen.getByRole("button", { name: /^Send 2 Documents$/ }));

    expect(await screen.findByText("2 documents sent to Rahul.")).toBeTruthy();
    expect(advancePaymentService.sendAssignments).toHaveBeenCalledWith({
      company: "OIL",
      assigned_to: 21,
      documents: [{ kind: "BILL", sap_doc_entry: 10256 }, { kind: "BILL", sap_doc_entry: 10263 }],
      note: "Pay these this week",
    });
  });

  it("shows last month and this month only, a page of 50 at a time, keeping ticks across pages", async () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const since = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-01`;
    const page = (n: number) =>
      Array.from({ length: n }, (_v, i) => ({ ...SAP_OPEN_INVOICES[0], doc_entry: 20000 + i, doc_num: 20000 + i }));
    vi.mocked(advancePaymentService.openForDispatch).mockImplementation(async (_kind, _co, opts) =>
      opts?.offset ? { rows: page(1).map((r) => ({ ...r, doc_entry: 30000, doc_num: 30000 })), total: 51 }
        : { rows: page(50), total: 51 },
    );
    const user = userEvent.setup();
    renderPage(<Advance_Payment_Dispatch />, { route: "/Advance_Payment_Dispatch" });
    await user.selectOptions(screen.getByLabelText(/^Company/), "OIL");
    const table = await screen.findByRole("table", { name: "Open documents" });
    expect(vi.mocked(advancePaymentService.openForDispatch).mock.calls.at(-1)?.[2]).toMatchObject({ fromDate: since });
    expect(screen.getByText(/last month and this month/)).toBeTruthy();
    expect(screen.getByText("Showing 1–50 of 51")).toBeTruthy();

    await user.click(within(table).getByRole("checkbox", { name: "Select 20000" }));
    await user.click(screen.getByRole("button", { name: /page 2/i }));
    await screen.findByRole("checkbox", { name: "Select 30000" });
    expect(vi.mocked(advancePaymentService.openForDispatch).mock.calls.at(-1)?.[2]).toMatchObject({ offset: 50 });
    await user.click(screen.getByRole("checkbox", { name: "Select 30000" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("looks further back from a chosen date, or at every date when cleared, and resets", async () => {
    vi.mocked(advancePaymentService.openForDispatch).mockResolvedValue({ rows: SAP_OPEN_INVOICES, total: 2 });
    const user = userEvent.setup();
    renderPage(<Advance_Payment_Dispatch />, { route: "/Advance_Payment_Dispatch" });
    await user.selectOptions(screen.getByLabelText(/^Company/), "OIL");
    await screen.findByRole("table", { name: "Open documents" });
    const from = screen.getByLabelText(/^Posted From/) as HTMLInputElement;
    const lastCall = () => vi.mocked(advancePaymentService.openForDispatch).mock.calls.at(-1)?.[2];
    const defaultFrom = from.value;

    await user.clear(from);
    await user.type(from, "2025-04-01");
    expect(lastCall()).toMatchObject({ fromDate: "2025-04-01", offset: 0 });
    expect(screen.getByText("Posted since 01 Apr 2025")).toBeTruthy();

    await user.clear(from);
    expect(lastCall()).toMatchObject({ fromDate: "" });
    expect(screen.getByText("All dates")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(from.value).toBe(defaultFrom);
    expect(lastCall()).toMatchObject({ fromDate: defaultFrom });
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("marks a document other requests already hold in full, and it cannot be ticked", async () => {
    vi.mocked(advancePaymentService.openForDispatch).mockResolvedValue({
      rows: [{ ...SAP_OPEN_INVOICES[0], oms: { reserved: "150000", paid: "0", available: "0", requests: 1 } }],
      total: 1,
    });
    const user = userEvent.setup();
    renderPage(<Advance_Payment_Dispatch />, { route: "/Advance_Payment_Dispatch" });
    await user.selectOptions(screen.getByLabelText(/^Company/), "OIL");
    const box = (await screen.findByRole("checkbox", { name: "Select 10256" })) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(screen.getByText("Fully held")).toBeTruthy();
  });

  it("will not send without a document and a user", async () => {
    const user = userEvent.setup();
    renderPage(<Advance_Payment_Dispatch />, { route: "/Advance_Payment_Dispatch" });
    await user.selectOptions(screen.getByLabelText(/^Company/), "OIL");
    await screen.findByRole("table", { name: "Open documents" });
    expect((screen.getByRole("button", { name: /^Send\s+Documents$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Tick documents below")).toBeTruthy();
  });

  it("follows what was sent", async () => {
    const user = userEvent.setup();
    renderPage(<Advance_Payment_Dispatch />, { route: "/Advance_Payment_Dispatch" });
    await user.click(screen.getByRole("tab", { name: "Sent" }));
    const table = await screen.findByRole("table", { name: "Sent documents" });
    expect(await within(table).findByText("Request raised")).toBeTruthy();
    expect(within(table).getByText("AP-2026-0040")).toBeTruthy();
    expect(within(table).queryByRole("button", { name: "Withdraw" })).toBeNull();
  });
});
