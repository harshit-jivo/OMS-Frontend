/**
 * Order Master — every order, who raised it, and the whole route it took.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW THIS DIFFERS FROM /Order_Tracking
 * ─────────────────────────────────────────────────────────────────────────
 * `Order_Tracking` answers "where are MY orders?" — it reads
 * `useCurrentUserOrders()`, so it is scoped to the signed-in user, and it
 * fetches a trail one order at a time when you open one.
 *
 * This page answers a different question: across everyone, who raised what,
 * what is it waiting on, and how did it get there. That makes the creator a
 * first-class column rather than an implied constant, and it makes the trail
 * part of the row rather than a drill-in — the point of the page is comparing
 * routes, and you cannot compare what you have to open one at a time.
 *
 * Gated on `orders.sales.view_all`, the key that already means "see every
 * order, company-wide" (`routeAccess.ts`). A holder sees everything; the
 * backend still scopes by `_get_base_orders`, so the page cannot leak past
 * whatever the caller is entitled to.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SERVER-PAGINATED, UNLIKE ITS NEIGHBOURS
 * ─────────────────────────────────────────────────────────────────────────
 * The other order pages pull the whole history and slice it in the browser.
 * This one is company-wide, so that does not scale — filters and paging go to
 * the server and the row count comes back with the page.
 */
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  FilterActions,
  FilterBar,
  FilterCount,
  FilterDate,
  FilterSearch,
  FilterSelect,
  FilterSpacer,
} from "@/components/ui/filter-bar";
import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Stat,
  StatRow,
} from "@/components/ui/page";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import { OrderItemsTable } from "@/components/orders/OrderItemsTable";
import {
  VARIETY_TONE,
  formatMoney,
  orderTotals,
  varietyCosts,
} from "@/components/orders/orderDetail";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { toneForStatus } from "@/components/ui/statusTone";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Timeline,
  TimelineHead,
  TimelineItem,
  TimelineNote,
} from "@/components/ui/timeline";
import { messageFrom } from "@/lib/apiError";
import {
  useMasterOrderCreators,
  useMasterOrders,
  useOrderDetail,
  useOrderStatuses,
} from "@/lib/orderQueries";
import type { MasterOrder, MasterOrderStage } from "@/services/ordersService";
import {
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineCalendarDays,
  HiOutlineFunnel,
  HiOutlineInbox,
  HiOutlineInformationCircle,
  HiOutlineUser,
  HiOutlineUserGroup,
} from "react-icons/hi2";

const PAGE_SIZE = 25;

/**
 * `12 Sep 2026, 08:28 am` — not `toLocaleString("en-IN")`.
 *
 * That default prints `12/9/2026, 8:28:47 am`, which is ambiguous with the
 * US order at a glance (is that 12 September or 9 December?) and carries
 * seconds nobody reads. A named month cannot be misread, and the delivery
 * date below is formatted by the same vocabulary so the two stop disagreeing.
 */
const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const DATE_ONLY = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  // Pinned, because the value it formats is parsed as UTC midnight below.
  timeZone: "UTC",
});

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return DATE_TIME.format(parsed);
}

/** A date with no time of day — `delivery_date` is a `DateField` server-side. */
function formatDate(value?: string | null) {
  if (!value) return "—";
  // Parsed as UTC midnight, so format in UTC: a local-time render of
  // `2026-09-14` shifts to the 13th for anyone west of Greenwich.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return DATE_ONLY.format(parsed);
}

/** Whole days between `value` and now — how long it has sat where it is. */
function daysSince(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const days = Math.floor((Date.now() - parsed.getTime()) / 86_400_000);
  return days < 0 ? 0 : days;
}

/**
 * The rail out of a stage says how the order LEFT it, which is the thing a
 * flat list of stage names hides: an order that reached Billing twice went
 * backwards in between, and that is the interesting fact about it.
 */
function railFor(next: MasterOrderStage | undefined) {
  if (!next) return "idle" as const;
  const name = next.status_name.toLowerCase();
  return name.includes("reject") ? ("back" as const) : ("covered" as const);
}

export default function Order_Master() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  // The order whose detail dialog is open. Closing drops the id so the query
  // goes idle rather than holding a fetch for a hidden dialog.
  const [detailFor, setDetailFor] = useState<MasterOrder | null>(null);

  const statuses = useOrderStatuses();
  const creators = useMasterOrderCreators();

  // `page` is deliberately reset by the filter setters rather than an effect:
  // changing a filter while on page 7 would otherwise request page 7 of a
  // result set that may only have two.
  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      ...(status ? { status } : {}),
      ...(createdBy ? { created_by: createdBy } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      ...(search.trim() ? { q: search.trim() } : {}),
    }),
    [page, status, createdBy, dateFrom, dateTo, search],
  );

  const { orders, pagination, isLoading, isRefreshing, error } =
    useMasterOrders(params);

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.total_pages ?? 1;

  // Counted over the page in hand, not the whole set — the server does not
  // return set-wide aggregates and inventing one from 25 rows would be a
  // number that looks company-wide and is not. Labelled "on this page".
  const pendingHere = orders.filter((o) => o.pending_with.length > 0).length;
  const creatorsHere = new Set(
    orders.map((o) => o.created_by_name).filter(Boolean),
  ).size;

  // Every filter resets to page 1 through this: changing one while on page 7
  // would otherwise request page 7 of a result set that may only have two.
  const apply =
    (set: (value: string) => void) =>
    (value: string) => {
      set(value);
      setPage(1);
    };

  const hasFilters = Boolean(
    status || createdBy || dateFrom || dateTo || search.trim(),
  );

  const clearFilters = () => {
    setStatus("");
    setCreatedBy("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Orders" }, { label: "Order Master" }]} />
      <PageHeader
        title="Order Master"
        description="Every order, who raised it, what it is waiting on, and the stages it has been through."
      />

      <StatRow>
        <Stat
          icon={HiOutlineClipboardDocumentList}
          tone="brand"
          label="Orders matching filter"
          value={total}
          loading={isLoading}
        />
        <Stat
          icon={HiOutlineClock}
          tone="hold"
          label="Awaiting a desk (on this page)"
          value={pendingHere}
          loading={isLoading}
        />
        <Stat
          icon={HiOutlineUserGroup}
          tone="brand"
          label="Creators (on this page)"
          value={creatorsHere}
          loading={isLoading}
        />
      </StatRow>

      <FilterBar>
        <FilterSearch
          label="Search"
          value={search}
          onChange={(event) => apply(setSearch)(event.target.value)}
          placeholder="Order number, party name or code"
        />
        <FilterSelect
          label="Stage"
          icon={HiOutlineFunnel}
          value={status}
          onChange={(event) => apply(setStatus)(event.target.value)}
        >
          <option value="">All stages</option>
          {statuses.map((entry) => (
            // The id, not the code: `/orders/status/` returns `{id, name}` and
            // has never exposed `code`. The master endpoint takes either.
            <option key={entry.id} value={String(entry.id)}>
              {entry.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Created by"
          icon={HiOutlineUser}
          value={createdBy}
          onChange={(event) => apply(setCreatedBy)(event.target.value)}
        >
          <option value="">All users</option>
          {creators.map((creator) => (
            <option key={creator.id} value={String(creator.id)}>
              {creator.username}
            </option>
          ))}
        </FilterSelect>
        <FilterDate
          label="From"
          icon={HiOutlineCalendarDays}
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(event) => apply(setDateFrom)(event.target.value)}
        />
        <FilterDate
          label="To"
          icon={HiOutlineCalendarDays}
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(event) => apply(setDateTo)(event.target.value)}
        />
        {hasFilters ? (
          <FilterActions>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          </FilterActions>
        ) : null}
        <FilterSpacer />
        <FilterCount>
          {isRefreshing ? "Refreshing…" : `${total} order${total === 1 ? "" : "s"}`}
        </FilterCount>
      </FilterBar>

      {error ? (
        <Notice tone="bad">{messageFrom(error)}</Notice>
      ) : isLoading ? (
        <TableSkeleton columns={8} label="Loading order master" />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={HiOutlineInbox}
          title="No orders match"
          hint="Try a different stage, user or date range."
        />
      ) : (
        <>
          <Table density="compact">
            <TableHeader>
              <TableRow className="bg-surface hover:bg-surface">
                <TableHead className="w-8" aria-label="Expand" />
                <TableHead>Order</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Current stage</TableHead>
                <TableHead>Waiting on</TableHead>
                <TableHead>At stage</TableHead>
                <TableHead className="w-10 text-right">Info</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <OrderRows
                  key={order.id}
                  order={order}
                  open={expanded === order.id}
                  onToggle={() =>
                    setExpanded(expanded === order.id ? null : order.id)
                  }
                  onShowDetail={() => setDetailFor(order)}
                />
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <OrderDetailDialog summary={detailFor} onClose={() => setDetailFor(null)} />
    </Page>
  );
}

/**
 * The full order behind a row — its money, header facts and line items.
 *
 * Fetched only when opened. The list endpoint deliberately does not carry line
 * items: they are the bulk of an order and nobody reads 25 orders' items at
 * once, so they stay one request behind an explicit click.
 *
 * Assembled from the parts the approval screens already use, so an order reads
 * identically here and on the desk that has to decide it.
 */
function OrderDetailDialog({
  summary,
  onClose,
}: {
  summary: MasterOrder | null;
  onClose: () => void;
}) {
  const { order, isLoading, error } = useOrderDetail(summary?.id ?? null);

  const items = order?.items ?? [];
  const totals = orderTotals(items);
  const varieties = varietyCosts(order);

  const normalise = (value?: string | null) => (value ?? "").trim().toLowerCase();
  const sameAddress =
    normalise(order?.bill_to_address) === normalise(order?.ship_to_address);

  // `size="xl"`, not `lg`: the line-items table carries ten columns and a
  // 250px minimum on Item Name, so at 820px it scrolled horizontally with only
  // the first two columns visible.
  return (
    <Dialog open={summary !== null} onOpenChange={(next) => !next && onClose()}>
      {summary ? (
        <DialogContent title={`Order ${summary.order_number}`} size="xl">
          <DialogHeader className="flex-col items-start gap-0.5">
            <DialogTitle>{summary.order_number}</DialogTitle>
            <DialogDescription>
              {summary.card_name} — raised by{" "}
              {summary.created_by_name ?? "an account since removed"}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {error ? (
              <Notice tone="bad">{messageFrom(error)}</Notice>
            ) : isLoading ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <span className="sr-only">Loading order details</span>
                {[0, 1, 2].map((row) => (
                  <Skeleton key={row} className="h-16 w-full" />
                ))}
              </div>
            ) : !order ? (
              <p className="py-8 text-center text-[13px] text-subtle">
                No details found for this order.
              </p>
            ) : (
              <div className="space-y-4">
                {/* NOT `OrderTotalsRow` + `VarietyCostCards`, which the
                    approval screens use. Those are page-scale: four `Stat`
                    tiles at `minmax(170px,1fr)` plus three variety cards need
                    well over 800px, and in this dialog they overflowed — a
                    grand total of ₹8,76,385.42 was rendering as "876385.4",
                    clipped mid-number. A truncated figure is worse than a
                    small one.

                    So the money is a band instead of a grid: the grand total
                    is the figure anyone opens this for, and subtotal/tax/
                    volume are its supporting detail rather than its equals. */}
                <div className="rounded-card border border-line bg-surface-subtle px-4 py-3.5">
                  <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                    <div className="min-w-0">
                      <p className="m-0 text-[12px] font-medium text-subtle">
                        Grand total
                      </p>
                      <p className="m-0 mt-0.5 text-[28px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-ink">
                        {formatMoney(totals.grand)}
                      </p>
                      <p className="m-0 mt-0.5 text-[11px] text-subtle">
                        {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
                        {totals.litres.toFixed(2)} L
                      </p>
                    </div>
                    <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2">
                      <div>
                        <dt className="text-[12px] font-medium text-subtle">
                          Subtotal
                        </dt>
                        <dd className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-ink">
                          {formatMoney(totals.subtotal)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[12px] font-medium text-subtle">Tax</dt>
                        <dd className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-ink">
                          {formatMoney(totals.tax)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {varieties.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3">
                      {varieties.map((entry) => (
                        <span
                          key={entry.label}
                          className="inline-flex items-center gap-2"
                        >
                          <Badge tone={VARIETY_TONE[entry.label] ?? "neutral"}>
                            {entry.label}
                          </Badge>
                          <span className="text-[13px] font-semibold tabular-nums text-ink">
                            {formatMoney(entry.value)}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <DetailGrid>
                  <DetailField
                    label="Stage"
                    value={
                      <Badge tone={toneForStatus(summary.status_name)}>
                        {summary.status_name}
                      </Badge>
                    }
                  />
                  <DetailField
                    label="Waiting on"
                    value={summary.pending_with.join(", ") || "—"}
                  />
                  <DetailField label="Party code" value={summary.card_code} />
                  <DetailField label="Order type" value={summary.order_type} />
                  <DetailField
                    label="Created"
                    value={formatDateTime(summary.created_at)}
                  />
                  <DetailField
                    label="Delivery date"
                    value={formatDate(summary.delivery_date)}
                  />
                  <DetailField
                    label="Dispatch from"
                    value={order.dispatch_from_name}
                    hideWhenEmpty
                  />
                  <DetailField
                    label="PO number"
                    value={order.po_number}
                    hideWhenEmpty
                  />
                  <DetailField
                    label="SAP document"
                    value={summary.sap_doc_number}
                    hideWhenEmpty
                  />
                  {/* Usually the same address, and printing it twice under two
                      labels reads as two facts to check rather than one. Split
                      only when they actually differ, which is the case worth
                      noticing. */}
                  {sameAddress ? (
                    <DetailField
                      label="Bill & ship to"
                      value={order.bill_to_address}
                      span="full"
                      hideWhenEmpty
                    />
                  ) : (
                    <>
                      <DetailField
                        label="Bill to"
                        value={order.bill_to_address}
                        span="full"
                        hideWhenEmpty
                      />
                      <DetailField
                        label="Ship to"
                        value={order.ship_to_address}
                        span="full"
                        hideWhenEmpty
                      />
                    </>
                  )}
                  <DetailField
                    label="Remarks"
                    value={order.remarks}
                    span="full"
                    hideWhenEmpty
                  />
                </DetailGrid>

                {/* The per-line variety badge is redundant once the variety
                    cost cards are shown, which is the rule the approval
                    screens follow. */}
                <OrderItemsTable items={items} variety={varieties.length === 0} />
              </div>
            )}
          </DialogBody>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/**
 * A row plus its trail. Two `<tr>`s rather than a nested table: the trail has
 * to line up under the row it belongs to, and a second row spanning every
 * column is how a table says "this belongs to the one above".
 */
function OrderRows({
  order,
  open,
  onToggle,
  onShowDetail,
}: {
  order: MasterOrder;
  open: boolean;
  onToggle: () => void;
  onShowDetail: () => void;
}) {
  const stageAge = daysSince(order.stage_since);

  return (
    <>
      <TableRow>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={
              open
                ? `Hide stage history for ${order.order_number}`
                : `Show stage history for ${order.order_number}`
            }
          >
            {open ? <HiOutlineChevronDown /> : <HiOutlineChevronRight />}
          </Button>
        </TableCell>
        <TableCell className="font-medium">
          {order.order_number}
          {order.is_foc ? (
            <Badge tone="note" className="ml-2">
              FOC
            </Badge>
          ) : null}
        </TableCell>
        <TableCell>{order.card_name}</TableCell>
        <TableCell>{order.created_by_name ?? "—"}</TableCell>
        <TableCell>
          <Badge tone={toneForStatus(order.status_name)}>
            {order.status_name}
          </Badge>
        </TableCell>
        <TableCell>
          {order.pending_with.length > 0 ? (
            order.pending_with.join(", ")
          ) : (
            <span className="text-subtle">—</span>
          )}
        </TableCell>
        <TableCell>
          {stageAge === null
            ? "—"
            : stageAge === 0
              ? "Today"
              : `${stageAge}d`}
        </TableCell>
        <TableCell className="text-right">
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowDetail}
            aria-label={`Order details for ${order.order_number}`}
            title="Order details"
          >
            <HiOutlineInformationCircle />
          </Button>
        </TableCell>
      </TableRow>

      {open ? (
        <TableRow className="hover:bg-surface">
          <TableCell colSpan={8} className="bg-surface-subtle">
            {order.stages.length === 0 ? (
              <p className="text-subtle text-[13px]">
                No stage history recorded for this order.
              </p>
            ) : (
              <Timeline className="py-1">
                {order.stages.map((stage, index) => (
                  <TimelineItem
                    key={`${stage.status_id}-${stage.at}-${index}`}
                    tone={toneForStatus(stage.status_name)}
                    rail={railFor(order.stages[index + 1])}
                    last={index === order.stages.length - 1}
                  >
                    <TimelineHead>
                      <span>{stage.status_name}</span>
                      <time dateTime={stage.at}>{formatDateTime(stage.at)}</time>
                    </TimelineHead>
                    <TimelineNote>
                      {stage.performed_by_name
                        ? `by ${stage.performed_by_name}`
                        : "awaiting action"}
                      {stage.remarks ? ` — ${stage.remarks}` : ""}
                    </TimelineNote>
                  </TimelineItem>
                ))}
              </Timeline>
            )}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
