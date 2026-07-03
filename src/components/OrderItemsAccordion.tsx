import { useEffect, useState } from "react";
import {
  getOrderItemSchemes,
  getOrderItemTotalLtrs,
  type OrderItem,
} from "../services/ordersService";
import "./OrderItemsAccordion.css";

type GroupKey = "PREMIUM" | "COMMODITY" | "OTHERS";

const GROUP_ORDER: GroupKey[] = ["PREMIUM", "COMMODITY", "OTHERS"];

const GROUP_META: Record<GroupKey, { label: string; cls: string }> = {
  PREMIUM: { label: "Premium", cls: "oia-badge-premium" },
  COMMODITY: { label: "Commodity", cls: "oia-badge-commodity" },
  OTHERS: { label: "Others", cls: "oia-badge-others" },
};

const normalizeType = (value?: string): GroupKey => {
  const key = String(value || "").trim().toUpperCase();
  return (GROUP_ORDER as string[]).includes(key) ? (key as GroupKey) : "OTHERS";
};

function ItemCard({ item, index }: { item: OrderItem; index: number }) {
  const schemes = getOrderItemSchemes(item);

  return (
    <article className="order-detail-item-card">
      <div className="order-detail-item-top">
        <span className="order-detail-item-index">Item {index}</span>
        <span className="order-detail-item-code">{item.item_code}</span>
      </div>
      <div className="order-detail-item-main">
        <div className="order-detail-item-title-wrap">
          <span className="order-detail-label">Item Name</span>
          <h4 className="order-detail-item-title">{item.item_name}</h4>
        </div>
        <div className="order-detail-item-tags">
          <span className="order-detail-item-category">{item.category || "-"}</span>
          {schemes.map((scheme, schemeIndex) => (
            <span className="order-detail-scheme-chip" key={`${item.item_code}-scheme-${schemeIndex}`}>
              <em>Sch</em>{scheme.name || "-"} <strong>Qty {scheme.qty || 0}</strong>
            </span>
          ))}
        </div>
      </div>
      <div className="order-detail-item-metrics">
        <div><span>Qty</span><strong>{item.qty}</strong></div>
        <div><span>Pcs</span><strong>{item.pcs}</strong></div>
        <div><span>Boxes</span><strong>{Number(item.boxes).toFixed(2)}</strong></div>
        <div><span>Ltrs</span><strong>{item.ltrs}</strong></div>
        {schemes.length > 0 ? (
          <div><span>Total Ltrs</span><strong>{getOrderItemTotalLtrs(item).toFixed(2)}</strong></div>
        ) : null}
        <div className="is-emph"><span>Price List (Basic)</span><strong>{Number(item.price_list_basic).toFixed(2)}</strong></div>
        <div className="is-emph"><span>Basic Price</span><strong>{Number(item.basic_price).toFixed(2)}</strong></div>
        <div><span>Tax %</span><strong>{Number(item.tax_rate).toFixed(2)}</strong></div>
        <div className="order-detail-item-amount"><span>Amount</span><strong>{Number(item.total).toFixed(2)}</strong></div>
      </div>
    </article>
  );
}

export default function OrderItemsAccordion({ items }: { items: OrderItem[] }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Reset to fully expanded whenever a different order's items load, so a group
  // collapsed on one order doesn't stay collapsed when viewing another.
  useEffect(() => {
    setCollapsed({});
  }, [items]);

  if (!items || items.length === 0) {
    return <div className="order-detail-empty">No items found</div>;
  }

  const buckets = new Map<GroupKey, OrderItem[]>();
  items.forEach((item) => {
    const key = normalizeType(item.variety_type);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  });

  const groups = GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    items: buckets.get(key)!,
    ...GROUP_META[key],
  }));

  return (
    <div className="oia-wrap">
      {groups.map((group) => {
        const isOpen = !collapsed[group.key];

        return (
          <section className={`oia-group${isOpen ? " open" : ""}`} key={group.key}>
            <button
              type="button"
              className="oia-head"
              onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: isOpen }))}
              aria-expanded={isOpen}
            >
              <span className={`oia-badge ${group.cls}`}>{group.label}</span>
              <span className="oia-count">
                {group.items.length} item{group.items.length !== 1 ? "s" : ""}
              </span>
              <svg className="oia-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && (
              <div className="oia-body">
                <div className="order-detail-card-list oia-grid">
                  {group.items.map((item, i) => (
                    <ItemCard item={item} index={i + 1} key={`${item.item_code}-${group.key}-${i}`} />
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
