/**
 * Shared data shapes for the Dashboard page — split out of `Dashboard.tsx`
 * (Phase 4 decomposition) alongside `useDashboard`, `components/`,
 * `constants.ts` and `format.ts`. See `Dashboard.tsx` for the composition
 * this feeds.
 */

export interface KPIData {
  total_orders: number;
  total_revenue: string;
  completed_revenue?: string;
  rejected_revenue?: string;
  pending_revenue?: string;
  today_orders: number;
  this_month_orders: number;
  status_counts: Record<string, number>;
  user_counts: Record<string, number>;
  accepted_orders?: number;
  rejected_orders?: number;
  pending_review_orders?: number;
  reviewed_orders?: number;
}

export interface ChartsData {
  monthly_sales: { month: string; label: string; revenue: number; count: number }[];
  statewise_orders: { state: string; orders: number; sales?: number }[];
  manager_performance?: {
    manager_id: number | null;
    manager_name: string;
    orders: number;
    sales: number;
  }[];
  manager_state_performance?: {
    manager_id: number | null;
    manager_name: string;
    state: string;
    orders: number;
    sales: number;
  }[];
  status_distribution: { status: string; label: string; count: number }[];
  decision_distribution?: { status: string; label: string; count: number }[];
  top_parties: {
    card_code: string;
    card_name: string;
    category?: string;
    count: number;
    completed_count?: number;
    revenue: number;
  }[];
  category_sales: { category: string; total_sales: number; count: number }[];
  state_item_sales?: StateItemSales[];
  highest_sales_order?: { order_number: string | null; amount: number };
}

export interface StateItemSales {
  state: string;
  products: {
    item_code: string;
    item_name: string;
    category: string;
    variety: string;
    total_sales: number;
    quantity: number;
    count: number;
  }[];
}

export interface CurrentUser {
  role?: string;
  username?: string;
  full_name?: string;
  name?: string;
}

export type SupportedRole = "admin" | "auditor" | "manager" | "billing" | "approver";
export type TopPartyView = "all" | 5 | 10;

export type StatusItem = { status: string; label: string; count: number };
