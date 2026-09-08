import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import View_Orders from "./View_Orders";
import { renderPage } from "../test/renderPage";

/**
 * View Orders — the first page converted to the Tailwind primitives.
 *
 * This is the pilot for the whole migration, so what is pinned here is the
 * PATTERN as much as the page:
 *
 *  * the page title is a real `h1` (`PageHeader`), not a styled div;
 *  * every filter control has an accessible name, which the hand-rolled
 *    toolbar it replaces did not — it leaned on the first option ("All
 *    Statuses") to say what each select was;
 *  * the create actions are gated on the SAME rule as the `/Add_Sales` route,
 *    so a view-only user sees the list without them. That is the one thing in
 *    the conversion that could leak authority, and it is the reason the page
 *    calls `canOpen` rather than restating the permission key.
 *
 * The test network adapter answers every request with `[]` (see
 * `src/test/setup.ts`), so the page renders its empty state — which is the
 * state the KPI row and filter bar have to survive anyway.
 */

describe("View Orders", () => {
  it("renders the page title as a heading", () => {
    renderPage(<View_Orders />, { route: "/View_Orders" });

    expect(
      screen.getByRole("heading", { level: 1, name: "View Orders" }),
    ).toBeInTheDocument();
  });

  it("gives every filter control an accessible name", () => {
    // The toolbar this replaces had none: with a value selected, a screen
    // reader announced a combo box called nothing containing "Billed".
    renderPage(<View_Orders />, { route: "/View_Orders" });

    const filters = screen.getByRole("search");
    expect(within(filters).getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(within(filters).getByRole("combobox", { name: "Party" })).toBeInTheDocument();
    expect(within(filters).getByRole("combobox", { name: "Item" })).toBeInTheDocument();
    expect(within(filters).getByLabelText("From")).toBeInTheDocument();
    expect(within(filters).getByLabelText("To")).toBeInTheDocument();
  });

  it("shows the KPI row", () => {
    renderPage(<View_Orders />, { route: "/View_Orders" });

    expect(screen.getByText("Total orders")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("offers the create actions to a user who may create orders", () => {
    // The default test session is an admin.
    renderPage(<View_Orders />, { route: "/View_Orders" });

    expect(screen.getByRole("button", { name: /New order/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New FOC order/i })).toBeInTheDocument();
  });

  it("hides the create actions from a view-only user", () => {
    // Holds orders.sales.view but NOT orders.sales.create, and is not
    // billing/manager — exactly what the /Add_Sales route gate refuses.
    renderPage(<View_Orders />, {
      route: "/View_Orders",
      session: {
        role: "auditor",
        roles: ["auditor"],
        grants: ["orders.sales.view"],
        isSuperuser: false,
        isStaff: false,
      },
    });

    expect(screen.getByRole("heading", { level: 1, name: "View Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New order/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New FOC order/i })).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no orders", async () => {
    // The list arrives through react-query, so the first paint is the
    // skeleton — `findBy` waits for the resolved state rather than asserting
    // against a loading frame.
    renderPage(<View_Orders />, { route: "/View_Orders" });

    expect(await screen.findByText("No orders found")).toBeInTheDocument();
  });

  it("no longer depends on the stylesheets it stopped importing", () => {
    // The conversion's actual contract: page CSS is unlayered and beats
    // Tailwind utilities, so a converted page keeping its import would have
    // its new styles silently overridden. The files stay on disk; this page
    // must not reference their classes.
    const { container } = renderPage(<View_Orders />, { route: "/View_Orders" });

    const legacy = Array.from(container.querySelectorAll("[class]")).filter((el) =>
      /\b(vo-|ao-)[a-z-]+/.test(el.className.toString()),
    );
    expect(legacy.map((el) => el.className.toString())).toEqual([]);
  });
});
