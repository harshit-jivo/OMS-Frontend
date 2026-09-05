import { HiCheckCircle, HiExclamationTriangle, HiMapPin } from "react-icons/hi2";

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
      <li key={finding.rule_id}>
        <button
          type="button"
          className={`lc-finding is-${finding.status.toLowerCase()}${active ? " is-active" : ""}`}
          aria-pressed={active}
          onClick={() => onSelect(finding.rule_id)}
        >
          <span className="lc-finding-mark" aria-hidden="true">
            {failed ? (
              numberOf.get(finding.rule_id)
            ) : (
              <HiCheckCircle />
            )}
          </span>

          <span className="lc-finding-body">
            <span className="lc-finding-head">
              <strong>{finding.rule_name}</strong>
              <span className={`lc-md-status lc-md-status-${finding.status.toLowerCase()}`}>
                {finding.status}
              </span>
              {locatable ? (
                <span className="lc-finding-pin" title="Shown on the label">
                  <HiMapPin aria-hidden="true" />
                  <span className="sr-only">Shown on the label</span>
                </span>
              ) : null}
            </span>

            <span className="lc-finding-remarks">{finding.remarks}</span>

            {/* The quotation is what the box on the image points at, so it is
                worth showing: it lets a reviewer check the highlight is on the
                right words without hunting for them. */}
            {finding.evidence_text ? (
              <span className="lc-finding-quote">“{finding.evidence_text}”</span>
            ) : null}

            {/* Only said for failures. On a pass, "not on the label" is not a
                useful remark; on a failure it explains why there is no box. */}
            {failed && !locatable ? (
              <span className="lc-finding-note">
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
    <div className="lc-findings">
      {failures.length > 0 && (
        <>
          <h3 className="lc-md-h2">
            <HiExclamationTriangle aria-hidden="true" /> Failed ({failures.length})
          </h3>
          <ul className="lc-finding-list">{failures.map(row)}</ul>
        </>
      )}

      {passes.length > 0 && (
        <>
          <h3 className="lc-md-h2">Passed ({passes.length})</h3>
          <ul className="lc-finding-list">{passes.map(row)}</ul>
        </>
      )}

      {findings.length === 0 && (
        <p className="lc-md-p">No rules were checked against this label.</p>
      )}
    </div>
  );
}
