/**
 * Workflows — the single configuration workspace for the generic Workflow Engine.
 *
 * ONE page, five tabs. Modules, workflow definitions, condition queries, stages
 * and user replacements are all managed here; nothing navigates away, and there
 * is deliberately no second page for any of them.
 *
 *     Module
 *        └── Workflow
 *               ├── Queries   (conditions deciding whether the workflow applies)
 *               └── Stages    (exactly ONE user each, in execution order)
 *     User Replacements are global configuration, not owned by a workflow.
 *
 * NOTHING IS EVER DELETED from this page. Every row here is referenced by
 * flows, tasks or the append-only action history, and the foreign keys are
 * ON DELETE RESTRICT — a delete would either fail or strand that history.
 * Deactivating hides the row and takes it out of selection while keeping every
 * reference intact. `is_active` is a HARD GATE, never a ranking: an inactive
 * row takes no part at all, and is never preferred over an active one.
 *
 * Deliberately absent, because the engine does not have them: multiple
 * approvers, quorum, approval/rejection counts, round or attempt numbers, and
 * any notion of workflow priority. A SPECIFIC company scope does NOT outrank
 * ALL — if both match, the backend raises AmbiguousWorkflowSelection.
 *
 * Runtime approval (inbox/tasks) is NOT duplicated here; configuration only.
 *
 * STYLING: Tailwind utilities + the shared primitives in `components/ui`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiArrowPath,
  HiCheckCircle,
  HiCog6Tooth,
  HiExclamationCircle,
  HiExclamationTriangle,
  HiEye,
  HiEyeSlash,
  HiPencilSquare,
  HiPlus,
} from "react-icons/hi2";

import { useCan } from "../auth";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { SearchSelect } from "../components/ui/dropdown";
import { Field, FormGrid, Input, Textarea } from "../components/ui/form";
import { Card, Page, PageHeader } from "../components/ui/page";
import { SegmentedControl } from "../components/ui/segmented";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tab, TabList } from "../components/ui/tabs";
import { cn } from "../lib/utils";
import {
  COMPANY_CODES,
  workflowError,
  workflowService,
  type CompanyCode,
  type CompanyValue,
  type Workflow,
  type WorkflowModule,
  type WorkflowQuery,
  type WorkflowStage,
  type WorkflowUserReplacement,
} from "../services/workflowService";
import { userService, type User } from "../services/userService";

/** The backend permission key — core/permission_registry.py. */
const CONFIG_PERMISSION = "workflow.config.manage";

type TabKey = "modules" | "workflows" | "queries" | "stages" | "replacements";

const TABS: { key: TabKey; label: string }[] = [
  { key: "modules", label: "Modules" },
  { key: "workflows", label: "Workflows" },
  { key: "queries", label: "Queries" },
  { key: "stages", label: "Stages" },
  { key: "replacements", label: "Replacements" },
];

/**
 * The company options, in the order a person reads them.
 *
 * There is no translation layer any more. The backend stores this exact value
 * in one `company` column, so what is picked here is what is saved — no
 * `company_scope` flag to keep in step, and no way to express the
 * contradictory "specific AND all" that the old two-column shape needed three
 * database CHECKs to forbid.
 */
const COMPANY_OPTIONS: { value: CompanyValue; label: string }[] = [
  { value: "ALL", label: "ALL — applies to every company" },
  ...COMPANY_CODES.map((c) => ({ value: c as CompanyValue, label: c })),
];

/**
 * A workflow code, derived from its name.
 *
 * The code is the engine's identifier and is frozen after creation, so it is
 * generated rather than typed: two people naming the same thing by hand
 * produce `BUDGET_STD` and `Budget-Standard`, and only one of them matches
 * what a module passes to `start()`.
 */
const codeFromName = (name: string) =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

/**
 * The company filter, sized for the page header rather than a filter card.
 *
 * `h-control-xs` is the token the header's other actions use, so the select,
 * the checkbox and the Refresh button sit on one line at one height.
 *
 * It appears ONLY on the Workflows tab, because that is the only list the
 * backend filters by company (`?company=`). Leaving it on the other four tabs
 * would show a control that silently does nothing, which is worse than not
 * offering it there at all.
 */
function CompanyFilter({
  value,
  onChange,
}: {
  value: "" | CompanyCode;
  onChange: (c: "" | CompanyCode) => void;
}) {
  return (
    <select
      aria-label="Filter workflows by company"
      value={value}
      onChange={(e) => onChange(e.target.value as "" | CompanyCode)}
      className={cn(
        "h-control-xs min-w-0 cursor-pointer rounded-sm",
        "border border-line bg-surface px-2.5",
        "[font-family:inherit] text-[12.5px] text-ink",
        "transition-colors hover:border-line-strong",
        "focus-visible:border-brand focus-visible:bg-card focus-visible:shadow-focus focus-visible:outline-none",
      )}
    >
      {/* Default. Picking a company still shows ALL-scope workflows, because
          those genuinely apply to it — the same rule selection uses. */}
      <option value="">All companies</option>
      {COMPANY_CODES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

function useCanManage(): boolean {
  return useCan(CONFIG_PERMISSION);
}

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

function StateBlock({
  loading,
  error,
  empty,
  emptyText,
  action,
}: {
  loading: boolean;
  error: string;
  empty: boolean;
  emptyText: string;
  action?: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-2 py-2" aria-busy="true">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-bad">
        <HiExclamationCircle className="size-7" aria-hidden />
        <p className="text-[13px]">{error}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
        <p className="text-[13px] text-subtle">{emptyText}</p>
        {action}
      </div>
    );
  }
  return null;
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg bg-brand-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-brand">
      {children}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mb-3.5 rounded-lg bg-bad-soft px-3 py-2.5 text-[13px] whitespace-pre-wrap text-bad">
      {message}
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12.5px]">{children}</span>;
}

function CompanyBadge({ company }: { company: CompanyValue }) {
  return (
    <Badge tone={company === "ALL" ? "info" : "hold"} caps>
      {company}
    </Badge>
  );
}

function InactiveBadge({ active }: { active: boolean }) {
  if (active) return null;
  return (
    <Badge tone="neutral" caps className="ml-2">
      Inactive
    </Badge>
  );
}

/** Edit + the eye toggle. There is no delete anywhere on this page. */
function RowActions({
  active,
  label,
  onEdit,
  onToggle,
  children,
}: {
  active: boolean;
  label: string;
  onEdit: () => void;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {children}
      <Button variant="ghost" size="sm" aria-label="Edit" title="Edit" onClick={onEdit}>
        <HiPencilSquare aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={active ? `Deactivate ${label}` : `Activate ${label}`}
        title={active ? `Deactivate ${label}` : `Activate ${label}`}
        onClick={onToggle}
      >
        {active ? <HiEye aria-hidden /> : <HiEyeSlash className="text-subtle" aria-hidden />}
      </Button>
    </div>
  );
}

/** Single company picker — ALL / OIL / BEVERAGES / MART. */
function CompanyField({
  value,
  onChange,
  label = "Company",
}: {
  value: CompanyValue | undefined;
  onChange: (c: CompanyValue) => void;
  label?: string;
}) {
  return (
    <Field
      label={label}
      required
      hint="ALL is one row that serves every company — it is not copied per company."
    >
      {(control) => (
        <SearchSelect<CompanyValue>
          id={control.id}
          value={value ?? "ALL"}
          onChange={(v) => onChange((v || "ALL") as CompanyValue)}
          options={COMPANY_OPTIONS}
          placeholder="Select company"
        />
      )}
    </Field>
  );
}

function UserField({
  users,
  value,
  onChange,
  label,
}: {
  users: User[];
  value: number | null;
  onChange: (id: number) => void;
  label: string;
}) {
  const options = useMemo(
    () =>
      users.map((u) => ({
        value: u.id,
        label: u.username,
        hint: (u as unknown as { email?: string }).email || u.role_name || undefined,
      })),
    [users],
  );
  return (
    <Field label={label} required>
      {(control) => (
        <SearchSelect<number>
          id={control.id}
          value={value ?? ""}
          onChange={(v) => v !== "" && onChange(v as number)}
          options={options}
          placeholder="Search and select a user"
          searchPlaceholder="Search by name, email or role"
          maxShown={80}
        />
      )}
    </Field>
  );
}

function FormDialog({
  open,
  onClose,
  title,
  description,
  size = "md",
  saving,
  onSave,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={description} size={size}>
        {/*
          The VISIBLE heading. `DialogContent`'s `title` is the accessible name
          only — it renders `sr-only` — so without this block the dialog opened
          straight onto its first field with nothing saying what it was for.
          `pr-10` keeps the text clear of the absolutely-positioned close button.
        */}
        <DialogHeader className="pr-10">
          <div className="min-w-0">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription className="mt-0.5">{description}</DialogDescription>
            ) : null}
          </div>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirm before hiding something from the engine; reactivating is silent. */
function confirmToggle(kind: string, label: string, next: boolean) {
  if (next) return true;
  return window.confirm(
    `Deactivate ${kind} "${label}"?\n\n` +
      `It stops taking part in workflow selection and is hidden from this ` +
      `list. Nothing is deleted — existing history is kept, and you can ` +
      `bring it back with "Show inactive".`,
  );
}

/* ================================================================== *
 * Page
 * ================================================================== */

type SharedProps = {
  modules: WorkflowModule[];
  moduleOptions: { value: string; label: string }[];
  selectedModule: string;
  onSelectModule: (c: string) => void;
  workflows: Workflow[];
  workflowOptions: { value: number; label: string }[];
  users: User[];
  showInactive: boolean;
  flash: (msg: string) => void;
  reloadAll: () => void;
};

export default function Workflows() {
  const canManage = useCanManage();
  const [tab, setTab] = useState<TabKey>("modules");

  const [modules, setModules] = useState<WorkflowModule[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<number | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  /** Company filter for the Workflows tab. "" = every company. */
  const [companyFilter, setCompanyFilter] = useState<"" | CompanyCode>("");
  const [showInactive, setShowInactive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedWorkflowObj = workflows.find((w) => w.id === selectedWorkflow) || null;

  const loadModules = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await workflowService.listModules();
      setModules(rows);
      setSelectedModule((prev) => prev || rows[0]?.code || "");
    } catch (e) {
      setError(workflowError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorkflows = useCallback(
    async (moduleCode: string, company: string, includeInactive: boolean) => {
      if (!moduleCode) {
        setWorkflows([]);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const rows = await workflowService.listWorkflows(moduleCode, {
          company,
          includeInactive,
        });
        setWorkflows(rows);
        setSelectedWorkflow((prev) =>
          prev && rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? null),
        );
      } catch (e) {
        setError(workflowError(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (canManage) void loadModules();
  }, [canManage, loadModules]);

  useEffect(() => {
    if (canManage && selectedModule) {
      void loadWorkflows(selectedModule, companyFilter, showInactive);
    }
  }, [canManage, selectedModule, companyFilter, showInactive, loadWorkflows]);

  useEffect(() => {
    if (!canManage) return;
    userService
      .getUsers()
      .then((rows: unknown) => {
        const list = Array.isArray(rows) ? rows : ((rows as { data?: User[] })?.data ?? []);
        setUsers(list as User[]);
      })
      .catch(() => setUsers([]));
  }, [canManage]);

  const reloadAll = useCallback(() => {
    void loadModules();
    if (selectedModule) void loadWorkflows(selectedModule, companyFilter, showInactive);
  }, [loadModules, loadWorkflows, selectedModule, companyFilter, showInactive]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 4000);
  }, []);

  const moduleOptions = useMemo(
    () => modules.map((m) => ({ value: m.code, label: `${m.code} — ${m.name}` })),
    [modules],
  );
  const workflowOptions = useMemo(
    () => workflows.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    [workflows],
  );

  if (!canManage) {
    return (
      <Page>
        <Card className="p-0">
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center text-bad">
            <HiExclamationCircle className="size-7" aria-hidden />
            <p className="text-[13px]">
              You do not have permission to manage workflow configuration.
            </p>
            <p className="text-[12px] text-subtle">
              Required permission: {CONFIG_PERMISSION}
            </p>
          </div>
        </Card>
      </Page>
    );
  }

  const shared: SharedProps = {
    modules,
    moduleOptions,
    selectedModule,
    onSelectModule: setSelectedModule,
    workflows,
    workflowOptions,
    users,
    showInactive,
    flash,
    reloadAll,
  };

  return (
    <Page>
      <PageHeader
        title="Workflows"
        description="Manage modules, workflow rules, approvals and replacements"
        eyebrow={<HiCog6Tooth aria-hidden />}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {tab === "workflows" && (
              <CompanyFilter value={companyFilter} onChange={setCompanyFilter} />
            )}
            {/* Not on Modules: a module has no active flag, so the toggle
                would filter nothing. The registry always lists everything. */}
            {tab !== "modules" && (
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-subtle">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Show inactive
              </label>
            )}
            <Button variant="secondary" onClick={reloadAll}>
              <HiArrowPath aria-hidden /> Refresh
            </Button>
          </div>
        }
      />

      <TabList label="Workflow configuration" className="mb-4">
        {TABS.map((t) => (
          <Tab key={t.key} selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Tab>
        ))}
      </TabList>

      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">
          <HiCheckCircle aria-hidden /> {notice}
        </div>
      )}

      <Card className="p-4 md:p-5">
        {tab === "modules" && (
          <ModulesTab
            {...shared}
            loading={loading}
            error={error}
            onConfigure={(code, target) => {
              setSelectedModule(code);
              setTab(target);
            }}
          />
        )}
        {tab === "workflows" && (
          <WorkflowsTab
            {...shared}
            loading={loading}
            error={error}
            companyFilter={companyFilter}
            selectedWorkflow={selectedWorkflow}
            onSelectWorkflow={setSelectedWorkflow}
            onConfigure={(id, target) => {
              setSelectedWorkflow(id);
              setTab(target);
            }}
          />
        )}
        {tab === "queries" && (
          <QueriesTab
            {...shared}
            workflow={selectedWorkflowObj}
            onSelectWorkflow={setSelectedWorkflow}
          />
        )}
        {tab === "stages" && (
          <StagesTab
            {...shared}
            workflow={selectedWorkflowObj}
            onSelectWorkflow={setSelectedWorkflow}
          />
        )}
        {tab === "replacements" && <ReplacementsTab {...shared} />}
      </Card>
    </Page>
  );
}

/** Module → Workflow selector strip, as interactive searchable dropdowns. */
function Pickers({
  moduleOptions,
  selectedModule,
  onSelectModule,
  workflowOptions,
  selectedWorkflow,
  onSelectWorkflow,
  showWorkflow = true,
}: {
  moduleOptions: { value: string; label: string }[];
  selectedModule: string;
  onSelectModule: (c: string) => void;
  workflowOptions: { value: number; label: string }[];
  selectedWorkflow?: number | null;
  onSelectWorkflow?: (id: number) => void;
  showWorkflow?: boolean;
}) {
  const noModules = moduleOptions.length === 0;
  const noWorkflows = !noModules && workflowOptions.length === 0;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        {/*
          Module then Workflow, left to right, because that is the containment
          order: a workflow only exists inside a module. Both are the same
          width so the pair reads as one control, and both grow on a narrow
          screen rather than truncating the code out of a long label.
        */}
        <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5 sm:max-w-sm">
          <span className="text-[12px] font-medium text-body">Module</span>
          <SearchSelect<string>
            value={selectedModule}
            onChange={(v) => onSelectModule(String(v || ""))}
            options={moduleOptions}
            placeholder="Select a module"
            emptyText="No modules registered"
          />
        </div>

        {showWorkflow && (
          <>
            <span
              aria-hidden
              className="hidden pb-2.5 text-subtle sm:inline"
            >
              →
            </span>
            <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5 sm:max-w-sm">
              <span className="text-[12px] font-medium text-body">Workflow</span>
              <SearchSelect<number>
                value={selectedWorkflow ?? ""}
                onChange={(v) => v !== "" && onSelectWorkflow?.(v as number)}
                options={workflowOptions}
                placeholder={
                  noWorkflows ? "No workflows in this module" : "Select a workflow"
                }
                emptyText="No workflows in this module"
                disabled={noWorkflows}
              />
            </div>
          </>
        )}
      </div>

      {/*
        Say WHY the second dropdown is empty. Without this the picker just sits
        there blank and reads as broken, when the real answer is that the
        chosen module has nothing configured yet.
      */}
      {showWorkflow && noWorkflows && (
        <p className="text-[12px] text-subtle">
          {selectedModule || "This module"} has no workflows yet — create one on
          the Workflows tab first.
        </p>
      )}
    </div>
  );
}

/* ================================================================== *
 * Tab 1 — Modules
 * ================================================================== */

function ModulesTab({
  modules,
  loading,
  error,
  onSelectModule,
  onConfigure,
}: SharedProps & {
  loading: boolean;
  error: string;
  onConfigure: (code: string, tab: TabKey) => void;
}) {
  return (
    <>
      <div className="mb-4">
        <p className="max-w-[70ch] text-[13px] text-subtle">
          These modules are registered by the OMS application itself. A module
          registers its own code and name when it is deployed, so there is
          nothing to configure here — pick one and define its workflows.
        </p>
      </div>

      <Hint>
        The registry records only that a module <strong>exists</strong>. Its
        document table, flow table and flow model belong to the module and are
        declared in its own code — they are never configured here.
      </Hint>

      <StateBlock
        loading={loading}
        error={error}
        empty={modules.length === 0}
        emptyText="No modules are registered. A module appears here once its application code registers it at deploy time."
      />

      {!loading && !error && modules.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-28 text-center">Workflows</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((m) => (
              <TableRow key={m.id}>
                {/* The real database id, so a row matches
                    workflow.workflow_modules without a second lookup. */}
                <TableCell><Mono>{m.id}</Mono></TableCell>
                <TableCell>
                  <span className="font-semibold">{m.code}</span>
                </TableCell>
                <TableCell>{m.name}</TableCell>
                <TableCell className="text-center">{m.workflow_count}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onSelectModule(m.code);
                        onConfigure(m.code, "workflows");
                      }}
                    >
                      Workflows
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

/* ================================================================== *
 * Tab 2 — Workflows (rows, with a company filter)
 * ================================================================== */

function WorkflowsTab({
  modules,
  moduleOptions,
  selectedModule,
  onSelectModule,
  workflows,
  workflowOptions,
  loading,
  error,
  companyFilter,
  selectedWorkflow,
  onSelectWorkflow,
  onConfigure,
  flash,
  reloadAll,
}: SharedProps & {
  loading: boolean;
  error: string;
  companyFilter: "" | CompanyCode;
  selectedWorkflow: number | null;
  onSelectWorkflow: (id: number) => void;
  onConfigure: (id: number, tab: TabKey) => void;
}) {
  const moduleObj = modules.find((m) => m.code === selectedModule);
  const [editing, setEditing] = useState<Partial<Workflow> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError("");
    try {
      const name = (editing.name || "").trim();
      const body = {
        module: editing.module,
        // Generated from the name on create; frozen thereafter.
        code: editing.id ? editing.code : codeFromName(name),
        name,
        company: editing.company ?? "ALL",
      };
      if (editing.id) await workflowService.updateWorkflow(editing.id, body);
      else await workflowService.createWorkflow(body);
      flash(
        editing.id
          ? "Workflow updated."
          : "Workflow created. Configure its queries and stages next.",
      );
      setEditing(null);
      reloadAll();
    } catch (e) {
      setFormError(workflowError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (w: Workflow) => {
    const next = !w.is_active;
    if (!confirmToggle("workflow", w.code, next)) return;
    try {
      await workflowService.setWorkflowActive(w.id, next);
      flash(next ? `${w.code} activated.` : `${w.code} deactivated.`);
      reloadAll();
    } catch (e) {
      flash(workflowError(e));
    }
  };

  const createButton = (
    <Button
      className="shrink-0"
      variant="primary"
      disabled={!moduleObj}
      onClick={() =>
        setEditing({
          module: moduleObj?.id,
          name: "",
          company: "ALL",
        })
      }
    >
      <HiPlus aria-hidden /> Create Workflow
    </Button>
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <Pickers
          moduleOptions={moduleOptions}
          selectedModule={selectedModule}
          onSelectModule={onSelectModule}
          workflowOptions={workflowOptions}
          showWorkflow={false}
        />
        {createButton}
      </div>

      <Hint>
        A <strong>SPECIFIC</strong> company scope does not outrank <strong>ALL</strong>.
        If both a SPECIFIC and an ALL workflow match the same document, the engine
        raises <em>AmbiguousWorkflowSelection</em> and nothing is submitted.
      </Hint>

      <StateBlock
        loading={loading}
        error={error}
        empty={workflows.length === 0}
        emptyText={
          moduleObj
            ? `No workflows configured for ${moduleObj.code}${
                companyFilter ? ` and company ${companyFilter}` : ""
              }.`
            : "Register a module first."
        }
        action={moduleObj ? createButton : undefined}
      />

      {!loading && !error && workflows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="w-24 text-center">Queries</TableHead>
              <TableHead className="w-24 text-center">Stages</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workflows.map((w) => (
              <TableRow
                key={w.id}
                onClick={() => onSelectWorkflow(w.id)}
                className={cn(
                  "cursor-pointer",
                  !w.is_active && "opacity-60",
                  w.id === selectedWorkflow && "bg-brand-soft/50",
                )}
              >
                <TableCell><Mono>{w.id}</Mono></TableCell>
                <TableCell>
                  <span className="font-semibold">{w.code}</span>
                  <InactiveBadge active={w.is_active} />
                </TableCell>
                <TableCell>{w.name}</TableCell>
                <TableCell>
                  <CompanyBadge company={w.company} />
                </TableCell>
                <TableCell className="text-center">{w.queries?.length ?? 0}</TableCell>
                <TableCell className="text-center">{w.stages?.length ?? 0}</TableCell>
                <TableCell>
                  <RowActions
                    active={w.is_active}
                    label={w.code}
                    onEdit={() => setEditing({ ...w })}
                    onToggle={() => toggle(w)}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfigure(w.id, "queries");
                      }}
                    >
                      Queries
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfigure(w.id, "stages");
                      }}
                    >
                      Stages
                    </Button>
                  </RowActions>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <FormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Workflow" : "Create Workflow"}
        description={moduleObj ? `Module: ${moduleObj.code}` : undefined}
        saving={saving}
        onSave={save}
      >
        <FormError message={formError} />
        <Field label="Module" required>
          {(c) => (
            <SearchSelect<number>
              id={c.id}
              value={editing?.module ?? ""}
              onChange={(v) => v !== "" && setEditing({ ...editing, module: v as number })}
              options={modules.map((m) => ({
                value: m.id,
                label: `${m.code} — ${m.name}`,
              }))}
              placeholder="Select a module"
            />
          )}
        </Field>
        <Field label="Workflow Name" required>
          {(c) => (
            <Input
              {...c}
              value={editing?.name || ""}
              placeholder="Standard Budget Approval"
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          )}
        </Field>
        {/* The code is derived, not typed — see codeFromName. Shown so it is
            never a surprise, but there is no input for it. */}
        <p className="-mt-2 mb-3.5 text-[12px] text-subtle">
          Workflow code:{" "}
          <Mono>{editing?.id ? editing.code : codeFromName(editing?.name || "") || "—"}</Mono>
          {editing?.id
            ? " (fixed after creation)"
            : " — generated from the name, and fixed once created."}
        </p>
        <CompanyField
          value={editing?.company}
          onChange={(company) => setEditing({ ...editing, company })}
        />
      </FormDialog>
    </>
  );
}

/* ================================================================== *
 * Tab 3 — Queries
 * ================================================================== */

function QueriesTab({
  moduleOptions,
  selectedModule,
  onSelectModule,
  workflowOptions,
  workflow,
  onSelectWorkflow,
  showInactive,
  flash,
}: SharedProps & {
  workflow: Workflow | null;
  onSelectWorkflow: (id: number) => void;
}) {
  const [rows, setRows] = useState<WorkflowQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Partial<WorkflowQuery> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!workflow) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setRows(await workflowService.listQueries(workflow.id, showInactive));
    } catch (e) {
      setError(workflowError(e));
    } finally {
      setLoading(false);
    }
  }, [workflow, showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    // The dialog's own dropdown decides the owning workflow now, so a query
    // can be moved without leaving the form. It falls back to the tab's
    // selection for a query created straight from the Add button.
    const target = editing?.workflow ?? workflow?.id;
    if (!editing || !target) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        workflow: target,
        name: editing.name,
        query_text: editing.query_text,
        company: editing.company ?? "ALL",
      };
      if (editing.id) await workflowService.updateQuery(editing.id, body);
      else await workflowService.createQuery(body);
      flash("Query saved and validated.");
      setEditing(null);
      void load();
    } catch (e) {
      setFormError(workflowError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (q: WorkflowQuery) => {
    const next = !q.is_active;
    if (!confirmToggle("query", q.name, next)) return;
    try {
      await workflowService.setQueryActive(q.id, next);
      flash(next ? `${q.name} activated.` : `${q.name} deactivated.`);
      void load();
    } catch (e) {
      flash(workflowError(e));
    }
  };

  const revalidate = async (q: WorkflowQuery) => {
    try {
      const res = await workflowService.revalidateQuery(q.id);
      flash(
        res.problems?.length
          ? "Query still fails validation."
          : "Query validated successfully.",
      );
      void load();
    } catch (e) {
      flash(workflowError(e));
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <Pickers
          moduleOptions={moduleOptions}
          selectedModule={selectedModule}
          onSelectModule={onSelectModule}
          workflowOptions={workflowOptions}
          selectedWorkflow={workflow?.id ?? null}
          onSelectWorkflow={onSelectWorkflow}
        />
        <Button
          className="shrink-0 md:mt-6"
          variant="primary"
          disabled={!workflow}
          onClick={() =>
            setEditing({
              workflow: workflow?.id,
              name: "",
              query_text: "SELECT * FROM ",
              company: "ALL",
            })
          }
        >
          <HiPlus aria-hidden /> Add Query
        </Button>
      </div>

      <Hint>
        A <strong>condition query</strong> decides whether this workflow applies to a
        submitted business document. Only{" "}
        <code className="rounded bg-brand/10 px-1">SELECT</code> /{" "}
        <code className="rounded bg-brand/10 px-1">WITH</code> queries are allowed.
      </Hint>

      {!workflow && !loading ? (
        <p className="px-5 py-12 text-center text-[13px] text-subtle">
          Select a module and workflow to manage its condition queries.
        </p>
      ) : (
        <>
          <StateBlock
            loading={loading}
            error={error}
            empty={rows.length === 0}
            emptyText={`No queries configured for ${workflow?.code ?? "this workflow"}.`}
          />
          {!loading && !error && rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">ID</TableHead>
                  <TableHead>Query Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Validation</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((q) => (
                  <TableRow key={q.id} className={cn(!q.is_active && "opacity-60")}>
                    <TableCell><Mono>{q.id}</Mono></TableCell>
                    <TableCell>
                      <span className="font-semibold">{q.name}</span>
                      <InactiveBadge active={q.is_active} />
                    </TableCell>
                    <TableCell>
                      <CompanyBadge company={q.company} />
                    </TableCell>
                    <TableCell>
                      {q.validated_at ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-ok">
                          <HiCheckCircle aria-hidden /> Validated
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1.5 font-medium text-hold">
                            <HiExclamationTriangle aria-hidden /> Not validated
                          </span>
                          {q.validation_error && (
                            <p className="mt-1.5 max-w-[46ch] rounded-md bg-hold-soft px-2 py-1.5 text-[12px] whitespace-pre-wrap text-hold">
                              {q.validation_error}
                            </p>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <RowActions
                        active={q.is_active}
                        label={q.name}
                        onEdit={() => setEditing({ ...q })}
                        onToggle={() => toggle(q)}
                      >
                        <Button variant="secondary" size="sm" onClick={() => revalidate(q)}>
                          Revalidate
                        </Button>
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      <FormDialog
        open={!!editing && !!workflow}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?.id ? "Edit Condition Query" : "Create Condition Query"}
        description={workflow ? `Workflow: ${workflow.code}` : undefined}
        saving={saving}
        onSave={save}
      >
        <FormError message={formError} />
        {/*
          The workflow this query belongs to — the thing a query actually needs
          stated. It replaces the old "Key Column" box, which asked for a SQL
          detail almost nobody overrides: the query names its own key column
          and the engine falls back to `id`, so the field was an expert escape
          hatch sitting in the second-most prominent slot of the form.
        */}
        <Field
          label="Workflow"
          required
          hint="Queries belong to a workflow. Changing this moves the query to that workflow."
        >
          {(c) => (
            <SearchSelect<number>
              id={c.id}
              value={editing?.workflow ?? workflow?.id ?? ""}
              onChange={(v) =>
                v !== "" && setEditing({ ...editing, workflow: v as number })
              }
              options={workflowOptions}
              placeholder="Select a workflow"
              emptyText="No workflows for this module"
            />
          )}
        </Field>
        <Field label="Name" required>
          {(c) => (
            <Input
              {...c}
              value={editing?.name || ""}
              placeholder="high-value"
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          )}
        </Field>
        <CompanyField
          value={editing?.company}
          onChange={(company) => setEditing({ ...editing, company })}
        />
        <Field
          label="Condition Query"
          required
          hint="Only SELECT / WITH queries are allowed. The query determines whether this workflow applies to the submitted business document — it is not a SQL console. The engine binds the document id as a parameter automatically."
        >
          {(c) => (
            <Textarea
              {...c}
              rows={9}
              spellCheck={false}
              className="bg-surface font-mono text-[13px] leading-relaxed"
              value={editing?.query_text || ""}
              onChange={(e) => setEditing({ ...editing, query_text: e.target.value })}
            />
          )}
        </Field>
      </FormDialog>
    </>
  );
}

/* ================================================================== *
 * Tab 4 — Stages
 * ================================================================== */

/**
 * The stage list drawn as the progression it actually is.
 *
 * A table of rows with a "Sequence" column states the order as a number and
 * makes the reader reconstruct the shape. Approval genuinely is a chain —
 * stage 1 must complete before stage 2 opens — so the connecting rail says it
 * directly, and the numbered node is the position rather than a cell that
 * happens to contain a digit.
 *
 * This is CONFIGURATION, not a live run: no stage here is "done" or "current",
 * because no document is in flight. So the rail is drawn in one neutral
 * weight, and nothing is coloured as progress-so-far — that would invent a
 * state the page cannot know. What it does show is which rungs are live:
 * a deactivated stage is skipped at runtime, so its node is hollow and its
 * segment of the rail is dashed.
 */
function StageProgress({
  rows,
  userLabel,
  onEdit,
  onToggle,
  onChangeUser,
}: {
  rows: WorkflowStage[];
  userLabel: (id: number) => string;
  onEdit: (s: WorkflowStage) => void;
  onToggle: (s: WorkflowStage) => void;
  onChangeUser: (s: WorkflowStage) => void;
}) {
  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div>
      <p className="mb-3 text-[12.5px] text-subtle">
        {activeCount === rows.length
          ? `${rows.length} stage${rows.length === 1 ? "" : "s"}, run in order.`
          : `${activeCount} of ${rows.length} stages active — the rest are skipped.`}
      </p>

      <ol className="m-0 list-none p-0">
        {rows.map((st, i) => {
          const last = i === rows.length - 1;
          return (
            <li key={st.id} className="flex gap-3.5">
              {/* Rail column: the node, and the line down to the next stage. */}
              <div className="flex w-7 shrink-0 flex-col items-center">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full",
                    "text-[12px] font-bold transition-colors",
                    st.is_active
                      ? "bg-brand text-white"
                      : "border-2 border-dashed border-line-strong bg-card text-subtle",
                  )}
                >
                  {st.sequence}
                </span>
                {!last && (
                  <span
                    aria-hidden
                    className={cn(
                      "w-px flex-1",
                      st.is_active
                        ? "bg-line-strong"
                        : // A dashed segment, drawn with a repeating gradient
                          // because a 1px element cannot carry a border style.
                          "bg-[repeating-linear-gradient(to_bottom,var(--color-line-strong)_0_4px,transparent_4px_8px)]",
                    )}
                  />
                )}
              </div>

              {/* Content column */}
              <div
                className={cn(
                  "mb-2 min-w-0 flex-1 rounded-lg border border-line bg-card",
                  "px-3.5 py-3 transition-colors hover:border-brand-line",
                  !st.is_active && "opacity-70",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">
                        {st.name}
                      </span>
                      <InactiveBadge active={st.is_active} />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-subtle">
                      <span>
                        Approver:{" "}
                        <span className="font-medium text-body">
                          {st.user_username || userLabel(st.user)}
                        </span>
                      </span>
                      {/* Someone else is covering today. The configured user
                          above is unchanged — this is a dated replacement, not
                          a reassignment. */}
                      {st.has_active_replacement && (
                        <>
                          <span className="text-line-strong" aria-hidden>│</span>
                          <span className="text-hold">
                            covered by{" "}
                            <span className="font-medium">
                              {st.effective_user_username}
                            </span>
                          </span>
                        </>
                      )}
                      <span className="text-line-strong" aria-hidden>│</span>
                      <span>
                        ID <Mono>{st.id}</Mono>
                      </span>
                    </p>
                  </div>
                  <RowActions
                    active={st.is_active}
                    label={st.name}
                    onEdit={() => onEdit(st)}
                    onToggle={() => onToggle(st)}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onChangeUser(st)}
                    >
                      Edit
                    </Button>
                  </RowActions>
                </div>
              </div>
            </li>
          );
        })}

        {/* The terminus, so the chain visibly ends rather than trailing off. */}
        <li className="flex items-center gap-3.5">
          <span className="flex w-7 shrink-0 justify-center">
            <HiCheckCircle className="size-5 text-ok" aria-hidden />
          </span>
          <span className="text-[12.5px] font-medium text-subtle">
            Approved — every stage complete
          </span>
        </li>
      </ol>
    </div>
  );
}


/**
 * The line the edit dialog carries, because it is the one thing people expect
 * to be false: changing who works a stage moves nothing.
 */
const NO_MIGRATION_NOTE =
  "The stage itself does not change. Entries already waiting at it stay where " +
  "they are and are handled by the new user from now on, and past approvals " +
  "keep the name of whoever actually approved.";

/**
 * Change the configured user of ONE stage.
 *
 * The only user-change action on this page. There is deliberately no bulk
 * "replace everywhere": a single click that rewrote every stage a person owns
 * across every module is an organisation-wide change with no natural review
 * step and no undo, so the edit is kept the same size as the thing you are
 * looking at.
 */
function EditStageUserDialog({
  stage,
  users,
  workflowName,
  onClose,
  onDone,
  flash,
}: {
  stage: WorkflowStage | null;
  users: User[];
  workflowName: string;
  onClose: () => void;
  onDone: () => void;
  flash: (msg: string) => void;
}) {
  const [newUser, setNewUser] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setNewUser(stage?.user ?? null);
    setFormError("");
  }, [stage]);

  const save = async () => {
    if (!stage || !newUser) return;
    setSaving(true);
    setFormError("");
    try {
      // One PATCH of one column. Not a new workflow, not a new stage, and no
      // second write anywhere — see NO_MIGRATION_NOTE.
      await workflowService.updateStage(stage.id, { user: newUser });
      flash(`${stage.name} is now handled by ${
        users.find((u) => u.id === newUser)?.username ?? "the new user"
      }.`);
      onClose();
      onDone();
    } catch (e) {
      setFormError(workflowError(e));
    } finally {
      setSaving(false);
    }
  };

  const current = stage
    ? stage.user_username || users.find((u) => u.id === stage.user)?.username
    : "";

  return (
    <FormDialog
      open={!!stage}
      onClose={onClose}
      title="Edit Stage User"
      description={stage ? `${workflowName} — ${stage.name}` : undefined}
      saving={saving}
      onSave={save}
    >
      <FormError message={formError} />
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        {stage?.module_code ? (
          <>
            <dt className="text-subtle">Module</dt>
            <dd className="m-0 font-medium text-ink">{stage.module_code}</dd>
          </>
        ) : null}
        <dt className="text-subtle">Workflow</dt>
        <dd className="m-0 font-medium text-ink">{workflowName}</dd>
        <dt className="text-subtle">Stage</dt>
        <dd className="m-0 font-medium text-ink">
          {stage?.name} <span className="text-subtle">(sequence {stage?.sequence})</span>
        </dd>
        <dt className="text-subtle">Current user</dt>
        <dd className="m-0 font-medium text-ink">{current}</dd>
      </dl>

      <UserField
        users={users}
        label="New user"
        value={newUser}
        onChange={setNewUser}
      />

      <p className="mt-3 rounded-lg bg-brand-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-brand">
        {NO_MIGRATION_NOTE}
      </p>
    </FormDialog>
  );
}

function StagesTab({
  moduleOptions,
  selectedModule,
  onSelectModule,
  workflowOptions,
  workflow,
  onSelectWorkflow,
  users,
  showInactive,
  flash,
}: SharedProps & {
  workflow: Workflow | null;
  onSelectWorkflow: (id: number) => void;
}) {
  /**
   * Two readings of the same rows.
   *
   * By Workflow answers "who works this process?"; By User answers "what would
   * I break by moving this person?". Both come from `workflow_stages` — the
   * second is the same table filtered by user and joined up to its workflow
   * and module, which is why there is no assignment table to keep in step.
   */
  const [view, setView] = useState<"workflow" | "user">("workflow");

  const [rows, setRows] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Partial<WorkflowStage> | null>(null);
  const [changingUserOn, setChangingUserOn] = useState<WorkflowStage | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<WorkflowStage[]>([]);

  const load = useCallback(async () => {
    if (!workflow) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const list = await workflowService.listStages(workflow.id, showInactive);
      setRows([...list].sort((a, b) => a.sequence - b.sequence));
    } catch (e) {
      setError(workflowError(e));
    } finally {
      setLoading(false);
    }
  }, [workflow, showInactive]);

  const loadAssignments = useCallback(async () => {
    if (!selectedUser) {
      setAssignments([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setAssignments(
        await workflowService.listStagesForUser(selectedUser, showInactive),
      );
    } catch (e) {
      setError(workflowError(e));
    } finally {
      setLoading(false);
    }
  }, [selectedUser, showInactive]);

  useEffect(() => {
    if (view === "workflow") void load();
  }, [view, load]);

  useEffect(() => {
    if (view === "user") void loadAssignments();
  }, [view, loadAssignments]);

  const reloadBoth = () => {
    void load();
    void loadAssignments();
  };

  const save = async () => {
    if (!editing || !workflow) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        workflow: workflow.id,
        name: editing.name,
        sequence: Number(editing.sequence),
        user: editing.user,
      };
      if (editing.id) await workflowService.updateStage(editing.id, body);
      else await workflowService.createStage(body);
      flash("Stage saved.");
      setEditing(null);
      reloadBoth();
    } catch (e) {
      setFormError(workflowError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (s: WorkflowStage) => {
    const next = !s.is_active;
    if (!confirmToggle("stage", s.name, next)) return;
    try {
      await workflowService.setStageActive(s.id, next);
      flash(next ? `${s.name} activated.` : `${s.name} deactivated.`);
      reloadBoth();
    } catch (e) {
      flash(workflowError(e));
    }
  };

  const nextSeq = rows.length ? Math.max(...rows.map((r) => r.sequence)) + 1 : 1;
  const userLabel = (id: number) =>
    users.find((u) => u.id === id)?.username || `User #${id}`;
  const selectedUserObj = users.find((u) => u.id === selectedUser) || null;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex w-full flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-body">View</span>
            <SegmentedControl<"workflow" | "user">
              value={view}
              onChange={setView}
              className="self-start"
              options={[
                { value: "workflow", label: "By Workflow" },
                { value: "user", label: "By User" },
              ]}
            />
          </div>

          {view === "workflow" ? (
            <Pickers
              moduleOptions={moduleOptions}
              selectedModule={selectedModule}
              onSelectModule={onSelectModule}
              workflowOptions={workflowOptions}
              selectedWorkflow={workflow?.id ?? null}
              onSelectWorkflow={onSelectWorkflow}
            />
          ) : (
            <div className="flex min-w-[16rem] flex-col gap-1.5 sm:max-w-sm">
              <span className="text-[12px] font-medium text-body">User</span>
              <SearchSelect<number>
                value={selectedUser ?? ""}
                onChange={(v) => v !== "" && setSelectedUser(v as number)}
                options={users.map((u) => ({ value: u.id, label: u.username }))}
                placeholder="Select a user"
                searchPlaceholder="Search users"
                maxShown={80}
              />
            </div>
          )}
        </div>

        {view === "workflow" && (
          <Button
            className="shrink-0 md:mt-6"
            variant="primary"
            disabled={!workflow}
            onClick={() => setEditing({ name: "", sequence: nextSeq, user: undefined })}
          >
            <HiPlus aria-hidden /> Add Stage
          </Button>
        )}
      </div>

      {view === "workflow" ? (
        <>
          <Hint>
            Stages run in <strong>sequence</strong> order. Each stage has exactly{" "}
            <strong>one</strong> assigned user: one approval completes the stage, one
            rejection rejects the workflow. A deactivated stage is skipped.
          </Hint>

          {!workflow && !loading ? (
            <p className="px-5 py-12 text-center text-[13px] text-subtle">
              Select a module and workflow to manage its stages.
            </p>
          ) : (
            <>
              <StateBlock
                loading={loading}
                error={error}
                empty={rows.length === 0}
                emptyText={`No stages configured for ${workflow?.code ?? "this workflow"}.`}
              />
              {!loading && !error && rows.length > 0 && (
                <StageProgress
                  rows={rows}
                  userLabel={userLabel}
                  onEdit={(st) => setEditing({ ...st })}
                  onToggle={toggle}
                  onChangeUser={setChangingUserOn}
                />
              )}
            </>
          )}
        </>
      ) : (
        <>
          <Hint>
            This view shows every workflow stage currently assigned to this user.
            Editing a row changes only that specific stage assignment. Existing
            entries remain at the same stage and follow the stage&rsquo;s current
            responsible user.
          </Hint>

          {!selectedUser ? (
            <p className="px-5 py-12 text-center text-[13px] text-subtle">
              Select a user to see everything they are assigned to.
            </p>
          ) : (
            <>
              {/* The count, and nothing beside it. This view is a read-only
                  overview: the only action lives on an individual row. */}
              <p className="mb-3 text-[13px] text-body">
                {`${assignments.length} workflow stage ${
                  assignments.length === 1 ? "assignment" : "assignments"
                } for ${selectedUserObj?.username ?? ""}`}
              </p>

              <StateBlock
                loading={loading}
                error={error}
                empty={assignments.length === 0}
                emptyText={`${selectedUserObj?.username ?? "This user"} is not assigned to any workflow stage.`}
              />

              {!loading && !error && assignments.length > 0 && (
                /* Scrolls rather than wrapping: six columns on a tablet would
                   otherwise squeeze the workflow and stage names — the two
                   things that identify the row — down to nothing. */
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Assigned User</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((a) => (
                      <TableRow key={a.id} className={cn(!a.is_active && "opacity-60")}>
                        <TableCell>
                          <span className="font-semibold">{a.module_code}</span>
                          <div className="text-[12px] text-subtle">{a.module_name}</div>
                        </TableCell>
                        <TableCell>
                          <Mono>{a.workflow_code}</Mono>
                          <div className="text-[12px] text-subtle">{a.workflow_name}</div>
                        </TableCell>
                        <TableCell>
                          {a.name}
                          <div className="text-[12px] text-subtle">
                            sequence {a.sequence}
                          </div>
                          <InactiveBadge active={a.is_active} />
                        </TableCell>
                        <TableCell>
                          {a.company ? <CompanyBadge company={a.company} /> : "—"}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-ink">
                            {a.user_username || userLabel(a.user)}
                          </span>
                          {/* Why somebody else may be handling it right now.
                              The CONFIGURED user above is unchanged — this is a
                              dated replacement, not a reassignment. */}
                          {a.has_active_replacement && (
                            <div className="text-[12px] text-hold">
                              covered by {a.effective_user_username} —
                              temporary replacement
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setChangingUserOn(a)}
                            >
                              Edit
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </>
          )}
        </>
      )}

      <EditStageUserDialog
        stage={changingUserOn}
        users={users}
        workflowName={
          changingUserOn?.workflow_code || workflow?.code || "this workflow"
        }
        onClose={() => setChangingUserOn(null)}
        onDone={reloadBoth}
        flash={flash}
      />

      <FormDialog
        open={!!editing && !!workflow}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Stage" : "Create Stage"}
        description={workflow ? `Workflow: ${workflow.code}` : undefined}
        saving={saving}
        onSave={save}
      >
        <FormError message={formError} />
        <FormGrid>
          <Field label="Stage Name" required>
            {(c) => (
              <Input
                {...c}
                value={editing?.name || ""}
                placeholder="Manager Approval"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            )}
          </Field>
          <Field label="Sequence" required hint="Execution order only — not a priority.">
            {(c) => (
              <Input
                {...c}
                type="number"
                min={1}
                value={editing?.sequence ?? 1}
                onChange={(e) =>
                  setEditing({ ...editing, sequence: Number(e.target.value) })
                }
              />
            )}
          </Field>
        </FormGrid>
        <UserField
          users={users}
          label="Assigned User"
          value={editing?.user ?? null}
          onChange={(id) => setEditing({ ...editing, user: id })}
        />
      </FormDialog>
    </>
  );
}

/* ================================================================== *
 * Tab 5 — User Replacements
 * ================================================================== */

function ReplacementsTab({ users, showInactive, flash }: SharedProps) {
  const [rows, setRows] = useState<WorkflowUserReplacement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Partial<WorkflowUserReplacement> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await workflowService.listReplacements(showInactive));
    } catch (e) {
      setError(workflowError(e));
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        old_user: editing.old_user,
        new_user: editing.new_user,
        reason: editing.reason || "",
        start_date: editing.start_date,
        end_date: editing.end_date,
      };
      if (editing.id) await workflowService.updateReplacement(editing.id, body);
      else await workflowService.createReplacement(body);
      flash("Replacement saved.");
      setEditing(null);
      void load();
    } catch (e) {
      setFormError(workflowError(e));
    } finally {
      setSaving(false);
    }
  };

  const label = (id: number, fallback?: string) =>
    fallback || users.find((u) => u.id === id)?.username || `User #${id}`;

  const toggle = async (r: WorkflowUserReplacement) => {
    const next = !r.is_active;
    const who = `${label(r.old_user, r.old_username)} → ${label(r.new_user, r.new_username)}`;
    if (!confirmToggle("replacement", who, next)) return;
    try {
      await workflowService.setReplacementActive(r.id, next);
      flash(next ? "Replacement activated." : "Replacement deactivated.");
      void load();
    } catch (e) {
      flash(workflowError(e));
    }
  };

  const addButton = (
    <Button
      variant="primary"
      onClick={() => setEditing({ reason: "", start_date: "", end_date: "" })}
    >
      <HiPlus aria-hidden /> Add Replacement
    </Button>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-[62ch] text-[13px] text-subtle">
          During the configured date range the replacement user may act on behalf of the
          original user. The configured stage assignment is never changed.
        </p>
        {addButton}
      </div>

      <Hint>
        Replacement periods for the same user may not overlap — the database rejects it.
        Adjacent ranges are fine.
      </Hint>

      <StateBlock
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText="No user replacements configured."
        action={addButton}
      />

      {!loading && !error && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Original User</TableHead>
              <TableHead>Replacement User</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={cn(!r.is_active && "opacity-60")}>
                <TableCell><Mono>{r.id}</Mono></TableCell>
                <TableCell>
                  <span className="font-semibold">{label(r.old_user, r.old_username)}</span>
                  <InactiveBadge active={r.is_active} />
                </TableCell>
                <TableCell>{label(r.new_user, r.new_username)}</TableCell>
                <TableCell>{r.reason || "—"}</TableCell>
                <TableCell><Mono>{r.start_date}</Mono></TableCell>
                <TableCell><Mono>{r.end_date}</Mono></TableCell>
                <TableCell>
                  <RowActions
                    active={r.is_active}
                    label="replacement"
                    onEdit={() => setEditing({ ...r })}
                    onToggle={() => toggle(r)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <FormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?.id ? "Edit Replacement" : "Add Replacement"}
        description="The original user keeps their stage assignment."
        saving={saving}
        onSave={save}
      >
        <FormError message={formError} />
        <FormGrid>
          <UserField
            users={users}
            label="Original User"
            value={editing?.old_user ?? null}
            onChange={(id) => setEditing({ ...editing, old_user: id })}
          />
          <UserField
            users={users}
            label="Replacement User"
            value={editing?.new_user ?? null}
            onChange={(id) => setEditing({ ...editing, new_user: id })}
          />
        </FormGrid>
        <FormGrid>
          <Field label="Start Date" required hint="Inclusive.">
            {(c) => (
              <Input
                {...c}
                type="date"
                value={editing?.start_date || ""}
                onChange={(e) => setEditing({ ...editing, start_date: e.target.value })}
              />
            )}
          </Field>
          <Field label="End Date" required hint="Inclusive.">
            {(c) => (
              <Input
                {...c}
                type="date"
                value={editing?.end_date || ""}
                onChange={(e) => setEditing({ ...editing, end_date: e.target.value })}
              />
            )}
          </Field>
        </FormGrid>
        <Field label="Reason">
          {(c) => (
            <Input
              {...c}
              value={editing?.reason || ""}
              placeholder="Annual leave"
              onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
            />
          )}
        </Field>
      </FormDialog>
    </>
  );
}
