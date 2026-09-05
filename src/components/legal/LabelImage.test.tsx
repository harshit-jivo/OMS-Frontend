import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import FindingsChecklist from "./FindingsChecklist";
import LabelImage from "./LabelImage";
import type { Finding } from "./labelReport";

/**
 * Highlighting failures on the label.
 *
 * The properties worth pinning are the ones that make the boxes trustworthy
 * rather than decorative:
 *
 *  * A finding with NO regions draws NO box. That is the whole honesty
 *    guarantee — a rule that failed because a declaration is absent has
 *    nowhere to point, and marking somewhere plausible would be a lie the
 *    reviewer cannot detect.
 *  * Boxes are positioned as percentages of the image, so they stay on their
 *    words at any rendered width. A regression to pixels would look right in
 *    one column width and wrong in every other.
 *  * Both verdicts are drawn, and `showPasses` can turn the green ones off
 *    for a dense label — but a FAILURE is never hideable, and a selected
 *    finding is drawn even when its group is hidden.
 *  * The number on the image matches the number in the checklist.
 */

const FINDINGS: Finding[] = [
  {
    rule_id: "FSSAI_LICENCE",
    rule_name: "FSSAI logo and licence number",
    status: "FAIL",
    remarks: "The licence number has 13 digits, not 14.",
    evidence_text: "FSSAI Lic. No. 1001234567890",
    ocr_verified: false,
    regions: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.05 }],
  },
  {
    rule_id: "ALLERGEN",
    rule_name: "Allergen declaration",
    status: "FAIL",
    remarks: "No allergen declaration appears anywhere on the label.",
    evidence_text: "",
    ocr_verified: null,
    // Absent declaration: nothing to point at.
    regions: [],
  },
  {
    rule_id: "FOOD_NAME",
    rule_name: "Name of the food",
    status: "PASS",
    remarks: "Declared on the front panel.",
    evidence_text: "Jivo Canola Oil",
    ocr_verified: true,
    regions: [{ x: 0.1, y: 0.5, width: 0.4, height: 0.06 }],
  },
];

const renderImage = (props: Partial<Parameters<typeof LabelImage>[0]> = {}) =>
  render(
    <LabelImage
      src="/media/labels/previews/x.png"
      alt="Label: x.pdf"
      findings={FINDINGS}
      activeId={null}
      {...props}
    />,
  );

describe("LabelImage", () => {
  it("marks each failure that has a location", () => {
    renderImage();

    expect(
      screen.getByRole("button", { name: "Failed: FSSAI logo and licence number" }),
    ).toBeInTheDocument();
  });

  it("draws nothing for a failure with no location", () => {
    // The honesty guarantee: an absent declaration is not marked anywhere.
    renderImage();

    expect(
      screen.queryByRole("button", { name: /Allergen declaration/ }),
    ).not.toBeInTheDocument();
  });

  it("marks passing rules too, so a reviewer can see what WAS checked", () => {
    renderImage();

    expect(
      screen.getByRole("button", { name: "Passed: Name of the food" }),
    ).toBeInTheDocument();
  });

  it("can hide the passes for a dense label", () => {
    renderImage({ showPasses: false });

    expect(
      screen.queryByRole("button", { name: "Passed: Name of the food" }),
    ).not.toBeInTheDocument();
    // Failures are never hidden — they are the point of the page.
    expect(
      screen.getByRole("button", { name: "Failed: FSSAI logo and licence number" }),
    ).toBeInTheDocument();
  });

  it("still draws a selected pass when passes are hidden", () => {
    // Otherwise clicking a row in the checklist would appear to do nothing.
    renderImage({ showPasses: false, activeId: "FOOD_NAME" });

    expect(
      screen.getByRole("button", { name: "Passed: Name of the food" }),
    ).toBeInTheDocument();
  });

  it("positions boxes as percentages, so they survive any render width", () => {
    renderImage();

    const box = screen.getByRole("button", {
      name: "Failed: FSSAI logo and licence number",
    });
    expect(box.style.left).toBe("10%");
    expect(box.style.top).toBe("20%");
    expect(box.style.width).toBe("50%");
    expect(box.style.height).toBe("5%");
  });

  it("numbers failures in the order they are listed", () => {
    renderImage();

    const box = screen.getByRole("button", {
      name: "Failed: FSSAI logo and licence number",
    });
    expect(box).toHaveTextContent("1");
  });

  it("numbers only the first box of a phrase that wraps", () => {
    // Two boxes, one finding — numbering both would read as two failures.
    const wrapped: Finding[] = [
      {
        ...FINDINGS[0],
        regions: [
          { x: 0.1, y: 0.2, width: 0.5, height: 0.05 },
          { x: 0.1, y: 0.26, width: 0.3, height: 0.05 },
        ],
      },
    ];
    render(
      <LabelImage src="/x.png" alt="Label" findings={wrapped} activeId={null} />,
    );

    const boxes = screen.getAllByRole("button", { name: /FSSAI/ });
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toHaveTextContent("1");
    expect(boxes[1]).toHaveTextContent("");
  });

  it("selects the finding when its box is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderImage({ onSelect });

    await user.click(
      screen.getByRole("button", { name: "Failed: FSSAI logo and licence number" }),
    );

    expect(onSelect).toHaveBeenCalledWith("FSSAI_LICENCE");
  });

  it("still renders the label when nothing can be highlighted", () => {
    render(
      <LabelImage src="/x.png" alt="Label: x.pdf" findings={[]} activeId={null} />,
    );

    expect(screen.getByRole("img", { name: "Label: x.pdf" })).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("FindingsChecklist", () => {
  /** The page's real wiring: selecting a row toggles it. */
  function Harness() {
    const [activeId, setActiveId] = useState<string | null>(null);
    return (
      <>
        <LabelImage
          src="/x.png"
          alt="Label"
          findings={FINDINGS}
          activeId={activeId}
          onSelect={setActiveId}
        />
        <FindingsChecklist
          findings={FINDINGS}
          activeId={activeId}
          onSelect={(id) => setActiveId((prev) => (prev === id ? null : id))}
        />
      </>
    );
  }

  it("groups failures first and counts them", () => {
    render(<FindingsChecklist findings={FINDINGS} activeId={null} onSelect={vi.fn()} />);

    const headings = screen.getAllByRole("heading");
    expect(headings[0]).toHaveTextContent("Failed (2)");
    expect(headings[1]).toHaveTextContent("Passed (1)");
  });

  it("explains why a failure has no highlight", () => {
    render(<FindingsChecklist findings={FINDINGS} activeId={null} onSelect={vi.fn()} />);

    expect(screen.getByText(/Nothing to highlight/)).toBeInTheDocument();
  });

  it("shows the quoted wording the highlight points at", () => {
    render(<FindingsChecklist findings={FINDINGS} activeId={null} onSelect={vi.fn()} />);

    expect(screen.getByText(/FSSAI Lic\. No\. 1001234567890/)).toBeInTheDocument();
  });

  it("selecting a row emphasises its box on the label", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const box = screen.getByRole("button", { name: "Passed: Name of the food" });
    expect(box.className).not.toContain("is-active");

    await user.click(screen.getByRole("button", { name: /Name of the food.*PASS/s }));

    expect(
      screen.getByRole("button", { name: "Passed: Name of the food" }).className,
    ).toContain("is-active");
  });

  it("clicking the selected row again clears the emphasis", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const row = () => screen.getByRole("button", { name: /Name of the food.*PASS/s });
    await user.click(row());
    await user.click(row());

    expect(
      screen.getByRole("button", { name: "Passed: Name of the food" }).className,
    ).not.toContain("is-active");
  });
});
