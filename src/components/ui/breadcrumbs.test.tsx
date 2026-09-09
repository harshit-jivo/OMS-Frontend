import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Breadcrumbs } from "./breadcrumbs";

/**
 * Breadcrumbs.
 *
 * The one behaviour worth guarding is that the LAST crumb is not a link. A
 * trail whose final item navigates to the page you are already on is the most
 * common breadcrumb bug, and it teaches people the trail is decorative.
 */

const renderTrail = (items: Parameters<typeof Breadcrumbs>[0]["items"]) =>
  render(
    <MemoryRouter>
      <Breadcrumbs items={items} />
    </MemoryRouter>,
  );

describe("Breadcrumbs", () => {
  it("renders a labelled navigation landmark", () => {
    renderTrail([{ label: "Orders", to: "/" }, { label: "View Orders" }]);

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });

  it("marks the last crumb as the current page, and does not link it", () => {
    renderTrail([{ label: "Orders", to: "/" }, { label: "View Orders" }]);

    const current = screen.getByText("View Orders");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.tagName).not.toBe("A");
    expect(screen.queryByRole("link", { name: "View Orders" })).not.toBeInTheDocument();
  });

  it("ignores `to` on the last crumb rather than linking to the current page", () => {
    renderTrail([{ label: "Orders", to: "/" }, { label: "Here", to: "/here" }]);

    expect(screen.queryByRole("link", { name: "Here" })).not.toBeInTheDocument();
  });

  it("links an earlier crumb that has a route", () => {
    renderTrail([{ label: "Orders", to: "/orders" }, { label: "Detail" }]);

    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      "/orders",
    );
  });

  it("gives the in-page crumb the form-control reset", () => {
    // Preflight is not imported, so a bare <button> keeps the UA's
    // `border: 2px outset` and grey `buttonface` — which is how this shipped,
    // looking like a pressed 1997 toolbar button beside the other crumbs.
    // Going through ui/button's `link` variant is what prevents a recurrence.
    const onClick = vi.fn();
    renderTrail([{ label: "List", onClick }, { label: "Record" }]);

    const crumb = screen.getByRole("button", { name: "List" });
    expect(crumb.className).toContain("appearance-none");
    expect(crumb.className).toContain("border-transparent");
    expect(crumb.className).toContain("bg-transparent");
  });

  it("keeps the in-page crumb the same size as the crumbs beside it", () => {
    // The default button size is a 40px control; a crumb must sit inline.
    const onClick = vi.fn();
    renderTrail([{ label: "List", onClick }, { label: "Record" }]);

    expect(screen.getByRole("button", { name: "List" }).className).toContain("h-auto");
  });

  it("renders an in-page crumb as a button, for a view that is state", () => {
    // View Orders' detail panel is state on the same route, so its trail has
    // to close the panel rather than navigate.
    const onClick = vi.fn();
    renderTrail([{ label: "List", onClick }, { label: "Record" }]);

    expect(screen.getByRole("button", { name: "List" })).toBeInTheDocument();
  });

  it("calls the in-page crumb's handler", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderTrail([{ label: "List", onClick }, { label: "Record" }]);

    await user.click(screen.getByRole("button", { name: "List" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a plain crumb with neither route nor handler", () => {
    renderTrail([{ label: "Orders" }, { label: "View Orders" }]);

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides the separators from assistive tech", () => {
    // The list structure already conveys the nesting; reading "slash" between
    // every item is noise.
    const { container } = renderTrail([
      { label: "A", to: "/a" },
      { label: "B", to: "/b" },
      { label: "C" },
    ]);

    const separators = container.querySelectorAll('[aria-hidden="true"]');
    expect(separators).toHaveLength(2);
  });

  it("renders nothing for an empty trail", () => {
    const { container } = renderTrail([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the crumbs in order", () => {
    renderTrail([
      { label: "Orders", to: "/orders" },
      { label: "View Orders", to: "/view" },
      { label: "ORD-1" },
    ]);

    const items = within(screen.getByRole("navigation")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent?.replace("/", "").trim())).toEqual([
      "Orders",
      "View Orders",
      "ORD-1",
    ]);
  });
});
