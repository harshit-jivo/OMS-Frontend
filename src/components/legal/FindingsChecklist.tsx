import { HiCheckCircle, HiExclamationTriangle, HiMapPin } from "react-icons/hi2";

import { cn } from "@/lib/utils";
import { hasRegions, type Finding } from "./labelReport";

/**
 * The findings, as a checklist wired to the label image.
 *
 * Why this exists alongside `MarkdownReport`
 * ------------------------------------------
 * The Markdown report is the artifact a reviewer copies, downloads and emails;
 * it is a document, and a document cannot be clicked. Highlighting needs the
 * structured findings — a stable `rule_id` per row to select, and the regions
 * attached to it. Encoding that back into Markdown so one component could do
 * both would mean putting ids into the text people paste into emails.
 *
 * So: this renders on screen, `buildReportMarkdown` renders for export, and
 * both read the same `findings` array. The page offers the plain-text view as
 * a tab, which is also a preview of exactly what Copy gives you.
 *
 * Failures are numbered, and the numbers match the markers drawn on the label.
 *
 * ── On the conversion ─────────────────────────────────────────────────────
 * The row keeps the inset left rule it always had — 2px of colour down the
 * leading edge, red for a failure and blue for the selected row — because
 * that stripe is what lets a reviewer scan a column of thirty rows and find
 * the three that matter. It is an inset `box-shadow`, not a border, so it does
 * not move the text: see `shadow-[inset_2px_0_0_…]` below.
 *
 * The red is the literal #dc2626 the label overlay uses rather than
 * `--color-bad` (#991b1b), so the stripe on a row and the box on the image are
 * unmistakably the same colour. See the note in `LabelImage.tsx`.
 */

type Props = {
  findings: Finding[];
  activeId: string | null;
  onSelect: (ruleId: string) => void;
};

export default function FindingsChecklist({ findings, activeId, onSelect }: Props) {
  const failures = findings.filter((finding) => finding.status === "FAIL");
  const passes = findings.filter((finding) => finding.status === "PASS");
  const numberOf = new Map(failures.map((finding, index) => [finding.rule_id, index + 1]));

  const row = (finding: Finding) => {
    const active = finding.rule_id === activeId;
    const failed = finding.status === "FAIL";
    const locatable = hasRegions(finding);

    return (
      <li key={finding.rule_id} className="[&:last-child>button]:border-b-0">
        <button
          type="button"
          className={cn(
            // Preflight is not imported: without this the row renders as a
            // grey 1997 toolbar button (DESIGN_SYSTEM §1.1).
            "appearance-none [font-family:inherit] cursor-pointer",
            "flex w-full items-start gap-2.5 border-0 border-b-[0.5px] border-line",
            "rounded-md bg-transparent px-2 py-[11px] text-left",
            "hover:bg-surface",
            failed && "shadow-[inset_2px_0_0_#dc2626]",
            active && !failed && "bg-[#f8fbff] shadow-[inset_2px_0_0_var(--color-brand)]",
            active && failed && "bg-danger-soft shadow-[inset_2px_0_0_#dc2626]",
          )}
          aria-pressed={active}
          onClick={() => onSelect(finding.rule_id)}
        >
          {/* The marker carries the number that is drawn on the label. */}
          <span
            className={cn(
              "mt-px grid size-5 flex-none place-items-center rounded-full text-[12px] font-semibold",
              failed ? "bg-[#dc2626] text-white" : "bg-transparent text-[#16a34a] [&_svg]:size-4",
            )}
            aria-hidden="true"
          >
            {failed ? numberOf.get(finding.rule_id) : <HiCheckCircle />}
          </span>

          <span className="flex min-w-0 flex-col gap-[3px]">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-[15.5px] font-medium text-ink-soft">
                {finding.rule_name}
              </strong>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                  failed
                    ? "bg-danger-soft text-[#b91c1c]"
                    : "bg-ok-soft text-[#15803d]",
                )}
              >
                {finding.status}
              </span>
              {locatable ? (
                <span className="inline-flex text-subtle [&_svg]:size-[13px]" title="Shown on the label">
                  <HiMapPin aria-hidden="true" />
                  <span className="sr-only">Shown on the label</span>
                </span>
              ) : null}
            </span>

            <span className="text-[15px] leading-relaxed text-body">{finding.remarks}</span>

            {/* The quotation is what the box on the image points at, so it is
                worth showing: it lets a reviewer check the highlight is on the
                right words without hunting for them. */}
            {finding.evidence_text ? (
              <span className="text-[14.5px] italic text-ink/75">“{finding.evidence_text}”</span>
            ) : null}

            {/* Only said for failures. On a pass, "not on the label" is not a
                useful remark; on a failure it explains why there is no box. */}
            {failed && !locatable ? (
              <span className="text-[14px] leading-normal text-subtle">
                Nothing to highlight — this failed because the declaration is
                absent, or the wording could not be found in the label text.
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div>
      {failures.length > 0 && (
        <>
          <h3 className="m-0 mb-1.5 flex items-center gap-1.5 text-[16px] font-medium text-ink">
            <HiExclamationTriangle aria-hidden="true" className="text-[#dc2626]" /> Failed (
            {failures.length})
          </h3>
          <ul className="m-0 mb-1 list-none p-0">{failures.map(row)}</ul>
        </>
      )}

      {passes.length > 0 && (
        <>
          <h3 className="m-0 mb-1.5 mt-4 text-[16px] font-medium text-ink">
            Passed ({passes.length})
          </h3>
          <ul className="m-0 mb-1 list-none p-0">{passes.map(row)}</ul>
        </>
      )}

      {findings.length === 0 && (
        <p className="m-0 text-[15px] text-body">No rules were checked against this label.</p>
      )}
    </div>
  );
}
