import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton, TableSkeleton } from "./skeleton";

describe("TableSkeleton", () => {
  it("announces that the region is loading", () => {
    render(<TableSkeleton label="Loading orders" />);
    const status = screen.getByRole("status", { name: "Loading orders" });
    // The spinner block it replaces was a bare <span> with a CSS animation:
    // nothing in it was reachable by a screen reader at all.
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  it("stands in at the size of the table it replaces", () => {
    const { container } = render(<TableSkeleton columns={5} rows={7} />);
    // 7 body rows + 1 header row, 5 bars each.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(8 * 5);
  });

  it("defaults to one page of a typical list", () => {
    const { container } = render(<TableSkeleton />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(11 * 8);
  });

  it("only shimmers when motion is allowed", () => {
    const { container } = render(<Skeleton />);
    const bar = container.querySelector('[data-slot="skeleton"]');
    expect(bar?.className).toContain("motion-safe:");
  });
});
