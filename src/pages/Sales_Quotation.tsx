import { useEffect, useMemo, useState } from "react";
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.quotation_status !== statusFilter) return false;
      if (!term) return true;
      return (
        String(row.order_number || "").toLowerCase().includes(term) ||
        String(row.card_code || "").toLowerCase().includes(term) ||
        String(row.card_name || "").toLowerCase().includes(term) ||
        String(row.doc_num ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const cancelledCount = useMemo(
    () => rows.filter((r) => r.quotation_status === "CANCELLED").length,
    [rows],
  );

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <h4 style={{ margin: 0, color: "#0f172a" }}>Sales Quotation Status</h4>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Total: {filtered.length} &nbsp;|&nbsp; Cancelled: {cancelledCount}
          </span>
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
