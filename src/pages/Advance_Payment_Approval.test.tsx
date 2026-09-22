/**
 * The approval desk, on its sample requests. `advancePayments/payout.test.ts`
 * pins the payout rules; this pins that the PAGE applies them — approving
 * needs complete, balanced payment details, rejecting needs a reason, a
 * decided request is read-only, and an edit goes through the request form.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../services/advancePaymentService";
import { renderPage } from "../test/renderPage";
import Advance_Payment_Approval from "./Advance_Payment_Approval";
import { addRequest, resetRequests } from "./advancePayments/requestStore";
import { EMPTY_FORM } from "./advancePayments/rules";
import { SAP_EMPLOYEES, SAP_OPEN_INVOICES, SAP_VENDORS } from "./advancePayments/testData";

vi.mock("../services/advancePaymentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/advancePaymentService")>();
  return {
    ...actual,
    advancePaymentService: {
      vendors: vi.fn(async () => SAP_VENDORS),
      employees: vi.fn(async () => SAP_EMPLOYEES),
      openVendorInvoices: vi.fn(async () => SAP_OPEN_INVOICES),
    },
  };
});

beforeEach(() => {
  // The request list is one in-memory store shared by both pages.
  resetRequests();
  vi.mocked(advancePaymentService.employees).mockClear();
});

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const user = userEvent.setup();
  renderPage(<Advance_Payment_Approval />, { route: "/Advance_Payment_Approval" });
  return user;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A field by the START of its label — a required label ends in "*". */
const field = (label: RegExp | string) =>
  screen.getByLabelText(
    typeof label === "string" ? new RegExp(`^${escapeRegExp(label)}`) : label,
  ) as HTMLInputElement;
const requestRows = () =>
  screen.getAllByRole("row").filter((row) => /AP-2026-/.test(row.textContent ?? ""));

async function review(user: User, requestNo: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(`(Review|View) ${requestNo}`) }));
}

async function approve(user: User) {
  await user.click(screen.getByRole("button", { name: "Approve" }));
}

describe("Advance Payment Approvals", () => {
  it("lists the pending requests first, with the totals", () => {
    setup();
    expect(requestRows().map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual([
      expect.stringMatching(/^AP-2026-0014/),
      expect.stringMatching(/^AP-2026-0013/),
      expect.stringMatching(/^AP-2026-0012/),
    ]);
    // ₹1,37,500 + ₹20,000 + ₹24,500 pending.
    expect(screen.getByText("₹1,82,000 waiting")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pending/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("filters by clicking a KPI card", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Total/ }));
    expect(requestRows()).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: /Rejected/ }));
    expect(requestRows()).toHaveLength(1);
  });

  it("filters by the status dropdown, the company and a search", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Filter requests by status"), "");
    expect(requestRows()).toHaveLength(5);
    await user.selectOptions(screen.getByLabelText("Filter requests by company"), "BEVERAGES");
    expect(requestRows()).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText("Filter requests by company"), "");
    await user.type(screen.getByLabelText("Search requests"), "ravinder");
    expect(requestRows()).toHaveLength(1);
    expect(requestRows()[0].textContent).toMatch(/AP-2026-0013/);
  });

  it("shows a request raised on the request page, waiting for review", () => {
    addRequest(
      { ...EMPTY_FORM, company: "MART", type: "VENDOR", paymentAgainst: "ADVANCE", partner: "VENDA000101", partnerName: "ABC Technologies", amount: "9000" },
      [],
      "Neha Agarwal",
    );
    setup();
    expect(requestRows()[0].textContent).toMatch(/AP-2026-0015.*Neha Agarwal.*₹9,000.*Pending/);
  });

  it("shows the entry's details and its bills with their payment lines", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");

    expect(screen.getByRole("heading", { name: "AP-2026-0014" })).toBeTruthy();
    expect(screen.getByText("ABC Technologies")).toBeTruthy();
    expect(screen.getByText("Procurement — Rajesh")).toBeTruthy();
    const bills = screen.getByRole("heading", { name: /Bills & Amounts/ }).closest("section")!;
    expect(within(bills).getByText("10256")).toBeTruthy();
    expect(within(bills).getByText("₹97,500")).toBeTruthy(); // 65% of ₹1,50,000 open
    expect(within(bills).getByText("₹1,37,500")).toBeTruthy();
  });

  it("starts the payment details with one line for the whole amount, to the partner", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    expect(field("Beneficiary Name").value).toBe("ABC TECHNOLOGIES");
    expect(field("Amount (method 1)").value).toBe("137500");
    expect(screen.getByRole("status", { name: "Allocated to payment methods" }).textContent).toBe(
      "₹1,37,500 of ₹1,37,500 allocated",
    );
  });

  it("will not approve until the payment details are complete", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    await approve(user);
    const warning = screen.getByText(/Still needed:/);
    expect(warning.textContent).toMatch(/To Account Number/);
    expect(warning.textContent).toMatch(/IFSC/);
    expect(warning.textContent).toMatch(/From Account \(method 1\)/);
  });

  it("approves once the bank details are in, then locks them", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    await user.type(field("To Account Number"), "50100234567812");
    await user.type(field("IFSC"), "hdfc0001234");
    await user.selectOptions(field("From Bank Account (method 1)"), "HDFC:1104106");
    await user.type(field("UPI Reference / UTR (method 1)"), "utr123");
    await user.type(field("Approver Remarks"), "OK to pay");
    await approve(user);

    expect(screen.getByText(/Approved — preview only/)).toBeTruthy();
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(field("IFSC").value).toBe("HDFC0001234");
    expect(field("IFSC").closest("fieldset")?.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("refuses a split that does not add up to the request", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    await user.clear(field("Amount (method 1)"));
    await user.type(field("Amount (method 1)"), "100000");
    await approve(user);
    expect(screen.getByText(/add up to ₹1,00,000, but the request is for ₹1,37,500/)).toBeTruthy();
  });

  it("pays in cash with a note breakdown, as receive payment does", async () => {
    const user = setup();
    await review(user, "AP-2026-0013"); // ₹20,000 employee advance
    await user.selectOptions(field("Payment Method 1"), "CASH");
    expect(screen.queryByLabelText(/^To Account Number/)).toBeTruthy(); // still shown…
    await user.selectOptions(field("From Cash Account (method 1)"), "1105001");

    await approve(user);
    // In the notice AND under the breakdown itself.
    expect(screen.getAllByText(/Add the cash denominations for ₹20,000/).length).toBe(2);

    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.selectOptions(field("Denomination 1"), "500");
    await user.type(field("Quantity 1"), "40");
    await approve(user);
    // …but not required when every line is cash.
    expect(screen.getByText(/Approved — preview only/)).toBeTruthy();
  });

  it("needs a reason to reject", async () => {
    const user = setup();
    await review(user, "AP-2026-0012");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByText(/Say why it is being rejected/)).toBeTruthy();

    await user.type(field("Approver Remarks"), "PO not yet released");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByText(/Rejected — preview only/)).toBeTruthy();
    expect(screen.getByText("PO not yet released")).toBeTruthy();
  });

  it("edits the entry through the request form, and marks it edited", async () => {
    const user = setup();
    await review(user, "AP-2026-0013");
    await user.click(screen.getByRole("button", { name: "Edit Entry" }));

    const ownership = field(/^Ownership/);
    expect(ownership.value).toBe("HR — Sunita");
    await user.clear(ownership);
    await user.type(ownership, "HR — Payroll desk");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(screen.getByText("HR — Payroll desk")).toBeTruthy();
    expect(screen.getByText(/Edited by Tester/)).toBeTruthy();
  });

  it("cancelling an edit leaves the entry as it was", async () => {
    const user = setup();
    await review(user, "AP-2026-0013");
    await user.click(screen.getByRole("button", { name: "Edit Entry" }));
    await user.clear(field(/^Ownership/));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("HR — Sunita")).toBeTruthy();
  });

  it("shows a decided request read-only, with its payout and decision", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Approved/ }));
    await review(user, "AP-2026-0011");

    expect(screen.queryByRole("button", { name: "Edit Entry" })).toBeNull();
    expect(field("UPI Reference / UTR (method 1)").value).toBe("UTR426118823401");
    expect(field("UPI Reference / UTR (method 1)").closest("fieldset")?.disabled).toBe(true);
    expect(screen.getByText("Approved as per imprest policy.")).toBeTruthy();
  });

  it("goes back to the list", async () => {
    const user = setup();
    await review(user, "AP-2026-0014");
    await user.click(screen.getByRole("button", { name: "Back to list" }));
    expect(screen.getByRole("heading", { name: "Advance Payment Approvals" })).toBeTruthy();
  });
});
