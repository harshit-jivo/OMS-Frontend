import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SegmentedControl } from "./segmented";

const BRANCHES = [
  { value: "OIL", label: "Oil" },
  { value: "BEVERAGE", label: "Beverage" },
  { value: "MART", label: "Mart" },
] as const;

describe("SegmentedControl", () => {
  it("is a radiogroup with exactly one checked radio", () => {
    render(<SegmentedControl value="BEVERAGE" onChange={() => {}} options={BRANCHES} />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Beverage" })).toHaveAttribute("aria-checked", "true");
  });

  it("puts only the checked radio in the Tab sequence", () => {
    render(<SegmentedControl value="OIL" onChange={() => {}} options={BRANCHES} />);
    expect(screen.getByRole("radio", { name: "Oil" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Mart" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves the selection with the arrow keys, wrapping", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl value="MART" onChange={onChange} options={BRANCHES} />);

    screen.getByRole("radio", { name: "Mart" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("OIL");

    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("BEVERAGE");
  });

  it("keeps the checked fill after the reset's bg-transparent", () => {
    // Trap 1.4: both are background utilities. A plain join left the reset
    // winning on emission order — white text on a white pill.
    render(<SegmentedControl value="OIL" onChange={() => {}} options={BRANCHES} />);
    const checked = screen.getByRole("radio", { name: "Oil" });
    expect(checked.className).toContain("bg-brand");
    expect(checked.className).not.toContain("bg-transparent");
  });
});
