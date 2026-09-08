import api from "./api";
import { unwrap } from "./approvalService";

/** A company the signed-in user may transact in. */
export interface DashboardCompany {
  company: string;
  display_name: string;
}

/**
 * Payments Dashboard analytics API.
 *
 * Types mirror `payments/analytics.py::dashboard()` exactly. One call fills the
 * whole page — see the docstring on PaymentDashboardView for why the widgets
 * are not fetched separately.
 */

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "custom";

/** Matches analytics.DEFAULT_PRESET on the server. */
export const DEFAULT_PRESET: DatePreset = "last_30_days";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

/** One donut segment. `percent` is computed server-side so chart, legend and
 *  tooltip can never round the same number differently. */
export interface ChartSlice {
  key: string;
  label: string;
  amount: number;
  percent: number;
}

export interface ChartSeries {
  total: number;
  slices: ChartSlice[];
}

/**
 * Every figure here is SAP-POSTED ONLY, except the `pending_*` / `blocked_*`
 * group, which is deliberately the opposite: what was raised but has NOT
 * settled in SAP.
 */
export interface DashboardKpis {
  total_payments: number;
  total_payments_count: number;
  deposit_total: number;
  deposit_collected: number;
  deposit_count: number;
  received_total: number;
  received_count: number;
  against_invoice: number;
  against_invoice_count: number;
  advance_payment: number;
  advance_count: number;

  /** Raised but not in SAP — draft, awaiting approval, mid-post, refused or
   *  unconfirmed. Excludes rejected and cancelled: nothing is waiting on
   *  those. */
  pending_receipts: number;
  pending_receipts_count: number;
  pending_deposits: number;
  pending_deposits_count: number;
  /** The subset needing a human: SAP refused it, or never answered. */
  blocked_total: number;
  blocked_count: number;
}

/** How a participant took part. A row can carry several. */
export type ParticipationRole =
  | "collected"
  | "banked"
  | "recorded"
  | "submitted";

export interface CollectionRow {
  id: number;
  /** `person` = CollectionPerson, `user` = OMS login. The two id spaces are
   *  separate — the same number means different people. */
  kind: "person" | "user";
  /** `kind:id` — the stable identity to key React lists and routes on. */
  key: string;
  name: string;
  code: string;
  roles: ParticipationRole[];
  role_labels: string[];
  received: number;
  deposited: number;
  total: number;
  receipt_count: number;
  deposit_count: number;
  /** Share of the strongest performer in that column, not of a target — the
   *  system holds no collection targets. */
  received_percent: number;
  deposit_percent: number;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface CollectionPerformance {
  results: CollectionRow[];
  pagination: Pagination;
}

export type SortField = "name" | "received" | "deposited" | "total";

export interface DashboardData {
  filters: {
    company: string;
    preset: DatePreset;
    /** Resolved server-side: the browser clock is not authoritative for
     *  "today", or two users in different timezones see different figures. */
    date_from: string;
    date_to: string;
  };
  kpis: DashboardKpis;
  charts: {
    received: ChartSeries;
    methods: ChartSeries;
    deposits: ChartSeries;
  };
  collection_performance: CollectionPerformance;
}

export interface DashboardQuery {
  company?: string;
  preset?: DatePreset;
  date_from?: string;
  date_to?: string;
  /** Table controls. The dashboard call returns page 1 of the table too, so a
   *  first paint needs no second request. */
  search?: string;
  sort?: SortField;
  direction?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

/** One participant's collection history. */
export interface PersonDetail {
  person: {
    id: number;
    kind: "person" | "user";
    key: string;
    name: string;
    code: string;
    subtitle: string;
  };
  filters: DashboardData["filters"];
  kpis: {
    received_total: number;
    received_count: number;
    deposit_total: number;
    deposit_collected: number;
    deposit_count: number;
    against_invoice: number;
    advance_payment: number;
  };
  charts: { received: ChartSeries; methods: ChartSeries };
  /** Collected vs banked per day. Empty when the window is too wide to plot. */
  timeline: { date: string; received: number; deposited: number }[];
  recent_activity: {
    kind: "RECEIPT" | "DEPOSIT";
    id: number;
    reference: string;
    date: string;
    amount: number;
    status: string;
    party: string;
    detail: string;
  }[];
}

/** Query object -> URL params. One place, so the three endpoints that take the
 *  same window can never disagree about how it is spelled. */
function toParams(query: DashboardQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.company) params.company = query.company;
  if (query.preset) params.preset = query.preset;
  // Only meaningful for the custom preset; the server rejects a half-open
  // range rather than quietly substituting today.
  if (query.preset === "custom") {
    if (query.date_from) params.date_from = query.date_from;
    if (query.date_to) params.date_to = query.date_to;
  }
  if (query.search) params.search = query.search;
  if (query.sort) params.sort = query.sort;
  if (query.direction) params.direction = query.direction;
  if (query.page) params.page = String(query.page);
  if (query.page_size) params.page_size = String(query.page_size);
  return params;
}

const paymentsDashboardService = {
  get: async (query: DashboardQuery = {}): Promise<DashboardData> => {
    const res = await api.get("/payments/dashboard/", {
      params: toParams(query),
    });
    return unwrap<DashboardData>(res.data);
  },

  /**
   * Just the participants table.
   *
   * Used when only the table's own controls change — paging, searching,
   * sorting — so the KPI and chart aggregations are not re-run for a query
   * whose answer has not changed.
   */
  collectionPerformance: async (
    query: DashboardQuery = {},
  ): Promise<CollectionPerformance> => {
    const res = await api.get("/payments/dashboard/collection-performance/", {
      params: toParams(query),
    });
    return unwrap<CollectionPerformance>(res.data);
  },

  /** One participant's history. `kind` is part of the path because a
   *  CollectionPerson and a User can share an id and be different people. */
  person: async (
    kind: "person" | "user",
    id: number,
    query: DashboardQuery = {},
  ): Promise<PersonDetail> => {
    const res = await api.get(`/payments/dashboard/person/${kind}/${id}/`, {
      params: toParams(query),
    });
    return unwrap<PersonDetail>(res.data);
  },

  /**
   * Companies for the filter.
   *
   * `/payments/companies/` is IsAuthenticated and already scoped to the
   * companies the caller may transact in. It reads the canonical company list
   * on the server, so a company added or renamed there needs no release here.
   */
  listCompanies: async (): Promise<DashboardCompany[]> => {
    const res = await api.get("/payments/companies/");
    const body = unwrap<DashboardCompany[] | { results: DashboardCompany[] }>(
      res.data,
    );
    return Array.isArray(body) ? body : (body?.results ?? []);
  },
};

export default paymentsDashboardService;
