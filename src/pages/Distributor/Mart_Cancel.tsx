import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineArchiveBoxXMark,
  HiOutlineExclamationTriangle,
  HiOutlineEye,
  HiOutlineInbox,
  HiOutlineInformationCircle,
  HiOutlineNoSymbol,
  HiOutlineQueueList,
  HiOutlineShoppingCart,
} from "react-icons/hi2";

import {
  ordersService,
  type MartOrderSummary,
  type Order,
  type OrderItem,
  type SalesOrderSapStatus,
} from "../../services/ordersService";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import {
  Card,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Stat,
  StatRow,
} from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Pagination } from "@/components/ui/pagination";
import { OrderItemCards } from "@/components/orders/OrderItemCards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tab, TabList } from "@/components/ui/tabs";
import { toneForStatus } from "@/components/ui/statusTone";

/**
 * Mart Cancel — cancel a COMPLETED distributor order, reversing it in SAP.
 *
 * This is the heavier counterpart of the Mart Approval queue: it acts on orders
 * that already reached SAP ("Completed"), and cancelling one calls the SAP
 * Service Layer to cancel the Sales Order there too (POST /Orders(DocEntry)/
 * Cancel) before OMS moves the order to "Cancelled". SAP is cancelled FIRST, so
 * if SAP refuses (e.g. the order already has a delivery/invoice against it)
 * nothing changes and the SAP error is shown.
 *
 * Gated by the `orders.mart.cancel` authority (see routeAccess.ts) — a separate
 * grant from the approve/reject desk, because reversing a booked document is a
 * bigger authority than working the pending queue.
 *
 * Two tabs: "Completed" is the actionable list (each row has a Cancel action);
 * "Cancelled" is read-only history showing who cancelled and why. Cancel is
 * final — a cancelled order does not come back here.
 */

const NO_MART_ORDERS: MartOrderSummary[] = [];
const NO_SAP_STATUSES: Record<string, SalesOrderSapStatus> = {};

type TabKey = "completed" | "cancelled";
const TABS: { key: TabKey; label: string }[] = [
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

type CancelTarget = { id: number; order_number: string };

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function MartCancel() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("completed");
  const [page, setPage] = useState(1);

  // The list plus, for the Completed tab, each order's SAP doc number — kept in
  // one queryFn so a stale SAP map can never paint onto the wrong tab (mirrors
  // the Mart Approval page).
  const {
    data: listData,
    isPending: loading,
    error: loadError,
  } = useQuery({
    queryKey: ["orders", "mart-cancel", tab],
    queryFn: async () => {
      const data = await ordersService.getMartOrders(tab);
      const list = Array.isArray(data) ? data : [];
      if (tab === "completed" && list.length) {
        try {
          return {
            list,
            statuses: await ordersService.getSalesOrderSapStatus(list.map((o) => o.id)),
          };
        } catch {
          return { list, statuses: {} as Record<string, SalesOrderSapStatus> };
        }
      }
      return { list, statuses: {} as Record<string, SalesOrderSapStatus> };
    },
  });

  const orders = listData?.list ?? NO_MART_ORDERS;
  const sapStatuses = listData?.statuses ?? NO_SAP_STATUSES;
  const error = loadError
    ? messageFrom(loadError, "Failed to load orders. Please try again.")
    : "";

  const docNumFor = (orderId: number) => sapStatuses[String(orderId)]?.doc_num ?? null;

  // Detail view (read-only): the full order + its items.
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailBusy, setDetailBusy] = useState(false);
  // The "i" order-information dialog on the detail view (same as the Mart
  // Approval / View Orders detail).
  const [infoOpen, setInfoOpen] = useState(false);

  // Cancel dialog.
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);

  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(orders.length / itemsPerPage));
  const pageNumber = Math.min(page, totalPages);
  const pageOrders = orders.slice((pageNumber - 1) * itemsPerPage, pageNumber * itemsPerPage);
  const lineCount = orders.reduce((sum, o) => sum + Number(o.items_count || 0), 0);

  const reload = async () =>
    queryClient.invalidateQueries({ queryKey: ["orders", "mart-cancel"] });

  const onView = async (order: MartOrderSummary) => {
    setDetailBusy(true);
    try {
      const detail = await ordersService.getOrderDetails(order.id);
      setDetailOrder(detail);
      setDetailItems((detail.items as OrderItem[]) || []);
    } catch (e) {
      showToast({
        tone: "error",
        title: "Could not open the order",
        message: messageFrom(e, "Please try again."),
      });
    } finally {
      setDetailBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    const target = cancelTarget;
    setBusy(true);
    try {
      const res = await ordersService.cancelMartOrder(target.id, cancelReason.trim());
      showToast({
        tone: "success",
        title: "Order cancelled",
        message: res?.message || `${target.order_number} was cancelled in SAP and OMS.`,
        orderNumber: target.order_number,
      });
    } catch (e) {
      // The server leads its message with the actual SAP reason (why SAP
      // refused), so show that verbatim — nothing was changed in OMS.
      showToast({
        tone: "error",
        title: "Order not cancelled",
        message: messageFrom(
          e,
          "SAP refused the cancellation, or the request failed. Nothing was changed.",
        ),
        orderNumber: target.order_number,
      });
    } finally {
      // Always close the dialog and refresh, whatever the outcome.
      setCancelTarget(null);
      setCancelReason("");
      setDetailOrder(null);
      setBusy(false);
      await reload();
    }
  };

  const cancelDialog = (
    <Dialog
      open={Boolean(cancelTarget)}
      onOpenChange={(next) => {
        if (!next && !busy) setCancelTarget(null);
      }}
    >
      {cancelTarget ? (
        <DialogContent title="Cancel order" size="sm" className="max-w-[460px]">
          <DialogBody className="space-y-3">
            <div className="text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-bad-soft text-bad"
              >
                <HiOutlineNoSymbol className="size-5" />
              </span>
              <h3 className="text-[16px] font-bold text-ink">
                Cancel {cancelTarget.order_number}?
              </h3>
              <p className="mt-1.5 text-[13px] text-subtle">
                This also cancels the Sales Order in SAP and cannot be undone. If the
                order already has a delivery or invoice in SAP, the cancellation will be
                refused.
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="mart-cancel-reason"
                className="block text-[11px] font-medium text-subtle"
              >
                Reason (required)
              </label>
              <textarea
                id="mart-cancel-reason"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why is this order being cancelled?"
                className={[
                  "w-full rounded-sm border border-line bg-surface px-2.5 py-2",
                  "[font-family:inherit] text-[13px] text-ink",
                  "transition-colors hover:border-line-strong",
                  "focus-visible:border-brand focus-visible:bg-white focus-visible:shadow-focus focus-visible:outline-none",
                ].join(" ")}
              />
            </div>
          </DialogBody>
          <DialogFooter className="justify-center">
            <Button onClick={() => setCancelTarget(null)} disabled={busy}>
              Keep order
            </Button>
            <Button
              variant="danger"
              onClick={confirmCancel}
              disabled={busy || !cancelReason.trim()}
              title={!cancelReason.trim() ? "A reason is required to cancel an order" : undefined}
            >
              {busy ? (
                <>
                  <Spinner className="size-4" /> Cancelling…
                </>
              ) : (
                "Cancel in SAP"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );

  // ── Detail view (read-only) ────────────────────────────────────────────────
  if (detailOrder) {
    const isCancellable = tab === "completed";
    return (
      <Page>
        <Breadcrumbs
          items={[
            { label: "Orders" },
            { label: "SO Cancel", onClick: () => setDetailOrder(null) },
            { label: detailOrder.order_number },
          ]}
        />
        <PageHeader
          title={detailOrder.order_number}
          description={detailOrder.card_name}
          badges={
            detailOrder.status_display ? (
              <Badge tone={toneForStatus(detailOrder.status_display)}>
                {detailOrder.status_display}
              </Badge>
            ) : null
          }
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => setInfoOpen(true)}
                title="Order information"
                className="border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
              >
                <HiOutlineInformationCircle aria-hidden="true" /> Info
              </Button>
              {isCancellable ? (
                <Button
                  variant="danger"
                  onClick={() =>
                    setCancelTarget({
                      id: detailOrder.id,
                      order_number: detailOrder.order_number,
                    })
                  }
                >
                  <HiOutlineNoSymbol aria-hidden="true" /> Cancel order
                </Button>
              ) : null}
            </>
          }
        />
        {detailOrder.cancellation_reason ? (
          <Notice tone="bad" title="Cancellation reason">
            {detailOrder.cancellation_reason}
          </Notice>
        ) : null}
        <Card>
          <OrderItemCards items={detailItems} />
        </Card>

        {/* The "i" order-information dialog — party, creator, addresses and any
            cancellation reason, in one place (same as the Mart Approval /
            View Orders detail). */}
        <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
          <DialogContent title={`Order ${detailOrder.order_number} information`} size="md">
            <DialogHeader>
              <DialogTitle>Order information</DialogTitle>
              {detailOrder.status_display ? (
                <Badge tone={toneForStatus(detailOrder.status_display)}>
                  {detailOrder.status_display}
                </Badge>
              ) : null}
            </DialogHeader>
            <DialogBody className="space-y-4">
              <DetailGrid>
                <DetailField
                  label="Party name"
                  value={`${detailOrder.card_name}${
                    detailOrder.card_code ? ` (${detailOrder.card_code})` : ""
                  }`}
                  span="full"
                />
                <DetailField
                  label="Punched by"
                  value={detailOrder.created_by_name || String(detailOrder.created_by ?? "")}
                />
                <DetailField label="Current stage" value={detailOrder.status_display} />
                <DetailField label="Party state" value={detailOrder.party_state} />
                <DetailField label="Delivery date" value={detailOrder.delivery_date} />
                <DetailField label="Warehouse" value={detailOrder.warehouse_code} />
                <DetailField label="Dispatch from" value={detailOrder.dispatch_from_name} />
                <DetailField label="PO number" value={detailOrder.po_number} />
                <DetailField
                  label="Bill to"
                  value={detailOrder.bill_to_address}
                  span="full"
                  hideWhenEmpty
                />
                <DetailField
                  label="Ship to"
                  value={detailOrder.ship_to_address}
                  span="full"
                  hideWhenEmpty
                />
                <DetailField
                  label="Comment"
                  value={detailOrder.remarks?.trim() ? detailOrder.remarks : ""}
                  span="full"
                  hideWhenEmpty
                />
              </DetailGrid>

              {detailOrder.cancellation_reason ? (
                <Notice tone="bad" title="Cancellation reason">
                  {detailOrder.cancellation_reason}
                </Notice>
              ) : null}
            </DialogBody>
          </DialogContent>
        </Dialog>

        {cancelDialog}
      </Page>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <Page>
      <Breadcrumbs items={[{ label: "Orders" }, { label: "SO Cancel" }]} />

      <PageHeader
        title="SO Cancel"
        description="Cancel a completed distributor order and reverse its SAP Sales Order."
      />

      <StatRow>
        <Stat
          icon={HiOutlineShoppingCart}
          tone="brand"
          label={`${TABS.find((t) => t.key === tab)?.label} orders`}
          value={orders.length}
          loading={loading}
          className="border-sky-200 bg-sky-50"
        />
        <Stat
          icon={HiOutlineQueueList}
          tone="neutral"
          label="Line items"
          value={lineCount}
          hint="across the list"
          loading={loading}
          className="border-violet-200 bg-violet-50"
        />
      </StatRow>

      <Card className="flex flex-wrap items-center justify-between gap-3 py-2.5">
        <TabList label="Order state">
          {TABS.map((t) => (
            <Tab
              key={t.key}
              selected={t.key === tab}
              onClick={() => {
                setTab(t.key);
                setPage(1);
                setDetailOrder(null);
              }}
            >
              {t.label}
            </Tab>
          ))}
        </TabList>
        <span className="text-[11.5px] text-subtle">Total: {orders.length}</span>
      </Card>

      {loading ? (
        <TableSkeleton columns={6} label="Loading orders" />
      ) : error ? (
        <Card>
          <EmptyState
            icon={HiOutlineExclamationTriangle}
            title="Could not load orders"
            hint={error}
          />
        </Card>
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineInbox}
            title={tab === "completed" ? "No completed orders" : "No cancelled orders"}
            hint={
              tab === "completed"
                ? "There are no SAP-posted distributor orders to cancel right now."
                : "Nothing has been cancelled yet."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead>Order ID</TableHead>
                  <TableHead>Card Name</TableHead>
                  <TableHead>Items</TableHead>
                  {tab === "completed" ? (
                    <>
                      <TableHead>SAP Doc #</TableHead>
                      <TableHead>Created At</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>Cancelled At</TableHead>
                      <TableHead>Reason</TableHead>
                    </>
                  )}
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap font-semibold text-brand">
                      {o.order_number}
                    </TableCell>
                    <TableCell className="text-ink">{o.card_name}</TableCell>
                    <TableCell>{o.items_count}</TableCell>
                    {tab === "completed" ? (
                      <>
                        <TableCell>
                          {docNumFor(o.id) != null ? (
                            <Badge tone="ok">#{docNumFor(o.id)}</Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>{fmtDateTime(o.created_at)}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{fmtDateTime(o.cancelled_at)}</TableCell>
                        <TableCell className="max-w-[22rem] truncate" title={o.cancellation_reason}>
                          {o.cancellation_reason || "—"}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onView(o)}
                          disabled={detailBusy}
                          aria-label={`View order ${o.order_number}`}
                          title="View order"
                          className="text-brand hover:bg-brand-soft hover:text-brand"
                        >
                          <HiOutlineEye aria-hidden="true" />
                        </Button>
                        {tab === "completed" ? (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setCancelReason("");
                              setCancelTarget({ id: o.id, order_number: o.order_number });
                            }}
                          >
                            SO Cancel
                          </Button>
                        ) : (
                          <Badge tone="neutral" className="gap-1">
                            <HiOutlineArchiveBoxXMark aria-hidden="true" className="size-3.5" />
                            Cancelled
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {!loading && !error && orders.length > itemsPerPage ? (
        <Pagination page={pageNumber} totalPages={totalPages} onPageChange={setPage} />
      ) : null}

      {cancelDialog}
    </Page>
  );
}

export default MartCancel;
