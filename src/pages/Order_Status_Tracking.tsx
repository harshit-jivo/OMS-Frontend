import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineEye,
  HiOutlineFunnel,
  HiOutlineInbox,
  HiOutlineMagnifyingGlass,
  HiOutlineXCircle,
} from "react-icons/hi2";

import { exportToExcel } from "../utils/excelExport";
import type { Order, OrderItem, OrderLog, RateApproval } from "../services/ordersService";
import { getOrderItemTotalLtrs, ordersService } from "../services/ordersService";
import { buildOrderTimelineLogs } from "../utils/orderTrackingTimeline";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import {
  FilterBar,
  FilterCount,
  FilterDate,
  FilterSearch,
  FilterSelect,
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
import { OrderItemsTable } from "@/components/orders/OrderItemsTable";
import {
  OrderTimeline,
  OrderTimelineDialog,
} from "@/components/orders/OrderTimelineDialog";
import { OrderTotalsRow, VarietyCostCards } from "@/components/orders/OrderTotals";
import { orderTotals, varietyCosts } from "@/components/orders/orderDetail";
import {
  RATE_APPROVER_TRACKING_FALLBACK_STATUS,
  getDecisionType,
  normalizeTrackingOrders,
  type TrackingMode,
} from "@/components/orders/trackingDecision";

/**
 * What happened to the orders I acted on — one screen, three routes.
 *
 * `mode` is the whole difference between /Auditor_status_tracking,
 * /Billing_status_tracking and /Rate_Approver_status_tracking: it decides
 * which queue is read and, in `getDecisionType` below, what "accepted" means
 * from that desk's point of view. Converting this file therefore converts
 * three screens.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT CAME OUT
 * ─────────────────────────────────────────────────────────────────────────
 * The page was 1,024 lines against TWO stylesheets — its own 709-line
 * `Order_Status_Tracking.css` plus `Auditor_Order.css`, which it imported
 * purely to borrow the detail view's classes from a page it is not.
 *
 * It rendered the tracking timeline TWICE from the same data: once inline for
 * billing orders, once inside the track dialog, with two sets of markup. Both
 * now come from `components/orders/OrderTimeline`, so a change to how a log
 * entry reads lands in one place.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE STATUS VOCABULARY IS THE POINT, AND IT IS UNTOUCHED
 * ─────────────────────────────────────────────────────────────────────────
 * `getDecisionType` and the keyword tables above it are the only genuinely
 * hard thing on this page: the API returns human status labels rather than
 * ids, so "did MY desk accept this" is answered by matching strings, and each
 * desk answers it differently — an order REJECTED by the auditor counts as
 * ACCEPTED from billing's point of view, because billing did its part before
 * the auditor saw it. None of that logic changed here.
 */

/** Stable empty, so the `useMemo` chains below settle. */
const NO_ORDERS: Order[] = [];

type OrderStatusTrackingProps = {
  mode: TrackingMode;
};

const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0];

const MODE_LABEL: Record<TrackingMode, string> = {
  auditor: "Auditor Tracking",
  billing: "Billing Tracking",
  rate_approver: "Approver Tracking",
};

const MODE_DESCRIPTION: Record<TrackingMode, string> = {
  auditor: "Orders this desk has already accepted or rejected.",
  billing: "Orders this desk has already accepted or rejected.",
  rate_approver: "Orders whose rates this desk has already approved or rejected.",
};

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




export default function Order_Status_Tracking({ mode }: OrderStatusTrackingProps) {
  const [decisionFilter, setDecisionFilter] = useState<"all" | "accepted" | "rejected">("all");
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [searchInput, setSearchInput] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [orderLogs, setOrderLogs] = useState<OrderLog[]>([]);

  const itemsPerPage = 10;
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
  const [trackingLogs, setTrackingLogs] = useState<OrderLog[]>([]);
  const [trackLogsLoading, setTrackLogsLoading] = useState(false);
  // The rate approver hands off rather than moving an order along a queue, so
  // there is no per-order progress trail to open from its rows.
  const showTrackAction = mode !== "rate_approver";

  /*
   * `mode` is part of the query key — this page is mounted three times under
   * three routes, one per mode, and each has its own cache entry instead of a
   * refetch on every navigation between them.
   *
   * The rate_approver fallback stays INSIDE the queryFn. Splitting it into a
   * second query would change behaviour: it fires only when the primary call
   * returns nothing, and the two together are one logical read.
   */
  const { data: orders = NO_ORDERS, isPending: isOrdersLoading } = useQuery({
    queryKey: ["orders", "status-tracking", mode],
    queryFn: async () => {
      let data = await ordersService.getStatusTrackingOrders(mode);
      if (mode === "rate_approver" && (!Array.isArray(data) || data.length === 0)) {
        data = await ordersService.getOrders(RATE_APPROVER_TRACKING_FALLBACK_STATUS);
      }
      return normalizeTrackingOrders(Array.isArray(data) ? data : [], mode);
    },
  });

  const trackedOrders = useMemo(
    () => orders.filter((order) => getDecisionType(order, mode) !== "other"),
    [orders, mode],
  );

  // The date and name filters, WITHOUT the accepted/rejected one — the KPI
  // counts are taken from here, so they keep describing the whole period
  // rather than collapsing to "3 accepted, 0 rejected" the moment you filter
  // to accepted.
  const dateFilteredOrders = useMemo(() => {
    const search = searchInput.trim().toLowerCase();
    return trackedOrders.filter((order) => {
      let matchesDate = true;
      if (fromDate && toDate) {
        const orderDate = new Date(order.created_at);
        matchesDate =
          orderDate >= new Date(`${fromDate}T00:00:00.000`) &&
          orderDate <= new Date(`${toDate}T23:59:59.999`);
      }

      const matchesCardName =
        !search ||
        String(order.card_name || "")
          .toLowerCase()
          .includes(search);

      return matchesDate && matchesCardName;
    });
  }, [trackedOrders, fromDate, toDate, searchInput]);

  const filteredOrders = useMemo(
    () =>
      dateFilteredOrders.filter((order) =>
        decisionFilter === "all"
          ? true
          : getDecisionType(order, mode) === decisionFilter,
      ),
    [dateFilteredOrders, decisionFilter, mode],
  );

  const acceptedCount = dateFilteredOrders.filter(
    (order) => getDecisionType(order, mode) === "accepted",
  ).length;
  const rejectedCount = dateFilteredOrders.filter(
    (order) => getDecisionType(order, mode) === "rejected",
  ).length;

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const pageNumber = Math.min(currentPage, totalPages);
  const paginatedOrders = filteredOrders.slice(
    (pageNumber - 1) * itemsPerPage,
    pageNumber * itemsPerPage,
  );

  const detailTotals = useMemo(() => orderTotals(selectedItems), [selectedItems]);
  const detailVarieties = useMemo(() => varietyCosts(orderDetails), [orderDetails]);

  const fetchOrderDetails = async (orderId: number) => {
    try {
      const [data, logs] = await Promise.all([
        ordersService.getOrderDetails(orderId),
        ordersService.getOrderLogs(orderId).catch(() => []),
      ]);

      setOrderDetails(data);
      setSelectedItems(data.items || []);
      setOrderLogs(logs || []);
      setShowDetails(true);
    } catch (error) {
      console.log("Error fetching order details:", error);
    }
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

  /**
   * Who the last pending step is waiting on.
   *
   * Only this page has the `rate_approvals` list, so the timeline component
   * takes it as a callback rather than trying to work it out.
   */
  const pendingNote = (log: OrderLog, isLastAndPending: boolean) => {
    if (!isLastAndPending) return undefined;
    const statusLower = (log.status_name || "").toLowerCase();
    if (!statusLower.includes("rate") && !statusLower.includes("need approval")) {
      return undefined;
    }
    const names = (orderDetails?.rate_approvals || [])
      .filter((ra: RateApproval) => (ra.status || "").toUpperCase() === "PENDING")
      .map((ra: RateApproval) => ra.approver_name)
      .filter(Boolean);
    return names.length > 0 ? names.join(", ") : undefined;
  };

  const downloadExcel = async (order: Order) => {
    let excelData: Record<string, unknown>[] = [];
    const quotation = String(order.sap_doc_number || "").trim();

    if (order.items && order.items.length > 0) {
      excelData = order.items.map((item: OrderItem) => ({
        "Order Number": order.order_number,
        "Card Code": order.card_code,
        "Card Name": order.card_name,
        "Delivery Date": order.delivery_date,
        Status: order.status_display,
        ...(quotation ? { "Quotation No": quotation } : {}),
        "Bill To": order.bill_to_address,
        "Ship To": order.ship_to_address,
        "Item Code": item.item_code,
        "Item Name": item.item_name,
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
        "Order Number": order.order_number,
        "Card Code": order.card_code,
        "Card Name": order.card_name,
        "Delivery Date": order.delivery_date,
        Status: order.status_display,
        ...(quotation ? { "Quotation No": quotation } : {}),
        "Bill To": order.bill_to_address,
        "Ship To": order.ship_to_address,
        "Price List (Basic)": "",
        "Basic Price": "",
      });
    }

    await exportToExcel(excelData, {
      fileName: `Tracked_Order_${order.order_number}.xlsx`,
      sheetName: "Status Tracking",
    });
  };

  return (
    <Page>
      {/* ── LIST VIEW ── */}
      {!showDetails && (
        <>
          <Breadcrumbs items={[{ label: "Orders" }, { label: MODE_LABEL[mode] }]} />

          <PageHeader title={MODE_LABEL[mode]} description={MODE_DESCRIPTION[mode]} />

          <StatRow>
            <Stat
              icon={HiOutlineCheckCircle}
              tone="ok"
              label="Accepted"
              value={acceptedCount}
              hint="in this period"
              loading={isOrdersLoading}
            />
            <Stat
              icon={HiOutlineXCircle}
              // Neutral at zero: a red chip on "0 rejected" reads as an alert
              // about good news.
              tone={rejectedCount ? "bad" : "neutral"}
              label="Rejected"
              value={rejectedCount}
              hint="in this period"
              loading={isOrdersLoading}
            />
          </StatRow>

          <FilterBar>
            <FilterSelect
              label="Decision"
              icon={HiOutlineFunnel}
              value={decisionFilter}
              onChange={(e) => {
                setDecisionFilter(e.target.value as typeof decisionFilter);
                setCurrentPage(1);
              }}
            >
              <option value="all">All decisions</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </FilterSelect>

            <FilterSearch
              label="Card name"
              icon={HiOutlineMagnifyingGlass}
              value={searchInput}
              placeholder="e.g. Bachan Singh"
              onChange={(e) => {
                setSearchInput(e.target.value);
                setCurrentPage(1);
              }}
            />

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

            <FilterSpacer />
            <FilterCount>Total: {filteredOrders.length}</FilterCount>
          </FilterBar>

          {isOrdersLoading ? (
            <TableSkeleton columns={8} label="Loading orders" />
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
                      <TableHead>Status</TableHead>
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
                          <Badge tone={toneForStatus(order.status_display)}>
                            {order.status_display || "Unknown"}
                          </Badge>
                        </TableCell>
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
                            {showTrackAction && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleTrack(order)}
                                aria-label={`Track order ${order.order_number}`}
                                title="Track order"
                              >
                                <HiOutlineArrowPath aria-hidden="true" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => downloadExcel(order)}
                              aria-label={`Download order ${order.order_number}`}
                              title="Download order"
                            >
                              <HiOutlineArrowDownTray aria-hidden="true" />
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
                title="Nothing tracked yet"
                hint="No accepted or rejected orders match these filters."
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
              { label: MODE_LABEL[mode], onClick: () => setShowDetails(false) },
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
              <Button variant="ghost" onClick={() => downloadExcel(orderDetails)}>
                <HiOutlineArrowDownTray aria-hidden="true" /> Export Excel
              </Button>
            }
          />

          <OrderTotalsRow totals={detailTotals} itemCount={selectedItems.length} />

          <VarietyCostCards costs={detailVarieties} />

          <Card>
            <CardHeader>
              <CardTitle>Party &amp; delivery</CardTitle>
            </CardHeader>
            <DetailGrid>
              <DetailField label="Party state" value={orderDetails.party_state} />
              <DetailField label="Delivery date" value={orderDetails.delivery_date} />
              <DetailField label="PO number" value={orderDetails.po_number} />
              {/* Only ever present once an order has actually reached SAP, so
                  it is worth showing HERE — unlike on the approval queues,
                  where it is blank by definition. */}
              <DetailField label="Quotation no" value={orderDetails.sap_doc_number} />
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
            <OrderItemsTable items={selectedItems} variety={false} />
          </Card>

          {/* The progress trail, inline.
              Billing is the desk that has to answer "why is this not billed
              yet", so its detail view carries the trail on the page rather
              than behind the track button. Same component as the dialog. */}
          {mode === "billing" && orderLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Order log</CardTitle>
                <Badge tone="neutral">
                  {buildOrderTimelineLogs(orderLogs, orderDetails).length}
                </Badge>
              </CardHeader>
              <OrderTimeline
                order={orderDetails}
                logs={orderLogs}
                formatDateTime={formatCreatedDateTime}
                pendingNote={pendingNote}
              />
            </Card>
          )}
        </>
      )}

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
