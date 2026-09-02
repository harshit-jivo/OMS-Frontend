import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Tab, TabList } from "./tabs";

function Harness() {
  const [active, setActive] = useState("Status");
  const tabs = ["Status", "Products", "Branches"];
  return (
    <>
      <button type="button">before</button>
      <TabList label="SAP sync sections">
        {tabs.map((t) => (
          <Tab key={t} selected={active === t} onClick={() => setActive(t)}>
            {t}
          </Tab>
        ))}
      </TabList>
      <button type="button">after</button>
    </>
  );
}

describe("Tabs", () => {
  it("is a labelled tablist", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "SAP sync sections" })).toBeInTheDocument();
  });

  it("uses a roving tabindex so the strip is one tab stop", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // Three tabs, but Tab from "before" reaches the selected one and the next
    // Tab leaves the strip entirely.
    await user.tab();
    expect(document.activeElement).toHaveTextContent("before");
    await user.tab();
    expect(document.activeElement).toHaveTextContent("Status");
    await user.tab();
    expect(document.activeElement).toHaveTextContent("after");
  });

  it("moves with the arrow keys, which is what role=tablist promises", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "Status" }).focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Products" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Status" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("wraps at both ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "Status" }).focus();

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toHaveTextContent("Branches");

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveTextContent("Status");
  });

  it("jumps to the ends with Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "Status" }).focus();

    await user.keyboard("{End}");
    expect(document.activeElement).toHaveTextContent("Branches");
    await user.keyboard("{Home}");
    expect(document.activeElement).toHaveTextContent("Status");
  });
});
