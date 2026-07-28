import type { IconType } from "react-icons";
import { LuDroplets, LuPackage } from "react-icons/lu";
import type { OrderItem } from "../../services/ordersService";

/** ₹ formatted, Indian digit grouping, up to 2 decimals. */
export const formatCurrency = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

/** Plain number, trailing zeros trimmed (unless `decimals` given). */
export const formatNumber = (
  value: number | string | null | undefined,
  decimals?: number,
) => {
  const n = Number(value ?? 0);
  return decimals != null ? n.toFixed(decimals) : String(n);
};

/** "SURJEET SINGH" -> "SS", "sumit" -> "SU". */
export const getInitials = (name: string) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** "PREMIUM" -> "Premium", "cold press" -> "Cold Press". */
export const titleCase = (value?: string | null) => {
  const str = String(value || "").trim();
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const CATEGORY_ICONS: Record<string, IconType> = {
  OIL: LuDroplets,
};

/** Icon chosen from the item's category, falling back to a generic package. */
export const getCategoryIcon = (item: OrderItem): IconType =>
  CATEGORY_ICONS[String(item.category || "").toUpperCase()] || LuPackage;

export type VarietyTone = "premium" | "commodity" | "others" | "default";

export const varietyTone = (varietyType?: string): VarietyTone => {
  switch (String(varietyType || "").toUpperCase()) {
    case "PREMIUM":
      return "premium";
    case "COMMODITY":
      return "commodity";
    case "OTHERS":
      return "others";
    default:
      return "default";
  }
};
