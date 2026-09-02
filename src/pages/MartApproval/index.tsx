import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiEye,
  HiPencilSquare,
  HiCheckCircle,
  HiXCircle,
  HiArrowDownTray,
  HiArrowPath,
} from "react-icons/hi2";
import {
  ordersService,
  getOrderItemTotalLtrs,
  type MartOrderSummary,
  type Order,
  type OrderItem,
  type SalesOrderSapStatus,
} from "../../services/ordersService";
import { startExcelExport, exportDateStamp } from "../../utils/excelExport";

/** Stable empties, so the render does not see a new identity every pass. */
const NO_MART_ORDERS: MartOrderSummary[] = [];
const NO_SAP_STATUSES: Record<string, SalesOrderSapStatus> = {};
import ItemSection from "../../components/order-items/ItemSection";
import PartyHeader from "../../components/order-items/PartyHeader";
import "../../styles/Auditor_Order.css";
import "../../styles/MartApproval/MartApproval.css";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { messageFrom } from "@/lib/apiError";

/**
 * Mart Approval — the "Pending Orders" queue for the mart_approval role.
 *
 * Row actions: See (full order detail page, reusing the billing detail view),
 * Edit (opens the full Add Sales form), Approve (confirmation popup), Reject
 * (reason required) and Download (Excel). Edit / Approve / Reject only apply
 * while the order is still pending.
 */
type TabKey = "pending" | "approved" | "rejected";
const TABS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

type ActionTarget = { id: number; order_number: string };

function fmtDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function MartApproval() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>("pending");
  const queryClient = useQueryClient();
  /*
   * The list and the SAP statuses stay in ONE queryFn on purpose: the statuses
   * are looked up FROM the list's ids, and the old code force-cleared them to
   * {} on every non-Approved tab so a stale map could never paint "Created in
   * SAP" onto a Pending row. Two queries would reintroduce exactly that gap.
   */
  const {
    data: listData,
    isPending: loading,
    error: loadError,
  } = useQuery({
    queryKey: ["orders", "mart", tab],
    queryFn: async () => {
      const data = await ordersService.getMartOrders(tab);
      const list = Array.isArray(data) ? data : [];
      // Only the Approved tab can hold orders whose SAP push failed.
      if (tab === "approved" && list.length) {
        try {
          return { list, statuses: await ordersService.getSalesOrderSapStatus(list.map((o) => o.id)) };
        } catch {
          return { list, statuses: {} as Record<string, SalesOrderSapStatus> };
        }
      }
      return { list, statuses: {} as Record<string, SalesOrderSapStatus> };
    },
  });
  const orders = listData?.list ?? NO_MART_ORDERS;
  const error = loadError ? messageFrom(loadError, "Failed to load orders. Please try again.") : "";
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Detail view (See): the full order + its items, plus whether it's pending.
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailPending, setDetailPending] = useState(false);

  // Approve / reject targets (work from both the list and the detail view).
  const [approveTarget, setApproveTarget] = useState<ActionTarget | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ActionTarget | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Latest SAP push result per order (only fetched for the Approved tab, where a
  // failed SAP push leaves the order "Mart Approved" instead of "Completed").
  /* Server-derived, but ALSO patched by a failed resend below, so it is state
     seeded from the query rather than the query data itself. */
  const [resendStatuses, setResendStatuses] = useState<Record<string, SalesOrderSapStatus> | null>(
    null,
  );
  const sapStatuses = resendStatuses ?? listData?.statuses ?? NO_SAP_STATUSES;
  const [resendingId, setResendingId] = useState<number | null>(null);

  const sapFor = (orderId: number) => sapStatuses[String(orderId)] ?? null;
  const isSapFailed = (orderId: number) => sapFor(orderId)?.status === "FAILED";
  const isCompletedStatus = (statusDisplay?: string) =>
    String(statusDisplay || "")
      .toLowerCase()
      .includes("complete");
  // In the Approved tab an order that reached 'Completed' pushed to SAP
  // successfully — it stays visible but only gets a View action.
  const isApprovedSuccess = (o: { status_display?: string }) =>
    tab === "approved" && isCompletedStatus(o.status_display);

  /** Re-read the current tab. Was `loadList(tab)`. */
  const loadList = async () => queryClient.invalidateQueries({ queryKey: ["orders", "mart"] });

  const onResend = async (target: ActionTarget) => {
    setResendingId(target.id);
    setMsg(null);
    try {
      const res = await ordersService.resendMartOrderToSap(target.id);
      setMsg({
        kind: "ok",
        text: res?.message || `Order ${target.order_number} sent to SAP.`,
      });
      setDetailOrder(null);
      await loadList();
    } catch (e) {
      const detail = messageFrom(e, "Failed to resend the order to SAP. Please try again.");
      setMsg({ kind: "err", text: detail });
      // Refresh SAP statuses so the (possibly new) error message shows.
      try {
        setResendStatuses(await ordersService.getSalesOrderSapStatus(orders.map((o) => o.id)));
      } catch {
        /* keep the previous statuses */
      }
    } finally {
      setResendingId(null);
    }
  };


  const isPendingTab = tab === "pending";

  // --- actions --------------------------------------------------------------
  const onSee = async (order: MartOrderSummary) => {
    setMsg(null);
    setBusy(true);
    try {
      const detail = await ordersService.getOrderDetails(order.id);
      setDetailOrder(detail);
      setDetailItems((detail.items as OrderItem[]) || []);
      setDetailPending(order.is_pending);
    } catch (e) {
      setMsg({
        kind: "err",
        text: messageFrom(e, "Failed to open the order."),
      });
    } finally {
      setBusy(false);
    }
  };

  const onEdit = (target: ActionTarget) => {
    navigate("/Add_Sales", {
      state: { editOrderId: target.id, mode: "edit", returnTo: "/Mart_Approval" },
    });
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setBusy(true);
    setMsg(null);
    try {
      await ordersService.approveMartOrder(approveTarget.id);
      setMsg({ kind: "ok", text: `Order ${approveTarget.order_number} approved.` });
      setApproveTarget(null);
      setDetailOrder(null);
      await loadList();
    } catch (e) {
      setMsg({
        kind: "err",
        text: messageFrom(e, "Failed to approve the order."),
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setMsg({ kind: "err", text: "A rejection reason is required." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await ordersService.rejectMartOrder(rejectTarget.id, rejectReason.trim());
      setMsg({ kind: "ok", text: `Order ${rejectTarget.order_number} rejected.` });
      setRejectTarget(null);
      setRejectReason("");
      setDetailOrder(null);
      await loadList();
    } catch (e) {
      setMsg({
        kind: "err",
        text: messageFrom(e, "Failed to reject the order."),
      });
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async (orderId: number, orderNumber: string) => {
    setMsg(null);
    try {
      const detail = await ordersService.getOrderDetails(orderId);
      const rows = ((detail.items as OrderItem[]) || []).map((it) => ({
        "Order Number": orderNumber,
        "Item Code": it.item_code,
        Product: it.item_name,
        Category: it.category,
        Qty: Number(it.qty),
        Pcs: Number(it.pcs),
        Boxes: Number(it.boxes),
        Ltrs: Number(it.ltrs),
        "Basic Price": Number(it.basic_price),
        "Tax %": Number(it.tax_rate),
        Amount: Number(it.total),
      }));
      startExcelExport(rows, {
        fileName: `MartOrder_${orderNumber}_${exportDateStamp()}`,
        sheetName: "Order",
      });
    } catch (e) {
      setMsg({
        kind: "err",
        text: messageFrom(e, "Failed to download the order."),
      });
    }
  };

  // Totals for the detail footer.
  const subtotal = detailItems.reduce((s, i) => s + Number(i.total || 0), 0);
  const taxTotal = detailItems.reduce(
    (s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0)) / 100,
    0,
  );
  const totalLtrs = detailItems.reduce((s, i) => s + getOrderItemTotalLtrs(i), 0);

  // ── Detail view (See) ──────────────────────────────────────────────────────
  if (detailOrder) {
    return (
      <div className="ao-detail mart-page">
        <div className="ao-d-nav">
          <button className="ao-d-back" onClick={() => setDetailOrder(null)}>
            ‹ Back to Orders
          </button>
          <div className="ao-d-actions">
            <button
              className="ao-d-export"
              onClick={() => onDownload(detailOrder.id, detailOrder.order_number)}
            >
              <HiArrowDownTray /> Export Excel
            </button>
            {/* SAP push failed → edit + retry from the detail view too. */}
            {isSapFailed(detailOrder.id) && (
              <>
                <button
                  className="ao-d-action-btn"
                  onClick={() =>
                    onEdit({ id: detailOrder.id, order_number: detailOrder.order_number })
                  }
                >
                  <HiPencilSquare /> Edit
                </button>
                <button
                  className="ao-d-action-btn ao-d-approve"
                  onClick={() =>
                    onResend({ id: detailOrder.id, order_number: detailOrder.order_number })
                  }
                  disabled={resendingId === detailOrder.id}
                >
                  <HiArrowPath /> {resendingId === detailOrder.id ? "Sending…" : "Resend to SAP"}
                </button>
              </>
            )}
            {detailPending && (
              <>
                <button
                  className="ao-d-action-btn"
                  onClick={() =>
                    onEdit({ id: detailOrder.id, order_number: detailOrder.order_number })
                  }
                >
                  <HiPencilSquare /> Edit
                </button>
                <button
                  className="ao-d-action-btn ao-d-approve"
                  onClick={() =>
                    setApproveTarget({
                      id: detailOrder.id,
                      order_number: detailOrder.order_number,
                    })
                  }
                >
                  <HiCheckCircle /> Approve
                </button>
                <button
                  className="ao-d-action-btn ao-d-reject"
                  onClick={() => {
                    setRejectReason("");
                    setRejectTarget({
                      id: detailOrder.id,
                      order_number: detailOrder.order_number,
                    });
                  }}
                >
                  <HiXCircle /> Reject
                </button>
              </>
            )}
          </div>
        </div>

        <PartyHeader order={detailOrder} />

        {String(detailOrder.status_display || "")
          .toLowerCase()
          .includes("reject") &&
          detailOrder.rejection_reason && (
            <div className="mart-notice-box">
              <strong className="mart-notice-label">Rejection reason:</strong>{" "}
              <span className="mart-notice-text">
                {detailOrder.rejection_reason}
              </span>
            </div>
          )}

        {isSapFailed(detailOrder.id) && (
          <div className="mart-notice-box">
            <strong className="mart-notice-label">SAP push failed.</strong>{" "}
            <span className="mart-notice-text">
              {sapFor(detailOrder.id)?.error_message || "SAP did not return an error message."}
            </span>
          </div>
        )}

        <div className="ao-d-items">
          <div className="ao-d-items-head">
            <span className="ao-d-items-title">Items</span>
            <span className="ao-d-items-count">{detailItems.length}</span>
          </div>
          <div className="ao-d-items-scroll">
            <ItemSection items={detailItems} />
          </div>
        </div>

        <div className="ao-d-bottombar">
          <div className="ao-d-summary">
            <div className="ao-d-sum-row">
              <span className="ao-d-sum-label">Total Ltrs</span>
              <span className="ao-d-sum-val">{totalLtrs.toFixed(2)}</span>
            </div>
            <div className="ao-d-sum-row">
              <span className="ao-d-sum-label">Subtotal</span>
              <span className="ao-d-sum-val">{subtotal.toFixed(2)}</span>
            </div>
            <div className="ao-d-sum-row">
              <span className="ao-d-sum-label">Tax</span>
              <span className="ao-d-sum-val">{taxTotal.toFixed(2)}</span>
            </div>
            <div className="ao-d-sum-row ao-d-sum-grand">
              <span className="ao-d-sum-label">Grand Total</span>
              <span className="ao-d-sum-val">{(subtotal + taxTotal).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {renderModals()}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  function renderModals() {
    return (
      <>
        <Dialog
          open={Boolean(approveTarget)}
          onOpenChange={(next) => {
            if (!next) (() => setApproveTarget(null))();
          }}
        >
          {approveTarget && (
            <DialogContent
              title="Approve order"
              variant="bare"
              size="auto"
              showClose={false}
              className="mart-modal mart-modal-sm"
            >
              <h3>Approve order {approveTarget.order_number}?</h3>
              <p className="mart-confirm-text">
                Please check all the details of the order carefully before approving. Once approved,
                the order will move ahead in the Mart flow.
              </p>
              <div className="mart-modal-actions">
                <button
                  className="mart-btn mart-cancel"
                  onClick={() => setApproveTarget(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="mart-btn mart-approve" onClick={confirmApprove} disabled={busy}>
                  {busy ? "Approving…" : "Yes, Approve"}
                </button>
              </div>
            </DialogContent>
          )}
        </Dialog>

        <Dialog
          open={Boolean(rejectTarget)}
          onOpenChange={(next) => {
            if (!next) (() => setRejectTarget(null))();
          }}
        >
          {rejectTarget && (
            <DialogContent
              title="Reject order"
              variant="bare"
              size="auto"
              showClose={false}
              className="mart-modal mart-modal-sm"
            >
              <h3>Reject order {rejectTarget.order_number}?</h3>
              <p className="mart-confirm-text">Please enter a reason for rejection.</p>
              <textarea
                className="mart-reason-input"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection…"
                rows={3}
              />
              <div className="mart-modal-actions">
                <button
                  className="mart-btn mart-cancel"
                  onClick={() => setRejectTarget(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="mart-btn mart-reject" onClick={confirmReject} disabled={busy}>
                  {busy ? "Rejecting…" : "Reject Order"}
                </button>
              </div>
            </DialogContent>
          )}
        </Dialog>
      </>
    );
  }

  return (
    <div className="mart-page">
      <div className="mart-header">
        <h2 className="mart-title">Pending Orders</h2>
        <p className="mart-subtitle">Review and action distributor (Mart) orders.</p>
      </div>

      <div className="mart-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`mart-tab ${t.key === tab ? "is-active" : ""}`}
            onClick={() => {
              setTab(t.key);
              // Was a bare `setDetailOrder(null)` sitting beside `loadList(tab)`
              // in a `[tab]` effect — setState derived from state, and the
              // existing disable there only covered exhaustive-deps.
              setDetailOrder(null);
              setResendStatuses(null);
            }}
          >
            {t.label}
          </button>
        ))}
        <span className="mart-total">Total: {orders.length}</span>
      </div>

      {error && <div className="mart-error">{error}</div>}
      {msg && <div className={msg.kind === "ok" ? "mart-success" : "mart-error"}>{msg.text}</div>}

      <div className="mart-list">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Card Name</TableHead>
              <TableHead className="mart-num">Items</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Delivery Date</TableHead>
              <TableHead className="mart-actions-col">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="mart-empty">
                  Loading…
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="mart-empty">
                  No {tab} orders.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="mart-cell-id">{o.order_number}</TableCell>
                  <TableCell>
                    {o.card_name}
                    {isSapFailed(o.id) && (
                      <span
                        title={sapFor(o.id)?.error_message || "SAP push failed"}
                        className="mart-sap-badge mart-sap-badge--failed"
                      >
                        SAP Failed
                      </span>
                    )}
                    {isApprovedSuccess(o) && (
                      <span
                        title={
                          sapFor(o.id)?.doc_num != null
                            ? `SAP Doc Num ${sapFor(o.id)?.doc_num}`
                            : "Created in SAP"
                        }
                        className="mart-sap-badge mart-sap-badge--success"
                      >
                        Created in SAP
                        {sapFor(o.id)?.doc_num != null ? ` #${sapFor(o.id)?.doc_num}` : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="mart-num">{o.items_count}</TableCell>
                  <TableCell>{fmtDateTime(o.created_at)}</TableCell>
                  <TableCell>{o.delivery_date || "—"}</TableCell>
                  <TableCell>
                    <div className="mart-row-actions">
                      <button
                        className="mart-icon-btn view"
                        title="See"
                        onClick={() => onSee(o)}
                        disabled={busy}
                      >
                        <HiEye size={18} />
                      </button>
                      {/* A successfully-approved (Completed in SAP) order only
                          gets a View action — no edit/resend/download. */}
                      {!isApprovedSuccess(o) && (
                        <>
                          {/* SAP push failed → let the approver edit and retry the push. */}
                          {isSapFailed(o.id) && (
                            <>
                              <button
                                className="mart-icon-btn edit"
                                title="Edit"
                                onClick={() => onEdit({ id: o.id, order_number: o.order_number })}
                              >
                                <HiPencilSquare size={18} />
                              </button>
                              <button
                                className="mart-row-btn mart-approve"
                                onClick={() => onResend({ id: o.id, order_number: o.order_number })}
                                disabled={resendingId === o.id}
                              >
                                <HiArrowPath size={16} />{" "}
                                {resendingId === o.id ? "Sending…" : "Resend to SAP"}
                              </button>
                            </>
                          )}
                          {isPendingTab && (
                            <>
                              <button
                                className="mart-icon-btn edit"
                                title="Edit"
                                onClick={() => onEdit({ id: o.id, order_number: o.order_number })}
                              >
                                <HiPencilSquare size={18} />
                              </button>
                              <button
                                className="mart-row-btn mart-approve"
                                onClick={() =>
                                  setApproveTarget({
                                    id: o.id,
                                    order_number: o.order_number,
                                  })
                                }
                              >
                                <HiCheckCircle size={16} /> Approve
                              </button>
                              <button
                                className="mart-row-btn mart-reject"
                                onClick={() => {
                                  setRejectReason("");
                                  setRejectTarget({
                                    id: o.id,
                                    order_number: o.order_number,
                                  });
                                }}
                              >
                                <HiXCircle size={16} /> Reject
                              </button>
                            </>
                          )}
                          <button
                            className="mart-icon-btn download"
                            title="Download"
                            onClick={() => onDownload(o.id, o.order_number)}
                          >
                            <HiArrowDownTray size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {renderModals()}
    </div>
  );
}

export default MartApproval;
