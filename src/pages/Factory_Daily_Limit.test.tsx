import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { advancePaymentService, type FactoryLimit } from "../services/advancePaymentService";
import { renderPage } from "../test/renderPage";
import { FactoryLimitStrip } from "./advancePayments/FactoryLimit";
import { factoryLimitError } from "./advancePayments/factoryLimitData";
import { countsAgainstFactoryLimit } from "./advancePayments/rules";
import Factory_Daily_Limit from "./Factory_Daily_Limit";

const LIMIT: FactoryLimit = {
  company: "OIL",
  day: "2026-10-16",
  limit: {
    amount: "500000.00",
    day: "2026-10-15",
    carried: true,
    set_by: "ZIYAUL HAQUE",
    set_on: "2026-10-15T10:00:00+05:30",
  },
  used: "320000.00",
  left: "180000.00",
  requests: [
    {
      id: 7,
      request_no: "AP-2026-0140",
      partner_name: "SHREE PACKAGING",
      amount: "320000.00",
      budget_code: "BackOff",
      purpose_label: "Packaging Material Purchase",
      status: "IN_APPROVAL",
      raised_by: "Preshit",
      raised_on: "2026-10-16T11:00:00+05:30",
    },
  ],
  history: [{ day: "2026-10-15", limit: "500000.00", used: "560000.00" }],
  changes: [
    {
      day: "2026-10-15",
      old: null,
      new: "500000.00",
      by: "ZIYAUL HAQUE",
      on: "2026-10-15T10:00:00+05:30",
    },
  ],
  enabled: true,
  can_set: false,
  setter: "ziyaul",
  open_bills: { bills: 864, open: "97147809.89", packing: "50204753.05" },
};

describe("Factory daily limit: what counts", () => {
  it("is Factory / FACT_COM, or a factory purpose anywhere — never oil, never Mart", () => {
    expect(countsAgainstFactoryLimit("OIL", "Factory", "CONSUMABLES")).toBe(true);
    expect(countsAgainstFactoryLimit("BEVERAGES", "FACT_COM", "REPAIRS")).toBe(true);
    expect(countsAgainstFactoryLimit("OIL", "BackOff", "PACKING_MATERIAL")).toBe(true);
    expect(countsAgainstFactoryLimit("OIL", "Factory", "OIL_PURCHASE")).toBe(false);
    expect(countsAgainstFactoryLimit("MART", "Factory", "PACKING_MATERIAL")).toBe(false);
    expect(countsAgainstFactoryLimit("OIL", "Sales", "ADVERTISING")).toBe(false);
  });

  it("refuses an amount past what is left, saying by how much", () => {
    expect(factoryLimitError(LIMIT, 180000)).toBeNull();
    expect(factoryLimitError(LIMIT, 200000)).toBe(
      "This request (₹2,00,000) is ₹20,000 over today's Factory limit for Oil: ₹5,00,000, ₹3,20,000 already raised, ₹1,80,000 left.",
    );
    expect(factoryLimitError({ ...LIMIT, limit: null, left: null }, 9e9)).toBeNull();
  });

  it("holds nothing back while the server has it switched off", () => {
    expect(factoryLimitError({ ...LIMIT, enabled: false }, 9e9)).toBeNull();
  });

  it("shows the strip on the form, red when the request goes over", () => {
    const query = { data: LIMIT, isError: false, error: null } as never;
    const { rerender } = render(<FactoryLimitStrip counts query={query} amount={100000} />);
    expect(screen.getByTestId("factory-limit").textContent).toContain("left ₹1,80,000");
    expect(screen.queryByText(/over today's Factory limit/)).toBeNull();
    rerender(<FactoryLimitStrip counts query={query} amount={200000} />);
    expect(screen.getByText(/₹20,000 over today's Factory limit/)).toBeTruthy();
    rerender(<FactoryLimitStrip counts={false} query={query} amount={200000} />);
    expect(screen.queryByTestId("factory-limit")).toBeNull();
  });
});

describe("Factory Daily Limit page", () => {
  it("shows the limit, today's requests, the past days and SAP's open bills — read only for others", async () => {
    vi.spyOn(advancePaymentService, "factoryLimit").mockResolvedValue(LIMIT);
    renderPage(<Factory_Daily_Limit />, { route: "/Factory_Daily_Limit" });
    const tile = (label: string) =>
      screen.getByText(label).closest("[data-tone]")?.textContent ?? "";
    await screen.findByText("Today's limit");
    expect(tile("Today's limit")).toContain("₹5,00,000");
    expect(tile("Today's limit")).toContain("Carried from 15 Oct 2026");
    expect(tile("Left today")).toContain("₹1,80,000");
    expect(screen.getByText("AP-2026-0140")).toBeTruthy();
    expect(screen.getByText("₹60,000 over")).toBeTruthy();
    expect(screen.getByText(/864 bills/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save limit" })).toBeNull();
  });

  it("lets Ziyaul set it", async () => {
    vi.spyOn(advancePaymentService, "factoryLimit").mockResolvedValue({ ...LIMIT, can_set: true });
    const save = vi.spyOn(advancePaymentService, "setFactoryLimit").mockResolvedValue({
      ...LIMIT,
      can_set: true,
      limit: { ...LIMIT.limit!, amount: "600000.00", carried: false },
    });
    const user = userEvent.setup();
    renderPage(<Factory_Daily_Limit />, { route: "/Factory_Daily_Limit" });
    const box = (await screen.findByRole("heading", { name: "Set the limit" })).closest(
      "section",
    ) as HTMLElement;
    await user.type(within(box).getByLabelText(/Limit/), "600000");
    await user.click(within(box).getByRole("button", { name: "Save limit" }));
    expect(save).toHaveBeenCalledWith("OIL", "600000", undefined);
    expect(await screen.findByText(/Saved: ₹6,00,000/)).toBeTruthy();
  });
});

describe("Factory daily limit: whose it is, and the due bills behind it", () => {
  it("says on the request form whose limit it is and what it covers, and when it is not applied", () => {
    const query = { data: { ...LIMIT, enabled: false }, isError: false, error: null } as never;
    render(<FactoryLimitStrip counts query={query} amount={900000} />);
    const strip = screen.getByText(/Set by Ziyaul for Oil/).closest("[role]") ?? document.body;
    expect(strip.textContent).toContain("Factory requests");
    expect(strip.textContent).toContain("Oil purchases are not counted");
    expect(strip.textContent).toContain("Not applied yet");
    // Not applied: nothing held back, however large.
    expect(screen.queryByText(/over today's Factory limit/)).toBeNull();
  });

  it("shows the due bills by vendor when their figure is clicked", async () => {
    vi.spyOn(advancePaymentService, "factoryLimit").mockResolvedValue(LIMIT);
    const bills = vi.spyOn(advancePaymentService, "factoryDueBills").mockResolvedValue({
      bills: 2,
      open: "160000",
      packing: "70000",
      vendors: [
        {
          card_code: "VENDA000101",
          card_name: "NATIONAL TIN INDUSTRIES",
          amount: "160000",
          bills: [
            {
              doc_entry: 1,
              doc_num: 626001,
              party_ref: "NTI/77",
              doc_date: "2026-09-01",
              due_date: "2026-10-01",
              days_overdue: 15,
              doc_total: "180000",
              open: "160000",
            },
          ],
        },
      ],
    });
    const user = userEvent.setup();
    renderPage(<Factory_Daily_Limit />, { route: "/Factory_Daily_Limit" });
    const figure = await screen.findByRole("button", { name: /Due SAP bills/ });
    expect(bills).not.toHaveBeenCalled();
    await user.click(figure);
    expect(await screen.findByText("NATIONAL TIN INDUSTRIES")).toBeTruthy();
    await user.click(screen.getByText("NATIONAL TIN INDUSTRIES"));
    expect(screen.getByText("626001")).toBeTruthy();
    expect(screen.getByText("15 days overdue")).toBeTruthy();
    expect(bills).toHaveBeenCalledWith("OIL");
  });
});
