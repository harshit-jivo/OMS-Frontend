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
