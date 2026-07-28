import { useEffect, useMemo, useState } from "react";
import { startExcelExport, exportDateStamp } from "../utils/excelExport";
import { ordersService } from "../services/ordersService";
import type { QuotationOverviewItem, QuotationStatusLabel } from "../services/ordersService";

const STATUS_STYLES: Record<QuotationStatusLabel, { label: string; bg: string; color: string }> = {
  CANCELLED: { label: "Cancelled", bg: "#fee2e2", color: "#dc2626" },
  OPEN: { label: "Open", bg: "#dcfce7", color: "#16a34a" },
  CLOSED: { label: "Closed", bg: "#e2e8f0", color: "#475569" },
  UNKNOWN: { label: "Unknown", bg: "#fef3c7", color: "#d97706" },
};

const formatDateTime = (value?: string | null) => {
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

const STATUS_FILTERS: Array<QuotationStatusLabel | ""> = ["", "CANCELLED", "OPEN", "CLOSED", "UNKNOWN"];

export default function Sales_Quotation() {
  const [rows, setRows] = useState<QuotationOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuotationStatusLabel | "">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    void fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const data = await ordersService.getQuotationOverview();
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error fetching quotation overview:", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Distinct categories present across all orders (OIL / BEVERAGES / MART), used
  // to populate the category filter dropdown.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      const cats =
        row.categories && row.categories.length
          ? row.categories
          : String(row.category || "").split(",");
      cats.forEach((c) => {
        const value = String(c || "").trim().toUpperCase();
        if (value) set.add(value);
      });
    });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.quotation_status !== statusFilter) return false;
      if (categoryFilter) {
        const cats =
          row.categories && row.categories.length
            ? row.categories.map((c) => String(c).trim().toUpperCase())
            : String(row.category || "")
                .split(",")
                .map((c) => c.trim().toUpperCase())
                .filter(Boolean);
        if (!cats.includes(categoryFilter)) return false;
      }
      if (!term) return true;
      return (
        String(row.order_number || "").toLowerCase().includes(term) ||
        String(row.card_code || "").toLowerCase().includes(term) ||
        String(row.card_name || "").toLowerCase().includes(term) ||
        String(row.doc_num ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, statusFilter, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, categoryFilter]);

  const cancelledCount = useMemo(
    () => rows.filter((r) => r.quotation_status === "CANCELLED").length,
    [rows],
  );

  // Export the currently filtered rows (respecting search/status/category filters)
  // as an Excel file matching the columns shown in the table.
  const downloadExcel = () => {
    if (filtered.length === 0) return;
    const excelData = filtered.map((row) => ({
      "Order ID": row.order_number ?? "",
      "Card Code": row.card_code ?? "",
      "Card Name": row.card_name ?? "",
      "Category": row.category || "",
      "Created": row.created_at,
      "SAP Doc No.": row.doc_num ?? "",
      "Quotation Status": (STATUS_STYLES[row.quotation_status] || STATUS_STYLES.UNKNOWN).label,
      "Cancelled By": row.quotation_cancelled_by ?? "",
      "Cancelled At": row.quotation_cancelled ? row.quotation_cancelled_at : null,
    }));
    startExcelExport(excelData, {
      fileName: `Sales_Quotation_${exportDateStamp()}.xlsx`,
      sheetName: "Sales Quotations",
    });
  };

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <h4 style={{ margin: 0, color: "#0f172a" }}>Sales Quotation Status</h4>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Total: {filtered.length} &nbsp;|&nbsp; Cancelled: {cancelledCount}
          </span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", cursor: "pointer" }}
          >
            <option value="">All Categories</option>
            {categoryOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as QuotationStatusLabel | "")}
            style={{ height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", cursor: "pointer" }}
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value || "all"} value={value}>
                {value ? STATUS_STYLES[value].label : "All Statuses"}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search order / party / SAP no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #cbd5e1", minWidth: 240 }}
          />
          <button
            type="button"
            onClick={downloadExcel}
            disabled={filtered.length === 0}
            style={{
              height: 38,
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: filtered.length === 0 ? "#94a3b8" : "#16a34a",
              color: "#fff",
              fontWeight: 600,
              cursor: filtered.length === 0 ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ⬇ Download Excel
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "#64748b" }}>Loading sales quotations...</p>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: 8, border: "1px dashed #cbd5e1" }}>
          No completed orders found
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="vo-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Card Code</th>
                <th>Card Name</th>
                <th>Category</th>
                <th>Created</th>
                <th>SAP Doc No.</th>
                <th>Quotation Status</th>
                <th>Cancelled By</th>
                <th>Cancelled At</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((row) => {
                const style = STATUS_STYLES[row.quotation_status] || STATUS_STYLES.UNKNOWN;
                return (
                  <tr key={row.id}>
                    <td>{row.order_number}</td>
                    <td>{row.card_code}</td>
                    <td>{row.card_name}</td>
                    <td>{row.category || "-"}</td>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td>{row.doc_num ?? "-"}</td>
                    <td>
                      <span style={{ background: style.bg, color: style.color, fontWeight: 700, fontSize: "0.72rem", padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                        {style.label}
                      </span>
                    </td>
                    <td>{row.quotation_cancelled_by ?? "-"}</td>
                    <td>{row.quotation_cancelled ? formatDateTime(row.quotation_cancelled_at) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > itemsPerPage && (
        <div className="vo-pagination">
          <button className="vo-pg-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>← Prev</button>
          <span className="vo-pg-info">{currentPage} / {totalPages}</span>
          <button className="vo-pg-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>Next →</button>
        </div>
      )}
    </div>
  );
}
