import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineEye,
  HiOutlineInbox,
  HiOutlinePencilSquare,
  HiOutlineQueueList,
  HiOutlineShoppingCart,
  HiOutlineXCircle,
} from "react-icons/hi2";

import {
  ordersService,
  getOrderItemTotalLtrs,
  type MartOrderSummary,
  type Order,
  type OrderItem,
  type SalesOrderSapStatus,
} from "../../services/ordersService";
import { startExcelExport, exportDateStamp } from "../../utils/excelExport";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Stat,
  StatRow,
} from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
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
import { OrderItemsTable } from "@/components/orders/OrderItemsTable";
import { OrderTotalsRow } from "@/components/orders/OrderTotals";
import { orderTotals } from "@/components/orders/orderDetail";

/**
 * Mart Approval — the queue for the mart_approval role.
 *
 * Row actions: View, Edit (opens the full Add Sales form), Approve, Reject
 * (reason required) and Download. Edit / Approve / Reject only apply while the
 * order is still pending.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SAP TAB IS WHAT MAKES THIS DIFFERENT FROM THE OTHER QUEUES
 * ─────────────────────────────────────────────────────────────────────────
 * Approving here pushes to SAP, and that push can FAIL — leaving the order
 * "Mart Approved" rather than "Completed", visible on the Approved tab with
 * an error from SAP attached. Such an order gets Edit and "Resend to SAP"
 * back, which no other approval screen has. A successfully-created one is
 * read-only: view it, nothing more.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONVERSION NOTE
 * ─────────────────────────────────────────────────────────────────────────
 * This was the last page importing `styles/Auditor_Order.css` — it borrowed
 * the auditor detail view's classes wholesale for a screen that is not the
 * auditor's. With it converted, that 780-line stylesheet has no consumers.
 *
 * The inline `mart-error` / `mart-success` banners are gone: a message that
 * pushes the table down as it appears, and stays until the next action
 * replaces it, is what the toaster is for. The LOAD failure is not a toast —
 * it is a persistent state of the list, so it renders where the rows would be.
 */

/** Stable empties, so the render does not see a new identity every pass. */
const NO_MART_ORDERS: MartOrderSummary[] = [];
const NO_SAP_STATUSES: Record<string, SalesOrderSapStatus> = {};

type TabKey = "pending" | "approved" | "rejected";
const TABS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

type ActionTarget = { id: number; order_number: string };

function fmtDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function MartApproval() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>("pending");
  const queryClient = useQueryClient();
  /*
   * The list and the SAP statuses stay in ONE queryFn on purpose: the statuses
   * are looked up FROM the list's ids, and the old code force-cleared them to
   * {} on every non-Approved tab so a stale map could never paint "Created in
   * SAP" onto a Pending row. Two queries would reintroduce exactly that gap.
   */
  const {
    data: listData,
    isPending: loading,
    error: loadError,
  } = useQuery({
    queryKey: ["orders", "mart", tab],
    queryFn: async () => {
      const data = await ordersService.getMartOrders(tab);
      const list = Array.isArray(data) ? data : [];
      // Only the Approved tab can hold orders whose SAP push failed.
      if (tab === "approved" && list.length) {
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
  const error = loadError ? messageFrom(loadError, "Failed to load orders. Please try again.") : "";

  // Detail view: the full order + its items, plus whether it is still pending.
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailPending, setDetailPending] = useState(false);

  // Approve / reject targets (work from both the list and the detail view).
  const [approveTarget, setApproveTarget] = useState<ActionTarget | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ActionTarget | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Latest SAP push result per order (only fetched for the Approved tab, where
  // a failed push leaves the order "Mart Approved" instead of "Completed").
  /* Server-derived, but ALSO patched by a failed resend below, so it is state
     seeded from the query rather than the query data itself. */
  const [resendStatuses, setResendStatuses] = useState<Record<string, SalesOrderSapStatus> | null>(
    null,
  );
  const sapStatuses = resendStatuses ?? listData?.statuses ?? NO_SAP_STATUSES;
  const [resendingId, setResendingId] = useState<number | null>(null);

  const sapFor = (orderId: number) => sapStatuses[String(orderId)] ?? null;
  const isSapFailed = (orderId: number) => sapFor(orderId)?.status === "FAILED";
  const isCompletedStatus = (statusDisplay?: string) =>
    String(statusDisplay || "")
      .toLowerCase()
      .includes("complete");
  // In the Approved tab an order that reached 'Completed' pushed to SAP
  // successfully — it stays visible but only gets a View action.
  const isApprovedSuccess = (o: { status_display?: string }) =>
    tab === "approved" && isCompletedStatus(o.status_display);

  const isPendingTab = tab === "pending";
  const sapFailedCount = orders.filter((o) => isSapFailed(o.id)).length;
  // How much work is in the queue, as against how many orders — a queue of
  // three 40-line orders is not the same job as three single-line ones.
  const lineCount = orders.reduce((sum, o) => sum + Number(o.items_count || 0), 0);

  /** Re-read the current tab. */
  const loadList = async () => queryClient.invalidateQueries({ queryKey: ["orders", "mart"] });

  const onResend = async (target: ActionTarget) => {
    setResendingId(target.id);
    try {
      const res = await ordersService.resendMartOrderToSap(target.id);
      showToast({
        title: "Sent to SAP",
        message: res?.message || `Order ${target.order_number} sent to SAP.`,
        orderNumber: target.order_number,
      });
      setDetailOrder(null);
      await loadList();
    } catch (e) {
      showToast({
        title: "SAP push failed",
        message: messageFrom(e, "Failed to resend the order to SAP. Please try again."),
        orderNumber: target.order_number,
      });
      // Refresh SAP statuses so the (possibly new) error message shows.
      try {
        setResendStatuses(await ordersService.getSalesOrderSapStatus(orders.map((o) => o.id)));
      } catch {
        /* keep the previous statuses */
      }
    } finally {
      setResendingId(null);
    }
  };

  // --- actions --------------------------------------------------------------
  const onSee = async (order: MartOrderSummary) => {
    setBusy(true);
    try {
      const detail = await ordersService.getOrderDetails(order.id);
      setDetailOrder(detail);
      setDetailItems((detail.items as OrderItem[]) || []);
      setDetailPending(order.is_pending);
    } catch (e) {
      showToast({ title: "Could not open the order", message: messageFrom(e, "Please try again.") });
    } finally {
      setBusy(false);
    }
  };

  const onEdit = (target: ActionTarget) => {
    navigate("/Add_Sales", {
      state: { editOrderId: target.id, mode: "edit", returnTo: "/Mart_Approval" },
    });
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setBusy(true);
    try {
      await ordersService.approveMartOrder(approveTarget.id);
      showToast({
        title: "Order approved",
        message: `${approveTarget.order_number} has moved on in the Mart flow.`,
        orderNumber: approveTarget.order_number,
      });
      setApproveTarget(null);
      setDetailOrder(null);
      await loadList();
    } catch (e) {
      showToast({
        title: "Could not approve the order",
        message: messageFrom(e, "Please try again."),
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmReject = async () => {
    // The dialog disables its confirm without a reason, so this is a guard on
    // the write rather than the user's feedback.
    if (!rejectTarget || !rejectReason.trim()) return;
    setBusy(true);
    try {
      await ordersService.rejectMartOrder(rejectTarget.id, rejectReason.trim());
      showToast({
        title: "Order rejected",
        message: `${rejectTarget.order_number} has been sent back.`,
        orderNumber: rejectTarget.order_number,
      });
      setRejectTarget(null);
      setRejectReason("");
      setDetailOrder(null);
      await loadList();
    } catch (e) {
      showToast({
        title: "Could not reject the order",
        message: messageFrom(e, "Please try again."),
      });
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async (orderId: number, orderNumber: string) => {
    try {
      const detail = await ordersService.getOrderDetails(orderId);
      const rows = ((detail.items as OrderItem[]) || []).map((it) => ({
        "Order Number": orderNumber,
        "Item Code": it.item_code,
        Product: it.item_name,
        Category: it.category,
        Qty: Number(it.qty),
        Pcs: Number(it.pcs),
        Boxes: Number(it.boxes),
        Ltrs: Number(it.ltrs),
        "Total Ltrs": getOrderItemTotalLtrs(it),
        "Basic Price": Number(it.basic_price),
        "Tax %": Number(it.tax_rate),
        Amount: Number(it.total),
      }));
      startExcelExport(rows, {
        fileName: `MartOrder_${orderNumber}_${exportDateStamp()}`,
        sheetName: "Order",
      });
    } catch (e) {
      showToast({
        title: "Could not download the order",
        message: messageFrom(e, "Please try again."),
      });
    }
  };

  const detailTotals = orderTotals(detailItems);

  /** Approve and reject, shared by the list and the detail view. */
  const dialogs = (
    <>
      <Dialog
        open={Boolean(approveTarget)}
        onOpenChange={(next) => {
          if (!next && !busy) setApproveTarget(null);
        }}
      >
        {approveTarget ? (
          <DialogContent title="Approve order" size="sm" className="max-w-[440px]">
            <DialogBody className="text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-ok-soft text-ok"
              >
                <HiOutlineCheckCircle className="size-5" />
              </span>
              <h3 className="text-[16px] font-bold text-ink">
                Approve {approveTarget.order_number}?
              </h3>
              <p className="mt-1.5 text-[13px] text-subtle">
                Check the order carefully first. Approving pushes it to SAP and moves it on
                in the Mart flow.
              </p>
            </DialogBody>
            <DialogFooter className="justify-center">
              <Button onClick={() => setApproveTarget(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmApprove} disabled={busy}>
                {busy ? "Approving…" : "Yes, approve"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(next) => {
          if (!next && !busy) setRejectTarget(null);
        }}
      >
        {rejectTarget ? (
          <DialogContent title="Reject order" size="sm" className="max-w-[440px]">
            <DialogBody className="space-y-3">
              <div className="text-center">
                <span
                  aria-hidden="true"
                  className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-bad-soft text-bad"
                >
                  <HiOutlineXCircle className="size-5" />
                </span>
                <h3 className="text-[16px] font-bold text-ink">
                  Reject {rejectTarget.order_number}?
                </h3>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="mart-reject-reason"
                  className="block text-[11px] font-medium text-subtle"
                >
                  Reason (required)
                </label>
                {/* `[font-family:inherit]`: preflight is not imported and
                    `font-family` is not inherited by form controls, so without
                    it this renders in the UA font beside Inter. */}
                <textarea
                  id="mart-reject-reason"
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why is this rejected?"
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
              <Button onClick={() => setRejectTarget(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmReject}
                disabled={busy || !rejectReason.trim()}
                title={!rejectReason.trim() ? "A reason is required to reject an order" : undefined}
              >
                {busy ? "Rejecting…" : "Reject order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );

  // ── Detail view ───────────────────────────────────────────────────────────
  if (detailOrder) {
    const rejected = String(detailOrder.status_display || "")
      .toLowerCase()
      .includes("reject");
    const sapFailed = isSapFailed(detailOrder.id);

    return (
      <Page>
        <Breadcrumbs
          items={[
            { label: "Orders" },
            { label: "Mart Approval", onClick: () => setDetailOrder(null) },
            { label: detailOrder.order_number },
          ]}
        />

        <PageHeader
          title={detailOrder.order_number}
          description={detailOrder.card_name}
          badges={
            <>
              {detailOrder.status_display ? (
                <Badge tone={toneForStatus(detailOrder.status_display)}>
                  {detailOrder.status_display}
                </Badge>
              ) : null}
              {sapFailed ? <Badge tone="bad">SAP failed</Badge> : null}
            </>
          }
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => onDownload(detailOrder.id, detailOrder.order_number)}
              >
                <HiOutlineArrowDownTray aria-hidden="true" /> Export Excel
              </Button>
              {(sapFailed || detailPending) && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    onEdit({ id: detailOrder.id, order_number: detailOrder.order_number })
                  }
                >
                  <HiOutlinePencilSquare aria-hidden="true" /> Edit
                </Button>
              )}
              {sapFailed && (
                <Button
                  variant="primary"
                  disabled={resendingId === detailOrder.id}
                  onClick={() =>
                    onResend({ id: detailOrder.id, order_number: detailOrder.order_number })
                  }
                >
                  <HiOutlineArrowPath aria-hidden="true" />
                  {resendingId === detailOrder.id ? "Sending…" : "Resend to SAP"}
                </Button>
              )}
              {detailPending && (
                <>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setRejectReason("");
                      setRejectTarget({
                        id: detailOrder.id,
                        order_number: detailOrder.order_number,
                      });
                    }}
                  >
                    <HiOutlineXCircle aria-hidden="true" /> Reject
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() =>
                      setApproveTarget({
                        id: detailOrder.id,
                        order_number: detailOrder.order_number,
                      })
                    }
                  >
                    <HiOutlineCheckCircle aria-hidden="true" /> Approve
                  </Button>
                </>
              )}
            </>
          }
        />

        {/* Why this order is where it is. Above the numbers, because on a
            rejected or failed order it is the reason the reader opened it. */}
        {rejected && detailOrder.rejection_reason ? (
          <Notice tone="bad" title="Rejection reason">
            {detailOrder.rejection_reason}
          </Notice>
        ) : null}

        {sapFailed ? (
          <Notice tone="bad" title="SAP push failed">
            {sapFor(detailOrder.id)?.error_message || "SAP did not return an error message."}
          </Notice>
        ) : null}

        <OrderTotalsRow totals={detailTotals} itemCount={detailItems.length} />

        <Card>
          <CardHeader>
            <CardTitle>Party &amp; delivery</CardTitle>
          </CardHeader>
          <DetailGrid>
            <DetailField label="Party state" value={detailOrder.party_state} />
            <DetailField label="Delivery date" value={detailOrder.delivery_date} />
            <DetailField label="PO number" value={detailOrder.po_number} />
            <DetailField label="Bill to" value={detailOrder.bill_to_address} />
            <DetailField label="Ship to" value={detailOrder.ship_to_address} />
            <DetailField
              label="Remark"
              value={detailOrder.remarks?.trim() ? detailOrder.remarks : ""}
              span="full"
              hideWhenEmpty
            />
          </DetailGrid>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <Badge tone="neutral">{detailItems.length}</Badge>
          </CardHeader>
          <OrderItemsTable items={detailItems} variety={false} />
        </Card>

        {dialogs}
      </Page>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <Page>
      <Breadcrumbs items={[{ label: "Orders" }, { label: "Mart Approval" }]} />

      <PageHeader
        title="Mart Approval"
        description="Review and action distributor (Mart) orders."
      />

      <StatRow>
        <Stat
          icon={HiOutlineShoppingCart}
          tone="brand"
          label={`${TABS.find((t) => t.key === tab)?.label} orders`}
          value={orders.length}
          loading={loading}
        />
        <Stat
          icon={HiOutlineQueueList}
          tone="neutral"
          label="Line items"
          value={lineCount}
          hint="across the queue"
          loading={loading}
        />
        {/* Only the Approved tab can hold a failed push, so the tile only
            appears where it can be non-zero — a permanent "SAP failed: 0" on
            the Pending tab is a tile that never says anything. */}
        {tab === "approved" ? (
          <Stat
            icon={HiOutlineExclamationTriangle}
            tone={sapFailedCount ? "bad" : "neutral"}
            label="SAP push failed"
            value={sapFailedCount}
            hint={sapFailedCount ? "needs a resend" : undefined}
            loading={loading}
          />
        ) : null}
      </StatRow>

      <Card className="flex flex-wrap items-center justify-between gap-3 py-2.5">
        <TabList label="Order state">
          {TABS.map((t) => (
            <Tab
              key={t.key}
              selected={t.key === tab}
              onClick={() => {
                setTab(t.key);
                // Was a bare `setDetailOrder(null)` in a `[tab]` effect —
                // setState derived from state.
                setDetailOrder(null);
                setResendStatuses(null);
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
            title={`No ${tab} orders`}
            hint="Nothing in this state right now."
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
                  <TableHead>Created At</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap font-semibold text-brand">
                      {o.order_number}
                    </TableCell>
                    <TableCell className="text-ink">
                      <span className="flex flex-wrap items-center gap-2">
                        {o.card_name}
                        {isSapFailed(o.id) ? (
                          <Badge
                            tone="bad"
                            title={sapFor(o.id)?.error_message || "SAP push failed"}
                          >
                            SAP failed
                          </Badge>
                        ) : null}
                        {isApprovedSuccess(o) ? (
                          <Badge tone="ok">
                            Created in SAP
                            {sapFor(o.id)?.doc_num != null ? ` #${sapFor(o.id)?.doc_num}` : ""}
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>{o.items_count}</TableCell>
                    <TableCell>{fmtDateTime(o.created_at)}</TableCell>
                    <TableCell>{o.delivery_date || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onSee(o)}
                          disabled={busy}
                          aria-label={`View order ${o.order_number}`}
                          title="View order"
                        >
                          <HiOutlineEye aria-hidden="true" />
                        </Button>

                        {/* A successfully-created order is read-only: it exists
                            in SAP, so editing or re-pushing it here would make
                            this app disagree with the system of record. */}
                        {!isApprovedSuccess(o) && (
                          <>
                            {(isSapFailed(o.id) || isPendingTab) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onEdit({ id: o.id, order_number: o.order_number })}
                                aria-label={`Edit order ${o.order_number}`}
                                title="Edit order"
                              >
                                <HiOutlinePencilSquare aria-hidden="true" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onDownload(o.id, o.order_number)}
                              aria-label={`Download order ${o.order_number}`}
                              title="Download order"
                            >
                              <HiOutlineArrowDownTray aria-hidden="true" />
                            </Button>

                            {(isSapFailed(o.id) || isPendingTab) && (
                              <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
                            )}

                            {isSapFailed(o.id) && (
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() => onResend({ id: o.id, order_number: o.order_number })}
                                disabled={resendingId === o.id}
                              >
                                <HiOutlineArrowPath aria-hidden="true" />
                                {resendingId === o.id ? "Sending…" : "Resend to SAP"}
                              </Button>
                            )}

                            {isPendingTab && (
                              <>
                                <Button
                                  size="sm"
                                  variant="success"
                                  onClick={() =>
                                    setApproveTarget({ id: o.id, order_number: o.order_number })
                                  }
                                >
                                  <HiOutlineCheckCircle aria-hidden="true" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => {
                                    setRejectReason("");
                                    setRejectTarget({ id: o.id, order_number: o.order_number });
                                  }}
                                >
                                  <HiOutlineXCircle aria-hidden="true" /> Reject
                                </Button>
                              </>
                            )}
                          </>
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

      {dialogs}
    </Page>
  );
}

export default MartApproval;
