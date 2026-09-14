/**
 * Timeline — the three things that are easy to get wrong and invisible in a
 * screenshot.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Timeline, TimelineHead, TimelineItem, TimelineNote, TimelineSeparator } from "./timeline";

describe("Timeline", () => {
  it("is a real list, and the separator is one of its items", () => {
    // A `div` between `li`s is invalid inside `ol` and drops out of the
    // accessibility tree, taking the "Version 2 of 3" label with it — which is
    // the one thing telling the reader the entries below belong to a different
    // version of the invoice.
    render(
      <Timeline>
        <TimelineSeparator>Version 2 of 3</TimelineSeparator>
        <TimelineItem>
          <TimelineHead>Approved</TimelineHead>
        </TimelineItem>
      </Timeline>,
    );

    const list = screen.getByRole("list");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(list).toContainElement(screen.getByText("Version 2 of 3"));
  });

  it("keeps the rail off the last item without moving it", () => {
    // The rail is its own element, not a border on the item, so the last item
    // simply has none — and because no item carries a border, dropping it
    // cannot knock the final row out of line with the ones above.
    const { container } = render(
      <Timeline>
        <TimelineItem>first</TimelineItem>
        <TimelineItem last>last</TimelineItem>
      </Timeline>,
    );

    const items = Array.from(container.querySelectorAll('[data-slot="timeline-item"]'));
    const rails = container.querySelectorAll('[data-slot="timeline-rail"]');
    expect(rails).toHaveLength(1);
    expect(items[0].querySelector('[data-slot="timeline-rail"]')).not.toBeNull();
    expect(items[1].querySelector('[data-slot="timeline-rail"]')).toBeNull();
    // Same left padding on both, so nothing shifts.
    expect(items[0].className).toContain("pl-6");
    expect(items[1].className).toContain("pl-6");
    expect(items[0].className).not.toContain("border-l");
  });

  it("colours the dot from the same tone vocabulary as Badge", () => {
    // Two components describing one status must not disagree about what colour
    // that status is, which is why the dot takes a `BadgeTone` rather than a
    // palette of its own.
    const { container } = render(
      <Timeline>
        <TimelineItem tone="bad">
          <TimelineNote tone="bad">SAP refused the push</TimelineNote>
        </TimelineItem>
      </Timeline>,
    );

    const dot = container.querySelector('[data-slot="timeline-dot"]');
    expect(dot?.className).toContain("bg-bad");
    expect(screen.getByText("SAP refused the push").className).toContain("text-danger");
  });
  it("starts the rail at the dot, so nothing hangs above the first one", () => {
    // A border on the item spans its FULL height, including the few pixels
    // above the dot. Invisible on every item but the first, where it reads as
    // history that is not there — the origin appearing to come from somewhere.
    const { container } = render(
      <Timeline>
        <TimelineItem>origin</TimelineItem>
        <TimelineItem last>end</TimelineItem>
      </Timeline>,
    );

    const rail = container.querySelector('[data-slot="timeline-rail"]');
    expect(rail?.className).toContain("top-2");
    expect(rail?.className).toContain("bottom-0");
  });

  it("colours the rail independently of the dot", () => {
    // The dot describes the STOP, the rail describes the JOURNEY out of it.
    const { container } = render(
      <Timeline>
        <TimelineItem tone="ok" rail="skipped">
          passed without a decision
        </TimelineItem>
      </Timeline>,
    );

    expect(container.querySelector('[data-slot="timeline-dot"]')?.className).toContain("bg-ok");
    const rail = container.querySelector('[data-slot="timeline-rail"]');
    expect(rail?.className).toContain("border-dashed");
  });
});
