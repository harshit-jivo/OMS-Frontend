import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ordersService } from "../services/ordersService";
import type { Order } from "../services/ordersService";
import { getCurrentUser } from "../services/authService";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import "../styles/Drafts.css";

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

/** Shared so the delete below can invalidate exactly what the list reads. */
const DRAFTS_KEY = ["orders", "drafts"] as const;

/** One identity for "no drafts", so the render does not see a new array each time. */
const EMPTY: Order[] = [];

const fetchDrafts = async () => {
  const user = await getCurrentUser();
  if (!user?.id) return [];
  const data = await ordersService.getDrafts(user.id);
  return Array.isArray(data) ? data : [];
};

export default function Drafts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  /*
   * `isError` is new. The old effect caught everything into
   * `console.log("Error fetching drafts:", error)` and then `setDrafts([])`,
   * so a 500 or an expired session rendered the reassuring "No saved drafts.
   * Use Save as Draft on the Add Sales page to create one." — telling someone
   * whose drafts had not loaded that they had never written any.
   */
  const { data, isPending: loading, isError } = useQuery({
    queryKey: DRAFTS_KEY,
    queryFn: fetchDrafts,
  });
  const drafts = data ?? EMPTY;

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
      // Was `setDrafts(prev => prev.filter(...))`. Filtering the local copy
      // left the cache holding the deleted draft, so anything else reading this
      // list — and Add_Sales, which navigates back here after saving — would
      // show it again.
      await queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    } catch (error) {
      console.log("Error deleting draft:", error);
      alert("Unable to delete this draft.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="drf-page">
      <div className="drf-head">
        <h4 className="drf-title">Saved Drafts</h4>
        <span className="drf-total">Total: {drafts.length}</span>
      </div>

      {loading ? (
        <p className="drf-loading">Loading drafts...</p>
      ) : isError ? (
        <div className="drf-state drf-state--error">
          Could not load your drafts. Refresh the page to try again.
        </div>
      ) : drafts.length === 0 ? (
        <div className="drf-state drf-state--empty">
          No saved drafts. Use "Save as Draft" on the Add Sales page to create one.
        </div>
      ) : (
        <div className="drf-scroll">
          <Table density="compact" className="drf-table">
            <TableHeader>
              <TableRow>
                <TableHead>Draft No.</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Last Saved</TableHead>
                <TableHead className="drf-actions-head">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drafts.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.order_number}</TableCell>
                  <TableCell>{order.card_name || order.card_code || "-"}</TableCell>
                  <TableCell>{Array.isArray(order.items) ? order.items.length : 0}</TableCell>
                  <TableCell>{Number(order.total_amount || 0).toFixed(2)}</TableCell>
                  <TableCell>{formatDateTime(order.created_at)}</TableCell>
                  <TableCell className="drf-actions">
                    <button
                      type="button"
                      onClick={() => handleContinue(order)}
                      className="drf-btn drf-btn--continue"
                    >
                      Continue
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(order)}
                      disabled={deletingId === order.id}
                      className="drf-btn drf-btn--delete"
                    >
                      {deletingId === order.id ? "Deleting..." : "Delete"}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
