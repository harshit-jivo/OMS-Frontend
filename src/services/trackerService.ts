import api from "./api";

// ---------------------------------------------------------------------------
// Types (mirror the DRF serializers under /api/tracker/)
// ---------------------------------------------------------------------------
export interface Lookup {
  id: number;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface GstRate {
  id: number;
  label: string;
  rate: string;
  is_active: boolean;
  sort_order: number;
}

export interface Stage {
  id: number;
  code: string;
  name: string;
  order: number;
  threshold_days: number;
  status_choices: string[];
  requires_status: boolean;
  can_return: boolean;
  is_terminal: boolean;
  is_active: boolean;
}

export interface Lookups {
  categories: Lookup[];
  units: Lookup[];
  branches: Lookup[];
  modes: Lookup[];
  gst_types: Lookup[];
  gst_rates: GstRate[];
  stages: Stage[];
}

export interface StageEvent {
  id: number;
  stage: number;
  stage_name: string;
  stage_code: string;
  event_type: "RECEIVE" | "ADVANCE" | "RETURN";
  stage_status: string;
  receiving_note: "" | "ON_TIME" | "LATE";
  remarks: string;
  acted_by: number | null;
  acted_by_name: string | null;
  entered_at: string;
  exited_at: string | null;
  days_spent: string | null;
}

export interface PaymentDetail {
  discount_amount: string;
  tds_amount: string;
  paid_amount: string;
  open_balance: string;
  status: "OPEN" | "PAID";
  updated_at: string;
}

export interface Invoice {
  id: number;
  invoice_date: string;
  party_name: string;
  invoice_number: string;
  taxable_value: string;
  gst_type: number;
  gst_type_name: string;
  gst_rate: number;
  gst_rate_label: string;
  invoice_value: string;
  category: number;
  category_name: string;
  unit: number;
  unit_name: string;
  branch: number;
  branch_name: string;
  mode: number;
  mode_name: string;
  current_stage: number;
  current_stage_code: string;
  current_stage_name: string;
  status: "IN_PROGRESS" | "COMPLETED";
  current_stage_entered_at: string;
  is_locked: boolean;
  days_at_stage: string;
  is_overdue: boolean;
  editable: boolean;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  events?: StageEvent[];
  payment?: PaymentDetail | null;
  // Present in the my-queue payload:
  arrived_via_return?: boolean;
  return_reason?: string;
  returned_from?: string;
  returned_by?: string | null;
  returned_at?: string;
  // Present in the stage-advanced payload:
  advanced_at?: string;
}

export interface InvoiceWrite {
  invoice_date: string;
  party_name: string;
  invoice_number: string;
  taxable_value: string;
  gst_type: number;
  gst_rate: number;
  invoice_value: string;
  category: number;
  unit: number;
  branch: number;
  mode: number;
}

export interface QueueStage {
  code: string;
  name: string;
  order: number;
  count: number;
}

export interface MyQueue {
  stages: QueueStage[];
  invoices: Invoice[];
}

export interface BulkResult {
  processed: number[];
  errors: { id: number; error: string }[];
  processed_count: number;
}

export interface InvoiceFilters {
  party?: string;
  invoice_number?: string;
  category?: number;
  branch?: number;
  unit?: number;
  status?: string;
  stage?: string;
  overdue?: boolean;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export const trackerService = {
  async getLookups(): Promise<Lookups> {
    const { data } = await api.get("/tracker/lookups/");
    return data;
  },

  async listInvoices(filters: InvoiceFilters = {}): Promise<Invoice[]> {
    const params: Record<string, string> = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== "" && v !== false) params[k] = String(v);
    });
    const { data } = await api.get("/tracker/invoices/", { params });
    return data;
  },

  async getInvoice(id: number): Promise<Invoice> {
    const { data } = await api.get(`/tracker/invoices/${id}/`);
    return data;
  },

  async createInvoice(payload: InvoiceWrite): Promise<Invoice> {
    const { data } = await api.post("/tracker/invoices/", payload);
    return data;
  },

  async updateInvoice(id: number, payload: Partial<InvoiceWrite>): Promise<Invoice> {
    const { data } = await api.patch(`/tracker/invoices/${id}/`, payload);
    return data;
  },

  async myQueue(): Promise<MyQueue> {
    const { data } = await api.get("/tracker/my-queue/");
    return data;
  },

  async getStageAdvanced(stageCode: string): Promise<Invoice[]> {
    const { data } = await api.get("/tracker/stage-advanced/", {
      params: { stage: stageCode },
    });
    return data;
  },

  async bulkAction(payload: {
    ids: number[];
    action?: "ADVANCE" | "RETURN";
    stage_status?: string;
    remarks?: string;
  }): Promise<BulkResult> {
    const { data } = await api.post("/tracker/actions/bulk/", payload);
    return data;
  },

  async updatePayment(id: number, payload: Partial<PaymentDetail>): Promise<Invoice> {
    const { data } = await api.patch(`/tracker/invoices/${id}/payment/`, payload);
    return data;
  },

  // --- Admin / config ---
  async adminGetStages(): Promise<Stage[]> {
    const { data } = await api.get("/tracker/admin/stages/");
    return data;
  },
  async adminCreateStage(payload: Partial<Stage>): Promise<Stage> {
    const { data } = await api.post("/tracker/admin/stages/", payload);
    return data;
  },
  async adminUpdateStage(id: number, payload: Partial<Stage>): Promise<Stage> {
    const { data } = await api.patch(`/tracker/admin/stages/${id}/`, payload);
    return data;
  },
  async adminDeleteStage(id: number): Promise<void> {
    await api.delete(`/tracker/admin/stages/${id}/`);
  },

  async adminGetLookup(kind: LookupKind): Promise<any[]> {
    const { data } = await api.get(`/tracker/admin/lookups/${kind}/`);
    return data;
  },
  async adminCreateLookup(kind: LookupKind, payload: any): Promise<any> {
    const { data } = await api.post(`/tracker/admin/lookups/${kind}/`, payload);
    return data;
  },
  async adminUpdateLookup(kind: LookupKind, id: number, payload: any): Promise<any> {
    const { data } = await api.patch(`/tracker/admin/lookups/${kind}/${id}/`, payload);
    return data;
  },
  async adminDeleteLookup(kind: LookupKind, id: number): Promise<void> {
    await api.delete(`/tracker/admin/lookups/${kind}/${id}/`);
  },

  async adminGetUsers(search = ""): Promise<AdminUser[]> {
    const { data } = await api.get("/tracker/admin/users/", {
      params: search ? { search } : {},
    });
    return data;
  },
  async adminSetUserStages(userId: number, stageIds: number[]): Promise<void> {
    await api.put(`/tracker/admin/users/${userId}/stages/`, { stage_ids: stageIds });
  },

  async getAlerts(): Promise<StuckAlert[]> {
    const { data } = await api.get("/tracker/alerts/");
    return data;
  },

  async getReports(filters: ReportFilters = {}): Promise<ReportData> {
    const params: Record<string, string> = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== "" ) params[k] = String(v);
    });
    const { data } = await api.get("/tracker/reports/", { params });
    return data;
  },
};

export interface ReportFilters {
  from?: string;
  to?: string;
  branch?: number;
  unit?: number;
  category?: number;
}

export interface StageCount {
  stage_code: string;
  stage_name: string;
  order: number;
  count: number;
  overdue: number;
}
export interface StageAvg {
  stage_code: string;
  stage_name: string;
  order: number;
  avg_days: number;
  visits: number;
}
export interface BottleneckRow {
  key: string;
  avg_days: number;
  visits: number;
}
export interface ReportData {
  summary: {
    in_progress: number;
    completed: number;
    overdue: number;
    avg_cycle_days: number;
  };
  pending_by_stage: StageCount[];
  avg_days_per_stage: StageAvg[];
  bottleneck_by_person: BottleneckRow[];
  bottleneck_by_vendor: BottleneckRow[];
  bottleneck_by_category: BottleneckRow[];
  ageing: { bucket: string; count: number }[];
}

export type LookupKind =
  | "categories"
  | "units"
  | "branches"
  | "modes"
  | "gst_types"
  | "gst_rates";

export interface AdminUser {
  id: number;
  username: string;
  name: string;
  role: string | null;
  stage_ids: number[];
}

export interface StuckAlert {
  id: number;
  invoice: number;
  invoice_number: string;
  party_name: string;
  invoice_value: string;
  stage: number;
  stage_name: string;
  stage_code: string;
  stage_entered_at: string;
  days_stuck: string;
  threshold_days: number;
  over_by: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default trackerService;
