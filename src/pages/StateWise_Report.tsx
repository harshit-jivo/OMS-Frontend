import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../services/api";
import "../styles/Report.css";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const now = new Date();
const firstDay = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
const lastDay = toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0));
const itemsPerPage = 10;

type DashboardStateItemProduct = {
  item_code: string;
  item_name: string;
  category: string;
  variety: string;
  total_sales: number;
  quantity: number;
  boxes?: number;
  ltrs?: number;
  count: number;
};

type DashboardStateItemSale = {
  state: string;
  products: DashboardStateItemProduct[];
};

const normalize = (value?: string | number | null) =>
  String(value || "")
    .trim()
    .toLowerCase();

const displayNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

const getItemKey = (item: Pick<DashboardStateItemProduct, "item_code" | "item_name">) =>
  `${normalize(item.item_code)}__${normalize(item.item_name)}`;

const getDashboardPeriod = (fromDate: string, toDate: string) => {
  const from = fromDate ? new Date(`${fromDate}T00:00:00`) : now;
  const to = toDate ? new Date(`${toDate}T00:00:00`) : from;
  const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();

  return {
    year: from.getFullYear(),
    month: sameMonth ? from.getMonth() + 1 : 0,
  };
};

/*
 * A module-level constant, not `[]` inline in the destructure: a fresh array
 * each render is a new identity, which would invalidate every useMemo below it
 * on every render — the exact thing those useMemos exist to avoid.
 */
const EMPTY_SALES: DashboardStateItemSale[] = [];

export default function StateWise_Report() {
  const [selectedProductType, setSelectedProductType] = useState("");
  const [selectedItemKey, setSelectedItemKey] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [orderStatus, setOrderStatus] = useState("completed");
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  /*
   * The page number, stamped with the filters it was chosen under.
   *
   * It used to be a bare number kept in step by two effects — one resetting to
   * 1 whenever a filter changed, one clamping it when the row count shrank.
   * Both wrote state from inside an effect, which costs a second render pass
   * every time and is what `react-hooks/set-state-in-effect` objects to. The
   * stamp lets the correct page be DERIVED during render instead: if the
   * filters have moved on since the user picked page 4, page 4 is simply not
   * what this signature asks for.
   *
   * These two effects were always here; converting the fetch to useQuery is
   * what made the linter able to see them, because the unanalysable fetch
   * effect above them is gone.
   */
  const [pageRequest, setPageRequest] = useState({ signature: "", page: 1 });

  /*
   * The key is the DERIVED period, not the two dates.
   *
   * `getDashboardPeriod` collapses a date range to a year and a month (0 when
   * the range spans months), and that pair is all the request carries. Keying
   * on fromDate/toDate would refetch identical data every time the user nudged
   * a day inside the same month; keying on what the URL actually contains
   * means those are cache hits.
   */
  const period = getDashboardPeriod(fromDate, toDate);

  const { data: stateItemSales = EMPTY_SALES, isPending: isLoading } = useQuery({
    queryKey: ["dashboard-charts", period.year, period.month, orderStatus],
    queryFn: async () => {
      const response = await api.get(
        `/orders/dashboardW/charts/?line_year=${period.year}&year=${period.year}&month=${period.month}&status=${orderStatus}`,
      );
      // Same defensive read as before: this endpoint has been seen to answer
      // with an object when it has nothing to report.
      return Array.isArray(response.data?.state_item_sales)
        ? (response.data.state_item_sales as DashboardStateItemSale[])
        : [];
    },
  });

  const allRows = useMemo(() => {
    return stateItemSales.flatMap((stateItem) =>
      (stateItem.products || []).map((product) => ({
        state: stateItem.state,
        itemKey: getItemKey(product),
        product: product.item_name || product.item_code || "-",
        productType: product.variety || product.category || "Unknown",
        qty: Number(product.quantity || 0),
        boxes: Number(product.boxes || 0),
        ltrs: Number(product.ltrs || 0),
        sales: Number(product.total_sales || 0),
      })),
    );
  }, [stateItemSales]);

  const productTypes = useMemo(
    () =>
      Array.from(new Set(allRows.map((row) => row.productType).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [allRows],
  );

  const itemOptions = useMemo(() => {
    const rows = selectedProductType
      ? allRows.filter((row) => row.productType === selectedProductType)
      : allRows;

    return Array.from(
      new Map(
        rows.map((row) => [
          row.itemKey,
          {
            itemKey: row.itemKey,
            product: row.product,
          },
        ]),
      ).values(),
    ).sort((a, b) => a.product.localeCompare(b.product));
  }, [allRows, selectedProductType]);

  const stateOptions = useMemo(
    () =>
      Array.from(new Set(stateItemSales.map((item) => item.state))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [stateItemSales],
  );

  /*
   * Choosing a product type narrows the item list, which can strip out the item
   * already chosen. That used to be corrected by an effect writing "" back into
   * state; deriving it does the same job in one render pass, and leaves the
   * user's original choice intact should the type filter be cleared again.
   */
  const activeItemKey = itemOptions.some((item) => item.itemKey === selectedItemKey)
    ? selectedItemKey
    : "";

  const reportRows = useMemo(() => {
    return allRows
      .filter((row) => !selectedProductType || row.productType === selectedProductType)
      .filter((row) => !activeItemKey || row.itemKey === activeItemKey)
      .filter((row) => !selectedState || row.state === selectedState)
      .sort((a, b) => {
        const stateSort = a.state.localeCompare(b.state);
        return stateSort || b.sales - a.sales || a.product.localeCompare(b.product);
      });
  }, [allRows, activeItemKey, selectedProductType, selectedState]);

  const totals = reportRows.reduce(
    (sum, row) => ({
      qty: sum.qty + row.qty,
      boxes: sum.boxes + row.boxes,
      ltrs: sum.ltrs + row.ltrs,
      sales: sum.sales + row.sales,
    }),
    { qty: 0, boxes: 0, ltrs: 0, sales: 0 },
  );
  const stateCount = new Set(reportRows.map((row) => row.state)).size;
  const productCount = new Set(reportRows.map((row) => row.itemKey)).size;
  const totalPages = Math.max(1, Math.ceil(reportRows.length / itemsPerPage));

  // Everything the request depends on. A change to any of it means the page the
  // user last picked belongs to a different result set.
  const filterSignature = [
    fromDate,
    toDate,
    orderStatus,
    selectedProductType,
    activeItemKey,
    selectedState,
  ].join("|");

  // Clamped as well as stamped: the row count can shrink without the filters
  // changing at all, when a refetch returns fewer rows.
  const currentPage =
    pageRequest.signature === filterSignature ? Math.min(pageRequest.page, totalPages) : 1;
  const setCurrentPage = (page: number) => setPageRequest({ signature: filterSignature, page });

  const paginatedRows = reportRows.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );
  const selectedItemName =
    itemOptions.find((item) => item.itemKey === activeItemKey)?.product || "";

  return (
    <div className="dr-page">
      <div className="dr-header">
        <h1 className="dr-title">
          State Wise Report
        </h1>
      </div>

      <div className="dr-filter-card">
        <div className="dr-filter-row">
          <div className="dr-field">
            <label className="dr-label">Product Type</label>
            <select aria-label="Product Type"
              className="dr-date-input"
              value={selectedProductType}
              onChange={(event) => setSelectedProductType(event.target.value)}
            >
              <option value="">All Product Types</option>
              {productTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="dr-field">
            <label className="dr-label">Item</label>
            <select aria-label="Item"
              className="dr-date-input"
              value={activeItemKey}
              onChange={(event) => setSelectedItemKey(event.target.value)}
            >
              <option value="">All Items</option>
              {itemOptions.map((item) => (
                <option key={item.itemKey} value={item.itemKey}>
                  {item.product}
                </option>
              ))}
            </select>
          </div>

          <div className="dr-field">
            <label className="dr-label">State</label>
            <select aria-label="State"
              className="dr-date-input"
              value={selectedState}
              onChange={(event) => setSelectedState(event.target.value)}
            >
              <option value="">All States</option>
              {stateOptions.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>

          <div className="dr-field">
            <label className="dr-label">Status</label>
            <select aria-label="Status"
              className="dr-date-input"
              value={orderStatus}
              onChange={(event) => setOrderStatus(event.target.value)}
            >
              <option value="completed">Completed Orders</option>
              <option value="pending">Pending Orders</option>
              <option value="rejected">Rejected Orders</option>
              <option value="all">All Orders</option>
            </select>
          </div>

          <div className="dr-field">
            <label className="dr-label">From</label>
            <input aria-label="From"
              type="date"
              className="dr-date-input"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>

          <div className="dr-field">
            <label className="dr-label">To</label>
            <input aria-label="To"
              type="date"
              className="dr-date-input"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="dr-report-card">
        <div className="dr-report-header">
          <h2 className="dr-report-title">
            {selectedItemName || selectedProductType || "Dashboard State Item Sales"}
          </h2>
          <div className="dr-report-stats">
            <span className="dr-stat">
              States: <strong>{stateCount}</strong>
            </span>
            <span className="dr-stat">
              Products: <strong>{productCount}</strong>
            </span>
            <span className="dr-stat">
              Qty: <strong>{displayNumber(totals.qty)}</strong>
            </span>
            <span className="dr-stat">
              Boxes: <strong>{displayNumber(totals.boxes)}</strong>
            </span>
            <span className="dr-stat">
              Ltrs: <strong>{displayNumber(totals.ltrs)}</strong>
            </span>
            <span className="dr-stat">
              Sales: <strong>{displayNumber(totals.sales)}</strong>
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="dr-empty">Loading dashboard state-wise data...</div>
        ) : reportRows.length > 0 ? (
          <div className="dr-table-wrap">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Product Type</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Boxes</TableHead>
                  <TableHead>Ltrs</TableHead>
                  <TableHead>Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row, index) => (
                  <TableRow key={`${row.state}-${row.itemKey}`}>
                    <TableCell className="dr-muted">
                      {(currentPage - 1) * itemsPerPage + index + 1}
                    </TableCell>
                    <TableCell className="dr-bold">{row.state}</TableCell>
                    <TableCell>{row.product}</TableCell>
                    <TableCell>{row.productType}</TableCell>
                    <TableCell className="text-center">{displayNumber(row.qty)}</TableCell>
                    <TableCell className="text-center">
                      {displayNumber(row.boxes)}
                    </TableCell>
                    <TableCell className="text-center">{displayNumber(row.ltrs)}</TableCell>
                    <TableCell className="text-center">
                      {displayNumber(row.sales)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="dr-empty">No dashboard state-wise data found</div>
        )}

        {reportRows.length > itemsPerPage && (
          <Pagination page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        )}
      </div>
    </div>
  );
}
