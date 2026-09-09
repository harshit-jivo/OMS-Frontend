/**
 * Open SO — every open sales order in SAP, with the invoices punched against
 * it and the quantity still to go out.
 *
 * The sorting, the committed-vs-draft date range, the search and the Excel
 * layout are exactly as they were. What changed:
 *
 *   * the row was a `<tr role="button" tabIndex={0}>` with a keydown handler
 *     standing in for Enter and Space. A row is not a button. Clicking it
 *     still opens the order (that is how people use it), but the control a
 *     keyboard reaches is a real button at the end of the row;
 *   * the order modal was a hand-rolled backdrop with its own Escape listener
 *     and `document.body.style.overflow = "hidden"`. It is a `Dialog` now,
 *     which does both and traps focus as well;
 *   * SAP's relationship map — sales order, then each AR invoice, then what
 *     is still to dispatch — is drawn on `ui/timeline`, because that is what
 *     a document flow is.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineArrowRight,
  HiOutlineArchiveBox,
  HiOutlineBeaker,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineChevronUpDown,
  HiOutlineClipboardDocumentList,
  HiOutlineCube,
  HiOutlineDocumentText,
  HiOutlineInbox,
  HiOutlineQueueList,
  HiOutlineTruck,
} from "react-icons/hi2";

import { sapService } from "../services/sapService";
import type {
  PendingDispatchRow,
  PendingOrder,
  PendingOrderInvoice,
} from "../services/sapService";
import { startExcelExport, exportDateStamp } from "../utils/excelExport";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FilterActions,
  FilterBar,
  FilterDate,
  FilterSearch,
  FilterSegmented,
  FilterSelect,
} from "@/components/ui/filter-bar";
import { Card, EmptyState, Notice, Page, PageHeader, SectionHeading, Stat, StatRow } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Timeline, TimelineHead, TimelineItem, TimelineNote } from "@/components/ui/timeline";
import { cn } from "@/lib/utils";

/** Stable empty, so the filter/sort memos settle. */
const NO_ORDERS: PendingOrder[] = [];

/** Dispatch progress -> tone. Not a workflow status, so the mapping stays local. */
const LINE_TONE: Record<string, BadgeTone> = {
  "NOT INVOICED": "neutral",
  "PARTLY INVOICED": "hold",
  INVOICED: "ok",
};

const BRANCHES = [
  { value: "OIL", label: "Oil" },
  { value: "BEVERAGE", label: "Beverage" },
] as const;

type Branch = (typeof BRANCHES)[number]["value"];

type StatusFilter = "ALL" | "NOT INVOICED" | "PARTLY INVOICED";

const formatNum = (value: number, decimals = 2): string =>
  value.toLocaleString("en-IN", { maximumFractionDigits: decimals });

const formatMoney = (value: number): string =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const formatDate = (value: string | null): string => {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}.${m}.${y}` : value;
};

/* -------------------------------------------------------------------------- */
/* Sorting                                                                    */
/* -------------------------------------------------------------------------- */

type SortKey =
  | "order_date"
  | "age"
  | "sales_order"
  | "party_name"
  | "location"
  | "chain"
  | "so_name"
  | "dispatch_from"
  | "pending_line_count"
  | "qty_ordered"
  | "qty_invoiced"
  | "qty_pending"
  | "ltr_pending"
  | "boxes_pending"
  | "invoiced_pct"
  | "invoice_count";

type SortDir = "asc" | "desc";

interface SortState {
  key: SortKey;
  dir: SortDir;
}

/**
 * Oldest order first by default — the one waiting longest is the one to chase,
 * and it matches the order the API returns.
 */
const DEFAULT_SORT: SortState = { key: "order_date", dir: "asc" };

/** Columns that read better starting from the biggest value. */
const DESC_FIRST: ReadonlySet<SortKey> = new Set([
  "age",
  "pending_line_count",
  "qty_ordered",
  "qty_invoiced",
  "qty_pending",
  "ltr_pending",
  "boxes_pending",
  "invoiced_pct",
  "invoice_count",
]);

const sortValue = (order: PendingOrder, key: SortKey): string | number => {
  // Age is just the order date read backwards, so it sorts on the same field
  // with the direction flipped — no second source of truth.
  if (key === "age") return order.order_date ? -Date.parse(order.order_date) : 0;
  const value = order[key];
  if (typeof value === "number") return value;
  // Blank sorts last ascending rather than jumping to the top.
  return String(value ?? "").toLowerCase();
};

const compareOrders = (a: PendingOrder, b: PendingOrder, sort: SortState) => {
  const av = sortValue(a, sort.key);
  const bv = sortValue(b, sort.key);
  let result: number;
  if (typeof av === "number" && typeof bv === "number") {
    result = av - bv;
  } else {
    const as = String(av);
    const bs = String(bv);
    // Blanks to the bottom whichever way the column is pointing.
    if (as === "" && bs !== "") return 1;
    if (bs === "" && as !== "") return -1;
    result = as.localeCompare(bs);
  }
  // Ties fall back to the SO number so the order never shuffles between
  // renders on columns with lots of repeats (chain, location, dispatch from).
  if (result === 0) return a.sales_order - b.sales_order;
  return sort.dir === "asc" ? result : -result;
};

interface OrderColumn {
  key: SortKey;
  label: string;
  numeric?: boolean;
  className?: string;
}

/** The order-table columns, in screen order. Every one of them sorts. */
const ORDER_COLUMNS: OrderColumn[] = [
  { key: "order_date", label: "Order date" },
  { key: "age", label: "Age" },
  { key: "sales_order", label: "Sales order" },
  { key: "invoice_count", label: "Invoices" },
  { key: "invoiced_pct", label: "Billed", className: "min-w-[120px]" },
  { key: "party_name", label: "Party name", className: "min-w-[200px]" },
  { key: "location", label: "Location" },
  { key: "chain", label: "Chain" },
  { key: "so_name", label: "SO name" },
  { key: "dispatch_from", label: "Dispatch from" },
  { key: "pending_line_count", label: "Lines", numeric: true },
  { key: "qty_ordered", label: "Ordered", numeric: true },
  { key: "qty_invoiced", label: "Invoiced", numeric: true },
  { key: "qty_pending", label: "Pending", numeric: true },
  { key: "ltr_pending", label: "Pend. ltr", numeric: true },
  { key: "boxes_pending", label: "Pend. box", numeric: true },
];

/** `YYYY-MM-DD` from local fields — `toISOString()` would shift east of UTC. */
const isoDate = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * The same day one month back, clamped to the end of that month.
 *
 * `setMonth(-1)` alone rolls over on long months — on 31 March it lands on
 * 3 March, since 31 February does not exist — which would silently shorten the
 * default window to three days.
 */
const oneMonthAgo = (): string => {
  const now = new Date();
  const day = now.getDate();
  const back = new Date(now);
  back.setDate(1);
  back.setMonth(back.getMonth() - 1);
  const lastDayOfThatMonth = new Date(back.getFullYear(), back.getMonth() + 1, 0).getDate();
  back.setDate(Math.min(day, lastDayOfThatMonth));
  return isoDate(back);
};

/** Whole days an order has been sitting open — the ageing that drives chasing. */
const daysOpen = (orderDate: string | null): number | null => {
  if (!orderDate) return null;
  const [y, m, d] = orderDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const then = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - then) / 86_400_000));
};

const numCell = "text-right tabular-nums";

export default function SO_Invoice_Report() {
  const [branch, setBranch] = useState<Branch>("OIL");
  // Defaults to the last month of orders. Lazy initialisers so the dates are
  // computed once, not on every render. Clearing "from" widens the report to
  // every open order, however old.
  const [fromDate, setFromDate] = useState(oneMonthAgo);
  const [toDate, setToDate] = useState(() => isoDate(new Date()));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  /** The order whose detail dialog is open, or null when none is. */
  const [selected, setSelected] = useState<PendingOrder | null>(null);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  /*
   * The COMMITTED range, which is what the query is keyed on. `fromDate` and
   * `toDate` are draft inputs — keying on them would fire a request per
   * keystroke. Applying is an explicit act, so it gets its own state.
   */
  const [applied, setApplied] = useState({ from: fromDate, to: toDate });

  const applyRange = () => {
    setApplied({ from: fromDate, to: toDate });
    // The open dialog's order may be gone (or stale) after a reload.
    setSelected(null);
  };

  const {
    data: orders = NO_ORDERS,
    isFetching: loading,
    isError,
  } = useQuery({
    queryKey: ["sap", "pending-dispatch", branch, applied.from, applied.to],
    queryFn: async () => (await sapService.getPendingDispatch(branch, applied)).orders ?? [],
  });

  const error = isError ? "Could not load sales orders from SAP. Please try again in a moment." : "";

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = orders.filter((order) => {
      if (statusFilter !== "ALL" && order.status !== statusFilter) return false;
      if (!term) return true;
      return (
        order.party_name.toLowerCase().includes(term) ||
        order.card_code.toLowerCase().includes(term) ||
        order.so_name.toLowerCase().includes(term) ||
        String(order.sales_order).includes(term) ||
        order.invoices.some((inv) => String(inv.invoice_num).includes(term)) ||
        order.lines.some(
          (line) =>
            line.item_code.toLowerCase().includes(term) ||
            line.item_name.toLowerCase().includes(term),
        )
      );
    });
    // Copied before sorting: sorting the state array in place would mutate it.
    return [...filtered].sort((a, b) => compareOrders(a, b, sort));
  }, [orders, search, sort, statusFilter]);

  /**
   * Click a header to sort by it; click the same one again to flip direction.
   * Quantity columns open on the biggest value, names and dates on the first.
   */
  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DESC_FIRST.has(key) ? "desc" : "asc" },
    );

  const totals = useMemo(
    () =>
      visible.reduce(
        (acc, order) => ({
          pcs: acc.pcs + order.qty_pending,
          ltr: acc.ltr + order.ltr_pending,
          boxes: acc.boxes + order.boxes_pending,
          invoices: acc.invoices + order.invoice_count,
          lines: acc.lines + order.pending_line_count,
        }),
        { pcs: 0, ltr: 0, boxes: 0, invoices: 0, lines: 0 },
      ),
    [visible],
  );

  /**
   * The Excel download keeps the team's original flat layout — one row per
   * pending line, same column order and headings as the sheet they already
   * work in — regardless of how the screen groups things.
   */
  const handleExport = () => {
    const rows = visible.flatMap((order) =>
      order.lines
        .filter((line) => line.qty_pcs > 0)
        .map((line) => ({
          "ORDER DATE": line.order_date,
          "DISPATCH FROM": line.dispatch_from,
          "SO NAME": line.so_name,
          "Customer code": line.card_code,
          "PARTY NAME": line.party_name,
          LOCATION: line.location,
          CHAIN: line.chain,
          "SKU NO": line.item_code,
          "SKU NAME": line.item_name,
          "QTY ORDERED": line.qty_ordered,
          "QTY INVOICED": line.qty_invoiced,
          "QTY IN PCS": line.qty_pcs,
          "TOTAL LTR": line.total_ltr,
          "QTY IN BOXES": line.qty_boxes,
          "SALES ORDER": String(line.sales_order),
          "DELIVERY REMARK": "",
          "REMARK 2": "",
          INVOICE: line.invoice,
          "DISPATCH REMARK": "",
          "CASE PACK": line.case_pack,
          "PER LTR": line.per_ltr,
          "BOX/LTR": line.box_ltr,
          BRAND: line.brand,
          "OIL CATEGORY": line.oil_category,
          CATEGORY: line.category,
          "CASE PACK TYPE": line.case_pack_type,
          VARIETY: line.variety,
          "ORDER INVOICES": line.order_invoices,
          "INVOICE COUNT": order.invoice_count,
          STATUS: line.status,
        })),
    );

    if (rows.length === 0) return;

    startExcelExport(rows, {
      fileName: `SO_vs_Invoice_${branch}_${exportDateStamp()}`,
      sheetName: "SO vs Invoice",
      columns: {
        "QTY ORDERED": { type: "decimal", decimals: 2 },
        "QTY INVOICED": { type: "decimal", decimals: 2 },
        "QTY IN PCS": { type: "decimal", decimals: 2 },
        "TOTAL LTR": { type: "decimal", decimals: 2 },
        "QTY IN BOXES": { type: "decimal", decimals: 2 },
        "PER LTR": { type: "decimal", decimals: 4 },
        "BOX/LTR": { type: "decimal", decimals: 2 },
        "CASE PACK": { type: "integer" },
        "INVOICE COUNT": { type: "integer" },
        // Document numbers are labels, not quantities: left as text so Excel
        // neither groups them into "626,080,321" nor tries to sum them, and so
        // a multi-invoice cell ("626080206, 626080212") stays intact.
        "SALES ORDER": { type: "text" },
        INVOICE: { type: "text" },
        "ORDER INVOICES": { type: "text" },
        // The three remark columns are exported blank, for the team to fill in
        // after downloading — they are not SAP data, so the report does not
        // invent them.
        "DELIVERY REMARK": { type: "text", width: 20 },
        "REMARK 2": { type: "text", width: 16 },
        "DISPATCH REMARK": { type: "text", width: 20 },
        "SKU NAME": { width: 44 },
        "PARTY NAME": { width: 34 },
      },
      totalsRow: {
        sum: ["QTY ORDERED", "QTY INVOICED", "QTY IN PCS", "TOTAL LTR", "QTY IN BOXES"],
        labelColumn: "PARTY NAME",
        label: "TOTAL",
      },
    });
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Reports" }, { label: "Open SO" }]} />

      <PageHeader
        title="Open SO"
        description="Every open sales order in SAP with the invoices punched against it and the quantity still to go out. Showing the last month by default; clear the from-date for every open order."
        actions={
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={loading || visible.length === 0}
          >
            <HiOutlineArrowDownTray aria-hidden="true" /> Download Excel
          </Button>
        }
      />

      <FilterBar>
        <FilterSegmented
          label="Company"
          value={branch}
          options={BRANCHES}
          onChange={(next) => {
            setBranch(next);
            setSelected(null);
          }}
        />
        <FilterDate
          label="Order date from"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <FilterDate label="To" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          fieldClassName="max-w-[190px] flex-none"
        >
          <option value="ALL">All open orders</option>
          <option value="NOT INVOICED">Nothing invoiced</option>
          <option value="PARTLY INVOICED">Partly invoiced</option>
        </FilterSelect>
        <FilterSearch
          placeholder="Party, item, SO or invoice number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          fieldClassName="min-w-[240px]"
        />
        <FilterActions>
          {/* The dates are drafts until this is pressed — see `applied`. */}
          <Button onClick={applyRange} disabled={loading}>
            <HiOutlineArrowPath
              aria-hidden="true"
              className={loading ? "motion-safe:animate-spin" : undefined}
            />
            {loading ? "Loading…" : "Apply"}
          </Button>
        </FilterActions>
      </FilterBar>

      {error ? (
        <Notice tone="bad" title="Could not load sales orders">
          {error}
        </Notice>
      ) : null}

      <StatRow>
        <Stat icon={HiOutlineClipboardDocumentList} tone="brand" label="Open orders" value={visible.length} loading={loading} />
        <Stat icon={HiOutlineDocumentText} tone="neutral" label="Invoices" value={totals.invoices} loading={loading} />
        <Stat icon={HiOutlineQueueList} tone="neutral" label="Pending lines" value={totals.lines} loading={loading} />
        <Stat icon={HiOutlineCube} tone="hold" label="Pending pcs" value={formatNum(totals.pcs, 0)} loading={loading} />
        <Stat icon={HiOutlineBeaker} tone="neutral" label="Pending litres" value={formatNum(totals.ltr, 0)} loading={loading} />
        <Stat icon={HiOutlineArchiveBox} tone="neutral" label="Pending boxes" value={formatNum(totals.boxes, 0)} loading={loading} />
      </StatRow>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="p-4">
            <TableSkeleton columns={8} label="Fetching open sales orders from SAP" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={HiOutlineInbox}
            title={orders.length === 0 ? "No open sales orders" : "No orders match the current filters"}
            hint={
              orders.length === 0
                ? `Nothing open for this company between ${formatDate(applied.from || null) || "the start"} and ${formatDate(applied.to || null) || "today"}.`
                : "Clear the search or the status filter to see them all."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  {ORDER_COLUMNS.map((column) => (
                    <SortHeader key={column.key} column={column} sort={sort} onSort={toggleSort} />
                  ))}
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((order) => {
                  const age = daysOpen(order.order_date);
                  return (
                    <TableRow
                      key={order.so_doc_entry}
                      className="cursor-pointer"
                      onClick={() => setSelected(order)}
                    >
                      <TableCell className="whitespace-nowrap">{formatDate(order.order_date)}</TableCell>
                      <TableCell>
                        {age === null ? (
                          ""
                        ) : (
                          /* Past a month is where a "still open" becomes a
                             "why is this still open". */
                          <Badge tone={age > 30 ? "bad" : "neutral"}>{age}d</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold text-brand">
                        {order.sales_order}
                      </TableCell>
                      <TableCell>
                        {order.invoice_count === 0 ? (
                          <Badge outlined>None</Badge>
                        ) : (
                          <Badge tone="hold" outlined>
                            {order.invoice_count} {order.invoice_count === 1 ? "invoice" : "invoices"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <ProgressBar pct={order.invoiced_pct} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-ink">{order.party_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{order.location}</TableCell>
                      <TableCell className="whitespace-nowrap">{order.chain}</TableCell>
                      <TableCell className="whitespace-nowrap">{order.so_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{order.dispatch_from}</TableCell>
                      <TableCell className={numCell}>
                        {order.pending_line_count}/{order.line_count}
                      </TableCell>
                      <TableCell className={numCell}>{formatNum(order.qty_ordered, 0)}</TableCell>
                      <TableCell className={numCell}>
                        {order.qty_invoiced ? formatNum(order.qty_invoiced, 0) : "—"}
                      </TableCell>
                      <TableCell className={cn(numCell, "font-semibold text-ink")}>
                        {formatNum(order.qty_pending, 0)}
                      </TableCell>
                      <TableCell className={numCell}>{formatNum(order.ltr_pending, 0)}</TableCell>
                      <TableCell className={numCell}>{formatNum(order.boxes_pending, 0)}</TableCell>
                      <TableCell>
                        {/* The keyboard-reachable way in. Stops propagation so
                            the row's own click does not open it twice. */}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Open sales order ${order.sales_order}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected(order);
                          }}
                        >
                          <HiOutlineArrowRight aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
      >
        {selected ? <OrderDialogContent order={selected} /> : null}
      </Dialog>
    </Page>
  );
}

/**
 * A sortable column heading.
 *
 * The arrow is always in the DOM, faint until the column is hovered or active,
 * so the header keeps one width and the row never shifts as you sort.
 */
function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: OrderColumn;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === column.key;
  const dir = active ? sort.dir : undefined;
  const Icon = active
    ? dir === "asc"
      ? HiOutlineChevronUp
      : HiOutlineChevronDown
    : HiOutlineChevronUpDown;
  return (
    <TableHead
      className={cn(column.className, column.numeric && "text-right")}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        title={`Sort by ${column.label.toLowerCase()}`}
        // The form-control reset — Preflight is not imported, and a <button>
        // does not inherit FONT from its <th>: `[font:inherit]` is the whole
        // shorthand (size, weight, family), spelled that way because
        // `font-[inherit]` is ambiguous to Tailwind and came out as
        // font-weight alone — every sortable heading rendered at the UA's
        // 13.33px against the 11px of the plain heads beside it.
        className={cn(
          "group inline-flex appearance-none items-center gap-1 border-0 bg-transparent p-0",
          "[font:inherit] [letter-spacing:inherit] uppercase text-inherit cursor-pointer",
          "hover:text-ink focus-visible:outline-none focus-visible:shadow-focus rounded-sm",
          column.numeric && "flex-row-reverse",
          active && "text-brand",
        )}
      >
        <span>{column.label}</span>
        <Icon
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 transition-opacity",
            active ? "opacity-100" : "opacity-30 group-hover:opacity-70",
          )}
        />
      </button>
    </TableHead>
  );
}

/** How much of the order has been billed, as a bar plus the figure. */
function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="flex items-center gap-2"
      title={`${pct}% of the ordered qty billed`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-strong">
        <div
          className={cn("h-full rounded-full", clamped >= 100 ? "bg-ok" : "bg-brand")}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-[11.5px] tabular-nums text-subtle">{Math.round(clamped)}%</span>
    </div>
  );
}

/**
 * One order in full: its lines on the left, SAP's relationship map on the
 * right. Everything about closing it — Escape, backdrop, the X, the scroll
 * lock — is `Dialog`'s.
 */
function OrderDialogContent({ order }: { order: PendingOrder }) {
  return (
    <DialogContent title={`Sales order ${order.sales_order}`} size="xl" className="max-w-[1180px]">
      <DialogHeader>
        <div className="min-w-0">
          <p className="m-0 mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
            Sales order
          </p>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {order.sales_order}
            <Badge tone={order.invoice_count ? "hold" : "neutral"} outlined>
              {order.status}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {order.party_name}
            {order.card_code ? ` · ${order.card_code}` : ""} · {formatDate(order.order_date)}
          </DialogDescription>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-6">
        <DetailGrid>
          <DetailField label="Ordered" value={formatNum(order.qty_ordered, 0)} />
          <DetailField label="Invoiced" value={formatNum(order.qty_invoiced, 0)} />
          <DetailField label="Pending" value={formatNum(order.qty_pending, 0)} />
          <DetailField label="Pending ltr" value={formatNum(order.ltr_pending, 0)} />
          <DetailField label="Pending box" value={formatNum(order.boxes_pending, 0)} />
          <DetailField label="Billed" value={`${Math.round(order.invoiced_pct)}%`} />
          <DetailField label="Location" value={order.location || "—"} />
          <DetailField label="Chain" value={order.chain || "—"} />
          <DetailField label="SO name" value={order.so_name || "—"} />
          <DetailField label="Dispatch from" value={order.dispatch_from || "—"} />
        </DetailGrid>

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <section className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <SectionHeading>Lines</SectionHeading>
              <Badge tone="neutral">
                {order.pending_line_count} pending of {order.line_count}
              </Badge>
            </div>
            <div className="overflow-x-auto rounded-card border border-line">
              <Table density="compact">
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableHead>SKU no</TableHead>
                    <TableHead className="min-w-[200px]">SKU name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Invoiced</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-right">Ltr</TableHead>
                    <TableHead className="text-right">Boxes</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line) => (
                    <LineRow key={`${line.so_doc_entry}-${line.line_num}`} line={line} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="min-w-0">
            <SectionHeading className="mb-2">Relationship map</SectionHeading>
            <FlowMap order={order} />
          </section>
        </div>
      </DialogBody>
    </DialogContent>
  );
}

/**
 * SAP's relationship map, top-down: the sales order, then everything drawn
 * from it — each AR invoice, and what is still to dispatch. A document flow
 * is a sequence of things that happened, which is what `ui/timeline` draws.
 */
function FlowMap({ order }: { order: PendingOrder }) {
  const hasPending = order.qty_pending > 0;
  const lastIsPending = hasPending;
  return (
    <Timeline>
      <TimelineItem tone="info" last={order.invoices.length === 0 && !hasPending}>
        <TimelineHead>
          <HiOutlineClipboardDocumentList aria-hidden="true" className="size-4 text-brand" />
          Sales order {order.sales_order}
        </TimelineHead>
        <TimelineNote>{formatDate(order.order_date)}</TimelineNote>
        <TimelineNote>{formatNum(order.qty_ordered, 0)} pcs ordered</TimelineNote>
      </TimelineItem>

      {order.invoices.map((invoice, index) => (
        <InvoiceNode
          key={invoice.invoice_entry}
          invoice={invoice}
          last={!lastIsPending && index === order.invoices.length - 1}
        />
      ))}

      {order.invoices.length === 0 ? (
        <TimelineItem tone="neutral" last={!hasPending}>
          <TimelineNote>No AR invoice has been raised against this order yet.</TimelineNote>
        </TimelineItem>
      ) : null}

      {hasPending ? (
        <TimelineItem tone="hold" last>
          <TimelineHead>
            <HiOutlineTruck aria-hidden="true" className="size-4 text-hold" />
            Still to dispatch
          </TimelineHead>
          <TimelineNote>
            {formatNum(order.qty_pending, 0)} pcs · {formatNum(order.ltr_pending, 0)} ltr ·{" "}
            {formatNum(order.boxes_pending, 0)} box
          </TimelineNote>
          <TimelineNote>
            {order.pending_line_count} of {order.line_count} lines
          </TimelineNote>
        </TimelineItem>
      ) : null}
    </Timeline>
  );
}

function InvoiceNode({ invoice, last }: { invoice: PendingOrderInvoice; last: boolean }) {
  return (
    <TimelineItem tone="ok" last={last}>
      <TimelineHead>
        <HiOutlineDocumentText aria-hidden="true" className="size-4 text-ok" />
        AR invoice {invoice.invoice_num}
      </TimelineHead>
      <TimelineNote>{formatDate(invoice.invoice_date)}</TimelineNote>
      <TimelineNote>
        {formatNum(invoice.qty, 0)} pcs · {formatMoney(invoice.amount)}
      </TimelineNote>
      <TimelineNote>
        {invoice.line_count} {invoice.line_count === 1 ? "line" : "lines"} from this order
      </TimelineNote>
    </TimelineItem>
  );
}

function LineRow({ line }: { line: PendingDispatchRow }) {
  const done = line.qty_pcs <= 0;
  return (
    <TableRow className={done ? "text-subtle" : undefined}>
      <TableCell className="whitespace-nowrap font-mono text-[12px]">{line.item_code}</TableCell>
      <TableCell className={done ? undefined : "text-ink"}>{line.item_name}</TableCell>
      <TableCell className="whitespace-nowrap">{line.sku}</TableCell>
      <TableCell className={numCell}>{formatNum(line.qty_ordered, 0)}</TableCell>
      <TableCell className={numCell}>
        {line.qty_invoiced ? formatNum(line.qty_invoiced, 0) : "—"}
      </TableCell>
      <TableCell className={cn(numCell, !done && "font-semibold text-ink")}>
        {formatNum(line.qty_pcs, 0)}
      </TableCell>
      <TableCell className={numCell}>{formatNum(line.total_ltr)}</TableCell>
      <TableCell className={numCell}>{formatNum(line.qty_boxes)}</TableCell>
      <TableCell className="whitespace-nowrap">
        {line.invoice ? (
          line.invoice
        ) : line.order_invoices ? (
          <span title="Raised against this order, on other lines" className="inline-flex items-center gap-1">
            {line.order_invoices}
            <Badge tone="neutral">SO</Badge>
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        <Badge outlined tone={LINE_TONE[line.status] ?? "neutral"}>
          {line.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
