import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./AppSidebar";
import { SIDEBAR_SECTIONS } from "./navigation";

/**
 * Answer `matchMedia` for the hover-to-peek guard.
 *
 * jsdom implements `matchMedia` as "no query ever matches", so without this
 * the rail believes it is on a touch device and never peeks — a test written
 * against the default would pass while asserting nothing.
 */
function setPointer(kind: "fine" | "coarse") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: kind === "fine" && query.includes("hover: hover"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

/**
 * The navigation rail.
 *
 * The behaviour worth guarding is the part that is not visual: a section
 * disappears when the session cannot open ANY of its links, and the collapsed
 * rail keeps its labels reachable rather than hiding them at zero pixels.
 */

function renderRail(props: Partial<Parameters<typeof AppSidebar>[0]> = {}) {
  const defaults = {
    open: false,
    collapsed: false,
    canShow: () => true,
    isLinkActive: () => false,
    onNavigate: vi.fn(),
    onLogout: vi.fn(),
  };
  return render(
    <MemoryRouter>
      <AppSidebar {...defaults} {...props} />
    </MemoryRouter>,
  );
}

describe("AppSidebar", () => {
  it("renders a labelled navigation landmark", () => {
    renderRail();

    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("hides a section whose every link is denied", () => {
    // A mart user ends up with a two-section rail without any role-specific
    // markup — this is the mechanism that does it.
    renderRail({ canShow: (path) => path === "/View_Orders" });

    expect(screen.getByRole("link", { name: "View Orders" })).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.queryByText("Legal")).not.toBeInTheDocument();
    expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
  });

  it("gates a link on `gate` where it differs from `to`", () => {
    // The two SAP reports sit under the Reports grant but are billing-only,
    // so their links follow /Sales_Invoice instead of their own path.
    renderRail({ canShow: (path) => path === "/Sales_Invoice" });

    expect(screen.getByRole("link", { name: "Inventory Report" })).toHaveAttribute(
      "href",
      "/Inventory_Report",
    );
  });

  it("always shows Home, whatever the session can open", () => {
    // The old Dashboard row was hidden from the tracker sub-roles. `/Home`
    // lists whatever the viewer can open — for a tracker clerk, their tracker
    // pages — and it is the redirect target for a denied route, so a rail
    // without it would be a rail with no way back.
    renderRail({ canShow: () => false });

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/Home");
  });

  it("marks the active link as the current page", () => {
    renderRail({ isLinkActive: (to) => to === "/View_Orders" });

    expect(screen.getByRole("link", { name: "View Orders" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("fills the active link with the brand, and nothing else", () => {
    // The rail's one saturated shape. If a second thing takes `bg-brand` the
    // answer to "where am I" stops being unambiguous.
    const { container } = renderRail({ isLinkActive: (to) => to === "/FOC" });

    const filled = container.querySelectorAll(".bg-brand");
    expect(filled).toHaveLength(1);
    expect(filled[0]).toHaveTextContent("FOC");
  });

  it("keeps a collapsed label readable rather than zero-sized", () => {
    // The old rail collapsed with `font-size: 0`, which leaves the label in
    // the accessibility tree at no size at all. `sr-only` is the honest form.
    renderRail({ collapsed: true });

    const link = screen.getByRole("link", { name: "Home" });
    expect(within(link).getByText("Home").className).toContain("sr-only");
  });

  it("gives a collapsed link a tooltip, and an expanded one none", () => {
    const { unmount } = renderRail({ collapsed: true });
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "title",
      "Home",
    );
    unmount();

    renderRail({ collapsed: false });
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("title");
  });

  it("replaces section captions with a rule when collapsed", () => {
    // 72px cannot hold "Administration", but losing the grouping entirely
    // would flatten forty links into one list.
    renderRail({ collapsed: true });

    // "Invoices" and not "Administration": that word used to be a link label
    // too (Tracker > Administration, now "Tracker Admin"), so it survived the
    // collapse legitimately and made a poor assertion. "Invoices" has only
    // ever been a caption.
    expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
  });

  it("carries the positioning hooks Sidebar.css owns", () => {
    // That file still sets where this box is; these three classes are the
    // contract between the two.
    const { container } = renderRail({ open: true, collapsed: true });

    const rail = container.querySelector("[data-slot='app-sidebar']");
    expect(rail?.className).toContain("sidebar");
    expect(rail?.className).toContain("open");
    expect(rail?.className).toContain("collapsed");
  });

  it("gives the logout button the form-control reset", () => {
    // Preflight is not imported, so a bare <button> keeps the UA's outset
    // border and grey face — which on a dark rail is unmissable.
    renderRail();

    const logout = screen.getByRole("button", { name: "Logout" });
    expect(logout.className).toContain("appearance-none");
    expect(logout.className).toContain("border-transparent");
    expect(logout.className).toContain("bg-transparent");
    expect(logout.className).toContain("[font-family:inherit]");
  });

  it("asks before signing out rather than doing it", async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();
    renderRail({ onLogout });

    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("closes the drawer when a link is followed", async () => {
    // On a phone the rail covers the page it just navigated to.
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderRail({ open: true, onNavigate });

    await user.click(screen.getByRole("link", { name: "Home" }));

    expect(onNavigate).toHaveBeenCalled();
  });

  it("draws every icon at a hairline stroke", () => {
    // heroicons ships the width as a presentation attribute, so this has to
    // be a CSS declaration to take effect — `stroke-[1.25]` alone would not.
    const { container } = renderRail();

    const icons = container.querySelectorAll("svg");
    expect(icons.length).toBeGreaterThan(10);
    icons.forEach((icon) => {
      expect(icon.getAttribute("class")).toContain("[stroke-width:1.25]");
    });
  });

  /* ── Hover to peek ─────────────────────────────────────────────────────
   *
   * A collapsed rail is forty unlabelled icons. Hovering it — or tabbing into
   * it — brings the labels back without un-collapsing the page underneath.
   * The width belongs to `Sidebar.css`; what is testable here is the RENDER,
   * which is the half CSS cannot do.
   */
  describe("hover to peek", () => {
    it("brings the labels back while the pointer is inside", async () => {
      setPointer("fine");
      const user = userEvent.setup();
      renderRail({ collapsed: true });

      // Collapsed, the label is `sr-only` — present for a screen reader,
      // invisible to a sighted user.
      const rail = screen.getByRole("complementary");
      expect(screen.getByText("Add Sales")).toHaveClass("sr-only");

      await user.hover(rail);
      expect(screen.getByText("Add Sales")).not.toHaveClass("sr-only");

      await user.unhover(rail);
      expect(screen.getByText("Add Sales")).toHaveClass("sr-only");
    });

    it("brings the section captions back too, not just the links", async () => {
      // Collapsed, a caption is replaced by a hairline. Peeking has to restore
      // the grouping as well or the expanded rail is one flat list of forty.
      setPointer("fine");
      const user = userEvent.setup();
      renderRail({ collapsed: true });

      expect(screen.queryByText("Order Config")).not.toBeInTheDocument();
      await user.hover(screen.getByRole("complementary"));
      expect(screen.getByText("Order Config")).toBeInTheDocument();
    });

    it("expands when focus enters, so a keyboard user is not left with icons", () => {
      setPointer("fine");
      renderRail({ collapsed: true });

      // Wrapped: a bare .focus() dispatches the event but leaves React's
      // resulting state update unflushed, so the assertion would read the
      // render from BEFORE the focus.
      act(() => screen.getByRole("link", { name: "Add Sales" }).focus());
      expect(screen.getByText("Add Sales")).not.toHaveClass("sr-only");
    });

    it("does NOT peek on a touch device", async () => {
      // A touch device synthesises a hover that never ends. Without the guard
      // the first tap would strand forty labels inside a 72px rail.
      setPointer("coarse");
      const user = userEvent.setup();
      renderRail({ collapsed: true });

      await user.hover(screen.getByRole("complementary"));
      expect(screen.getByText("Add Sales")).toHaveClass("sr-only");
    });

    it("does nothing when the rail is already expanded", async () => {
      setPointer("fine");
      const user = userEvent.setup();
      const { container } = renderRail({ collapsed: false });

      await user.hover(screen.getByRole("complementary"));
      // No `peek` class: there is nothing to expand, and the shadow it carries
      // would put a floating edge on a rail that is not floating.
      expect(container.querySelector(".sidebar")).not.toHaveClass("peek");
    });
  });

  it("renders every link in the table when nothing is denied", () => {
    renderRail();

    const total = SIDEBAR_SECTIONS.reduce((n, s) => n + s.links.length, 0);
    // +1 for the dashboard, which sits outside every section.
    expect(screen.getAllByRole("link")).toHaveLength(total + 1);
  });
});
