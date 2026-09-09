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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A LINE IS FREE, SAID ON THE LINE
 * ─────────────────────────────────────────────────────────────────────────
 * An auditor or rate approver deciding on an order met zero-priced lines with
 * no explanation on them: a combo's free half looked identical to a mispriced
 * line, and a scheme giveaway's only trace was a name buried in the Scheme
 * column. The badge says which it is, next to the item name, where the eye
 * already is.
 *
 * Three lines, not two. A combo pack that also earns a scheme giveaway is
 * THREE things an approver has to see, and the table only showed two:
 *
 *   1. the paid parent            — Combo badge, the price
 *   2. the combo's free half      — Combo badge, zero
 *   3. the scheme giveaway        — Scheme badge, zero
 *
 * The first two are real order lines: `_create_order_item` writes the free
 * half with `is_auto_free` set and `combo_source_code` pointing back at the
 * pack that earned it. BOTH ends of that pair are badged — the parent used to
 * carry nothing, so the pack and its free half looked unrelated.
 *
 * The third is NOT a line. The engine attaches `OrderItemScheme` rows to the
 * paid item, so it only ever appeared as a name in the Scheme column — and for
 * a v2 scheme not even that, because the row's `scheme` FK is null and the
 * name came back empty ("- Qty 80.00"). It is rendered here as its own row,
 * which is how the Add Sales wizard shows it at entry: the approver sees the
 * same three lines the salesperson did.
 *
 * Same colours as that wizard (green combo, blue scheme).
 *
 * ORDER: the real lines first, in the order the order carries them, so a
 * combo's two halves stay adjacent — then every giveaway, at the end. Schemes
 * used to render immediately under the line they hang off, which pushed the
 * combo's free half away from the pack that earned it and broke the pair up.
 *
 * ITEM CODE: a mapped combo shows the code SAP will actually receive
 * (`combo_parent_item_code`), not the combo wrapper's own. They differ, and
 * the approver was being shown the one that never leaves OMS. The combo's
 * identity is not lost — the item NAME still reads "A + B".
 */

type OrderItemsTableProps = {
  items: OrderItem[];
  /** Show the per-line variety badge. Off where a variety-cost row is shown. */
  variety?: boolean;
};

export function OrderItemsTable({ items, variety = true }: OrderItemsTableProps) {
  const { t } = useUILabels();

  /*
   * The item codes that EARNED a free half — i.e. the parents.
   *
   * Read off the children rather than stored on the parent, because
   * `combo_source_code` is the only link the order carries. A parent whose
   * child was deleted stops being badged, which is correct: there is no
   * combo left to explain.
   */
  /*
   * Every giveaway, paired with the line that earned it.
   *
   * Flattened up here so they can render AFTER all the real lines: a scheme
   * drawn immediately under its own line pushed a combo's free half away from
   * the pack it belongs to.
   */
  const giveaways = items.flatMap((line) =>
    getOrderItemSchemes(line).map((scheme) => ({ item: line, scheme })),
  );

  const comboParents = new Set(
    items
      .map((line) => (line.is_auto_free ? (line.combo_source_code || "").trim() : ""))
      .filter(Boolean),
  );

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
                    <span
                      className="whitespace-nowrap font-medium text-ink"
                      title={
                        item.combo_parent_item_code
                          ? `Ordered as combo ${item.item_code}; bills to SAP as ${item.combo_parent_item_code}`
                          : undefined
                      }
                    >
                      {item.combo_parent_item_code || item.item_code}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-[250px] font-medium text-ink">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {item.item_name}
                      {item.is_auto_free || comboParents.has(item.item_code) ? (
                        <Badge
                          tone="ok"
                          title={
                            item.is_auto_free
                              ? item.combo_source_code
                                ? `Free half of the combo pack ${item.combo_source_code}`
                                : "The free half of a combo pack"
                              : "A combo pack — its free half is listed below"
                          }
                        >
                          Combo
                        </Badge>
                      ) : null}

                    </span>
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
          {/*
            Each giveaway on its own row.

            A scheme is stored ON the paid line, not as one — so without
            this the approver saw a name in a column and had to work out
            that something ships free. It is listed the way the Add Sales
            wizard lists it at entry: indented, zero-priced, badged.
          */}
          {giveaways.map(({ item, scheme }, giveIndex) => (
            <TableRow key={`give-${giveIndex}`} className="bg-surface">
              <TableCell />
              <TableCell>
                <span className="whitespace-nowrap font-medium text-body">
                  {scheme.itemCode || "—"}
                </span>
              </TableCell>
              <TableCell className="min-w-[250px] pl-6 font-medium text-body">
                <span className="flex flex-wrap items-center gap-1.5">
                  {scheme.itemName || scheme.itemCode || scheme.name || "Scheme item"}
                  <Badge
                    tone="info"
                    title={
                      `Free with ${item.item_name}` +
                      (scheme.name ? ` · ${scheme.name}` : "") +
                      (scheme.scope ? ` · via ${scheme.scope}` : "")
                    }
                  >
                    Scheme
                  </Badge>
                </span>
              </TableCell>
              <TableCell>{item.category}</TableCell>
              {variety ? <TableCell /> : null}
              <TableCell colSpan={2}>
                <span className="text-[12px] text-subtle">
                  {scheme.name || "Scheme"}
                  {scheme.scope ? ` · via ${scheme.scope}` : ""}
                </span>
              </TableCell>
              <TableCell className="text-center">{scheme.qty || 0}</TableCell>
              <TableCell className="text-center">-</TableCell>
              <TableCell className="text-center">-</TableCell>
              <TableCell className="text-center">-</TableCell>
              <TableCell className="text-center">-</TableCell>
              <TableCell className="text-right">0.00</TableCell>
              <TableCell className="text-right">0.00</TableCell>
              <TableCell className="text-center">-</TableCell>
              <TableCell className="text-right font-semibold text-body">
                0.00
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
