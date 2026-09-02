import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Pagination } from "./pagination";

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
