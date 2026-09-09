import { cn } from "@/lib/utils";
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
 * arithmetic, correctly, for free. The wrapper is `w-fit` so it hugs the image
 * rather than the column, which is what keeps the boxes aligned when the image
 * is narrower than the pane.
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
 *
 * ── On the conversion ─────────────────────────────────────────────────────
 * THE OVERLAY COLOURS ARE LITERAL rgba, NOT TOKENS, AND THAT IS DELIBERATE.
 *
 * These boxes sit ON PHOTOGRAPHY. Their fills were tuned against printed
 * artwork — 14% red is dense enough to find and thin enough to read the words
 * underneath, and the 7% green wash exists precisely so twenty of them stay
 * background. `--color-bad` is #991b1b, a different, darker red from the
 * #dc2626 these were drawn with, and swapping it in would change what a
 * reviewer sees over a label without changing anything the design system is
 * actually for. Everything that is chrome rather than overlay does use tokens.
 */

/** Fill, border and selection treatment per verdict. */
const REGION_TONE = {
  FAIL: {
    base: "border-2 border-[#dc2626] bg-[rgba(220,38,38,0.14)]",
    hover: "hover:bg-[rgba(220,38,38,0.24)]",
    active: "bg-[rgba(220,38,38,0.26)] shadow-[0_0_0_3px_rgba(220,38,38,0.25)]",
  },
  /* Passes are confirmation, not alarm: a hairline and a wash, so twenty of
     them read as background while three failures still carry the eye. */
  PASS: {
    base: "border border-[rgba(22,163,74,0.55)] bg-[rgba(22,163,74,0.07)]",
    hover: "hover:bg-[rgba(22,163,74,0.22)]",
    active: "bg-[rgba(22,163,74,0.24)] shadow-[0_0_0_3px_rgba(22,163,74,0.25)]",
  },
} as const;

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
      (finding.status === "FAIL" || showPasses || finding.rule_id === activeId),
  );

  return (
    <div className="relative mx-auto block w-fit max-w-full">
      <img
        className="block h-auto w-full rounded-[9px] border-[0.5px] border-line bg-surface"
        src={src}
        alt={alt}
      />

      {shown.map((finding) =>
        (finding.regions ?? []).map((region, index) => {
          const active = finding.rule_id === activeId;
          const number = numberOf.get(finding.rule_id);
          const tone = REGION_TONE[finding.status];
          return (
            <button
              type="button"
              key={`${finding.rule_id}-${index}`}
              className={cn(
                // The form-control reset. Preflight is not imported, so a bare
                // <button> keeps the UA's `border: 2px outset` and grey
                // `buttonface` — which over a photograph would be 20 grey
                // slabs covering the label.
                "appearance-none [font-family:inherit] cursor-pointer",
                "absolute rounded-[3px] p-0 transition-[background-color,box-shadow] duration-100",
                // Boxes must survive printing — a printed report with no marks
                // loses the point — but browsers drop backgrounds by default.
                "print:[print-color-adjust:exact] print:[-webkit-print-color-adjust:exact]",
                tone.base,
                tone.hover,
                // The selected box lifts off the label rather than merely
                // darkening: at a glance, one box should be obviously the one
                // being read about.
                active && tone.active,
              )}
              // Data attributes, not class names, are what the tests assert
              // on. The emphasis is now four utilities rather than one
              // `is-active`, and a test that greps a class string for it would
              // break on any restyle while telling you nothing about whether
              // the box is actually emphasised.
              data-status={finding.status}
              data-active={active || undefined}
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
                  two-line quotation would look like two separate failures.
                  The number sits OUTSIDE the box, top-left, so it never covers
                  the very text the box is drawing attention to. */}
              {index === 0 && number ? (
                <span
                  className="absolute -left-[9px] -top-[9px] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#dc2626] px-1 text-[11px] font-semibold leading-none text-white"
                  aria-hidden="true"
                >
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
