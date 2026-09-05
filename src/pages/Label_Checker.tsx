import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { saveAs } from "file-saver";
import {
  HiArrowDownTray,
  HiArrowPath,
  HiArrowUpTray,
  HiCheckCircle,
  HiClipboardDocument,
  HiExclamationTriangle,
  HiInformationCircle,
  HiShieldCheck,
} from "react-icons/hi2";
import { apiFetch, apiUpload, resolveApiUrl } from "./SalesInvoice/useSalesInvoice";
import { API_ORIGIN } from "../services/apiPaths";
import MarkdownReport from "../components/legal/MarkdownReport";
import FindingsChecklist from "../components/legal/FindingsChecklist";
import LabelImage from "../components/legal/LabelImage";
import {
  buildReportMarkdown,
  summarise,
  type Finding,
  type LabelReport,
} from "../components/legal/labelReport";
import { Tab, TabList } from "@/components/ui/tabs";
import "../styles/Label_Checker.css";

/* ──────────────────────────────────────────────────────────────────────────
 * Label Checker (Legal)
 *
 * Upload a label — PDF or image — and the backend runs the hybrid pipeline
 * (Tesseract for the printed text, Gemini for the judgement, then a
 * cross-reference of one against the other) against the rules held in
 * `legal.ComplianceRule`. The page shows the label beside the report.
 *
 * What changed from the previous version
 * --------------------------------------
 * The old page rendered 19 fixed parameters into collapsible sections, tabs
 * and a confidence average — a shape that only worked because the parameter
 * list was hard-coded on both sides. Rules are rows now and there is no fixed
 * list to lay out, so the report is a checklist: one line per rule, PASS or
 * FAIL, and the model's remarks as prose.
 *
 * Side-by-side is the point. Every previous version made the reviewer scroll
 * between a finding and the artwork it was about; here the label stays in
 * view (sticky, on wide screens) while the checklist scrolls next to it.
 *
 * Failures are marked on the label itself. Those boxes are Tesseract's own
 * word measurements, not the model's guess: the model quotes the wording it
 * read, the server locates that wording among the OCR word boxes, and only a
 * quotation that is actually found gets a box. A rule that failed because a
 * declaration is ABSENT has nothing to point at, and the checklist says so
 * rather than marking somewhere plausible.
 *
 * The remarks still quote the label wording, because that is what survives a
 * copy-paste and an email — the highlight helps on screen, the prose travels.
 * ────────────────────────────────────────────────────────────────────────── */

const UPLOAD_URL = resolveApiUrl("/api/legal/upload/");
const ITEMS_URL = resolveApiUrl("/api/legal/item/");
const MAX_BYTES = 20 * 1024 * 1024;

const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*";
const ACCEPTED_EXTENSIONS = /\.(pdf|png|jpe?g|webp|bmp|tiff?)$/i;

type LegalItem = { id: number; item_name: string; created_at?: string };

const ANALYSING_STEPS = [
  "Rendering the label…",
  "Reading the printed text (OCR)…",
  "Checking it against your compliance rules…",
  "Cross-referencing the findings…",
];

const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/**
 * Absolute URL for an uploaded file.
 *
 * NOT `resolveApiUrl`: that hangs everything off `/api`, and Django serves
 * MEDIA_URL from the server root — `/media/labels/x.png` would become
 * `/api/media/labels/x.png` and 404. `API_ORIGIN` exists for exactly this
 * (its own docstring names media files as the case). An absolute URL is
 * returned untouched, so moving media to a CDN needs no change here.
 */
const mediaUrl = (path: string): string =>
  /^https?:\/\//i.test(path) ? path : `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;

const isAccepted = (file: File): boolean =>
  ACCEPTED_EXTENSIONS.test(file.name) ||
  file.type === "application/pdf" ||
  file.type.startsWith("image/");

const isPdf = (file: File): boolean =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

export default function LabelChecker() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "analysing" | "done" | "error">("idle");
  const [report, setReport] = useState<LabelReport | null>(null);
  const [error, setError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [itemId, setItemId] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"report" | "text">("report");
  const [showPasses, setShowPasses] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isAnalysing = status === "analysing";

  // A local preview of the chosen file, so the label is visible while the
  // check runs rather than only after it returns. Revoked on replacement —
  // an object URL pins the whole file in memory until it is.
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if (!file || isPdf(file)) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Reset the rotating step the moment analysing starts — during render, via
  // a previous-status identity guard rather than a setState in the effect
  // below, which only owns the interval subscription.
  const [stepResetFor, setStepResetFor] = useState(status);
  if (stepResetFor !== status) {
    setStepResetFor(status);
    if (status === "analysing") setStepIndex(0);
  }

  useEffect(() => {
    if (status !== "analysing") return;
    const timer = setInterval(
      () => setStepIndex((prev) => (prev + 1) % ANALYSING_STEPS.length),
      2500,
    );
    return () => clearInterval(timer);
  }, [status]);

  const {
    data: items = [],
    isPending: itemsLoading,
    isError: itemsError,
  } = useQuery({
    queryKey: ["legal", "items"],
    queryFn: async () => {
      const data = await apiFetch<LegalItem[]>(ITEMS_URL);
      return Array.isArray(data) ? data : [];
    },
  });

  /* ── Derived ──────────────────────────────────────────────────────────── */

  const findings = useMemo<Finding[]>(() => report?.findings ?? [], [report]);
  const summary = useMemo(
    () => report?.summary ?? summarise(findings),
    [report, findings],
  );
  const fileLabel = report?.file ? baseName(report.file) : (file?.name ?? "label");
  const markdown = useMemo(
    () => (report ? buildReportMarkdown(report, fileLabel) : ""),
    [report, fileLabel],
  );

  // What the legend counts: a passing rule with no located wording draws no
  // box, so counting all passes would promise more marks than appear.
  const locatedPasses = useMemo(
    () =>
      findings.filter(
        (finding) => finding.status === "PASS" && finding.regions?.length,
      ).length,
    [findings],
  );

  // The stored copy once the check returns (it renders a PDF's first page as
  // an image the browser can show); the local blob until then.
  const imageSrc = report?.image_url ? mediaUrl(report.image_url) : previewUrl;

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const browse = () => inputRef.current?.click();

  const pickFile = (next: File | null) => {
    setError("");
    if (!next) return;
    if (!isAccepted(next)) {
      setError("Please choose a PDF or an image (PNG, JPEG or WebP) of the label.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(`That file is ${formatBytes(next.size)}. Please upload a label under 20 MB.`);
      return;
    }
    setFile(next);
    setStatus("idle");
    setReport(null);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!isAnalysing) pickFile(event.dataTransfer.files?.[0] ?? null);
  };

  const analyse = async () => {
    if (!file) return;
    setStatus("analysing");
    setError("");
    setReport(null);
    try {
      const body = new FormData();
      body.append("label_file", file);
      // Optional: it only adds the nutrition panel to compare against.
      if (itemId) body.append("item_id", itemId);
      const data = await apiUpload<LabelReport>(UPLOAD_URL, body, "POST");
      if (!data) throw new Error("The server returned an empty response.");
      setReport(data);
      setActiveId(null);
      setStatus("done");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while checking the label.",
      );
      setStatus("error");
    }
  };

  const copyReport = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied in plenty of legitimate setups (an
      // insecure origin, a locked-down browser). Downloading is the escape
      // hatch, and it is already on screen — so say so rather than failing
      // silently or throwing a dialog at someone who just wanted a copy.
      setError("Could not copy to the clipboard. Use Download report instead.");
    }
  };

  const downloadReport = () => {
    if (!markdown) return;
    saveAs(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
      `${fileLabel.replace(/\.[^.]+$/, "")}-compliance-report.md`,
    );
  };

  const reset = () => {
    setFile(null);
    setReport(null);
    setStatus("idle");
    setError("");
  };

  /* ── Empty state ──────────────────────────────────────────────────────── */

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPTED}
      className="lc-file-input"
      onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
    />
  );

  if (!file) {
    return (
      <div className="lc-page app-page">
        {fileInput}
        <div className="lc-empty">
          <span className="lc-empty-badge">
            <HiShieldCheck aria-hidden="true" /> AI document review
          </span>
          <h1 className="lc-empty-title">Label compliance checker</h1>
          <p className="lc-empty-lead">
            Upload a label and it is checked against your compliance rules — the
            printed text is read first, then reviewed, then the two are compared.
          </p>

          <div
            className={`lc-drop${dragging ? " is-dragging" : ""}`}
            role="button"
            tabIndex={0}
            onClick={browse}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                browse();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="lc-drop-icon" aria-hidden="true">
              <HiArrowUpTray />
            </span>
            <p className="lc-drop-title">Drop your label here, or click to browse</p>
            <p className="lc-drop-hint">PDF, PNG, JPEG or WebP · up to 20 MB</p>
          </div>

          {error ? (
            <p className="lc-error" role="alert">
              <HiExclamationTriangle aria-hidden="true" />
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  /* ── Working view ─────────────────────────────────────────────────────── */

  return (
    <div className="lc-page app-page">
      {fileInput}

      <div className="lc-topbar">
        <div className="lc-file">
          <span className="lc-file-name" title={fileLabel}>
            {fileLabel}
          </span>
          <span className="lc-file-meta">
            {file ? formatBytes(file.size) : null}
            {report?.rule_count ? ` · ${report.rule_count} rules` : null}
          </span>
        </div>

        <div className="lc-actions">
          <label className="lc-select-label" htmlFor="lc-item">
            Compare nutrition against
          </label>
          <select
            id="lc-item"
            className="lc-select"
            value={itemId}
            disabled={isAnalysing || itemsLoading}
            onChange={(event) => setItemId(event.target.value)}
          >
            <option value="">
              {itemsLoading
                ? "Loading items…"
                : itemsError
                  ? "Items unavailable"
                  : "No item (skip nutrition check)"}
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.item_name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="lc-btn lc-btn-ghost"
            onClick={browse}
            disabled={isAnalysing}
          >
            Replace
          </button>
          <button
            type="button"
            className="lc-btn lc-btn-primary"
            onClick={() => void analyse()}
            disabled={isAnalysing}
          >
            {isAnalysing ? (
              <>
                <span className="lc-spinner" aria-hidden="true" /> Checking…
              </>
            ) : status === "done" ? (
              <>
                <HiArrowPath aria-hidden="true" /> Check again
              </>
            ) : (
              <>
                <HiShieldCheck aria-hidden="true" /> Check label
              </>
            )}
          </button>
        </div>
      </div>

      {error ? (
        <p className="lc-error lc-error-bar" role="alert">
          <HiExclamationTriangle aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="lc-split">
        {/* The label. Sticky on wide screens so a finding and the artwork it
            refers to are on screen together. */}
        <section className="lc-pane lc-pane-image" aria-label="Uploaded label">
          {imageSrc ? (
            <>
              {/* A legend, not decoration: the boxes are the page's main
                  claim, and a reviewer should not have to infer what the two
                  colours mean or why some declarations carry no box. */}
              {status === "done" && findings.length > 0 && (
                <div className="lc-legend">
                  <span className="lc-legend-key is-fail">
                    <i aria-hidden="true" /> {summary.failed} failed
                  </span>
                  <span className="lc-legend-key is-pass">
                    <i aria-hidden="true" /> {locatedPasses} passed
                  </span>
                  <label className="lc-legend-toggle">
                    <input
                      type="checkbox"
                      checked={showPasses}
                      onChange={(event) => setShowPasses(event.target.checked)}
                    />
                    Show passed
                  </label>
                </div>
              )}
              <LabelImage
                src={imageSrc}
                alt={`Label: ${fileLabel}`}
                findings={findings}
                activeId={activeId}
                showPasses={showPasses}
                onSelect={(ruleId) => {
                  setActiveId(ruleId);
                  setView("report");
                }}
              />
            </>
          ) : (
            <div className="lc-image-placeholder">
              <HiInformationCircle aria-hidden="true" />
              <p>
                A PDF cannot be shown until it is rendered. Choose Check label
                and page 1 appears here alongside the findings.
              </p>
            </div>
          )}
        </section>

        {/* The report. */}
        <section className="lc-pane lc-pane-report" aria-label="Compliance report">
          {status === "analysing" ? (
            <div className="lc-state" role="status" aria-live="polite">
              <span className="lc-spinner lc-spinner-lg" aria-hidden="true" />
              <p className="lc-state-text">{ANALYSING_STEPS[stepIndex]}</p>
            </div>
          ) : status === "done" && report ? (
            <>
              <div className={`lc-verdict${summary.compliant ? " is-ok" : " is-bad"}`}>
                {summary.compliant ? (
                  <HiCheckCircle aria-hidden="true" />
                ) : (
                  <HiExclamationTriangle aria-hidden="true" />
                )}
                <div>
                  <strong>
                    {summary.compliant
                      ? "Compliant — every rule passed"
                      : `${summary.failed} of ${summary.total} rules failed`}
                  </strong>
                  <span>
                    {summary.passed} passed · {summary.failed} failed
                    {report.ocr_available === false
                      ? " · OCR unavailable, AI review only"
                      : null}
                  </span>
                </div>
              </div>

              <div className="lc-report-actions">
                <button type="button" className="lc-btn lc-btn-ghost" onClick={() => void copyReport()}>
                  <HiClipboardDocument aria-hidden="true" />
                  {copied ? "Copied" : "Copy report"}
                </button>
                <button type="button" className="lc-btn lc-btn-ghost" onClick={downloadReport}>
                  <HiArrowDownTray aria-hidden="true" /> Download report
                </button>
                <button type="button" className="lc-btn lc-btn-ghost" onClick={reset}>
                  New label
                </button>
              </div>

              <TabList className="lc-tabs" label="Report view">
                <Tab
                  selected={view === "report"}
                  className={`lc-tab${view === "report" ? " is-active" : ""}`}
                  onClick={() => setView("report")}
                >
                  Report
                </Tab>
                <Tab
                  selected={view === "text"}
                  className={`lc-tab${view === "text" ? " is-active" : ""}`}
                  onClick={() => setView("text")}
                >
                  Plain text
                </Tab>
              </TabList>

              {view === "report" ? (
                <FindingsChecklist
                  findings={findings}
                  activeId={activeId}
                  // Clicking the selected row again clears it, which is the
                  // only way to put a passing rule's box away.
                  onSelect={(ruleId) =>
                    setActiveId((prev) => (prev === ruleId ? null : ruleId))
                  }
                />
              ) : (
                <MarkdownReport source={markdown} />
              )}
            </>
          ) : (
            <div className="lc-state">
              <HiShieldCheck className="lc-state-icon" aria-hidden="true" />
              <h2 className="lc-state-title">Ready to check</h2>
              <p className="lc-state-text">
                Pick the item to compare nutrition against if you need that, then
                choose Check label.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
