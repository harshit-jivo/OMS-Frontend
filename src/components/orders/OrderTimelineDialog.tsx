import * as React from "react";
import {
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineXMark,
} from "react-icons/hi2";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Order, OrderLog } from "@/services/ordersService";
import {
  buildOrderTimelineLogs,
  getOrderLogDisplayRemark,
  getOrderLogDisplayTitle,
  getOrderLogTone,
} from "@/utils/orderTrackingTimeline";

/**
 * An order's history, as a timeline.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FIVE COPIES, ONE OF THEM SUBTLY DIFFERENT
 * ─────────────────────────────────────────────────────────────────────────
 * `Auditor_Order`, `Billing_Order`, `Rate_Approver_Order`,
 * `Order_Status_Tracking` and `Order_Tracking` all opened this dialog, each
 * with its own markup and its own `.xx-track-*` block in its own stylesheet.
 * The logic was already shared (`utils/orderTrackingTimeline.ts`); only the
 * drawing was not, which is the worst way round — five renderings of one
 * computed truth.
 *
 * The tones come from `getOrderLogTone`, which returns four values. The
 * mapping here is the only place they become colours, so a fifth tone added
 * upstream shows as the neutral fallback rather than as an unstyled dot.
 */

const TONE: Record<string, { dot: string; card: string; icon: typeof HiOutlineCheck }> = {
  approved: {
    dot: "bg-ok-soft text-ok",
    card: "border-ok/25 bg-ok-soft/40",
    icon: HiOutlineCheck,
  },
  rejected: {
    dot: "bg-bad-soft text-bad",
    card: "border-bad/25 bg-bad-soft/40",
    icon: HiOutlineXMark,
  },
  pending: {
    dot: "bg-surface-strong text-subtle",
    card: "border-line bg-surface",
    icon: HiOutlineClock,
  },
  progress: {
    dot: "bg-brand-soft text-brand",
    card: "border-brand-line bg-brand-soft/40",
    icon: HiOutlineClock,
  },
};

const toneOf = (tone: string) => TONE[tone] ?? TONE.pending;

/**
 * The timeline itself, without a dialog around it.
 *
 * `Order_Status_Tracking` shows this inline on a billing order's detail view
 * AND behind the track button, so the drawing has to be separable from the
 * dialog or the page ends up with two renderings of one computed truth —
 * which is the state the five hand-written copies were in.
 */
export function OrderTimeline({
  order,
  logs,
  formatDateTime,
  pendingNote,
  buildEntries,
  title,
  renderMeta,
}: {
  order: Order;
  logs: OrderLog[];
  /** The page's own date formatter, so one screen cannot drift from another. */
  formatDateTime: (value?: string | null) => string;
  /**
   * An extra line on the final PENDING entry — "waiting on Priya Singh".
   * Only the tracking page has the approver list to say it, so it is a
   * callback rather than something this component tries to work out.
   */
  pendingNote?: (log: OrderLog, isLastAndPending: boolean) => string | undefined;
  /**
   * How the raw logs become the entries to draw. Defaults to the shared
   * `buildOrderTimelineLogs`.
   *
   * `Order_Tracking` overrides it: that page has ~200 lines of its own
   * log-merging (it synthesises a billing step the API does not send, among
   * other things), and folding two different mergers into one would be a
   * behaviour change dressed up as a refactor. The DRAWING is what is shared
   * here — which is the part that was copied six times.
   */
  buildEntries?: (logs: OrderLog[], order: Order) => OrderLog[];
  /** Overrides the entry heading. Defaults to `getOrderLogDisplayTitle`. */
  title?: (log: OrderLog, all: OrderLog[], raw: OrderLog[]) => React.ReactNode;
  /**
   * Replaces the "By: …" line under the heading.
   *
   * `Order_Tracking` shows a row per rate approver and an "Awaiting action"
   * chip there, which is genuinely more than one name.
   */
  renderMeta?: (log: OrderLog, context: { isLast: boolean; tone: string }) => React.ReactNode;
}) {
  const all = (buildEntries ?? buildOrderTimelineLogs)(logs, order);

  return (
    <ol className="m-0 list-none p-0">
      {all.map((log, index) => {
        const rawTone = getOrderLogTone(log.status_name, log.performed_by_name);
        const tone = toneOf(rawTone);
        const Icon = tone.icon;
        const remark = getOrderLogDisplayRemark(log);
        const isLast = index === all.length - 1;
        const note = pendingNote?.(log, rawTone === "pending" && isLast);

        return (
          <li key={log.id} className="flex gap-3">
            {/* The rail: a marker, and the line down to the next one. The line
                is on the ITEM rather than drawn as a background on the list,
                so it stops at the last entry instead of trailing into empty
                space. */}
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  tone.dot,
                )}
              >
                <Icon className="size-3.5" />
              </span>
              {!isLast ? <span className="w-px flex-1 bg-line" /> : null}
            </div>

            <div className={cn("mb-3 flex-1 rounded-md border p-3", tone.card)}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-[13px] font-semibold text-ink">
                  {(title ?? getOrderLogDisplayTitle)(log, all, logs)}
                </strong>
                <span className="text-[11px] text-subtle">
                  {formatDateTime(log.created_at)}
                </span>
              </div>
              {renderMeta ? (
                <div className="mt-1 text-[12px] text-body">
                  {renderMeta(log, { isLast, tone: rawTone })}
                </div>
              ) : (
                <p className="mt-1 text-[12px] text-body">
                  By: {log.performed_by_name || "Pending"}
                  {note ? ` — waiting on ${note}` : ""}
                </p>
              )}
              {remark ? (
                <p className="mt-1 text-[12px] text-subtle">Remark: {remark}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderTimelineDialog({
  open,
  onOpenChange,
  order,
  logs,
  loading,
  formatDateTime,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  logs: OrderLog[];
  loading: boolean;
  formatDateTime: (value?: string | null) => string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && order ? (
        <DialogContent title={`Tracking for order ${order.order_number}`} size="md">
          <DialogHeader className="flex-col items-start gap-0.5">
            <DialogTitle>Order track</DialogTitle>
            <DialogDescription>
              {order.order_number} — {order.card_name}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {loading ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <span className="sr-only">Loading tracking history</span>
                {[0, 1, 2].map((row) => (
                  <Skeleton key={row} className="h-16 w-full" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-subtle">
                No tracking logs found.
              </p>
            ) : (
              <OrderTimeline order={order} logs={logs} formatDateTime={formatDateTime} />
            )}
          </DialogBody>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
