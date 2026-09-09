/**
 * Every Sales Dashboard dialog in one file: the sales breakdown, the "more
 * statuses" list, the manager/state performance ranking, the state-wise item
 * drill-down, the per-status orders list, and the order detail it opens.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ALL SIX ARE REAL DIALOGS NOW
 * ─────────────────────────────────────────────────────────────────────────
 * Five were `variant="bare"` with `showClose={false}`, each wearing a panel
 * stylesheet of its own and a hand-rolled header whose close button was a
 * CHEVRON-UP — the same glyph the page uses for "collapse this card", used
 * here to mean "dismiss this modal".
 *
 * The sixth, the order detail, was not a `Dialog` at all: a bare `div`
 * backdrop with `onClick={close}` and a `stopPropagation` on the panel, so it
 * could stack above the status-orders dialog it opens from. It had no focus
 * trap and no Escape handling. Radix stacks nested dialogs by itself — the
 * later portal paints above the earlier one — so the hand-rolled version was
 * buying nothing that the primitive does not do better.
 *
 * `interactions.visual.spec.ts` ("dashboard charts") photographs that stack;
 * its baseline needs re-recording, along with every other one in the suite.
 */
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import { Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { Tab, TabList } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { PALETTE } from "../constants";
import { fmt, fmtCurrency } from "../format";
import type { DashboardState } from "../useDashboard";

function NoData({ children }: { children: React.ReactNode }) {
  return <p className="m-0 py-10 text-center text-[12.5px] text-subtle">{children}</p>;
}

/**
 * One ranked row with a bar — managers, states, varieties and products all
 * draw it, and before this each of the four had its own copy of the markup.
 */
function RankRow({
  index,
  title,
  subtitle,
  extra,
  amount,
  width,
  footer,
}: {
  index: number;
  title: string;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  amount: string;
  width: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-strong text-[11px] font-bold text-subtle">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-ink">{title}</span>
            {subtitle ? (
              <span className="block truncate text-[11px] text-subtle">{subtitle}</span>
            ) : null}
            {extra ? <span className="block truncate text-[11px] text-subtle">{extra}</span> : null}
          </div>
          <strong className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink">
            {amount}
          </strong>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-strong">
          <span
            className="block h-full rounded-full"
            style={{ width, background: PALETTE[index % PALETTE.length] }}
          />
        </div>
        {footer ? <p className="m-0 mt-1.5 text-[11px] text-subtle">{footer}</p> : null}
      </div>
    </div>
  );
}

export default function DashboardDialogs({ dashboard }: { dashboard: DashboardState }) {
  const {
    t,
    showSalesBreakdown,
    setShowSalesBreakdown,
    selectedPeriodLabel,
    allRevenue,
    completedRevenue,
    pendingRevenue,
    rejectedRevenue,
    showMoreStatuses,
    setShowMoreStatuses,
    hiddenStatusItems,
    statusClickable,
    openStatusOrders,
    getStatusColor,
    showManagerPerformance,
    setShowManagerPerformance,
    performanceView,
    setPerformanceView,
    activePerformance,
    activePerformanceMaxSales,
    getSalesWidth,
    showStateItems,
    setShowStateItems,
    selectedItemVariety,
    setSelectedItemVariety,
    activeItemState,
    activeStateVarietyTotals,
    activeStateFilteredProducts,
    activeStateMaxVarietySales,
    activeStateMaxProductSales,
    statusOrdersModal,
    setStatusOrdersModal,
    statusOrders,
    statusOrdersLoading,
    statusOrdersError,
    getPendingRateApprovers,
    getRejectedByName,
    setDetailOrder,
    detailOrder,
  } = dashboard;

  return (
    <>
      {/* ── Sales breakdown ── */}
      <Dialog
        open={Boolean(showSalesBreakdown)}
        onOpenChange={(next) => {
          if (!next) setShowSalesBreakdown(false);
        }}
      >
        {showSalesBreakdown && (
          <DialogContent title="Sales breakdown" size="sm">
            <DialogHeader>
              <div className="min-w-0">
                <DialogTitle>Sales Breakdown</DialogTitle>
                <DialogDescription>{selectedPeriodLabel} order sales</DialogDescription>
              </div>
            </DialogHeader>
            <DialogBody>
              <dl className="m-0 flex flex-col gap-0">
                {(
                  [
                    ["All Orders Sales", allRevenue, false],
                    ["Completed Orders Sales", completedRevenue, true],
                    ["Pending Orders Sales", pendingRevenue, false],
                    ["Rejected Orders Sales", rejectedRevenue, false],
                  ] as Array<[string, number, boolean]>
                ).map(([label, amount, primary]) => (
                  <div
                    key={label}
                    className={cn(
                      "flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0",
                      // "Completed" is the figure the KPI card shows, so it is
                      // the one the reader opened this to reconcile against.
                      primary && "font-semibold",
                    )}
                  >
                    <dt className={cn("text-[13px]", primary ? "text-ink" : "text-subtle")}>
                      {label}
                    </dt>
                    <dd
                      className={cn(
                        "m-0 text-[13px] tabular-nums",
                        primary ? "text-brand" : "text-ink",
                      )}
                    >
                      {fmtCurrency(amount)}
                    </dd>
                  </div>
                ))}
              </dl>
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>

      {/* ── More statuses ── */}
      <Dialog
        open={Boolean(showMoreStatuses)}
        onOpenChange={(next) => {
          if (!next) setShowMoreStatuses(false);
        }}
      >
        {showMoreStatuses && (
          <DialogContent title="All statuses" size="sm">
            <DialogHeader>
              <div className="min-w-0">
                <DialogTitle>More Statuses</DialogTitle>
                <DialogDescription>Additional order status counts</DialogDescription>
              </div>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-0.5">
                {hiddenStatusItems.map((item) => {
                  const content = (
                    <>
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: getStatusColor(item) }}
                      />
                      <span className="flex-1 text-[13px] text-body">{item.label}</span>
                      <span className="text-[13px] font-semibold tabular-nums text-ink">
                        {item.count}
                      </span>
                    </>
                  );
                  return statusClickable ? (
                    <button
                      key={item.status}
                      type="button"
                      className="flex w-full appearance-none items-center gap-2.5 rounded-sm border-0 bg-transparent px-2 py-2 text-left [font-family:inherit] cursor-pointer hover:bg-surface focus-visible:outline-none focus-visible:shadow-focus"
                      onClick={() => void openStatusOrders(item)}
                      title={`View ${item.label} orders`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div
                      key={item.status}
                      className="flex items-center gap-2.5 px-2 py-2"
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Manager / state performance ── */}
      <Dialog
        open={Boolean(showManagerPerformance)}
        onOpenChange={(next) => {
          if (!next) setShowManagerPerformance(false);
        }}
      >
        {showManagerPerformance && (
          <DialogContent title="Performance" size="md">
            <DialogHeader className="flex-wrap">
              <div className="min-w-0">
                <DialogTitle>
                  {performanceView === "state"
                    ? "State-wise Performance"
                    : "All Managers Performance"}
                </DialogTitle>
                <DialogDescription>
                  {selectedPeriodLabel} completed order sales by{" "}
                  {performanceView === "state" ? "state" : "manager"}
                </DialogDescription>
              </div>
              {/* Two views of one ranking — a tablist, not two toggle buttons
                  that happened to be mutually exclusive. */}
              <TabList label="Performance view">
                <Tab
                  selected={performanceView === "manager"}
                  onClick={() => setPerformanceView("manager")}
                >
                  Managers
                </Tab>
                <Tab
                  selected={performanceView === "state"}
                  onClick={() => setPerformanceView("state")}
                >
                  States
                </Tab>
              </TabList>
            </DialogHeader>
            <DialogBody>
              {activePerformance.length === 0 ? (
                <NoData>No manager sales data for this period</NoData>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {activePerformance.map((item, index) => (
                    <RankRow
                      key={item.id}
                      index={index}
                      title={item.name}
                      amount={fmtCurrency(item.sales)}
                      width={getSalesWidth(item.sales, activePerformanceMaxSales)}
                      footer={`${fmt(item.orders)} orders`}
                    />
                  ))}
                </div>
              )}
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>

      {/* ── State-wise item drill-down ── */}
      <Dialog
        open={Boolean(showStateItems)}
        onOpenChange={(next) => {
          if (!next) setShowStateItems(false);
        }}
      >
        {showStateItems && (
          <DialogContent title="State items" size="md">
            <DialogHeader className="flex-wrap">
              <div className="min-w-0">
                <DialogTitle>
                  {selectedItemVariety === "ALL"
                    ? `${activeItemState ?? "State"} Variety Sales`
                    : `${selectedItemVariety} Products`}
                </DialogTitle>
                <DialogDescription>
                  {selectedItemVariety === "ALL"
                    ? `All varieties ranked by total sales value for ${selectedPeriodLabel}`
                    : `${activeItemState ?? "State"} products ranked by sales value for ${selectedPeriodLabel}`}
                </DialogDescription>
              </div>
              {selectedItemVariety !== "ALL" ? (
                <Button size="sm" onClick={() => setSelectedItemVariety("ALL")}>
                  Back to varieties
                </Button>
              ) : null}
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-3.5">
                {selectedItemVariety === "ALL"
                  ? activeStateVarietyTotals.map((item, index) => (
                      /* Each row drills into the products of that variety, so
                         it stays a button — but a whole row of bar chart is
                         not a control, so it says so with a hover surface
                         rather than looking like one at rest. */
                      <button
                        key={`modal-variety-${item.variety}`}
                        type="button"
                        className="appearance-none rounded-sm border-0 bg-transparent p-1 text-left [font-family:inherit] cursor-pointer hover:bg-surface focus-visible:outline-none focus-visible:shadow-focus"
                        onClick={() => setSelectedItemVariety(item.variety)}
                      >
                        <RankRow
                          index={index}
                          title={item.variety}
                          subtitle="Completed order lines"
                          amount={fmtCurrency(item.total_sales)}
                          width={getSalesWidth(item.total_sales, activeStateMaxVarietySales)}
                          footer={`Amount ${fmtCurrency(item.total_sales)} · Qty ${fmt(item.quantity)} · Items ${fmt(item.count)}`}
                        />
                      </button>
                    ))
                  : activeStateFilteredProducts.map((item, index) => (
                      <RankRow
                        key={`modal-${item.item_code}-${item.variety}-${item.category}`}
                        index={index}
                        title={item.variety}
                        subtitle={item.item_name}
                        extra={`${item.item_code} · ${item.category}`}
                        amount={fmtCurrency(item.total_sales)}
                        width={getSalesWidth(item.total_sales, activeStateMaxProductSales)}
                        footer={`Amount ${fmtCurrency(item.total_sales)} · Qty ${fmt(item.quantity)} · Items ${fmt(item.count)}`}
                      />
                    ))}
              </div>
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Orders with a given status ── */}
      <Dialog
        open={Boolean(statusOrdersModal)}
        onOpenChange={(next) => {
          if (!next) setStatusOrdersModal(null);
        }}
      >
        {statusOrdersModal && (
          <DialogContent title="Orders by status" size="lg">
            <DialogHeader>
              <div className="min-w-0">
                <DialogTitle>{statusOrdersModal.label} Orders</DialogTitle>
                <DialogDescription>
                  {statusOrdersLoading
                    ? "Loading orders…"
                    : `${statusOrders.length} ${statusOrders.length === 1 ? "order" : "orders"} with this status`}
                </DialogDescription>
              </div>
            </DialogHeader>
            <DialogBody>
              {statusOrdersLoading ? (
                <div className="space-y-2.5" role="status" aria-live="polite">
                  <span className="sr-only">Loading orders</span>
                  {[0, 1, 2].map((row) => (
                    <Skeleton key={row} className="h-16 w-full" />
                  ))}
                </div>
              ) : statusOrdersError ? (
                <Notice tone="bad">{statusOrdersError}</Notice>
              ) : statusOrders.length === 0 ? (
                <NoData>No orders found for this status.</NoData>
              ) : (
                <div className="flex flex-col gap-2">
                  {statusOrders.map((order) => {
                    const pendingApprovers = getPendingRateApprovers(order);
                    const rejectedBy = getRejectedByName(order);
                    return (
                      <div
                        key={order.id}
                        className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3"
                      >
                        <div className="min-w-[180px] flex-1">
                          <p className="m-0 text-[13px] font-semibold text-brand">
                            #{order.order_number}
                          </p>
                          <p className="m-0 text-[12.5px] text-ink">
                            {order.card_name || order.card_code}
                          </p>
                          {/* Who it is sitting with, or who turned it down —
                              the reason someone opens a status list. */}
                          {pendingApprovers.length > 0 ? (
                            <p className="m-0 mt-0.5 text-[11.5px] text-hold">
                              Rate Approver: {pendingApprovers.join(", ")}
                            </p>
                          ) : null}
                          {rejectedBy ? (
                            <p className="m-0 mt-0.5 text-[11.5px] text-danger">
                              Rejected by: {rejectedBy}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <p className="m-0 text-[13px] font-semibold tabular-nums text-ink">
                            {fmtCurrency(order.total_amount)}
                          </p>
                          <p className="m-0 text-[11px] text-subtle">
                            {order.items?.length ?? 0} items
                            {order.created_by ? ` · ${order.created_by}` : ""}
                            {order.created_at
                              ? ` · ${new Date(order.created_at).toLocaleDateString("en-GB")}`
                              : ""}
                            {order.po_number ? ` · PO: ${order.po_number}` : ""}
                            {order.sap_doc_number ? ` · SAP: ${order.sap_doc_number}` : ""}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setDetailOrder(order)}>
                          View
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Order detail, stacked above the list it opens from ── */}
      <Dialog
        open={Boolean(detailOrder)}
        onOpenChange={(next) => {
          if (!next) setDetailOrder(null);
        }}
      >
        {detailOrder && (
          <DialogContent title="Order detail" size="xl">
            <DialogHeader>
              <div className="min-w-0">
                <DialogTitle>Order #{detailOrder.order_number}</DialogTitle>
                <DialogDescription>{detailOrder.status_display}</DialogDescription>
              </div>
              {detailOrder.is_foc ? <Badge tone="note">FOC</Badge> : null}
            </DialogHeader>

            <DialogBody className="space-y-4">
              <DetailGrid>
                <DetailField label="Party" value={detailOrder.card_name || "—"} />
                <DetailField label="Card code" value={detailOrder.card_code || "—"} />
                <DetailField label="Created by" value={detailOrder.created_by || "—"} />
                <DetailField
                  label="Created at"
                  value={
                    detailOrder.created_at
                      ? new Date(detailOrder.created_at).toLocaleString("en-GB")
                      : "—"
                  }
                />
                <DetailField label="Delivery date" value={detailOrder.delivery_date || "—"} />
                <DetailField label="PO number" value={detailOrder.po_number || "—"} />
                <DetailField label="SAP doc" value={detailOrder.sap_doc_number || "—"} />
                <DetailField
                  label="Total amount"
                  value={fmtCurrency(detailOrder.total_amount)}
                />
                <DetailField
                  label="Comment"
                  value={detailOrder.remarks?.trim() ? detailOrder.remarks : ""}
                  span="full"
                  hideWhenEmpty
                />
              </DetailGrid>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="m-0 text-[13px] font-semibold uppercase tracking-wide text-subtle">
                    Items
                  </h3>
                  <Badge tone="neutral">{detailOrder.items?.length ?? 0}</Badge>
                </div>

                {detailOrder.items && detailOrder.items.length > 0 ? (
                  <div className="overflow-x-auto rounded-card border border-line">
                    <Table density="compact">
                      <TableHeader>
                        <TableRow className="bg-surface hover:bg-surface">
                          <TableHead>#</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Pcs</TableHead>
                          <TableHead className="text-right">Boxes</TableHead>
                          <TableHead className="text-right">Ltrs</TableHead>
                          <TableHead className="text-right">Total Ltrs</TableHead>
                          <TableHead className="text-right">
                            {t("price_list", "Price List (Basic)")}
                          </TableHead>
                          <TableHead className="text-right">Basic Price</TableHead>
                          <TableHead className="text-right">Tax %</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailOrder.items.map((item, index) => (
                          <TableRow key={`${item.item_code}-${index}`}>
                            <TableCell className="text-subtle">{index + 1}</TableCell>
                            <TableCell>
                              <span className="block font-medium text-ink">{item.item_name}</span>
                              <span className="block text-[11.5px] text-subtle">
                                {item.item_code}
                              </span>
                            </TableCell>
                            <TableCell>{item.category || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
                            <TableCell className="text-right tabular-nums">{item.pcs}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Number(item.boxes).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{item.ltrs}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Number(item.total_ltrs ?? 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Number(item.price_list_basic).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Number(item.basic_price).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Number(item.tax_rate).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-ink">
                              {Number(item.total).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <NoData>No items found for this order.</NoData>
                )}
              </div>

              {detailOrder.items && detailOrder.items.length > 0
                ? (() => {
                    const subtotal = detailOrder.items.reduce(
                      (sum, item) => sum + Number(item.total || 0),
                      0,
                    );
                    const tax = detailOrder.items.reduce(
                      (sum, item) =>
                        sum + (Number(item.total || 0) * Number(item.tax_rate || 0)) / 100,
                      0,
                    );
                    const totalLtrs = detailOrder.items.reduce(
                      (sum, item) => sum + Number(item.total_ltrs || 0),
                      0,
                    );
                    return (
                      <dl className="m-0 ml-auto flex w-full max-w-[320px] flex-col gap-0">
                        {(
                          [
                            ["Total Ltrs", totalLtrs.toFixed(2), false],
                            ["Subtotal", fmtCurrency(subtotal), false],
                            ["Tax", fmtCurrency(tax), false],
                            ["Grand Total", fmtCurrency(subtotal + tax), true],
                          ] as Array<[string, string, boolean]>
                        ).map(([label, value, grand]) => (
                          <div
                            key={label}
                            className={cn(
                              "flex items-baseline justify-between gap-3 py-1.5",
                              grand && "mt-1 border-t border-line pt-2",
                            )}
                          >
                            <dt
                              className={cn(
                                "text-[12.5px]",
                                grand ? "font-semibold text-ink" : "text-subtle",
                              )}
                            >
                              {label}
                            </dt>
                            <dd
                              className={cn(
                                "m-0 tabular-nums",
                                grand
                                  ? "text-[15px] font-bold text-ink"
                                  : "text-[12.5px] text-ink",
                              )}
                            >
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    );
                  })()
                : null}
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
