import api from "./api";
import type { ValidationError } from "./einvoiceService";

/* ================= TYPES ================= */

export interface EwbResult {
  EwbNo?: string | number;
  ewayBillNo?: string | number;
  EwbDt?: string;
  ewayBillDate?: string;
  EwbValidTill?: string;
  validUpto?: string;
  [key: string]: unknown;
}

export interface EwbFromInvoicePreview {
  docentry: number;
  company_db?: string | null;
  mode: "ewb_by_irn" | "genewaybill";
  irn: string | null;
  payload: Record<string, unknown>;
  valid: boolean;
  error_count: number;
  validation_errors: ValidationError[];
}

export interface EwbGenerateResponse {
  docentry?: number;
  mode?: string;
  result?: EwbResult;
  record_id?: number;
  persistence_warning?: string;
  error?: string;
  errors?: unknown;
  validation_errors?: ValidationError[];
  payload?: Record<string, unknown>;
}

export interface TransportOverrides {
  transMode?: string;
  transDistance?: number | string;
  vehicleNo?: string;
  vehicleType?: string;
  transporterId?: string;
  transporterName?: string;
  transDocNo?: string;
  transDocDate?: string;
}

/* ================= SERVICE ================= */

export const ewaybillService = {
  token: async () => (await api.post("ewaybill/token/")).data,

  /* --- EWB from a SAP invoice --- */
  previewFromInvoice: async (
    docentry: number | string,
    opts: { companyDb?: string; mode?: string } = {}
  ) => {
    const params: Record<string, string> = {};
    if (opts.companyDb) params.company_db = opts.companyDb;
    if (opts.mode) params.mode = opts.mode;
    return (await api.get<EwbFromInvoicePreview>(`ewaybill/from-invoice/${docentry}/`, { params })).data;
  },
  generateFromInvoice: async (
    docentry: number | string,
    body: { transport?: TransportOverrides; expShip?: Record<string, unknown> },
    opts: { companyDb?: string; mode?: string; orderId?: number } = {}
  ) => {
    const params: Record<string, string | number> = {};
    if (opts.companyDb) params.company_db = opts.companyDb;
    if (opts.mode) params.mode = opts.mode;
    if (opts.orderId) params.order_id = opts.orderId;
    return (await api.post<EwbGenerateResponse>(`ewaybill/from-invoice/${docentry}/`, body, { params })).data;
  },

  /* --- standalone / raw --- */
  generate: async (payload: Record<string, unknown>) =>
    (await api.post("ewaybill/generate/", payload)).data,

  /* --- manage --- */
  cancel: async (ewbNo: string | number, reasonCode: number, remarks: string) =>
    (await api.post("ewaybill/cancel/", { ewbNo, reason_code: reasonCode, remarks })).data,
  close: async (ewbNo: string | number, closureDate: string, remarks: string) =>
    (await api.post("ewaybill/close/", { ewbNo, closureDate, remarks })).data,
  reject: async (ewbNo: string | number) =>
    (await api.post("ewaybill/reject/", { ewbNo })).data,
  updatePartB: async (payload: Record<string, unknown>) =>
    (await api.post("ewaybill/update-part-b/", payload)).data,
  extendValidity: async (payload: Record<string, unknown>) =>
    (await api.post("ewaybill/extend-validity/", payload)).data,
  updateTransporter: async (ewbNo: string | number, transporterId: string) =>
    (await api.post("ewaybill/update-transporter/", { ewbNo, transporterId })).data,

  /* --- lookups --- */
  getByNumber: async (ewbNo: string | number) => (await api.get(`ewaybill/${ewbNo}/`)).data,
  getByIrn: async (irn: string) => (await api.get(`einvoice/ewb/${irn}/`)).data,
  gstinDetails: async (gstin: string) => (await api.get(`ewaybill/gstin/${gstin}/`)).data,
  transporterDetails: async (transId: string) => (await api.get(`ewaybill/transporter/${transId}/`)).data,
};
