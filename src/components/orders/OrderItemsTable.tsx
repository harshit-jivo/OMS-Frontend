import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import {
  getOrderItemSchemes,
  getOrderItemTotalLtrs,
} from "@/services/ordersService";
import type { OrderItem } from "@/services/ordersService";
import { useUILabels } from "@/services/uiConfig";
import { cn } from "@/lib/utils";
import { titleCaseVariety, varietyBadgeTone } from "./orderDetail";

/**
 * An order's line items — one card per line, figures aligned across cards.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY CARDS, AND WHY THEY STILL LINE UP
 * ─────────────────────────────────────────────────────────────────────────
 * This was a sixteen-column table — code, name, category, variety, scheme,
 * scheme qty and nine figures — and scrolled sideways on every screen it sat
 * on. What an approver reads on a line is two kinds of thing: WHAT it is,
 * which is prose and badges and wants room to wrap, and HOW MUCH, which is
 * numbers and wants to line up so a column can be run down with a finger.
 *
 * So each line is a card, and every card has the same shape:
 *
 *   1  Jivo Canola Oil 1 Ltr  [Combo]                          Amount
 *      JV-CAN-1L · Edible Oil · [Commodity]                   6420.00
 *      BUY 1 GET 1 FREE · Qty 80
 *      QTY   PCS   BOXES   LTRS   TOTAL LTRS   PRICE LIST   BASIC   TAX %
 *      60    12    5.00    60     60.00        107.00       107.00  5.00
 *
 * The figures sit in a fixed eight-column grid at the foot of every card, so
 * Qty is under Qty on the next card down: the tabular half survives without
 * the table. The amount is pulled out to the top right because it is the one
 * figure every reader wants first.
 *
 * Cards are separated by a hairline, not boxed. They already sit inside a
 * Card on every screen, and a bordered card inside a bordered card is the
 * boxy nesting the UI kit is trying to move away from.
 *
 * The component keeps its old name — eight screens import it — even though
 * it no longer renders a table.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY `variety` IS A PROP AND NOT ALWAYS ON
 * ─────────────────────────────────────────────────────────────────────────
 * The approval screens show the variety COST as its own row of cards, so the
 * per-line variety would be a third statement of the same split. Opt-in.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A LINE IS FREE, SAID ON THE LINE
 * ─────────────────────────────────────────────────────────────────────────
 * An auditor or rate approver deciding on an order met zero-priced lines with
 * no explanation: a combo's free half looked identical to a mispriced line,
 * and a scheme giveaway's only trace was a name in a column. The badge says
 * which it is, next to the item name, where the eye already is.
 *
 * Three lines, not two. A combo pack that also earns a scheme giveaway is
 * THREE things an approver has to see:
 *
 *   1. the paid parent            — Combo badge, the price
 *   2. the combo's free half      — Combo badge, zero
 *   3. the scheme giveaway        — Scheme badge, zero
 *
 * The first two are real order lines: `_create_order_item` writes the free
 * half with `is_auto_free` set and `combo_source_code` pointing back at the
 * pack that earned it. BOTH ends of that pair are badged.
 *
 * The third is NOT a line. The engine attaches `OrderItemScheme` rows to the
 * paid item, so it is rendered here as its own card, the way the Add Sales
 * wizard shows it at entry. Same colours as that wizard (green combo, blue
 * scheme).
 *
 * ORDER: the real lines first, in the order the order carries them, so a
 * combo's two halves stay adjacent — then every giveaway, at the end.
 *
 * ITEM CODE: a mapped combo shows the code SAP will actually receive
 * (`combo_parent_item_code`), not the combo wrapper's own. The combo's
 * identity is not lost — the item NAME still reads "A + B".
 */

type OrderItemsTableProps = {
  items: OrderItem[];
  /** Show the per-line variety chip. Off where a variety-cost row is shown. */
  variety?: boolean;
};

const fixed = (value: unknown) => Number(value).toFixed(2);

/** A label over a figure. `-` for a figure a giveaway does not have. */
function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-medium uppercase tracking-wide text-subtle">{label}</dt>
      <dd className={cn("m-0 tabular-nums", value === "-" ? "text-subtle" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}

function ItemCard({
  index,
  name,
  code,
  codeTitle,
  category,
  variety,
  badge,
  note,
  amount,
  figures,
  muted = false,
}: {
  index?: number;
  name: string;
  code: string;
  codeTitle?: string;
  category?: string;
  variety?: string | null;
  badge?: React.ReactNode;
  /** A third line — the scheme a line carries, or what a giveaway is free with. */
  note?: React.ReactNode;
  amount: string;
  figures: [label: string, value: React.ReactNode][];
  /** Giveaway cards: the same shape, indented and one tone quieter. */
  muted?: boolean;
}) {
  return (
    <li
      data-slot="order-item"
      className={cn("px-4 py-3", muted && "bg-surface/60 pl-10")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div
            className={cn(
              "flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium",
              muted ? "text-body" : "text-ink",
            )}
          >
            {index !== undefined ? (
              <span className="w-5 shrink-0 text-[11px] font-normal tabular-nums text-subtle">
                {index}
              </span>
            ) : null}
            <span>{name}</span>
            {badge}
          </div>
          <div
            className={cn(
              "mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-subtle",
              index !== undefined && "pl-[26px]",
            )}
          >
            <span className="font-mono text-[11px] text-body" title={codeTitle}>
              {code}
            </span>
            {category ? <span>{category}</span> : null}
            {variety ? (
              <Badge tone={varietyBadgeTone(variety)}>{titleCaseVariety(variety)}</Badge>
            ) : null}
          </div>
          {note ? (
            <div
              className={cn("mt-0.5 text-[11.5px]", index !== undefined && "pl-[26px]")}
              aria-label="Applied schemes"
            >
              {note}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10.5px] font-medium uppercase tracking-wide text-subtle">Amount</div>
          <div
            className={cn(
              "text-[15px] font-semibold tabular-nums",
              muted ? "text-body" : "text-ink",
            )}
          >
            {amount}
          </div>
        </div>
      </div>
      <dl
        className={cn(
          "mt-2.5 grid grid-cols-4 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-8",
          index !== undefined && "pl-[26px]",
        )}
      >
        {figures.map(([label, value]) => (
          <Figure key={label} label={label} value={value} />
        ))}
      </dl>
    </li>
  );
}

export function OrderItemsTable({ items, variety = true }: OrderItemsTableProps) {
  const { t } = useUILabels();
  const priceList = t("price_list", "Price List (Basic)");

  /*
   * Every giveaway, paired with the line that earned it. Flattened up here so
   * they render AFTER all the real lines: a scheme drawn immediately under its
   * own line pushed a combo's free half away from the pack it belongs to.
   */
  const giveaways = items.flatMap((line) =>
    getOrderItemSchemes(line).map((scheme) => ({ item: line, scheme })),
  );

  /*
   * The item codes that EARNED a free half — i.e. the parents. Read off the
   * children rather than stored on the parent, because `combo_source_code` is
   * the only link the order carries.
   */
  const comboParents = new Set(
    items
      .map((line) => (line.is_auto_free ? (line.combo_source_code || "").trim() : ""))
      .filter(Boolean),
  );

  if (items.length === 0) {
    return <p className="m-0 py-8 text-center text-[13px] text-subtle">No items found</p>;
  }

  return (
    <ul aria-label="Order items" className="m-0 list-none divide-y divide-line/60 p-0">
      {items.map((item, index) => {
        const schemes = getOrderItemSchemes(item);
        const isCombo = item.is_auto_free || comboParents.has(item.item_code);
        return (
          <ItemCard
            key={index}
            index={index + 1}
            name={item.item_name}
            code={item.combo_parent_item_code || item.item_code}
            codeTitle={
              item.combo_parent_item_code
                ? `Ordered as combo ${item.item_code}; bills to SAP as ${item.combo_parent_item_code}`
                : undefined
            }
            category={item.category}
            variety={variety ? item.variety_type : null}
            badge={
              isCombo ? (
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
              ) : null
            }
            note={
              schemes.length > 0
                ? schemes.map((scheme, schemeIndex) => (
                    <span key={`${item.item_code}-scheme-${schemeIndex}`} className="block text-brand">
                      {scheme.name || "Scheme"}
                      <span className="text-subtle"> · Qty {scheme.qty || 0}</span>
                    </span>
                  ))
                : null
            }
            amount={fixed(item.total)}
            figures={[
              ["Qty", item.qty],
              ["Pcs", item.pcs],
              ["Boxes", fixed(item.boxes)],
              ["Ltrs", item.ltrs],
              ["Total Ltrs", getOrderItemTotalLtrs(item).toFixed(2)],
              [priceList, fixed(item.price_list_basic)],
              ["Basic Price", fixed(item.basic_price)],
              ["Tax %", fixed(item.tax_rate)],
            ]}
          />
        );
      })}
      {/*
        Each giveaway as its own card. A scheme is stored ON the paid line,
        not as one — so without this the approver saw a name and had to work
        out that something ships free. Listed the way the Add Sales wizard
        lists it at entry: indented, zero-priced, badged.
      */}
      {giveaways.map(({ item, scheme }, giveIndex) => (
        <ItemCard
          key={`give-${giveIndex}`}
          muted
          name={scheme.itemName || scheme.itemCode || scheme.name || "Scheme item"}
          code={scheme.itemCode || "—"}
          category={item.category}
          badge={
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
          }
          note={
            <span className="text-subtle">
              Free with {item.item_name}
              {scheme.name ? ` · ${scheme.name}` : ""}
              {scheme.scope ? ` · via ${scheme.scope}` : ""}
            </span>
          }
          amount="0.00"
          figures={[
            ["Qty", scheme.qty || 0],
            ["Pcs", "-"],
            ["Boxes", "-"],
            ["Ltrs", "-"],
            ["Total Ltrs", "-"],
            [priceList, "0.00"],
            ["Basic Price", "0.00"],
            ["Tax %", "-"],
          ]}
        />
      ))}
    </ul>
  );
}
