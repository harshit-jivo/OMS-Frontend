import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppHeader, initialsOf } from "./AppHeader";

/**
 * The top bar.
 *
 * Two things here have bitten before and are pinned as a result: the pair of
 * exclusive toggles must use the SAME breakpoint the rail's own CSS uses, and
 * the unread count must not be announced twice.
 */

function renderHeader(props: Partial<Parameters<typeof AppHeader>[0]> = {}) {
  const defaults = {
    displayName: "Harman Bala",
    roleLabel: "ADMIN",
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    onToggleMenu: vi.fn(),
    unreadCount: 0,
    onOpenNotifications: vi.fn(),
    onOpenProfile: vi.fn(),
  };
  return render(
    <MemoryRouter>
      <AppHeader {...defaults} {...props} />
    </MemoryRouter>,
  );
}

describe("initialsOf", () => {
  it("takes one letter from each of the first two words", () => {
    expect(initialsOf("Harman Bala")).toBe("HB");
    expect(initialsOf("A K Enterprises")).toBe("AK");
  });

  it("takes two letters from a single name, not one", () => {
    // One character in a 32px circle reads as a bullet point.
    expect(initialsOf("Harman")).toBe("HA");
  });

  it("falls back rather than rendering an empty ring", () => {
    expect(initialsOf("")).toBe("—");
    expect(initialsOf("   ")).toBe("—");
  });
});

describe("AppHeader", () => {
  it("shows the user and their role", () => {
    renderHeader();

    expect(screen.getByText("Harman Bala")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
    expect(screen.getByText("HB")).toBeInTheDocument();
  });

  it("opens the profile dialog from the chip, rather than navigating", async () => {
    // Profile was the /Profile route; it is a dialog the shell owns now, so
    // the chip is a button. Named by its own text, not by `title` — `title`
    // is only a fallback, and an element with text content never reaches it.
    const user = userEvent.setup();
    const onOpenProfile = vi.fn();
    renderHeader({ onOpenProfile });

    expect(screen.queryByRole("link", { name: /Harman Bala/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Harman Bala/ }));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it("names the collapse toggle by what it will do", () => {
    const { unmount } = renderHeader({ collapsed: false });
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    unmount();

    renderHeader({ collapsed: true });
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("gates the two toggles on the SAME query the rail's CSS uses", () => {
    // `max-[1024px]` compiles to `width < 1024px` while `Sidebar.css` says
    // `max-width: 1024px`. At exactly 1024 that mismatch leaves the rail
    // off-canvas and the hamburger hidden — an app with no navigation. The
    // `rail-drawer` variant is declared once in tailwind.css so the two
    // cannot drift; this pins that it is what the header uses.
    renderHeader();

    expect(
      screen.getByRole("button", { name: "Open navigation" }).className,
    ).toContain("rail-drawer:inline-flex");
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }).className,
    ).toContain("rail-drawer:hidden");
  });

  it("toggles the drawer and the collapse independently", async () => {
    const onToggleMenu = vi.fn();
    const onToggleCollapsed = vi.fn();
    const user = userEvent.setup();
    renderHeader({ onToggleMenu, onToggleCollapsed });

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(onToggleMenu).toHaveBeenCalledTimes(1);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("shows the bell to everyone, including an admin", () => {
    // It used to be gated to the four order-workflow roles, so an admin could
    // not open notifications at all. Nothing behind it is role-scoped in the
    // client — `/orders/notifications/` decides what a user may see — so the
    // gate only hid a working feature. There is no longer a prop to hide it.
    renderHeader();

    expect(screen.getByRole("button", { name: /Notifications/i })).toBeInTheDocument();
  });

  it("puts the unread count in the button's name, not beside it", () => {
    // The badge is `aria-hidden`, so a screen reader hears "Notifications, 3
    // unread" once rather than that plus a stray "3".
    renderHeader({ unreadCount: 3 });

    const bell = screen.getByRole("button", { name: "Notifications, 3 unread" });
    expect(bell).toHaveTextContent("3");
    expect(bell.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("caps the badge at 99+", () => {
    renderHeader({ unreadCount: 250 });

    expect(screen.getByRole("button", { name: /Notifications/i })).toHaveTextContent(
      "99+",
    );
  });

  it("draws no badge at zero", () => {
    renderHeader({ unreadCount: 0 });

    const bell = screen.getByRole("button", { name: "Notifications" });
    expect(bell.textContent).toBe("");
  });

  it("opens the notifications dialog", async () => {
    const onOpenNotifications = vi.fn();
    const user = userEvent.setup();
    renderHeader({ onOpenNotifications });

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(onOpenNotifications).toHaveBeenCalledTimes(1);
  });

  it("carries the positioning hook Sidebar.css owns", () => {
    const { container } = renderHeader();

    expect(container.querySelector("[data-slot='app-header']")?.className).toContain(
      "header",
    );
  });
});
