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
  HiOutlineInformationCircle,
  HiOutlinePencilSquare,
  HiOutlineQueueList,
  HiOutlineShoppingCart,
  HiOutlineBuildingStorefront,
  HiOutlineXCircle,
  HiCube,
  HiInboxStack,
  HiBeaker,
  HiBanknotes,
  HiCurrencyRupee,
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
import { errorBody, messageFrom } from "@/lib/apiError";
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
  DialogHeader,
  DialogTitle,
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
import { FilterSelect } from "@/components/ui/filter-bar";
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

function fmtDateTime(iso?: string | null) {
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
  // The "i" order-information dialog on the detail view (same as the
  // distributor's View Orders detail).
  const [infoOpen, setInfoOpen] = useState(false);

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

  // Party-name filter — narrows the current tab's orders to a single Mart
  // distributor. The options are the parties actually present in the loaded
  // list, so the dropdown never offers a party that isn't in this tab.
  const [partyFilter, setPartyFilter] = useState("");
  const partyOptions = Array.from(
    orders
      .reduce((map, o) => {
        const name = String(o.card_name || "").trim();
        if (name && !map.has(name)) map.set(name, o.card_code || name);
        return map;
      }, new Map<string, string>())
      .entries(),
  ).sort((a, b) => a[0].localeCompare(b[0]));
  const filteredOrders = partyFilter
    ? orders.filter((o) => o.card_name === partyFilter || o.card_code === partyFilter)
    : orders;

  // Client-side pagination, 10 rows a page. Clamp the page rather than track it
  // with an effect, so switching tabs (fewer rows) can't strand an empty page.
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const pageNumber = Math.min(page, totalPages);
  const pageOrders = filteredOrders.slice(
    (pageNumber - 1) * itemsPerPage,
    pageNumber * itemsPerPage,
  );

  const isPendingTab = tab === "pending";
  const sapFailedCount = filteredOrders.filter((o) => isSapFailed(o.id)).length;
  // How much work is in the queue, as against how many orders — a queue of
  // three 40-line orders is not the same job as three single-line ones.
  const lineCount = filteredOrders.reduce((sum, o) => sum + Number(o.items_count || 0), 0);

  /** Re-read the current tab. */
  const loadList = async () => queryClient.invalidateQueries({ queryKey: ["orders", "mart"] });

  const onResend = async (target: ActionTarget) => {
    setResendingId(target.id);
    try {
      const res = await ordersService.resendMartOrderToSap(target.id);
      showToast({
        tone: "success",
        title: "Sent to SAP",
        message: res?.message || `Order ${target.order_number} sent to SAP.`,
        orderNumber: target.order_number,
      });
      setDetailOrder(null);
      await loadList();
    } catch (e) {
      showToast({
        tone: "error",
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
      showToast({
        tone: "error",
        title: "Could not open the order",
        message: messageFrom(e, "Please try again."),
      });
    } finally {
      setBusy(false);
    }
  };

  const onEdit = (target: ActionTarget) => {
    // Mart orders edit on the dedicated Mart editor, not the oil/beverage
    // Add Sales form.
    navigate("/Mart_Edit_Order", {
      state: { editOrderId: target.id, returnTo: "/Mart_Approval" },
    });
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    const target = approveTarget;
    setBusy(true);
    try {
      const res = await ordersService.approveMartOrder(target.id);
      // Tell the user whether the SAP sales order was actually created.
      const docNum = res?.sap?.doc_num;
      showToast({
        tone: "success",
        title: "Order approved",
        message: docNum
          ? `${target.order_number} approved — SAP sales order #${docNum} created.`
          : res?.message || `${target.order_number} approved and sent to SAP.`,
        orderNumber: target.order_number,
      });
    } catch (e) {
      // A 502 carrying `sap_state` means the order WAS approved but the SAP push
      // failed — it now sits on the Approved tab with a "SAP failed" badge, so
      // it is not a plain failure. Anything else is a real approve failure.
      const sapFailed = Boolean(errorBody(e)?.sap_state);
      showToast({
        tone: "error",
        title: sapFailed ? "Approved — but SAP failed" : "Could not approve the order",
        message: messageFrom(
          e,
          sapFailed
            ? "The order was approved but could not be created in SAP."
            : "Please try again.",
        ),
        orderNumber: target.order_number,
      });
    } finally {
      // Always close the confirm dialog and refresh the list, whatever happened.
      setApproveTarget(null);
      setDetailOrder(null);
      setBusy(false);
      await loadList();
    }
  };

  const confirmReject = async () => {
    // The dialog disables its confirm without a reason, so this is a guard on
    // the write rather than the user's feedback.
    if (!rejectTarget || !rejectReason.trim()) return;
    const target = rejectTarget;
    setBusy(true);
    try {
      await ordersService.rejectMartOrder(target.id, rejectReason.trim());
      showToast({
        tone: "success",
        title: "Order rejected",
        message: `${target.order_number} has been sent back.`,
        orderNumber: target.order_number,
      });
    } catch (e) {
      showToast({
        tone: "error",
        title: "Could not reject the order",
        message: messageFrom(e, "Please try again."),
        orderNumber: target.order_number,
      });
    } finally {
      // Always close the dialog and refresh, whatever the outcome.
      setRejectTarget(null);
      setRejectReason("");
      setDetailOrder(null);
      setBusy(false);
      await loadList();
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
        tone: "error",
        title: "Could not download the order",
        message: messageFrom(e, "Please try again."),
      });
    }
  };

  const detailTotals = orderTotals(detailItems);
  const detailQty = detailItems.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const detailBoxes = detailItems.reduce((s, it) => s + (Number(it.boxes) || 0), 0);

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
                {busy ? (
                  <>
                    <Spinner className="size-4" /> Approving…
                  </>
                ) : (
                  "Yes, approve"
                )}
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
                {busy ? (
                  <>
                    <Spinner className="size-4" /> Rejecting…
                  </>
                ) : (
                  "Reject order"
                )}
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
            { label: "Orders", onClick: () => setDetailOrder(null) },
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
                onClick={() => setInfoOpen(true)}
                title="Order information"
                className="border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
              >
                <HiOutlineInformationCircle aria-hidden="true" /> Info
              </Button>
              <Button
                variant="success"
                onClick={() => onDownload(detailOrder.id, detailOrder.order_number)}
                className="border-transparent bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:text-white"
              >
                <HiOutlineArrowDownTray aria-hidden="true" /> Export Excel
              </Button>
              {(sapFailed || detailPending) && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    onEdit({ id: detailOrder.id, order_number: detailOrder.order_number })
                  }
                  className="border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
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

        {/* Totals — same coloured KPI row as the distributor's View Orders
            detail, so the same order reads identically on either screen. */}
        <StatRow>
          <Stat
            icon={HiCube}
            tone="neutral"
            label="Total QTY"
            value={detailQty.toLocaleString("en-IN")}
            className="border-sky-200 bg-sky-50"
          />
          <Stat
            icon={HiInboxStack}
            tone="neutral"
            label="Total Boxes"
            value={detailBoxes.toLocaleString("en-IN")}
            className="border-amber-200 bg-amber-50"
          />
          <Stat
            icon={HiBeaker}
            tone="neutral"
            label="Total Ltrs"
            value={detailTotals.litres.toFixed(2)}
            className="border-teal-200 bg-teal-50"
          />
          <Stat
            icon={HiBanknotes}
            tone="neutral"
            label="Total Amount"
            value={detailTotals.subtotal.toFixed(2)}
            className="border-violet-200 bg-violet-50"
          />
          <Stat
            icon={HiCurrencyRupee}
            tone="brand"
            label="Grand Total (incl. tax)"
            value={detailTotals.grand.toFixed(2)}
            hint={`${detailItems.length} item${detailItems.length === 1 ? "" : "s"}`}
            className="border-brand/30 bg-brand/[0.08]"
          />
        </StatRow>

        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <Badge tone="neutral">{detailItems.length}</Badge>
          </CardHeader>
          <OrderItemCards items={detailItems} />
        </Card>

        {/* The "i" info dialog — addresses, delivery, creator, current stage,
            rejection reason: the same set the distributor detail shows. */}
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

              {rejected && detailOrder.rejection_reason ? (
                <Notice tone="bad" title="Rejection reason">
                  {detailOrder.rejection_reason}
                </Notice>
              ) : null}
              {sapFailed ? (
                <Notice tone="bad" title="SAP error">
                  {sapFor(detailOrder.id)?.error_message || "SAP did not return an error message."}
                </Notice>
              ) : null}
            </DialogBody>
          </DialogContent>
        </Dialog>

        {dialogs}
      </Page>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <Page>
      <Breadcrumbs items={[{ label: "Orders" }]} />

      <PageHeader
        title="Orders"
        description="Review and action distributor (Mart) orders."
      />

      <StatRow>
        <Stat
          icon={HiOutlineShoppingCart}
          tone="brand"
          label={`${TABS.find((t) => t.key === tab)?.label} orders`}
          value={filteredOrders.length}
          loading={loading}
          className="border-sky-200 bg-sky-50"
        />
        <Stat
          icon={HiOutlineQueueList}
          tone="neutral"
          label="Line items"
          value={lineCount}
          hint="across the queue"
          loading={loading}
          className="border-violet-200 bg-violet-50"
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
            className={sapFailedCount ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}
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
                setPage(1);
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
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Party"
            icon={HiOutlineBuildingStorefront}
            value={partyFilter}
            onChange={(e) => {
              setPartyFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Parties</option>
            {partyOptions.map(([name, code]) => (
              <option key={code} value={name}>
                {name}
              </option>
            ))}
          </FilterSelect>
          <span className="text-[11.5px] text-subtle">Total: {filteredOrders.length}</span>
        </div>
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
      ) : filteredOrders.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineInbox}
            title={`No ${tab} orders`}
            hint={
              partyFilter
                ? "No orders for that party in this state. Clear the filter to see them all."
                : "Nothing in this state right now."
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
                  <TableHead>Created At</TableHead>
                  {tab === "rejected" ? (
                    <>
                      <TableHead>Rejected At</TableHead>
                      <TableHead>Reject Reason</TableHead>
                    </>
                  ) : (
                    <TableHead>Delivery Date</TableHead>
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
                    {tab === "rejected" ? (
                      <>
                        <TableCell>{fmtDateTime(o.rejected_at)}</TableCell>
                        <TableCell className="max-w-[24rem] truncate" title={o.rejection_reason}>
                          {o.rejection_reason || "—"}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell>{o.delivery_date || "—"}</TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onSee(o)}
                          disabled={busy}
                          aria-label={`View order ${o.order_number}`}
                          title="View order"
                          className="text-brand hover:bg-brand-soft hover:text-brand"
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
                                className="[&_svg]:text-amber-600 hover:bg-amber-50 hover:[&_svg]:text-amber-700"
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
                              className="[&_svg]:text-emerald-600 hover:bg-emerald-50 hover:[&_svg]:text-emerald-700"
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

      {!loading && !error && filteredOrders.length > itemsPerPage ? (
        <Pagination page={pageNumber} totalPages={totalPages} onPageChange={setPage} />
      ) : null}

      {dialogs}
    </Page>
  );
}

export default MartApproval;
