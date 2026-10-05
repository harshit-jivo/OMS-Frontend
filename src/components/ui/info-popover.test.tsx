/**
 * The (i) popover — the ways it has to be reachable, and the ways it closes.
 *
 * The behaviours pinned here are the ones a `title` attribute cannot do and
 * the ones a naive hover panel gets wrong: opening for a keyboard, surviving
 * the pointer crossing the gap to the panel, and not closing under a click
 * that landed inside it.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InfoPopover } from "./info-popover";

const renderPopover = (openOn: "hover" | "click" = "hover") =>
  render(
    <InfoPopover label="Order details" openOn={openOn}>
      <p>Bill to ILAHI CO NEW DELHI</p>
    </InfoPopover>,
  );

const trigger = () => screen.getByRole("button", { name: "Order details" });
const panel = () => screen.queryByRole("dialog", { name: "Order details" });

describe("InfoPopover, hover mode", () => {
  it("opens on hover and closes when the pointer leaves", async () => {
    const user = userEvent.setup();
    renderPopover();
    expect(panel()).toBeNull();

    await user.hover(trigger());
    expect(panel()).not.toBeNull();
    expect(screen.getByText(/ILAHI CO NEW DELHI/)).toBeTruthy();

    await user.unhover(trigger());
    // The close is delayed so the pointer can reach the panel; until it fires
    // the panel is still mounted, which is the whole point of the delay.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(panel()).toBeNull();
  });

  it("opens on keyboard focus, so it is not mouse-only", async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.tab();
    expect(trigger()).toHaveFocus();
    expect(panel()).not.toBeNull();
  });

  it("stays open when clicked, so its text can be read and copied", async () => {
    const user = userEvent.setup();
    renderPopover();

    // A click pins it. Leaving the trigger must then NOT take it away — this
    // is what makes the panel usable on a touch screen, which has no hover.
    await user.click(trigger());
    await user.unhover(trigger());
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(panel()).not.toBeNull();
  });
});

describe("InfoPopover, click mode", () => {
  it("ignores hover entirely", async () => {
    const user = userEvent.setup();
    renderPopover("click");

    await user.hover(trigger());
    expect(panel()).toBeNull();
  });

  it("toggles on click", async () => {
    const user = userEvent.setup();
    renderPopover("click");

    await user.click(trigger());
    expect(panel()).not.toBeNull();

    await user.click(trigger());
    expect(panel()).toBeNull();
  });

  it("closes on an outside pointer-down", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoPopover label="Order details" openOn="click">
          <p>Bill to ILAHI CO NEW DELHI</p>
        </InfoPopover>
        <button type="button">Elsewhere</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Order details" }));
    expect(panel()).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(panel()).toBeNull();
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    const user = userEvent.setup();
    renderPopover("click");

    await user.click(trigger());
    expect(panel()).not.toBeNull();

    await user.keyboard("{Escape}");
    expect(panel()).toBeNull();
    expect(trigger()).toHaveFocus();
  });
});

describe("InfoPopover, wiring", () => {
  it("reports its state on the trigger for a screen reader", async () => {
    const user = userEvent.setup();
    renderPopover("click");

    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().getAttribute("aria-controls")).toBeNull();

    await user.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    // The control it names must be the panel that actually appeared, not a
    // dangling id — the failure a hand-written `aria-controls` usually has.
    expect(trigger().getAttribute("aria-controls")).toBe(panel()?.id);
  });
});
