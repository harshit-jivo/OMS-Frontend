import api from "./api";

/* ================= TYPES ================= */

export interface IrnResult {
  Irn?: string;
  AckNo?: string | number;
  AckDt?: string;
  SignedInvoice?: string;
  SignedQRCode?: string;
  Status?: string;
  EwbNo?: string | number;
  EwbDt?: string;
  EwbValidTill?: string;
  [key: string]: unknown;
}

export interface FromInvoicePreview {
  docentry: number;
  company_db?: string;
  doc_no?: string;
  invoice: Record<string, unknown>;
  valid: boolean;
  error_count: number;
  validation_errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface GenerateResponse {
  docentry?: number;
  company_db?: string;
  result?: IrnResult;
  record_id?: number;
  persistence_warning?: string;
  test_warning?: string;
  error?: string;
  errors?: unknown;
  validation_errors?: ValidationError[];
  invoice?: Record<string, unknown>;
}

export interface InvoiceListItem {
  docentry: number;
  docnum: number;
  cardname: string;
  docdate: string;
  doctotal: number;
  irn: string | null;
  irn_status: "GENERATED" | "FAILED" | "SKIPPED" | null;
  /** Where the IRN was found: OMS (Django), @UTL_MDEXTH (SAP add-on), or OMS_IRN_LOG. */
  irn_source: "OMS" | "@UTL_MDEXTH" | "OMS_IRN_LOG" | null;
  last_error: string | null;
}

export interface InvoiceListResponse {
  company_db: string;
  results: InvoiceListItem[];
}

/** A selectable SAP company DB — decides which company an IRN is generated
 *  against and which schema's OMS_IRN_LOG it is mirrored into. */
export interface CompanyChoice {
  label: string;        // OIL | BEVERAGE | MART
  company_db: string;   // JIVO_OIL_HANADB | JIVO_BEVERAGES_HANADB | JIVO_MART_HANADB
}

export interface CompanyListResponse {
  results: CompanyChoice[];
  default: string;
}

/**
 * A NIC identity: one legal entity = one PAN = its own NIC credentials.
 * Jivo Wellness (AACCJ4223F) and Jivo Mart (AAFCJ4102J) are separate, so
 * cancel / lookup / GSTIN-master calls must say which one they are acting as.
 */
export interface NicEntity {
  key: string;
  label: string;
  pan: string;
  gstins: string[];
  is_default: boolean;
}

export interface GenerationLog {
  id: number;
  docentry: number;
  company_db?: string | null;
  environment: string;
  trigger: string;
  attempt_no: number;
  outcome: "SUCCESS" | "FAILED" | "SKIPPED";
  doc_no?: string | null;
  irn?: string | null;
  ack_no?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  validation_errors?: ValidationError[] | null;
  duration_ms?: number | null;
  created_at: string;
}

export interface LogCompany {
  company_db: string;
  label: string;
  rows: number;
}

export interface GenerationLogsResponse {
  count: number;
  /** Size of the filtered set, not of this page — drives pagination. */
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  totals: { SUCCESS: number; FAILED: number; SKIPPED: number };
  /** Every configured company, including ones with zero rows. */
  companies: LogCompany[];
  results: GenerationLog[];
}

/* ================= SERVICE ================= */

export const einvoiceService = {
  /* --- config / auth --- */
  health: async (entity?: string, gstin?: string) =>
    (await api.get("einvoice/health/", { params: { entity, gstin } })).data,
  // The NIC identities (PANs) the UI can act as.
  listEntities: async () =>
    (await api.get<{ results: NicEntity[] }>("einvoice/entities/")).data,
  // Companies (SAP company DBs) an IRN can be generated against / mirrored into.
  listCompanies: async () =>
    (await api.get<CompanyListResponse>("einvoice/companies/")).data,
  token: async (entity?: string, gstin?: string) =>
    (await api.post("einvoice/token/", null, { params: { entity, gstin } })).data,
  heartbeat: async (entity?: string, gstin?: string) =>
    (await api.get("einvoice/heartbeat/", { params: { entity, gstin } })).data,

  /* --- IRN from a SAP invoice (by DocEntry or DocNum) --- */
  previewFromInvoice: async (
    identifier: number | string,
    companyDb?: string,
    idType: "docentry" | "docnum" = "docentry"
  ) => {
    const params: Record<string, string> = {};
    if (companyDb) params.company_db = companyDb;
    if (idType === "docnum") params.id_type = "docnum";
    return (await api.get<FromInvoicePreview>(`einvoice/irn/from-invoice/${identifier}/`, { params })).data;
  },
  generateFromInvoice: async (
    identifier: number | string,
    opts: { companyDb?: string; orderId?: number; source?: string; idType?: "docentry" | "docnum" } = {}
  ) => {
    const params: Record<string, string | number> = {};
    if (opts.companyDb) params.company_db = opts.companyDb;
    if (opts.orderId) params.order_id = opts.orderId;
    if (opts.source) params.source = opts.source;
    if (opts.idType === "docnum") params.id_type = "docnum";
    return (await api.post<GenerateResponse>(`einvoice/irn/from-invoice/${identifier}/`, {}, { params })).data;
  },

  /* --- IRN by raw payload --- */
  generate: async (invoice: Record<string, unknown>) =>
    (await api.post<GenerateResponse>("einvoice/irn/", invoice)).data,
  validate: async (invoice: Record<string, unknown>) =>
    (await api.post("einvoice/irn/validate/", invoice)).data,

  /* --- cancel --- */
  cancel: async (irn: string, reasonCode: string, remarks: string, entity?: string, gstin?: string) =>
    (await api.post("einvoice/irn/cancel/",
      { irn, reason_code: reasonCode, remarks, entity, gstin })).data,

  /* --- lookups --- */
  getByIrn: async (irn: string, entity?: string, gstin?: string) =>
    (await api.get(`einvoice/irn/${irn}/`, { params: { entity, gstin } })).data,
  getByDoc: async (doctype: string, docnum: string, docdate: string, entity?: string, gstin?: string) =>
    (await api.get("einvoice/irn/by-doc/", { params: { doctype, docnum, docdate, entity, gstin } })).data,
  getRejected: async (date: string, entity?: string, gstin?: string) =>
    (await api.get("einvoice/irn/rejected/", { params: { date, entity, gstin } })).data,

  /* --- GSTIN master --- */
  getGstin: async (gstin: string, entity?: string, asGstin?: string) =>
    (await api.get(`einvoice/gstin/${gstin}/`, { params: { entity, gstin: asGstin } })).data,
  syncGstin: async (gstin: string, entity?: string, asGstin?: string) =>
    (await api.get(`einvoice/gstin/${gstin}/sync/`, { params: { entity, gstin: asGstin } })).data,

  /* --- invoice browser (manual pick) --- */
  listInvoices: async (params: { companyDb?: string; search?: string; limit?: number } = {}) => {
    const q: Record<string, string | number> = {};
    if (params.companyDb) q.company_db = params.companyDb;
    if (params.search) q.search = params.search;
    if (params.limit) q.limit = params.limit;
    return (await api.get<InvoiceListResponse>("einvoice/invoices/", { params: q })).data;
  },

  /* --- auto-generation logs --- */
  getLogs: async (
    params: {
      outcome?: string;
      docentry?: string;
      trigger?: string;
      company_db?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) =>
    (await api.get<GenerationLogsResponse>("einvoice/logs/", { params })).data,
  retryGeneration: async (docentry: number | string, companyDb?: string) =>
    (await api.post("einvoice/logs/retry/", { docentry, company_db: companyDb })).data,

  /* --- QR --- */
  renderQr: async (data: string) =>
    (await api.post<{ data_uri: string }>("einvoice/qr/", { data })).data,
  // The stored-QR image endpoint is a plain view (no auth) — usable directly in <img src>.
  qrImageUrl: (irn: string) => `/api/einvoice/irn/${irn}/qr.png`,
};
