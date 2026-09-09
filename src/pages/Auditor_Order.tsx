import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentList,
  HiOutlineEye,
  HiOutlineGift,
  HiOutlineInbox,
  HiOutlineXCircle,
  HiOutlineXMark,
} from "react-icons/hi2";

import {
  getOrderItemSchemeNames,
  getOrderItemSchemeQtyText,
  getOrderItemTotalLtrs,
  ordersService,
} from "../services/ordersService";
import type { Order, OrderItem, OrderLog } from "../services/ordersService";
import { exportToExcel } from "../utils/excelExport";
import { useOrderQueue, useOrderDetailsFetcher } from "../lib/approvalQueries";
import api from "../services/api";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import {
  FilterBar,
  FilterCount,
  FilterDate,
  FilterSpacer,
} from "@/components/ui/filter-bar";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Page,
  PageHeader,
  Stat,
  StatRow,
} from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toneForStatus } from "@/components/ui/statusTone";
import {
  ApprovalBusyDialog,
  ApprovalConfirmDialog,
  ApprovalReviewDialog,
  ApprovalSuccessDialog,
  type ApprovalAction,
} from "@/components/orders/ApprovalDialogs";
import { OrderItemsTable } from "@/components/orders/OrderItemsTable";
import { OrderTimelineDialog } from "@/components/orders/OrderTimelineDialog";
import { OrderTotalsRow, VarietyCostCards } from "@/components/orders/OrderTotals";
import { orderTotals, varietyCosts } from "@/components/orders/orderDetail";

/**
 * The auditor's approval queue.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS CONVERSION REMOVED
 * ─────────────────────────────────────────────────────────────────────────
 * The page was 966 lines against a 780-line stylesheet shared with three
 * others. Almost none of it was specific to auditing:
 *
 *   the line-items table      → components/orders/OrderItemsTable
 *   the tracking timeline     → components/orders/OrderTimelineDialog
 *   the approve/reject flow   → components/orders/ApprovalDialogs
 *   the totals + variety cost → components/orders/OrderTotals
 *
 * `Billing_Order` and `Rate_Approver_Order` are the same screen with a
 * different status id and a different SAP call, so they take the same parts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE FIXED FOOTER BAR IS GONE
 * ─────────────────────────────────────────────────────────────────────────
 * The totals used to sit in a bar pinned to the bottom of the viewport, whose
 * `padding-left` was hard-coded to clear the sidebar — `calc(246px + ...)`,
 * against a sidebar that is 230px and a content area that starts at 220. It
 * had been ~26px out of alignment for as long as it has existed, and it could
 * not be right for both the expanded and collapsed rail at once.
 *
 * They are the KPI row at the top now, which is where a reviewer wants them
 * (what is this worth, then what is in it) and which needs no arithmetic
 * about the sidebar at all.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PARTY DETAIL IS ON THE PAGE, NOT BEHIND A BUTTON
 * ─────────────────────────────────────────────────────────────────────────
 * `PartyHeader` puts bill-to, ship-to, PO number and dispatch-from behind a
 * modal. On a screen whose entire purpose is to check an order before it
 * becomes a real Sales Order in SAP, those are the things being checked —
 * so they are a section of the page. `PartyHeader` is untouched and still
 * used by the screens where the party is context rather than the subject.
 */

const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0];

const formatCreatedDateTime = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function Auditor_orders() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  // Two-step approve/reject flow: review the order summary and enter a reason
  // (optional for approve, required for reject), then confirm before the API
  // call. Approve additionally pushes the order to SAP.
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [reviewAction, setReviewAction] = useState<ApprovalAction | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewStep, setReviewStep] = useState<"review" | "confirm">("review");
  const [showSuccess, setShowSuccess] = useState(false);
  const [quotationResult, setQuotationResult] = useState<{
    number: string;
    order_id: string;
    message: string;
  } | null>(null);
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const queryClient = useQueryClient();
  const fetchOrderDetails_ = useOrderDetailsFetcher();
  // No `refetchOrders`: its only caller was the redundant refetch that followed
  // `removeHandledOrder`'s invalidation, and the failure state here is a
  // message rather than a retry button.
  const { orders, isOrdersLoading, ordersFailed } = useOrderQueue(
    ["orders", "queue", "auditor"],
    () => ordersService.getOrders("AUDITOR_APPROVAL") as Promise<Order[]>,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
  const [trackingLogs, setTrackingLogs] = useState<OrderLog[]>([]);
  const [trackLogsLoading, setTrackLogsLoading] = useState(false);

  const fetchOrderDetails = async (orderId: number) => {
    try {
      // Shared ["order-details", id] cache: this page fetches the same order
      // twice — once to open the panel, again inside the Excel export.
      const data = await fetchOrderDetails_(orderId);

      setOrderDetails(data);
      setSelectedItems(data.items || []);
      setShowDetails(true);
    } catch (error) {
      console.log("Error fetching order details:", error);
    }
  };

  useEffect(() => {
    if (location.state?.openOrderId) {
      fetchOrderDetails(location.state.openOrderId);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // `fetchOrderDetails` is re-created every render and opens the detail
    // panel; listing it would re-open the panel on every render. This effect is
    // a one-shot handoff from a navigation, keyed on the incoming id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openOrderId, location.pathname, navigate]);

  const removeHandledOrder = (orderId: number) => {
    // Was a local `setOrders` filter. The `fetchOrders()` that followed every
    // caller made it a double removal; one invalidation does both.
    void queryClient.invalidateQueries({ queryKey: ["orders", "queue", "auditor"] });
    setSelectedItems([]);
    if (orderDetails?.id === orderId) {
      setOrderDetails(null);
      setShowDetails(false);
    }
  };

  // Step 1 — open the review dialog for an approve or reject action.
  const openReview = (order: Order, action: ApprovalAction) => {
    setShowDetails(false);
    setReviewOrder(order);
    setReviewAction(action);
    setReviewReason("");
    setReviewStep("review");
  };

  const closeReview = () => {
    setReviewOrder(null);
    setReviewAction(null);
    setReviewReason("");
    setReviewStep("review");
  };

  /*
   * Step 3 — the write. Approve pushes the order to SAP and only then moves its
   * status; reject just moves the status.
   *
   * The hand-rolled version owned an `isCreating` flag reset in a `finally`;
   * `useMutation` owns it as `isPending`, which cannot be left stuck on by a
   * path that returns before the reset.
   *
   * The two awaits stay in ONE mutation deliberately. They are one business
   * action: an order that reached SAP but whose status never moved is the
   * failure this page exists to avoid, and splitting them would let a caller
   * run the second without the first.
   */
  const reviewMutation = useMutation({
    mutationFn: async (vars: { order: Order; action: ApprovalAction; reason: string }) => {
      if (vars.action === "reject") {
        await ordersService.UpdateStatus(vars.order.id, 7, vars.reason);
        return null;
      }
      const salesResponse = await api.post("/sap/approve-sales-order/", {
        order_id: vars.order.id,
      });
      const sapData = salesResponse?.data?.data ?? salesResponse?.data;
      const quotationNumber = sapData?.DocNum ?? sapData?.doc_num ?? sapData?.DocEntry ?? "-";

      const response = await ordersService.UpdateStatus(
        vars.order.id,
        9,
        vars.reason || undefined,
      );
      return { quotationNumber: String(quotationNumber), message: response.message };
    },
    onSuccess: (result, vars) => {
      if (result) {
        setQuotationResult({
          number: result.quotationNumber,
          order_id: vars.order.order_number,
          message: result.message || "Order completed successfully",
        });
        removeHandledOrder(vars.order.id);
        setShowSuccess(true);
      } else {
        // Was `alert("Order Rejected")`. A browser dialog is a poor way to
        // confirm something the list is about to show anyway, and it is the
        // one piece of UI on the page nothing can style.
        showToast({
          title: "Order rejected",
          message: `${vars.order.order_number} has been sent back.`,
          orderNumber: vars.order.order_number,
        });
        removeHandledOrder(vars.order.id);
      }
      closeReview();
      window.dispatchEvent(new Event("refresh-notifications"));
    },
    onError: (error) => {
      showToast({
        title: "Could not complete the action",
        message: messageFrom(error, "Unknown error"),
      });
    },
  });

  const isCreating = reviewMutation.isPending;

  const submitReview = () => {
    if (!reviewOrder || !reviewAction) return;
    const reason = reviewReason.trim();
    // The dialog disables Continue without a reason, so this is a guard on the
    // write rather than the user's feedback — which is why it no longer
    // `alert()`s: by the time it can fire, nobody is looking at a form.
    if (reviewAction === "reject" && !reason) return;
    reviewMutation.mutate({ order: reviewOrder, action: reviewAction, reason });
  };

  const downloadExcel = async (order: Order) => {
    // The list API does not include line items; fetch full details on demand.
    let full = order;
    if (!order.items || order.items.length === 0) {
      try {
        full = await ordersService.getOrderDetails(order.id);
      } catch (error) {
        console.log("Error fetching order details for download:", error);
      }
    }

    // Raw values only — exportToExcel infers the Excel type per column, so dates
    // stay dates and money stays numeric and summable.
    let excelData: Record<string, unknown>[] = [];

    if (full.items && full.items.length > 0) {
      excelData = full.items.map((item: OrderItem) => ({
        "Order Number": full.order_number,
        "Card Code": full.card_code,
        "Card Name": full.card_name,
        "Delivery Date": full.delivery_date,
        Status: full.status_display,
        "Bill To": full.bill_to_address,
        "Ship To": full.ship_to_address,
        "Item Code": item.item_code,
        "Item Name": item.item_name,
        Scheme: getOrderItemSchemeNames(item),
        "Scheme Qty": getOrderItemSchemeQtyText(item),
        Qty: item.qty,
        Boxes: item.boxes,
        Liters: item.ltrs,
        "Total Ltrs": getOrderItemTotalLtrs(item),
        "Price List (Basic)": item.price_list_basic,
        "Basic Price": item.basic_price,
        "Total Amount": item.total,
      }));
    } else {
      excelData.push({
        "Order Number": full.order_number,
        "Card Code": full.card_code,
        "Card Name": full.card_name,
        "Delivery Date": full.delivery_date,
        Status: full.status_display,
        "Bill To": full.bill_to_address,
        "Ship To": full.ship_to_address,
        "Price List (Basic)": "",
        "Basic Price": "",
      });
    }

    await exportToExcel(excelData, {
      fileName: `Order_${full.order_number}.xlsx`,
      sheetName: "Order Details",
    });
  };

  const handleTrack = async (order: Order) => {
    setTrackingOrder(order);
    setShowTrackModal(true);
    setTrackingLogs([]);
    setTrackLogsLoading(true);
    try {
      const response = await ordersService.getOrderLogs(order.id);
      setTrackingLogs(Array.isArray(response) ? response : []);
    } catch (error) {
      console.log("Error fetching order logs:", error);
      setTrackingLogs([]);
    } finally {
      setTrackLogsLoading(false);
    }
  };

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (!fromDate || !toDate) return true;
        const orderDate = new Date(order.created_at);
        return (
          orderDate >= new Date(`${fromDate}T00:00:00.000`) &&
          orderDate <= new Date(`${toDate}T23:59:59.999`)
        );
      }),
    [orders, fromDate, toDate],
  );

  const focCount = filteredOrders.filter((order) => order.is_foc).length;
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const pageNumber = Math.min(currentPage, totalPages);
  const paginatedOrders = filteredOrders.slice(
    (pageNumber - 1) * itemsPerPage,
    pageNumber * itemsPerPage,
  );

  const detailTotals = useMemo(() => orderTotals(selectedItems), [selectedItems]);
  const detailVarieties = useMemo(() => varietyCosts(orderDetails), [orderDetails]);

  return (
    <Page>
      {/* ── LIST VIEW ── */}
      {!showDetails && (
        <>
          <Breadcrumbs items={[{ label: "Orders" }, { label: "Auditor Queue" }]} />

          <PageHeader
            title="Auditor Queue"
            description="Orders awaiting auditor approval before they are pushed to SAP."
          />

          <StatRow>
            <Stat
              icon={HiOutlineClipboardDocumentList}
              tone="brand"
              label="Awaiting review"
              value={filteredOrders.length}
              hint="matching filters"
              loading={isOrdersLoading}
            />
            <Stat
              icon={HiOutlineGift}
              // Amber, because an FOC order is a giveaway and is the one an
              // auditor should look at hardest. Neutral at zero: a coloured
              // chip on "0 FOC" reads as an alert about nothing.
              tone={focCount ? "hold" : "neutral"}
              label="FOC orders"
              value={focCount}
              loading={isOrdersLoading}
            />
          </StatRow>

          <FilterBar>
            <FilterDate
              label="From"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setCurrentPage(1);
              }}
            />
            <FilterDate
              label="To"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setCurrentPage(1);
              }}
            />
            {(fromDate || toDate) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setCurrentPage(1);
                }}
              >
                <HiOutlineXMark aria-hidden="true" /> Clear
              </Button>
            )}
            <FilterSpacer />
            <FilterCount>Total: {filteredOrders.length}</FilterCount>
          </FilterBar>

          {isOrdersLoading ? (
            <TableSkeleton columns={7} label="Loading orders" />
          ) : filteredOrders.length > 0 ? (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <Table density="compact">
                  <TableHeader>
                    <TableRow className="bg-surface hover:bg-surface">
                      <TableHead>Order ID</TableHead>
                      <TableHead>Card Name</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>FOC</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead>Delivery Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="whitespace-nowrap font-semibold text-brand">
                          {order.order_number}
                        </TableCell>
                        <TableCell className="text-ink">{order.card_name}</TableCell>
                        <TableCell>{order.items_count ?? order.items?.length ?? 0}</TableCell>
                        <TableCell>
                          {order.is_foc ? (
                            <Badge tone="note">FOC</Badge>
                          ) : (
                            <span className="text-subtle">-</span>
                          )}
                        </TableCell>
                        <TableCell>{formatCreatedDateTime(order.created_at)}</TableCell>
                        <TableCell>{order.delivery_date}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => fetchOrderDetails(order.id)}
                              aria-label={`View order ${order.order_number}`}
                              title="View order"
                            >
                              <HiOutlineEye aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleTrack(order)}
                              aria-label={`Track order ${order.order_number}`}
                              title="Track order"
                            >
                              <HiOutlineArrowPath aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => downloadExcel(order)}
                              aria-label={`Download order ${order.order_number}`}
                              title="Download order"
                            >
                              <HiOutlineArrowDownTray aria-hidden="true" />
                            </Button>
                            {/*
                              Approve and Reject are separated from the three
                              icon buttons by a rule. They are the only actions
                              on this row that write to SAP, and a row where
                              "download" and "push to SAP" are the same size
                              and shape is a row people mis-click.
                            */}
                            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
                            {/*
                              `success` / `danger`, not `primary` / `danger`.
                              Ten rows means ten of these, and `primary` is
                              "the one action a screen is FOR" — it cannot be
                              ten things. The soft pair also keeps the page's
                              only saturated blue in the navigation rail,
                              where it answers "where am I".
                            */}
                            <Button
                              size="sm"
                              variant="success"
                              onClick={() => openReview(order, "approve")}
                            >
                              <HiOutlineCheckCircle aria-hidden="true" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => openReview(order, "reject")}
                            >
                              <HiOutlineXCircle aria-hidden="true" /> Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={HiOutlineInbox}
                title={ordersFailed ? "Could not load orders" : "Nothing to review"}
                hint={
                  ordersFailed
                    ? "Refresh the page to try again."
                    : "No orders are waiting for auditor approval in this date range."
                }
              />
            </Card>
          )}

          {filteredOrders.length > itemsPerPage && (
            <Pagination
              page={pageNumber}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}

      {/* ── DETAIL VIEW ── */}
      {showDetails && orderDetails && (
        <>
          {/* A button, not a link: the detail view is state on this route, so
              navigating to /Auditor_orders would reload the page we are
              already on instead of closing the panel. It is also the way
              back, which is why there is no separate Back button. */}
          <Breadcrumbs
            items={[
              { label: "Orders" },
              { label: "Auditor Queue", onClick: () => setShowDetails(false) },
              { label: orderDetails.order_number },
            ]}
          />

          <PageHeader
            title={orderDetails.order_number}
            description={orderDetails.card_name}
            badges={
              <>
                {orderDetails.status_display ? (
                  <Badge tone={toneForStatus(orderDetails.status_display)}>
                    {orderDetails.status_display}
                  </Badge>
                ) : null}
                {orderDetails.is_foc ? <Badge tone="note">FOC</Badge> : null}
              </>
            }
            actions={
              <>
                {/* Tertiary actions are `ghost` — text and icon, no box.
                    A page header with four bordered buttons is four boxes for
                    two levels of importance. Only the decision this screen
                    exists for keeps a filled button; everything else is
                    available without competing for the eye. */}
                <Button variant="ghost" onClick={() => handleTrack(orderDetails)}>
                  <HiOutlineArrowPath aria-hidden="true" /> Track
                </Button>
                <Button variant="ghost" onClick={() => downloadExcel(orderDetails)}>
                  <HiOutlineArrowDownTray aria-hidden="true" /> Export Excel
                </Button>
                <Button variant="danger" onClick={() => openReview(orderDetails, "reject")}>
                  <HiOutlineXCircle aria-hidden="true" /> Reject
                </Button>
                <Button variant="primary" onClick={() => openReview(orderDetails, "approve")}>
                  <HiOutlineCheckCircle aria-hidden="true" /> Approve
                </Button>
              </>
            }
          />

          <OrderTotalsRow totals={detailTotals} itemCount={selectedItems.length} />

          <VarietyCostCards costs={detailVarieties} />

          {/* The five facts an approver actually checks, and nothing else.
              These were behind `PartyHeader`'s modal — one click away on the
              screen where they are the subject rather than context.

              It listed eleven at first, which is what `PartyHeader`'s modal
              showed. Card code duplicates the party name in the header;
              quotation number is blank until AFTER approval; created-at and
              created-by are provenance, not something being checked; dispatch
              point is a logistics decision made elsewhere. Eleven fields to
              carry five is how a reference panel turns into wallpaper.

              REMARK is the exception and is `hideWhenEmpty`: most orders have
              none, and the ones that do are usually saying why a previous
              reviewer sent it back — which is the first thing the next
              reviewer needs. It costs nothing when absent.

              A `Card` + `CardHeader`, exactly like Items below it, rather than
              a `DetailSection`: two section headings in two styles on one page
              is what a design system exists to stop, and a bordered section
              inside a bordered card drew the same edge twice. */}
          <Card>
            <CardHeader>
              <CardTitle>Party &amp; delivery</CardTitle>
            </CardHeader>
            <DetailGrid>
              <DetailField label="Party state" value={orderDetails.party_state} />
              <DetailField label="Delivery date" value={orderDetails.delivery_date} />
              <DetailField label="PO number" value={orderDetails.po_number} />
              <DetailField label="Bill to" value={orderDetails.bill_to_address} />
              <DetailField label="Ship to" value={orderDetails.ship_to_address} />
              <DetailField
                label="Remark"
                value={orderDetails.remarks?.trim() ? orderDetails.remarks : ""}
                span="full"
                hideWhenEmpty
              />
            </DetailGrid>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <Badge tone="neutral">{selectedItems.length}</Badge>
            </CardHeader>
            {/* `variety={false}`: the variety-cost cards above already state
                the split, and this table is fifteen columns wide as it is. */}
            <OrderItemsTable items={selectedItems} variety={false} />
          </Card>
        </>
      )}

      <ApprovalReviewDialog
        order={reviewStep === "review" ? reviewOrder : null}
        action={reviewStep === "review" ? reviewAction : null}
        reason={reviewReason}
        onReasonChange={setReviewReason}
        onContinue={() => setReviewStep("confirm")}
        onCancel={closeReview}
      />

      <ApprovalConfirmDialog
        order={reviewStep === "confirm" ? reviewOrder : null}
        action={reviewStep === "confirm" ? reviewAction : null}
        submitting={isCreating}
        approveMessage={(order) =>
          `Push order ${order.order_number} to SAP as a Sales Order?`
        }
        onConfirm={submitReview}
        onBack={() => setReviewStep("review")}
        onCancel={closeReview}
      />

      <ApprovalBusyDialog open={isCreating} orderNumber={reviewOrder?.order_number} />

      <ApprovalSuccessDialog
        open={Boolean(showSuccess && quotationResult)}
        result={quotationResult}
        onClose={() => {
          setShowSuccess(false);
          setQuotationResult(null);
        }}
      />

      <OrderTimelineDialog
        open={Boolean(showTrackModal && trackingOrder)}
        onOpenChange={(next) => {
          if (!next) {
            setShowTrackModal(false);
            setTrackingOrder(null);
            setTrackingLogs([]);
          }
        }}
        order={trackingOrder}
        logs={trackingLogs}
        loading={trackLogsLoading}
        formatDateTime={formatCreatedDateTime}
      />
    </Page>
  );
}
