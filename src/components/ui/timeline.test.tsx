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
    // The rail is a left border on each item, so dropping it on the last one
    // would change that item's box by a pixel and knock it out of line with
    // the ones above. Transparent, not absent.
    const { container } = render(
      <Timeline>
        <TimelineItem>first</TimelineItem>
        <TimelineItem last>last</TimelineItem>
      </Timeline>,
    );

    const items = Array.from(container.querySelectorAll('[data-slot="timeline-item"]'));
    expect(items[0].className).toContain("border-line");
    expect(items[1].className).toContain("border-transparent");
    expect(items[1].className).toContain("border-l");
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

    const dot = container.querySelector('[data-slot="timeline-item"] span[aria-hidden="true"]');
    expect(dot?.className).toContain("bg-bad");
    expect(screen.getByText("SAP refused the push").className).toContain("text-danger");
  });
});
