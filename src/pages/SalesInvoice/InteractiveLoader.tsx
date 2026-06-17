import { useEffect, useMemo, useState } from "react";
import { HiCheckCircle, HiCube, HiShoppingCart, HiTruck, HiHome } from "react-icons/hi2";
import "../../styles/InteractiveLoader.css";

const STEPS = [
  { label: "Collecting inventory", icon: HiCube },
  { label: "Adding them to cart", icon: HiShoppingCart },
  { label: "Docking on the station", icon: HiHome },
  { label: "Loading dispatch", icon: HiTruck },
];

const STATUS_MESSAGES = [
  "Checking available stock...",
  "Validating dispatch items...",
  "Creating draft entry...",
  "Syncing with warehouse...",
  "Almost done...",
];

export type DraftSummary = {
  totalItems?: number | string;
  selectedStation?: string;
  dispatchType?: string;
  estimatedTime?: string;
};

export type InteractiveLoaderProps = {
  /** Controls visibility. Defaults to true so existing `{cond && <InteractiveLoader/>}` usage still works. */
  isOpen?: boolean;
  /** Optional controlled active step (0-based). When omitted the loader auto-advances. */
  currentStep?: number;
  /** Optional controlled progress percentage (0-100). When omitted it animates on its own. */
  progress?: number;
  /** Right-side draft summary details. */
  summary?: DraftSummary;
  /** Optional controlled status message. When omitted, messages rotate automatically. */
  statusMessage?: string;
};

const orDash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

export default function InteractiveLoader({
  isOpen = true,
  currentStep,
  progress,
  summary,
  statusMessage,
}: InteractiveLoaderProps) {
  const [autoStep, setAutoStep] = useState(0);
  const [autoProgress, setAutoProgress] = useState(8);
  const [messageIndex, setMessageIndex] = useState(0);

  const isStepControlled = currentStep !== undefined;
  const isProgressControlled = progress !== undefined;
  const isMessageControlled = statusMessage !== undefined;

  // Auto-advance the workflow steps until the last ("Loading dispatch"), which
  // stays active while the long-running API call resolves.
  useEffect(() => {
    if (!isOpen || isStepControlled) return;
    const timer = setInterval(() => {
      setAutoStep((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 1300);
    return () => clearInterval(timer);
  }, [isOpen, isStepControlled]);

  // Ease the progress bar upward and hold near the top — we can't know the exact
  // completion time of the API, so we approach 95% and wait.
  useEffect(() => {
    if (!isOpen || isProgressControlled) return;
    const timer = setInterval(() => {
      setAutoProgress((prev) => (prev >= 95 ? 95 : prev + Math.max(1, Math.round((95 - prev) / 12))));
    }, 600);
    return () => clearInterval(timer);
  }, [isOpen, isProgressControlled]);

  // Rotate the live status message.
  useEffect(() => {
    if (!isOpen || isMessageControlled) return;
    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [isOpen, isMessageControlled]);

  const activeStep = isStepControlled ? Math.min(Math.max(currentStep, 0), STEPS.length - 1) : autoStep;
  const pct = Math.round(
    isProgressControlled ? Math.min(Math.max(progress, 0), 100) : autoProgress,
  );
  const message = isMessageControlled ? statusMessage : STATUS_MESSAGES[messageIndex];

  const summaryRows = useMemo(
    () => [
      { label: "Total Items", value: orDash(summary?.totalItems) },
      { label: "Selected Station", value: orDash(summary?.selectedStation) },
      // { label: "Dispatch Type", value: orDash(summary?.dispatchType) },
      { label: "Estimated Time", value: orDash(summary?.estimatedTime) },
    ],
    [summary],
  );

  if (!isOpen) return null;

  return (
    <div className="si-modal-backdrop si-loader-backdrop" role="presentation">
      <section className="si-loader-modal" role="alert" aria-busy="true" aria-live="polite">
        {/* Main column */}
        <div className="si-loader-main">
          <header className="si-loader-head">
            <h2>Preparing Dispatch Draft</h2>
            <p>Please wait while we validate inventory and create your dispatch.</p>
          </header>

          <div className="si-loader-animation">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              let statusClass = "is-pending";
              if (index < activeStep) statusClass = "is-complete";
              else if (index === activeStep) statusClass = "is-active";

              return (
                <div key={step.label} className={`si-loader-step ${statusClass}`}>
                  <span className="si-loader-step-icon">
                    {index < activeStep ? <HiCheckCircle /> : <Icon />}
                  </span>
                  <span className="si-loader-step-label">{step.label}</span>
                  {index < activeStep && <span className="si-loader-step-done">Done</span>}
                </div>
              );
            })}
          </div>

          <div className="si-loader-footer">
            <div className="si-loader-progress-row">
              <div className="si-loader-progress-bar">
                <div className="si-loader-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="si-loader-progress-pct">{pct}%</span>
            </div>

            <p className="si-loader-message">
              <span className="si-loader-spinner" aria-hidden="true" />
              <span>{message}</span>
            </p>

            <p className="si-loader-helper">Please do not refresh or close this window.</p>
          </div>
        </div>

        {/* Right-side info panel */}
        <aside className="si-loader-panel" aria-label="Draft summary">
          <span className="si-loader-panel-eyebrow">Draft Summary</span>
          <dl className="si-loader-panel-list">
            {summaryRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </section>
    </div>
  );
}
