/**
 * The order list every manager report shows: one row per order, with View and
 * Download at the end.
 *
 * Extracted because Daily, PersonWise and Sales Report had three copies of
 * the same ten columns, and the copies had already picked up differences that
 * were not decisions — one used `size={22}` icons, one had lost the FOC row
 * highlight.
 */
import { HiOutlineArrowDownTray, HiOutlineEye, HiOutlineInbox } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { toneForStatus } from "@/components/ui/statusTone";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatOrderCreatedAt, type Order } from "@/services/ordersService";

export function ReportOrdersTable({
  orders,
  loading,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onView,
  onDownload,
  viewingId,
  emptyHint,
}: {
  /** The page of orders to draw — already sliced. */
  orders: Order[];
  loading: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onView: (order: Order) => void;
  onDownload: (order: Order) => void;
  /** The order whose detail is being fetched, so its View button can say so. */
  viewingId?: number | null;
  emptyHint?: string;
}) {
  if (loading) return <TableSkeleton columns={9} label="Loading orders" />;

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={HiOutlineInbox}
        title="No orders found"
        hint={emptyHint ?? "Nothing matches these filters."}
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table density="compact">
          <TableHeader>
            <TableRow className="bg-surface hover:bg-surface">
              <TableHead className="w-10">#</TableHead>
              <TableHead>Order Number</TableHead>
              <TableHead>Card Code</TableHead>
              <TableHead>Card Name</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Delivery Date</TableHead>
              <TableHead>FOC</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-px whitespace-nowrap text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order, i) => (
              <TableRow key={order.id} className={order.is_foc ? "bg-note-soft/30" : undefined}>
                <TableCell className="text-subtle">{(page - 1) * pageSize + i + 1}</TableCell>
                <TableCell className="whitespace-nowrap font-semibold text-brand">
                  {order.order_number}
                </TableCell>
                <TableCell className="whitespace-nowrap">{order.card_code}</TableCell>
                <TableCell className="text-ink">{order.card_name}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatOrderCreatedAt(order.created_at)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{order.delivery_date}</TableCell>
                <TableCell>
                  {order.is_foc ? (
                    <Badge tone="note">FOC</Badge>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge tone={toneForStatus(order.status_display)}>{order.status_display}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-nowrap items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onView(order)}
                      disabled={viewingId === order.id}
                      title="View order"
                    >
                      <HiOutlineEye aria-hidden="true" />
                      {viewingId === order.id ? "Opening…" : "View"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDownload(order)}
                      title="Download this order as Excel"
                      aria-label={`Download order ${order.order_number}`}
                    >
                      <HiOutlineArrowDownTray aria-hidden="true" /> Excel
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 ? (
        <div className="border-t border-line px-3 py-2.5">
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      ) : null}
    </>
  );
}
