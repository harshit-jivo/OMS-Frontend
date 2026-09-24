import { Badge } from "@/components/ui/badge";
import {
  getOrderItemSchemes,
  getOrderItemTotalLtrs,
  type OrderItem,
} from "@/services/ordersService";

/**
 * Order line items rendered as CARDS (one card per line) instead of a wide
 * table — every figure stays readable without a horizontal scroll.
 *
 * This is the single source for the distributor / Mart card layout: the
 * distributor's View Orders detail and the Mart Approval detail both render it,
 * so "the same order looks the same wherever it is opened" is guaranteed by
 * construction rather than by keeping two copies in step.
 */

const VARIETY_TONE: Record<string, "info" | "note" | "neutral"> = {
  Commodity: "info",
  Premium: "note",
  Other: "neutral",
};

/** `item.variety_type` arrives as SAP's uppercase key (PREMIUM / COMMODITY). */
const titleCaseVariety = (value: string): string => {
  const text = String(value).trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

const varietyBadgeTone = (value: string): "info" | "note" | "neutral" =>
  VARIETY_TONE[titleCaseVariety(value)] ?? "neutral";

export function OrderItemCards({
  items,
  showSchemes = false,
}: {
  items: OrderItem[];
  /** Show the applied schemes on each card (staff / approval views). Off by
   *  default so the distributor and Mart card layouts stay unchanged. */
  showSchemes?: boolean;
}) {
  if (!items.length) {
    return <p className="py-8 text-center text-subtle">No items found</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((item, i) => (
        <div
          key={item.id ?? `${item.item_code}-${i}`}
          className="rounded-xl border border-brand/20 bg-gradient-to-br from-brand/[0.10] to-brand/[0.03] p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-subtle">#{i + 1}</span>
                {item.variety_type ? (
                  <Badge tone={varietyBadgeTone(item.variety_type)}>
                    {titleCaseVariety(item.variety_type)}
                  </Badge>
                ) : null}
                {item.category ? <Badge tone="note">{item.category}</Badge> : null}
              </div>
              <p className="m-0 mt-1.5 text-[13.5px] font-bold text-ink">{item.item_name}</p>
              <p className="m-0 mt-0.5 text-[11.5px] text-subtle">{item.item_code}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="m-0 text-[10.5px] font-semibold uppercase tracking-wide text-subtle">
                Amount
              </p>
              <p className="m-0 mt-0.5 text-[16px] font-bold tabular-nums text-brand">
                ₹{Number(item.total).toFixed(2)}
              </p>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4">
            {[
              { label: "Qty", value: String(item.qty) },
              { label: "Pcs", value: String(item.pcs) },
              { label: "Boxes", value: Number(item.boxes).toFixed(2) },
              { label: "Ltrs", value: String(item.ltrs) },
              { label: "Total Ltrs", value: getOrderItemTotalLtrs(item).toFixed(2) },
              { label: "Price List (Basic)", value: Number(item.price_list_basic).toFixed(2) },
              { label: "Basic Price", value: Number(item.basic_price).toFixed(2) },
              { label: "Tax %", value: Number(item.tax_rate).toFixed(2) },
            ].map((cell) => (
              <div key={cell.label} className="min-w-0">
                <dt className="m-0 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                  {cell.label}
                </dt>
                <dd className="m-0 mt-0.5 truncate text-[13px] font-semibold tabular-nums text-ink">
                  {cell.value}
                </dd>
              </div>
            ))}
          </dl>

          {/* Schemes are shown only when one was actually added to the line. */}
          {showSchemes && getOrderItemSchemes(item).length > 0 ? (
            <div className="mt-3 border-t border-brand/15 pt-2.5">
              <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                Scheme
              </p>
              <div className="mt-1 flex flex-col gap-1" aria-label="Applied schemes">
                {getOrderItemSchemes(item).map((scheme, schemeIndex) => (
                  <div
                    className="flex items-baseline gap-1.5 text-[12.5px]"
                    key={`${item.item_code}-scheme-${schemeIndex}`}
                  >
                    <span className="font-medium text-ink">{scheme.name || "-"}</span>
                    <span className="text-subtle">Qty {scheme.qty || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
