import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { saveAs } from "file-saver";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineArrowUpTray,
  HiOutlineBeaker,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocument,
  HiOutlineExclamationTriangle,
  HiOutlineInformationCircle,
  HiOutlineShieldCheck,
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
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  FilterActions,
  FilterBar,
  FilterSelect,
  FilterSpacer,
} from "@/components/ui/filter-bar";
import { Card, Notice, Page, PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/utils";

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
      className="sr-only"
      onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
    />
  );

  if (!file) {
    return (
      <Page>
        {fileInput}
        <Breadcrumbs items={[{ label: "Legal" }, { label: "Label Checker" }]} />

        <PageHeader
          title="Label Checker"
          description="Upload a label and it is checked against your compliance rules — the printed text is read first, then reviewed, then the two are compared."
        />

        {error ? (
          <Notice tone="bad" title="Could not use that file">
            {error}
          </Notice>
        ) : null}

        <Card>
          {/*
            The drop zone. A `div` with a button role rather than a real
            `<button>`, because a button cannot legally contain the block
            content this needs — but it therefore has to carry the keyboard
            handling itself, which is what the `onKeyDown` below is for.
          */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose a label file to check"
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
            className={cn(
              "flex cursor-pointer flex-col items-center gap-3 rounded-md px-6 py-14 text-center",
              "border-2 border-dashed transition-colors",
              "focus-visible:outline-none focus-visible:shadow-focus",
              dragging
                ? "border-brand bg-brand-soft"
                : "border-line-strong bg-surface hover:border-brand hover:bg-brand-soft/40",
            )}
          >
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand"
            >
              <HiOutlineArrowUpTray className="size-6" />
            </span>
            <p className="text-[15px] font-semibold text-ink">
              Drop your label here, or click to browse
            </p>
            <p className="text-[12.5px] text-subtle">
              PDF, PNG, JPEG or WebP · up to 20 MB
            </p>
          </div>
        </Card>
      </Page>
    );
  }

  /* ── Working view ─────────────────────────────────────────────────────── */

  return (
    <Page>
      {fileInput}
      <Breadcrumbs
        items={[
          { label: "Legal" },
          { label: "Label Checker", onClick: reset },
          { label: fileLabel },
        ]}
      />

      <PageHeader
        title={fileLabel}
        description={
          [
            file ? formatBytes(file.size) : null,
            report?.rule_count ? `${report.rule_count} rules` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        badges={
          status === "done" && report ? (
            <Badge tone={summary.compliant ? "ok" : "bad"}>
              {summary.compliant ? "Compliant" : `${summary.failed} failed`}
            </Badge>
          ) : null
        }
        actions={
          <>
            <Button variant="ghost" onClick={browse} disabled={isAnalysing}>
              Replace
            </Button>
            <Button
              variant="primary"
              onClick={() => void analyse()}
              disabled={isAnalysing}
            >
              {isAnalysing ? (
                <>
                  <span
                    aria-hidden="true"
                    className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  Checking…
                </>
              ) : status === "done" ? (
                <>
                  <HiOutlineArrowPath aria-hidden="true" /> Check again
                </>
              ) : (
                <>
                  <HiOutlineShieldCheck aria-hidden="true" /> Check label
                </>
              )}
            </Button>
          </>
        }
      />

      {/* The nutrition comparison is a SETTING for the check, not an action,
          so it sits in the filter bar rather than among the buttons. */}
      <FilterBar>
        <FilterSelect
          label="Compare nutrition against"
          icon={HiOutlineBeaker}
          fieldClassName="max-w-[340px] flex-none"
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
        </FilterSelect>

        {status === "done" && report ? (
          <>
            <FilterSpacer />
            <FilterActions>
              <Button variant="ghost" onClick={() => void copyReport()}>
                <HiOutlineClipboardDocument aria-hidden="true" />
                {copied ? "Copied" : "Copy report"}
              </Button>
              <Button variant="ghost" onClick={downloadReport}>
                <HiOutlineArrowDownTray aria-hidden="true" /> Download
              </Button>
              <Button variant="ghost" onClick={reset}>
                New label
              </Button>
            </FilterActions>
          </>
        ) : null}
      </FilterBar>

      {error ? (
        <Notice tone="bad" title="The check did not finish">
          {error}
        </Notice>
      ) : null}

      {/*
        THE VIEWER, converted last and deliberately.

        These two panes position highlight boxes over artwork from OCR
        coordinates, so it was a geometry change rather than a restyle — a
        percentage that lands one card-padding out is a WRONG answer, not an
        ugly one. Three things are load-bearing and none of them is a colour:

        · the split collapses to one column under 900px, and the image pane
          stops being sticky when it does — stacked, a sticky pane sits on top
          of the report it belongs beside;
        · the panes are hand-built rather than `Card`, because `Card` bakes in
          `card-hover shimmer-hover`: the lift would move the artwork under a
          cursor aiming at a 12px box, and the shimmer would sweep a highlight
          across the label itself;
        · printing flattens the split and drops the pane chrome, because a
          printed report is the artifact that leaves the building.
      */}
      <div className="grid grid-cols-1 items-start gap-2.5 min-[900px]:grid-cols-[minmax(280px,0.85fr)_minmax(360px,1.15fr)] print:grid-cols-1">
        <section
          aria-label="Uploaded label"
          className={cn(
            "rounded-xl border-[0.5px] border-line bg-card p-4",
            // The label follows the reader down the checklist. `top` clears
            // the app header; the max-height keeps a tall artwork from pushing
            // its own scrollbar off the bottom of the viewport.
            "max-h-[420px] overflow-auto",
            "min-[900px]:sticky min-[900px]:top-3 min-[900px]:max-h-[calc(100svh-96px)]",
            "print:static print:max-h-none print:overflow-visible print:border-0 print:p-0",
          )}
        >
          {imageSrc ? (
            <>
              {/* A legend, not decoration: the boxes are the page's main
                  claim, and a reviewer should not have to infer what the two
                  colours mean or why some declarations carry no box. */}
              {status === "done" && findings.length > 0 && (
                <div className="mb-2.5 flex flex-wrap items-center gap-3 text-[13px] text-body">
                  <span className="inline-flex items-center gap-1.5">
                    {/* The swatches are the literal overlay colours — see the
                        note in LabelImage.tsx. A legend in a different red
                        from the boxes it explains is not a legend. */}
                    <i
                      aria-hidden="true"
                      className="size-[11px] rounded-[3px] border border-[#dc2626] bg-[rgba(220,38,38,0.14)]"
                    />{" "}
                    {summary.failed} failed
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i
                      aria-hidden="true"
                      className="size-[11px] rounded-[3px] border border-[rgba(22,163,74,0.55)] bg-[rgba(22,163,74,0.07)]"
                    />{" "}
                    {locatedPasses} passed
                  </span>
                  <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-1.5 print:hidden">
                    <input
                      type="checkbox"
                      checked={showPasses}
                      onChange={(event) => setShowPasses(event.target.checked)}
                      className="size-[13px] m-0 accent-brand"
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
            <div className="flex flex-col items-center gap-2 rounded-[9px] bg-surface px-4 py-10 text-center text-[14px] leading-relaxed text-body">
              <HiOutlineInformationCircle aria-hidden="true" className="text-[18px]" />
              <p className="m-0">
                A PDF cannot be shown until it is rendered. Choose Check label
                and page 1 appears here alongside the findings.
              </p>
            </div>
          )}
        </section>

        {/* The report. */}
        <section
          aria-label="Compliance report"
          className="rounded-xl border-[0.5px] border-line bg-card p-4 print:border-0 print:p-0"
        >
          {status === "analysing" ? (
            <div
              className="flex flex-col items-center gap-2 px-5 py-14 text-center"
              role="status"
              aria-live="polite"
            >
              <span
                aria-hidden="true"
                className="size-[30px] rounded-full border-[3px] border-line-strong border-t-brand motion-safe:animate-spin"
              />
              <p className="m-0 max-w-[340px] text-[14.5px] leading-relaxed text-body">
                {ANALYSING_STEPS[stepIndex]}
              </p>
            </div>
          ) : status === "done" && report ? (
            <>
              <div
                className={cn(
                  "mb-2.5 flex items-start gap-2.5 rounded-[10px] border-[0.5px] p-3 text-[14.5px]",
                  summary.compliant
                    ? "border-ok-soft bg-ok-soft text-ok"
                    : "border-danger-line bg-danger-soft text-[#b91c1c]",
                  "[&>svg]:mt-px [&>svg]:size-[18px] [&>svg]:flex-none",
                )}
              >
                {summary.compliant ? (
                  <HiOutlineCheckCircle aria-hidden="true" />
                ) : (
                  <HiOutlineExclamationTriangle aria-hidden="true" />
                )}
                <div className="flex flex-col gap-0.5">
                  <strong className="font-medium">
                    {summary.compliant
                      ? "Compliant — every rule passed"
                      : `${summary.failed} of ${summary.total} rules failed`}
                  </strong>
                  <span className="text-[13px] text-body">
                    {summary.passed} passed · {summary.failed} failed
                    {report.ocr_available === false
                      ? " · OCR unavailable, AI review only"
                      : null}
                  </span>
                </div>
              </div>

              {/* Duplicated from the filter bar on purpose: on a long report
                  the toolbar has scrolled away by the time you have read
                  enough to want a copy. Hidden in print — a printed page with
                  a "Download report" button on it is noise. */}
              <div className="mb-3.5 flex flex-wrap gap-2 border-b-[0.5px] border-line pb-3.5 print:hidden">
                <Button onClick={() => void copyReport()}>
                  <HiOutlineClipboardDocument aria-hidden="true" />
                  {copied ? "Copied" : "Copy report"}
                </Button>
                <Button onClick={downloadReport}>
                  <HiOutlineArrowDownTray aria-hidden="true" /> Download report
                </Button>
                <Button onClick={reset}>New label</Button>
              </div>

              <TabList className="mb-3 print:hidden" label="Report view">
                <Tab selected={view === "report"} onClick={() => setView("report")}>
                  Report
                </Tab>
                <Tab selected={view === "text"} onClick={() => setView("text")}>
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
            <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
              <HiOutlineShieldCheck className="size-[26px] text-subtle" aria-hidden="true" />
              <h2 className="m-0 text-[17px] font-medium text-ink">Ready to check</h2>
              <p className="m-0 max-w-[340px] text-[14.5px] leading-relaxed text-body">
                Pick the item to compare nutrition against if you need that, then
                choose Check label.
              </p>
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}
