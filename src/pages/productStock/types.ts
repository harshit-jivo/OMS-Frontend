/**
 * Shared data shapes for the Product Stock page — split out of
 * `Product_Stock.tsx` (Phase 4 decomposition) alongside `useProductStock`,
 * `productStockUtils` and `components/`. See `Product_Stock.tsx` for the
 * composition this feeds.
 */
import type { Party, Product, SapSalesOrder } from "../../services/sapService";

export type StockStatus = "shortage" | "out" | "low" | "available";

export type PartyDemand = {
  qty: number;
  parties: Record<string, number>;
};

export type StockDisplayProduct = Product & {
  display_key: string;
  display_stock: number;
  display_required_qty: number;
  display_left_over_stock: number;
  display_party_demand?: PartyDemand;
};

export type OrderModalState = {
  party: Party;
  orders: SapSalesOrder[];
  loading: boolean;
  error: string;
} | null;

export type ProductOption = {
  item_code: string;
  item_name: string;
  category?: string;
  sal_pack_unit?: string | null;
};

export type ProductDemandRow = {
  order: SapSalesOrder;
  line: SapSalesOrder["lines"][number];
};

export type PartyDemandRow = {
  partyCode: string;
  partyName: string;
  qty: number;
};
