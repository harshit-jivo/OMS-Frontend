/**
 * The badge primitive.
 *
 * Colours live in `statusTone.test.ts`; this file covers the component — that
 * a tone reaches the element, that the dot stays out of the accessibility tree,
 * and that a caller can still add their own class. The rendered appearance is
 * the visual suite's job.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("tone", () => {
  it("is neutral unless asked otherwise", () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText("Draft")).toHaveAttribute("data-tone", "neutral");
  });

  it("reaches the element as both a class and an attribute", () => {
    // The attribute is not decoration: it is what the visual suite and anyone
    // debugging in devtools can read, without having to know which Tailwind
    // class means "this is the danger colour".
    render(<Badge tone="bad">Rejected</Badge>);
    const badge = screen.getByText("Rejected");
    expect(badge).toHaveAttribute("data-tone", "bad");
    expect(badge.className).toContain("bg-bad-soft");
    expect(badge.className).toContain("text-bad");
  });

  it("does not carry another tone's colours", () => {
    // `cva` composes variants, so a bug that emitted two tones would leave both
    // sets of classes on the element and the later one would silently win.
    render(<Badge tone="ok">Approved</Badge>);
    const badge = screen.getByText("Approved");
    expect(badge.className).toContain("bg-ok-soft");
    expect(badge.className).not.toContain("bg-bad-soft");
    expect(badge.className).not.toContain("bg-hold-soft");
  });
});

describe("the dot", () => {
  it("is hidden from assistive technology", () => {
    // It repeats the tone, which repeats the label. Announced, it would read as
    // an extra unlabelled element between the reader and the word they want.
    const { container } = render(<Badge tone="ok" dot>Online</Badge>);
    const dot = container.querySelector("[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect(dot!.textContent).toBe("");
  });

  it("is absent unless asked for", () => {
    const { container } = render(<Badge tone="ok">Online</Badge>);
    expect(container.querySelector("[aria-hidden='true']")).toBeNull();
  });

  it("never replaces the label", () => {
    // The rule the old StatusBadge established and this keeps: identity never
    // rests on colour alone. Roughly one man in twelve cannot separate the red
    // and green these badges lean on, so the word has to be there.
    render(<Badge tone="bad" dot>Inactive</Badge>);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });
});

describe("composition", () => {
  it("keeps a caller's class", () => {
    render(<Badge className="au-cell-badge-role">Billing</Badge>);
    expect(screen.getByText("Billing").className).toContain("au-cell-badge-role");
  });

  it("applies caps only when asked", () => {
    // Only 4 of the 15 badge rules being replaced uppercase their text, so
    // forcing it either way would restyle a majority to suit a minority.
    const { rerender } = render(<Badge>billing</Badge>);
    expect(screen.getByText("billing").className).not.toContain("uppercase");

    rerender(<Badge caps>billing</Badge>);
    expect(screen.getByText("billing").className).toContain("uppercase");
  });

  it("passes through the attributes a chip needs", () => {
    render(<Badge title="Last seen 2 minutes ago">Online</Badge>);
    expect(screen.getByText("Online")).toHaveAttribute(
      "title",
      "Last seen 2 minutes ago",
    );
  });
});
