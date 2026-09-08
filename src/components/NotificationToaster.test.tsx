/**
 * The toaster renders every toast in the app, and it was silent.
 *
 * `role="status"` announces a CHANGE to a live region that is already in the
 * accessibility tree. The old component returned `null` when the stack was
 * empty and put the live region on each card — so the region and its content
 * arrived together, every time, and nothing was ever announced.
 *
 * That is the whole point of these tests: the visible behaviour was fine, so
 * only an assertion about the region's presence WHILE EMPTY can catch it.
 */
import { act } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import NotificationToaster from "./NotificationToaster";
import { __resetToasts, showToast } from "@/lib/toastStore";

afterEach(() => {
  // The store is module-level state, so it outlives a render. Without this the
  // second test's toasts are still in it when the third mounts, and a query by
  // accessible name finds two of everything.
  act(() => __resetToasts());
});

describe("NotificationToaster", () => {
  it("keeps the live region mounted while empty, so the next toast is announced", () => {
    render(<NotificationToaster />);

    const region = screen.getByRole("status");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "polite");
    // Empty — but present. Returning null here is the bug.
    expect(region.querySelectorAll("[data-slot='toast']")).toHaveLength(0);
  });

  it("announces from the container, not from one region per card", () => {
    render(<NotificationToaster />);
    act(() => {
      showToast({ title: "Saved", message: "Two rows updated." });
      showToast({ title: "Synced", message: "Products are up to date." });
    });

    // Two cards, still exactly ONE live region.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(document.querySelectorAll("[data-slot='toast']")).toHaveLength(2);
    expect(screen.getByText("Two rows updated.")).toBeInTheDocument();
  });

  it("dismisses one toast by name, leaving the others", async () => {
    const user = userEvent.setup();
    render(<NotificationToaster />);
    act(() => {
      showToast({ title: "Saved", message: "a" });
      showToast({ title: "Synced", message: "b" });
    });

    // Named per toast — "Dismiss" alone is ambiguous with a stack of them.
    await user.click(screen.getByRole("button", { name: "Dismiss: Saved" }));
    expect(screen.queryByText("a")).not.toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  it("runs the action and then dismisses", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<NotificationToaster />);
    act(() => {
      showToast({
        title: "Order approved",
        message: "SO-4410 moved on.",
        orderNumber: "4410",
        onAction,
        actionLabel: "View order",
      });
    });

    expect(screen.getByText("Order #4410")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View order" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByText("SO-4410 moved on.")).not.toBeInTheDocument();
  });
});
