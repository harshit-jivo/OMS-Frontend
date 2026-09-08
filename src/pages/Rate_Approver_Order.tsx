import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineArrowDownTray,
  HiOutlineCheckCircle,
  HiOutlineCurrencyRupee,
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
import type { Order, OrderItem } from "../services/ordersService";
import { exportToExcel } from "../utils/excelExport";
import { useOrderQueue, useOrderDetailsFetcher } from "../lib/approvalQueries";
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
import { OrderTotalsRow, VarietyCostCards } from "@/components/orders/OrderTotals";
import { orderTotals, varietyCosts } from "@/components/orders/orderDetail";

/**
 * The rate approver's queue.
 *
 * Structurally identical to `Auditor_Order` — the same list, the same detail
 * view, the same two-step approve/reject — differing only in which status the
 * write moves the order to and in what approval MEANS here. Both now compose
 * the same parts out of `components/orders/`, so the two screens can no longer
 * drift the way they had: the approver's copy of the line-items table had lost
 * its variety column and its empty-row `colSpan` was two short.
 *
 * WHAT IS DIFFERENT, AND IT MATTERS
 * ---------------------------------
 * Approving here does NOT touch SAP. It moves the order on to the auditor,
 * who is the one that pushes it. So there is no busy overlay wrapped around a
 * network call that must not be interrupted, and the confirm dialog says what
 * actually happens rather than borrowing the auditor's "push to SAP" wording.
 */

const RATE_APPROVAL_STATUS = "RATE_APPROVAL";
const RATE_APPROVER_APPROVED_STATUS = 6;
const RATE_APPROVER_REJECTED_STATUS = 7;

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

export default function RateApproverOrders() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  // Two-step approve/reject flow: review the order summary and enter a reason
  // (optional for approve, required for reject), then confirm before the API
  // call.
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [reviewAction, setReviewAction] = useState<ApprovalAction | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewStep, setReviewStep] = useState<"review" | "confirm">("review");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const queryClient = useQueryClient();
  const fetchOrderDetails_ = useOrderDetailsFetcher();
  // No `refetchOrders`: its only caller was the redundant refetch that followed
  // `removeHandledOrder`'s invalidation, and the failure state here is a
  // message rather than a retry button.
  const { orders, isOrdersLoading, ordersFailed } = useOrderQueue(
    ["orders", "queue", "rate-approver"],
    () => ordersService.getOrders(RATE_APPROVAL_STATUS, false, true) as Promise<Order[]>,
  );
  const [showAcceptSuccess, setShowAcceptSuccess] = useState(false);
  const [acceptSuccessInfo, setAcceptSuccessInfo] = useState<{
    number: string;
    order_id: string;
    message: string;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Both spellings are dispatched in this codebase and both are listened for;
  // sending one only would silently skip half the listeners.
  const refreshNotifications = () => {
    window.dispatchEvent(new Event("refreshNotifications"));
    window.dispatchEvent(new Event("refresh-notifications"));
  };

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
    // Was a local `setOrders` filter. The `fetchOrders()` that follows every
    // caller made it a double removal; one invalidation does both.
    void queryClient.invalidateQueries({ queryKey: ["orders", "queue", "rate-approver"] });
    setSelectedItems([]);
    if (orderDetails?.id === orderId) {
      setOrderDetails(null);
      setShowDetails(false);
    }
  };

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
   * The write.
   *
   * The hand-rolled version owned an `isProcessing` flag reset in a `finally`;
   * `useMutation` owns it as `isPending`, which cannot be left stuck on by a
   * path that returns before the reset. That flag also drives a blocking
   * dialog, so a stuck one is not merely a disabled button.
   */
  const reviewMutation = useMutation({
    mutationFn: async (vars: { order: Order; action: ApprovalAction; reason: string }) => {
      if (vars.action === "approve") {
        return await ordersService.UpdateStatus(
          vars.order.id,
          RATE_APPROVER_APPROVED_STATUS,
          vars.reason || "Approved",
        );
      }
      await ordersService.UpdateStatus(vars.order.id, RATE_APPROVER_REJECTED_STATUS, vars.reason);
      return null;
    },
    onSuccess: (response, vars) => {
      if (vars.action === "approve") {
        setAcceptSuccessInfo({
          number: response?.status || "-",
          order_id: vars.order.order_number,
          message: response?.message || "Order approved successfully",
        });
        removeHandledOrder(vars.order.id);
        setShowAcceptSuccess(true);
      } else {
        // Was `alert("Order Rejected")` — a browser dialog confirming
        // something the list is about to show anyway.
        showToast({
          title: "Order rejected",
          message: `${vars.order.order_number} has been sent back.`,
          orderNumber: vars.order.order_number,
        });
        removeHandledOrder(vars.order.id);
      }
      closeReview();
      refreshNotifications();
    },
    onError: (error) => {
      showToast({
        title: "Could not complete the action",
        message: messageFrom(error, "Something went wrong"),
      });
    },
  });

  const isProcessing = reviewMutation.isPending;

  const submitReview = () => {
    if (!reviewOrder || !reviewAction) return;
    const reason = reviewReason.trim();
    // The dialog disables Continue without a reason, so this is a guard on the
    // write rather than the user's feedback.
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
          <Breadcrumbs items={[{ label: "Orders" }, { label: "Approver Queue" }]} />

          <PageHeader
            title="Approver Queue"
            description="Orders whose rates need approval before they reach the auditor."
          />

          <StatRow>
            <Stat
              icon={HiOutlineCurrencyRupee}
              tone="brand"
              label="Awaiting rate approval"
              value={filteredOrders.length}
              hint="matching filters"
              loading={isOrdersLoading}
            />
            <Stat
              icon={HiOutlineGift}
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
                              onClick={() => downloadExcel(order)}
                              aria-label={`Download order ${order.order_number}`}
                              title="Download order"
                            >
                              <HiOutlineArrowDownTray aria-hidden="true" />
                            </Button>
                            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
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
                title={ordersFailed ? "Could not load orders" : "Nothing to approve"}
                hint={
                  ordersFailed
                    ? "Refresh the page to try again."
                    : "No orders are waiting for rate approval in this date range."
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
          <Breadcrumbs
            items={[
              { label: "Orders" },
              { label: "Approver Queue", onClick: () => setShowDetails(false) },
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
                <Button variant="ghost" onClick={() => downloadExcel(orderDetails)}>
                  <HiOutlineArrowDownTray aria-hidden="true" /> Export Excel
                </Button>
                <Button
                  variant="danger"
                  disabled={isProcessing}
                  onClick={() => openReview(orderDetails, "reject")}
                >
                  <HiOutlineXCircle aria-hidden="true" /> Reject
                </Button>
                {/* `primary` here and `success` in the list: this view has ONE
                    approve on it, and it is what the screen is for. */}
                <Button
                  variant="primary"
                  disabled={isProcessing}
                  onClick={() => openReview(orderDetails, "approve")}
                >
                  <HiOutlineCheckCircle aria-hidden="true" /> Approve
                </Button>
              </>
            }
          />

          <OrderTotalsRow totals={detailTotals} itemCount={selectedItems.length} />

          <VarietyCostCards costs={detailVarieties} />

          {/* The five facts an approver checks. See `Auditor_Order` for why
              the other six that `PartyHeader`'s modal showed are not here. */}
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
            {/* Rates are what this screen approves, so the per-line variety
                matters here in a way it does not on the auditor's queue. */}
            <OrderItemsTable items={selectedItems} />
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
        submitting={isProcessing}
        // Not "push to SAP": approving here passes the order to the auditor,
        // who is the one that does that.
        approveMessage={(order) =>
          `Approve the rates on ${order.order_number} and send it to the auditor?`
        }
        onConfirm={submitReview}
        onBack={() => setReviewStep("review")}
        onCancel={closeReview}
      />

      <ApprovalBusyDialog
        open={isProcessing}
        orderNumber={reviewOrder?.order_number}
        heading="Updating order"
        message="Recording the decision."
      />

      <ApprovalSuccessDialog
        open={Boolean(showAcceptSuccess && acceptSuccessInfo)}
        result={acceptSuccessInfo}
        numberLabel="Next status"
        onClose={() => {
          setShowAcceptSuccess(false);
          setAcceptSuccessInfo(null);
        }}
      />
    </Page>
  );
}
