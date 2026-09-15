/**
 * BackDate — request temporary back-posting rights in SAP.
 *
 * A requester asks for permission to post one document type, in one company,
 * with a posting date inside a bounded past window. The request then goes
 * through whatever approval chain the Workflow Engine selects for it.
 *
 * Route access is decided once, in `components/ProtectedPage.tsx`, from the
 * `BackDate` key — this page carries no gate of its own.
 *
 * ONE COMPANY AND ONE ACTION PER REQUEST, deliberately. The JSAP predecessor
 * accepted a comma-separated branch list and wrote each company's SAP grant in
 * a loop with no transaction, so a half-failed submission granted rights in one
 * company and not another.
 *
 * ONE REQUEST, WHATEVER IS TICKED. Several companies and both actions are
 * still ONE BackDate request: it is one business decision, put in front of an
 * approver once. The form therefore always submits once and always says
 * "Submit Request" — never "Submit 2 Requests".
 *
 * The fan-out lives in SAP, not here. `OPEN_BKDT` takes one branch per call
 * and writes into that company's own schema, so two companies become two calls
 * at the moment of final approval — each recorded with its own payload and its
 * own response. JSAP stored requests the same way (`branch = "1,2"`).
 *
 * ACTIONS NEVER FAN OUT AT ALL. Add and Update together is one request
 * carrying `"A,U"`, because SAP is never told the action: `OPEN_BKDT` has no
 * such parameter, so splitting it would write SAP rows identical in every
 * column it reads.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  HiArrowPath,
  HiCheckCircle,
  HiClock,
  HiExclamationCircle,
  HiExclamationTriangle,
  HiPlus,
  HiXCircle,
} from "react-icons/hi2";

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
import { MultiSelect, SearchSelect } from "../components/ui/dropdown";
import { Field, FormGrid, Input, Textarea } from "../components/ui/form";
import { Card, Page, PageHeader, StatRow } from "../components/ui/page";
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
  BACKDATE_COMPANIES,
  backdateError,
  backdateService,
  type BackDateAction,
  type BackDateCompany,
  type BackDateFieldChange,
  type BackDateFlow,
  type BackDateHistory,
  type BackDateInsights,
  type BackDateRequest,
  type BackDateSapResult,
  type SapDocumentType,
  type SapUser,
} from "../services/backdateService";
import {
  CompanyFilterSelect,
  KpiFilterRow,
  StatusFilterSelect,
  type CompanyFilter,
  type StatusFilter,
} from "./backdate/filters";

const ACTIONS: { value: BackDateAction; label: string }[] = [
  { value: "A", label: "Add" },
  { value: "U", label: "Update" },
];

/**
 * What the create form holds.
 *
 * `companies` and `actions` are LISTS, and a submission raises one request per
 * combination — OIL+BEVERAGES with Add+Update is four requests. The API takes
 * one company and one action per request and that stays true: each request
 * gets its own approval chain and its own SAP write, so a failure in one
 * company cannot half-grant another. The JSAP predecessor looped branches
 * inside a single untransacted request, which is exactly the bug this avoids.
 */
type FormState = {
  companies: BackDateCompany[];
  actions: BackDateAction[];
  sap_username: string;
  document_type?: number;
  from_date: string;
  to_date: string;
  time_limit: string;
  remarks: string;
};

const EMPTY_FORM: FormState = {
  companies: ["OIL"],
  actions: ["A"],
  sap_username: "",
  document_type: undefined,
  from_date: "",
  to_date: "",
  time_limit: "",
  remarks: "",
};

/** Status chip driven by the flow, with SAP failure called out separately. */
function StatusBadge({ request }: { request: BackDateRequest }) {
  const flow = request.flow;
  if (!flow) return <Badge tone="neutral" caps>Not submitted</Badge>;

  if (flow.status === "APPROVED") {
    // Approved but SAP refused the write — the approval stands, the rights do
    // not exist yet. Showing a plain "Approved" here would be a lie.
    if (flow.hana_status === "FAILED") {
      return <Badge tone="bad" caps>SAP write failed</Badge>;
    }
    // null = the write has not been attempted yet. One "no", not three.
    if (flow.hana_status === null) {
      return <Badge tone="hold" caps>Awaiting SAP</Badge>;
    }
    return <Badge tone="ok" caps>Approved</Badge>;
  }
  if (flow.status === "REJECTED") return <Badge tone="bad" caps>Rejected</Badge>;
  return <Badge tone="hold" caps>Pending</Badge>;
}

function StateBlock({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading: boolean;
  error: string;
  empty: boolean;
  emptyText: string;
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
        <p className="whitespace-pre-wrap text-[13px]">{error}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <p className="px-5 py-12 text-center text-[13px] text-subtle">{emptyText}</p>
    );
  }
  return null;
}

/** Field names as a person reading the history would say them. */
const FIELD_LABELS: Record<string, string> = {
  sap_username: "SAP user",
  document_type: "Document type",
  from_date: "From date",
  to_date: "To date",
  time_limit: "Rights expire",
  action: "Action",
  remarks: "Reason",
};

/**
 * The readable diff for an UPDATE row.
 *
 * Rendered FROM `action_data`, which holds only the fields that changed — so
 * this shows what an edit did without the history table storing a snapshot of
 * everything it did not touch.
 */
function ChangedData({
  data,
}: {
  data: Record<string, BackDateFieldChange> | null;
}) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
      {Object.entries(data).map(([field, change]) => (
        <Fragment key={field}>
          <dt className="text-subtle">{FIELD_LABELS[field] ?? field}</dt>
          <dd className="m-0 text-body">
            <span className="text-subtle line-through">
              {formatChange(change.old)}
            </span>
            <span aria-hidden> → </span>
            <span className="font-medium text-ink">
              {formatChange(change.new)}
            </span>
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** One side of a change, rendered without pretending to know its type. */
function formatChange(value: string | number | null) {
  if (value === null || value === "") return "—";
  if (typeof value === "number") return String(value);
  // Dates and timestamps arrive as ISO strings; anything else is left alone.
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return value.includes("T")
        ? date.toLocaleString()
        : date.toLocaleDateString();
    }
  }
  return value;
}

/**
 * What SAP was sent and what it said, per company.
 *
 * This exists because one request can produce several `OPEN_BKDT` calls that
 * DISAGREE — OIL accepted, BEVERAGES refused — and the single `hana_status` on
 * the flow cannot say which. Nothing here is a summary: the parameters are the
 * ones actually bound, and the response is SAP's own text or its own error.
 */
function SapOutcome({ flow }: { flow: BackDateFlow | null }) {
  const [open, setOpen] = useState(false);
  if (!flow || flow.hana_status === null) return null;

  const results = parseResults(flow.hana_status_text);
  const calls = flow.sap_payload?.calls ?? [];
  const failed = flow.hana_status === "FAILED";

  return (
    <div
      className={cn(
        "mb-4 rounded-lg px-3.5 py-2.5 text-[13px]",
        failed ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok",
      )}
    >
      <div className="flex items-start gap-2">
        {failed ? (
          <HiXCircle className="mt-0.5 shrink-0" aria-hidden />
        ) : (
          <HiCheckCircle className="mt-0.5 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">
              SAP {failed ? "write failed" : "rights applied"}
              {results.length > 1 && ` · ${results.length} companies`}
            </span>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="cursor-pointer appearance-none border-0 bg-transparent p-0 text-[12.5px] font-medium underline [font-family:inherit]"
            >
              {open ? "Hide detail" : "Show payload and response"}
            </button>
          </div>

          {/* The per-company outcome is always visible: when one company fails
              and another does not, that IS the headline. */}
          <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
            {results.map((result) => (
              <li key={result.branch} className="text-[12.5px]">
                <span className="font-semibold">{result.branch}</span>
                <span className="opacity-80"> · {result.status} · </span>
                <span className="opacity-90">{result.response}</span>
              </li>
            ))}
          </ul>

          {open && (
            <div className="mt-2.5 space-y-2.5">
              {calls.map((call) => (
                <div key={call.branch}>
                  <div className="text-[12px] font-semibold uppercase tracking-wide opacity-70">
                    {call.branch} payload
                  </div>
                  <pre className="m-0 mt-1 overflow-x-auto rounded bg-card/60 p-2 text-[11.5px] leading-relaxed text-body">
                    {JSON.stringify(call.parameters, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * `hana_status_text` as the per-branch list it is.
 *
 * Falls back to showing the raw text rather than hiding it: an operator needs
 * whatever SAP said even when it does not parse, and swallowing it is exactly
 * the failure this column was added to prevent.
 */
function parseResults(text: string): BackDateSapResult[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { results?: BackDateSapResult[] };
    if (Array.isArray(parsed.results) && parsed.results.length > 0) {
      return parsed.results;
    }
  } catch {
    // Not JSON — an older row, or a message from somewhere else.
  }
  return [{ branch: "SAP", status: "FAILED", response: text }];
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export default function BackDate() {
  const [rows, setRows] = useState<BackDateRequest[]>([]);
  const [insights, setInsights] = useState<BackDateInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>("");
  const [notice, setNotice] = useState("");

  /**
   * Creating is a TAB, not a dialog. The form is long enough that a modal made
   * the list unreachable while filling it in — and a requester regularly needs
   * to look at what they already asked for to decide what to ask for next.
   */
  const [tab, setTab] = useState<"entries" | "create">("entries");
  const [detail, setDetail] = useState<BackDateRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // The counts carry the company filter too, so a card and the table
      // under it never disagree about how many there are.
      const scope = companyFilter ? { company: companyFilter } : {};
      const [list, counts] = await Promise.all([
        backdateService.listRequests(
          statusFilter ? { ...scope, status: statusFilter } : scope,
        ),
        backdateService.insights(scope),
      ]);
      setRows(list);
      setInsights(counts);
    } catch (e) {
      setError(backdateError(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, companyFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 6000);
  };

  /** A KPI click is a filter: show the entries tab, scoped to that status. */
  const showEntries = (status: StatusFilter) => {
    setStatusFilter(status);
    setTab("entries");
  };

  return (
    <Page>
      <PageHeader
        title="BackDate"
        description="Request temporary back-posting rights in SAP"
        eyebrow={<HiClock aria-hidden />}
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <HiArrowPath aria-hidden /> Refresh
          </Button>
        }
      />

      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">
          <HiCheckCircle className="mt-0.5 shrink-0" aria-hidden />
          <span className="whitespace-pre-wrap">{notice}</span>
        </div>
      )}

      {insights && (
        <StatRow className="mb-4">
          <KpiFilterRow
            counts={insights}
            status={statusFilter}
            live={tab === "entries"}
            onSelect={showEntries}
          />
        </StatRow>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <TabList label="BackDate">
          <Tab selected={tab === "entries"} onClick={() => setTab("entries")}>
            Entries
          </Tab>
          <Tab selected={tab === "create"} onClick={() => setTab("create")}>
            <HiPlus aria-hidden /> New Request
          </Tab>
        </TabList>

        {/* Filtering belongs to the list, so the controls are only offered
            while the list is the thing on screen. */}
        {tab === "entries" && (
          <div className="flex flex-wrap items-center gap-2">
            <CompanyFilterSelect value={companyFilter} onChange={setCompanyFilter} />
            <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
          </div>
        )}
      </div>

      {tab === "create" ? (
        <NewRequestForm
          onCancel={() => setTab("entries")}
          onCreated={(message) => {
            flash(message);
            setTab("entries");
            void load();
          }}
        />
      ) : (
        <Card className="p-4 md:p-5">
          <StateBlock
            loading={loading}
            error={error}
            empty={rows.length === 0}
            emptyText={
              statusFilter || companyFilter
                ? `No ${statusFilter ? statusFilter.toLowerCase() + " " : ""}` +
                  `BackDate requests${companyFilter ? ` for ${companyFilter}` : ""}.`
                : "You have not raised any BackDate requests yet."
            }
          />

          {!loading && !error && rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>SAP User</TableHead>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Waiting On</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-[12.5px]">{row.id}</TableCell>
                      <TableCell>
                        {/* One badge per company: the set is the request. */}
                        <div className="flex flex-wrap gap-1">
                          {row.companies.map((c) => (
                            <Badge key={c} tone="info" caps>{c}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{row.sap_username}</TableCell>
                      <TableCell>{row.document_type}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.from_date)} — {formatDate(row.to_date)}
                      </TableCell>
                      <TableCell><StatusBadge request={row} /></TableCell>
                      <TableCell>
                        {row.flow?.current_stage ? (
                          <>
                            <div className="text-[13px]">
                              {row.flow.current_stage_name}
                              {row.flow.total_stage > 1 && (
                                <span className="text-subtle">
                                  {" "}({row.flow.current_stage_sequence} of{" "}
                                  {row.flow.total_stage})
                                </span>
                              )}
                            </div>
                            <div className="text-[12px] text-subtle">
                              {row.flow.effective_user_username}
                              {/* The stand-in, named, so a requester chasing an
                                  approval knows who actually has it today. */}
                              {row.flow.has_active_replacement && (
                                <span className="text-hold">
                                  {" "}(covering {row.flow.current_user_username})
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button variant="secondary" size="sm" onClick={() => setDetail(row)}>
                            Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}

      <RequestDetailDialog request={detail} onClose={() => setDetail(null)} />
    </Page>
  );
}

/* ================================================================== *
 * New request
 * ================================================================== */

function NewRequestForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (message: string) => void;
}) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [sapUsers, setSapUsers] = useState<SapUser[]>([]);
  const [docTypes, setDocTypes] = useState<SapDocumentType[]>([]);
  const [mastersError, setMastersError] = useState("");
  const [loadingMasters, setLoadingMasters] = useState(false);

  /*
   * SAP users and object types are per company, and the picked user and
   * document type apply to EVERY company ticked. The lists are therefore read
   * from the first ticked company — the master data is the same shape in each,
   * and offering a union would suggest a choice that is valid everywhere when
   * it may not be.
   */
  const company = form.companies[0];

  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    setLoadingMasters(true);
    setMastersError("");
    Promise.all([
      backdateService.sapUsers(company),
      backdateService.documentTypes(company),
    ])
      .then(([users, types]) => {
        if (cancelled) return;
        setSapUsers(users);
        setDocTypes(types);
      })
      .catch((e) => {
        if (!cancelled) setMastersError(backdateError(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingMasters(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company]);

  const userOptions = useMemo(
    () => sapUsers.map((u) => ({ value: u.user_code, label: u.user_code })),
    [sapUsers],
  );
  // The SAP object NAME only. The numeric `ObjType` is what gets stored and
  // sent to HANA, but it means nothing to the person filling the form in.
  const typeOptions = useMemo(
    () => docTypes.map((t) => ({ value: t.object_type, label: t.name })),
    [docTypes],
  );

  /** Both actions ticked is the single combined value, never two requests. */
  const actionValue = form.actions.includes("A") && form.actions.includes("U")
    ? "A,U"
    : form.actions[0];

  const save = async () => {
    if (form.companies.length === 0 || !actionValue) {
      setFormError("Tick at least one company and one action.");
      return;
    }
    // Caught here as well as by the API, because the fan-out means one missing
    // field would otherwise be reported once per combination.
    if (!form.time_limit) {
      setFormError(
        "Set when the rights expire. SAP ignores back-posting rights that "
        + "never lapse, so a request without an expiry would be approved and "
        + "still not let anyone post.",
      );
      return;
    }
    setSaving(true);
    setFormError("");

    try {
      // ONE call, whatever was ticked. The companies travel together inside
      // the request; splitting them here is exactly what this page used to do
      // and what made the same decision reach an approver twice.
      await backdateService.createRequest({
        company: form.companies,
        sap_username: form.sap_username.trim(),
        document_type: Number(form.document_type),
        from_date: form.from_date,
        to_date: form.to_date,
        time_limit: form.time_limit,
        action: actionValue,
        remarks: form.remarks,
      });
      // The tab stays mounted, so the form is cleared here rather than by an
      // open/close cycle — otherwise the next visit shows the last request.
      setForm({ ...EMPTY_FORM });
      onCreated("BackDate request submitted successfully.");
    } catch (e) {
      setFormError(backdateError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 md:p-5">
      <div className="mb-4">
        <h2 className="m-0 text-[15px] font-semibold text-ink">New BackDate Request</h2>
        <p className="m-0 mt-0.5 text-[13px] text-subtle">
          One request, however many companies you tick — approved once, then
          applied in each company&rsquo;s SAP database.
        </p>
      </div>

      <div className="space-y-4">
        {formError && (
          <div className="mb-3.5 rounded-lg bg-bad-soft px-3 py-2.5 text-[13px] whitespace-pre-wrap text-bad">
            {formError}
          </div>
        )}
        {mastersError && (
          <div className="mb-3.5 flex items-start gap-2 rounded-lg bg-hold-soft px-3 py-2.5 text-[13px] text-hold">
            <HiExclamationTriangle className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {mastersError} You can still type the SAP user and document type.
            </span>
          </div>
        )}

        <FormGrid>
          <Field label="Company" required>
            {(c) => (
              <MultiSelect<BackDateCompany>
                id={c.id}
                value={form.companies}
                onChange={(next) =>
                  setForm({
                    ...form,
                    // Ordered as the list is, so the company the SAP lists are
                    // read from does not depend on the order of ticking.
                    companies: BACKDATE_COMPANIES.filter((co) => next.includes(co)),
                    // Cleared on purpose — see the effect above.
                    sap_username: "",
                    document_type: undefined,
                  })
                }
                options={BACKDATE_COMPANIES.map((co) => ({ value: co, label: co }))}
                placeholder="Select company"
              />
            )}
          </Field>

          <Field label="Action" required>
            {(c) => (
              <MultiSelect<BackDateAction>
                id={c.id}
                value={form.actions}
                onChange={(next) =>
                  setForm({
                    ...form,
                    actions: ACTIONS.map((a) => a.value).filter((a) => next.includes(a)),
                  })
                }
                options={ACTIONS}
                placeholder="Select action"
              />
            )}
          </Field>
        </FormGrid>

        <FormGrid>
          <Field label="SAP User" required>
            {(c) =>
              userOptions.length > 0 ? (
                <SearchSelect<string>
                  id={c.id}
                  value={form.sap_username}
                  onChange={(v) => setForm({ ...form, sap_username: String(v || "") })}
                  options={userOptions}
                  placeholder={loadingMasters ? "Loading SAP users…" : "Select a SAP user"}
                  searchPlaceholder="Search SAP users"
                  maxShown={80}
                />
              ) : (
                <Input
                  {...c}
                  value={form.sap_username}
                  placeholder={loadingMasters ? "Loading…" : "USER12"}
                  maxLength={20}
                  onChange={(e) => setForm({ ...form, sap_username: e.target.value })}
                />
              )
            }
          </Field>

          <Field label="Document Type" required>
            {(c) =>
              typeOptions.length > 0 ? (
                <SearchSelect<number>
                  id={c.id}
                  value={form.document_type ?? ""}
                  onChange={(v) => v !== "" && setForm({ ...form, document_type: v as number })}
                  options={typeOptions}
                  placeholder={loadingMasters ? "Loading document types…" : "Select a document type"}
                  searchPlaceholder="Search document types"
                  maxShown={80}
                />
              ) : (
                <Input
                  {...c}
                  type="number"
                  value={form.document_type ?? ""}
                  placeholder={loadingMasters ? "Loading…" : "13"}
                  onChange={(e) =>
                    setForm({ ...form, document_type: Number(e.target.value) })
                  }
                />
              )
            }
          </Field>
        </FormGrid>

        <FormGrid>
          <Field label="From Date" required>
            {(c) => (
              <Input
                {...c}
                type="date"
                value={form.from_date}
                onChange={(e) => setForm({ ...form, from_date: e.target.value })}
              />
            )}
          </Field>
          <Field label="To Date" required>
            {(c) => (
              <Input
                {...c}
                type="date"
                value={form.to_date}
                onChange={(e) => setForm({ ...form, to_date: e.target.value })}
              />
            )}
          </Field>
          <Field label="Rights Expire" required>
            {(c) => (
              <Input
                {...c}
                type="datetime-local"
                value={form.time_limit}
                onChange={(e) => setForm({ ...form, time_limit: e.target.value })}
              />
            )}
          </Field>
        </FormGrid>

        <Field label="Reason">
          {(c) => (
            <Textarea
              {...c}
              rows={3}
              value={form.remarks}
              placeholder="Month-end close — invoices received late from the depot."
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          )}
        </Field>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {/* Always singular: several companies is one request. */}
            {saving ? "Submitting…" : "Submit Request"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ================================================================== *
 * Detail + history
 * ================================================================== */

export function RequestDetailDialog({
  request,
  onClose,
  footer,
}: {
  request: BackDateRequest | null;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="BackDate Request" size="lg">
        {/*
          Keyed on the request id so opening a different request remounts the
          body and its history state starts empty. The alternative — clearing
          state from an effect when `request` becomes null — is a synchronous
          setState in an effect, which cascades renders for no benefit.
        */}
        {request && (
          <RequestDetailBody
            key={request.id}
            request={request}
            onClose={onClose}
            footer={footer}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RequestDetailBody({
  request,
  onClose,
  footer,
}: {
  request: BackDateRequest;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const [history, setHistory] = useState<BackDateHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    backdateService
      .history(request.id)
      .then((data) => !cancelled && setHistory(data))
      .catch((e) => !cancelled && setError(backdateError(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  return (
    <>
      <DialogHeader className="pr-10">
        <div className="min-w-0">
          <DialogTitle>BackDate Request #{request.id}</DialogTitle>
          <DialogDescription className="mt-0.5">
            {request.sap_username} · {request.company_label} ·{" "}
            {formatDate(request.from_date)} to {formatDate(request.to_date)}
          </DialogDescription>
        </div>
      </DialogHeader>

      <DialogBody>
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[13px]">
          <dt className="text-subtle">Status</dt>
          <dd className="m-0"><StatusBadge request={request} /></dd>
          <dt className="text-subtle">Document type</dt>
          <dd className="m-0 font-medium text-ink">{request.document_type}</dd>
          <dt className="text-subtle">Action</dt>
          <dd className="m-0 font-medium text-ink">{request.action_label}</dd>
          <dt className="text-subtle">Rights expire</dt>
          <dd className="m-0 font-medium text-ink">
            {request.time_limit ? formatDate(request.time_limit) : "No expiry"}
          </dd>
          <dt className="text-subtle">Raised by</dt>
          <dd className="m-0 font-medium text-ink">
            {request.created_by_username} on {formatDate(request.created_at)}
          </dd>
          {request.remarks && (
            <>
              <dt className="text-subtle">Reason</dt>
              <dd className="m-0 whitespace-pre-wrap text-body">{request.remarks}</dd>
            </>
          )}
          {request.flow && (
            <>
              <dt className="text-subtle">Workflow</dt>
              <dd className="m-0 text-body">
                <span className="font-mono text-[12.5px]">
                  {request.flow.workflow_code}
                </span>
              </dd>
              <dt className="text-subtle">Current stage</dt>
              <dd className="m-0 font-medium text-ink">
                {request.flow.current_stage ? (
                  <>
                    {request.flow.current_stage_name}
                    <span className="font-normal text-subtle">
                      {" "}({request.flow.current_stage_sequence} of{" "}
                      {request.flow.total_stage})
                    </span>
                  </>
                ) : (
                  <span className="font-normal text-subtle">
                    — ({request.flow.total_stage} stage
                    {request.flow.total_stage === 1 ? "" : "s"})
                  </span>
                )}
              </dd>
              {request.flow.current_stage && (
                <>
                  <dt className="text-subtle">Current user</dt>
                  <dd className="m-0 font-medium text-ink">
                    {request.flow.effective_user_username}
                    {request.flow.has_active_replacement && (
                      <span className="font-normal text-hold">
                        {" "}(covering {request.flow.current_user_username})
                      </span>
                    )}
                  </dd>
                </>
              )}
            </>
          )}
        </dl>

        {/* SAP outcome, stated plainly. An approved request whose SAP write
            failed has NOT granted anything yet. */}
        <SapOutcome flow={request.flow} />

        <h4 className="mb-2 text-[13px] font-semibold text-ink">Approval history</h4>
        <StateBlock
          loading={loading}
          error={error}
          empty={!loading && !error && (history?.actions.length ?? 0) === 0}
          emptyText="No activity recorded yet."
        />
        {history && history.actions.length > 0 && (
          <ol className="m-0 list-none space-y-2 p-0">
            {history.actions.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "rounded-lg border border-line px-3.5 py-2.5 text-[13px]",
                  entry.action === "REJECT" &&
                    "border-bad-soft bg-bad-soft/40",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">
                    {entry.action_label}
                    {entry.stage_name && (
                      <span className="font-normal text-subtle"> · {entry.stage_name}</span>
                    )}
                  </span>
                  <span className="text-[12px] text-subtle">
                    {new Date(entry.acted_at).toLocaleString()}
                  </span>
                </div>
                {entry.acted_by_username && (
                  <div className="mt-0.5 text-[12.5px] text-body">
                    {entry.acted_by_username}
                  </div>
                )}
                {entry.remarks && (
                  <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-subtle">
                    {entry.remarks}
                  </p>
                )}
                <ChangedData data={entry.action_data} />
              </li>
            ))}
          </ol>
        )}
      </DialogBody>

      <DialogFooter>
        {footer}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  );
}
