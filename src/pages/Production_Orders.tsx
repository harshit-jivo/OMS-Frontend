/**
 * Production Orders — what SAP has planned, and where each one is in OMS.
 *
 * A READ-ONLY PAGE, AND THAT IS THE DESIGN.
 * SAP is the point of origin: a planner raises a production order in SAP B1,
 * `manage.py sync_production_orders` notices it, and OMS routes it for
 * approval. Nothing here creates, edits or cancels an order — there is no
 * "New" button because there is no backend endpoint to call.
 *
 * The one thing this page does that a list normally would not is show the
 * FEED'S HEALTH. The failure this module replaces was a sync that stopped on
 * 13 Aug 2026 while its job reported success every 60 seconds for 33 days, and
 * 432 production orders went through no approval at all. "When did this last
 * work?" has to be answerable without opening Task Scheduler.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { HiArrowPath, HiExclamationTriangle } from "react-icons/hi2";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/form";
import { Card, EmptyState, Page, PageHeader, Stat, StatRow } from "../components/ui/page";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  productionError,
  productionService,
  type ProductionActionLog,
  type ProductionHealth,
  type ProductionInsights,
  type ProductionOrder,
} from "../services/productionService";
import { useDeepLinkedOrder } from "./production/useDeepLinkedOrder";
import { fmtDate, fmtDateTime, fmtQty, orderNumber } from "./production/format";
import {
  CompanyFilterSelect,
  FlowStatusBadge,
  GateExemptBadge,
  OrderTypeBadge,
  SapStatusBadge,
  StatusFilterSelect,
  type CompanyFilter,
  type StatusFilter,
} from "./production/shared";

/** A sync older than this is called out. Matches the command's default. */
const STALE_HOURS = 24;

export default function ProductionOrders() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [insights, setInsights] = useState<ProductionInsights | null>(null);
  const [health, setHealth] = useState<ProductionHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [company, setCompany] = useState<CompanyFilter>("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [search, setSearch] = useState("");

  const [detail, setDetail] = useState<ProductionOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, counts, feeds] = await Promise.all([
        productionService.listOrders({
          company: company || undefined,
          status: status || undefined,
          item_code: search.trim() || undefined,
        }),
        productionService.insights({ company: company || undefined }),
        productionService.health(),
      ]);
      setOrders(rows);
      setInsights(counts);
      setHealth(feeds);
    } catch (err) {
      setError(productionError(err));
    } finally {
      setLoading(false);
    }
  }, [company, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // Arriving from a notification ("this order was approved"): open THAT order,
  // not just the list it is somewhere in.
  useDeepLinkedOrder(orders, !loading, setDetail);

  /**
   * Companies whose feed has not reported in over a day.
   *
   * Only counted for companies OMS has ever synced — a company that has never
   * been configured is not "stale", it is simply not in use, and warning about
   * it would train people to ignore the banner.
   */
  const stale = useMemo(
    () =>
      health.filter((h) => {
        if (!h.last_synced_at) return false;
        const age = Date.now() - new Date(h.last_synced_at).getTime();
        return age > STALE_HOURS * 3600 * 1000;
      }),
    [health],
  );

  return (
    <Page>
      <PageHeader
        title="Production Orders"
        description="Planned orders synced from SAP, and where each one is for approval."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <HiArrowPath aria-hidden /> Refresh
          </Button>
        }
      />

      {stale.length > 0 && (
        <Card className="border-bad/40 bg-bad/5">
          <div className="flex items-start gap-2.5 p-3">
            <HiExclamationTriangle className="mt-0.5 shrink-0 text-bad" aria-hidden />
            <div className="text-[13px]">
              <div className="font-medium text-ink">The SAP sync may have stopped.</div>
              {stale.map((h) => (
                <div key={h.company} className="text-subtle">
                  {h.company}: nothing since {fmtDateTime(h.last_synced_at)}.
                </div>
              ))}
              <div className="mt-1 text-subtle">
                Orders raised in SAP since then will not have been routed for
                approval. Check the scheduled task before assuming production
                has simply been quiet.
              </div>
            </div>
          </div>
        </Card>
      )}

      {insights && (
        <StatRow>
          <Stat label="Total" value={insights.total} />
          <Stat label="Pending" value={insights.by_status.PENDING ?? 0} />
          <Stat label="Approved" value={insights.approved_total} />
          <Stat label="Rejected" value={insights.by_status.REJECTED ?? 0} />
          <Stat
            label="No longer planned"
            value={insights.by_status.OBSOLETE ?? 0}
            hint="SAP moved these on before anyone decided them."
          />
          <Stat
            label="SAP write failed"
            value={insights.sap_write_failed}
            tone={insights.sap_write_failed ? "bad" : undefined}
            hint="Approved in OMS, but SAP did not accept it. Retryable from the approval desk."
          />
        </StatRow>
      )}

      {insights && insights.approved_but_exempt_from_sap_gate > 0 && (
        <Card>
          <div className="p-3 text-[13px] text-subtle">
            <span className="font-medium text-ink">
              {insights.approved_but_exempt_from_sap_gate}
            </span>{" "}
            of {insights.approved_total} approved orders would have been released by
            SAP without any approval — raw materials, non-Standard orders, or
            orders raised by the user SAP's rule exempts. For those, this
            approval is a record rather than a control.
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by item code…"
            className="h-control-xs max-w-[220px]"
            aria-label="Filter by item code"
          />
          <CompanyFilterSelect value={company} onChange={setCompany} />
          <StatusFilterSelect value={status} onChange={setStatus} />
          <span className="ml-auto text-[12.5px] text-subtle">
            {loading ? "loading…" : `${orders.length} order(s)`}
          </span>
        </div>

        {error && (
          <div className="p-3 text-[13px] text-bad" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            title="No production orders"
            hint="Orders appear here once the SAP sync has run."
            className="py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="min-w-[240px]">Item</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Raised in SAP by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waiting on</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-medium text-ink">
                      {orderNumber(row)}
                    </TableCell>
                    <TableCell>{row.company}</TableCell>
                    <TableCell className="min-w-[240px]">
                      <div className="font-medium text-ink">{row.item_code}</div>
                      <div className="text-[12px] text-subtle">{row.item_name}</div>
                    </TableCell>
                    <TableCell>{row.warehouse || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <div>{fmtQty(row.planned_qty)} pcs</div>
                      {row.planned_boxes && (
                        <div className="text-[12px] text-subtle">
                          {fmtQty(row.planned_boxes)} box
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmtDate(row.due_date)}
                    </TableCell>
                    <TableCell>{row.sap_created_by || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <FlowStatusBadge status={row.flow?.status} />
                        <OrderTypeBadge order={row} />
                        <GateExemptBadge order={row} />
                        {row.flow?.sap_status === "FAILED" && (
                          <Badge tone="bad" outlined>
                            SAP write failed
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.flow?.current_stage ? (
                        <>
                          <div className="text-[13px]">
                            {row.flow.current_user_name || "—"}
                          </div>
                          <div className="text-[12px] text-subtle">
                            {row.flow.stage_label || row.flow.current_stage_name}
                          </div>
                        </>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDetail(row)}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <OrderDetailDialog order={detail} onClose={() => setDetail(null)} />
    </Page>
  );
}

/* ================================================================== *
 * Detail + history
 * ================================================================== */

export function OrderDetailDialog({
  order,
  onClose,
}: {
  order: ProductionOrder | null;
  onClose: () => void;
}) {
  const [full, setFull] = useState<ProductionOrder | null>(null);
  const [logs, setLogs] = useState<ProductionActionLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!order) {
      setFull(null);
      setLogs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        // The detail endpoint adds `gate_exemption_reason`, which the list
        // deliberately omits — it costs a per-row computation the list does
        // not need.
        const [one, history] = await Promise.all([
          productionService.getOrder(order.id),
          productionService.history(order.id),
        ]);
        if (cancelled) return;
        setFull(one);
        setLogs(history);
      } catch {
        if (!cancelled) setFull(order);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order]);

  const row = full ?? order;

  return (
    <Dialog open={Boolean(order)} onOpenChange={(next) => !next && onClose()}>
      {row && (
        <DialogContent title="Production order">
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <DialogTitle>
                {row.company} · PO {orderNumber(row)}
              </DialogTitle>
              <DialogDescription>
                {row.item_code} — {row.item_name}
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <FlowStatusBadge status={row.flow?.status} />
              <SapStatusBadge order={row} />
              <OrderTypeBadge order={row} />
              <GateExemptBadge order={row} />
            </div>

            {row.gate_exemption_reason && (
              <div className="rounded-sm border border-line bg-surface p-2.5 text-[12.5px] text-subtle">
                {row.gate_exemption_reason}
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
              <Detail label="Planned" value={`${fmtQty(row.planned_qty)} pcs`} />
              <Detail label="Boxes" value={fmtQty(row.planned_boxes)} />
              <Detail label="Litres" value={fmtQty(row.planned_litres)} />
              <Detail label="Warehouse" value={row.warehouse || "—"} />
              <Detail label="Sub group" value={row.item_group || "—"} />
              <Detail label="Series" value={row.item_series ?? "—"} />
              <Detail label="Posted" value={fmtDate(row.post_date)} />
              <Detail label="Due" value={fmtDate(row.due_date)} />
              <Detail label="Start" value={fmtDate(row.start_date)} />
              <Detail label="Batch" value={row.batch_no || "—"} />
              <Detail label="MFG" value={fmtDate(row.mfg_date)} />
              <Detail label="Expiry" value={fmtDate(row.expiry_date)} />
              <Detail label="Raised in SAP by" value={row.sap_created_by || "—"} />
              <Detail label="SAP DocEntry" value={row.sap_doc_entry} />
              <Detail label="Last synced" value={fmtDateTime(row.synced_at)} />
            </dl>

            {row.remarks && (
              <div className="text-[13px]">
                <div className="text-subtle">SAP comments</div>
                <div className="italic">“{row.remarks}”</div>
              </div>
            )}

            {row.flow && (
              <div className="rounded-sm border border-line p-2.5 text-[12.5px]">
                <div className="text-subtle">Workflow</div>
                <div className="text-ink">{row.flow.workflow_code}</div>
                {row.flow.stage_label && (
                  <div className="text-subtle">
                    {row.flow.stage_label} — {row.flow.current_stage_name}
                    {row.flow.current_user_name ? ` · ${row.flow.current_user_name}` : ""}
                  </div>
                )}
                {row.flow.sap_status && (
                  <div
                    className={
                      row.flow.sap_status === "FAILED" ? "mt-1 text-bad" : "mt-1 text-subtle"
                    }
                  >
                    SAP write: {row.flow.sap_status}
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-1.5 text-[12.5px] font-medium text-ink">History</div>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : logs.length === 0 ? (
                <div className="text-[12.5px] text-subtle">Nothing recorded yet.</div>
              ) : (
                <ol className="space-y-1.5">
                  {logs.map((entry) => (
                    <li key={entry.id} className="text-[12.5px]">
                      <span className="font-medium text-ink">{entry.action}</span>
                      {entry.stage_name ? ` · ${entry.stage_name}` : ""}
                      {/* SYNC and OBSOLETE have no actor: no OMS user did them. */}
                      {entry.acted_by_name ? ` · ${entry.acted_by_name}` : " · system"}
                      <span className="text-subtle"> · {fmtDateTime(entry.acted_at)}</span>
                      {entry.remarks && (
                        <div className="italic text-subtle">“{entry.remarks}”</div>
                      )}
                      {entry.action_data && (
                        <div className="text-subtle">
                          {Object.entries(entry.action_data).map(([field, change]) => (
                            <div key={field}>
                              {field}: {change.old ?? "—"} → {change.new ?? "—"}
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-subtle">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
