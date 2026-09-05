import type { Finding } from "./labelReport";

/**
 * The label, with the failing declarations marked on it.
 *
 * Every box here was measured by Tesseract: the model quotes the wording it
 * read, the server finds that wording among the OCR word boxes, and what
 * arrives is a rectangle around characters that were really on the page. The
 * model never supplies a coordinate, so a box cannot be hallucinated — the
 * worst case is a quotation that is not found, and then no box is drawn at
 * all.
 *
 * Positioning is percentage-based
 * -------------------------------
 * Regions are fractions of the image (0..1), so a box is placed with
 * `left: 32%` inside a wrapper sized to the rendered image. That means no
 * measuring, no `ResizeObserver`, no recalculation on zoom or column resize,
 * and no dependence on the image's natural size — the browser does the
 * arithmetic, correctly, for free. The wrapper is `width: fit-content` so it
 * hugs the image rather than the column, which is what keeps the boxes
 * aligned when the image is narrower than the pane.
 *
 * What is shown when
 * ------------------
 * Both verdicts are marked: red for failures, green for passes. Passes were
 * hidden at first, on the reasoning that twenty boxes at once turn the label
 * into a grid and bury the two that matter. Showing them was asked for and is
 * genuinely useful — it makes visible which declarations were FOUND and
 * checked, so a reviewer can see the checker read the whole label rather than
 * having to trust that it did.
 *
 * The original worry is answered by hierarchy rather than by hiding: failures
 * get a heavier border, a stronger fill and a number; passes get a hairline
 * and no number, so they read as background confirmation. `showPasses` still
 * turns them off for a dense label, and the selected finding is emphasised
 * over everything either way.
 */

type Props = {
  src: string;
  alt: string;
  findings: Finding[];
  /** The finding whose boxes are emphasised (a row is selected or hovered). */
  activeId?: string | null;
  /** Draw the green boxes for passing rules. Default on. */
  showPasses?: boolean;
  onSelect?: (ruleId: string) => void;
};

export default function LabelImage({
  src,
  alt,
  findings,
  activeId,
  showPasses = true,
  onSelect,
}: Props) {
  // Marker numbers count failures only, and match the numbers the checklist
  // shows — a reviewer reads "3" on the image and finds "3" in the list.
  const failures = findings.filter((finding) => finding.status === "FAIL");
  const numberOf = new Map(failures.map((finding, index) => [finding.rule_id, index + 1]));

  // A selected pass is always drawn, even with `showPasses` off — otherwise
  // clicking a row in the checklist would appear to do nothing.
  const shown = findings.filter(
    (finding) =>
      finding.regions?.length &&
      (finding.status === "FAIL" ||
        showPasses ||
        finding.rule_id === activeId),
  );

  return (
    <div className="lc-image-wrap">
      <img className="lc-label-image" src={src} alt={alt} />

      {shown.map((finding) =>
        (finding.regions ?? []).map((region, index) => {
          const active = finding.rule_id === activeId;
          const number = numberOf.get(finding.rule_id);
          return (
            <button
              type="button"
              key={`${finding.rule_id}-${index}`}
              className={`lc-region is-${finding.status.toLowerCase()}${active ? " is-active" : ""}`}
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`,
              }}
              // The box is a shortcut to the finding, not a control of its
              // own: the accessible name says which rule it belongs to.
              aria-label={`${finding.status === "FAIL" ? "Failed" : "Passed"}: ${finding.rule_name}`}
              title={finding.rule_name}
              onClick={() => onSelect?.(finding.rule_id)}
            >
              {/* Only the first box of a wrapped phrase is numbered, or a
                  two-line quotation would look like two separate failures. */}
              {index === 0 && number ? (
                <span className="lc-region-tag" aria-hidden="true">
                  {number}
                </span>
              ) : null}
            </button>
          );
        }),
      )}
    </div>
  );
}
