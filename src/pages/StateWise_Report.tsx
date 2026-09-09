/**
 * State Wise Report — the dashboard's state/item sales, as a filterable table.
 *
 * Reads the same `dashboardW/charts/` endpoint the Sales Dashboard does (hence
 * the `HasAnyKey` gate on that view), keyed on the DERIVED period rather than
 * the two dates — see the note on `period` below.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HiOutlineArchiveBox,
  HiOutlineBeaker,
  HiOutlineCube,
  HiOutlineCurrencyRupee,
  HiOutlineInbox,
  HiOutlineMap,
  HiOutlineTag,
} from "react-icons/hi2";

import api from "../services/api";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { FilterBar, FilterDate, FilterSelect } from "@/components/ui/filter-bar";
import { Card, EmptyState, Page, PageHeader, Stat, StatRow } from "@/components/ui/page";
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
   * The page number, stamped with the filters it was chosen under, so the
   * right page can be DERIVED during render instead of kept in step by two
   * effects. If the filters have moved on since the user picked page 4, page
   * 4 is simply not what this signature asks for.
   */
  const [pageRequest, setPageRequest] = useState({ signature: "", page: 1 });

  /*
   * The key is the DERIVED period, not the two dates. `getDashboardPeriod`
   * collapses a range to a year and a month (0 when the range spans months),
   * and that pair is all the request carries — so nudging a day inside the
   * same month is a cache hit, not a refetch.
   */
  const period = getDashboardPeriod(fromDate, toDate);

  const { data: stateItemSales = EMPTY_SALES, isPending: isLoading } = useQuery({
    queryKey: ["dashboard-charts", period.year, period.month, orderStatus],
    queryFn: async () => {
      const response = await api.get(
        `/orders/dashboardW/charts/?line_year=${period.year}&year=${period.year}&month=${period.month}&status=${orderStatus}`,
      );
      // This endpoint has been seen to answer with an object when it has
      // nothing to report.
      return Array.isArray(response.data?.state_item_sales)
        ? (response.data.state_item_sales as DashboardStateItemSale[])
        : [];
    },
  });

  const allRows = useMemo(
    () =>
      stateItemSales.flatMap((stateItem) =>
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
      ),
    [stateItemSales],
  );

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
      new Map(rows.map((row) => [row.itemKey, { itemKey: row.itemKey, product: row.product }])).values(),
    ).sort((a, b) => a.product.localeCompare(b.product));
  }, [allRows, selectedProductType]);

  const stateOptions = useMemo(
    () =>
      Array.from(new Set(stateItemSales.map((item) => item.state))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [stateItemSales],
  );

  // Choosing a product type can strip out the item already chosen; derived
  // rather than corrected by an effect, and the original choice survives the
  // type filter being cleared again.
  const activeItemKey = itemOptions.some((item) => item.itemKey === selectedItemKey)
    ? selectedItemKey
    : "";

  const reportRows = useMemo(
    () =>
      allRows
        .filter((row) => !selectedProductType || row.productType === selectedProductType)
        .filter((row) => !activeItemKey || row.itemKey === activeItemKey)
        .filter((row) => !selectedState || row.state === selectedState)
        .sort((a, b) => {
          const stateSort = a.state.localeCompare(b.state);
          return stateSort || b.sales - a.sales || a.product.localeCompare(b.product);
        }),
    [allRows, activeItemKey, selectedProductType, selectedState],
  );

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

  const filterSignature = [
    fromDate,
    toDate,
    orderStatus,
    selectedProductType,
    activeItemKey,
    selectedState,
  ].join("|");
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
    <Page>
      <Breadcrumbs items={[{ label: "Reports" }, { label: "State Wise Report" }]} />

      <PageHeader
        title="State Wise Report"
        description={
          selectedItemName || selectedProductType
            ? `${selectedItemName || selectedProductType} — sales by state for the period.`
            : "Item sales by state, from the same figures the Sales Dashboard draws."
        }
      />

      <FilterBar>
        <FilterSelect
          label="Product Type"
          value={selectedProductType}
          onChange={(event) => setSelectedProductType(event.target.value)}
        >
          <option value="">All Product Types</option>
          {productTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Item"
          value={activeItemKey}
          onChange={(event) => setSelectedItemKey(event.target.value)}
          fieldClassName="min-w-[200px]"
        >
          <option value="">All Items</option>
          {itemOptions.map((item) => (
            <option key={item.itemKey} value={item.itemKey}>
              {item.product}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="State"
          value={selectedState}
          onChange={(event) => setSelectedState(event.target.value)}
        >
          <option value="">All States</option>
          {stateOptions.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Status"
          value={orderStatus}
          onChange={(event) => setOrderStatus(event.target.value)}
          fieldClassName="max-w-[180px] flex-none"
        >
          <option value="completed">Completed Orders</option>
          <option value="pending">Pending Orders</option>
          <option value="rejected">Rejected Orders</option>
          <option value="all">All Orders</option>
        </FilterSelect>
        <FilterDate label="From" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <FilterDate label="To" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </FilterBar>

      <StatRow>
        <Stat icon={HiOutlineMap} tone="brand" label="States" value={stateCount} loading={isLoading} />
        <Stat icon={HiOutlineTag} tone="neutral" label="Products" value={productCount} loading={isLoading} />
        <Stat icon={HiOutlineCube} tone="neutral" label="Qty" value={displayNumber(totals.qty)} loading={isLoading} />
        <Stat icon={HiOutlineArchiveBox} tone="neutral" label="Boxes" value={displayNumber(totals.boxes)} loading={isLoading} />
        <Stat icon={HiOutlineBeaker} tone="neutral" label="Ltrs" value={displayNumber(totals.ltrs)} loading={isLoading} />
        <Stat icon={HiOutlineCurrencyRupee} tone="brand" label="Sales" value={displayNumber(totals.sales)} loading={isLoading} />
      </StatRow>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton columns={8} label="Loading state-wise sales" />
          </div>
        ) : reportRows.length === 0 ? (
          <EmptyState
            icon={HiOutlineInbox}
            title="No state-wise sales for this period"
            hint="Try a different status or date range."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table density="compact">
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Product Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Boxes</TableHead>
                    <TableHead className="text-right">Ltrs</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.map((row, index) => (
                    <TableRow key={`${row.state}-${row.itemKey}`}>
                      <TableCell className="text-subtle">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold text-ink">
                        {row.state}
                      </TableCell>
                      <TableCell className="text-ink">{row.product}</TableCell>
                      <TableCell>{row.productType}</TableCell>
                      <TableCell className="text-right tabular-nums">{displayNumber(row.qty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{displayNumber(row.boxes)}</TableCell>
                      <TableCell className="text-right tabular-nums">{displayNumber(row.ltrs)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-ink">
                        {displayNumber(row.sales)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {reportRows.length > itemsPerPage ? (
              <div className="border-t border-line px-3 py-2.5">
                <Pagination page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
              </div>
            ) : null}
          </>
        )}
      </Card>
    </Page>
  );
}
