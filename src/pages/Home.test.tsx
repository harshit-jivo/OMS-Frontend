/**
 * Home — the launcher shows exactly what the router would let you open.
 *
 * The whole value of this page is that its tile list and the route guard
 * cannot disagree, because they are the same call. So what is worth testing is
 * not "does it render a grid" but the three ways that could stop being true:
 * a tile for a page the user would be bounced off, a missing tile for one they
 * hold, and the empty case reading as a failure instead of a state.
 */
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Home from "./Home";
import { renderPage } from "../test/renderPage";

/**
 * A NON-admin session. `TEST_SESSION` is a superuser, and `isAdmin` reads
 * `is_superuser`/`is_staff` as well as the role — so a test that only
 * overrode `role` would grant everything and quietly assert nothing.
 */
function asRole(role: string, grants: string[] = []) {
  return {
    role,
    roles: [role],
    roleDisplay: role.toUpperCase(),
    grants,
    isSuperuser: false,
    isStaff: false,
  };
}

function panel() {
  return screen.getByRole("tabpanel");
}

describe("Home", () => {
  it("shows a tile for every module an admin can open", async () => {
    renderPage(<Home />, { route: "/Home" });

    expect(await screen.findByRole("link", { name: "Add Sales" })).toHaveAttribute(
      "href",
      "/Add_Sales",
    );
    expect(screen.getByRole("link", { name: "Sales Dashboard" })).toHaveAttribute(
      "href",
      "/Sales_Dashboard",
    );
    expect(screen.getByRole("tab", { name: /Administration/ })).toBeInTheDocument();
  });

  it("shows a legal reviewer their module and nothing else", async () => {
    renderPage(<Home />, { route: "/Home", session: asRole("legal") });

    expect(await screen.findByRole("link", { name: "Label Checker" })).toBeInTheDocument();

    // The failure this guards against is a tile that navigates straight into a
    // redirect, which looks like a broken link rather than a missing grant.
    expect(screen.queryByRole("link", { name: "Add Sales" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sales Dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Administration/ })).not.toBeInTheDocument();
  });

  it("gives the Sales Dashboard tile only to a holder of its key", async () => {
    // The page's own reason for existing: the dashboard used to be visible to
    // everyone because it doubled as the landing page.
    renderPage(<Home />, { route: "/Home", session: asRole("billing") });
    expect(await screen.findByRole("link", { name: "View Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sales Dashboard" })).not.toBeInTheDocument();

    screen.getByRole("tab", { name: /All/ }); // the page did render
  });

  it("narrows the panel to the chosen module", async () => {
    const user = userEvent.setup();
    renderPage(<Home />, { route: "/Home" });

    await user.click(await screen.findByRole("tab", { name: "Invoices" }));

    expect(within(panel()).getByRole("link", { name: "Sales Invoice" })).toBeInTheDocument();
    expect(within(panel()).queryByRole("link", { name: "Add Sales" })).not.toBeInTheDocument();
  });

  it("tells a user with no grants what to do, without reading as an error", async () => {
    // A role that matches nothing in the access table. Rendering an error here
    // would send someone to IT over a working account.
    renderPage(<Home />, { route: "/Home", session: asRole("nobody") });

    expect(await screen.findByText("Nothing assigned yet")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
