import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

/** Stable empty, so the filter/sort memos settle. */
const NO_ORDERS: PendingOrder[] = [];
import {
  HiArrowDownTray,
  HiArrowPath,
  HiChevronDown,
  HiChevronRight,
  HiChevronUp,
  HiChevronUpDown,
  HiClipboardDocumentList,
  HiDocumentText,
  HiTruck,
  HiXMark,
} from "react-icons/hi2";
import { sapService } from "../services/sapService";
import type {
  PendingDispatchRow,
  PendingOrder,
  PendingOrderInvoice,
} from "../services/sapService";
import { startExcelExport, exportDateStamp } from "../utils/excelExport";
import "../styles/SO_Invoice_Report.css";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Dispatch progress -> tone, read off the progress rules in SO_Invoice_Report.css. */
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
  className?: string;
}

/** The order-table columns, in screen order. Every one of them sorts. */
const ORDER_COLUMNS: OrderColumn[] = [
  { key: "order_date", label: "ORDER DATE" },
  { key: "age", label: "AGE" },
  { key: "sales_order", label: "SALES ORDER" },
  { key: "invoice_count", label: "INVOICES" },
  { key: "invoiced_pct", label: "BILLED", className: "sovi-col-progress" },
  { key: "party_name", label: "PARTY NAME", className: "sovi-col-wide" },
  { key: "location", label: "LOCATION" },
  { key: "chain", label: "CHAIN" },
  { key: "so_name", label: "SO NAME" },
  { key: "dispatch_from", label: "DISPATCH FROM" },
  { key: "pending_line_count", label: "LINES", className: "sovi-num" },
  { key: "qty_ordered", label: "ORDERED", className: "sovi-num" },
  { key: "qty_invoiced", label: "INVOICED", className: "sovi-num" },
  { key: "qty_pending", label: "PENDING", className: "sovi-num" },
  { key: "ltr_pending", label: "PEND. LTR", className: "sovi-num" },
  { key: "boxes_pending", label: "PEND. BOX", className: "sovi-num" },
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
  const lastDayOfThatMonth = new Date(
    back.getFullYear(),
    back.getMonth() + 1,
    0,
  ).getDate();
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

export default function SO_Invoice_Report() {

  const [branch, setBranch] = useState<Branch>("OIL");
  // Defaults to the last month of orders. Lazy initialisers so the dates are
  // computed once, not on every render. Clearing "from" widens the report to
  // every open order, however old.
  const [fromDate, setFromDate] = useState(oneMonthAgo);
  const [toDate, setToDate] = useState(() => isoDate(new Date()));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  /** The order whose detail modal is open, or null when none is. */
  const [selected, setSelected] = useState<PendingOrder | null>(null);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  /*
   * The COMMITTED range, which is what the query is keyed on. `fromDate` and
   * `toDate` are draft inputs — the old effect carried an `exhaustive-deps`
   * disable precisely because listing them would fire a request per keystroke.
   * Applying is an explicit act, so it gets its own state.
   */
  const [applied, setApplied] = useState({ from: fromDate, to: toDate });

  const applyRange = () => {
    setApplied({ from: fromDate, to: toDate });
    // The open modal's order may be gone (or stale) after a reload. Was done
    // inside the fetch; re-expressing it as an effect on `orders` is the trap.
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

  const error = isError
    ? "Could not load sales orders from SAP. Please try again in a moment."
    : "";

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
    // Copied before sorting: `filter` already returns a new array, but sorting
    // the state array in place would mutate it.
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

  // ── Route access: now decided once, in components/ProtectedPage.tsx ───────
  // The guard that used to sit here is commented out below rather than removed.
  //
  // It was not merely redundant, it was WRONG, and in the direction that hurts:
  // `role !== "billing"` bounced an administrator off a page the sidebar showed
  // them and the API served them, because it compared the primary role string
  // alone — no `extra_roles`, no `is_superuser`, no `is_staff`. Two guards that
  // disagree are worse than one, and this was the one that was mistaken.
  //
  //   const role = (localStorage.getItem("role") || "").toLowerCase();
  //   if (role !== "billing") return <Navigate to="/Dashboard" replace />;
  //
  // `auth/routeAccess.ts` carries the same rule (`roles: ["billing"]`) with the
  // admin bypass every other route gets.

  return (
    <div className="sovi-page">
      <div className="sovi-header">
        <div>
          <h1 className="sovi-title">Open And SO</h1>
          <p className="sovi-subtitle">
            Every open sales order in SAP with the invoices punched against it
            and the quantity still to go out. Read straight from SAP — open an
            order to see its document flow. Showing the last month by default;
            clear the from-date for every open order.
          </p>
        </div>
      </div>

      <div className="sovi-controls">
        <div className="sovi-field">
          <span className="sovi-label" id="sovi-branch-label">
            Company
          </span>
          <div
            className="sovi-segmented"
            role="radiogroup"
            aria-labelledby="sovi-branch-label"
          >
            {BRANCHES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={branch === option.value}
                className={`sovi-segment${
                  branch === option.value ? " sovi-segment-active" : ""
                }`}
                onClick={() => {
                  setBranch(option.value);
                  setSelected(null);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sovi-field">
          <label className="sovi-label" htmlFor="sovi-from">
            Order date from
          </label>
          <input
            id="sovi-from"
            className="sovi-input"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div className="sovi-field">
          <label className="sovi-label" htmlFor="sovi-to">
            To
          </label>
          <input
            id="sovi-to"
            className="sovi-input"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <div className="sovi-field">
          <label className="sovi-label" htmlFor="sovi-status">
            Status
          </label>
          <select
            id="sovi-status"
            className="sovi-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="ALL">All open orders</option>
            <option value="NOT INVOICED">Nothing invoiced</option>
            <option value="PARTLY INVOICED">Partly invoiced</option>
          </select>
        </div>

        <div className="sovi-field sovi-field-grow">
          <label className="sovi-label" htmlFor="sovi-search">
            Search
          </label>
          <input
            id="sovi-search"
            className="sovi-input"
            type="search"
            placeholder="Party, item, SO or invoice number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="sovi-actions">
          <button
            type="button"
            className="sovi-btn sovi-btn-ghost"
            onClick={applyRange}
            disabled={loading}
          >
            <HiArrowPath aria-hidden="true" />
            {loading ? "Loading…" : "Apply"}
          </button>
          <button
            type="button"
            className="sovi-btn sovi-btn-primary"
            onClick={handleExport}
            disabled={loading || visible.length === 0}
          >
            <HiArrowDownTray aria-hidden="true" />
            Download Excel
          </button>
        </div>
      </div>

      {error && <p className="sovi-error">{error}</p>}

      {!loading && orders.length > 0 && (
        <div className="sovi-summary">
          <div className="sovi-stat">
            <div className="sovi-stat-label">Open orders</div>
            <div className="sovi-stat-value">{visible.length}</div>
          </div>
          <div className="sovi-stat">
            <div className="sovi-stat-label">Invoices punched</div>
            <div className="sovi-stat-value">{totals.invoices}</div>
          </div>
          <div className="sovi-stat">
            <div className="sovi-stat-label">Pending lines</div>
            <div className="sovi-stat-value">{totals.lines}</div>
          </div>
          <div className="sovi-stat">
            <div className="sovi-stat-label">Pending pcs</div>
            <div className="sovi-stat-value">{formatNum(totals.pcs, 0)}</div>
          </div>
          <div className="sovi-stat">
            <div className="sovi-stat-label">Pending litres</div>
            <div className="sovi-stat-value">{formatNum(totals.ltr, 0)}</div>
          </div>
          <div className="sovi-stat">
            <div className="sovi-stat-label">Pending boxes</div>
            <div className="sovi-stat-value">{formatNum(totals.boxes, 0)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="sovi-state">Fetching open sales orders from SAP…</div>
      ) : visible.length === 0 ? (
        <div className="sovi-state">
          {orders.length === 0
            ? `No open sales orders for this company between ${formatDate(
                fromDate || null,
              ) || "the start"} and ${formatDate(toDate || null) || "today"}.`
            : "No orders match the current filters."}
        </div>
      ) : (
        <div className="sovi-table-card">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                {ORDER_COLUMNS.map((column) => (
                  <SortHeader
                    key={column.key}
                    column={column}
                    sort={sort}
                    onSort={toggleSort}
                  />
                ))}
                <TableHead className="sovi-col-toggle" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((order) => {
                const age = daysOpen(order.order_date);
                return (
                    <TableRow
                      key={order.so_doc_entry}
                      className="sovi-order-row"
                      tabIndex={0}
                      role="button"
                      aria-label={`Open sales order ${order.sales_order}`}
                      onClick={() => setSelected(order)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(order);
                        }
                      }}
                    >
                      <TableCell>{formatDate(order.order_date)}</TableCell>
                      <TableCell>
                        {age === null ? (
                          ""
                        ) : (
                          <span
                            className={`sovi-age${age > 30 ? " sovi-age-old" : ""}`}
                          >
                            {age}d
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="sovi-doc">{order.sales_order}</TableCell>
                      <TableCell>
                        {order.invoice_count === 0 ? (
                          <Badge outlined>None</Badge>
                        ) : (
                          <Badge tone="hold" outlined>
                            {order.invoice_count}{" "}
                            {order.invoice_count === 1 ? "invoice" : "invoices"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="sovi-col-progress">
                        <ProgressBar pct={order.invoiced_pct} />
                      </TableCell>
                      <TableCell className="sovi-col-wide">{order.party_name}</TableCell>
                      <TableCell>{order.location}</TableCell>
                      <TableCell>{order.chain}</TableCell>
                      <TableCell>{order.so_name}</TableCell>
                      <TableCell>{order.dispatch_from}</TableCell>
                      <TableCell className="sovi-num">
                        {order.pending_line_count}/{order.line_count}
                      </TableCell>
                      <TableCell className="sovi-num">
                        {formatNum(order.qty_ordered, 0)}
                      </TableCell>
                      <TableCell className="sovi-num">
                        {order.qty_invoiced
                          ? formatNum(order.qty_invoiced, 0)
                          : "—"}
                      </TableCell>
                      <TableCell className="sovi-num sovi-strong">
                        {formatNum(order.qty_pending, 0)}
                      </TableCell>
                      <TableCell className="sovi-num">
                        {formatNum(order.ltr_pending, 0)}
                      </TableCell>
                      <TableCell className="sovi-num">
                        {formatNum(order.boxes_pending, 0)}
                      </TableCell>
                      <TableCell className="sovi-col-toggle">
                        <HiChevronRight
                          className="sovi-chevron"
                          aria-hidden="true"
                        />
                      </TableCell>
                    </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {selected && (
        <OrderModal order={selected} onClose={() => setSelected(null)} />
      )}
    </div>
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
  return (
    <th
      className={`sovi-th-sort${active ? " sovi-th-active" : ""}${
        column.className ? ` ${column.className}` : ""
      }`}
      aria-sort={
        active ? (dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        className="sovi-sort-btn"
        onClick={() => onSort(column.key)}
        title={`Sort by ${column.label.toLowerCase()}`}
      >
        <span>{column.label}</span>
        {active ? (
          dir === "asc" ? (
            <HiChevronUp className="sovi-sort-icon sovi-sort-on" aria-hidden="true" />
          ) : (
            <HiChevronDown className="sovi-sort-icon sovi-sort-on" aria-hidden="true" />
          )
        ) : (
          <HiChevronUpDown className="sovi-sort-icon" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

/** How much of the order has been billed, as a bar plus the figure. */
function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="sovi-progress" title={`${pct}% of the ordered qty billed`}>
      <div className="sovi-progress-track">
        <div
          className={`sovi-progress-fill${clamped === 0 ? " sovi-progress-empty" : ""}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="sovi-progress-label">{Math.round(clamped)}%</span>
    </div>
  );
}

/**
 * One order in full: its lines on the left, SAP's relationship map on the
 * right. Closes on Escape, on the backdrop, or on the X.
 */
function OrderModal({
  order,
  onClose,
}: {
  order: PendingOrder;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    // The page behind must not scroll under the modal — restore whatever the
    // page had rather than hard-coding "auto".
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="sovi-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sovi-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Sales order ${order.sales_order}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sovi-modal-head">
          <div>
            <div className="sovi-modal-eyebrow">Sales Order</div>
            <h2 className="sovi-modal-title">
              {order.sales_order}
              <Badge tone={order.invoice_count ? "hold" : "neutral"} outlined>
                {order.status}
              </Badge>
            </h2>
            <div className="sovi-modal-sub">
              {order.party_name}
              {order.card_code ? ` · ${order.card_code}` : ""} ·{" "}
              {formatDate(order.order_date)}
            </div>
          </div>
          <button
            type="button"
            className="sovi-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <HiXMark aria-hidden="true" />
          </button>
        </div>

        <div className="sovi-modal-meta">
          <ModalStat label="Ordered" value={formatNum(order.qty_ordered, 0)} />
          <ModalStat label="Invoiced" value={formatNum(order.qty_invoiced, 0)} />
          <ModalStat
            label="Pending"
            value={formatNum(order.qty_pending, 0)}
            strong
          />
          <ModalStat label="Pending ltr" value={formatNum(order.ltr_pending, 0)} />
          <ModalStat
            label="Pending box"
            value={formatNum(order.boxes_pending, 0)}
          />
          <ModalStat label="Billed" value={`${Math.round(order.invoiced_pct)}%`} />
          <ModalStat label="Location" value={order.location || "—"} />
          <ModalStat label="Chain" value={order.chain || "—"} />
          <ModalStat label="SO name" value={order.so_name || "—"} />
          <ModalStat label="Dispatch from" value={order.dispatch_from || "—"} />
        </div>

        <div className="sovi-modal-body">
          <div className="sovi-modal-lines">
            <div className="sovi-flow-title">
              Lines ({order.pending_line_count} pending of {order.line_count})
            </div>
            <div className="sovi-lines-scroll">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU NO</TableHead>
                    <TableHead className="sovi-col-wide">SKU NAME</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="sovi-num">ORDERED</TableHead>
                    <TableHead className="sovi-num">INVOICED</TableHead>
                    <TableHead className="sovi-num">PENDING</TableHead>
                    <TableHead className="sovi-num">LTR</TableHead>
                    <TableHead className="sovi-num">BOXES</TableHead>
                    <TableHead>INVOICE</TableHead>
                    <TableHead>STATUS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line) => (
                    <LineRow
                      key={`${line.so_doc_entry}-${line.line_num}`}
                      line={line}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="sovi-modal-flow">
            <div className="sovi-flow-title">Relationship map</div>
            <FlowMap order={order} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalStat({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="sovi-modal-stat">
      <div className="sovi-modal-stat-label">{label}</div>
      <div className={`sovi-modal-stat-value${strong ? " sovi-strong" : ""}`}>
        {value}
      </div>
    </div>
  );
}

/**
 * SAP's relationship map, drawn top-down for the modal's right column: the
 * sales order, then everything drawn from it — each AR invoice, and what is
 * still to dispatch.
 */
function FlowMap({ order }: { order: PendingOrder }) {
  return (
    <div className="sovi-map">
      <div className="sovi-node sovi-node-so">
        <div className="sovi-node-head">
          <HiClipboardDocumentList aria-hidden="true" />
          Sales Order
        </div>
        <div className="sovi-node-doc">{order.sales_order}</div>
        <div className="sovi-node-meta">{formatDate(order.order_date)}</div>
        <div className="sovi-node-meta">
          {formatNum(order.qty_ordered, 0)} pcs ordered
        </div>
      </div>

      <div className="sovi-map-tree">
        {order.invoices.map((invoice) => (
          <InvoiceNode key={invoice.invoice_entry} invoice={invoice} />
        ))}

        {order.invoices.length === 0 && (
          <div className="sovi-flow-empty">
            No AR invoice has been raised against this order yet.
          </div>
        )}

        {order.qty_pending > 0 && (
          <div className="sovi-node sovi-node-pending">
            <div className="sovi-node-head">
              <HiTruck aria-hidden="true" />
              Still to dispatch
            </div>
            <div className="sovi-node-doc">
              {formatNum(order.qty_pending, 0)} pcs
            </div>
            <div className="sovi-node-meta">
              {formatNum(order.ltr_pending, 0)} ltr ·{" "}
              {formatNum(order.boxes_pending, 0)} box
            </div>
            <div className="sovi-node-meta">
              {order.pending_line_count} of {order.line_count} lines
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceNode({ invoice }: { invoice: PendingOrderInvoice }) {
  return (
    <div className="sovi-node sovi-node-inv">
      <div className="sovi-node-head">
        <HiDocumentText aria-hidden="true" />
        AR Invoice
      </div>
      <div className="sovi-node-doc">{invoice.invoice_num}</div>
      <div className="sovi-node-meta">{formatDate(invoice.invoice_date)}</div>
      <div className="sovi-node-meta">
        {formatNum(invoice.qty, 0)} pcs · {formatMoney(invoice.amount)}
      </div>
      <div className="sovi-node-meta">
        {invoice.line_count} {invoice.line_count === 1 ? "line" : "lines"} from
        this order
      </div>
    </div>
  );
}

function LineRow({ line }: { line: PendingDispatchRow }) {
  const done = line.qty_pcs <= 0;
  return (
    <tr className={done ? "sovi-line-done" : ""}>
      <td>{line.item_code}</td>
      <td className="sovi-col-wide">{line.item_name}</td>
      <td>{line.sku}</td>
      <td className="sovi-num">{formatNum(line.qty_ordered, 0)}</td>
      <td className="sovi-num">
        {line.qty_invoiced ? formatNum(line.qty_invoiced, 0) : "—"}
      </td>
      <td className="sovi-num sovi-strong">{formatNum(line.qty_pcs, 0)}</td>
      <td className="sovi-num">{formatNum(line.total_ltr)}</td>
      <td className="sovi-num">{formatNum(line.qty_boxes)}</td>
      <td className="sovi-invoice">
        {line.invoice ? (
          line.invoice
        ) : line.order_invoices ? (
          <span
            className="sovi-invoice-order"
            title="Raised against this order, on other lines"
          >
            {line.order_invoices}
            <span className="sovi-invoice-tag">SO</span>
          </span>
        ) : (
          "—"
        )}
      </td>
      <td>
        {/*
          `line.status` is "NOT INVOICED" / "PARTLY INVOICED" / "INVOICED" —
          dispatch progress, not a workflow status, so the mapping stays local.
        */}
        <Badge outlined tone={LINE_TONE[line.status] ?? "neutral"}>
          {line.status}
        </Badge>
      </td>
    </tr>
  );
}
