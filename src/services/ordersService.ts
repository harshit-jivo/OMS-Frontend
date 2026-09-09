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

// A row of the scheme_product catalogue, as returned by /orders/schemes/manage/.
// scheme_id is the only unique identifier — scheme_name is reused across states.
export interface SchemeRow {
  scheme_id: number;
  scheme_name: string;
  item_code: string | null;
  item_name: string | null;
  state?: number | null;
  state_code?: string | null;
  state_name?: string | null;
  is_active: boolean;
  product_id?: number | null;
  sal_factor2?: string | number | null;
  sal_pack_unit?: string | null;
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
  /** The giveaway item's NAME, resolved server-side. A STATE- or VENDOR-scoped
   *  scheme gives away items the party holds no assignment for, so the client's
   *  own catalogues cannot name them. */
  scheme_item_name?: string | null;
  scheme_qty?: number | string;
  qty_scheme?: number | string;

  // Scheme engine v2 (Backend/docs/scheme-architecture.md). `benefit_item_code`
  // is the snapshot SAP actually ships, so editing a scheme later cannot change
  // what an already-approved order sends.
  scheme_v2_id?: number;
  benefit_id?: number;
  benefit_item_code?: string | null;
  /** The giveaway as the scheme spelled it ("1 BOX"); `scheme_qty` is the same
   *  amount in pieces, which is the only unit SAP accepts. */
  benefit_uom?: string;
  benefit_qty?: number | string;
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
  /**
   * The paid product a mapped combo actually bills as.
   *
   * A combo pack ("A + B") is a wrapper around two real products. The order
   * keeps the COMBO's own code deliberately — it is what the customer bought
   * and what scheme triggers match on — while SAP is sent this one instead.
   * The approval screens show it so an auditor approves the code that ships.
   * Null for anything that is not a mapped combo.
   */
  combo_parent_item_code?: string | null;
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
  /** One warehouse for the whole order; blank uses the backend's default. */
  warehouse_code?: string;
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
  warehouse_code?: string;
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
  /**
   * The status CODE — "BILLING_REJECTED", "APPROVED", "REJECTED".
   *
   * Typed `number` until now, which was simply wrong: the backend sends
   * `serializers.CharField(source="status.code")` (orders/serializers.py:451).
   * Both readers already coerced it with `String(...)`, so nothing behaved
   * badly — but the type said every comparison against a code string was
   * comparing a number to a literal, i.e. dead code. The tracking page's
   * whole accepted/rejected vocabulary is built on those comparisons, and
   * anyone trusting the type would have deleted them.
   *
   * `status_display` is the human label ("Rejected by Auditor"); this is the
   * machine one. Neither is the numeric id — that is `status_id`.
   */
  status?: string;
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
  warehouse_code?: string;
  is_foc?: boolean;
  company?: string | number;
  remarks?: string;
  items: OrderItem[];
  items_count?: number;
  created_at: string;
  created_by: string | number;
  rejected_by?: string | null;
  rejection_reason?: string | null;
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

// Latest SAP Sales Order push result for a distributor order (SalesOrderLog).
export interface SalesOrderSapStatus {
  status: "STARTED" | "SUCCESS" | "FAILED";
  doc_entry: number | null;
  doc_num: number | null;
  error_message: string | null;
  completed_at: string | null;
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
  /** The giveaway ITEM — what ships free. Blank on legacy rows. */
  itemCode?: string;
  itemName?: string;
  /** e.g. "STATE DL" — how a v2 scheme was targeted. */
  scope?: string;
};

const toNumber = (value: string | number | null | undefined) =>
  typeof value === "number" ? value : Number(value || 0);

export const getOrderItemSchemes = (item: OrderItem): ItemSchemeDisplay[] => {
  const schemes = Array.isArray(item.schemes) ? item.schemes : [];

  if (schemes.length > 0) {
    return schemes.map((scheme) => ({
      name: scheme.scheme_name || scheme.scheme_item_code || "",
      qty: scheme.scheme_qty ?? scheme.qty_scheme ?? 0,
      // What is actually GIVEN AWAY, as opposed to the offer's name. The two
      // are different things and the approval table needs both: "BUY 1 GET 1
      // FREE" is the offer, "EXTRA LIGHT OLIVE 1 LTR" is the bottle.
      itemCode: scheme.scheme_item_code || scheme.benefit_item_code || "",
      itemName: scheme.scheme_item_name || "",
      scope: [scheme.scope_type, scheme.scope_value].filter(Boolean).join(" "),
    }));
  }

  return item.scheme_name
    ? [
        {
          name: item.scheme_name,
          qty: item.scheme_qty ?? item.qty_scheme ?? 0,
          itemCode: "",
          itemName: "",
          scope: "",
        },
      ]
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
  // `total_ltrs` is sent by the API but is not on `OrderItem` — it is a
  // computed field the backend adds, so the cast names it rather than opening
  // the whole row to `any`.
  const totalLtrs =
    (item as OrderItem & { total_ltrs?: number | string | null }).total_ltrs ??
    toNumber(item.ltrs) + toNumber(schemeQty);

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

/**
 * One outgoing order line, with every number actually a number.
 *
 * The wizard's inputs are text inputs, so `qty`, `boxes`, `tax_rate` and the
 * rest all arrive as strings; the backend's `to_float` would cope, but the
 * payload is also logged, diffed and replayed, and a payload of strings is a
 * payload nobody can compare.
 *
 * `createOrder` and `saveDraft` had a character-identical copy of this each.
 * They are one function now because they were never allowed to differ: both
 * post to `/orders/create/` and are parsed by the same code.
 */
const outgoingOrderItem = (item: OrderItem) => ({
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
  schemes: Array.isArray(item.schemes) ? item.schemes.map(outgoingScheme) : undefined,
  total_ltrs: item.total_ltrs,
});

/**
 * One scheme on an outgoing line — SPREAD, not rebuilt.
 *
 * This used to return a fresh `{scheme_id, scheme_qty}`, which silently
 * discarded every other key. That was fine for a legacy hand-picked scheme,
 * which has nothing else, and wrong for one the v2 engine resolved: the
 * backend qualifies a v2 entry on `scheme_v2_id` alone
 * (orders/services/order_items.py, `_extract_order_item_schemes`), so an entry
 * stripped of it has neither a scheme nor a scheme_v2_id and is skipped —
 * every engine-resolved giveaway placed through Add Sales was dropped on the
 * wire. The Mart flow never hit this because `createMartOrder` posts its
 * payload unmapped.
 *
 * `scheme_id` is only emitted when the source actually has one: `Number(
 * undefined)` is NaN, which serialises to `null` and reaches the backend as a
 * scheme lookup for nothing.
 */
const outgoingScheme = (scheme: OrderItemScheme) => ({
  ...scheme,
  ...(scheme.scheme_id === undefined || scheme.scheme_id === null
    ? {}
    : { scheme_id: Number(scheme.scheme_id) }),
  scheme_qty: Number(scheme.scheme_qty ?? scheme.qty_scheme ?? 0),
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
      items: formData.items.map(outgoingOrderItem),
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

  // Batch lookup of the latest SAP Sales Order result for distributor orders.
  // Returns a map keyed by order id (as string). Used by the Distributor Order
  // Tracking page to show DocEntry/DocNum (success) or the SAP error (failure).
  getSalesOrderSapStatus: async (orderIds: number[]) => {
    if (!orderIds.length) return {} as Record<string, SalesOrderSapStatus>;
    const response = await api.get("/orders/sales-order-status/", {
      params: { order_ids: orderIds.join(",") },
    });
    return (response.data?.statuses ?? {}) as Record<string, SalesOrderSapStatus>;
  },

  // Retry pushing an already-approved distributor order to SAP (mart approver /
  // admin only). Resolves on success; throws with the SAP error on failure.
  resendMartOrderToSap: async (orderId: number) => {
    const response = await api.post(`/orders/mart/${orderId}/resend-sap/`, {});
    return response.data as {
      message: string;
      order_number: string;
      status?: string;
      sap?: { doc_entry: number | null; doc_num: number | null };
    };
  },

  // Save a (possibly incomplete) order as a draft. Drafts skip the approval
  // flow and notifications; pass an existing orderId to update a draft in place.
  saveDraft: async (formData: Partial<CreateOrder>, orderId?: number) => {
    const items = Array.isArray(formData.items) ? formData.items : [];
    const payload = {
      ...formData,
      ...(orderId ? { order_id: orderId } : {}),
      is_draft: true,
      items: items.map(outgoingOrderItem),
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
},

  // Full scheme rows (incl. item_code + is_active) for the Add Scheme manage table.
  // Distinct from getSchemeProducts(), which feeds the Add Sales picker.
  getSchemesForManage: async (params?: {
    state_code?: string;
    search?: string;
    include_inactive?: boolean;
  }) => {
    const response = await api.get("/orders/schemes/manage/", {
      params: {
        ...(params?.state_code ? { state_code: params.state_code } : {}),
        ...(params?.search ? { search: params.search } : {}),
        ...(params?.include_inactive ? { include_inactive: "true" } : {}),
      },
    });
    return (response.data?.data ?? []) as SchemeRow[];
  },

  updateScheme: async (
    schemeId: number,
    data: {
      scheme_name?: string;
      item_code?: string;
      state_code?: string;
      is_active?: boolean;
    },
  ) => {
    const response = await api.patch(`/orders/schemes/${schemeId}/`, data, {
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  },

  // Deactivates by default (historical order lines keep pointing at the scheme).
  // hard=true only succeeds when no order line references it.
  deleteScheme: async (schemeId: number, hard = false) => {
    const response = await api.delete(`/orders/schemes/${schemeId}/`, {
      params: hard ? { hard: "true" } : undefined,
    });
    return response.data;
  },

};
