import api from "./api";

export interface Product  {
  id: number;
  item_code: string;
  item_name: string;
  brand?: string;
  category?: string;
  sal_pack_unit?: string;
  variety?: string;
  type?: string;
  staff_rate?: string | number;
  on_hand?: string | number | null;
  total_on_hand?: string | number | null;
  warehouse_code?: string;
  warehouse_name?: string;
  warehouseName?: string;
  warehouse_stock?: string | number | null;
  pending_required_qty?: string | number | null;
  pendingRequiredQty?: string | number | null;
  left_over_stock?: string | number | null;
};

/* ---------------------------------------------------------------- *
 * Inventory Report — warehouse-wise FG stock, pivoted by the backend.
 * `stock` / `totals` are keyed by warehouse code; a missing key means the
 * item holds nothing in that warehouse (the API drops zero rows).
 * ---------------------------------------------------------------- */

export interface InventoryWarehouse {
  code: string;
  name: string;
}

export interface InventoryItem {
  item_code: string;
  item_name: string;
  sku: string;
  sub_group: string;
  variety: string;
  brand: string;
  stock: Record<string, number>;
  total: number;
}

export interface InventoryGroup {
  sub_group: string;
  items: InventoryItem[];
  totals: Record<string, number>;
  total: number;
}

export interface InventoryReport {
  branch: string;
  warehouses: InventoryWarehouse[];
  groups: InventoryGroup[];
  totals: Record<string, number>;
  grand_total: number;
  item_count: number;
}

/* ---------------------------------------------------------------- *
 * Sales Order vs AR Invoice — open orders, their lines, and the invoices
 * raised against them. Read wholly from SAP: nothing here is entered or
 * maintained by hand. `qty_pcs` is the PENDING quantity (SAP's OpenQty)
 * and the litre/box figures are derived from it.
 *
 * Every line of an open order is returned, including ones already billed
 * in full (qty_pcs === 0), so ordered − invoiced = pending reconciles at
 * both line and order level.
 * ---------------------------------------------------------------- */

export interface PendingDispatchRow {
  order_date: string | null;
  delivery_date: string | null;
  dispatch_from: string;
  so_name: string;
  card_code: string;
  party_name: string;
  location: string;
  chain: string;
  item_code: string;
  item_name: string;
  sku: string;
  qty_ordered: number;
  qty_invoiced: number;
  qty_pcs: number;
  total_ltr: number;
  qty_boxes: number;
  sales_order: number;
  so_doc_entry: number;
  line_num: number;
  /** Invoice number(s) billing THIS line. */
  invoice: string;
  /** Every invoice raised against the sales order, whichever line it billed. */
  order_invoices: string;
  case_pack: number;
  per_ltr: number;
  box_ltr: number;
  brand: string;
  oil_category: string;
  category: string;
  case_pack_type: string;
  variety: string;
  warehouse_code: string;
  line_total: number;
  line_status: string;
  status: "PENDING" | "PARTLY INVOICED" | "INVOICED";
}

/** One AR invoice raised against a sales order — a node of SAP's doc flow. */
export interface PendingOrderInvoice {
  invoice_num: number;
  invoice_entry: number;
  invoice_date: string | null;
  invoice_status: string;
  invoice_total: number;
  /** Quantity and value drawn from THIS order, not the invoice's own total. */
  qty: number;
  amount: number;
  line_count: number;
}

export interface PendingOrder {
  so_doc_entry: number;
  sales_order: number;
  order_date: string | null;
  delivery_date: string | null;
  card_code: string;
  party_name: string;
  so_name: string;
  location: string;
  chain: string;
  dispatch_from: string;
  lines: PendingDispatchRow[];
  invoices: PendingOrderInvoice[];
  qty_ordered: number;
  qty_invoiced: number;
  qty_pending: number;
  ltr_pending: number;
  boxes_pending: number;
  value_pending: number;
  invoiced_value: number;
  invoiced_pct: number;
  line_count: number;
  pending_line_count: number;
  invoice_count: number;
  status: "NOT INVOICED" | "PARTLY INVOICED";
}

export interface PendingDispatchResponse {
  branch: string;
  order_count: number;
  line_count: number;
  invoice_count: number;
  orders: PendingOrder[];
}

export interface Address {
  id: number;
  card_code: string;
  address_name: string;
  address_type: string;
  full_address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  gst_number?: string;
  country?: string;
  /** SAP address category (e.g. plant / depot); groups a party's addresses. */
  category?: string;
  synced_at?: string;
}

export interface Party  {
  id: number;
  card_code: string;
  card_name: string;
  open_sales_order_count?: number;
  address?: string;
  category?: string;
  state?: string;
  main_group?: string;
  chain?: string;
  country?: string;
  card_type?: string;
  synced_at?: string;
};

export interface SapSalesOrderLine {
  LineNum: number;
  ItemCode: string;
  Dscription: string;
  Quantity: number;
  OpenQty: number;
  Price: number;
  PriceBefDi: number;
  DiscPrcnt: number;
  LineTotal: number;
  VatPrcnt: number;
  VatGroup: string | null;
  WhsCode: string;
  TaxCode: string;
  ShipDate: string;
  AcctCode: string;
  Project: string;
  OcrCode: string;
  LineStatus: string;
}

export interface SapSalesOrder {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocDueDate: string;
  CardCode: string;
  CardName: string;
  NumAtCard: string | null;
  DocStatus: string;
  DocTotal: number;
  VatSum: number;
  DiscSum: number;
  Comments: string | null;
  SlpCode: number;
  lines: SapSalesOrderLine[];
}

export interface OpenPartyResponse {
  CardCode: string;
  CardName: string;
  Num_of_Open_SalesOrder: number;
}

export interface Branch {
  id: number;
  bpl_id: number;
  bpl_name: string;
  is_active: boolean;
  updated_at?: string;
}

export interface Log {
  id: number;
  sync_type: string;
  status: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  triggered_by: string;
}

export interface QuotationLog {
  order_id: string;
  sap_doc_num: string;
  sap_doc_entry?: number | null;
  created_at?: string | null;
}

export const sapService = {

  getProducts: async () => {
    const response = await api.get("/sap/products/");
    return response.data;
  },

  getProductVarieties: async (category?: string) => {
    const response = await api.get("/sap/product-varieties/", {
      params: category ? { category } : undefined,
    });
    return response.data as { category?: string; count?: number; varieties?: string[]; sub_groups?: string[] };
  },

  getProductStock: async () => {
    const response = await api.get("/hana/product-stock/");
    return response.data;
  },

  getInventoryReport: async (branch: string, warehouses?: string[]) => {
    const response = await api.get("/hana/inventory-report/", {
      params: {
        branch,
        ...(warehouses?.length ? { warehouses: warehouses.join(",") } : {}),
      },
    });
    return response.data as InventoryReport;
  },

  getPendingDispatch: async (
    branch: string,
    range?: { from?: string; to?: string },
  ) => {
    const response = await api.get("/hana/pending-dispatch/", {
      params: {
        branch,
        ...(range?.from ? { from_date: range.from } : {}),
        ...(range?.to ? { to_date: range.to } : {}),
      },
    });
    return response.data as PendingDispatchResponse;
  },

  getAddresses: async () => {
    const response = await api.get("/sap/addresses/");
    return response.data;
  },

  getParties: async () => {
    const response = await api.get("/sap/parties/");
    return response.data;
  },

  getPartiesByCategory: async (category: string) => {
    const response = await api.get("/sap/parties/category/", {
      params: { category },
    });
    return (response.data?.data || []) as Party[];
  },

  getOpenParties: async () => {
    const response = await api.get("/hana/open-parties/");
    const data = Array.isArray(response.data) ? response.data : [];

    return data.map((party: OpenPartyResponse, index: number) => ({
      id: index,
      card_code: party.CardCode,
      card_name: party.CardName,
      open_sales_order_count: Number(party.Num_of_Open_SalesOrder || 0),
    })) as Party[];
  },

  getOpenSalesOrders: async (cardCode: string) => {
    const response = await api.get("/hana/so/", {
      params: { card_code: cardCode },
    });
    return (Array.isArray(response.data) ? response.data : []) as SapSalesOrder[];
  },

  getOpenSalesOrdersByProduct: async (itemCode: string) => {
    const response = await api.get("/hana/product-so/", {
      params: { item_code: itemCode },
    });
    return (Array.isArray(response.data) ? response.data : []) as SapSalesOrder[];
  },

  getBranches: async () => {
    const response = await api.get("/sap/branches/");
    return response.data;
  },

  getLogs: async () => {
    const response = await api.get("/sap/logs/");
    return response.data;
  },

  getQuotationLog: async (orderId: number) => {
    const response = await api.get(`/sap/quotation-log/${orderId}/`);
    return response.data?.data as QuotationLog;
  },

   syncData: async (endpoint: string) => {

    const response = await api.post(`/sap/sync/${endpoint}/`);

    return response.data;
  },

  assignParties: async (userId: number, cardCodes: string[]) => {
    const response = await api.post(`/auth/assign-parties/`, {
      user_id: userId,
      card_codes: cardCodes,
    });
    return response.data;
  },

  getUserParties: async (userId: number) => {
    const response = await api.get(`/auth/users/${userId}/parties/`);
    return response.data;
  },

  removeParty: async (userId: number, cardCode: string) => {
    const response = await api.post(`/auth/remove-party/`, {
      user_id: userId,
      card_code: cardCode,
    });
    return response.data;
  },



};
