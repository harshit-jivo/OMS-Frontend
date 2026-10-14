import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService, type ExpenseDashboard, type OmsDashboard } from "../services/advancePaymentService";
import { renderPage } from "../test/renderPage";
import Payments_Expenses from "./Payments_Expenses";
import { changeLabel, compactINR, presetRange } from "./expenseDashboard/format";
import { DWELL_STORAGE_KEY, PAUSED_STORAGE_KEY } from "./expenseDashboard/rotation";

const row = (account: string, amount: number) => ({
  date: "2026-09-10", doc_num: 1, trans_id: 1, budget: "Factory", sub_budget: "PLANT", variety: "",
  account, branch: "OIL", kind: "Direct", category: "Operations & Factory", amount, remarks: "",
});

const DATA: ExpenseDashboard = {
  period: { from: "2026-09-01", to: "2026-09-30", days: 30, previous_from: "2026-08-02", previous_to: "2026-08-31" },
  filters: { branch: "", kind: "all", include_salary: false, branches: ["OIL", "BEVERAGES"] },
  kpis: {
    total: 17025855, previous: 10599588, change: 60.6, direct: 12422544, indirect: 4603311, entries: 1969,
    per_day: 567528, salary: 860332, salary_included: false,
    top_head: { name: "Interest", amount: 5457719, share: 32.1 },
  },
  trend: [{ month: "2026-09", label: "Sep 26", direct: 12422544, indirect: 4603311, total: 17025855 }],
  categories: [{ name: "Sales & Marketing", amount: 5473143, entries: 400, share: 32.1 }],
  heads: [{
    name: "Factory", amount: 3235412, entries: 104, share: 19, previous: 2838000, change: 14,
    accounts: [{ name: "ELECTRICITY", amount: 1914328, entries: 12, share: 59 }],
    sub_budgets: [{ name: "PLANT", amount: 3235412, entries: 104, share: 100 }],
    rows: [row("ELECTRICITY", 1914328)],
  }],
  accounts: [{ name: "INTEREST ON BANK LOAN", amount: 5431818, entries: 50, share: 32 }],
  varieties: [], branches: [{ name: "OIL", amount: 12951676, entries: 1302, share: 76.1 }],
  largest: [row("INTEREST ON BANK LOAN", 2500000)],
  oms: {
    by_status: { IN_APPROVAL: { count: 1, amount: 10000 }, COMPLETED: { count: 1, amount: 1000 } },
    waiting: [{ stage: "Payment Approval", count: 1, amount: 10000 }],
    latest: [{ id: 62, request_no: "AP-2026-0062", company: "OIL", payee: "Ravi", budget: "Factory",
               amount: 10000, status: "IN_APPROVAL", stage: "Payment Approval", created_on: "2026-10-09T10:00:00Z" }],
  },
};

const panel = () => screen.getByRole("tabpanel");
const tab = (name: string) => screen.getByRole("tab", { name });

const OMS: OmsDashboard = {
  period: DATA.period,
  filters: { company: "", companies: ["OIL", "BEVERAGES", "MART"] },
  kpis: {
    raised: { count: 14, amount: 394206, previous: 120000, change: 228.5 },
    paid: { count: 5, amount: 35472, previous: 0, change: null },
    pending: { count: 8, amount: 357849, returned: 2 },
    rejected: { count: 1, amount: 885 },
    days_to_pay: 3.4,
  },
  trend: [{ month: "2026-10", label: "Oct 26", raised: 234955, paid: 26221 }],
  by_type: [{ name: "Vendor", amount: 271961, entries: 9, share: 69 }],
  bill_or_advance: [{ name: "Advance", amount: 336735, entries: 6, share: 85.4 }, { name: "Bill", amount: 45226, entries: 5, share: 11.5 }],
  by_company: [{ name: "OIL", amount: 394206, entries: 14, share: 100 }],
  top_payees: [{ name: "RAJ TECHNOPACK PVT LTD", amount: 700215, entries: 1, share: 60 }],
  waiting_at: [{ name: "Final Approval", amount: 215850, entries: 2, share: 60.3 }],
  waiting_on: [{ name: "Gurpreet Vg", amount: 215850, entries: 2, share: 60.3 }],
  ageing: [{ name: "Over 15 days", entries: 3, amount: 120000 }],
  oldest: [{ id: 2, request_no: "AP-2026-0002", company: "OIL", payee: "ABC", type: "Vendor", kind: "Bill",
             amount: 30000, stage: "Payment Approval", waiting_on: "taran", days: 18.9 }],
  expenses: DATA.oms,
};

beforeEach(() => {
  localStorage.removeItem(DWELL_STORAGE_KEY);
  localStorage.removeItem(PAUSED_STORAGE_KEY);
  localStorage.removeItem("payments-expenses-board-source");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the expense board's numbers", () => {
  it("formats money the way Control Panel does, and changes with a sign", () => {
    expect(compactINR(17025855)).toBe("₹1.70 Cr");
    expect(compactINR(5457719)).toBe("₹54.6 L");
    expect(changeLabel(60.6)).toBe("+60.6%");
    expect(changeLabel(-12)).toBe("−12.0%");
    expect(changeLabel(28418.6)).toBe("285×");
    expect(changeLabel(null)).toBe("new");
  });

  it("knows the quick periods, the financial year from 1 April", () => {
    const today = new Date(2026, 9, 13);
    expect(presetRange("last-month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("fy", today)).toEqual({ from: "2026-04-01", to: "2026-10-13" });
  });
});

describe("Payments & Expenses board", () => {
  it("opens on the overview, and steps through its slides by dot and by key", async () => {
    vi.spyOn(advancePaymentService, "expenseDashboard").mockResolvedValue(DATA);
    const user = userEvent.setup();
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });

    await screen.findByRole("tabpanel", { name: "Overview" });
    expect(within(panel()).getAllByText("₹1.70 Cr").length).toBe(2); // the tile and the donut
    expect(within(panel()).getByText("+60.6%")).toBeTruthy();
    expect(tab("Overview").getAttribute("aria-selected")).toBe("true");

    await user.click(tab("Accounts & entries"));
    expect(screen.getByRole("tabpanel", { name: "Accounts & entries" }).textContent).toContain("INTEREST ON BANK LOAN");

    fireEvent.keyDown(window, { key: "4" });
    expect(await screen.findByRole("tabpanel", { name: "Branches & varieties" })).toBeTruthy();
    expect(panel().textContent).toContain("OIL");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByRole("tabpanel", { name: "Overview" })).toBeTruthy();
  });

  it("moves on by itself after the dwell, and space holds it", async () => {
    vi.spyOn(advancePaymentService, "expenseDashboard").mockResolvedValue(DATA);
    localStorage.setItem(DWELL_STORAGE_KEY, "15");
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await screen.findByRole("tabpanel", { name: "Overview" });

    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    // Restart the turn under the fake clock, then let it run out.
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("ROTATING")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(15_500);
    });
    expect(screen.getByRole("tabpanel", { name: "Budget heads" })).toBeTruthy();

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("HELD")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("tabpanel", { name: "Budget heads" })).toBeTruthy();
    expect(localStorage.getItem(PAUSED_STORAGE_KEY)).toBe("true");
  });

  it("holds the slide while somebody opens a budget head", async () => {
    vi.spyOn(advancePaymentService, "expenseDashboard").mockResolvedValue(DATA);
    const user = userEvent.setup();
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await screen.findByRole("tabpanel", { name: "Overview" });

    await user.click(tab("Budget heads"));
    await user.click(within(panel()).getByRole("button", { name: /Factory/ }));
    expect(within(panel()).getAllByText("ELECTRICITY").length).toBeGreaterThan(0);
    expect(screen.getByText("HELD")).toBeTruthy();
  });

  it("re-reads SAP when a filter changes", async () => {
    const load = vi.spyOn(advancePaymentService, "expenseDashboard").mockResolvedValue(DATA);
    const user = userEvent.setup();
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await screen.findByRole("tabpanel", { name: "Overview" });

    await user.selectOptions(screen.getByLabelText("Branch"), "BEVERAGES");
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ branch: "BEVERAGES", includeSalary: false }));
    await user.click(screen.getByRole("button", { name: "Last month" }));
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining(presetRange("last-month")));
  });

  it("switches to OMS: its own slides, figures and company filter, and remembers the choice", async () => {
    vi.spyOn(advancePaymentService, "expenseDashboard").mockResolvedValue(DATA);
    const loadOms = vi.spyOn(advancePaymentService, "omsDashboard").mockResolvedValue(OMS);
    const user = userEvent.setup();
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await screen.findByRole("tabpanel", { name: "Overview" });
    expect(screen.getByRole("heading", { name: /Payments & Expenses/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "OMS" }));
    expect((await screen.findAllByText("₹3.9 L")).length).toBe(2); // the Raised tile and the donut
    expect(within(panel()).getByText("Pending now")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Pipeline" })).toBeTruthy();
    expect(localStorage.getItem("payments-expenses-board-source")).toBe("oms");

    await user.click(tab("Pipeline"));
    expect(panel().textContent).toContain("AP-2026-0002");
    expect(panel().textContent).toContain("Gurpreet Vg");

    await user.click(tab("Expenses"));
    expect(panel().textContent).toContain("AP-2026-0062");

    await user.selectOptions(screen.getByLabelText("Company"), "MART");
    expect(loadOms).toHaveBeenLastCalledWith(expect.objectContaining({ company: "MART" }));
    // No SAP filters on the OMS side.
    expect(screen.queryByLabelText("Branch")).toBeNull();
  });
});
