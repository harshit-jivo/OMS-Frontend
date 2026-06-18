import { useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiCheckCircle,
  HiCloudArrowUp,
  HiCpuChip,
  HiDocumentArrowDown,
  HiHashtag,
  HiShieldCheck,
  HiSignal,
  HiUserCircle,
  HiXCircle,
  HiXMark,
} from "react-icons/hi2";
import {
  SAP_STEPS,
  type SapPostState,
  type SapStepKey,
} from "../pages/SalesInvoice/useSapPost";
import "../styles/MissionControlLoader.css";

type TileStatus = "pending" | "active" | "done" | "error";

const STEP_ICONS: Record<SapStepKey, IconType> = {
  session: HiSignal,
  draft: HiDocumentArrowDown,
  payload: HiShieldCheck,
  post: HiCloudArrowUp,
  sap: HiCpuChip,
  invoice: HiHashtag,
};

const formatMoney = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatClock = (seconds: number) => {
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
};

const orDash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

type Props = {
  state: SapPostState;
  /** Dismiss the loader (success acknowledged, or error closed). */
  onClose: () => void;
  /** Re-run the post from the first stage. */
  onRetry: () => void;
};

export default function MissionControlLoader({ state, onClose, onRetry }: Props) {
  const { status, activeStep, failedStep, logs, doc, invoiceNumber, errorMessage } = state;
  const isRunning = status === "running";
  const isSuccess = status === "success";
  const isError = status === "error";

  const activeIndex = SAP_STEPS.findIndex((step) => step.key === activeStep);
  const failedIndex = SAP_STEPS.findIndex((step) => step.key === failedStep);

  /* Live elapsed timer — restarts whenever a fresh run begins. The start time lives
   * in a ref (assigned in the effect) so the only setState happens inside the
   * interval callback, never synchronously in the effect body. */
  const startRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    startRef.current = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 250);
    return () => clearInterval(timer);
  }, [isRunning]);

  /* Keep the log console pinned to the newest line. */
  const logEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs.length, status]);

  if (status === "idle") return null;

  const tileStatus = (stepKey: SapStepKey, index: number): TileStatus => {
    if (isError) {
      if (stepKey === failedStep) return "error";
      return index < failedIndex ? "done" : "pending";
    }
    if (isSuccess) return "done";
    if (index < activeIndex) return "done";
    if (stepKey === activeStep) return "active";
    return "pending";
  };

  const progressPct = isSuccess
    ? 100
    : isError
      ? Math.max(6, Math.round((Math.max(failedIndex, 0) / SAP_STEPS.length) * 100))
      : Math.min(94, Math.round(((Math.max(activeIndex, 0) + 0.4) / SAP_STEPS.length) * 100));

  const activeLabel = SAP_STEPS[Math.max(activeIndex, 0)]?.label ?? "Processing";
  const phaseText = isSuccess ? "Completed" : isError ? "Failed" : activeLabel;

  return (
    <div className="mcl-backdrop" role="presentation">
      <section
        className={`mcl-console mcl-console-${status}`}
        role="alertdialog"
        aria-modal="true"
        aria-busy={isRunning}
        aria-live="polite"
        aria-label="Posting invoice to SAP"
      >
        {/* Header / status bar */}
        <header className="mcl-head">
          <div className="mcl-head-id">
            <span className={`mcl-live-dot mcl-live-dot-${status}`} aria-hidden="true" />
            <div>
              <h2>SAP Transaction Monitor</h2>
              <p>Business One · Service Layer</p>
            </div>
          </div>
          <div className="mcl-head-meta">
            <span className={`mcl-phase mcl-phase-${status}`}>{phaseText}</span>
            <span className="mcl-elapsed" title="Elapsed time">
              {formatClock(elapsed)}
            </span>
            {!isRunning && (
              <button type="button" className="mcl-close" aria-label="Close" onClick={onClose}>
                <HiXMark aria-hidden="true" />
              </button>
            )}
          </div>
        </header>

        {/* Status tiles */}
        <div className="mcl-tiles" role="list" aria-label="Transaction stages">
          {SAP_STEPS.map((step, index) => {
            const tStatus = tileStatus(step.key, index);
            const Icon = tStatus === "done" ? HiCheckCircle : tStatus === "error" ? HiXCircle : STEP_ICONS[step.key];
            return (
              <div className={`mcl-tile mcl-tile-${tStatus}`} role="listitem" key={step.key}>
                <span className="mcl-tile-icon">
                  <Icon aria-hidden="true" />
                </span>
                <span className="mcl-tile-name">{step.tile}</span>
                <span className="mcl-tile-dot" aria-hidden="true" />
              </div>
            );
          })}
        </div>

        {/* Body: live log feed + transaction panel */}
        <div className="mcl-body">
          <div className="mcl-log" aria-label="Live activity log">
            <div className="mcl-log-bar">
              <span className="mcl-log-dot" />
              <span className="mcl-log-dot" />
              <span className="mcl-log-dot" />
              <span className="mcl-log-title">activity.log</span>
            </div>
            <div className="mcl-log-feed">
              {logs.map((line) => (
                <div className={`mcl-log-line mcl-log-${line.level}`} key={line.id}>
                  <span className="mcl-log-time">{line.time}</span>
                  <span className="mcl-log-glyph" aria-hidden="true">
                    {line.level === "ok" ? "✓" : line.level === "error" ? "✕" : line.level === "warn" ? "▲" : "›"}
                  </span>
                  <span className="mcl-log-text">{line.text}</span>
                </div>
              ))}
              {isRunning && (
                <div className="mcl-log-line mcl-log-active">
                  <span className="mcl-log-time" aria-hidden="true">
                    ··:··:··
                  </span>
                  <span className="mcl-log-cursor" aria-hidden="true" />
                  <span className="mcl-log-text">{activeLabel}…</span>
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          </div>

          <aside className="mcl-panel" aria-label="Transaction details">
            <span className="mcl-panel-eyebrow">Transaction</span>
            <dl className="mcl-panel-list">
              <div>
                <dt>
                  <HiDocumentArrowDown aria-hidden="true" /> Draft No.
                </dt>
                <dd>{orDash(doc.draftNo)}</dd>
              </div>
              <div>
                <dt>
                  <HiUserCircle aria-hidden="true" /> Customer
                </dt>
                <dd className="mcl-panel-clamp" title={orDash(doc.customer)}>
                  {orDash(doc.customer)}
                </dd>
              </div>
              <div>
                <dt>
                  <HiCpuChip aria-hidden="true" /> Items
                </dt>
                <dd>{doc.itemCount === null ? "…" : doc.itemCount}</dd>
              </div>
              <div>
                <dt>
                  <HiBuildingOffice2 aria-hidden="true" /> Branch
                </dt>
                <dd>{doc.branch ? doc.branch : isRunning ? "…" : "—"}</dd>
              </div>
            </dl>
            <div className="mcl-panel-total">
              <span>Total Amount</span>
              <strong>{formatMoney(doc.total)}</strong>
            </div>

            {isSuccess && (
              <div className="mcl-result mcl-result-success">
                <span className="mcl-result-label">Invoice Number</span>
                <strong className="mcl-result-value">{invoiceNumber ? `#${invoiceNumber}` : "Created"}</strong>
              </div>
            )}
            {isError && (
              <div className="mcl-result mcl-result-error">
                <span className="mcl-result-label">No invoice was created</span>
                <span className="mcl-result-hint">It is safe to retry this transaction.</span>
              </div>
            )}
          </aside>
        </div>

        {/* Footer: progress + actions */}
        <footer className="mcl-foot">
          <div className="mcl-progress-row">
            <div className={`mcl-progress-track mcl-progress-${status}`}>
              <div className="mcl-progress-fill" style={{ width: `${progressPct}%` }}>
                {isRunning && <span className="mcl-progress-shimmer" aria-hidden="true" />}
              </div>
            </div>
            <span className="mcl-progress-pct">{progressPct}%</span>
          </div>

          {isRunning && (
            <p className="mcl-foot-note">
              <span className="mcl-foot-spinner" aria-hidden="true" />
              Processing a live financial transaction — please do not refresh or close this window.
            </p>
          )}

          {isSuccess && (
            <div className="mcl-actions">
              <p className="mcl-foot-status mcl-foot-status-ok">
                <HiCheckCircle aria-hidden="true" /> Invoice posted to SAP successfully.
              </p>
              <button type="button" className="mcl-btn mcl-btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {isError && (
            <div className="mcl-actions">
              <p className="mcl-foot-status mcl-foot-status-bad" title={errorMessage}>
                <HiXCircle aria-hidden="true" /> {errorMessage}
              </p>
              <button type="button" className="mcl-btn mcl-btn-ghost" onClick={onClose}>
                Close
              </button>
              <button type="button" className="mcl-btn mcl-btn-primary" onClick={onRetry}>
                <HiArrowPath aria-hidden="true" /> Retry
              </button>
            </div>
          )}
        </footer>
      </section>
    </div>
  );
}
