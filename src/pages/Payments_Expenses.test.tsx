import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  advancePaymentService,
  type BudgetBoard,
  type BudgetHead,
  type ExpenseDashboard,
  type OmsDashboard,
} from "../services/advancePaymentService";
import { renderPage } from "../test/renderPage";
import Payments_Expenses from "./Payments_Expenses";
import { changeLabel, compactINR, presetRange } from "./expenseDashboard/format";
import { DWELL_STORAGE_KEY, PAUSED_STORAGE_KEY } from "./expenseDashboard/rotation";

const row = (account: string, amount: number) => ({
  date: "2026-09-10",
  doc_num: 1,
  trans_id: 1,
  budget: "Factory",
  sub_budget: "PLANT",
  variety: "",
  account,
  branch: "OIL",
  kind: "Direct",
  category: "Operations & Factory",
  amount,
  remarks: "",
});

const DATA: ExpenseDashboard = {
  period: {
    from: "2026-09-01",
    to: "2026-09-30",
    days: 30,
    previous_from: "2026-08-02",
    previous_to: "2026-08-31",
  },
  filters: { branch: "", kind: "all", include_salary: false, branches: ["OIL", "BEVERAGES"] },
  kpis: {
    total: 17025855,
    previous: 10599588,
    change: 60.6,
    direct: 12422544,
    indirect: 4603311,
    entries: 1969,
    per_day: 567528,
    salary: 860332,
    salary_included: false,
    top_head: { name: "Interest", amount: 5457719, share: 32.1 },
  },
  trend: [
    { month: "2026-09", label: "Sep 26", direct: 12422544, indirect: 4603311, total: 17025855 },
  ],
  categories: [{ name: "Sales & Marketing", amount: 5473143, entries: 400, share: 32.1 }],
  heads: [
    {
      name: "Factory",
      amount: 3235412,
      entries: 104,
      share: 19,
      previous: 2838000,
      change: 14,
      accounts: [{ name: "ELECTRICITY", amount: 1914328, entries: 12, share: 59 }],
      sub_budgets: [{ name: "PLANT", amount: 3235412, entries: 104, share: 100 }],
      rows: [row("ELECTRICITY", 1914328)],
    },
  ],
  accounts: [{ name: "INTEREST ON BANK LOAN", amount: 5431818, entries: 50, share: 32 }],
  varieties: [],
  branches: [{ name: "OIL", amount: 12951676, entries: 1302, share: 76.1 }],
  largest: [row("INTEREST ON BANK LOAN", 2500000)],
  oms: {
    by_status: { IN_APPROVAL: { count: 1, amount: 10000 }, COMPLETED: { count: 1, amount: 1000 } },
    waiting: [{ stage: "Payment Approval", count: 1, amount: 10000 }],
    latest: [
      {
        id: 62,
        request_no: "AP-2026-0062",
        company: "OIL",
        payee: "Ravi",
        budget: "Factory",
        amount: 10000,
        status: "IN_APPROVAL",
        stage: "Payment Approval",
        created_on: "2026-10-09T10:00:00Z",
      },
    ],
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
  bill_or_advance: [
    { name: "Advance", amount: 336735, entries: 6, share: 85.4 },
    { name: "Bill", amount: 45226, entries: 5, share: 11.5 },
  ],
  by_company: [{ name: "OIL", amount: 394206, entries: 14, share: 100 }],
  top_payees: [{ name: "RAJ TECHNOPACK PVT LTD", amount: 700215, entries: 1, share: 60 }],
  by_purpose: [
    { name: "Freight Outward", amount: 185850, entries: 2, share: 47 },
    { name: "Expense", amount: 12245, entries: 3, share: 3 },
  ],
  by_budget: [{ name: "Del Bkhp", amount: 252710, entries: 5, share: 64 }],
  waiting_at: [{ name: "Final Approval", amount: 215850, entries: 2, share: 60.3 }],
  waiting_on: [{ name: "Gurpreet Vg", amount: 215850, entries: 2, share: 60.3 }],
  ageing: [{ name: "Over 15 days", entries: 3, amount: 120000 }],
  oldest: [
    {
      id: 2,
      request_no: "AP-2026-0002",
      company: "OIL",
      payee: "ABC",
      type: "Vendor",
      kind: "Bill",
      amount: 30000,
      stage: "Payment Approval",
      waiting_on: "taran",
      days: 18.9,
    },
  ],
  expenses: DATA.oms,
};

beforeEach(() => {
  localStorage.removeItem(DWELL_STORAGE_KEY);
  localStorage.removeItem(PAUSED_STORAGE_KEY);
  localStorage.removeItem("payments-expenses-board-view");
  // Not a budget head's owner, unless a test says so.
  vi.spyOn(advancePaymentService, "budgetBoardMe").mockResolvedValue({
    view: null,
    can_switch: false,
  });
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

const head = (
  key: string,
  name: string,
  base: number,
  current: number,
  extra: Partial<BudgetHead> = {},
): BudgetHead => ({
  key,
  name,
  owners: [],
  base,
  current,
  ratio: base ? current / base : null,
  entries: 3,
  by_company: [{ company: "OIL", label: "Oil", base, current }],
  tree: [
    {
      name: `${name} › MAIN`,
      base,
      current,
      entries: 1,
      accounts: [
        {
          name: `${name.toUpperCase()} EXPENSES`,
          base,
          current,
          entries: 1,
          postings: [
            {
              date: "2026-10-09",
              company: "OIL",
              doc_num: 4501,
              remarks: "October, Mundka",
              amount: current,
            },
          ],
        },
      ],
    },
  ],
  ...extra,
});

const BOARD: BudgetBoard = {
  current: {
    month: "2026-10",
    label: "Oct 2026",
    from: "2026-10-01",
    to: "2026-10-14",
    days: 31,
    elapsed: 14,
    pace: 0.4516,
  },
  baseline: { month: "2026-08", label: "Aug 2026", from: "2026-08-01", to: "2026-08-31" },
  // The rows' sum: every posting is in one of them.
  total: { base: 30339621, current: 19856289, ratio: 0.6545 },
  heads: [
    head("SALES", "Sales", 17681459, 11693032, {
      owners: [
        { company: "OIL", label: "Oil", name: "Raju" },
        { company: "MART", label: "Mart", name: "Prabhjot" },
        { company: "BEVERAGES", label: "Beverages", name: "Shunty" },
      ],
      by_company: [
        { company: "OIL", label: "Oil", base: 1124881, current: 539778 },
        { company: "BEVERAGES", label: "Beverages", base: 7059, current: 0 },
        {
          company: "MART",
          label: "Mart",
          base: 16549519,
          current: 11153254,
          entries: 1,
          tree: [
            {
              name: "ECOM › E-COM",
              base: 16549519,
              current: 11153254,
              entries: 1,
              accounts: [
                {
                  name: "BUSINESS PROMOTION",
                  base: 16549519,
                  current: 11153254,
                  entries: 1,
                  postings: [
                    {
                      date: "2026-10-13",
                      company: "MART",
                      doc_num: 7101,
                      remarks: "RECO ADJUSTMENT",
                      amount: 11153254,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
    head("FACTORY", "Factory", 2234903, 146463, {
      by_company: [
        { company: "OIL", label: "Oil", base: 1310556, current: 0 },
        { company: "BEVERAGES", label: "Beverages", base: 877721, current: 28755 },
        { company: "MART", label: "Mart", base: 46626, current: 117708 },
      ],
    }),
    head("BACKOFFICE", "Back Office", 1263805, 29073),
    head("DELIVERY", "Freight (delivery)", 5000373, 6000000),
    head("INTEREST", "Bank Interest", 4159019, 1987713),
    head("OTHER", "Other", 62, 8),
  ],
  costs: [
    head("SALARY", "Salary", 15034094, 0),
    head("FREIGHT", "Freight", 5000373, 6000000),
    head("FINANCE", "Interest & Finance", 4159019, 1987713),
    head("RENT", "Rent", 1187653, 1484566),
    head("ELECTRICITY", "Electricity", 1632252, 0),
  ],
};

const card = (name: RegExp) => screen.getByRole("button", { name });
const region = (name: string) => screen.getByRole("region", { name });
const linesIn = (name: string) =>
  within(region(name))
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label")?.split(":")[0]);

describe("Payments & Expenses: budget heads", () => {
  it("lays out the banner, three category cards — Sales by company with its owners, Factory by plant, Other Heads (Back Office, freight, interest) — and two charts", async () => {
    vi.spyOn(advancePaymentService, "budgetBoard").mockResolvedValue(BOARD);
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await screen.findByRole("button", { name: /^Sales:/ });

    expect(
      screen
        .getAllByRole("region")
        .map((r) => r.getAttribute("aria-label"))
        .filter((n) => n !== "Budget heads board"),
    ).toEqual(["This month", "Sales", "Factory", "Other Heads", "Where it went", "Top 5 spends"]);
    expect(linesIn("Sales")).toEqual(["Sales", "Sales, Oil", "Sales, Mart", "Sales, Beverages"]);
    // Mart has factory spending too: it gets a line, so the lines add up to the card.
    expect(linesIn("Factory")).toEqual([
      "Factory",
      "Factory, Oil",
      "Factory, Beverages",
      "Factory, Mart",
    ]);
    // Three heads: the card itself opens nothing, its lines do. Other is only ₹62: no line.
    expect(linesIn("Other Heads")).toEqual(["Back Office", "Freight (delivery)", "Bank Interest"]);

    const sales = card(/^Sales:/);
    expect(sales.textContent).toContain("₹1.17 Cr");
    expect(sales.textContent).toContain("Total ₹1.77 Cr");
    // The owner, large and bold beside the company.
    const oil = card(/^Sales, Oil:/);
    expect(oil.querySelector(".bgb-owner")?.textContent).toBe("Raju");
    expect(oil.textContent).toContain("₹11.2 L");
    expect(card(/^Sales, Mart:/).textContent).toContain("Prabhjot");
    expect(card(/^Sales, Beverages:/).textContent).toContain("Shunty");
    expect(card(/^Factory, Beverages:/).textContent).toContain("₹29K");
    // Other Heads' figure is its three heads together.
    expect(region("Other Heads").textContent).toContain("Total ₹1.04 Cr");
    expect(screen.queryByRole("button", { name: /^Other:/ })).toBeNull();
    expect(screen.getByRole("heading", { name: /Payments & Expenses/ }).textContent).toContain(
      "day 14 of 31",
    );
  });

  it("shows the whole month in the banner, and the top 5 spends as a half pie (where it went) and as bars", async () => {
    vi.spyOn(advancePaymentService, "budgetBoard").mockResolvedValue(BOARD);
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await screen.findByRole("button", { name: /^Sales:/ });

    const hero = region("This month");
    expect(hero.textContent).toContain("₹1.99 Cr");
    expect(hero.textContent).toContain("of ₹3.03 Cr");
    expect(hero.textContent).toContain("Budget used65%");
    expect(hero.textContent).toContain("Left₹1.05 Cr");
    expect(hero.textContent).toContain("Month gone45%");
    expect(within(region("Where it went")).getByRole("img").getAttribute("aria-label")).toBe(
      // Largest first.
      "This month's Freight ₹60.0 L, Interest ₹19.9 L, Rent ₹14.8 L, Salary ₹0, Electricity ₹0",
    );
    expect(within(region("Top 5 spends")).getByRole("img").getAttribute("aria-label")).toBe(
      "This month's Freight ₹60.0 L, Interest ₹19.9 L, Rent ₹14.8 L, Salary ₹0, Electricity ₹0",
    );
  });

  it("shows each percentage — amber ahead of pace, red with an arrow past its total", async () => {
    vi.spyOn(advancePaymentService, "budgetBoard").mockResolvedValue(BOARD);
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await screen.findByRole("button", { name: /^Sales:/ });
    const freight = card(/^Freight \(delivery\):/);
    expect(freight.getAttribute("data-state")).toBe("over");
    expect(freight.querySelector(".bgb-pct-pill")?.textContent).toBe("▲ 120%");
    // Sales: 66% of its total with 45% of the month gone.
    expect(region("Sales").getAttribute("data-state")).toBe("ahead");
    expect(
      card(/^Sales:/)
        .querySelector(".bgb-pct-pill")
        ?.getAttribute("data-state"),
    ).toBe("ahead");
    expect(card(/^Sales:/).querySelector(".bgb-pct-pill")?.textContent).toBe("66%");
    expect(card(/^Back Office:/).querySelector(".bgb-pct-pill")?.textContent).toBe("2%");
  });

  it("opens a head's breakdown — company cards, then its budgets, accounts and postings a level at a time — with no chart, and closes it with Escape", async () => {
    vi.spyOn(advancePaymentService, "budgetBoard").mockResolvedValue(BOARD);
    const user = userEvent.setup();
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await user.click(await screen.findByRole("button", { name: /^Bank Interest:/ }));

    const dialog = screen.getByRole("dialog", { name: "Bank Interest" });
    expect(within(dialog).getByRole("heading", { name: "By company" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Where it went" })).toBeTruthy();
    expect(dialog.querySelector(".recharts-wrapper, svg.recharts-surface")).toBeNull();

    // A level at a time: its budgets as cards; a budget, its accounts; an account, its postings.
    await user.click(within(dialog).getByRole("button", { name: /^Bank Interest › MAIN:/ }));
    const account = within(dialog).getByRole("button", { name: /^Bank Interest Expenses:/ });
    expect(account.textContent).toContain("of ₹41.6 L");
    await user.click(account);
    const postings = within(dialog).getByRole("table");
    expect(postings.textContent).toContain("October, Mundka");
    expect(postings.textContent).toContain("₹19,87,713");
    expect(within(dialog).getByRole("navigation", { name: "Where you are" }).textContent).toBe(
      "Budgets›Bank Interest › MAIN›Bank Interest Expenses",
    );
    // …and back up the trail.
    await user.click(within(dialog).getByRole("button", { name: "Budgets" }));
    expect(within(dialog).getByRole("button", { name: /^Bank Interest › MAIN:/ })).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(card(/^Sales, Mart:/));
    // A company's card opens onto that company alone.
    const mart = screen.getByRole("dialog", { name: "Sales · Mart" });
    expect(mart.querySelector(".bgb-owner")?.textContent).toBe("Prabhjot");
    expect(within(mart).queryByRole("heading", { name: "By company" })).toBeNull();
    expect(mart.textContent).toContain("ECOM › E-COM");
    expect(mart.textContent).not.toContain("Sales › MAIN");
    expect(mart.textContent).toContain("Total ₹1.65 Cr");
  });

  it("opens one company of a head from its card, and goes back to all of them", async () => {
    vi.spyOn(advancePaymentService, "budgetBoard").mockResolvedValue(BOARD);
    const user = userEvent.setup();
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await user.click(await screen.findByRole("button", { name: /^Sales:/ }));
    const sales = screen.getByRole("dialog", { name: "Sales" });
    await user.click(within(sales).getByRole("button", { name: /^Mart:.*Open Mart alone/ }));
    const mart = screen.getByRole("dialog", { name: "Sales · Mart" });
    expect(mart.querySelector(".bgb-owner")?.textContent).toBe("Prabhjot");
    expect(mart.textContent).toContain("ECOM › E-COM");
    await user.click(within(mart).getByRole("button", { name: "← All companies" }));
    expect(screen.getByRole("dialog", { name: "Sales" })).toBeTruthy();
  });

  it("reads another month when one is chosen", async () => {
    const load = vi.spyOn(advancePaymentService, "budgetBoard").mockResolvedValue(BOARD);
    const user = userEvent.setup();
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await screen.findByRole("button", { name: /^Sales:/ });
    const month = screen.getByLabelText("Month") as HTMLSelectElement;
    await user.selectOptions(month, month.options[1].value);
    expect(load).toHaveBeenLastCalledWith(month.options[1].value, "");
  });
});

describe("Payments & Expenses: each owner's own board", () => {
  const SALES_OIL = { key: "SALES_OIL", label: "Sales · Oil", owner: "Raju Vg" };
  const sales = BOARD.heads[0];
  const oil = sales.by_company.find((c) => c.company === "OIL")!;
  const RAJU: BudgetBoard = {
    ...BOARD,
    total: { base: oil.base, current: oil.current, ratio: oil.current / oil.base },
    heads: [
      {
        ...sales,
        base: oil.base,
        current: oil.current,
        by_company: [oil],
        owners: [sales.owners[0]],
      },
    ],
    costs: [],
    view: SALES_OIL,
    can_switch: false,
    views: [],
  };

  it("shows an owner their own head, with no switch to the payment requests", async () => {
    vi.spyOn(advancePaymentService, "budgetBoardMe").mockResolvedValue({
      view: SALES_OIL,
      can_switch: false,
    });
    vi.spyOn(advancePaymentService, "budgetBoard").mockResolvedValue(RAJU);
    localStorage.setItem("payments-expenses-board-view", "requests");
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    expect(await screen.findByRole("button", { name: /^Sales:/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Payments & Expenses/ }).textContent).toContain(
      "Sales · Oil · Raju Vg",
    );
    expect(screen.queryByRole("button", { name: "Payment requests" })).toBeNull();
    expect(screen.queryByLabelText("View as")).toBeNull();
    expect(screen.getByRole("region", { name: "This month" }).textContent).toContain("₹5.4 L");
    // Laid out as the whole board: big cards, where it went, the top spends.
    expect(screen.getByRole("region", { name: "Where it went" })).toBeTruthy();
    expect(
      screen
        .getByRole("region", { name: "Top 5 spends" })
        .querySelector("[role=img]")
        ?.getAttribute("aria-label"),
    ).toBe("This month's MAIN ₹1.17 Cr");
    // A big card of one budget lists its accounts, not itself again, and opens
    // straight onto them; an account opens onto its postings.
    const card = screen.getByRole("button", { name: /^Sales:/ });
    expect(card.textContent).toContain("Total ₹1.77 Cr");
    expect(card.closest("section")?.textContent).toContain("Sales Expenses");
    const user = userEvent.setup();
    await user.click(card);
    const dialog = screen.getByRole("dialog", { name: "Sales" });
    expect(within(dialog).getByRole("heading", { name: "Accounts" })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: /^Sales Expenses:/ }));
    expect(within(dialog).getByRole("table").textContent).toContain("October, Mundka");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says when nothing is booked yet this month, rather than drawing empty charts", async () => {
    vi.spyOn(advancePaymentService, "budgetBoardMe").mockResolvedValue({
      view: SALES_OIL,
      can_switch: false,
    });
    const zero = (tree: BudgetHead["tree"]) =>
      tree.map((b) => ({
        ...b,
        current: 0,
        accounts: b.accounts.map((a) => ({ ...a, current: 0, postings: [] })),
      }));
    vi.spyOn(advancePaymentService, "budgetBoard").mockResolvedValue({
      ...RAJU,
      total: { ...RAJU.total, current: 0, ratio: 0 },
      heads: [{ ...RAJU.heads[0], current: 0, ratio: 0, tree: zero(RAJU.heads[0].tree) }],
    });
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    expect(await screen.findByRole("button", { name: /^Sales:/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Where it went" }).textContent).toContain(
      "Nothing booked in Oct 2026 yet",
    );
    expect(screen.getByRole("region", { name: "Top 5 spends" }).textContent).toContain(
      "Nothing booked in Oct 2026 yet",
    );
  });

  it("lets an administrator look at any owner's board as the owner sees it", async () => {
    const load = vi
      .spyOn(advancePaymentService, "budgetBoard")
      .mockImplementation(async (_month, view) =>
        view
          ? { ...RAJU, can_switch: true, views: [SALES_OIL] }
          : { ...BOARD, view: null, can_switch: true, views: [SALES_OIL] },
      );
    const user = userEvent.setup();
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await screen.findByRole("button", { name: /^Sales:/ });
    expect(screen.getByRole("button", { name: "Payment requests" })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("View as"), "SALES_OIL");
    expect(await screen.findByRole("region", { name: "Top 5 spends" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Payments & Expenses/ }).textContent).toContain(
        "Raju Vg",
      ),
    );
    expect(load).toHaveBeenLastCalledWith(expect.any(String), "SALES_OIL");
    // Back to everyone.
    await user.selectOptions(screen.getByLabelText("View as"), "");
    expect(await screen.findByRole("button", { name: /^Sales:/ })).toBeTruthy();
  });
});

describe("Payments & Expenses: payment requests", () => {
  const openRequests = async () => {
    vi.spyOn(advancePaymentService, "budgetBoard").mockResolvedValue(BOARD);
    const loadOms = vi.spyOn(advancePaymentService, "omsDashboard").mockResolvedValue(OMS);
    const user = userEvent.setup();
    renderPage(<Payments_Expenses />, { route: "/Payments_Expenses" });
    await user.click(await screen.findByRole("button", { name: "Payment requests" }));
    await screen.findByRole("tabpanel", { name: "Overview" });
    return { user, loadOms };
  };

  it("switches to the payment requests: its own slides, figures and company filter, and remembers the choice", async () => {
    const { user, loadOms } = await openRequests();
    expect((await screen.findAllByText("₹3.9 L")).length).toBe(2); // the Raised tile and the donut
    expect(within(panel()).getByText("Pending now")).toBeTruthy();
    expect(localStorage.getItem("payments-expenses-board-view")).toBe("requests");

    await user.click(tab("Pipeline"));
    expect(panel().textContent).toContain("AP-2026-0002");
    expect(panel().textContent).toContain("Gurpreet Vg");

    await user.click(tab("Purposes & budgets"));
    expect(screen.getByRole("region", { name: "By payment purpose" }).textContent).toContain(
      "Freight Outward",
    );
    expect(screen.getByRole("region", { name: "By budget head" }).textContent).toContain(
      "Del Bkhp",
    );

    fireEvent.keyDown(window, { key: "5" });
    expect(await screen.findByRole("tabpanel", { name: "Expenses" })).toBeTruthy();
    expect(panel().textContent).toContain("AP-2026-0062");

    await user.selectOptions(screen.getByLabelText("Company"), "MART");
    expect(loadOms).toHaveBeenLastCalledWith(expect.objectContaining({ company: "MART" }));
    await user.click(screen.getByRole("button", { name: "Last month" }));
    expect(loadOms).toHaveBeenLastCalledWith(expect.objectContaining(presetRange("last-month")));

    await user.click(screen.getByRole("button", { name: "Budgets" }));
    expect(await screen.findByRole("button", { name: /^Sales:/ })).toBeTruthy();
  });

  it("moves on by itself after the dwell, and space holds it", async () => {
    localStorage.setItem(DWELL_STORAGE_KEY, "15");
    await openRequests();

    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    // Restart the turn under the fake clock, then let it run out.
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("ROTATING")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(15_500);
    });
    expect(screen.getByRole("tabpanel", { name: "Pipeline" })).toBeTruthy();

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("HELD")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("tabpanel", { name: "Pipeline" })).toBeTruthy();
    expect(localStorage.getItem(PAUSED_STORAGE_KEY)).toBe("true");
  });
});
