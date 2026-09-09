import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PAGE_GAP, Pagination, pageWindow } from "./pagination";

describe("Pagination", () => {
  it("is a labelled landmark", () => {
    render(<Pagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
  });

  it("announces the position", () => {
    render(<Pagination page={3} totalPages={7} onPageChange={() => {}} />);
    const position = screen.getByText("Page 3 of 7");
    // Without this a keyboard user pressing Prev hears nothing: focus stays on
    // a button whose own label has not changed.
    expect(position).toHaveAttribute("aria-live", "polite");
  });

  it("names the buttons without reading the arrows out", () => {
    render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Prev" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("moves a page at a time", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={7} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);

    await user.click(screen.getByRole("button", { name: "Prev" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("disables the ends", () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={4} onPageChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    rerender(<Pagination page={4} totalPages={4} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Prev" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("clamps a page that is already out of range", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    // A caller whose row count shrank under it — `page` past the end. The
    // hand-rolled pagers computed `disabled` from the same stale number and so
    // happily paged further out.
    render(<Pagination page={9} totalPages={4} onPageChange={onPageChange} />);

    expect(screen.getByText("Page 4 of 4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("survives a zero-page list", () => {
    render(<Pagination page={1} totalPages={0} onPageChange={() => {}} />);
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows a summary when one is given", () => {
    render(
      <Pagination
        page={1}
        totalPages={5}
        onPageChange={() => {}}
        summary="Showing 1-10 of 47"
      />,
    );
    expect(screen.getByText("Showing 1-10 of 47")).toBeInTheDocument();
  });
});

describe("pageWindow", () => {
  it("shows every page while they all fit", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("elides the tail near the start", () => {
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5, PAGE_GAP, 20]);
  });

  it("elides the head near the end", () => {
    expect(pageWindow(19, 20)).toEqual([1, PAGE_GAP, 16, 17, 18, 19, 20]);
  });

  it("elides both sides in the middle", () => {
    expect(pageWindow(10, 20)).toEqual([1, PAGE_GAP, 9, 10, 11, PAGE_GAP, 20]);
  });

  it("keeps the slot count CONSTANT, so the arrows do not move", () => {
    // The property worth having. A pager that grows from 5 slots to 7 as you
    // leave page 1 shifts the Next arrow out from under the cursor mid-click.
    const widths = new Set(
      Array.from({ length: 20 }, (_, i) => pageWindow(i + 1, 20).length),
    );
    expect([...widths]).toEqual([7]);
  });

  it("never hides a single page behind an ellipsis", () => {
    // "1 … 3 4 5" would elide exactly one number behind a symbol wider than
    // the number it replaces.
    for (let page = 1; page <= 20; page += 1) {
      const slots = pageWindow(page, 20);
      slots.forEach((slot, i) => {
        if (slot !== PAGE_GAP) return;
        const before = slots[i - 1] as number;
        const after = slots[i + 1] as number;
        expect(after - before, `gap at page ${page} hides too little`).toBeGreaterThan(2);
      });
    }
  });

  it("stays in order and never repeats a page", () => {
    for (let page = 1; page <= 20; page += 1) {
      const numbers = pageWindow(page, 20).filter(
        (slot): slot is number => slot !== PAGE_GAP,
      );
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });

  it("always offers the first and last page", () => {
    for (let page = 1; page <= 20; page += 1) {
      const slots = pageWindow(page, 20);
      expect(slots[0]).toBe(1);
      expect(slots[slots.length - 1]).toBe(20);
    }
  });

  it("always includes the current page", () => {
    for (let page = 1; page <= 20; page += 1) {
      expect(pageWindow(page, 20)).toContain(page);
    }
  });

  it("clamps nonsense rather than producing a broken run", () => {
    expect(pageWindow(0, 0)).toEqual([1]);
    expect(pageWindow(99, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(-4, 4)).toEqual([1, 2, 3, 4]);
  });

  it("widens with more siblings", () => {
    expect(pageWindow(10, 30, 2)).toEqual([1, PAGE_GAP, 8, 9, 10, 11, 12, PAGE_GAP, 30]);
  });
});

describe("the numbered buttons", () => {
  it("jumps straight to a page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "Page 4" }));

    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it("marks the page you are on as current", () => {
    render(<Pagination page={3} totalPages={5} onPageChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Page 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Page 2" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("does not fire for the page already shown", () => {
    // Re-rendering the table for a page it is already on is work for nothing.
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);

    screen.getByRole("button", { name: "Page 3" }).click();

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("keeps the ellipsis out of the accessibility tree", () => {
    // "one … four" read aloud between page numbers is noise; the numbers
    // themselves already say what is reachable.
    const { container } = render(
      <Pagination page={10} totalPages={40} onPageChange={() => {}} />,
    );

    const gaps = container.querySelectorAll("[data-slot='pagination-gap']");
    expect(gaps).toHaveLength(2);
    gaps.forEach((gap) => expect(gap).toHaveAttribute("aria-hidden", "true"));
  });

  it("goes through ui/button, so the controls carry the form reset", () => {
    // They were hand-rolled `<button>`s with a border and no background or
    // appearance reset. Preflight is not imported, so they rendered on the
    // UA's grey `buttonface`; inside a `.tw-page` they also picked up the UA
    // font, because nothing set `[font-family:inherit]`.
    render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />);

    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toHaveAttribute("data-slot", "button");
    expect(next.className).toContain("appearance-none");
    expect(next.className).toContain("[font-family:inherit]");
  });

  it("still announces the position, for a reader who cannot see the numbers", () => {
    render(<Pagination page={3} totalPages={7} onPageChange={() => {}} />);

    const position = screen.getByText("Page 3 of 7");
    expect(position).toHaveAttribute("aria-live", "polite");
    // Visually redundant now that the numbers are on screen.
    expect(position.className).toContain("sr-only");
  });
});
