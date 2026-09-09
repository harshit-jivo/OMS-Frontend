/**
 * One order in full, as a report page shows it: the facts, the lines, the
 * totals, and a way back.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES
 * ─────────────────────────────────────────────────────────────────────────
 * Daily, PersonWise and Sales Report each rendered this view inline — around
 * 280 lines apiece — and each rendered the LINES TWICE: once as a stack of
 * cards (`.order-detail-item-card`) and once as a table, one above the other,
 * both mounted, for the same items. PersonWise used `order-items/PartyHeader`
 * and `ItemSection` for its half (722 lines of their own, with two
 * stylesheets) while the other two hand-rolled the same thing.
 *
 * The lines are drawn once, by `OrderItemsTable` — the same table View Orders
 * and the approval queues use — and the totals by `OrderTotalsRow`, so an
 * order looks like an order wherever it is opened from.
 *
 * `variety` is on for Sales Report, whose table has always had the column,
 * and the variety COST cards render for any order the API priced that way —
 * they were PersonWise's alone before, which was an accident of who copied
 * from whom.
 */
import { HiOutlineArrowDownTray } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import { Card, CardHeader, CardTitle, PageHeader } from "@/components/ui/page";
import { toneForStatus } from "@/components/ui/statusTone";
import { OrderItemsTable } from "@/components/orders/OrderItemsTable";
import { OrderTotalsRow, VarietyCostCards } from "@/components/orders/OrderTotals";
import { orderTotals, varietyCosts } from "@/components/orders/orderDetail";
import { formatOrderCreatedAt, type Order } from "@/services/ordersService";

export function OrderReportDetail({
  order,
  reportLabel,
  onBack,
  onExport,
  variety = false,
}: {
  order: Order;
  /** The report's name, for the breadcrumb — "Daily Report". */
  reportLabel: string;
  onBack: () => void;
  onExport: (order: Order) => void;
  /** Show the per-line variety column. */
  variety?: boolean;
}) {
  const items = order.items ?? [];
  const totals = orderTotals(items);
  const costs = varietyCosts(order);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Reports" },
          { label: reportLabel, onClick: onBack },
          { label: order.order_number },
        ]}
      />

      <PageHeader
        title={order.order_number}
        description={order.card_name}
        badges={
          <>
            <Badge tone={toneForStatus(order.status_display)}>{order.status_display}</Badge>
            {order.is_foc ? <Badge tone="note">FOC</Badge> : null}
          </>
        }
        actions={
          <>
            <Button variant="ghost" onClick={onBack}>
              Back to report
            </Button>
            <Button variant="primary" onClick={() => onExport(order)}>
              <HiOutlineArrowDownTray aria-hidden="true" /> Export Excel
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Order</CardTitle>
        </CardHeader>
        <DetailGrid>
          <DetailField label="Created at" value={formatOrderCreatedAt(order.created_at)} />
          <DetailField label="Delivery date" value={order.delivery_date || "—"} />
          <DetailField label="PO number" value={order.po_number || "—"} />
          <DetailField label="Card code" value={order.card_code} />
          <DetailField label="Bill to" value={order.bill_to_address || "—"} span="full" />
          <DetailField label="Ship to" value={order.ship_to_address || "—"} span="full" />
          <DetailField
            label="Comment"
            value={order.remarks?.trim() ? order.remarks : ""}
            span="full"
            hideWhenEmpty
          />
        </DetailGrid>
      </Card>

      <OrderTotalsRow totals={totals} itemCount={items.length} />
      <VarietyCostCards costs={costs} />

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 border-b border-line px-4 py-3">
          <CardTitle>Items</CardTitle>
          <Badge tone="neutral">{items.length}</Badge>
        </CardHeader>
        {/* The variety cards, when present, already state the split; the
            per-line badge would be a third statement of it. */}
        <OrderItemsTable items={items} variety={variety && costs.length === 0} />
      </Card>
    </>
  );
}
