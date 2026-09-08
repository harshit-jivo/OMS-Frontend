import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import {
  FilterBar,
  FilterCount,
  FilterDate,
  FilterSearch,
  FilterSelect,
  FilterSpacer,
} from "./filter-bar";

/**
 * The filter toolbar.
 *
 * The labelling tests are the point of this component existing rather than a
 * sixth copy of the markup. Every hand-rolled toolbar in the orders module
 * leans on the first option ("All Statuses") to say what a control is — which
 * reads fine until something is selected, and then the control is nameless for
 * everyone, screen reader or not.
 *
 * Labels are VISIBLE here, which is a correction of this component's own first
 * version: it hid them with `sr-only`, which solved the problem for assistive
 * tech and left a sighted user staring at five identical grey selects.
 */

function Harness() {
  const [status, setStatus] = useState("");
  return (
    <FilterBar>
      <FilterSelect
        label="Status"
        value={status}
        onChange={(event) => setStatus(event.target.value)}
      >
        <option value="">All statuses</option>
        <option value="billed">Billed</option>
      </FilterSelect>
      <FilterSearch label="Search orders" />
      <FilterDate label="From" />
      <FilterSpacer />
      <FilterCount>Total: 12</FilterCount>
    </FilterBar>
  );
}

describe("FilterBar", () => {
  it("names every control, even once it has a value", () => {
    render(<Harness />);

    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Search orders" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
  });

  it("keeps the select's name after a selection is made", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Status" }),
      "billed",
    );

    // The name comes from the label, not from the first option.
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("billed");
  });

  it("shows every label visibly, not just the date's", () => {
    // A bare date input reads "dd/mm/yyyy" with no clue whether it is the start
    // or the end of a range — and a bare select is no better once it has a
    // value. All of them are captioned.
    render(<Harness />);

    expect(screen.getByText("From")).toBeVisible();
    expect(screen.getByText("Status")).toBeVisible();
    expect(screen.getByText("Search orders")).toBeVisible();
  });

  it("can put an icon in the caption", () => {
    const Icon = (props: { className?: string }) => <svg {...props} />;
    const { container } = render(
      <FilterBar>
        <FilterSelect label="Status" icon={Icon}>
          <option value="">All</option>
        </FilterSelect>
      </FilterBar>,
    );

    expect(container.querySelector("label svg")).toBeInTheDocument();
  });

  it("is announced as a search region", () => {
    render(<Harness />);

    expect(screen.getByRole("search")).toBeInTheDocument();
  });

  it("carries the font reset on its fields, because preflight is not imported", () => {
    render(<Harness />);

    // font-family is not inherited by form controls; without this the select
    // renders in the UA font beside Inter text.
    expect(screen.getByRole("combobox", { name: "Status" }).className).toContain(
      "[font-family:inherit]",
    );
  });

  it("wraps rather than scrolls", () => {
    // A filter that has scrolled out of sight is one the user does not know is
    // applied.
    const { container } = render(<Harness />);

    const bar = container.querySelector("[data-slot='filter-bar']") as HTMLElement;
    expect(bar.className).toContain("flex-wrap");
    expect(bar.className).not.toContain("overflow-x-auto");
  });

  it("holds no state of its own", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterBar>
        <FilterSelect label="Status" value="" onChange={onChange}>
          <option value="">All</option>
          <option value="billed">Billed</option>
        </FilterSelect>
      </FilterBar>,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "billed");

    // The page owns the value and the page-number reset that goes with it.
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("");
  });

  it("disables a dependent select without losing its name", () => {
    render(
      <FilterBar>
        <FilterSelect label="Item" disabled>
          <option value="">Select party first</option>
        </FilterSelect>
      </FilterBar>,
    );

    const select = screen.getByRole("combobox", { name: "Item" });
    expect(select).toBeDisabled();
  });

  it("sits alongside a button without a height mismatch", () => {
    // Both sit at `--spacing-control-xs` (32px) — the CHROME height, shared
    // with page-header actions. A filter is a toolbar, not a form: at the
    // 36px form height five of these were taller than the KPI row above.
    //
    // The BAR normalises whatever button it is given, rather than every
    // caller remembering `size="xs"`. This test caught the mismatch the
    // moment the fields shrank and the Clear button did not.
    const { container } = render(
      <FilterBar>
        <FilterSearch label="Search" />
        <Button size="sm">Clear</Button>
      </FilterBar>,
    );

    expect(screen.getByRole("searchbox", { name: "Search" }).className).toContain(
      "h-control-xs",
    );
    expect(container.firstElementChild?.className).toContain(
      "[&_[data-slot=button]]:h-control-xs",
    );
  });
});
