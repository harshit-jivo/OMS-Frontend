import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Checkbox, Field, FieldGroup, Input, Textarea } from "./form";

/**
 * Form controls.
 *
 * What is pinned is the wiring, not the look: a label that is really attached
 * to its control, and a hint that is announced with it. Both are things the
 * hand-rolled fields across the app get right about half the time, and both
 * are invisible until someone uses a screen reader or clicks a caption.
 */

describe("Field", () => {
  it("attaches the label to the control", async () => {
    // Clicking the caption should focus the input. Several hand-rolled fields
    // put the two side by side with no `htmlFor` at all.
    const user = userEvent.setup();
    render(
      <Field label="Card name">{(control) => <Input {...control} />}</Field>,
    );

    await user.click(screen.getByText("Card name"));

    expect(screen.getByRole("textbox", { name: "Card name" })).toHaveFocus();
  });

  it("announces the hint with the control", () => {
    render(
      <Field label="Code" hint="Permanent — reports cite it.">
        {(control) => <Input {...control} />}
      </Field>,
    );

    expect(screen.getByRole("textbox", { name: "Code" })).toHaveAccessibleDescription(
      "Permanent — reports cite it.",
    );
  });

  it("shows an error in place of the hint, and marks the control invalid", () => {
    render(
      <Field label="Code" hint="Permanent." error="A code is required.">
        {(control) => <Input {...control} />}
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Code" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("A code is required.");
    expect(screen.queryByText("Permanent.")).not.toBeInTheDocument();
  });

  it("is valid by default, rather than aria-invalid=false on every field", () => {
    render(<Field label="Code">{(control) => <Input {...control} />}</Field>);

    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  it("marks a required field for sight AND for semantics", () => {
    // The asterisk alone is decoration; `required` is what a screen reader
    // and the browser's own validation read.
    render(
      <Field label="Name" required>
        {(control) => <Input {...control} />}
      </Field>,
    );

    expect(screen.getByRole("textbox", { name: /Name/ })).toBeRequired();
  });

  it("gives each field its own id, so two on a page do not collide", () => {
    render(
      <>
        <Field label="One">{(control) => <Input {...control} />}</Field>
        <Field label="Two">{(control) => <Input {...control} />}</Field>
      </>,
    );

    const [a, b] = screen.getAllByRole("textbox");
    expect(a.id).not.toBe(b.id);
    expect(a.id).toBeTruthy();
  });

  it("takes a textarea as readily as an input", () => {
    // The render prop exists so a field is not limited to one control shape.
    render(
      <Field label="Rule" hint="Sent to the AI word for word.">
        {(control) => <Textarea {...control} rows={4} />}
      </Field>,
    );

    expect(screen.getByRole("textbox", { name: "Rule" })).toHaveAccessibleDescription(
      "Sent to the AI word for word.",
    );
  });
});

describe("controls carry the form reset", () => {
  it("keeps the app's font, which form controls do not inherit", () => {
    // Preflight is not imported, so `font-family` falls back to the UA's on
    // every bare control — Arial beside Inter, on every form in the app.
    render(
      <>
        <Field label="A">{(control) => <Input {...control} />}</Field>
        <Field label="B">{(control) => <Textarea {...control} />}</Field>
      </>,
    );

    screen.getAllByRole("textbox").forEach((control) => {
      expect(control.className).toContain("[font-family:inherit]");
    });
  });

  it("sizes an input at the FIELD height, not the chrome height", () => {
    // 40px, so a button beside it lines up. The 32px `--spacing-control-xs`
    // is for toolbars, which are glanced at rather than filled in.
    render(<Field label="A">{(control) => <Input {...control} />}</Field>);

    expect(screen.getByRole("textbox").className).toContain("h-control");
  });
});

describe("Checkbox", () => {
  it("puts its label beside it and toggles from the label", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox label="Active" checked={false} onChange={onChange} />);

    await user.click(screen.getByText("Active"));

    expect(onChange).toHaveBeenCalled();
  });

  it("announces its hint", () => {
    render(
      <Checkbox
        label="Critical"
        hint="Only critical rules can have a PASS overturned."
        checked={false}
        readOnly
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Critical" })).toHaveAccessibleDescription(
      "Only critical rules can have a PASS overturned.",
    );
  });
});

describe("FieldGroup", () => {
  it("names the group for every control inside it", () => {
    // "Critical" means nothing without "OCR cross-check" above it, and a
    // real fieldset/legend is what carries that into the accessibility tree.
    render(
      <FieldGroup legend="OCR cross-check">
        <Checkbox label="Critical" checked={false} readOnly />
      </FieldGroup>,
    );

    expect(screen.getByRole("group", { name: /OCR cross-check/ })).toBeInTheDocument();
  });
});
