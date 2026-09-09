import { useState, useEffect, useMemo } from "react";
import { startExcelExport } from "../utils/excelExport";
import {
  getOrderItemSchemeNames,
  getOrderItemSchemes,
  getOrderItemSchemeQtyText,
  getOrderItemTotalLtrs,
  ordersService,
} from "../services/ordersService";
import type {
  OrderItem,
  Order,
  OrderLog,
  PartyProduct,
  QuotationStatus,
} from "../services/ordersService";
import { useQueryClient } from "@tanstack/react-query";

import { useAssignedParties, useCurrentUserOrders, useOrderStatuses } from "../lib/orderQueries";
import { useUILabels } from "../services/uiConfig";
import { useLocation, useNavigate } from "react-router-dom";
import {
  HiEye, // View
  HiArrowDownTray, // Download
  HiPlus,
  HiXMark,
  HiClipboardDocumentList,
  HiCheckCircle,
  HiExclamationTriangle,
  HiInboxStack,
  HiBanknotes,
  HiFunnel,
  HiBuildingStorefront,
  HiCube,
  HiCalendarDays,
  HiBeaker,
  HiReceiptPercent,
  HiCurrencyRupee,
} from "react-icons/hi2";
import { useAuth } from "../auth/useAuth";
// The same helper the router and sidebar use, so "may this user create an
// order" is answered in ONE place. Duplicating the permission literal here
// would be a second gate that can silently disagree with the route's.
import { canOpen } from "../auth/routeAccess";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
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
import {
  FilterActions,
  FilterBar,
  FilterCount,
  FilterDate,
  FilterSelect,
  FilterSpacer,
} from "@/components/ui/filter-bar";
import { Badge } from "@/components/ui/badge";
import { toneForStatus } from "@/components/ui/statusTone";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { messageFrom } from "@/lib/apiError";

const now = new Date();

// First day of current month
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

// Last day of current month
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0];

type ItemFilterOption = {
  itemCode: string;
  itemName: string;
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

/**
 * A tone per variety, so the badge means something rather than decorating.
 *
 * PREMIUM / COMMODITY / OTHERS is SAP's own product split (`OITM.U_TYPE`), so
 * these are categories of the same kind a status is — which is why they are
 * badges and why they get distinct, stable colours.
 */
const VARIETY_TONE: Record<string, "info" | "note" | "neutral"> = {
  Commodity: "info",
  Premium: "note",
  Other: "neutral",
};

/** `item.variety_type` arrives as SAP's uppercase key (PREMIUM / COMMODITY). */
const titleCaseVariety = (value: string): string => {
  const text = String(value).trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

const varietyBadgeTone = (value: string): "info" | "note" | "neutral" =>
  VARIETY_TONE[titleCaseVariety(value)] ?? "neutral";

const isRejectedOrder = (order: Pick<Order, "status_display">) =>
  String(order.status_display || "")
    .toLowerCase()
    .includes("reject");

const isCompletedOrder = (order: Pick<Order, "status_display">) =>
  String(order.status_display || "")
    .trim()
    .toLowerCase() === "completed";

const getRejectedByFromLogs = (logs: OrderLog[]) => {
  const isRealPerformer = (value: string | null) => {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    return normalized && normalized !== "pending" && normalized !== "system";
  };

  return (
    [...logs].reverse().find((log) => {
      const statusName = String(log.status_name || "").toLowerCase();
      const remarks = String(log.remarks || "").toLowerCase();
      return (
        isRealPerformer(log.performed_by_name) &&
        (statusName.includes("reject") || remarks.includes("reject"))
      );
    })?.performed_by_name || null
  );
};

export default function View_Orders() {
  const { t } = useUILabels();
  const location = useLocation();
  const navigate = useNavigate();
  // Shared with both Order_Tracking pages — one key, so moving between them
  // renders from cache instead of refetching the whole history.
  const { orders, isOrdersLoading } = useCurrentUserOrders();
  const status = useOrderStatuses();
  const partyOptions = useAssignedParties();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  // Mirrors the route gate on /Add_Sales rather than restating the permission
  // key: a view-only user sees the list without the create actions.
  const canCreateOrder = canOpen(session, "/Add_Sales");
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [partyItems, setPartyItems] = useState<PartyProduct[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [currentPage, setCurrentPage] = useState(1);
  const [rejectedByByOrderId, setRejectedByByOrderId] = useState<Record<number, string>>({});
  const [quotationStatusByOrderId, setQuotationStatusByOrderId] = useState<
    Record<number, QuotationStatus>
  >({});
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const itemsPerPage = 10;

  useEffect(() => {
    if (location.state?.openOrderId) {
      fetchOrderDetails(location.state.openOrderId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.openOrderId, location.pathname, navigate]);

  // console.log("Selected Items:", JSON.stringify(selectedItems));
  // console.log("Order Details:", JSON.stringify(orderDetails));

  const fetchOrderDetails = async (orderId: number) => {
    try {
      const data = await ordersService.getOrderDetails(orderId);

      setOrderDetails(data);
      setSelectedItems(data.items || []);
      setShowDetails(true);
    } catch (error) {
      console.log("Error fetching order details:", error);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const fetchPartyItems = async () => {
      if (!partyFilter) {
        setPartyItems([]);
        setItemFilter("");
        return;
      }

      setIsLoadingItems(true);
      setItemFilter("");

      try {
        const data = await ordersService.getPartyProduct(partyFilter);
        if (isCancelled) return;

        setPartyItems(Array.isArray(data) ? data : []);
      } catch (error) {
        console.log("Error fetching party items:", error);
        if (!isCancelled) {
          setPartyItems([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingItems(false);
        }
      }
    };

    fetchPartyItems();

    return () => {
      isCancelled = true;
    };
  }, [partyFilter]);

  useEffect(() => {
    let isCancelled = false;

    const fetchRejectedByNames = async () => {
      const rejectedOrders = orders.filter(isRejectedOrder);

      if (rejectedOrders.length === 0) {
        setRejectedByByOrderId({});
        return;
      }

      const entries = await Promise.all(
        rejectedOrders.map(async (order) => {
          try {
            const logs = await ordersService.getOrderLogs(order.id);
            const rejectedBy = getRejectedByFromLogs(logs);
            return rejectedBy ? ([order.id, rejectedBy] as const) : null;
          } catch (error) {
            console.log(`Error fetching rejected-by log for order ${order.id}:`, error);
            return null;
          }
        }),
      );

      if (!isCancelled) {
        setRejectedByByOrderId(
          Object.fromEntries(
            entries.filter((entry): entry is readonly [number, string] => entry !== null),
          ),
        );
      }
    };

    void fetchRejectedByNames();

    return () => {
      isCancelled = true;
    };
  }, [orders]);

  // Sales Quotation — DISABLED 2026-08-27. The flow is closed and no longer
  // used; `GET /orders/quotation-status/` is commented out on the backend, so
  // this effect would now 404 on every render of the orders list.
  //
  // Note it had already stopped working: the backend view called
  // `get_quotation_status(doc_entries)` without its required `branch`
  // argument, raising TypeError inside an `except Exception` that returns the
  // same empty map as "SAP is unreachable". The Cancel button therefore never
  // appeared, and the failure was indistinguishable from SAP being down —
  // which is why nobody noticed.
  //
  // useEffect(() => {
  //   let isCancelled = false;
  //
  //   const fetchQuotationStatuses = async () => {
  //     // The actual quotation DocNum lives in SalesQuotationLog (resolved by the
  //     // backend), not on Order.sap_doc_number — so query every completed,
  //     // not-yet-cancelled order and let the backend report which have a quotation.
  //     const completedIds = orders
  //       .filter((order) => isCompletedOrder(order) && !order.quotation_cancelled)
  //       .map((order) => order.id);
  //
  //     if (completedIds.length === 0) {
  //       setQuotationStatusByOrderId({});
  //       return;
  //     }
  //
  //     try {
  //       const statuses = await ordersService.getQuotationStatus(completedIds);
  //       if (!isCancelled) {
  //         const byId: Record<number, QuotationStatus> = {};
  //         Object.entries(statuses).forEach(([orderId, status]) => {
  //           byId[Number(orderId)] = status;
  //         });
  //         setQuotationStatusByOrderId(byId);
  //       }
  //     } catch (error) {
  //       console.log("Error fetching quotation statuses:", error);
  //       if (!isCancelled) setQuotationStatusByOrderId({});
  //     }
  //   };
  //
  //   void fetchQuotationStatuses();
  //
  //   return () => {
  //     isCancelled = true;
  //   };
  // }, [orders]);

  // The single switch. False hides every "Cancel Sales Quotation" control, so
  // the confirm modal can never open and `handleCancelQuotation` below is
  // unreachable — no call is made to the commented-out backend route.
  //
  // A flag rather than deleting the conditions: it keeps every reference live
  // (so nothing becomes an unused-variable error), documents itself, and makes
  // re-enabling one line here plus the effect above.
  //
  // Deliberately still rendered: the `order.quotation_cancelled` badge, for
  // orders cancelled BEFORE the flow closed. That is history worth showing.
  const QUOTATION_FLOW_ENABLED = false;

  const canCancelQuotation = (order: Order) =>
    QUOTATION_FLOW_ENABLED &&
    isCompletedOrder(order) &&
    !order.quotation_cancelled &&
    Boolean(quotationStatusByOrderId[order.id]?.is_open);

  const handleCancelQuotation = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    setCancelError("");
    try {
      const result = await ordersService.cancelSalesQuotation(cancelTarget.id);
      if (!result?.success) {
        setCancelError(result?.message || "Failed to cancel sales quotation");
        return;
      }
      // Mirror the cancellation locally so the button disappears immediately.
      const cancelledId = cancelTarget.id;
      // Mirrored into the query cache rather than into local state, so the
      // two Order_Tracking pages reading the same key see it too.
      queryClient.setQueryData<Order[]>(["orders", "current-user"], (prev) =>
        (prev ?? []).map((order) =>
          order.id === cancelledId ? { ...order, quotation_cancelled: true } : order,
        ),
      );
      setOrderDetails((prev) =>
        prev && prev.id === cancelledId ? { ...prev, quotation_cancelled: true } : prev,
      );
      setQuotationStatusByOrderId((prev) => {
        const next = { ...prev };
        delete next[cancelledId];
        return next;
      });
      setCancelTarget(null);
    } catch (error) {
      const detail = messageFrom(error, "Failed to cancel sales quotation");
      setCancelError(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setIsCancelling(false);
    }
  };

  const itemOptions = useMemo<ItemFilterOption[]>(() => {
    const uniqueItems = new Map<string, ItemFilterOption>();

    partyItems.forEach((item) => {
      const itemCode = String(item.item_code || "").trim();
      const itemName = String(item.item_name || "").trim();
      const key = itemCode || itemName;

      if (!key) return;

      uniqueItems.set(key, {
        itemCode,
        itemName: itemName || itemCode,
      });
    });

    return Array.from(uniqueItems.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [partyItems]);

  const filteredOrders = orders.filter((order) => {
    const matchStatus = statusFilter ? order.status_display === statusFilter : true;
    let matchDate = true;

    const matchParty = partyFilter
      ? order.card_code === partyFilter || order.card_name === partyFilter
      : true;
    const matchItem = itemFilter
      ? Boolean(
          order.items?.some(
            (item) => item.item_code === itemFilter || item.item_name === itemFilter,
          ),
        )
      : true;

    if (fromDate && toDate) {
      const orderDate = new Date(order.created_at);
      const from = new Date(`${fromDate}T00:00:00.000`);
      const to = new Date(`${toDate}T23:59:59.999`);

      matchDate = orderDate >= from && orderDate <= to;
    }

    return matchStatus && matchDate && matchParty && matchItem;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const pageNumber = Math.min(currentPage, totalPages);
  // The detail view's totals. Computed once here rather than inline in the
  // markup, where subtotal and tax were each summed twice — once for their own
  // row and again inside the grand total.
  const detailTotals = useMemo(() => {
    const litres = selectedItems.reduce((s, i) => s + getOrderItemTotalLtrs(i), 0);
    const subtotal = selectedItems.reduce((s, i) => s + Number(i.total || 0), 0);
    const tax = selectedItems.reduce(
      (s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0)) / 100,
      0,
    );
    return { litres, subtotal, tax, grand: subtotal + tax };
  }, [selectedItems]);

  // Only the variety costs that are actually present.
  const varietyCosts = useMemo(
    () =>
      [
        { label: "Commodity", value: orderDetails?.vareity_cost?.commodity_price },
        { label: "Other", value: orderDetails?.vareity_cost?.other_total },
        { label: "Premium", value: orderDetails?.vareity_cost?.premium_total },
      ].filter((entry) => Number(entry.value) > 0),
    [orderDetails],
  );

  // KPI counts. Derived from the FILTERED list, not the whole history: the
  // numbers have to agree with the table under them, or the row count and the
  // "Orders" tile disagree the moment a filter is applied.
  const completedCount = filteredOrders.filter(isCompletedOrder).length;
  const rejectedCount = filteredOrders.filter(isRejectedOrder).length;

  const paginatedOrders = filteredOrders.slice(
    (pageNumber - 1) * itemsPerPage,
    pageNumber * itemsPerPage,
  );

  // Raw values only — exportToExcel infers the Excel type per column, so dates
  // stay dates and money stays numeric and summable.
  const buildOrderRows = (order: Order): Record<string, unknown>[] => {
    // If no items → still export the order header on its own.
    if (!order.items || order.items.length === 0) {
      return [
        {
          "Order Number": order.order_number,
          "Card Code": order.card_code,
          "Card Name": order.card_name,
          "Delivery Date": order.delivery_date,
          Status: order.status_display,
          "Bill To": order.bill_to_address,
          "Ship To": order.ship_to_address,
          "Price List (Basic)": "",
          "Basic Price": "",
        },
      ];
    }

    return order.items.map((item: OrderItem) => ({
      "Order Number": order.order_number,
      "Card Code": order.card_code,
      "Card Name": order.card_name,
      "Delivery Date": order.delivery_date,
      Status: order.status_display,
      "Bill To": order.bill_to_address,
      "Ship To": order.ship_to_address,
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
  };

  const downloadExcel = (order: Order) => {
    startExcelExport(buildOrderRows(order), {
      fileName: `Order_${order.order_number}.xlsx`,
      sheetName: "Order Details",
    });
  };
  return (
    <Page>
      {/* ── LIST VIEW ── */}
      {!showDetails && (
        <>
          {/* The trail sits at the very top of the page, above the header
              card — it locates the PAGE, so it belongs outside the object it
              is locating. */}
          <Breadcrumbs items={[{ label: "Orders" }, { label: "View Orders" }]} />

          <PageHeader
            title="View Orders"
            description="Browse, review and export your order history."
            actions={
              // Gated on the route's own rule, so a view-only user sees the
              // list without the create actions. FOC is the same form in a
              // different mode (FOC.tsx renders <Add_Sales focMode />), which
              // is why it is a second button here and not a separate screen.
              canCreateOrder ? (
                <>
                  <Button variant="ghost" onClick={() => navigate("/FOC")}>New FOC order</Button>
                  <Button variant="primary" onClick={() => navigate("/Add_Sales")}>
                    <HiPlus aria-hidden="true" /> New order
                  </Button>
                </>
              ) : null
            }
          />

          <StatRow>
            <Stat
              icon={HiClipboardDocumentList}
              tone="brand"
              label="Total orders"
              value={filteredOrders.length}
              hint="matching filters"
              loading={isOrdersLoading}
            />
            <Stat
              icon={HiCheckCircle}
              tone="ok"
              label="Completed"
              value={completedCount}
              loading={isOrdersLoading}
            />
            <Stat
              icon={HiExclamationTriangle}
              // Neutral at zero: a red chip on "0 rejected" reads as an alert
              // about good news.
              tone={rejectedCount ? "bad" : "neutral"}
              label="Rejected"
              value={rejectedCount}
              loading={isOrdersLoading}
            />
          </StatRow>

          <FilterBar>
            <FilterSelect
              label="Status"
              icon={HiFunnel}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">All Statuses</option>
                {status.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </FilterSelect>

            <FilterSelect
              label="Party"
              icon={HiBuildingStorefront}
                value={partyFilter}
                onChange={(e) => {
                  setPartyFilter(e.target.value);
                  setItemFilter("");
                  setCurrentPage(1);
                }}
              >
                <option value="">All Parties</option>
                {partyOptions.map((party) => (
                  <option
                    key={party.cardCode || party.cardName}
                    value={party.cardCode || party.cardName}
                  >
                    {party.cardName}
                    {party.cardCode ? ` (${party.cardCode})` : ""}
                  </option>
                ))}
              </FilterSelect>

            <FilterSelect
              label="Item"
              icon={HiCube}
                value={itemFilter}
                disabled={!partyFilter || isLoadingItems}
                onChange={(e) => {
                  setItemFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">
                  {partyFilter
                    ? isLoadingItems
                      ? "Loading Items..."
                      : "All Items"
                    : "Select Party First"}
                </option>
                {itemOptions.map((item) => (
                  <option
                    key={item.itemCode || item.itemName}
                    value={item.itemCode || item.itemName}
                  >
                    {item.itemName}
                    {item.itemCode ? ` (${item.itemCode})` : ""}
                  </option>
                ))}
              </FilterSelect>

            <FilterDate
              label="From"
              icon={HiCalendarDays}
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

            {(statusFilter || partyFilter || itemFilter) && (
              <FilterActions>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setStatusFilter("");
                    setPartyFilter("");
                    setItemFilter("");
                    setCurrentPage(1);
                  }}
                >
                  <HiXMark aria-hidden="true" /> Clear
                </Button>
              </FilterActions>
            )}

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
                    <TableRow key={order.id} className={order.is_foc ? "vo-foc-row" : ""}>
                      <TableCell className="font-semibold whitespace-nowrap text-brand">
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
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={toneForStatus(order.status_display)}>
                            {order.status_display}
                          </Badge>
                          {isRejectedOrder(order) && rejectedByByOrderId[order.id] ? (
                            <span className="text-[11px] text-subtle">
                              By: {rejectedByByOrderId[order.id]}
                            </span>
                          ) : null}
                          {order.quotation_cancelled ? (
                            <Badge tone="neutral">SQ Cancelled</Badge>
                          ) : canCancelQuotation(order) ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Cancel sales quotation"
                              onClick={() => {
                                setCancelError("");
                                setCancelTarget(order);
                              }}
                            >
                              Cancel SQ
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => fetchOrderDetails(order.id)}
                            title="View order"
                            aria-label={`View order ${order.order_number}`}
                          >
                            <HiEye />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => downloadExcel(order)}
                            title="Download order"
                            aria-label={`Download order ${order.order_number}`}
                          >
                            <HiArrowDownTray />
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
                icon={HiInboxStack}
                title="No orders found"
                hint="Nothing matches the current filters. Widen the date range or clear a filter to see more."
              />
            </Card>
          )}

          {filteredOrders.length > itemsPerPage && (
            <Pagination page={pageNumber} totalPages={totalPages} onPageChange={setCurrentPage} />
          )}
        </>
      )}

      {/* ── DETAIL VIEW ── */}
      {showDetails && orderDetails && (
        <>
          {/* ONE header for the record.
              This used to be two: a PageHeader carrying the order number and
              party name, and directly beneath it a `PartyHeader` carrying the
              same order number and the same party name again, plus the status.
              The badges move up here, and the party metadata that `PartyHeader`
              hid behind an "i" modal is now a section on the page — hiding
              detail behind a dialog on a page whose only job is detail was the
              odder half of that arrangement.

              `PartyHeader` itself is untouched: five other order screens still
              use it, and it is still the right component for them. */}
          <Breadcrumbs
            items={[
              { label: "Orders" },
              // A button, not a link: the detail view is state on this route,
              // so navigating to /View_Orders would reload the page we are
              // already on instead of closing the panel. This is also the way
              // BACK — which is why the header no longer carries a "Back to
              // orders" button: two controls, one destination, and the trail
              // is the one people already look for.
              { label: "View Orders", onClick: () => setShowDetails(false) },
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
                {orderDetails.quotation_cancelled ? (
                  <Badge tone="neutral">SQ Cancelled</Badge>
                ) : null}
                {isRejectedOrder(orderDetails) && rejectedByByOrderId[orderDetails.id] ? (
                  <span className="text-[11px] text-subtle">
                    Rejected by {rejectedByByOrderId[orderDetails.id]}
                  </span>
                ) : null}
              </>
            }
            actions={
              <>
                {!orderDetails.quotation_cancelled && canCancelQuotation(orderDetails) ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      setCancelError("");
                      setCancelTarget(orderDetails);
                    }}
                  >
                    <HiXMark aria-hidden="true" /> Cancel sales quotation
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => downloadExcel(orderDetails)}>
                  <HiArrowDownTray aria-hidden="true" /> Export Excel
                </Button>
              </>
            }
          />

          {/* The totals, as the same KPI row the list page uses — read before
              the line items rather than after them, which is the order a
              reviewer actually wants: what is this worth, then what is in it. */}
          <StatRow>
            <Stat
              icon={HiBeaker}
              tone="neutral"
              label="Total Ltrs"
              value={detailTotals.litres.toFixed(2)}
            />
            <Stat
              icon={HiBanknotes}
              tone="neutral"
              label="Subtotal"
              value={detailTotals.subtotal.toFixed(2)}
            />
            <Stat
              icon={HiReceiptPercent}
              tone="neutral"
              label="Tax"
              value={detailTotals.tax.toFixed(2)}
            />
            <Stat
              icon={HiCurrencyRupee}
              tone="brand"
              label="Grand Total"
              value={detailTotals.grand.toFixed(2)}
              hint={`${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}`}
            />
          </StatRow>

          {/* Variety cost — one card per variety, filling the row.
              `auto-fit` rather than a fixed two columns so the layout is
              correct whether SAP returns two varieties or three: two sit
              adjacent across the full width, three divide it evenly.

              PREMIUM / COMMODITY / OTHERS is SAP's own product split
              (`OITM.U_TYPE`), so the variety is a category exactly as a status
              is — hence the same Badge, with a stable tone per variety. */}
          {varietyCosts.length > 0 && (
            <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
              {varietyCosts.map((entry) => (
                <Card
                  key={entry.label}
                  className="flex items-center justify-between gap-3"
                >
                  <Badge tone={VARIETY_TONE[entry.label] ?? "neutral"}>
                    {entry.label}
                  </Badge>
                  <span className="text-xl font-bold tabular-nums text-ink">
                    {Number(entry.value).toFixed(2)}
                  </span>
                </Card>
              ))}
            </div>
          )}

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <Badge tone="neutral">{selectedItems.length}</Badge>
            </CardHeader>
            {/* The table IS the item list now. `ItemSection` rendered the
                same items a second time above it, as collapsible Premium /
                Commodity / Others accordions of cards — so every line appeared
                twice on the page. The variety it grouped by is a column here
                instead. It stays in use on five other order screens. */}
            <div className="overflow-x-auto">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead className="min-w-[250px]">Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Variety</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Scheme Qty</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Pcs</TableHead>
                    <TableHead>Boxes</TableHead>
                    <TableHead>Ltrs</TableHead>
                    {/* <TableHead>Scheme Ltrs</TableHead> */}
                    <TableHead>Total Ltrs</TableHead>
                    <TableHead>{t("price_list", "Price List (Basic)")}</TableHead>
                    <TableHead>Basic Price</TableHead>
                    <TableHead>Tax %</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedItems.length > 0 ? (
                    selectedItems.map((item, i) => {
                      const schemes = getOrderItemSchemes(item);

                      return (
                        <TableRow key={i}>
                          <TableCell className="text-center text-subtle">
                            {i + 1}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium whitespace-nowrap text-ink">{item.item_code}</span>
                          </TableCell>
                          <TableCell className="min-w-[250px] font-medium text-ink">
                            {item.item_name}
                          </TableCell>
                          <TableCell>{item.category}</TableCell>
                          <TableCell>
                            {item.variety_type ? (
                              <Badge tone={varietyBadgeTone(item.variety_type)}>
                                {titleCaseVariety(item.variety_type)}
                              </Badge>
                            ) : (
                              <span className="text-subtle">-</span>
                            )}
                          </TableCell>
                          <TableCell colSpan={2}>
                            {schemes.length > 0 ? (
                              <div className="flex flex-col gap-1" aria-label="Applied schemes">
                                {schemes.map((scheme, schemeIndex) => (
                                  <div
                                    className="flex items-baseline gap-1.5 text-[12px]"
                                    key={`${item.item_code}-scheme-${schemeIndex}`}
                                  >
                                    <span className="text-ink">{scheme.name || "-"}</span>
                                    <span className="text-subtle">Qty {scheme.qty || 0}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[12px] text-subtle">No scheme</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{item.qty}</TableCell>
                          <TableCell className="text-center">{item.pcs}</TableCell>
                          <TableCell className="text-center">
                            {Number(item.boxes).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">{item.ltrs}</TableCell>
                          {/* <TableCell style={{textAlign:'center'}}>{item.scheme_name ? ((item as any).scheme_ltrs || 0) : "—"}</TableCell> */}
                          <TableCell className="text-center">
                            {getOrderItemTotalLtrs(item).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(item.price_list_basic).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(item.basic_price).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            {Number(item.tax_rate).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-ink">
                            {Number(item.total).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={15} className="py-8 text-center text-subtle">
                        No items found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

        </>
      )}

      {/* ── CANCEL SALES QUOTATION CONFIRM MODAL ── */}
      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(next) => {
          if (!next && !isCancelling) setCancelTarget(null);
        }}
      >
        {cancelTarget && (
          <DialogContent title="Cancel sales quotation" size="sm" showClose={false}>
            {/* DialogHeader/Body/Footer rather than a bespoke layout: they
                already existed and were the least-used components in ui/, so
                every modal in the app had reinvented this geometry. */}
            <DialogHeader>
              <DialogTitle>Cancel sales quotation</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="m-0 text-[13px] leading-relaxed text-body">
                Cancel the SAP Sales Quotation
                {quotationStatusByOrderId[cancelTarget.id]?.doc_num
                  ? ` (No. ${quotationStatusByOrderId[cancelTarget.id]?.doc_num})`
                  : ""}{" "}
                for order <strong className="text-ink">{cancelTarget.order_number}</strong>? This
                cancels the quotation in SAP and cannot be undone.
              </p>
              {cancelError ? (
                <p
                  role="alert"
                  className="mt-3 rounded-sm border border-danger-line bg-danger-soft px-3 py-2 text-[13px] text-danger"
                >
                  {cancelError}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setCancelTarget(null)} disabled={isCancelling}>
                Keep quotation
              </Button>
              <Button variant="danger" onClick={handleCancelQuotation} disabled={isCancelling}>
                {isCancelling ? "Cancelling..." : "Cancel quotation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
