import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import "../styles/Report.css";

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
  String(value || "").trim().toLowerCase();

const displayNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

const getItemKey = (item: Pick<DashboardStateItemProduct, "item_code" | "item_name">) =>
  `${normalize(item.item_code)}__${normalize(item.item_name)}`;

const getDashboardPeriod = (fromDate: string, toDate: string) => {
  const from = fromDate ? new Date(`${fromDate}T00:00:00`) : now;
  const to = toDate ? new Date(`${toDate}T00:00:00`) : from;
  const sameMonth =
    from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();

  return {
    year: from.getFullYear(),
    month: sameMonth ? from.getMonth() + 1 : 0,
  };
};

export default function StateWise_Report() {
  const [stateItemSales, setStateItemSales] = useState<DashboardStateItemSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProductType, setSelectedProductType] = useState("");
  const [selectedItemKey, setSelectedItemKey] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchDashboardStateData = async () => {
      const period = getDashboardPeriod(fromDate, toDate);
      setIsLoading(true);

      try {
        const response = await api.get(
          `/orders/dashboardW/charts/?line_year=${period.year}&year=${period.year}&month=${period.month}`,
        );
        setStateItemSales(Array.isArray(response.data?.state_item_sales) ? response.data.state_item_sales : []);
      } catch (error) {
        console.error("Failed to fetch dashboard state-wise data:", error);
        setStateItemSales([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardStateData();
  }, [fromDate, toDate]);

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
      Array.from(new Set(allRows.map((row) => row.productType).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
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

  useEffect(() => {
    if (selectedItemKey && !itemOptions.some((item) => item.itemKey === selectedItemKey)) {
      setSelectedItemKey("");
    }
  }, [itemOptions, selectedItemKey]);

  const reportRows = useMemo(() => {
    return allRows
      .filter((row) => !selectedProductType || row.productType === selectedProductType)
      .filter((row) => !selectedItemKey || row.itemKey === selectedItemKey)
      .filter((row) => !selectedState || row.state === selectedState)
      .sort((a, b) => {
        const stateSort = a.state.localeCompare(b.state);
        return stateSort || b.sales - a.sales || a.product.localeCompare(b.product);
      });
  }, [allRows, selectedItemKey, selectedProductType, selectedState]);

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
  const paginatedRows = reportRows.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );
  const selectedItemName =
    itemOptions.find((item) => item.itemKey === selectedItemKey)?.product || "";

  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, selectedItemKey, selectedProductType, selectedState, toDate]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="dr-page">
      <div className="dr-header">
        <h1
          className="dr-title"
          style={{
            margin: "0 0 4px",
            fontSize: "24px",
            fontWeight: 800,
            color: "#0f172a",
            letterSpacing: "-0.02em",
          }}
        >
          State Wise Report
        </h1>
      </div>

      <div className="dr-filter-card">
        <div className="dr-filter-row">
          <div className="dr-field">
            <label className="dr-label">Product Type</label>
            <select
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
            <select
              className="dr-date-input"
              value={selectedItemKey}
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
            <select
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
            <label className="dr-label">From</label>
            <input
              type="date"
              className="dr-date-input"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>

          <div className="dr-field">
            <label className="dr-label">To</label>
            <input
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
            <table className="dr-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>State</th>
                  <th>Product</th>
                  <th>Product Type</th>
                  <th>Qty</th>
                  <th>Boxes</th>
                  <th>Ltrs</th>
                  <th>Sales</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, index) => (
                  <tr key={`${row.state}-${row.itemKey}`}>
                    <td className="dr-muted">
                      {(currentPage - 1) * itemsPerPage + index + 1}
                    </td>
                    <td className="dr-bold">{row.state}</td>
                    <td>{row.product}</td>
                    <td>{row.productType}</td>
                    <td style={{ textAlign: "center" }}>{displayNumber(row.qty)}</td>
                    <td style={{ textAlign: "center" }}>
                      {displayNumber(row.boxes)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {displayNumber(row.ltrs)}
                    </td>
                    <td style={{ textAlign: "center" }}>{displayNumber(row.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dr-empty">No dashboard state-wise data found</div>
        )}

        {reportRows.length > itemsPerPage && (
          <div className="dr-pagination">
            <button
              className="dr-pg-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => page - 1)}
            >
              Prev
            </button>
            <span className="dr-pg-info">
              {currentPage} / {totalPages}
            </span>
            <button
              className="dr-pg-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((page) => page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
