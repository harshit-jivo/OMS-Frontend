import { useEffect, useMemo, useState } from "react";
import {
  HiArrowLeft,
  HiCheckCircle,
  HiClock,
  HiExclamationCircle,
  HiExclamationTriangle,
} from "react-icons/hi2";

import {
  legalService,
  ruleErrorMessage,
  type LabelCheckSummary,
} from "../services/legalService";
import { API_ORIGIN } from "../services/apiPaths";
import FindingsChecklist from "../components/legal/FindingsChecklist";
import LabelImage from "../components/legal/LabelImage";
import MarkdownReport from "../components/legal/MarkdownReport";
import {
  buildReportMarkdown,
  summarise,
  type Finding,
  type LabelReport,
} from "../components/legal/labelReport";
import "../styles/Order_Flow_Settings.css";
import "../styles/Label_Checker.css";
import "../styles/Compliance_Rules.css";

/**
 * Label check history — every check that has been run, reopenable.
 *
 * The checks were always stored; nothing could open them. That is a real gap
 * rather than a convenience one: a compliance report is a record of what was
 * reviewed and when, and a record that can be seen only once is not a record.
 *
 * Reopening shows the report AS IT WAS — the same findings, the same
 * highlight boxes, because the regions were stored with the report. The
 * locator has changed twice since the first checks were run, and a record
 * that silently re-derived itself against today's code would be a different
 * document with the same date on it.
 *
 * The detail view reuses `LabelImage`, `FindingsChecklist` and
 * `MarkdownReport` unchanged. A past report and a fresh one are the same
 * thing; rendering them with different code would let them drift.
 */

const mediaUrl = (path: string): string =>
  !path
    ? ""
    : /^https?:\/\//i.test(path)
      ? path
      : `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

type Detail = LabelReport & {
  id: number;
  file_name?: string;
  uploaded_at?: string;
  checked_by_name?: string;
  item_name?: string;
};

export default function LabelHistory() {
  const [rows, setRows] = useState<LabelCheckSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [failedOnly, setFailedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"report" | "text">("report");
  const [showPasses, setShowPasses] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await legalService.listChecks({ page, failedOnly });
        if (cancelled) return;
        setRows(data.results);
        setTotalPages(data.pagination.total_pages);
        setTotal(data.pagination.total);
      } catch (e) {
        if (!cancelled) {
          setError(
            ruleErrorMessage(
              e,
              "Could not load the check history. If the server has not run " +
                "manage.py migrate legal yet, this is expected.",
            ),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, failedOnly]);

  async function open(id: number) {
    setOpenId(id);
    setDetailLoading(true);
    setActiveId(null);
    setError("");
    try {
      const data = (await legalService.getCheck(id)) as Detail;
      setDetail(data);
    } catch (e) {
      setError(ruleErrorMessage(e, "Could not open that check."));
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const findings = useMemo<Finding[]>(() => detail?.findings ?? [], [detail]);
  const summary = useMemo(
    () => detail?.summary ?? summarise(findings),
    [detail, findings],
  );
  const markdown = useMemo(
    () => (detail ? buildReportMarkdown(detail, detail.file_name ?? "label") : ""),
    [detail],
  );
  const locatedPasses = findings.filter(
    (finding) => finding.status === "PASS" && finding.regions?.length,
  ).length;

  /* ── Detail ───────────────────────────────────────────────────────────── */

  if (openId !== null) {
    return (
      <div className="lc-page app-page">
        <div className="lc-topbar">
          <div className="lc-file">
            <span className="lc-file-name">{detail?.file_name ?? "Check"}</span>
            <span className="lc-file-meta">
              {detail?.uploaded_at ? formatWhen(detail.uploaded_at) : null}
              {detail?.checked_by_name ? ` · ${detail.checked_by_name}` : null}
              {detail?.item_name ? ` · ${detail.item_name}` : null}
            </span>
          </div>
          <button
            type="button"
            className="lc-btn lc-btn-ghost"
            onClick={() => {
              setOpenId(null);
              setDetail(null);
            }}
          >
            <HiArrowLeft aria-hidden="true" /> Back to history
          </button>
        </div>

        {detailLoading ? (
          <div className="lc-state" role="status" aria-live="polite">
            <span className="lc-spinner lc-spinner-lg" aria-hidden="true" />
            <p className="lc-state-text">Opening the report…</p>
          </div>
        ) : detail ? (
          <div className="lc-split">
            <section className="lc-pane lc-pane-image" aria-label="Checked label">
              {detail.image_url ? (
                <>
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
                  <LabelImage
                    src={mediaUrl(detail.image_url)}
                    alt={`Label: ${detail.file_name ?? "check"}`}
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
                  <HiClock aria-hidden="true" />
                  <p>
                    This check predates stored previews, so the artwork is not
                    available. The findings below are unaffected.
                  </p>
                </div>
              )}
            </section>

            <section className="lc-pane lc-pane-report" aria-label="Compliance report">
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
                    {detail.ocr_available === false
                      ? " · OCR unavailable, AI review only"
                      : null}
                  </span>
                </div>
              </div>

              <div className="lc-tabs" role="tablist" aria-label="Report view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "report"}
                  className={`lc-tab${view === "report" ? " is-active" : ""}`}
                  onClick={() => setView("report")}
                >
                  Report
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "text"}
                  className={`lc-tab${view === "text" ? " is-active" : ""}`}
                  onClick={() => setView("text")}
                >
                  Plain text
                </button>
              </div>

              {view === "report" ? (
                <FindingsChecklist
                  findings={findings}
                  activeId={activeId}
                  onSelect={(ruleId) =>
                    setActiveId((prev) => (prev === ruleId ? null : ruleId))
                  }
                />
              ) : (
                <MarkdownReport source={markdown} />
              )}
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  /* ── List ─────────────────────────────────────────────────────────────── */

  return (
    <div className="ofs-page">
      <div className="ofs-header">
        <div>
          <span className="ofs-kicker">Legal</span>
          <h1>
            <HiClock aria-hidden="true" /> Label Check History
          </h1>
          <p>
            Every label that has been checked, newest first. Opening one shows
            the report exactly as it was reported at the time.
          </p>
        </div>
        <label className="lc-legend-toggle">
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(event) => {
              setPage(1);
              setFailedOnly(event.target.checked);
            }}
          />
          Only checks with failures
        </label>
      </div>

      {error && (
        <div className="ofs-alert">
          <HiExclamationCircle aria-hidden="true" /> {error}
        </div>
      )}

      <section className="ofs-card ofs-card--wide">
        <div className="ofs-card-head">
          <span className="ofs-card-mark" />
          <h2>{total} check{total === 1 ? "" : "s"}</h2>
        </div>

        {loading ? (
          <div className="ofs-loading">
            <span className="ofs-spinner" />
            <span>Loading history…</span>
          </div>
        ) : rows.length === 0 ? (
          <p className="cr-hint">
            {failedOnly
              ? "No checks have failed. Untick the filter to see them all."
              : "No labels have been checked yet."}
          </p>
        ) : (
          <div className="cr-list">
            {rows.map((row) => {
              const failed = row.summary?.failed ?? 0;
              return (
                <div key={row.id} className="cr-row">
                  <button
                    type="button"
                    className="cr-row-main"
                    onClick={() => void open(row.id)}
                  >
                    <span className="cr-row-name">
                      {row.file_name}
                      <span
                        className={`lc-md-status lc-md-status-${failed ? "fail" : "pass"}`}
                      >
                        {failed ? `${failed} failed` : "Compliant"}
                      </span>
                    </span>
                    <span className="cr-row-meta">
                      {formatWhen(row.uploaded_at)}
                      {row.checked_by_name ? ` · ${row.checked_by_name}` : ""}
                      {row.item_name ? ` · ${row.item_name}` : ""}
                      {row.summary?.total ? ` · ${row.summary.total} rules` : ""}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="cr-actions">
            <button
              type="button"
              className="ofs-refresh"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="cr-hint" style={{ margin: 0 }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="ofs-refresh"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
