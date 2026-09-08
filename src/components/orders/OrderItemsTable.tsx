import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getOrderItemSchemes,
  getOrderItemTotalLtrs,
} from "@/services/ordersService";
import type { OrderItem } from "@/services/ordersService";
import { useUILabels } from "@/services/uiConfig";
import { titleCaseVariety, varietyBadgeTone } from "./orderDetail";

/**
 * An order's line items.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SAME SIXTEEN COLUMNS, FOUR TIMES
 * ─────────────────────────────────────────────────────────────────────────
 * `View_Orders`, `Auditor_Order`, `Billing_Order` and `Rate_Approver_Order`
 * each hand-wrote this table: the same columns in the same order, the same
 * `.toFixed(2)` on the same six fields, the same scheme stack, the same
 * "No items found" row. Around 120 lines apiece, and they had already drifted
 * — the approver's copy was missing the Variety column, and two of the four
 * had the wrong `colSpan` on the empty row, so the placeholder sat under the
 * first fourteen columns of a fifteen-column table.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY `variety` IS A PROP AND NOT ALWAYS ON
 * ─────────────────────────────────────────────────────────────────────────
 * The approval screens show the variety COST as its own row of cards, so the
 * per-line variety is a third statement of the same split and the table is
 * already sixteen columns wide. The column is therefore opt-in — but the
 * `colSpan` on the empty row is derived from it rather than typed out, which
 * is the bug above made impossible rather than merely fixed.
 */

type OrderItemsTableProps = {
  items: OrderItem[];
  /** Show the per-line variety badge. Off where a variety-cost row is shown. */
  variety?: boolean;
};

export function OrderItemsTable({ items, variety = true }: OrderItemsTableProps) {
  const { t } = useUILabels();

  // Scheme and Scheme Qty are two headings over one merged cell (the body
  // renders `colSpan={2}`), so they count as two. Derived, not typed: an
  // empty-row `colSpan` that disagrees with the header is invisible until the
  // table is empty, which is exactly when someone is looking for an answer.
  const columnCount = 15 + (variety ? 1 : 0);

  return (
    <div className="overflow-x-auto">
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Item Code</TableHead>
            <TableHead className="min-w-[250px]">Item Name</TableHead>
            <TableHead>Category</TableHead>
            {variety ? <TableHead>Variety</TableHead> : null}
            <TableHead>Scheme</TableHead>
            <TableHead>Scheme Qty</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Pcs</TableHead>
            <TableHead>Boxes</TableHead>
            <TableHead>Ltrs</TableHead>
            <TableHead>Total Ltrs</TableHead>
            <TableHead>{t("price_list", "Price List (Basic)")}</TableHead>
            <TableHead>Basic Price</TableHead>
            <TableHead>Tax %</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length > 0 ? (
            items.map((item, index) => {
              const schemes = getOrderItemSchemes(item);

              return (
                <TableRow key={index}>
                  <TableCell className="text-center text-subtle">{index + 1}</TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap font-medium text-ink">
                      {item.item_code}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-[250px] font-medium text-ink">
                    {item.item_name}
                  </TableCell>
                  <TableCell>{item.category}</TableCell>
                  {variety ? (
                    <TableCell>
                      {item.variety_type ? (
                        <Badge tone={varietyBadgeTone(item.variety_type)}>
                          {titleCaseVariety(item.variety_type)}
                        </Badge>
                      ) : (
                        <span className="text-subtle">-</span>
                      )}
                    </TableCell>
                  ) : null}
                  {/* One cell under two headings: a scheme's name and its
                      quantity are one fact, and splitting them left the qty
                      column empty on every line without a scheme. */}
                  <TableCell colSpan={2}>
                    {schemes.length > 0 ? (
                      <div className="flex flex-col gap-1" aria-label="Applied schemes">
                        {schemes.map((scheme, schemeIndex) => (
                          <div
                            className="flex items-baseline gap-1.5 text-[12px]"
                            key={`${item.item_code}-scheme-${schemeIndex}`}
                          >
                            <span className="text-ink">{scheme.name || "-"}</span>
                            <span className="text-subtle">Qty {scheme.qty || 0}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-subtle">No scheme</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{item.qty}</TableCell>
                  <TableCell className="text-center">{item.pcs}</TableCell>
                  <TableCell className="text-center">
                    {Number(item.boxes).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">{item.ltrs}</TableCell>
                  <TableCell className="text-center">
                    {getOrderItemTotalLtrs(item).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(item.price_list_basic).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(item.basic_price).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    {Number(item.tax_rate).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-ink">
                    {Number(item.total).toFixed(2)}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-8 text-center text-subtle">
                No items found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
