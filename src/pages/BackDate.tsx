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
  HiMinusCircle,
  HiPencilSquare,
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
import { newestFirst } from "./backdate/ordering";
import { useDeepLinkedRequest } from "./backdate/useDeepLinkedRequest";
import { cn } from "../lib/utils";
import {
  BACKDATE_COMPANIES,
  backdateError,
  backdateService,
  type BackDateAction,
  type BackDateActionValue,
  type BackDateCompany,
  type BackDateFieldChange,
  type BackDateFlow,
  type BackDateHistory,
  type BackDateInsights,
  type BackDateRequest,
  type BackDateSapResult,
  type BackDateStageProgress,
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
 * `companies` and `actions` are both LISTS and neither fans out here: the
 * whole selection is ONE request, submitted once, with one approval chain.
 * OIL+MART with Add+Update is a single request carrying `"OIL,MART"` and
 * `"A,U"` — see the header above for why each of those is singular.
 *
 * The companies separate at the SAP write and nowhere earlier: one
 * `OPEN_BKDT` call each after final approval, each with its own recorded
 * payload and its own recorded answer. That record is what makes a partial
 * failure visible, which is the part JSAP got wrong — it looped branches with
 * no per-branch result, so a half-failed submission reported success.
 */
type FormState = {
  /**
   * ONE OR MORE companies, still ONE request.
   *
   * The same rights in two SAP databases are one decision, so they are one
   * request with one approval chain. The fan-out is at the SAP write.
   */
  companies: BackDateCompany[];
  actions: BackDateAction[];
  sap_username: string;
  /** The SAP object NAME. There is no numeric type on a request any more. */
  document_type_name: string;
  from_date: string;
  to_date: string;
  time_limit: string;
  /** Write-only: this becomes the CREATE log's remark, not a column. */
  remarks: string;
};

const EMPTY_FORM: FormState = {
  companies: ["OIL"],
  actions: ["A"],
  sap_username: "",
  document_type_name: "",
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
  document_type_name: "Document type",
  from_date: "From date",
  to_date: "To date",
  time_limit: "Rights expire",
  action: "Action",
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
/**
 * What SAP said, as the last node of the progress timeline.
 *
 * THE RESPONSE, AND ONLY THE RESPONSE. The request parameters are recorded in
 * `sap_payload` and are there for an administrator with database access; this
 * is read by the person deciding what to do next, and the only thing that
 * tells them is what SAP sent BACK. A payload dump beside it buried that.
 *
 * Rendered as a `TimelineNode` rather than a banner of its own so it joins the
 * same rail as the approvals: the SAP write is the last thing that happens to
 * a request, not a footnote under the history of it.
 */
function SapTimelineNode({ flow }: { flow: BackDateFlow }) {
  const failed = flow.hana_status === "FAILED";
  const results = parseResults(flow.hana_status_text, flow.hana_status);
  const rowIds = results
    .map((r) => r.sap_row_id)
    .filter((id): id is number => typeof id === "number");

  return (
    <TimelineNode
      tone={failed ? "bg-bad" : "bg-ok"}
      icon={failed ? HiXCircle : HiCheckCircle}
      title="SAP"
      subtitle={results.map((r) => r.branch).join(", ") || undefined}
      state={failed ? "Refused" : "Rights applied"}
      stateTone={failed ? "text-bad" : "text-ok"}
      last
      rows={[
        [
          "Timestamp",
          flow.updated_at ? new Date(flow.updated_at).toLocaleString() : "—",
        ],
        // WHERE the row is, as a field rather than a sentence. It used to be a
        // SQL query pasted into the middle of the response, which buried the
        // one thing an approver is reading for: whether the grant landed.
        ...(rowIds.length > 0
          ? ([["SAP row id", rowIds.join(", ")]] as [string, React.ReactNode][])
          : []),
      ]}
      extra={
        <SapResultList
          status={flow.hana_status}
          text={flow.hana_status_text}
        />
      }
    />
  );
}

/**
 * What SAP said, one tinted line per company.
 *
 * Exported so the approval dialog can show the SAME thing the moment a grant
 * lands, rather than sending the approver off to find it. One component, so
 * the two readings of one SAP call cannot differ.
 */
export function SapResultList({
  status,
  text,
}: {
  status: BackDateFlow["hana_status"];
  text: string;
}) {
  const results = parseResults(text, status);
  if (results.length === 0) return null;
  return (
    <ul className="m-0 mt-1.5 list-none space-y-1.5 p-0">
      {results.map((result) => (
        <li
          key={result.branch}
          className={cn(
            "rounded-lg px-3 py-2 text-[12.5px] leading-relaxed",
            result.status === "FAILED"
              ? "bg-bad-soft text-bad"
              : "bg-ok-soft text-ok",
          )}
        >
          {/* SAP's own words, verbatim and never truncated: on a refusal they
              are the only thing that says what to correct. */}
          <span className="whitespace-pre-wrap break-words">
            {result.response || "SAP returned no message."}
          </span>
          {typeof result.sap_row_id === "number" && (
            <span className="mt-1 block opacity-80">
              SAP row id {result.sap_row_id}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * `hana_status_text` as the per-branch list it is.
 *
 * Falls back to showing the raw text rather than hiding it: an operator needs
 * whatever SAP said even when it does not parse, and swallowing it is exactly
 * the failure this column was added to prevent.
 *
 * The fallback takes its status from the FLOW. Older rows store a plain
 * sentence rather than the JSON shape, and assuming "FAILED" for those printed
 * a red "FAILED" beside a green "rights applied" on requests that had in fact
 * succeeded — the record contradicting itself, which is the one thing this
 * column exists to prevent.
 */
function parseResults(
  text: string,
  flowStatus: BackDateFlow["hana_status"],
): BackDateSapResult[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { results?: BackDateSapResult[] };
    if (Array.isArray(parsed.results) && parsed.results.length > 0) {
      return parsed.results;
    }
  } catch {
    // Not JSON — an older row, or a message from somewhere else.
  }
  return [
    {
      branch: "SAP",
      status: flowStatus === "FAILED" ? "FAILED" : "SUCCESS",
      response: text,
    },
  ];
}

/** A titled block of label/value rows. */
function InfoGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-lg border border-line px-3.5 py-3">
      <h4 className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-wide text-brand">
        {title}
      </h4>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[13px]">
        {children}
      </dl>
    </section>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  wrap = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <>
      <dt className="text-subtle">{label}</dt>
      <dd
        className={cn(
          "m-0 font-medium text-ink",
          mono && "font-mono text-[12.5px]",
          wrap && "whitespace-pre-wrap font-normal text-body",
        )}
      >
        {value}
      </dd>
    </>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export default function BackDate() {
  const [rows, setRows] = useState<BackDateRequest[]>([]);
  const [insights, setInsights] = useState<BackDateInsights | null>(null);
  // Starts TRUE. The first fetch is fired from an effect, so a `false` here
  // means one render claiming "loaded, nothing here" before anything has been
  // asked for — an empty-state flash, and the reason a deep-linked request
  // used to be looked for in a list that had not arrived yet.
  const [loading, setLoading] = useState(true);
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
  const [progress, setProgress] = useState<BackDateRequest | null>(null);

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
      // Latest first. The endpoint orders by `-created_at`, which is the
      // same thing today, but the list and the approval desk beside it now
      // answer "which is newest" the same way.
      setRows(newestFirst(list));
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

  // Arriving from a notification ("your request was approved"): open that
  // request, not just the list it is somewhere in. Opening the Entries tab
  // first matters — the deep link can land while Create is selected, and the
  // dialog would otherwise appear over a half-filled form.
  useDeepLinkedRequest(rows, !loading, (request) => {
    setTab("entries");
    setDetail(request);
  });

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
                  <EntryTableHead />
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <EntryTableRow
                      key={row.id}
                      request={row}
                      onDetails={() => setDetail(row)}
                      onProgress={() => setProgress(row)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}

      <RequestDetailDialog
        request={detail}
        onClose={() => setDetail(null)}
        onEdited={(message) => {
          flash(message);
          void load();
        }}
      />

      <RequestProgressDialog
        request={progress}
        onClose={() => setProgress(null)}
      />
    </Page>
  );
}

/* ================================================================== *
 * New request
 * ================================================================== */

/**
 * SAP's user and object-type lists for one company.
 *
 * Shared by the create form and the edit form so both offer the SAME choices.
 * An edit used to be free-text boxes, which let somebody type a SAP user or a
 * document name that does not exist — accepted by the form, then refused at
 * the very last stage by the SAP call. Picking from SAP's own list is what
 * stops that.
 *
 * Both lists are cached server-side, so opening an edit costs no HANA round
 * trip beyond the first. `cancelled` guards the company changing (or the
 * dialog closing) while a fetch is in flight.
 */
function useSapMasters(company: BackDateCompany | undefined) {
  const [sapUsers, setSapUsers] = useState<SapUser[]>([]);
  const [docTypes, setDocTypes] = useState<SapDocumentType[]>([]);
  const [mastersError, setMastersError] = useState("");
  const [loadingMasters, setLoadingMasters] = useState(false);

  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    // Set from the fetch's own callbacks rather than synchronously in the
    // effect body, which cascades a render before the request even starts.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadingMasters(true);
      setMastersError("");
    });
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
  // The SAP object NAME, as both the value and the label: the name is what a
  // request stores now. SAP's numeric `ObjType` is resolved from it server-side
  // at the moment of the OPEN_BKDT call, so it never travels through the form.
  const typeOptions = useMemo(
    () => docTypes.map((t) => ({ value: t.name, label: t.name })),
    [docTypes],
  );

  return { userOptions, typeOptions, loadingMasters, mastersError };
}

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

  /**
   * SAP users and object types come from ONE company's masters, so the lists
   * follow the first company picked.
   *
   * The document types are safe to read from any of them: the same 75 objects
   * with the same names exist in all three schemas. SAP USERS are not — a
   * login that exists in OIL may not exist in MART — so the form says so
   * below rather than pretending the list is authoritative for every company.
   * A user SAP does not know fails that company's call with SAP's own message
   * recorded against it, which is visible on the request.
   */
  const { userOptions, typeOptions, loadingMasters, mastersError } =
    useSapMasters(form.companies[0]);

  /**
   * Both actions ticked is the single combined value, never two requests —
   * `OPEN_BKDT` has no action parameter, so splitting the pair would write SAP
   * rows identical in every column SAP reads.
   */
  const actionValue = form.actions.includes("A") && form.actions.includes("U")
    ? "A,U"
    : form.actions[0];

  const save = async () => {
    if (form.companies.length === 0 || !actionValue) {
      setFormError("Pick at least one company and at least one action.");
      return;
    }
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
      // ONE POST, whatever was ticked. Several companies are one request with
      // one approval chain — the same rights in each database, decided once —
      // and the server stores them as one canonical value. They separate only
      // at the SAP write, one `OPEN_BKDT` call each after final approval.
      //
      // The ACTION never splits either: both ticked is one request carrying
      // "A,U", because SAP is never told the action at all.
      await backdateService.createRequest({
        company: form.companies,
        sap_username: form.sap_username.trim(),
        document_type_name: form.document_type_name,
        from_date: form.from_date,
        to_date: form.to_date,
        time_limit: fromLocalInput(form.time_limit),
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
          One company per request — it decides the approval route and the SAP
          database. Ticking both actions widens the one request rather than
          adding another.
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
          {/* SEVERAL AT ONCE, AND STILL ONE REQUEST. Asking for the same
              rights in OIL and MART is one decision by the same approvers, so
              it is one request with one approval chain — not two of each that
              could disagree. The companies separate at the SAP write, where
              each gets its own `OPEN_BKDT` call into its own schema. */}
          <Field label="Company" required>
            {(c) => (
              <MultiSelect<BackDateCompany>
                id={c.id}
                value={form.companies}
                onChange={(next) =>
                  setForm({
                    ...form,
                    companies: next as BackDateCompany[],
                    // Cleared on purpose: the SAP user and document lists come
                    // from the first company picked, so an earlier selection's
                    // pick may not exist in the new one.
                    sap_username: "",
                    document_type_name: "",
                  })
                }
                options={BACKDATE_COMPANIES.map((co) => ({ value: co, label: co }))}
                placeholder="Select companies"
                // Three codes fit in the trigger, and reading them back beats
                // "2 selected" when the set is the whole point of the field.
                namedUpTo={BACKDATE_COMPANIES.length}
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
          {/* THE ONE THING A MULTI-COMPANY REQUEST CANNOT CHECK FOR YOU.
              The list below comes from the first company picked, and a SAP
              login that exists in OIL need not exist in MART. Said plainly
              here, because the alternative is finding out at the SAP call
              after the approvers have already said yes — that company's call
              fails with SAP's own message and the others still land. */}

          {/*
            The caveat the comment on `useSapMasters` above promises.
            ─────────────────────────────────────────────────────────
            The list is read from the FIRST company's masters, and a login
            that exists in OIL need not exist in MART. The form cannot check
            the others — there is no call that would — so it says so at the
            moment the question arises, which is when a second company is
            ticked and not before. Staying silent here means the mismatch
            surfaces at the SAP write after every approver has signed it off.
          */}
          <Field
            label="SAP User"
            required
            hint={
              form.companies.length > 1
                ? `SAP users are listed from ${form.companies[0]} only — check this login also exists in ${form.companies.slice(1).join(", ")}.`
                : undefined
            }
          >
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
                <SearchSelect<string>
                  id={c.id}
                  value={form.document_type_name}
                  onChange={(v) =>
                    setForm({ ...form, document_type_name: String(v) })}
                  options={typeOptions}
                  placeholder={loadingMasters ? "Loading document types…" : "Select a document type"}
                  searchPlaceholder="Search document types"
                  maxShown={80}
                />
              ) : (
                <Input
                  {...c}
                  value={form.document_type_name}
                  placeholder={loadingMasters ? "Loading…" : "A/R Invoice"}
                  maxLength={120}
                  onChange={(e) =>
                    setForm({ ...form, document_type_name: e.target.value })
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
            {saving ? "Submitting…" : "Submit Request"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ================================================================== *
 * The shared entry table
 * ================================================================== */

/**
 * The columns both BackDate pages show.
 *
 * ONE definition rather than two: the requester and the approver are looking
 * at the same entries, and two tables that drift apart make the same request
 * read differently depending on who opened it. Everything else about a request
 * — its status, its stage, who holds it — lives in Details and Progress, so
 * the table stays scannable.
 */
export function EntryTableHead() {
  return (
    <TableRow>
      <TableHead className="w-20">ID</TableHead>
      <TableHead>Company</TableHead>
      <TableHead>From Date</TableHead>
      <TableHead>To Date</TableHead>
      <TableHead>Time Limit</TableHead>
      <TableHead>Created By</TableHead>
      {/* WHERE THE REQUEST IS, on every row.
          Without it a list told you nothing about outcomes: under "All" a
          rejected request, one awaiting its second approver and one whose SAP
          write failed were three identical rows, and the only way to tell
          them apart was to open each one. */}
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Action</TableHead>
    </TableRow>
  );
}

export function EntryTableRow({
  request,
  onDetails,
  onProgress,
}: {
  request: BackDateRequest;
  onDetails: () => void;
  onProgress: () => void;
}) {
  return (
    <TableRow>
      {/* The id is how a person refers to one of these, so it is set apart
          rather than left as one number among many. */}
      <TableCell>
        <span className="rounded bg-surface-strong px-1.5 py-0.5 font-mono text-[12.5px] font-semibold text-ink">
          #{request.id}
        </span>
      </TableCell>
      <TableCell>
        {/* One badge per company: the SET is the request. */}
        <div className="flex flex-wrap gap-1">
          {request.companies.map((c) => (
            <Badge key={c} tone="info" caps>{c}</Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {formatDate(request.from_date)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {formatDate(request.to_date)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {request.time_limit
          ? new Date(request.time_limit).toLocaleString()
          : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div>{request.created_by_username}</div>
        <div className="text-[12px] text-subtle">
          {new Date(request.created_at).toLocaleString()}
        </div>
      </TableCell>
      <TableCell>
        {/* The SAME chip the detail and progress dialogs use, so a row and the
            dialog it opens can never disagree about a request's state. It
            reports the REQUEST's position — which on an approver's "Approved"
            tab may still read Pending, because that tab lists what THEY
            decided and the request can be moving through the stages above
            them. */}
        <StatusBadge request={request} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="secondary" size="sm" onClick={onDetails}>
            Details
          </Button>
          <Button variant="secondary" size="sm" onClick={onProgress}>
            Progress
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Correct a request in place, without leaving the dialog.
 *
 * The reason this exists is the SAP refusal below it: an approver reads
 * "invalid userid USER99", and the fix is one field away. Sending them to
 * another screen to find the same request again is how a two-second
 * correction becomes a support ticket.
 *
 * `company` is absent on purpose — it decides which workflow applies and the
 * request has already been routed. A different company is a different request.
 */
function EditRequestForm({
  request,
  onCancel,
  onSaved,
}: {
  request: BackDateRequest;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  /*
   * EVERY field of the request is editable here, and each one is entered the
   * same way it was on the way in — the SAP user and the document type from
   * SAP's own lists, the action as the same pair of tick boxes. They used to
   * be free-text boxes, which let somebody type a user or a document name SAP
   * has never heard of: accepted by the form, then refused at the last stage
   * by the SAP call, with the request stuck and nobody the wiser about why.
   *
   * `company` is the one exception and it is not an oversight: the SET of
   * companies decides which workflow applies and the request has already been
   * routed by it. Changing it would either leave the flow pointing at a
   * workflow chosen for a different set, or move the request to different
   * approvers mid-decision. A different set is a different request.
   */
  const { userOptions, typeOptions, loadingMasters, mastersError } =
    // The first of the request's companies — `company` is the canonical set
    // (`"OIL,MART"`), which is not a company a masters endpoint can answer for.
    useSapMasters(request.companies[0]);

  const [form, setForm] = useState({
    sap_username: request.sap_username,
    document_type_name: request.document_type_name,
    actions: splitActions(request.action),
    from_date: request.from_date,
    to_date: request.to_date,
    time_limit: toLocalInput(request.time_limit),
    // Starts EMPTY, never seeded from an earlier remark: this is the reason
    // for THIS edit, and it is written to this edit's own log row. Prefilling
    // it with somebody else's sentence would put their words in this user's
    // mouth on a new history entry.
    remarks: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const actionValue = joinActions(form.actions);

  const save = async () => {
    if (form.actions.length === 0) {
      setError("Pick at least one action — Add, Update, or both.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // Every tracked field goes up, so the server can diff the whole request
      // and write exactly what changed — with WHO changed it — into this
      // edit's own UPDATE log row.
      await backdateService.updateRequest(request.id, {
        sap_username: form.sap_username.trim(),
        document_type_name: form.document_type_name,
        action: actionValue,
        from_date: form.from_date,
        to_date: form.to_date,
        time_limit: fromLocalInput(form.time_limit),
        remarks: form.remarks,
      });
      onSaved(`Request #${request.id} updated.`);
    } catch (e) {
      setError(backdateError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-4 rounded-lg border border-brand bg-brand-soft/40 px-3.5 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="m-0 text-[12px] font-semibold uppercase tracking-wide text-brand">
          Edit request
        </h4>
        {/* Said once, here, rather than leaving a disabled company box to be
            puzzled over. */}
        <span className="text-[12px] text-subtle">
          Company stays <strong className="font-semibold">{request.company}</strong> —
          it decides the approval route
        </span>
      </div>

      {error && (
        <div className="mb-3 whitespace-pre-wrap rounded-lg bg-bad-soft px-3 py-2.5 text-[13px] text-bad">
          {error}
        </div>
      )}
      {mastersError && (
        <div className="mb-3 rounded-lg bg-hold-soft px-3 py-2.5 text-[12.5px] text-hold">
          SAP&rsquo;s lists could not be loaded, so the user and document type
          are free text for now: {mastersError}
        </div>
      )}

      <FormGrid>
        <Field label="SAP User" required>
          {(c) =>
            userOptions.length > 0 ? (
              <SearchSelect<string>
                id={c.id}
                value={form.sap_username}
                onChange={(v) => setForm({ ...form, sap_username: String(v) })}
                options={userOptions}
                placeholder={loadingMasters ? "Loading SAP users…" : "Select a SAP user"}
                searchPlaceholder="Search SAP users"
                maxShown={80}
              />
            ) : (
              <Input
                {...c}
                value={form.sap_username}
                maxLength={20}
                placeholder={loadingMasters ? "Loading…" : "USER12"}
                onChange={(e) =>
                  setForm({ ...form, sap_username: e.target.value })}
              />
            )
          }
        </Field>

        <Field label="Document Type" required>
          {(c) =>
            typeOptions.length > 0 ? (
              <SearchSelect<string>
                id={c.id}
                value={form.document_type_name}
                onChange={(v) =>
                  setForm({ ...form, document_type_name: String(v) })}
                options={typeOptions}
                placeholder={loadingMasters ? "Loading document types…" : "Select a document type"}
                searchPlaceholder="Search document types"
                maxShown={80}
              />
            ) : (
              <Input
                {...c}
                value={form.document_type_name}
                maxLength={120}
                placeholder={loadingMasters ? "Loading…" : "A/R Invoice"}
                onChange={(e) =>
                  setForm({ ...form, document_type_name: e.target.value })}
              />
            )
          }
        </Field>

        <Field label="Action" required>
          {(c) => (
            <MultiSelect<BackDateAction>
              id={c.id}
              value={form.actions}
              onChange={(next) =>
                setForm({
                  ...form,
                  actions: ACTIONS.map((a) => a.value).filter((a) =>
                    next.includes(a),
                  ),
                })
              }
              options={ACTIONS}
              placeholder="Select action"
            />
          )}
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

      <Field label="Reason for this change">
        {(c) => (
          <Textarea
            {...c}
            rows={2}
            placeholder="Recorded against this edit in the request's history"
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          />
        )}
      </Field>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2.5">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </section>
  );
}

/** `"A,U"` as the pair of ticks the form works in. */
function splitActions(value: string): BackDateAction[] {
  const picked = (value || "").split(",").map((a) => a.trim());
  return ACTIONS.map((a) => a.value).filter((a) => picked.includes(a));
}

/**
 * The ticks back as one stored value.
 *
 * Both ticked is `"A,U"` — ONE request with a wider recorded scope, never two.
 * `OPEN_BKDT` has no action parameter, so splitting the pair would write SAP
 * rows identical in every column SAP reads.
 */
function joinActions(actions: BackDateAction[]): BackDateActionValue {
  // Ordered by ACTIONS, so "U" then "A" ticked still stores "A,U" — one
  // spelling, not two that a diff would report as a change.
  return ACTIONS.map((a) => a.value)
    .filter((a) => actions.includes(a))
    .join(",") as BackDateActionValue;
}

/**
 * A `datetime-local` value as an unambiguous instant.
 *
 * THE INPUT IS A WALL CLOCK, NOT AN INSTANT. `<input type="datetime-local">`
 * yields `"2026-09-16T14:00"` with no zone at all, and the server reads a
 * zoneless timestamp as UTC — so "2 o'clock" arrived as 14:00 UTC, which is
 * 19:30 in Indian time, and every request read back 5h30m later than the
 * person typing it meant.
 *
 * `new Date(value)` resolves it in the BROWSER's zone, which is precisely the
 * clock the user read it off. Sending the instant leaves nothing to assume.
 *
 * The inverse of `toLocalInput`, and the reason both must exist: reading
 * already converted, writing did not.
 */
function fromLocalInput(value: string) {
  if (!value) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/** An ISO timestamp as `datetime-local` wants it, in the viewer's own zone. */
function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-`
    + `${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ================================================================== *
 * Progress
 * ================================================================== */

/**
 * One node on the progress line: a dot on a rail, then its detail rows.
 *
 * Shared by the creation event, any edits, and every stage, so they line up
 * on one rail instead of three lists that happen to sit under each other.
 */
function TimelineNode({
  tone,
  icon: Icon,
  title,
  subtitle,
  state,
  stateTone,
  rows,
  last,
  extra,
}: {
  tone: string;
  icon: typeof HiCheckCircle;
  title: string;
  subtitle?: string;
  state: string;
  stateTone: string;
  rows: [string, React.ReactNode][];
  last: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      {/* The rail: a dot per event, joined by a line that stops at the last
          one rather than trailing into nothing. */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "mt-1 grid size-6 shrink-0 place-items-center rounded-full",
            tone,
          )}
        >
          <Icon className="size-3.5 text-white" aria-hidden />
        </span>
        {!last && <span className="w-px flex-1 bg-line" />}
      </div>

      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-4")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[13px] font-semibold text-ink">
            {title}
            {subtitle && (
              <span className="font-normal text-subtle"> · {subtitle}</span>
            )}
          </span>
          <span className={cn("text-[12.5px] font-medium", stateTone)}>
            {state}
          </span>
        </div>

        <dl className="m-0 mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
          {rows.map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-subtle">{label}</dt>
              <dd className="m-0 whitespace-pre-wrap text-body">{value}</dd>
            </Fragment>
          ))}
        </dl>
        {extra}
      </div>
    </li>
  );
}

/** How each stage state reads, and how it is coloured. */
const STAGE_STATES: Record<
  BackDateStageProgress["status"],
  { label: string; tone: string; dot: string; icon: typeof HiCheckCircle }
> = {
  APPROVED: { label: "Approved", tone: "text-ok", dot: "bg-ok", icon: HiCheckCircle },
  REJECTED: { label: "Rejected", tone: "text-bad", dot: "bg-bad", icon: HiXCircle },
  AWAITING: { label: "Awaiting review", tone: "text-hold", dot: "bg-hold", icon: HiClock },
  UPCOMING: { label: "Not yet reached", tone: "text-subtle", dot: "bg-line-strong", icon: HiClock },
  SKIPPED: { label: "Never reached", tone: "text-subtle", dot: "bg-line-strong", icon: HiMinusCircle },
};

/**
 * Where a request is, stage by stage.
 *
 * Separate from the detail dialog because it answers a different question:
 * the detail says WHAT was asked for, this says HOW FAR it has got and who is
 * holding it. Stages ahead are shown too — a requester chasing an approval
 * needs to know there are two more people after this one.
 *
 * Every reviewer name is resolved server-side from the CURRENT configuration,
 * so a stage reassigned or covered by a stand-in reads correctly here without
 * anything being stored against the request.
 */
export function RequestProgressDialog({
  request,
  onClose,
}: {
  request: BackDateRequest | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Request progress" size="lg">
        {request && (
          <RequestProgressBody
            key={request.id}
            request={request}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RequestProgressBody({
  request,
  onClose,
}: {
  request: BackDateRequest;
  onClose: () => void;
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

  const stages = history?.stages ?? [];
  /*
   * A progress line that starts at the first APPROVER is missing its first
   * event. The entry began when somebody raised it, and an approver reading
   * this needs to see who that was and what they said.
   */
  const created = history?.actions.find((a) => a.action === "CREATE");
  /*
   * Edits belong on the line too: they happen BETWEEN creation and approval,
   * and an approver deciding today should see that the dates moved after the
   * request was first raised.
   */
  const edits = history?.actions.filter((a) => a.action === "UPDATE") ?? [];

  return (
    <>
      <DialogHeader className="pr-10">
        <div className="min-w-0">
          <DialogTitle>BackDate Request #{request.id} — progress</DialogTitle>
          <DialogDescription className="mt-0.5">
            {request.sap_username} · {request.company_label} ·{" "}
            {request.flow?.workflow_code}
          </DialogDescription>
        </div>
      </DialogHeader>

      <DialogBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge request={request} />
          {request.flow && request.flow.total_stage > 0 && (
            <span className="text-[12.5px] text-subtle">
              {request.flow.current_stage
                ? `Stage ${request.flow.current_stage_sequence} of ${request.flow.total_stage}`
                : `${request.flow.total_stage} stage${request.flow.total_stage === 1 ? "" : "s"}`}
            </span>
          )}
        </div>

        <StateBlock
          loading={loading}
          error={error}
          empty={!loading && !error && stages.length === 0}
          emptyText="This request has no approval stages configured."
        />

        {!loading && !error && (
          <ol className="m-0 list-none p-0">
            <TimelineNode
              tone="bg-brand"
              icon={HiPlus}
              title="Created"
              state="Raised"
              stateTone="text-brand"
              last={stages.length === 0 && edits.length === 0}
              rows={[
                ["Created by",
                 created?.acted_by_username || request.created_by_username],
                ["Timestamp",
                 new Date(created?.acted_at ?? request.created_at)
                   .toLocaleString()],
                ["Remarks", created?.remarks || "No remarks"],
              ]}
            />

            {edits.map((entry) => (
              <TimelineNode
                key={`edit-${entry.id}`}
                tone="bg-hold"
                icon={HiPencilSquare}
                title="Updated"
                state="Edited"
                stateTone="text-hold"
                last={false}
                rows={[
                  ["Edited by", entry.acted_by_username || "—"],
                  ["Timestamp", new Date(entry.acted_at).toLocaleString()],
                  ["Remarks", entry.remarks || "No remarks"],
                ]}
                extra={<ChangedData data={entry.action_data} />}
              />
            ))}

            {stages.map((stage, index) => {
              const state = STAGE_STATES[stage.status];
              return (
                <TimelineNode
                  key={stage.stage_id}
                  tone={state.dot}
                  icon={state.icon}
                  title={stage.stage_name}
                  subtitle={`Stage ${stage.sequence}`}
                  state={state.label}
                  stateTone={state.tone}
                  last={
                    index === stages.length - 1 && !request.flow?.hana_status
                  }
                  rows={[
                    [
                      "Reviewer",
                      /* Who ACTED on a decided stage; who WOULD act on one
                         still ahead. Different facts, same row, and the
                         covering note says when they differ. */
                      <>
                        {stage.acted_by || stage.reviewer || "—"}
                        {!stage.acted_by && stage.has_active_replacement && (
                          <span className="text-hold">
                            {" "}(covering {stage.configured_reviewer})
                          </span>
                        )}
                      </>,
                    ],
                    [
                      "Timestamp",
                      stage.acted_at
                        ? new Date(stage.acted_at).toLocaleString()
                        : "—",
                    ],
                    ["Remarks", stage.remarks || "No remarks"],
                  ]}
                />
              );
            })}

            {/* Last on the same rail: the SAP write is the final event of an
                approved request, not a footnote under the history of it. */}
            {request.flow?.hana_status && (
              <SapTimelineNode flow={request.flow} />
            )}
          </ol>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  );
}

/* ================================================================== *
 * Detail + history
 * ================================================================== */

export function RequestDetailDialog({
  request,
  onClose,
  footer,
  onEdited,
}: {
  request: BackDateRequest | null;
  onClose: () => void;
  footer?: React.ReactNode;
  /** Called after a successful edit, so the caller can reload its list. */
  onEdited?: (message: string) => void;
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
            onEdited={onEdited}
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
  onEdited,
}: {
  request: BackDateRequest;
  onClose: () => void;
  footer?: React.ReactNode;
  onEdited?: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  /*
   * WHAT was asked for, and nothing about how far it has got. Where the
   * request is, who holds it and what has happened to it are all in the
   * Progress dialog — one place, not two that can read differently.
   */
  return (
    <>
      <DialogHeader className="pr-10">
        <div className="flex min-w-0 items-center gap-3">
          {/* The id is unique and is what somebody quotes when they ask about
              an entry, so it leads rather than hiding inside a sentence. */}
          <span className="shrink-0 rounded-lg bg-brand px-2.5 py-1 font-mono text-[15px] font-bold text-white">
            #{request.id}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle>BackDate Request</DialogTitle>
            <DialogDescription className="mt-0.5">
              {request.sap_username} · {request.company_label} ·{" "}
              {formatDate(request.from_date)} to {formatDate(request.to_date)}
            </DialogDescription>
          </div>
          {/* Edit sits by the title because the reason to reach for it is
              usually the SAP error further down: correct the request, then
              approve again. `can_edit` is the SERVER's answer for this caller
              and this request — offering a control that is going to 403 is
              worse than not offering it. */}
          {!editing && request.can_edit && (
            <Button
              variant="secondary"
              size="sm"
              aria-label="Edit this request"
              onClick={() => setEditing(true)}
            >
              <HiPencilSquare aria-hidden /> Edit
            </Button>
          )}
        </div>
      </DialogHeader>

      <DialogBody>
        {editing && (
          <EditRequestForm
            request={request}
            onCancel={() => setEditing(false)}
            onSaved={(message) => {
              setEditing(false);
              onEdited?.(message);
              onClose();
            }}
          />
        )}

        {/* Grouped rather than one long list: a reader is asking three
            different questions — what was asked for, who for, and over what
            window — and a flat table makes them hunt. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge request={request} />
          {request.companies.map((c) => (
            <Badge key={c} tone="info" caps>{c}</Badge>
          ))}
        </div>

        <InfoGroup title="Request information">
          <InfoRow label="Document type" value={request.document_type_name} />
          <InfoRow label="Action" value={request.action_label} />
          {/* No "Reason" here. A request has no single reason: the one given
              at creation, at each edit, and with each decision are different
              statements by different people, and they are all in Progress,
              each against the event it explains. */}
        </InfoGroup>

        <InfoGroup title="User details">
          <InfoRow label="Branch" value={request.company_label} />
          <InfoRow label="SAP user" value={request.sap_username} />
          <InfoRow label="Created by" value={request.created_by_username} />
        </InfoGroup>

        <InfoGroup title="Timeline">
          <InfoRow label="From date" value={formatDate(request.from_date)} />
          <InfoRow label="To date" value={formatDate(request.to_date)} />
          <InfoRow
            label="Time limit"
            value={request.time_limit
              ? new Date(request.time_limit).toLocaleString()
              : "—"}
          />
          <InfoRow
            label="Created on"
            value={new Date(request.created_at).toLocaleString()}
          />
        </InfoGroup>

        {/* SAP sits after Timeline, as its own box: it is the last thing
            that happens to a request and the first thing somebody looks for
            when a grant did not appear. It is absent until SAP has actually
            been called — an empty box would imply it had. */}
        {request.flow?.hana_status && (
          <section className="mb-4 rounded-lg border border-line px-3.5 py-3">
            <h4 className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-wide text-brand">
              SAP response
            </h4>
            {/* The same node the progress timeline ends with, so the two can
                never describe one SAP call differently. `<ol>` because the
                node is an `<li>`; one item, no rail to draw. */}
            <ol className="m-0 list-none p-0">
              <SapTimelineNode flow={request.flow} />
            </ol>
          </section>
        )}

      </DialogBody>

      <DialogFooter>
        {footer}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  );
}
