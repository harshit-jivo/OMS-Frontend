/**
 * Saved Drafts — the orders someone started and did not send.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE DELETE CONFIRMATION IS NOT `window.confirm` ANY MORE
 * ─────────────────────────────────────────────────────────────────────────
 * It was `window.confirm(...)` for the question and `alert(...)` for the
 * failure. Both are native modals: they block the whole tab, they cannot be
 * styled, they cannot say WHICH party the draft was for beyond what fits in
 * one line, and on failure the `alert` said "Unable to delete this draft."
 * without the reason the server gave.
 *
 * It is a real dialog and a toast now — the same pattern as every other
 * destructive action in the app, so a delete here behaves like a delete
 * anywhere else.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlineDocumentPlus, HiOutlineInbox, HiOutlineTrash } from "react-icons/hi2";

import { ordersService } from "../services/ordersService";
import type { Order } from "../services/ordersService";
import { getCurrentUser } from "../services/authService";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, EmptyState, Notice, Page, PageHeader } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  const [confirmDelete, setConfirmDelete] = useState<Order | null>(null);

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
    try {
      setDeletingId(order.id);
      await ordersService.deleteDraft(order.id);
      // Was `setDrafts(prev => prev.filter(...))`. Filtering the local copy
      // left the cache holding the deleted draft, so anything else reading this
      // list — and Add_Sales, which navigates back here after saving — would
      // show it again.
      await queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
      setConfirmDelete(null);
      showToast({
        title: "Draft deleted",
        message: `${order.order_number} is gone.`,
      });
    } catch (error) {
      // The server's own reason, not "Unable to delete this draft." — a draft
      // that will not delete is usually one that has already been submitted,
      // and that is worth being told.
      showToast({
        title: "Could not delete the draft",
        message: messageFrom(error, "The server refused the request."),
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Orders" }, { label: "Drafts" }]} />

      <PageHeader
        title="Saved Drafts"
        description="Orders you started and have not sent. Continuing one reopens it in Add Sales."
        badges={drafts.length ? <span className="text-[13px] text-subtle">Total: {drafts.length}</span> : null}
      />

      {isError ? (
        <Notice tone="bad" title="Could not load your drafts">
          Refresh the page to try again. This is a load failure, not an empty
          list — anything you saved is still there.
        </Notice>
      ) : null}

      {loading ? (
        <TableSkeleton columns={6} label="Loading drafts" />
      ) : !isError && drafts.length === 0 ? (
        <Card>
          <EmptyState
            icon={HiOutlineInbox}
            title="No saved drafts"
            hint='Use "Save as Draft" on the Add Sales page to keep an order you are not ready to send.'
            action={
              <Button variant="primary" onClick={() => navigate("/Add_Sales")}>
                <HiOutlineDocumentPlus aria-hidden="true" /> New sales order
              </Button>
            }
          />
        </Card>
      ) : !isError ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead>Draft No.</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Last Saved</TableHead>
                  <TableHead className="w-px whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="whitespace-nowrap font-semibold text-brand">
                      {order.order_number}
                    </TableCell>
                    <TableCell className="text-ink">
                      {order.card_name || order.card_code || "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Array.isArray(order.items) ? order.items.length : 0}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-ink">
                      {Number(order.total_amount || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(order.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-nowrap items-center justify-end gap-1">
                        {/* Continuing is what this page is FOR, so it is the
                            primary and delete is the quiet one beside it. */}
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleContinue(order)}
                        >
                          Continue
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-subtle hover:bg-danger-soft hover:text-danger"
                          onClick={() => setConfirmDelete(order)}
                          disabled={deletingId === order.id}
                          aria-label={`Delete draft ${order.order_number}`}
                        >
                          <HiOutlineTrash aria-hidden="true" />
                          {deletingId === order.id ? "Deleting…" : "Delete"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}

      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(next) => {
          if (!next && deletingId === null) setConfirmDelete(null);
        }}
      >
        {confirmDelete ? (
          <DialogContent title="Delete draft" size="sm">
            <DialogHeader>
              <DialogTitle>Delete {confirmDelete.order_number}?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="m-0 text-[13px] text-body">
                The draft for{" "}
                <strong className="font-semibold text-ink">
                  {confirmDelete.card_name || confirmDelete.card_code || "this party"}
                </strong>{" "}
                will be removed. This cannot be undone.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button
                onClick={() => setConfirmDelete(null)}
                disabled={deletingId !== null}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleDelete(confirmDelete)}
                disabled={deletingId !== null}
              >
                <HiOutlineTrash aria-hidden="true" />
                {deletingId !== null ? "Deleting…" : "Delete draft"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </Page>
  );
}
