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
import {
  HiArrowPath,
  HiExclamationTriangle,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineEye,
  HiOutlineInbox,
  HiOutlineXCircle,
  HiOutlineXMark,
} from "react-icons/hi2";

import { cn } from "../lib/utils";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
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
import {
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSpacer,
} from "../components/ui/filter-bar";
import { Card, EmptyState, Page, PageHeader, Stat, StatRow } from "../components/ui/page";
import { Pagination } from "../components/ui/pagination";
import { Skeleton, TableSkeleton } from "../components/ui/skeleton";
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
  type ItemLocationStock,
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
  ItemCell,
  OrderTypeBadge,
  PlannedCell,
  SapStatusBadge,
  StatusCell,
  StatusFilterSelect,
  type CompanyFilter,
  type StatusFilter,
} from "./production/shared";

/** A sync older than this is called out. Matches the command's default. */
const STALE_HOURS = 24;

const PAGE_SIZE = 15;

export default function ProductionOrders() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [insights, setInsights] = useState<ProductionInsights | null>(null);
  const [health, setHealth] = useState<ProductionHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [company, setCompany] = useState<CompanyFilter>("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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
  //
  // Deliberately `orders` and not `paginated` — the deep-linked order may sit
  // on page 3, and the hook looks the row up rather than reading the screen.
  // Narrowing it to the visible page would send every off-page arrival down
  // the `getOrder` fallback for a row already in hand.
  useDeepLinkedOrder(orders, !loading, setDetail);

  // Narrowing the list invalidates the page number: page 4 of every order is
  // past the end of page 4 of one company's.
  useEffect(() => setPage(1), [company, status, search]);

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const pageNumber = Math.min(page, totalPages);
  const paginated = orders.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);

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
      <Breadcrumbs items={[{ label: "Production" }, { label: "Production Orders" }]} />

      <PageHeader
        title="Production Orders"
        description="Planned orders synced from SAP, and where each one is for approval."
        actions={
          <Button variant="ghost" onClick={() => void load()}>
            <HiArrowPath aria-hidden="true" /> Refresh
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
          <Stat
            icon={HiOutlineClipboardDocumentList}
            tone="brand"
            label="Total"
            value={insights.total}
          />
          <Stat
            icon={HiOutlineClock}
            tone={insights.by_status.PENDING ? "hold" : "neutral"}
            label="Pending"
            value={insights.by_status.PENDING ?? 0}
          />
          <Stat
            icon={HiOutlineCheckCircle}
            tone="ok"
            label="Approved"
            value={insights.approved_total}
          />
          <Stat
            icon={HiOutlineXCircle}
            tone={insights.by_status.REJECTED ? "bad" : "neutral"}
            label="Rejected"
            value={insights.by_status.REJECTED ?? 0}
          />
          <Stat
            icon={HiOutlineInbox}
            label="No longer planned"
            value={insights.by_status.OBSOLETE ?? 0}
            hint="SAP moved these on before anyone decided them."
          />
          <Stat
            icon={HiOutlineExclamationTriangle}
            label="SAP write failed"
            value={insights.sap_write_failed}
            tone={insights.sap_write_failed ? "bad" : "neutral"}
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

      <FilterBar>
        <FilterSearch
          label="Item code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by item code…"
          fieldClassName="max-w-[220px] flex-none"
        />
        <CompanyFilterSelect value={company} onChange={setCompany} />
        <StatusFilterSelect value={status} onChange={setStatus} />
        {(company || status || search) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCompany("");
              setStatus("");
              setSearch("");
            }}
          >
            <HiOutlineXMark aria-hidden="true" /> Clear
          </Button>
        )}
        <FilterSpacer />
        <FilterCount>Total: {loading ? "—" : orders.length}</FilterCount>
      </FilterBar>

      {error && (
        <Card className="border-bad/40 bg-bad/5">
          <div className="p-3 text-[13px] text-bad" role="alert">
            {error}
          </div>
        </Card>
      )}

      {loading ? (
        <TableSkeleton columns={10} label="Loading production orders" />
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineInbox}
            title="No production orders"
            hint={
              company || status || search
                ? "Nothing matches these filters."
                : "Orders appear here once the SAP sync has run."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead>PO</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="min-w-[240px]">Item</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  {/* Was "Due". Same change as the approval queue, for the same
                      reason: how long an order has been sitting here is the
                      question this list answers, and when SAP wants it finished
                      is on the detail dialog. */}
                  <TableHead>Created</TableHead>
                  <TableHead>Raised in SAP by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waiting on</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-semibold text-brand">
                      {orderNumber(row)}
                    </TableCell>
                    <TableCell>{row.company}</TableCell>
                    <ItemCell order={row} />
                    <TableCell>{row.warehouse || "—"}</TableCell>
                    <PlannedCell order={row} />
                    <TableCell className="whitespace-nowrap">
                      {fmtDateTime(row.created_at)}
                    </TableCell>
                    <TableCell>{row.sap_created_by || "—"}</TableCell>
                    <StatusCell order={row} />
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
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDetail(row)}
                        aria-label={`View production order ${orderNumber(row)}`}
                        title="View order"
                      >
                        <HiOutlineEye aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {orders.length > PAGE_SIZE && (
        <Pagination
          page={pageNumber}
          totalPages={totalPages}
          onPageChange={setPage}
          summary={`Showing ${(pageNumber - 1) * PAGE_SIZE + 1}–${Math.min(
            pageNumber * PAGE_SIZE,
            orders.length,
          )} of ${orders.length}`}
        />
      )}

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
  /* Stock is loaded separately from the order and the history.
   *
   * It is a live HANA read against OWHS/OITW, so it is the one call here that
   * can fail on its own — SAP unreachable answers 503 while the order and its
   * history come from Postgres and are fine. Folded into the same
   * `Promise.all`, one HANA hiccup would blank the whole dialog; on its own it
   * degrades to a line of text under a panel that still shows everything else.
   */
  const [stock, setStock] = useState<ItemLocationStock | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");

  useEffect(() => {
    if (!order) {
      setFull(null);
      setLogs([]);
      setStock(null);
      setStockError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setStockLoading(true);
    setStockError("");
    setStock(null);
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
    void (async () => {
      try {
        const data = await productionService.stock(order.id);
        if (!cancelled) setStock(data);
      } catch (err) {
        if (!cancelled) setStockError(productionError(err));
      } finally {
        if (!cancelled) setStockLoading(false);
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
              {/* `OITM.U_Sub_Group` in SAP, but everyone here calls it the
                  variety — and correction C-0003 is explicit that the variety
                  is this field, never the item name. The API field keeps SAP's
                  name; only the label is ours. */}
              <Detail label="Variety" value={row.item_group || "—"} />
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

            <StockPanel
              stock={stock}
              loading={stockLoading}
              error={stockError}
              warehouse={row.warehouse}
            />

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

/**
 * Where the item actually is — the warehouses at this site that hold some.
 *
 * The question an approver has before releasing a production order is whether
 * the material is already standing in the next shed. `OWHS.Location` groups
 * warehouses into a physical site, so the order's own warehouse names the site
 * rather than limiting the answer to itself.
 *
 * A LIST, NOT A TABLE. The first cut was a four-column table of all 35
 * warehouses at the site — on hand, committed, on order — which is 35 rows of
 * mostly zeros and two numbers nobody asked for, inside a dialog that already
 * has fifteen fields and a history above it. What is left is the warehouses
 * that hold some, plus the order's own whatever it holds, and one quantity.
 * The "3 of 35" line keeps the ones that were dropped accounted for.
 */
function StockPanel({
  stock,
  loading,
  error,
  warehouse,
}: {
  stock: ItemLocationStock | null;
  loading: boolean;
  error: string;
  warehouse: string;
}) {
  const rows = stock?.results ?? [];
  // A number for the total line only. The per-row values stay strings — they
  // are numeric(19,6), and putting them through Number() to render is exactly
  // the precision loss the API went to trouble to avoid.
  const total = rows.reduce((sum, r) => sum + Number(r.on_hand || 0), 0);

  return (
    <div>
      <div className="mb-1.5 text-[12.5px] font-medium text-ink">
        Stock at this site
        {stock && stock.site_warehouses > 0 && (
          <span className="ml-2 font-normal text-subtle">
            {stock.holding} of {stock.site_warehouses} warehouses
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-12 w-full" />
      ) : error ? (
        // Text, not an alert box: the order and its history above are fine and
        // only this panel could not be read.
        <div className="text-[12.5px] text-bad">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-[12.5px] text-subtle">
          {/* The one case that legitimately has no rows: the order's warehouse
              is not in OWHS, so there is no site to report on. */}
          {warehouse
            ? `No warehouse ${warehouse} in SAP, so there is no site to total.`
            : "The order names no warehouse."}
        </div>
      ) : (
        <div className="rounded-sm border border-line">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li
                key={r.warehouse}
                className={cn(
                  "flex items-baseline justify-between gap-3 px-2.5 py-1.5 text-[12.5px]",
                  // The order's own row is the one the reader is looking for,
                  // so it should not have to match codes by eye.
                  r.is_order_warehouse && "bg-brand/5",
                )}
              >
                <span className="min-w-0">
                  <span
                    className={
                      r.is_order_warehouse ? "font-semibold text-brand" : "text-ink"
                    }
                  >
                    {r.warehouse}
                  </span>
                  <span className="ml-1.5 text-subtle">{r.warehouse_name}</span>
                  {r.is_order_warehouse && (
                    <span className="ml-1.5 text-[11px] text-subtle">this order</span>
                  )}
                  {r.inactive && (
                    <span className="ml-1.5 text-[11px] text-subtle">inactive</span>
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    Number(r.on_hand || 0) === 0
                      ? "text-subtle"
                      : "font-medium text-ink",
                  )}
                >
                  {fmtQty(r.on_hand)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-2.5 py-1.5 text-[12px] text-subtle">
            {total.toLocaleString("en-IN", { maximumFractionDigits: 2 })} at this site ·
            live from SAP
          </div>
        </div>
      )}
    </div>
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
