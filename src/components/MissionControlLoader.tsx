/* ──────────────────────────────────────────────────────────────────────────
 * Invoice processing modal
 *
 * A calm, human-friendly window over the (otherwise very technical) job of
 * posting an invoice to SAP. The user never sees sessions, drafts, payloads,
 * endpoints or JSON — only a reassuring "production line" while we work, a
 * clear success, or a translated, actionable error. The real SAP work runs
 * untouched in useSapPost; this component only reflects its high-level status.
 *
 * ── On the conversion ─────────────────────────────────────────────────────
 * This was a hand-rolled overlay behind a 791-line stylesheet: a fixed div
 * with an `onClick` to dismiss, a `stopPropagation` on the card, and a
 * `keydown` listener of its own for Escape. It is `ui/dialog` now, which
 * brings the focus trap, the scroll lock and `aria-modal` it never had, and
 * the `tw-page` reset it needed (DESIGN_SYSTEM §1.3) — the buttons inside it
 * were rendering at the 18px root size.
 *
 * The three animations utilities could not express — the pulsing halo, the
 * hero glyph's swap-and-bob, the highlight sweeping a parked progress bar —
 * are now theme tokens in `tailwind.css` (`animate-halo`, `animate-emoji`,
 * `animate-sweep`), written `motion-safe:` at every call site because all
 * three are decoration.
 *
 * One thing the stylesheet had is deliberately gone: the box-shadow heartbeat
 * on the active rail dot. The sweeping progress bar already says "still
 * working", and a second looping animation two inches away was competing with
 * it rather than adding to it.
 * ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiArrowPath,
  HiBanknotes,
  HiBuildingOffice2,
  HiCheckCircle,
  HiChevronDown,
  HiCube,
  HiDocumentText,
  HiExclamationTriangle,
  HiUserCircle,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { translateSapError } from "../pages/SalesInvoice/sapErrorTranslator";
import type { SapPostState } from "../pages/SalesInvoice/useSapPost";

// Reassurance copy for the processing state. These deliberately do NOT map to the
// real backend steps — they simply rotate to show that work is happening.
const FACTORY_STAGES = [
  { emoji: "📦", label: "Gathering materials" },
  { emoji: "🔍", label: "Verifying inventory" },
  { emoji: "🔧", label: "Assembling your order" },
  { emoji: "📋", label: "Running quality checks" },
  { emoji: "🏭", label: "Coordinating production" },
  { emoji: "📤", label: "Preparing Stock" },
  { emoji: "🚚", label: "Collecting Items" },
];

const ROTATE_MS = 2600;

const formatMoney = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const orDash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

/** The centred hero column every state shares. */
const STAGE = "flex flex-col items-center px-6 py-8 text-center";

type Props = {
  state: SapPostState;
  /** Dismiss the modal (success acknowledged, or error closed). */
  onClose: () => void;
  /** Re-run the post from the beginning. */
  onRetry: () => void;
  /**
   * When the failure is a credit-limit issue, the parent supplies this to let the
   * user raise a credit-limit request straight from the error modal. Omit (or pass
   * undefined) to hide the button for non-credit-limit errors.
   */
  onRaiseCl?: () => void;
  /**
   * Opens the invoice's bill print. Shown on the success panel only when the
   * parent supplies it (i.e. SAP gave back a document to print).
   *
   * A handler rather than a URL: the PDF endpoint needs the access token, so
   * it has to be FETCHED rather than navigated to. This component stays
   * presentational and the parent owns the request.
   */
  onOpenReport?: () => void;
};

export default function MissionControlLoader({
  state,
  onClose,
  onRetry,
  onRaiseCl,
  onOpenReport,
}: Props) {
  const { status, logs, doc, invoiceNumber, errorMessage, rawError } = state;
  const isRunning = status === "running";
  const isSuccess = status === "success";
  const isError = status === "error";

  /* Move focus to the primary action when the run settles. Radix focuses the
   * first focusable element on open, which while running is the panel itself
   * — right — but on settling would be the close corner rather than Done. */
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (isSuccess || isError) primaryRef.current?.focus();
  }, [isSuccess, isError]);

  const friendly = useMemo(
    () => (isError ? translateSapError(rawError || errorMessage) : null),
    [isError, rawError, errorMessage],
  );

  /* Nothing dismisses this while the post is in flight — not Escape, not the
   * backdrop, not a close button. A live financial transaction is running and
   * a dismissed modal would leave the page looking idle while SAP writes. */
  const blockWhileRunning = (event: { preventDefault: () => void }) => {
    if (isRunning) event.preventDefault();
  };

  return (
    <Dialog
      open={status !== "idle"}
      onOpenChange={(next) => {
        if (!next && !isRunning) onClose();
      }}
    >
      {status !== "idle" && (
        <DialogContent
          title={
            isSuccess
              ? "Invoice created"
              : isError
                ? "Invoice not created"
                : "Creating your invoice"
          }
          size="sm"
          // An alertdialog, not a dialog: it interrupts to report the outcome
          // of something the user already started.
          role="alertdialog"
          aria-busy={isRunning}
          showClose={!isRunning}
          // The heavier blur is the original's, and it is not decoration — it
          // is how the screen says "you are blocked while this posts".
          overlayClassName="backdrop-blur-[6px]"
          onEscapeKeyDown={blockWhileRunning}
          onPointerDownOutside={blockWhileRunning}
          onInteractOutside={blockWhileRunning}
          className={cn(
            "border",
            isSuccess && "border-ok/30",
            isError && "border-hold/25",
            !isSuccess && !isError && "border-line",
          )}
        >
          {/* RunningStage mounts fresh on every run, so its animation always starts
              from the beginning without resetting state inside an effect. */}
          {isRunning && <RunningStage doc={doc} />}

          {/* ── Success ───────────────────────────────────────────────────── */}
          {isSuccess && (
            <>
              <DialogBody className={STAGE}>
                <span
                  aria-hidden="true"
                  className="grid size-14 place-items-center rounded-full bg-ok-soft text-[30px] text-ok"
                >
                  <HiCheckCircle />
                </span>
                <h2 className="m-0 mt-4 text-[19px] font-bold tracking-tight text-ink">
                  Invoice created
                </h2>
                <p className="m-0 mt-1.5 text-[13.5px] text-body" role="status">
                  Your invoice has been created successfully and is ready to go.
                </p>

                <div className="mt-4 flex w-full items-center justify-between gap-3 rounded-card border border-ok/30 bg-ok-soft px-4 py-2.5">
                  <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ok">
                    Invoice number
                  </span>
                  <strong className="text-[15px] font-bold text-ink">
                    {invoiceNumber ? `#${invoiceNumber}` : "Created"}
                  </strong>
                </div>

                <SummaryPanel doc={doc} />
              </DialogBody>

              <DialogFooter>
                {onOpenReport && (
                  <Button variant="ghost" onClick={onOpenReport}>
                    <HiDocumentText aria-hidden="true" /> Generate Invoice Report
                  </Button>
                )}
                <Button ref={primaryRef} variant="success" onClick={onClose}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Failure — swaps into the same centred area the loader used ──── */}
          {isError && friendly && (
            <>
              <DialogBody className={STAGE}>
                <span
                  aria-hidden="true"
                  className="grid size-14 place-items-center rounded-full bg-hold-soft text-[30px] text-hold"
                >
                  <HiExclamationTriangle />
                </span>
                <span className="mt-4 rounded-full bg-hold-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-hold">
                  Production Halted
                </span>
                <h2 className="m-0 mt-2.5 text-[19px] font-bold tracking-tight text-ink">
                  {friendly.title}
                </h2>

                <div className="mt-3 w-full text-left">
                  {friendly.summary && (
                    <p className="m-0 text-[13.5px] text-body">{friendly.summary}</p>
                  )}

                  {friendly.facts.length > 0 && (
                    <dl className="m-0 mt-3 divide-y divide-line rounded-card border border-line bg-surface">
                      {friendly.facts.map((fact) => (
                        <div
                          key={fact.label}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                          <dt className="text-[12px] text-subtle">{fact.label}</dt>
                          <dd className="m-0 text-right text-[13px] font-semibold text-ink">
                            {fact.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  <p className="m-0 mt-3 text-[13.5px] font-semibold text-ink">
                    {friendly.action}
                  </p>
                  <p className="m-0 mt-1.5 text-[12.5px] text-subtle">
                    {friendly.transient
                      ? "This is usually temporary — trying again often works."
                      : "No invoice was created, so it's safe to fix the details and retry."}
                  </p>
                </div>

                <TechnicalDetails
                  rawError={rawError}
                  errorMessage={errorMessage}
                  logs={logs}
                />
              </DialogBody>

              <DialogFooter>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                {onRaiseCl && (
                  <Button onClick={onRaiseCl}>
                    <HiBanknotes aria-hidden="true" /> Raise CL
                  </Button>
                )}
                <Button ref={primaryRef} variant="primary" onClick={onRetry}>
                  <HiArrowPath aria-hidden="true" /> Retry
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

/* ── Running: the reassuring "production line" ─────────────────────────────── */

function RunningStage({ doc }: { doc: SapPostState["doc"] }) {
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
    <DialogBody className={STAGE}>
      {/* Persistent, calm status for screen readers (the rotating visual below is
          decorative and hidden from assistive tech). */}
      <p className="sr-only" role="status">
        Creating your invoice. This usually takes under a minute, please keep this window
        open.
      </p>

      <div className="relative grid size-24 place-items-center" aria-hidden="true">
        {/* Two halos, the second half a cycle behind, so the pulse never rests. */}
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.16),rgba(37,99,235,0)_70%)] motion-safe:animate-halo" />
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.16),rgba(37,99,235,0)_70%)] [animation-delay:1s] motion-safe:animate-halo" />
        {/* Keyed on the stage so each glyph remounts and plays its swap-in. */}
        <span
          key={stageIndex}
          className="relative grid size-[72px] place-items-center rounded-full border border-line bg-white text-[34px] leading-none shadow-[0_10px_24px_-12px_rgba(37,99,235,0.5)] motion-safe:animate-emoji"
        >
          {stage.emoji}
        </span>
      </div>

      <h2 className="m-0 mt-5 text-[19px] font-bold tracking-tight text-ink">
        Creating your invoice
      </h2>
      <p
        key={stageIndex}
        className="m-0 mt-2.5 min-h-[1.2em] text-[16px] font-bold tracking-tight text-brand motion-safe:animate-page"
        aria-hidden="true"
      >
        {stage.label}…
      </p>

      <div
        className="mt-6 h-2 w-full overflow-hidden rounded-full border border-line bg-surface-strong"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Invoice progress"
      >
        <div
          className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/55 to-transparent motion-safe:animate-sweep"
          />
        </div>
      </div>

      <div className="mt-3.5 flex gap-2" aria-hidden="true">
        {FACTORY_STAGES.map((_, index) => (
          <span
            key={index}
            className={cn(
              "size-[7px] rounded-full border transition-colors",
              index <= stageIndex ? "border-brand bg-brand" : "border-line bg-surface-strong",
              index === stageIndex && "scale-[1.35]",
            )}
          />
        ))}
      </div>

      <SummaryPanel doc={doc} />
    </DialogBody>
  );
}

/* ── Business-friendly summary (no SAP terminology) ────────────────────────── */

function SummaryPanel({ doc }: { doc: SapPostState["doc"] }) {
  const rows = [
    { icon: HiCube, label: "Reference", value: orDash(doc.draftNo), clamp: false },
    { icon: HiUserCircle, label: "Customer", value: orDash(doc.customer), clamp: true },
    {
      icon: HiBuildingOffice2,
      label: "Items",
      value: doc.itemCount === null ? "…" : String(doc.itemCount),
      clamp: false,
    },
  ];

  return (
    <dl className="m-0 mt-6 w-full divide-y divide-line rounded-card border border-line bg-surface text-left">
      {rows.map(({ icon: Icon, label, value, clamp }) => (
        <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <dt className="flex items-center gap-1.5 text-[12px] text-subtle">
            <Icon aria-hidden="true" className="text-[14px]" />
            {label}
          </dt>
          <dd
            className={cn(
              "m-0 text-right text-[13px] font-semibold text-ink",
              clamp && "max-w-[200px] truncate",
            )}
            title={clamp ? value : undefined}
          >
            {value}
          </dd>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 bg-surface-strong px-3.5 py-2.5">
        <dt className="text-[12.5px] font-semibold text-ink">Total</dt>
        <dd className="m-0 text-[15px] font-bold tabular-nums text-ink">
          {formatMoney(doc.total)}
        </dd>
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

  const tone: Record<string, string> = {
    ok: "text-ok",
    warn: "text-hold",
    error: "text-danger",
  };

  return (
    <details className="group mt-5 w-full text-left">
      <summary
        className={cn(
          // `list-none` plus the WebKit marker reset: without both, Safari and
          // Chrome each draw a disclosure triangle beside our own chevron.
          "flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-1.5",
          "text-[12.5px] font-semibold text-subtle hover:text-ink",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <HiChevronDown
          aria-hidden="true"
          className="transition-transform group-open:rotate-180"
        />
        Show technical details
      </summary>

      <div className="mt-2 space-y-3 rounded-card border border-line bg-surface p-3">
        {raw && (
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
              System response
            </span>
            <pre className="m-0 mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-white p-2.5 font-mono text-[11.5px] leading-relaxed text-body">
              {raw}
            </pre>
          </div>
        )}
        {logs.length > 0 && (
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Activity
            </span>
            <div className="mt-1.5 max-h-40 space-y-1 overflow-auto rounded-sm bg-white p-2.5 font-mono text-[11.5px]">
              {logs.map((line) => (
                <div key={line.id} className={cn("flex gap-2", tone[line.level] ?? "text-body")}>
                  <span className="shrink-0 text-subtle">{line.time}</span>
                  <span className="min-w-0 break-words">{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
