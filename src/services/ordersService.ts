import api from "./api"

export interface Product {
  id: number;
  category: string;
  brand: string | null;
  variety: string | null;
  item_name: string;
  item_code: string;
  sal_factor2: string | number;
  sal_pack_unit: string | null;
  tax_rate: string | number;
  basic_rate: string | number;
  staff_rate?: string | number;
};

type StaffProductRatePayload = {
  product_id: number;
  item_code: string;
  category: string;
  rate: number;
};

type StaffProductRemovePayload = {
  product_id: number;
  item_code: string;
  category: string;
};

export type OrderFlowConditionOption = {
  code: string;
  label: string;
};

export type OrderFlowTypeOption = {
  code: string;
  label: string;
};

export type OrderFlowConfig = {
  flow_type: string;
  flow_label?: string;
  flow_options?: OrderFlowTypeOption[];
  rate_approval_enabled: boolean;
  billing_enabled: boolean;
  auditor_enabled: boolean;
  rate_conditions: string[];
  condition_options?: OrderFlowConditionOption[];
  updated_at?: string | null;
  updated_by?: string | null;
};

export type PartyFlowConfig = {
  card_code: string;
  card_name?: string;
  category: string;
  flow_type: string;
  flow_label?: string;
  rate_approval_enabled: boolean;
  billing_enabled: boolean;
  auditor_enabled: boolean;
  rate_conditions: string[];
  updated_at?: string | null;
  updated_by?: string | null;
};

export type PartyFlowTarget = {
  card_code: string;
  category: string;
};

export type PartyFlowSettings = {
  rate_approval_enabled: boolean;
  billing_enabled: boolean;
  auditor_enabled: boolean;
  rate_conditions: string[];
};

export type OrderStatusUpdateResponse = {
  message?: string;
  order_id?: number;
  status?: string;
};

export interface PartyProduct {
  item_code: string;
  item_name: string;
  category: string;
  brand: string | null;
  variety: string | null;
  sal_factor2: string | number;
  sal_pack_unit: string | null;
  tax_rate: string | number;
  basic_rate: string | number;
  // Combo packs ("A + B") ship B free of cost. `free_item` is present only when
  // the combo has a mapping configured on the party-product assignment.
  is_combo?: boolean;
  free_item_code?: string | null;
  free_qty_per_unit?: number | null;
  free_item?: ComboFreeProduct | null;
}

export interface ComboFreeProduct {
  item_code: string;
  item_name: string;
  category: string;
  brand: string | null;
  variety: string | null;
  sub_group: string | null;
  sal_factor2: string | number;
  sal_pack_unit: string | null;
  tax_rate: string | number;
  basic_rate: string | number;
}
  
export interface SchemeProduct {
  scheme_id: number;
  scheme_name: string;
  item_code: string;
  item_name: string;
  state?: number;
  state_code?: string;
  state_name?: string;
  sal_factor2: string | number;
  sal_pack_unit: string | null;
}

export interface RowType {
  category: string;
  brand: string;
  variety: string;
  type: string;
  item: string;
  isScheme: boolean;
  scheme: string;
  schemeQty: string;
  pcs: string;
  qty: string;
  ltrs: string;
  boxes: string;
  priceListBasic: string;
  basicPrice: string;
  tax: string;
  amount: string;
};

export interface OrderItemScheme {
  id?: number;
  /** Legacy `scheme_product` id — absent on a giveaway resolved by the v2 engine. */
  scheme_id?: number;
  scheme_name?: string | null;
  scheme_item_code?: string | null;
  scheme_qty?: number | string;
  qty_scheme?: number | string;

  // Scheme engine v2 (Backend/docs/scheme-architecture.md). `benefit_item_code`
  // is the snapshot SAP actually ships, so editing a scheme later cannot change
  // what an already-approved order sends.
  scheme_v2_id?: number;
  benefit_id?: number;
  benefit_item_code?: string | null;
  computed_qty?: number | string;
  is_manual_override?: boolean;
  scope_type?: string;
  scope_value?: string;
}

export interface OrderItem {
  id?: number;
  item_code: string;
  item_name: string;
  category: string;
  brand: string;
  variety: string;
  variety_type?: string;
  sub_group?: string;
  item_type: string;
  last_purchase_price?: number | string | null;
  is_scheme_visible?: boolean;
  approval_approvers?: { id: number; name: string }[];
  scheme_name?: string;
  scheme_qty?: number | string;
  qty_scheme?: number | string;
  scheme_ltrs?: number | string;

  qty: number;
  pcs: number;
  boxes: number;
  ltrs: number;

  price_list_basic: number;
  basic_price: number;
  tax_rate: number;
  total: number;
  scheme_id?: number;
  schemes?: OrderItemScheme[];
  total_ltrs: number;
  // Zero-priced line auto-added for the free half of a combo pack.
  is_auto_free?: boolean;
  combo_source_code?: string | null;
}

export interface CreateOrder {
  order_id?: number;
  order_type?: "PARTY" | "STAFF";
  employee_id?: string;
  card_code: string;
  card_name: string;
  bill_to_id: number;
  bill_to_address: string;
  ship_to_id: number;
  ship_to_address: string;
  dispatch_from_id: number;
  dispatch_from_name: string;

  delivery_date: string;
  po_number?: string;
  is_foc?: boolean;
  company: number;

  total_amount: number;
  tax_amount: number;
  grand_total: number;

  items: OrderItem[];
}

// ── Distributor / Mart flow payload + read models ───────────────────────────
// Billing-shaped item so a distributor sales order carries the SAME data as a
// normal order (pcs/boxes/ltrs/landing/tax all computed like Add Sales).
export interface MartOrderItemPayload {
  item_code: string;
  item_name: string;
  category: string;
  brand: string;
  variety: string;
  sub_group: string;
  item_type: string;
  pcs: number;
  boxes: number;
  qty: number;
  ltrs: number;
  price_list_basic: number;
  basic_price: number;
  tax_rate: number;
  total: number;
  total_ltrs: number;
}

export interface MartOrderPayload {
  order_id?: number;
  order_type: "DISTRIBUTOR";
  card_code: string;
  card_name: string;
  bill_to_id: number;
  bill_to_address: string;
  ship_to_id: number;
  ship_to_address: string;
  delivery_date: string;
  po_number?: string;
  company: number;
  total_amount: number;
  items: MartOrderItemPayload[];
}

export interface MartOrderSummary {
  id: number;
  order_number: string;
  order_type: string;
  card_code: string;
  card_name: string;
  company: string;
  total_amount: string;
  status: string;
  status_id: number;
  is_pending: boolean;
  status_display: string;
  po_number?: string;
  delivery_date?: string | null;
  created_by?: string | null;
  created_at?: string;
  rejection_reason?: string;
  items_count: number;
}

export interface MartOrderDetailItem {
  id: number;
  item_code: string;
  item_name: string;
  category: string;
  qty: string;
  basic_price: string;
  total: string;
}

export interface MartOrderDetail extends MartOrderSummary {
  bill_to_id: number;
  bill_to_address: string;
  ship_to_id: number;
  ship_to_address: string;
  items: MartOrderDetailItem[];
}

export interface RateApproval {
  id: number;
  approver: number;
  approver_name: string;
  status: string;
  remarks?: string;
  approved_at?: string;
  created_at?: string;
}

export interface Order {
  id: number;
  status?: number;
  order_number: string;
  order_type?: "PARTY" | "STAFF";
  employee_id?: string;
  card_code: string;
  card_name: string;
  bill_to_id?: number;
  delivery_date: string;
  status_display: string;
  bill_to_address_id?: number;
  bill_to_address: string;
  ship_to_id?: number;
  ship_to_address: string;
  dispatch_from_id?: number;
  dispatch_from_name?: string;
  po_number: string;
  is_foc?: boolean;
  company?: string | number;
  remarks?: string;
  items: OrderItem[];
  items_count?: number;
  created_at: string;
  created_by: string | number;
  rejected_by?: string | null;
  total_amount: number;
  sap_doc_number?: string;
  quotation_cancelled?: boolean;
  created_by_name?: string;
  party_state?: string;
  decision_type?: "accepted" | "rejected";
  rate_approvals?: RateApproval[];
  // Note: API key is misspelled "vareity_cost".
  vareity_cost?: {
    commodity_price?: number;
    other_total?: number;
    premium_total?: number;
  };
}

export interface OrderStatus {
  id: number;
  name: string;
}

export interface QuotationStatus {
  doc_entry: number | null;
  doc_num: number | null;
  doc_status: string | null;
  canceled: string | null;
  is_open: boolean;
}

export type QuotationStatusLabel = "CANCELLED" | "OPEN" | "CLOSED" | "UNKNOWN";

export interface QuotationOverviewItem {
  id: number;
  order_number: string;
  card_code: string;
  card_name: string;
  created_at: string;
  doc_num: number | string | null;
  doc_entry: number | null;
  quotation_cancelled: boolean;
  quotation_cancelled_at: string | null;
  quotation_cancelled_by: string | null;
  quotation_status: QuotationStatusLabel;
  category?: string;
  categories?: string[];
}

export interface OrderLog {
  id: number;
  status_name: string;
  remarks: string;
  performed_by_name: string | null;
  created_at: string;
}

export interface OrderStockCheckItem {
  item_code: string;
  item_name: string;
  category: string;
  required_qty: number;
  available_stock: number;
}

export interface OrderStockCheck {
  id: number;
  order_number: string;
  date: string;
  customer: string;
  order_type: "Party" | "Staff";
  dispatch_from: string;
  status: string;
  items: OrderStockCheckItem[];
}

export type ItemSchemeDisplay = {
  name: string;
  qty: string | number;
};

const toNumber = (value: string | number | null | undefined) =>
  typeof value === "number" ? value : Number(value || 0);

export const getOrderItemSchemes = (item: OrderItem): ItemSchemeDisplay[] => {
  const schemes = Array.isArray(item.schemes) ? item.schemes : [];

  if (schemes.length > 0) {
    return schemes.map((scheme) => ({
      name: scheme.scheme_name || scheme.scheme_item_code || "",
      qty: scheme.scheme_qty ?? scheme.qty_scheme ?? 0,
    }));
  }

  return item.scheme_name
    ? [{ name: item.scheme_name, qty: item.scheme_qty ?? item.qty_scheme ?? 0 }]
    : [];
};

export const getOrderItemSchemeNames = (item: OrderItem) =>
  getOrderItemSchemes(item)
    .map((scheme) => scheme.name)
    .filter(Boolean)
    .join(", ");

export const getOrderItemSchemeQtyText = (item: OrderItem) =>
  getOrderItemSchemes(item)
    .map((scheme) => scheme.qty)
    .join(", ");

export const getOrderItemTotalLtrs = (item: OrderItem) => {
  const totalLtrs = Number(item.total_ltrs);

  if (Number.isFinite(totalLtrs) && totalLtrs > 0) {
    return totalLtrs;
  }

  const schemeQty = getOrderItemSchemes(item).reduce(
    (sum, scheme) => sum + toNumber(scheme.qty),
    0,
  );

  return Number(item.ltrs || 0) + schemeQty;
};

export const formatOrderCreatedAt = (createdAt?: string | null) => {
  if (!createdAt) return "-";

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const normalizeOrderItem = (item: OrderItem): OrderItem => {
  const schemes = Array.isArray(item.schemes)
    ? item.schemes.map((scheme) => ({
        ...scheme,
        scheme_qty: scheme.scheme_qty ?? scheme.qty_scheme ?? 0,
      }))
    : [];
  const schemeQty =
    schemes.length > 0
      ? schemes.reduce((sum, scheme) => sum + toNumber(scheme.scheme_qty ?? scheme.qty_scheme), 0)
      : item.scheme_qty ?? item.qty_scheme ?? 0;
  // const schemeLtrs =
  //   item.scheme_ltrs ??
  //   ((item as any).total_ltrs !== undefined
  //     ? Math.max(toNumber((item as any).total_ltrs) - toNumber(item.ltrs), 0)
  //     : schemeQty);
  const totalLtrs = (item as any).total_ltrs ?? toNumber(item.ltrs) + toNumber(schemeQty);

  return {
    ...item,
    schemes,
    scheme_qty: schemeQty,
    // scheme_ltrs: schemeLtrs,
    total_ltrs: totalLtrs,
  };
};

const normalizeOrder = (order: Order): Order => ({
  ...order,
  items: Array.isArray(order.items) ? order.items.map(normalizeOrderItem) : [],
});


export const ordersService = {

  getPartyName: async () => {
    const response = await api.get("/orders/parties/");
    return response.data;
  },

  getDispatchFrom: async () => {
    const response = await api.get("/orders/dispatches/");
    return response.data;
  },

  getPartyAdd: async (card_code: string, category?: string) => {
    const response = await api.get(`/orders/addresses/`, {
    params: { card_code, ...(category ? { category } : {}) }
  });
    return response.data;
  },

  getPartyProduct: async (card_code: string) => {
    const response = await api.get(`/orders/party-products/${card_code}/`);
    return response.data;
  },

  getProducts: async () => {
    const response = await api.get("/orders/products/");
    return response.data;
  },

  getSchemeProducts: async (state_code?: string) => {
    const response = await api.get("/orders/schemes/", {
      params: state_code ? { state_code } : undefined,
    });
    return response.data || [];
  },

  getStaffProducts: async () => {
    const response = await api.get("/orders/staff-products/");
    return response.data || [];
  },

  getOrderFlowConfig: async (flowType = "ASM") => {
    const response = await api.get("/orders/flow-config/", {
      params: { flow_type: flowType },
    });
    return response.data as OrderFlowConfig;
  },

  updateOrderFlowConfig: async (config: OrderFlowConfig) => {
    const response = await api.post("/orders/flow-config/", config);
    return response.data as { success?: boolean; message?: string; data?: OrderFlowConfig } | OrderFlowConfig;
  },

  getPartyFlowConfigs: async () => {
    const response = await api.get("/orders/party-flow-config/");
    return response.data as {
      success?: boolean;
      data: PartyFlowConfig[];
      flow_options?: OrderFlowTypeOption[];
      condition_options?: OrderFlowConditionOption[];
    };
  },

  savePartyFlowConfig: async (parties: PartyFlowTarget[], flowType: string, settings: PartyFlowSettings) => {
    const response = await api.post("/orders/party-flow-config/", {
      parties,
      flow_type: flowType,
      ...settings,
    });
    return response.data as { success?: boolean; message?: string; data?: PartyFlowConfig[] };
  },

  deletePartyFlowConfig: async (parties: PartyFlowTarget[], flowType: string) => {
    const response = await api.delete("/orders/party-flow-config/", {
      data: { parties, flow_type: flowType },
    });
    return response.data as { success?: boolean; message?: string };
  },

  saveStaffProductRates: async (
    products: StaffProductRatePayload[],
    removedProducts: StaffProductRemovePayload[] = [],
  ) => {
    const response = await api.post("/orders/staff-products/", {
      products,
      removed_products: removedProducts,
    });
    return response.data;
  },

  createOrder: async (formData: CreateOrder) => {
    const payload = {
      ...formData,
      items: formData.items.map((item) => ({
        ...item,
        sub_group: item.sub_group ?? item.variety,
        qty: Number(item.qty),
        pcs: Number(item.pcs),
        boxes: Number(item.boxes),
        ltrs: Number(item.ltrs),
        price_list_basic: Number(item.price_list_basic),
        basic_price: Number(item.basic_price),
        tax_rate: Number(item.tax_rate),
        total: Number(item.total),
        scheme_id: item.scheme_id ? Number(item.scheme_id) : undefined,
        scheme_qty: item.scheme_qty ? Number(item.scheme_qty) : 0,
        schemes: Array.isArray(item.schemes)
          ? item.schemes.map((scheme) => ({
              scheme_id: Number(scheme.scheme_id),
              scheme_qty: Number(scheme.scheme_qty ?? scheme.qty_scheme ?? 0),
            }))
          : undefined,
        total_ltrs: item.total_ltrs,
      })),
    };
    const response = await api.post("/orders/create/", payload);
    return response.data;
  },

  // ── Distributor / Mart flow ───────────────────────────────────────────────
  // A distributor order reuses the same /orders/create/ endpoint (so it saves in
  // the same tables), but with order_type DISTRIBUTOR + company 3. Pass an
  // orderId (as order_id in the payload) to update an existing one from the
  // Mart Approval screen.
  createMartOrder: async (payload: MartOrderPayload) => {
    const response = await api.post("/orders/create/", payload);
    return response.data;
  },

  getMartOrders: async (tab?: "pending" | "approved" | "rejected") => {
    const response = await api.get("/orders/mart/list/", {
      params: tab ? { tab } : undefined,
    });
    return response.data as MartOrderSummary[];
  },

  getMartOrderDetail: async (orderId: number) => {
    const response = await api.get(`/orders/mart/${orderId}/`);
    return response.data as MartOrderDetail;
  },

  approveMartOrder: async (orderId: number) => {
    const response = await api.post(`/orders/mart/${orderId}/approve/`, {});
    return response.data;
  },

  rejectMartOrder: async (orderId: number, reason: string) => {
    const response = await api.post(`/orders/mart/${orderId}/reject/`, { reason });
    return response.data;
  },

  // Save a (possibly incomplete) order as a draft. Drafts skip the approval
  // flow and notifications; pass an existing orderId to update a draft in place.
  saveDraft: async (formData: Partial<CreateOrder>, orderId?: number) => {
    const items = Array.isArray(formData.items) ? formData.items : [];
    const payload = {
      ...formData,
      ...(orderId ? { order_id: orderId } : {}),
      is_draft: true,
      items: items.map((item) => ({
        ...item,
        sub_group: item.sub_group ?? item.variety,
        qty: Number(item.qty),
        pcs: Number(item.pcs),
        boxes: Number(item.boxes),
        ltrs: Number(item.ltrs),
        price_list_basic: Number(item.price_list_basic),
        basic_price: Number(item.basic_price),
        tax_rate: Number(item.tax_rate),
        total: Number(item.total),
        scheme_id: item.scheme_id ? Number(item.scheme_id) : undefined,
        scheme_qty: item.scheme_qty ? Number(item.scheme_qty) : 0,
        schemes: Array.isArray(item.schemes)
          ? item.schemes.map((scheme) => ({
              scheme_id: Number(scheme.scheme_id),
              scheme_qty: Number(scheme.scheme_qty ?? scheme.qty_scheme ?? 0),
            }))
          : undefined,
        total_ltrs: item.total_ltrs,
      })),
    };
    const response = await api.post("/orders/create/", payload);
    return response.data;
  },

  // List the current user's draft orders (full details).
  getDrafts: async (userId: number) => {
    const response = await api.get(`/orders/ordersbyuser/${userId}/`);
    const orders = (response.data as Order[]).map(normalizeOrder);
    return orders.filter(
      (order) => String(order.status_display || "").trim().toLowerCase() === "draft",
    );
  },

  deleteDraft: async (orderId: number) => {
    const response = await api.delete(`/orders/${orderId}/delete-draft/`);
    return response.data as { message: string };
  },

  async getOrders(status?: number | string, billing?: boolean, approvalPending?: boolean) {
    const params: string[] = [];
    if (status !== undefined && status !== null) params.push(`status=${status}`);
    if (billing) params.push('billing=true');
    if (approvalPending) params.push('approval_pending=true');
    const url = "/orders/list/" + (params.length ? `?${params.join('&')}` : '');
    const response = await api.get(url);
    return Array.isArray(response.data) ? response.data.map(normalizeOrder) : response.data;
  },

  getOrdersByUser: async (userId: number) => {
    const response = await api.get(`/orders/ordersbyuser/${userId}/`);
    return (response.data as Order[]).map(normalizeOrder);
  },

  getOrderDetails: async (orderId: number) => {
    const response = await api.get(`/orders/orderdetailsbyid/${orderId}/`);
    return normalizeOrder(response.data as Order);
  },

  getOrderLogs: async (orderId: number) => {
    const response = await api.get(`/orders/${orderId}/orderlogs/`);
    return response.data as OrderLog[];
  },

  // Batch lookup of SAP Sales Quotation status for the given (completed) orders.
  // Used to show the "Cancel Sales Quotation" button only while the quotation is
  // still open in SAP. Returns a map keyed by order id (as string).
  getQuotationStatus: async (orderIds: number[]) => {
    if (!orderIds.length) return {} as Record<string, QuotationStatus>;
    const response = await api.get("/orders/quotation-status/", {
      params: { order_ids: orderIds.join(",") },
    });
    return (response.data?.statuses ?? {}) as Record<string, QuotationStatus>;
  },

  // Cancel the SAP Sales Quotation for a completed order (and mirror it in OMS).
  cancelSalesQuotation: async (orderId: number) => {
    const response = await api.post(`/orders/${orderId}/cancel-quotation/`);
    return response.data as { success: boolean; message: string; doc_num?: number };
  },

  // Admin overview: all completed orders with their sales-quotation status.
  getQuotationOverview: async () => {
    const response = await api.get("/orders/quotation-overview/");
    return (response.data?.data ?? []) as QuotationOverviewItem[];
  },

  getOrderStockCheck: async () => {
    const response = await api.get("/orders/stock-check/");
    return response.data as OrderStockCheck[];
  },

  getOrdersStatus: async () => {
    const response = await api.get("/orders/status/");
    return response.data;
  },

  getStatusTrackingOrders: async (mode: "auditor" | "billing" | "rate_approver") => {
    const response = await api.get("/orders/status-tracking/", {
      params: { mode },
    });
    return Array.isArray(response.data) ? response.data.map(normalizeOrder) : response.data;
  },

  getBranches: async () => {
    const response = await api.get("/orders/branch/"
    );
    return response.data;
  },

  UpdateStatus: async (orderId: number, status: number, reason?: string) => {
    const response = await api.post(`/orders/${orderId}/update-status/`, {
      status,
      ...(reason ? { reason } : {}),
    });
    window.dispatchEvent(new Event("refreshNotifications"));
    return response.data as OrderStatusUpdateResponse;
  },

 createScheme: async (data: {
  scheme_name: string;
  item_code: string;
  state_code?: string;
}) => {
  const response = await api.post("/orders/create-scheme/", data, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

};
