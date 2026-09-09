/**
 * Pure helpers and constants for the Product Stock page — split out of
 * `Product_Stock.tsx` (Phase 4 decomposition). None of this reads state; it
 * is exercised entirely through `useProductStock`'s memos.
 */
import type { Party, Product, SapSalesOrder } from "../../services/sapService";
import type { BadgeTone } from "@/components/ui/badge";
import type { PartyDemand, StockDisplayProduct, StockStatus } from "./types";

export const ITEMS_PER_PAGE = 15;
export const LOW_STOCK_LIMIT = 10;

export const STOCK_OPTIONS: { value: StockStatus; label: string }[] = [
  { value: "shortage", label: "Shortage" },
  { value: "out", label: "Out of Stock" },
  { value: "low", label: "Low Stock" },
  { value: "available", label: "Available" },
];

/** Stock state -> shared badge tone, read off the stock-state rules in Product_Stock.css. */
export const STOCK_TONE: Record<string, BadgeTone> = {
  available: "ok",
  low: "hold",
  shortage: "bad",
  out: "bad",
};

/** Stable empties, so the many filter memos settle. */
export const NO_PRODUCTS: Product[] = [];
export const NO_PARTIES: Party[] = [];

export const normalizeProducts = (data: unknown): Product[] => {
  if (Array.isArray(data)) return data as Product[];

  if (data && typeof data === "object") {
    const response = data as { data?: unknown; products?: unknown; results?: unknown };
    if (Array.isArray(response.data)) return response.data as Product[];
    if (Array.isArray(response.products)) return response.products as Product[];
    if (Array.isArray(response.results)) return response.results as Product[];
  }

  return [];
};

export const toStockNumber = (value: Product["on_hand"]) => {
  const nextValue = Number(value ?? 0);
  return Number.isFinite(nextValue) ? nextValue : 0;
};

export const getWarehouseStock = (product: Product) =>
  toStockNumber(product.warehouse_stock ?? product.on_hand);

export const getPendingRequiredQty = (product: Product) =>
  toStockNumber(product.pending_required_qty ?? product.pendingRequiredQty);

export const getLeftOverStock = (product: Product) => {
  if (product.left_over_stock !== undefined && product.left_over_stock !== null) {
    return toStockNumber(product.left_over_stock);
  }

  return getWarehouseStock(product) - getPendingRequiredQty(product);
};

export const getStockStatus = (stock: number, leftOverStock = stock): StockStatus => {
  if (leftOverStock < 0) return "shortage";
  if (stock <= 0) return "out";
  if (leftOverStock <= LOW_STOCK_LIMIT) return "low";
  return "available";
};

export const getStatusLabel = (status: StockStatus) => {
  if (status === "shortage") return "Shortage";
  if (status === "out") return "Out of Stock";
  if (status === "low") return "Low Stock";
  return "Available";
};

export const formatQuantity = (value: number) =>
  value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });

export const formatRoundedQuantity = (value: number) => Math.round(value).toLocaleString("en-IN");

export const getPackLtrs = (pack?: string | null) => {
  const text = String(pack || "").trim();
  const numericPack = Number(text);
  if (Number.isFinite(numericPack) && numericPack > 0) return numericPack;

  const match = text.match(/(\d+(?:\.\d+)?)\s*(LTR|L|ML)\b/i);
  if (!match) return 0;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;

  return match[2].toUpperCase() === "ML" ? value / 1000 : value;
};

export const getWarehouseQtyLtrs = (product: StockDisplayProduct) =>
  product.display_stock * getPackLtrs(product.sal_pack_unit);

export const getRequiredQtyLtrs = (product: StockDisplayProduct) =>
  product.display_required_qty * getPackLtrs(product.sal_pack_unit);

export const formatOrderDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.split("T")[0] || value;

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const normalizeText = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export const getPartyName = (party: Party) =>
  String(party.card_name || (party as unknown as { CardName?: string }).CardName || "").trim();

export const getPartyCode = (party: Party) =>
  String(party.card_code || (party as unknown as { CardCode?: string }).CardCode || "").trim();

export const getPartySearchText = (party: Party) =>
  normalizeText(
    [
      getPartyName(party),
      getPartyCode(party),
      party.address,
      party.category,
      party.state,
      party.main_group,
      party.chain,
    ]
      .filter(Boolean)
      .join(" "),
  );

export const getOrderLineItemCode = (line: { ItemCode?: string }) =>
  String(line.ItemCode || "").trim();

export const getOrderLineWarehouseCode = (line: { WhsCode?: string | null }) =>
  String(line.WhsCode || "").trim();

export const getStockKey = (itemCode: string, warehouseCode?: string | null) =>
  `${String(itemCode || "").trim()}||${String(warehouseCode || "").trim()}`;

export const getProductGroupKey = (product: Product) =>
  `${String(product.item_code || "").trim()}||${String(product.category || "").trim()}`;

export const getItemCodeFromStockKey = (stockKey: string) => stockKey.split("||")[0] || "";

export const getSalesOrderKey = (order: SapSalesOrder) =>
  `${String(order.CardCode || "").trim()}||${String(order.DocEntry || order.DocNum || "").trim()}`;

export const getSalesOrderKeyForParty = (order: SapSalesOrder, partyCode: string) =>
  getSalesOrderKey({ ...order, CardCode: partyCode });

export const mergePartyDemand = (target: PartyDemand, source?: PartyDemand) => {
  if (!source) return target;

  target.qty += source.qty;
  Object.entries(source.parties).forEach(([partyCode, qty]) => {
    target.parties[partyCode] = (target.parties[partyCode] || 0) + qty;
  });

  return target;
};

export const getDemandByItemFromOrders = (orders: SapSalesOrder[]) => {
  const itemOrderDemand: Record<string, Record<string, { partyCode: string; qty: number }>> = {};

  orders.forEach((order) => {
    const partyCode = String(order.CardCode || "").trim();
    if (!partyCode) return;

    order.lines?.forEach((line) => {
      const itemCode = getOrderLineItemCode(line);
      if (!itemCode) return;

      const orderKey = getSalesOrderKeyForParty(order, partyCode);
      const openQty = toStockNumber(line.OpenQty);
      itemOrderDemand[itemCode] = itemOrderDemand[itemCode] || {};
      itemOrderDemand[itemCode][orderKey] = {
        partyCode,
        qty: Math.max(itemOrderDemand[itemCode][orderKey]?.qty || 0, openQty),
      };
    });
  });

  return Object.entries(itemOrderDemand).reduce<Record<string, PartyDemand>>(
    (current, [itemCode, orderDemand]) => {
      current[itemCode] = Object.values(orderDemand).reduce<PartyDemand>(
        (total, { partyCode, qty }) => {
          total.qty += qty;
          total.parties[partyCode] = (total.parties[partyCode] || 0) + qty;
          return total;
        },
        { qty: 0, parties: {} },
      );
      return current;
    },
    {},
  );
};
