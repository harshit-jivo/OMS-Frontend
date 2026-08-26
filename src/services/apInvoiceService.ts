import api from "./api";

// ---------------------------------------------------------------------------
// AP (accounts payable) invoice entry — talks to /api/service-layer/ap/*
// (serviceLayer/ap_views.py). The SAP payload is built on the backend; the
// frontend only sends the friendly fields the user actually edits.
// ---------------------------------------------------------------------------

// Oil / Beverages / Mart are separate SAP company databases. The branch travels
// with every request and selects which company DB the GRPO is read from and the
// AP invoice is posted to.
export const AP_BRANCHES = [
  { value: "OIL", label: "Oil" },
  { value: "BEVERAGE", label: "Beverages" },
  { value: "MART", label: "Mart" },
] as const;
export type ApBranch = (typeof AP_BRANCHES)[number]["value"];

export interface GrpoSummary {
  doc_entry: number;
  doc_num: number;
  card_code: string;
  card_name: string | null;
  doc_date: string | null;
  doc_total: number | null;
  currency: string | null;
  num_at_card: string | null;
  attachment_entry: number | null;
}

// One GRPO line. item/warehouse/tax/uom are COPIED (read-only in the UI);
// quantity & unit_price are editable defaults (override only for short-billing).
export interface GrpoLine {
  base_line: number; // GRPO LineNum -> AP BaseLine (not a 0..n sequence)
  item_code: string | null;
  item_description: string | null;
  quantity: number | null;
  unit_price: number | null;
  warehouse_code: string | null;
  tax_code: string | null;
  uom: string | null;
  line_total: number | null;
}

export interface GrpoDetail {
  doc_entry: number;
  doc_num: number;
  card_code: string;
  card_name: string | null;
  grpo_num_at_card: string | null;
  doc_date: string | null;
  doc_total: number | null;
  vat_sum: number | null;
  currency: string | null;
  attachment_entry: number | null;
  lines: GrpoLine[];
}

export interface TdsCode {
  wt_code: string;
  wt_name: string | null;
  rate: number | null;
  section: string | null;
}

export interface VendorTds {
  vendor: {
    card_code?: string;
    card_name?: string;
    subject_to_wt?: boolean;
    default_wt_code?: string | null;
  };
  tds_codes: TdsCode[];
}

export interface ApInvoiceLineWrite {
  base_line: number;
  quantity?: number | string; // omit to keep GRPO value
  unit_price?: number | string;
}

export interface ApInvoiceWrite {
  grpo_entry: number;
  card_code?: string;
  num_at_card: string;
  doc_date?: string;
  due_date?: string;
  comments?: string;
  attachment_entry?: number | null;
  tds?: { liable: boolean; wt_code: string };
  lines: ApInvoiceLineWrite[];
}

export interface ApInvoiceResult {
  doc_entry: number;
  doc_num: number;
  doc_total: number | null;
  card_code: string | null;
  num_at_card: string | null;
}

const apInvoiceService = {
  async listOpenGrpos(
    branch: ApBranch,
    opts: { vendor?: string; search?: string } = {}
  ): Promise<GrpoSummary[]> {
    const { data } = await api.get("/service-layer/ap/open-grpos/", {
      params: { branch, ...opts },
    });
    return data.grpos as GrpoSummary[];
  },

  async getGrpo(
    branch: ApBranch,
    key: { doc_entry?: number; doc_num?: number | string }
  ): Promise<GrpoDetail> {
    const { data } = await api.get("/service-layer/ap/grpo/", {
      params: { branch, ...key },
    });
    return data.grpo as GrpoDetail;
  },

  async getVendorTds(branch: ApBranch, cardCode: string): Promise<VendorTds> {
    const { data } = await api.get("/service-layer/ap/vendor-tds/", {
      params: { branch, card_code: cardCode },
    });
    return { vendor: data.vendor, tds_codes: data.tds_codes };
  },

  async createApInvoice(
    branch: ApBranch,
    payload: ApInvoiceWrite
  ): Promise<ApInvoiceResult> {
    const { data } = await api.post("/service-layer/ap/invoice/", payload, {
      params: { branch },
    });
    return data as ApInvoiceResult;
  },
};

export default apInvoiceService;
