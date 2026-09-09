/**
 * The "preparing draft" screen shown while the SAP post is in flight.
 *
 * Deliberately theatrical: the call takes ~30 seconds and the steps below are
 * an honest description of what the server is doing, so the wait reads as
 * progress rather than as a hang. Nothing here reports real server state —
 * the progress bar eases to 95% and WAITS, because the completion time is not
 * knowable, and a bar that sat at 100% while nothing happened would be a lie.
 */
import { useEffect, useMemo, useState } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineCube,
  HiOutlineHome,
  HiOutlineShoppingCart,
  HiOutlineTruck,
} from "react-icons/hi2";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Checking connection", icon: HiOutlineCube },
  { label: "Examining stock availability", icon: HiOutlineShoppingCart },
  { label: "Collecting all the fields", icon: HiOutlineHome },
  { label: "Finalising draft", icon: HiOutlineTruck },
];

const STATUS_MESSAGES = [
  "Checking available stock…",
  "Validating dispatch items…",
  "Creating draft entry…",
  "Syncing with warehouse…",
  "Almost done…",
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

  // Auto-advance the workflow steps until the last, which stays active while
  // the long-running API call resolves.
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
      setAutoProgress((prev) =>
        prev >= 95 ? 95 : prev + Math.max(1, Math.round((95 - prev) / 12)),
      );
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

  const activeStep = isStepControlled
    ? Math.min(Math.max(currentStep, 0), STEPS.length - 1)
    : autoStep;
  const pct = Math.round(
    isProgressControlled ? Math.min(Math.max(progress, 0), 100) : autoProgress,
  );
  const message = isMessageControlled ? statusMessage : STATUS_MESSAGES[messageIndex];

  const summaryRows = useMemo(
    () => [
      { label: "Total items", value: orDash(summary?.totalItems) },
      { label: "Selected station", value: orDash(summary?.selectedStation) },
      { label: "Estimated time", value: orDash(summary?.estimatedTime) },
    ],
    [summary],
  );

  return (
    <Dialog open={isOpen}>
      {isOpen && (
        <DialogContent
          title="Preparing dispatch draft"
          size="lg"
          // No close button and no dismiss: the post is in flight, and letting
          // someone close this would leave them on a page that looks idle
          // while SAP is still writing.
          showClose={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          aria-busy="true"
        >
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <DialogTitle>Preparing dispatch draft</DialogTitle>
              <DialogDescription>
                Validating inventory and creating your dispatch.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
            <div className="space-y-4">
              <ol className="m-0 list-none space-y-1.5 p-0">
                {STEPS.map((step, index) => {
                  const Icon = step.icon;
                  const done = index < activeStep;
                  const active = index === activeStep;

                  return (
                    <li
                      key={step.label}
                      className={cn(
                        "flex items-center gap-2.5 rounded-sm border px-3 py-2 text-[13px] transition-colors",
                        done && "border-ok/30 bg-ok-soft text-ok",
                        active && "border-brand-line bg-brand-soft text-brand",
                        !done && !active && "border-line bg-surface text-subtle",
                      )}
                    >
                      <span className="shrink-0 text-[15px]">
                        {done ? <HiOutlineCheckCircle /> : <Icon />}
                      </span>
                      <span className="flex-1 font-medium">{step.label}</span>
                      {done && <span className="text-[11px] font-semibold">Done</span>}
                    </li>
                  );
                })}
              </ol>

              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-strong"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Draft progress"
                  >
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
                      style={{ width: pct + "%" }}
                    />
                  </div>
                  <span className="w-10 text-right text-[12px] font-semibold tabular-nums text-ink">
                    {pct}%
                  </span>
                </div>

                <p className="m-0 text-[12.5px] text-body" aria-live="polite">
                  {message}
                </p>
                <p className="m-0 text-[11.5px] text-subtle">
                  Please do not refresh or close this window.
                </p>
              </div>
            </div>

            <aside
              className="rounded-sm border border-line bg-surface p-3"
              aria-label="Draft summary"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                Draft summary
              </span>
              <dl className="m-0 mt-2 space-y-2">
                {summaryRows.map((row) => (
                  <div key={row.label}>
                    <dt className="text-[11px] text-subtle">{row.label}</dt>
                    <dd className="m-0 text-[13px] font-semibold text-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
