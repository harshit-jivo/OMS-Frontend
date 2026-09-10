/**
 * Stuck-invoice alerts — every invoice sitting past its stage threshold.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineEnvelope,
  HiOutlineExclamationTriangle,
  HiOutlineMapPin,
} from "react-icons/hi2";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, Notice, Page, PageHeader } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDT, money } from "@/components/tracker/format";
import InvoiceTimelineDialog from "@/components/tracker/InvoiceTimelineDialog";
import trackerService from "../services/trackerService";
import type { Invoice } from "../services/trackerService";

export default function Tracker_Alerts() {
  const [timelineInv, setTimelineInv] = useState<Invoice | null>(null);

  /*
   * The old `useEffect` had every problem TanStack Query exists to solve:
   *
   *   * `setInterval(load, 60000)` kept firing while the tab was in the
   *     background — a request a minute, forever, for a screen nobody was
   *     looking at. `refetchIntervalInBackground` defaults to false.
   *   * `load()` set state after the await with no cancellation, so
   *     unmounting mid-flight was a React state update on a dead component,
   *     and two overlapping loads resolved in arrival order rather than call
   *     order.
   *   * A failed poll threw into an unhandled rejection and left the previous
   *     alerts on screen with no indication they had stopped updating.
   *   * The manual Refresh button and the interval were separate code paths
   *     doing the same fetch.
   */
  const {
    data: alerts = [],
    isPending,
    isFetching: loading,
    refetch: load,
  } = useQuery({
    queryKey: ["tracker", "alerts"],
    queryFn: () => trackerService.getAlerts(),
    refetchInterval: 60_000,
    // Alerts are the point of the screen: 60s of staleness is the contract,
    // so nothing here should serve a cached copy for longer than that.
    staleTime: 60_000,
  });

  // Group by stage for a quick "where is it jammed" view.
  const byStage = useMemo(() => {
    const m = new Map<string, number>();
    alerts.forEach((a) => m.set(a.stage_name, (m.get(a.stage_name) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [alerts]);

  const openTimeline = async (id: number) => {
    try {
      setTimelineInv(await trackerService.getInvoice(id));
    } catch {
      /* ignore */
    }
  };

  /**
   * How far past its threshold an invoice is, as a badge tone.
   *
   * Returns a tone rather than a class name: the 7-day and 3-day thresholds
   * are this page's judgement and stay here, but what colour "bad" is gets
   * decided once, in components/ui/badge.tsx.
   */
  const tone = (over: number): BadgeTone => (over > 7 ? "bad" : over > 3 ? "hold" : "neutral");

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Tracker" }, { label: "Stuck Alerts" }]} />

      <PageHeader
        title="Stuck Invoice Alerts"
        description="Invoices sitting past their stage threshold. Refreshes every minute."
        actions={
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            <HiOutlineArrowPath aria-hidden="true" /> Refresh
          </Button>
        }
      />

      <Notice
        tone={alerts.length ? "bad" : "ok"}
        className="flex items-start gap-3"
      >
        <span className="flex items-start gap-3">
          {alerts.length ? (
            <HiOutlineExclamationTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          ) : (
            <HiOutlineCheckCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          )}
          <span>
            <strong className="block text-[15px] font-bold">
              {alerts.length} stuck invoice{alerts.length === 1 ? "" : "s"}
            </strong>
            <span className="text-[12.5px] text-subtle">
              {byStage.length
                ? byStage.map(([s, n]) => `${s}: ${n}`).join("  ·  ")
                : "All invoices are within their stage thresholds."}
            </span>
          </span>
        </span>
      </Notice>

      <Card className="overflow-hidden p-0">
        {isPending ? (
          <TableSkeleton rows={4} columns={10} />
        ) : (
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Stuck at</TableHead>
                  <TableHead className="text-right">Days here</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead>Over by</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Mailed to</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.length === 0 ? (
                  <TableEmpty colSpan={10}>
                    No stuck invoices — every desk is inside its threshold.
                  </TableEmpty>
                ) : (
                  alerts.map((a) => (
                    // Keyed on the invoice, not `a.id`: rows are derived live
                    // and `id` is null until the sweep has logged that visit.
                    <TableRow key={a.invoice}>
                      <TableCell className="whitespace-nowrap font-medium text-ink">
                        {a.invoice_number}
                      </TableCell>
                      <TableCell>{a.party_name}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        ₹{money(a.invoice_value)}
                      </TableCell>
                      <TableCell>
                        <Badge tone="info" outlined>
                          {a.stage_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{a.days_stuck}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.threshold_days}</TableCell>
                      <TableCell>
                        <Badge tone={tone(a.over_by)} outlined>
                          +{a.over_by.toFixed(1)} d
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDT(a.stage_entered_at)}</TableCell>
                      <TableCell className="max-w-[220px] whitespace-normal">
                        {a.notified && a.notified.length ? (
                          <span
                            className="flex flex-wrap items-center gap-1.5"
                            title={a.notified
                              .map((n) => `${n.user} — ${fmtDT(n.sent_at)}`)
                              .join("\n")}
                          >
                            <Badge tone="ok" outlined>
                              <HiOutlineEnvelope aria-hidden="true" className="size-3" />{" "}
                              {a.notified.length}
                            </Badge>
                            <span className="text-[12px] text-subtle">
                              {a.notified
                                .slice(0, 2)
                                .map((n) => n.user)
                                .join(", ")}
                              {a.notified.length > 2 ? ` +${a.notified.length - 2}` : ""}
                            </span>
                          </span>
                        ) : (
                          <Badge outlined>Not mailed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="w-px text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => void openTimeline(a.invoice)}
                        >
                          <HiOutlineMapPin aria-hidden="true" /> Track
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <InvoiceTimelineDialog invoice={timelineInv} onClose={() => setTimelineInv(null)} />
    </Page>
  );
}
