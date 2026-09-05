import api from "./api";

/**
 * The Legal module's compliance rules — the checks a label is judged against.
 *
 * These used to be hard-coded in the backend prompt, so changing one meant a
 * deploy. They are rows now (`legal.ComplianceRule`), and this is the client
 * for them: the Compliance Rules screen is the legal desk's own editor.
 */

export type ComplianceRule = {
  id: number;
  /** Stable identity. Reports cite it as `rule_id`, so it is set once. */
  code: string;
  name: string;
  /** The rule in plain English. Sent to the model verbatim. */
  rule_text: string;
  /** Literal wording OCR must find for the rule to be corroborated. */
  critical_tokens: string[];
  is_critical: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

/** Everything a rule needs on create; `code` is rejected on update. */
export type ComplianceRuleDraft = Omit<
  ComplianceRule,
  "id" | "created_at" | "updated_at"
>;

const RULES_URL = "/legal/rules/";
const HISTORY_URL = "/legal/history/";

/** One past check, as the history list returns it (no findings). */
export type LabelCheckSummary = {
  id: number;
  file_name: string;
  image_url: string;
  uploaded_at: string;
  checked_by_name: string;
  item_name: string;
  summary: { total: number; passed: number; failed: number; compliant: boolean };
};

export type HistoryPage = {
  results: LabelCheckSummary[];
  pagination: { page: number; page_size: number; total: number; total_pages: number };
};

export const legalService = {
  /**
   * Past checks, newest first.
   *
   * Paginated by default — unlike the app's older list endpoints, which
   * return whole tables. This one is new, so it has no client indexing into a
   * bare array to break.
   */
  async listChecks(params: {
    page?: number;
    item?: number | string;
    failedOnly?: boolean;
  } = {}): Promise<HistoryPage> {
    const response = await api.get(HISTORY_URL, {
      params: {
        ...(params.page ? { page: params.page } : { page: 1 }),
        ...(params.item ? { item: params.item } : {}),
        ...(params.failedOnly ? { failed_only: 1 } : {}),
      },
    });
    const body = response.data as { data?: HistoryPage };
    return (
      body?.data ?? {
        results: [],
        pagination: { page: 1, page_size: 25, total: 0, total_pages: 1 },
      }
    );
  },

  /** One past check, with its findings and highlight boxes. */
  async getCheck(id: number) {
    const response = await api.get(`${HISTORY_URL}${id}/`);
    return response.data;
  },

  async listRules(): Promise<ComplianceRule[]> {
    const response = await api.get<ComplianceRule[]>(RULES_URL);
    // The list endpoint is unpaginated, but a page of results would arrive as
    // `{results: []}` — tolerate both rather than render nothing if pagination
    // is ever switched on server-side.
    const data = response.data as ComplianceRule[] | { results?: ComplianceRule[] };
    if (Array.isArray(data)) return data;
    return data?.results ?? [];
  },

  async createRule(draft: ComplianceRuleDraft): Promise<ComplianceRule> {
    const response = await api.post<ComplianceRule>(RULES_URL, draft);
    return response.data;
  },

  /**
   * Partial update. `code` is deliberately absent from the accepted patch:
   * the serializer drops it server-side, and sending it would imply to a
   * reader here that renaming works.
   */
  async updateRule(
    id: number,
    patch: Partial<Omit<ComplianceRuleDraft, "code">>,
  ): Promise<ComplianceRule> {
    const response = await api.patch<ComplianceRule>(`${RULES_URL}${id}/`, patch);
    return response.data;
  },

  async deleteRule(id: number): Promise<void> {
    await api.delete(`${RULES_URL}${id}/`);
  },
};

/**
 * The message a failed call should show.
 *
 * DRF answers a validation error as `{field: ["reason"]}` and our own views as
 * `{message: "..."}`. Both are worth showing verbatim — "Rule with this code
 * already exists" tells the user what to do; "Request failed" does not.
 */
export const ruleErrorMessage = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    if (typeof body.message === "string" && body.message.trim()) return body.message;
    if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
    for (const [field, value] of Object.entries(body)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === "string" && first.trim()) return `${field}: ${first}`;
    }
  }
  return fallback;
};
