/**
 * workflowService — API layer for the generic Workflow Engine configuration.
 *
 * Uses the shared axios instance, so auth, refresh-on-401 and the
 * version/device headers all come for free.
 *
 * Every workflow endpoint answers with the project envelope
 * `{ success, message, data }` (OMS-Backend core/responses.py plus the
 * EnvelopeMixin on the generic views). `unwrap` reads `data` out of it and
 * tolerates a bare payload, so one helper covers both without adding a second
 * transformation layer.
 */
import api from "./api";

/* ------------------------------------------------------------------ *
 * Types — mirror OMS-Backend/workflow/serializers.py
 * ------------------------------------------------------------------ */

/** Company codes, from OMS-Backend core/companies.py. */
export type CompanyCode = "OIL" | "BEVERAGES" | "MART";
export const COMPANY_CODES: CompanyCode[] = ["OIL", "BEVERAGES", "MART"];

/**
 * Everything the `company` column accepts — one value, chosen directly.
 *
 * `"ALL"` is a real stored value, not a NULL plus a second `company_scope`
 * flag. That pair is gone: it let the same fact be written two ways and made
 * every reader join two columns back together before it could answer "which
 * company?". Neither value outranks the other — if an `ALL` row and an `OIL`
 * row both match one document, the engine raises AmbiguousWorkflowSelection.
 */
export type CompanyValue = "ALL" | CompanyCode;
export const COMPANY_VALUES: CompanyValue[] = ["ALL", ...COMPANY_CODES];

/**
 * A registry entry: which business modules may have workflows configured.
 *
 * IDENTITY ONLY. The registry deliberately does not describe the module's
 * implementation — no business table, key column, flow table or flow model,
 * and no `is_active`. Those described the MODULE while living in the ENGINE's
 * table, a second hand-maintained copy of what the module's own migrations
 * already state. The module owns them now; the engine only needs to know the
 * module exists.
 *
 * Modules register themselves at deploy time, so this type is read-only here.
 */
export interface WorkflowModule {
  id: number;
  code: string;
  name: string;
  /** How much configuration hangs off this registration. Computed server-side. */
  workflow_count: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * A stage — the stable workflow step, and its CURRENT responsible user.
 *
 * `user` is the configured actor. Changing it is the whole of "change this
 * stage's user": the stage keeps its identity, and business entries already
 * waiting at it resolve to the new person with nothing moved or rewritten.
 * There is deliberately no reassign-pending-entries operation.
 *
 * `effective_user` is who may act TODAY, after temporary replacements. It is
 * reported alongside `user` rather than instead of it, so the UI can explain
 * why somebody other than the configured user currently holds the work.
 *
 * The module/workflow/company fields are read-only projections of joins,
 * present because the By User view lists stages from many workflows at once
 * and has to say which is which.
 */
export interface WorkflowStage {
  id: number;
  workflow: number;
  workflow_code?: string;
  workflow_name?: string;
  company?: CompanyValue;
  module_id?: number;
  module_code?: string;
  module_name?: string;
  name: string;
  /** Execution order only — never a selection priority. */
  sequence: number;
  /** The CONFIGURED user. */
  user: number;
  user_username?: string;
  /** Who may act today, after replacements. */
  effective_user?: number;
  effective_user_username?: string;
  has_active_replacement?: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowQuery {
  id: number;
  workflow: number;
  name: string;
  query_text: string;
  /** "ALL" | "OIL" | "BEVERAGES" | "MART" — stored exactly as chosen. */
  company: CompanyValue;
  /** NULL means the query never passed validation, so it is never executed. */
  validated_at: string | null;
  validation_error: string;
  validation_problems?: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Workflow {
  id: number;
  module: number;
  module_code?: string;
  code: string;
  name: string;
  company: CompanyValue;
  stages?: WorkflowStage[];
  queries?: WorkflowQuery[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowUserReplacement {
  id: number;
  old_user: number;
  old_username?: string;
  new_user: number;
  new_username?: string;
  reason: string;
  /** Inclusive. */
  start_date: string;
  /** Inclusive. */
  end_date: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/* ------------------------------------------------------------------ *
 * Envelope + error helpers
 * ------------------------------------------------------------------ */

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "success" in (payload as object)) {
    return ((payload as { data: T }).data ?? null) as T;
  }
  return payload as T;
}

/**
 * A human-readable message from any backend error shape.
 *
 * The workflow API reports engine failures as `errors.code` (for example
 * AmbiguousWorkflowSelection) alongside a safe `message`, while DRF validation
 * errors arrive as `{field: [msg, ...]}`. Both are flattened here so pages show
 * one sentence instead of parsing shapes themselves.
 *
 * Never surfaces a stack trace or SQL — the backend already sanitises those.
 */
export function workflowError(err: unknown): string {
  const resp = (err as { response?: { status?: number; data?: unknown } })?.response;
  const status = resp?.status;
  const data = resp?.data as Record<string, unknown> | undefined;

  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) {
    return (
      (data?.message as string) ||
      "You do not have permission to manage workflow configuration."
    );
  }

  if (data && typeof data === "object") {
    // Field errors first — they say exactly what to fix.
    const fieldMessages: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (["success", "message", "detail", "error", "data", "errors"].includes(key)) continue;
      if (Array.isArray(value)) fieldMessages.push(value.join(" "));
      else if (typeof value === "string") fieldMessages.push(value);
    }
    if (fieldMessages.length) return fieldMessages.join("\n");

    const msg = (data.message || data.detail || data.error) as string | undefined;
    const code = (data.errors as { code?: string } | undefined)?.code;
    if (msg) return code ? msg + " (" + code + ")" : msg;
  }

  if (status === 409) return "Conflict — the configuration is not in a usable state.";
  if (status && status >= 500) {
    return "The server could not complete the request. The incident has been logged.";
  }
  return "Something went wrong. Please try again.";
}

/** True when the backend rejected a replacement for overlapping dates. */
export function isOverlapError(err: unknown): boolean {
  const data = (err as { response?: { data?: { errors?: { code?: string } } } })?.response?.data;
  return data?.errors?.code === "ReplacementOverlap";
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

const BASE = "/workflow";

export const workflowService = {
  // --- Modules ------------------------------------------------------
  /**
   * The registry. Read-only on purpose.
   *
   * A module registers ITSELF at deploy time (its AppConfig calls the
   * backend's `register_module`), so there is no create/update/deactivate
   * here. Offering them would imply an administrator is expected to define
   * modules by hand, which is exactly the impression this refactor removes.
   *
   * Every registered module is returned — a module has no active flag. To stop
   * routing for one, deactivate its WORKFLOWS.
   */
  listModules: async (): Promise<WorkflowModule[]> => {
    const res = await api.get(BASE + "/modules/");
    return unwrap<WorkflowModule[]>(res.data) || [];
  },

  // --- Workflows ----------------------------------------------------
  /** `moduleCode` filters server-side (?module=CODE). */
  listWorkflows: async (
    moduleCode?: string,
    opts: { company?: string; includeInactive?: boolean } = {},
  ): Promise<Workflow[]> => {
    const params: Record<string, string | number> = {};
    if (moduleCode) params.module = moduleCode;
    // "" means every company — an ALL-scope workflow applies to all of them,
    // so the server includes those for any specific company too.
    if (opts.company) params.company = opts.company;
    if (opts.includeInactive) params.include_inactive = 1;
    const res = await api.get(BASE + "/workflows/", { params });
    return unwrap<Workflow[]>(res.data) || [];
  },
  getWorkflow: async (id: number): Promise<Workflow> => {
    const res = await api.get(BASE + "/workflows/" + id + "/");
    return unwrap<Workflow>(res.data);
  },
  createWorkflow: async (body: Partial<Workflow>): Promise<Workflow> => {
    const res = await api.post(BASE + "/workflows/", body);
    return unwrap<Workflow>(res.data);
  },
  updateWorkflow: async (id: number, body: Partial<Workflow>): Promise<Workflow> => {
    const res = await api.patch(BASE + "/workflows/" + id + "/", body);
    return unwrap<Workflow>(res.data);
  },
  setWorkflowActive: async (id: number, isActive: boolean): Promise<Workflow> => {
    const res = await api.patch(BASE + "/workflows/" + id + "/", { is_active: isActive });
    return unwrap<Workflow>(res.data);
  },

  // --- Queries ------------------------------------------------------
  listQueries: async (
    workflowId?: number,
    includeInactive = false,
  ): Promise<WorkflowQuery[]> => {
    const params: Record<string, string | number> = {};
    if (workflowId) params.workflow = workflowId;
    if (includeInactive) params.include_inactive = 1;
    const res = await api.get(BASE + "/queries/", { params });
    return unwrap<WorkflowQuery[]>(res.data) || [];
  },
  createQuery: async (body: Partial<WorkflowQuery>): Promise<WorkflowQuery> => {
    const res = await api.post(BASE + "/queries/", body);
    return unwrap<WorkflowQuery>(res.data);
  },
  updateQuery: async (id: number, body: Partial<WorkflowQuery>): Promise<WorkflowQuery> => {
    const res = await api.patch(BASE + "/queries/" + id + "/", body);
    return unwrap<WorkflowQuery>(res.data);
  },
  setQueryActive: async (id: number, isActive: boolean): Promise<WorkflowQuery> => {
    const res = await api.patch(BASE + "/queries/" + id + "/", { is_active: isActive });
    return unwrap<WorkflowQuery>(res.data);
  },
  /** Re-runs backend validation for a stored query. The backend is authoritative. */
  revalidateQuery: async (
    id: number,
  ): Promise<{ query: WorkflowQuery; problems: string[]; isolation_mode: string }> => {
    const res = await api.post(BASE + "/queries/" + id + "/revalidate/");
    return unwrap(res.data);
  },

  // --- Stages -------------------------------------------------------
  listStages: async (
    workflowId?: number,
    includeInactive = false,
  ): Promise<WorkflowStage[]> => {
    const params: Record<string, string | number> = {};
    if (workflowId) params.workflow = workflowId;
    if (includeInactive) params.include_inactive = 1;
    const res = await api.get(BASE + "/stages/", { params });
    return unwrap<WorkflowStage[]>(res.data) || [];
  },
  /**
   * Every stage a user is the CONFIGURED actor for, across every module.
   *
   * Derived server-side by joining stages → workflows → modules. There is no
   * assignment table: `workflow_stages.user_id` already is the assignment, and
   * storing a second copy is what would make it possible for the two to
   * disagree.
   */
  listStagesForUser: async (
    userId: number,
    includeInactive = false,
  ): Promise<WorkflowStage[]> => {
    const params: Record<string, string | number> = { user: userId };
    if (includeInactive) params.include_inactive = 1;
    const res = await api.get(BASE + "/stages/", { params });
    return unwrap<WorkflowStage[]>(res.data) || [];
  },
  createStage: async (body: Partial<WorkflowStage>): Promise<WorkflowStage> => {
    const res = await api.post(BASE + "/stages/", body);
    return unwrap<WorkflowStage>(res.data);
  },
  /**
   * The ONE way a stage's user changes: a PATCH of that stage.
   *
   * There is deliberately no bulk reassignment method. A single call that
   * rewrote every stage a person owns, across every module, is an
   * organisation-wide change with no natural review step and no undo — so the
   * edit stays the same size as the row you are looking at.
   */
  updateStage: async (id: number, body: Partial<WorkflowStage>): Promise<WorkflowStage> => {
    const res = await api.patch(BASE + "/stages/" + id + "/", body);
    return unwrap<WorkflowStage>(res.data);
  },
  setStageActive: async (id: number, isActive: boolean): Promise<WorkflowStage> => {
    const res = await api.patch(BASE + "/stages/" + id + "/", { is_active: isActive });
    return unwrap<WorkflowStage>(res.data);
  },

  // --- User replacements --------------------------------------------
  listReplacements: async (
    includeInactive = false,
  ): Promise<WorkflowUserReplacement[]> => {
    const res = await api.get(BASE + "/replacements/", {
      params: includeInactive ? { include_inactive: 1 } : undefined,
    });
    return unwrap<WorkflowUserReplacement[]>(res.data) || [];
  },
  createReplacement: async (
    body: Partial<WorkflowUserReplacement>,
  ): Promise<WorkflowUserReplacement> => {
    const res = await api.post(BASE + "/replacements/", body);
    return unwrap<WorkflowUserReplacement>(res.data);
  },
  updateReplacement: async (
    id: number,
    body: Partial<WorkflowUserReplacement>,
  ): Promise<WorkflowUserReplacement> => {
    const res = await api.patch(BASE + "/replacements/" + id + "/", body);
    return unwrap<WorkflowUserReplacement>(res.data);
  },
  setReplacementActive: async (
    id: number,
    isActive: boolean,
  ): Promise<WorkflowUserReplacement> => {
    const res = await api.patch(BASE + "/replacements/" + id + "/", { is_active: isActive });
    return unwrap<WorkflowUserReplacement>(res.data);
  },
};

export default workflowService;
