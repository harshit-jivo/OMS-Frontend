import api from "./api";

export interface Product  {
  id: number;
  item_code: string;
  item_name: string;
  brand?: string;
  category?: string;
  sal_pack_unit?: string;
  variety?: string;
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
}

export interface Party  {
  id: number;
  card_code: string;
  card_name: string;
  category?: string;
  state?: string;
  main_group?: string;
};

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

  getAddresses: async () => {
    const response = await api.get("/sap/addresses/");
    return response.data;
  },

  getParties: async () => {
    const response = await api.get("/sap/parties/");
    return response.data;
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
