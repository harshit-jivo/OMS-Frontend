import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

/**
 * The button primitive.
 *
 * Two of these guard things that are invisible until they bite:
 *
 *  * `type` defaults to "button". The BROWSER default is "submit", so a button
 *    placed inside a <form> without this submits it — a bug that appears only
 *    once someone wraps the markup in a form, long after the button was
 *    written.
 *  * The base classes carry a reset. Preflight is not imported in this app
 *    (`styles/tailwind.css` says why), so a <button> keeps the UA's background,
 *    border and font unless the component removes them.
 */

describe("Button", () => {
  it("defaults to type=button, not submit", () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("still allows an explicit submit", () => {
    render(<Button type="submit">Send</Button>);

    expect(screen.getByRole("button", { name: "Send" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("carries the form-control reset, because preflight is not imported", () => {
    render(<Button>Reset me</Button>);

    const className = screen.getByRole("button", { name: "Reset me" }).className;
    expect(className).toContain("appearance-none");
    // font-family is not inherited by form controls — without this the button
    // renders in the UA font beside Inter text.
    //
    // Spelled `[font-family:inherit]` on purpose. `font-[inherit]` is
    // ambiguous, so tailwind-merge treats it as conflicting with
    // `font-medium` and strips it — which is exactly what this test caught.
    expect(className).toContain("[font-family:inherit]");
  });

  it("defaults to the secondary variant", () => {
    render(<Button>Default</Button>);

    expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("marks the variant on the element, so a page can assert its own intent", () => {
    render(<Button variant="primary">Create order</Button>);

    const button = screen.getByRole("button", { name: "Create order" });
    expect(button).toHaveAttribute("data-variant", "primary");
    expect(button.className).toContain("bg-brand");
  });

  it("uses a soft fill for destructive actions, not solid red", () => {
    // A delete button that shouts is one people click to make it stop.
    render(<Button variant="danger">Delete</Button>);

    expect(screen.getByRole("button", { name: "Delete" }).className).toContain(
      "bg-danger-soft",
    );
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Blocked
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Blocked" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires when it is not", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Go</Button>);

    await user.click(screen.getByRole("button", { name: "Go" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("offers a link variant that still carries the reset", () => {
    // The variant exists so that "a button that reads as a link" stops being
    // hand-rolled — a bare <button> keeps the UA's outset border, because
    // preflight is not imported.
    render(
      <Button variant="link" size="inline">
        Crumb
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Crumb" });
    expect(button.className).toContain("appearance-none");
    expect(button.className).toContain("h-auto");
    expect(button).toHaveAttribute("data-variant", "link");
  });

  it("keeps caller classes alongside its own", () => {
    render(<Button className="ml-auto">Right</Button>);

    const className = screen.getByRole("button", { name: "Right" }).className;
    expect(className).toContain("ml-auto");
    expect(className).toContain("inline-flex");
  });

  it("matches the app's field height so it sits flush with an input", () => {
    render(<Button size="md">Tall</Button>);

    expect(screen.getByRole("button", { name: "Tall" }).className).toContain(
      "h-control",
    );
  });
});
