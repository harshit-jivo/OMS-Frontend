/**
 * The label-check report: the API's shape, and the Markdown we render it as.
 *
 * The backend answers with structured JSON (one finding per rule); the page
 * shows a Markdown checklist. This module is the single conversion between
 * the two, kept out of the component so it can be tested as a pure function
 * and so the same text can be exported or copied without rendering anything.
 *
 * Why Markdown at all, when the data is already structured
 * --------------------------------------------------------
 * The report is a document a compliance reviewer forwards, pastes into an
 * email and keeps. Markdown is the form that survives all three: it renders
 * here, it is legible as plain text everywhere else, and "copy report" is one
 * line rather than a second serialiser. The structured JSON is still what
 * arrives and still what the summary counts come from — Markdown is the
 * presentation, not the source of truth.
 */

/**
 * A highlight box on the label, as fractions of the image (0..1).
 *
 * Fractions rather than pixels because the preview renders at whatever width
 * its column happens to be. Positioning with percentages means the overlay
 * needs no measurement, no resize listener and no knowledge of the image's
 * natural size — see `LabelImage`.
 */
export type Region = { x: number; y: number; width: number; height: number };

/** One rule's verdict, exactly as `legal/schemas.py:RuleFinding` sends it. */
export type Finding = {
  rule_id: string;
  rule_name: string;
  status: "PASS" | "FAIL";
  remarks: string;
  /** The label wording the model says it relied on. May be empty. */
  evidence_text?: string;
  /** Whether OCR could corroborate the finding; null when it had no opinion. */
  ocr_verified: boolean | null;
  /**
   * Where the evidence sits on the label — one box per printed line, found
   * server-side among the OCR word boxes. Empty is normal: a rule that failed
   * because a declaration is ABSENT has nothing to point at.
   */
  regions?: Region[];
};

/** True when a finding can be shown on the image. */
export const hasRegions = (finding: Finding): boolean =>
  Boolean(finding.regions?.length);

export type ReportSummary = {
  total: number;
  passed: number;
  failed: number;
  compliant: boolean;
};

/** The `/api/legal/upload/` response. */
export type LabelReport = {
  success?: boolean;
  file?: string;
  image_url?: string;
  findings?: Finding[];
  summary?: ReportSummary;
  ocr_available?: boolean;
  rule_count?: number;
};

/** Counts recomputed client-side when an older payload carries no summary. */
export const summarise = (findings: Finding[]): ReportSummary => {
  const failed = findings.filter((finding) => finding.status === "FAIL").length;
  return {
    total: findings.length,
    passed: findings.length - failed,
    failed,
    compliant: findings.length > 0 && failed === 0,
  };
};

/**
 * Escape the characters our Markdown subset gives meaning to.
 *
 * `remarks` is model-written prose and routinely contains asterisks (it quotes
 * label footnotes) and leading hyphens. Without this, a remark that happens to
 * start with "- " would be parsed back as a new checklist item and silently
 * split one finding into two.
 */
const escapeInline = (text: string): string =>
  text.replace(/([*_`])/g, "\\$1").replace(/\r?\n+/g, " ").trim();

/**
 * The report as Markdown.
 *
 * The checklist uses `- [PASS] ` / `- [FAIL] ` markers rather than encoding
 * the verdict in prose. It is a real Markdown convention (the task-list
 * `- [x]`), it stays readable when the text is pasted somewhere with no
 * renderer, and it gives `MarkdownReport` something unambiguous to colour —
 * parsing a status back out of an em-dashed sentence would break the first
 * time a remark contained an em dash.
 */
export const buildReportMarkdown = (
  report: LabelReport,
  fileLabel: string,
): string => {
  const findings = report.findings ?? [];
  const summary = report.summary ?? summarise(findings);
  const failures = findings.filter((finding) => finding.status === "FAIL");
  const passes = findings.filter((finding) => finding.status === "PASS");

  const line = (finding: Finding): string => {
    const verified =
      finding.ocr_verified === true
        ? " *(OCR verified)*"
        : finding.ocr_verified === false
          ? " *(not found by OCR)*"
          : "";
    return `- [${finding.status}] **${escapeInline(finding.rule_name)}**${verified} — ${escapeInline(finding.remarks)}`;
  };

  const parts: string[] = [
    "# Label compliance report",
    "",
    `**File:** ${escapeInline(fileLabel)}`,
    `**Rules checked:** ${summary.total}`,
    `**Passed:** ${summary.passed}  ·  **Failed:** ${summary.failed}`,
    `**Verdict:** ${summary.compliant ? "Compliant — every rule passed" : `Not compliant — ${summary.failed} rule${summary.failed === 1 ? "" : "s"} failed`}`,
  ];

  // Said plainly rather than left to a footnote: a report produced without the
  // deterministic half is a weaker answer, and the reader should know which
  // kind they are holding.
  if (report.ocr_available === false) {
    parts.push(
      "",
      "*OCR was unavailable on the server, so no finding could be cross-checked against the text printed on the label. These verdicts come from the AI review alone.*",
    );
  }

  if (failures.length) {
    parts.push("", `## Failed (${failures.length})`, "", ...failures.map(line));
  }
  if (passes.length) {
    parts.push("", `## Passed (${passes.length})`, "", ...passes.map(line));
  }
  if (!findings.length) {
    parts.push("", "No rules were checked against this label.");
  }

  return `${parts.join("\n")}\n`;
};
