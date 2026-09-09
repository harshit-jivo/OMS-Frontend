import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";
import { DetailField, DetailFields, DetailGrid, DetailSection } from "./detail";
import { Card } from "./page";

/**
 * Record detail.
 *
 * The two properties worth pinning:
 *
 *  * An EMPTY field keeps its place, showing an em dash. `NicUI.KeyValues`
 *    drops empty rows entirely, which reads tidily and loses information —
 *    "Delivery date: —" and no delivery-date row mean different things to a
 *    reviewer, and only one of them is visible.
 *  * Label and value are a real `dt`/`dd` pair, so the association survives
 *    for a screen reader rather than being purely visual.
 */

describe("DetailField", () => {
  it("renders label and value as a dt/dd pair", () => {
    const { container } = render(
      <DetailGrid>
        <DetailField label="Card name" value="Jivo Wellness" />
      </DetailGrid>,
    );

    expect(container.querySelector("dl")).toBeInTheDocument();
    expect(container.querySelector("dt")).toHaveTextContent("Card name");
    expect(container.querySelector("dd")).toHaveTextContent("Jivo Wellness");
  });

  it("keeps an empty field in place, as an em dash", () => {
    const { container } = render(
      <DetailGrid>
        <DetailField label="Delivery date" value="" />
      </DetailGrid>,
    );

    expect(screen.getByText("Delivery date")).toBeInTheDocument();
    expect(container.querySelector("dd")).toHaveTextContent("—");
  });

  it("treats null and undefined the same way", () => {
    const { container } = render(
      <DetailGrid>
        <DetailField label="A" value={null} />
        <DetailField label="B" value={undefined} />
      </DetailGrid>,
    );

    const values = container.querySelectorAll("dd");
    expect(values[0]).toHaveTextContent("—");
    expect(values[1]).toHaveTextContent("—");
  });

  it("hides an empty field only when asked", () => {
    render(
      <DetailGrid>
        <DetailField label="Optional note" value="" hideWhenEmpty />
      </DetailGrid>,
    );

    expect(screen.queryByText("Optional note")).not.toBeInTheDocument();
  });

  it("shows a zero, which is a value and not an absence", () => {
    const { container } = render(
      <DetailGrid>
        <DetailField label="Items" value={0} />
      </DetailGrid>,
    );

    expect(container.querySelector("dd")).toHaveTextContent("0");
  });

  it("accepts a node as its value, so a status keeps its badge", () => {
    render(
      <DetailGrid>
        <DetailField label="Status" value={<Badge tone="ok">Billed</Badge>} />
      </DetailGrid>,
    );

    expect(screen.getByText("Billed").className).toContain("bg-ok-soft");
  });

  it("emphasises a value on request", () => {
    const { container } = render(
      <DetailGrid>
        <DetailField label="Grand total" value="12,500.00" strong />
      </DetailGrid>,
    );

    expect(container.querySelector("dd")?.className).toContain("font-bold");
  });

  it("can span the full width for long text", () => {
    const { container } = render(
      <DetailGrid>
        <DetailField label="Remarks" value="A long remark" span="full" />
      </DetailGrid>,
    );

    expect(
      container.querySelector("[data-slot='detail-field']")?.className,
    ).toContain("col-span-full");
  });
});

describe("DetailSection", () => {
  it("renders a titled group", () => {
    render(
      <DetailSection title="Party">
        <DetailGrid>
          <DetailField label="Code" value="CUSTA000606" />
        </DetailGrid>
      </DetailSection>,
    );

    expect(screen.getByRole("heading", { name: "Party" })).toBeInTheDocument();
    expect(screen.getByText("CUSTA000606")).toBeInTheDocument();
  });

  it("renders without a title when the group needs no heading", () => {
    const { container } = render(
      <DetailSection>
        <p>bare</p>
      </DetailSection>,
    );

    expect(container.querySelectorAll("h3")).toHaveLength(0);
    expect(screen.getByText("bare")).toBeInTheDocument();
  });

  it("renders each section as a self-contained bordered box", () => {
    const { container } = render(
      <Card>
        <DetailSection title="One">a</DetailSection>
        <DetailSection title="Two">b</DetailSection>
      </Card>,
    );

    const sections = container.querySelectorAll("[data-slot='detail-section']");
    expect(sections).toHaveLength(2);
    expect(sections[0].className).toContain("border-line");
  });

  it("tints the header strip and marks the tone", () => {
    // EXIM colours each section of a record so a reader can navigate a long
    // one by colour instead of reading every label.
    const Icon = (props: { className?: string }) => <svg {...props} />;
    const { container } = render(
      <DetailSection title="Money" tone="emerald" icon={Icon}>
        body
      </DetailSection>,
    );

    const section = container.querySelector("[data-slot='detail-section']");
    expect(section).toHaveAttribute("data-tone", "emerald");
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Money" }).className).toContain(
      "uppercase",
    );
  });

  it("is almost colourless by default", () => {
    // A record whose sections have no meaningful distinction should not be
    // striped like a rainbow.
    const { container } = render(<DetailSection title="Plain">x</DetailSection>);

    expect(container.querySelector("[data-slot='detail-section']")).toHaveAttribute(
      "data-tone",
      "slate",
    );
  });

  it("puts section actions beside the heading, not inside it", () => {
    render(
      <DetailSection title="Items" actions={<button type="button">Export</button>}>
        body
      </DetailSection>,
    );

    const heading = screen.getByRole("heading", { name: "Items" });
    expect(heading.contains(screen.getByRole("button", { name: "Export" }))).toBe(
      false,
    );
  });
});

describe("DetailFields", () => {
  it("renders an array of pairs, the shape NicUI.KeyValues already takes", () => {
    const { container } = render(
      <DetailFields
        items={[
          ["Order", "SO-1024"],
          ["Party", "Jivo Wellness"],
        ]}
      />,
    );

    const list = container.querySelector("dl") as HTMLElement;
    expect(within(list).getByText("Order")).toBeInTheDocument();
    expect(within(list).getByText("SO-1024")).toBeInTheDocument();
    expect(list.querySelectorAll("[data-slot='detail-field']")).toHaveLength(2);
  });

  it("shows empty pairs by default, unlike the component it replaces", () => {
    const { container } = render(<DetailFields items={[["Batch", ""]]} />);

    expect(container.querySelector("dd")).toHaveTextContent("—");
  });
});
