import { memo, useEffect, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import type { OrderItem } from "../../services/ordersService";
import ItemCard from "./ItemCard";
import { varietyTone } from "./helpers";
import "./item-section.css";

type GroupKey = "PREMIUM" | "COMMODITY" | "OTHERS";

const GROUP_ORDER: GroupKey[] = ["PREMIUM", "COMMODITY", "OTHERS"];

const GROUP_LABEL: Record<GroupKey, string> = {
  PREMIUM: "Premium",
  COMMODITY: "Commodity",
  OTHERS: "Others",
};

const groupKeyOf = (item: OrderItem): GroupKey => {
  const key = String(item.variety_type || "").toUpperCase();
  return (GROUP_ORDER as string[]).includes(key) ? (key as GroupKey) : "OTHERS";
};

/**
 * Renders `order.items` grouped into collapsible accordions by variety type
 * (Premium / Commodity / Others). Each group lays its items out as a
 * responsive grid of premium <ItemCard/>s. All groups start expanded.
 */
function ItemSection({ items }: { items: OrderItem[] }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Fully expand whenever a different order's items load.
  useEffect(() => {
    setCollapsed({});
  }, [items]);

  if (!items || items.length === 0) {
    return (
      <div className="isec-root">
        <div className="isec-empty">No items found</div>
      </div>
    );
  }

  const buckets = new Map<GroupKey, OrderItem[]>();
  items.forEach((item) => {
    const key = groupKeyOf(item);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  });

  const groups = GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    label: GROUP_LABEL[key],
    tone: varietyTone(key),
    items: buckets.get(key)!,
  }));

  return (
    <div className="isec-root">
      {groups.map((group) => {
        const isOpen = !collapsed[group.key];

        return (
          <section className={`isec-group${isOpen ? " open" : ""}`} key={group.key}>
            <button
              type="button"
              className="isec-group__head"
              aria-expanded={isOpen}
              onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: isOpen }))}
            >
              <span className={`isec-group__badge isec-chip--${group.tone}`}>{group.label}</span>
              <span className="isec-group__count">
                {group.items.length} item{group.items.length !== 1 ? "s" : ""}
              </span>
              <LuChevronDown className="isec-group__chev" aria-hidden="true" />
            </button>

            {isOpen && (
              <div className="isec-group__body">
                <div className="isec-grid">
                  {group.items.map((item, index) => (
                    <ItemCard key={item.id ?? `${item.item_code}-${index}`} item={item} />
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

export default memo(ItemSection);
