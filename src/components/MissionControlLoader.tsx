import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiCheckCircle,
  HiChevronDown,
  HiCube,
  HiExclamationTriangle,
  HiUserCircle,
  HiXMark,
} from "react-icons/hi2";
import type { SapPostState } from "../pages/SalesInvoice/useSapPost";
import { translateSapError } from "../pages/SalesInvoice/sapErrorTranslator";
import "../styles/MissionControlLoader.css";

/* ──────────────────────────────────────────────────────────────────────────
 * Invoice processing modal
 *
 * A calm, human-friendly window over the (otherwise very technical) job of
 * posting an invoice to SAP. The user never sees sessions, drafts, payloads,
 * endpoints or JSON — only a reassuring "production line" while we work, a clear
 * success, or a translated, actionable error. The real SAP work runs untouched
 * in useSapPost; this component only reflects its high-level status.
 * ────────────────────────────────────────────────────────────────────────── */

// Reassurance copy for the processing state. These deliberately do NOT map to the
// real backend steps — they simply rotate to show that work is happening.
const FACTORY_STAGES = [
  { emoji: "📦", label: "Gathering materials" },
  { emoji: "🔍", label: "Verifying inventory" },
  { emoji: "🔧", label: "Assembling your order" },
  { emoji: "📋", label: "Running quality checks" },
  { emoji: "🏭", label: "Coordinating production" },
  { emoji: "📤", label: "Preparing dispatch" },
  { emoji: "🚚", label: "Dispatch team standing by" },
];

const ROTATE_MS = 2600;

const formatMoney = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const orDash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

type Props = {
  state: SapPostState;
  /** Dismiss the modal (success acknowledged, or error closed). */
  onClose: () => void;
  /** Re-run the post from the beginning. */
  onRetry: () => void;
};

export default function MissionControlLoader({ state, onClose, onRetry }: Props) {
  const { status, logs, doc, invoiceNumber, errorMessage, rawError } = state;
  const isRunning = status === "running";
  const isSuccess = status === "success";
  const isError = status === "error";

  /* Move focus to the primary action when the run settles, and let Esc dismiss a
   * settled modal (never while a live financial transaction is in flight). */
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (isSuccess || isError) primaryRef.current?.focus();
  }, [isSuccess, isError]);

  useEffect(() => {
    if (isRunning) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isRunning, onClose]);

  const friendly = useMemo(
    () => (isError ? translateSapError(rawError || errorMessage) : null),
    [isError, rawError, errorMessage],
  );

  if (status === "idle") return null;

  const titleId = "mcl-title";
  const descId = "mcl-desc";

  return (
    <div
      className="mcl-backdrop"
      role="presentation"
      onClick={() => {
        if (!isRunning) onClose();
      }}
    >
      <section
        className={`mcl-card mcl-card-${status}`}
        role="alertdialog"
        aria-modal="true"
        aria-busy={isRunning}
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(event) => event.stopPropagation()}
      >
        {!isRunning && (
          <button type="button" className="mcl-x" aria-label="Close" onClick={onClose}>
            <HiXMark aria-hidden="true" />
          </button>
        )}

        {/* RunningStage mounts fresh on every run, so its animation always starts
            from the beginning without resetting state inside an effect. */}
        {isRunning && <RunningStage doc={doc} titleId={titleId} />}

        {/* ── Success ───────────────────────────────────────────────────── */}
        {isSuccess && (
          <div className="mcl-stage">
            <div className="mcl-badge mcl-badge-ok" aria-hidden="true">
              <HiCheckCircle />
            </div>
            <h2 id={titleId} className="mcl-title">
              Invoice created
            </h2>
            <p id={descId} className="mcl-sub" role="status">
              Your invoice has been created successfully and is ready to go.
            </p>

            <div className="mcl-invoice-chip">
              <span>Invoice number</span>
              <strong>{invoiceNumber ? `#${invoiceNumber}` : "Created"}</strong>
            </div>

            <SummaryPanel doc={doc} />

            <div className="mcl-actions">
              <button ref={primaryRef} type="button" className="mcl-btn mcl-btn-ok" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* ── Failure — swaps into the same centred area the loader used ──── */}
        {isError && friendly && (
          <div className="mcl-stage">
            <div className="mcl-badge mcl-badge-warn" aria-hidden="true">
              <HiExclamationTriangle />
            </div>
            <span className="mcl-error-banner">Production Halted</span>
            <h2 id={titleId} className="mcl-error-title">
              {friendly.title}
            </h2>

            <div id={descId} className="mcl-error-body">
              {friendly.summary && <p className="mcl-error-what">{friendly.summary}</p>}

              {friendly.facts.length > 0 && (
                <dl className="mcl-error-facts">
                  {friendly.facts.map((fact) => (
                    <div key={fact.label}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <p className="mcl-error-do">{friendly.action}</p>
              <p className="mcl-error-safe">
                {friendly.transient
                  ? "This is usually temporary — trying again often works."
                  : "No invoice was created, so it's safe to fix the details and retry."}
              </p>
            </div>

            <div className="mcl-actions">
              <button type="button" className="mcl-btn mcl-btn-ghost" onClick={onClose}>
                Close
              </button>
              <button ref={primaryRef} type="button" className="mcl-btn mcl-btn-warn" onClick={onRetry}>
                <HiArrowPath aria-hidden="true" /> Retry
              </button>
            </div>

            <TechnicalDetails rawError={rawError} errorMessage={errorMessage} logs={logs} />
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Running: the reassuring "production line" ─────────────────────────────── */

function RunningStage({ doc, titleId }: { doc: SapPostState["doc"]; titleId: string }) {
  // Rotate the reassurance stage; advance then hold on the last one (looping back
  // would read as "going backwards"). setState only ever runs in the callbacks.
  const [stageIndex, setStageIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setStageIndex((prev) => (prev < FACTORY_STAGES.length - 1 ? prev + 1 : prev)),
      ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, []);

  // Ease an indeterminate bar toward 95% — we can't know SAP's exact finish time,
  // so we approach the top and hold until the real result lands.
  const [pct, setPct] = useState(8);
  useEffect(() => {
    const timer = setInterval(
      () => setPct((prev) => (prev >= 95 ? 95 : prev + Math.max(1, Math.round((95 - prev) / 14)))),
      650,
    );
    return () => clearInterval(timer);
  }, []);

  const stage = FACTORY_STAGES[stageIndex];

  return (
    <div className="mcl-stage">
      {/* Persistent, calm status for screen readers (the rotating visual below is
          decorative and hidden from assistive tech). */}
      <p className="mcl-sr-only" role="status">
        Creating your invoice. This usually takes under a minute, please keep this window open.
      </p>

      <div className="mcl-hero" aria-hidden="true">
        <span className="mcl-hero-ring" />
        <span className="mcl-hero-ring mcl-hero-ring-2" />
        <span key={stageIndex} className="mcl-hero-emoji">
          {stage.emoji}
        </span>
      </div>

      <h2 id={titleId} className="mcl-title">
        Creating your invoice
      </h2>
      <p key={stageIndex} className="mcl-rotating" aria-hidden="true">
        {stage.label}…
      </p>


      <div className="mcl-progress">
        <div className="mcl-progress-track">
          <div className="mcl-progress-fill" style={{ width: `${pct}%` }}>
            <span className="mcl-progress-shimmer" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="mcl-rail" aria-hidden="true">
        {FACTORY_STAGES.map((_, index) => (
          <span
            key={index}
            className={`mcl-rail-dot${
              index < stageIndex ? " is-done" : index === stageIndex ? " is-active" : ""
            }`}
          />
        ))}
      </div>

      <SummaryPanel doc={doc} />

    </div>
  );
}

/* ── Business-friendly summary (no SAP terminology) ────────────────────────── */

function SummaryPanel({ doc }: { doc: SapPostState["doc"] }) {
  return (
    <dl className="mcl-summary">
      <div>
        <dt>
          <HiCube aria-hidden="true" /> Reference
        </dt>
        <dd>{orDash(doc.draftNo)}</dd>
      </div>
      <div>
        <dt>
          <HiUserCircle aria-hidden="true" /> Customer
        </dt>
        <dd className="mcl-clamp" title={orDash(doc.customer)}>
          {orDash(doc.customer)}
        </dd>
      </div>
      <div>
        <dt>
          <HiBuildingOffice2 aria-hidden="true" /> Items
        </dt>
        <dd>{doc.itemCount === null ? "…" : doc.itemCount}</dd>
      </div>
      <div className="mcl-summary-total">
        <dt>Total</dt>
        <dd>{formatMoney(doc.total)}</dd>
      </div>
    </dl>
  );
}

/* ── Opt-in technical details (collapsed by default) ───────────────────────── */

function TechnicalDetails({
  rawError,
  errorMessage,
  logs,
}: {
  rawError: string;
  errorMessage: string;
  logs: SapPostState["logs"];
}) {
  const raw = (rawError || errorMessage || "").trim();
  return (
    <details className="mcl-tech">
      <summary>
        <HiChevronDown className="mcl-tech-chevron" aria-hidden="true" />
        Show technical details
      </summary>
      <div className="mcl-tech-body">
        {raw && (
          <>
            <span className="mcl-tech-label">System response</span>
            <pre className="mcl-tech-pre">{raw}</pre>
          </>
        )}
        {logs.length > 0 && (
          <>
            <span className="mcl-tech-label">Activity</span>
            <div className="mcl-tech-log">
              {logs.map((line) => (
                <div className={`mcl-tech-line mcl-tech-${line.level}`} key={line.id}>
                  <span className="mcl-tech-time">{line.time}</span>
                  <span>{line.text}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
