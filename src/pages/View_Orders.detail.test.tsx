import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import View_Orders from "./View_Orders";
import { renderPage } from "../test/renderPage";
import { ordersService } from "../services/ordersService";

/**
 * The View Orders DETAIL view, after the merge.
 *
 * Three things changed, and each is a duplication removed:
 *
 *  * TWO headers became one. A `PageHeader` carrying the order number and
 *    party name sat directly above a `PartyHeader` carrying the same order
 *    number and the same party name again.
 *  * The totals footer became the KPI row the list page already uses, above
 *    the line items rather than below — "what is this worth" is read before
 *    "what is in it".
 *  * `ItemSection` rendered every line a SECOND time above the table, as
 *    collapsible Premium / Commodity / Others accordions of cards. The table
 *    is the item list now, and the variety it grouped by is a column in it.
 *
 * `PartyHeader` and `ItemSection` are both untouched — five other order
 * screens still render them — so this file guards that View_Orders no longer
 * mounts either.
 */

// `vi.hoisted`, because `vi.mock` factories are hoisted above every `const` in
// the file: a factory closing over a plain `const ORDER` reads it before it is
// initialised, and the suite hangs at collection rather than failing.
const { ORDER, ORDERS, STATUSES, PARTIES } = vi.hoisted(() => {
  const order = {
    id: 1,
    order_number: "ORD-20260905-0001",
    card_code: "CUSTA000606",
    card_name: "A K ENTERPRISES",
    status_display: "Rate Approval",
    delivery_date: "2026-09-07",
    created_at: "2026-09-05T12:19:00Z",
    is_foc: false,
    quotation_cancelled: false,
    items_count: 2,
    vareity_cost: { commodity_price: 120, other_total: 0, premium_total: 30 },
    items: [
      {
        item_code: "ITM-1",
        item_name: "Mustard Oil 1L",
        category: "Edible Oil",
        variety_type: "COMMODITY",
        qty: 10,
        pcs: 10,
        boxes: 1,
        ltrs: 10,
        total: 1000,
        tax_rate: 5,
        price_list_basic: 100,
        basic_price: 100,
      },
      {
        item_code: "ITM-2",
        item_name: "Canola Oil 1L",
        category: "Edible Oil",
        variety_type: "PREMIUM",
        qty: 5,
        pcs: 5,
        boxes: 1,
        ltrs: 5,
        total: 500,
        tax_rate: 5,
        price_list_basic: 100,
        basic_price: 100,
      },
    ],
  };
  // STABLE references. `View_Orders` has an effect keyed on `orders`, so a
  // hook returning a fresh `[order]` literal on every render re-runs it,
  // setState re-renders, and the suite spins forever without printing a
  // single result. react-query hands back a stable array; the mock must too.
  return {
    ORDER: order,
    ORDERS: [order],
    STATUSES: [{ id: 2, name: "Rate Approval" }],
    PARTIES: [{ cardCode: "CUSTA000606", cardName: "A K ENTERPRISES" }],
  };
});

// The list needs a row to open. These hooks wrap react-query, whose queryFn
// would otherwise hit the stubbed adapter in `src/test/setup.ts` and return [].
vi.mock("../lib/orderQueries", () => ({
  useCurrentUserOrders: () => ({ orders: ORDERS, isOrdersLoading: false }),
  useOrderStatuses: () => STATUSES,
  useAssignedParties: () => PARTIES,
}));

beforeEach(() => {
  vi.spyOn(ordersService, "getOrderDetails").mockResolvedValue(ORDER as never);
  vi.spyOn(ordersService, "getOrderLogs").mockResolvedValue([] as never);
  vi.spyOn(ordersService, "getPartyProduct").mockResolvedValue([] as never);
});

afterEach(() => vi.restoreAllMocks());

/** Open the detail view for the single order in the list. */
async function openDetail() {
  const user = userEvent.setup();
  const result = renderPage(<View_Orders />, { route: "/View_Orders" });
  await user.click(
    await screen.findByRole("button", { name: /View order ORD-20260905-0001/i }),
  );
  await screen.findByRole("heading", { level: 1, name: "ORD-20260905-0001" });
  return { user, ...result };
}

describe("View Orders — detail", () => {
  it("shows one header, titled by the order number", async () => {
    await openDetail();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("does not repeat the party name as a second heading", async () => {
    await openDetail();

    const partyHeadings = screen
      .getAllByRole("heading")
      .filter((h) => h.textContent?.trim() === "A K ENTERPRISES");
    expect(partyHeadings).toEqual([]);
  });

  it("mounts neither PartyHeader nor the ItemSection accordion", async () => {
    // Both are still the right components for the five order screens that use
    // them; this page must not, or the duplication comes back.
    const { container } = await openDetail();

    expect(container.querySelector(".ph-card")).toBeNull();
    expect(container.querySelector(".isec-root")).toBeNull();
  });

  it("puts the status beside the title", async () => {
    await openDetail();

    expect(screen.getByText("Rate Approval")).toBeInTheDocument();
  });

  it("shows the totals as KPI cards, computed from the line items", async () => {
    await openDetail();

    // 1000 + 500 subtotal, 5% tax = 75, grand 1575, 15 litres.
    expect(screen.getByText("Grand Total")).toBeInTheDocument();
    expect(screen.getByText("1500.00")).toBeInTheDocument();
    expect(screen.getByText("75.00")).toBeInTheDocument();
    expect(screen.getByText("1575.00")).toBeInTheDocument();
    expect(screen.getByText("15.00")).toBeInTheDocument();
  });

  it("has no totals block below the line items", async () => {
    // The totals are the KPI row at the top; repeating them under the table is
    // the footer this replaced.
    const { container } = await openDetail();

    expect(container.querySelectorAll("[data-slot='detail-section']")).toHaveLength(0);
    expect(screen.getAllByText("Grand Total")).toHaveLength(1);
  });

  it("shows one variety-cost card per variety, badged", async () => {
    const { container } = await openDetail();

    // Commodity 120 and Premium 30 are set; Other is 0 and must not appear.
    expect(screen.getByText("120.00")).toBeInTheDocument();
    expect(screen.getByText("30.00")).toBeInTheDocument();
    expect(screen.queryByText("Other")).not.toBeInTheDocument();

    // The variety is a Badge — the same treatment a status gets, because
    // PREMIUM / COMMODITY is SAP's own category split.
    const badges = Array.from(container.querySelectorAll("[data-slot='badge']"));
    const labels = badges.map((b) => b.textContent?.trim());
    expect(labels).toContain("Commodity");
    expect(labels).toContain("Premium");
  });

  it("carries the variety as a column on the items table", async () => {
    await openDetail();

    expect(screen.getByRole("columnheader", { name: "Variety" })).toBeInTheDocument();
    // SAP sends COMMODITY / PREMIUM uppercase; the column title-cases them.
    expect(screen.queryByText("COMMODITY")).not.toBeInTheDocument();
  });

  it("still lists the line items", async () => {
    await openDetail();

    expect(screen.getByText("Mustard Oil 1L")).toBeInTheDocument();
    expect(screen.getByText("Canola Oil 1L")).toBeInTheDocument();
  });

  it("offers no separate Back button — the trail is the way back", async () => {
    // Two controls with one destination is one too many, and the breadcrumb
    // is the one people already look for.
    await openDetail();

    expect(
      screen.queryByRole("button", { name: /Back to orders/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the record's trail above the header", async () => {
    await openDetail();

    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(trail).toHaveTextContent("Orders");
    expect(trail).toHaveTextContent("View Orders");
    expect(trail).toHaveTextContent("ORD-20260905-0001");
  });

  it("goes back to the list through the breadcrumb", async () => {
    const { user } = await openDetail();

    await user.click(screen.getByRole("button", { name: "View Orders" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "View Orders" }),
      ).toBeInTheDocument(),
    );
  });
});
