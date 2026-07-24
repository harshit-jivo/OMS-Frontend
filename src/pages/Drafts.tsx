import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ordersService } from "../services/ordersService";
import type { Order } from "../services/ordersService";
import { getCurrentUser } from "../services/authService";

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

export default function Drafts() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    void fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    try {
      setLoading(true);
      const user = await getCurrentUser();
      if (!user?.id) {
        setDrafts([]);
        return;
      }
      const data = await ordersService.getDrafts(user.id);
      setDrafts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error fetching drafts:", error);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = (order: Order) => {
    navigate("/Add_Sales", {
      state: { editOrderId: order.id, mode: "edit", returnTo: "/Drafts" },
    });
  };

  const handleDelete = async (order: Order) => {
    if (!window.confirm(`Delete draft ${order.order_number}? This cannot be undone.`)) {
      return;
    }
    try {
      setDeletingId(order.id);
      await ordersService.deleteDraft(order.id);
      setDrafts((prev) => prev.filter((d) => d.id !== order.id));
    } catch (error) {
      console.log("Error deleting draft:", error);
      alert("Unable to delete this draft.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <h4 style={{ margin: 0, color: "#0f172a" }}>Saved Drafts</h4>
        <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Total: {drafts.length}</span>
      </div>

      {loading ? (
        <p style={{ color: "#64748b" }}>Loading drafts...</p>
      ) : drafts.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: 8, border: "1px dashed #cbd5e1" }}>
          No saved drafts. Use "Save as Draft" on the Add Sales page to create one.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="vo-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Draft No.</th>
                <th>Party</th>
                <th>Items</th>
                <th>Total</th>
                <th>Last Saved</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((order) => (
                <tr key={order.id}>
                  <td>{order.order_number}</td>
                  <td>{order.card_name || order.card_code || "-"}</td>
                  <td>{Array.isArray(order.items) ? order.items.length : 0}</td>
                  <td>{Number(order.total_amount || 0).toFixed(2)}</td>
                  <td>{formatDateTime(order.created_at)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      onClick={() => handleContinue(order)}
                      style={{ height: 32, padding: "0 14px", marginRight: 8, borderRadius: 6, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer" }}
                    >
                      Continue
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(order)}
                      disabled={deletingId === order.id}
                      style={{ height: 32, padding: "0 14px", borderRadius: 6, border: "1px solid #ca1111", background: "#fff", color: "#ca1111", fontWeight: 600, cursor: deletingId === order.id ? "not-allowed" : "pointer" }}
                    >
                      {deletingId === order.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
