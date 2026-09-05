import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MarkdownReport from "./MarkdownReport";
import { buildReportMarkdown, summarise, type Finding } from "./labelReport";

/**
 * The compliance report renderer, and the layout it sits in.
 *
 * Two things are worth pinning here:
 *
 * 1. **The renderer's grammar.** It is hand-written (the app ships no Markdown
 *    library), so the cases a real report contains — bold rule names, PASS and
 *    FAIL pills, an asterisk inside a quoted remark — are the cases that must
 *    not break. The escaping test is the important one: `remarks` is written by
 *    a model and routinely contains `*`.
 *
 * 2. **That it renders as elements, never as HTML.** Nothing in `src/` uses
 *    `dangerouslySetInnerHTML`, and this component would be the obvious place
 *    to reach for it. A test that markup in a remark stays text is what keeps
 *    that true after the next edit.
 *
 * `Harness` below is the "test component" the layout check needs: the report
 * beside a sample image, the same arrangement the page renders.
 */

const FINDINGS: Finding[] = [
  {
    rule_id: "FSSAI_LICENCE",
    rule_name: "FSSAI logo and licence number",
    status: "FAIL",
    remarks:
      'The licence number reads "1001234567890" — 13 digits, not the 14 required.',
    ocr_verified: false,
  },
  {
    rule_id: "FOOD_NAME",
    rule_name: "Name of the food",
    status: "PASS",
    remarks: '"Jivo Canola Oil" is declared on the principal display panel.',
    ocr_verified: true,
  },
  {
    rule_id: "FOOTNOTE_SYMBOLS",
    rule_name: "Footnote symbols are explained",
    status: "PASS",
    // A remark containing the character the renderer treats as a delimiter.
    remarks: "The * symbol beside Added Sugars has a matching footnote.",
    ocr_verified: null,
  },
];

const REPORT = {
  file: "labels/jivo-canola-1l.pdf",
  image_url: "/media/labels/jivo-canola-1l.png",
  findings: FINDINGS,
  summary: summarise(FINDINGS),
  ocr_available: true,
  rule_count: 3,
};

/** The page's arrangement: the label beside its report. */
function Harness({ source }: { source: string }) {
  return (
    <div className="lc-page">
      <div className="lc-split">
        <section className="lc-pane lc-pane-image" aria-label="Uploaded label">
          <img
            className="lc-label-image"
            src="/media/labels/jivo-canola-1l.png"
            alt="Label: jivo-canola-1l.pdf"
          />
        </section>
        <section className="lc-pane lc-pane-report" aria-label="Compliance report">
          <MarkdownReport source={source} />
        </section>
      </div>
    </div>
  );
}

describe("buildReportMarkdown", () => {
  const markdown = buildReportMarkdown(REPORT, "jivo-canola-1l.pdf");

  it("leads with the verdict and the counts", () => {
    expect(markdown).toContain("# Label compliance report");
    expect(markdown).toContain("**Rules checked:** 3");
    expect(markdown).toContain("**Passed:** 2  ·  **Failed:** 1");
    expect(markdown).toContain("**Verdict:** Not compliant — 1 rule failed");
  });

  it("groups failures first, since that is what the reviewer acts on", () => {
    expect(markdown.indexOf("## Failed (1)")).toBeLessThan(
      markdown.indexOf("## Passed (2)"),
    );
  });

  it("marks each finding with its status and name", () => {
    expect(markdown).toContain("- [FAIL] **FSSAI logo and licence number**");
    expect(markdown).toContain("- [PASS] **Name of the food**");
  });

  it("records whether OCR could corroborate the finding", () => {
    expect(markdown).toContain("*(OCR verified)*"); // FOOD_NAME
    expect(markdown).toContain("*(not found by OCR)*"); // FSSAI_LICENCE
  });

  it("escapes asterisks in remarks so they cannot open a run", () => {
    // Unescaped, "The * symbol ... " would start an italic run and swallow the
    // rest of the line.
    expect(markdown).toContain("The \\* symbol beside Added Sugars");
  });

  it("says so when the check ran without OCR", () => {
    const noOcr = buildReportMarkdown({ ...REPORT, ocr_available: false }, "x.pdf");

    expect(noOcr).toContain("OCR was unavailable on the server");
  });
});

describe("MarkdownReport", () => {
  it("renders the report beside the label image", () => {
    const markdown = buildReportMarkdown(REPORT, "jivo-canola-1l.pdf");
    render(<Harness source={markdown} />);

    const image = screen.getByRole("img", { name: "Label: jivo-canola-1l.pdf" });
    expect(image).toHaveAttribute("src", "/media/labels/jivo-canola-1l.png");

    const report = screen.getByRole("region", { name: "Compliance report" });
    expect(
      within(report).getByRole("heading", { name: "Label compliance report" }),
    ).toBeInTheDocument();
  });

  it("gives every finding a PASS or FAIL pill", () => {
    render(<MarkdownReport source={buildReportMarkdown(REPORT, "x.pdf")} />);

    expect(screen.getAllByText("PASS")).toHaveLength(2);
    expect(screen.getAllByText("FAIL")).toHaveLength(1);
  });

  it("colours the pills through the page's status classes", () => {
    // The exact class matters: it is what carries --ok / --bad from
    // Label_Checker.css, and a rename here silently drops the colour.
    render(<MarkdownReport source={buildReportMarkdown(REPORT, "x.pdf")} />);

    expect(screen.getByText("FAIL").className).toContain("lc-md-status-fail");
    expect(screen.getAllByText("PASS")[0].className).toContain("lc-md-status-pass");
  });

  it("marks the failing row so it is scannable down the page", () => {
    const { container } = render(
      <MarkdownReport source={buildReportMarkdown(REPORT, "x.pdf")} />,
    );

    expect(container.querySelectorAll(".lc-md-item.is-fail")).toHaveLength(1);
  });

  it("renders rule names in bold, not as literal asterisks", () => {
    render(<MarkdownReport source="- [PASS] **Name of the food** — declared." />);

    const strong = screen.getByText("Name of the food");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("keeps an escaped asterisk as a literal character", () => {
    // An expression, not a JSX string attribute: attribute text is taken
    // literally, so `\\*` there would be a backslash AND an asterisk — which
    // is a different input than the one `buildReportMarkdown` produces.
    render(
      <MarkdownReport
        source={"- [PASS] **Footnotes** — the \\* symbol is explained."}
      />,
    );

    expect(screen.getByText(/the \* symbol is explained/)).toBeInTheDocument();
  });

  it("groups consecutive findings into one list", () => {
    const { container } = render(
      <MarkdownReport source={buildReportMarkdown(REPORT, "x.pdf")} />,
    );

    // One list per section (Failed, Passed) — not one list per item.
    expect(container.querySelectorAll(".lc-md-list")).toHaveLength(2);
    expect(container.querySelectorAll(".lc-md-item")).toHaveLength(3);
  });

  it("renders markup in a remark as text, never as HTML", () => {
    // The guarantee that keeps this component free of dangerouslySetInnerHTML.
    render(
      <MarkdownReport source="- [FAIL] **Rule** — found <img src=x onerror=alert(1)> on the label." />,
    );

    expect(
      screen.getByText(/found <img src=x onerror=alert\(1\)> on the label/),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("renders nothing but an empty container for empty source", () => {
    const { container } = render(<MarkdownReport source="" />);

    expect(container.querySelector(".lc-md")).toBeEmptyDOMElement();
  });
});
