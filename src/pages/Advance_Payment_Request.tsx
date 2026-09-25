/**
 * Payments — the requester's page: their ENTRIES, and a NEW REQUEST.
 *
 * Laid out like BackDate's: KPI cards that are the status filter, an Entries
 * / New Request tab strip, and search / company / status controls beside it
 * while the list is showing. The point of the Entries tab is that a requester
 * can see where their request is — which stage it waits at and on whom,
 * returned to them and why, completed, rejected — without asking anyone.
 *
 * Everything is the server's (`/api/advance-payments/requests/`): raising a
 * request saves it and routes it to its first approver in one step. The
 * creator may edit or cancel it until a stage approves it, and again when it
 * is RETURNED to them, when saving can resubmit it; the server enforces the
 * same rule and the buttons only follow `api.can`.
 */
import { useMemo, useState } from "react";
import { HiOutlineBanknotes, HiPlus } from "react-icons/hi2";

import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import { Field, Textarea } from "../components/ui/form";
import { Card, CardHeader, CardTitle, Notice, Page, PageHeader, StatRow } from "../components/ui/page";
import { Tab, TabList } from "../components/ui/tabs";
import { advancePaymentError, advancePaymentService } from "../services/advancePaymentService";

import { AdvancePaymentForm } from "./advancePayments/AdvancePaymentForm";
import { requestAmount, type AdvanceRequestEntry } from "./advancePayments/approvalData";
import type { FileAttachment } from "./advancePayments/attachments";
import { PayoutDetailsForm } from "./advancePayments/PayoutDetailsForm";
import { DecisionSummary, DocumentLines, RequestSummary } from "./advancePayments/RequestDetails";
import {
  NO_FILTERS,
  PRIORITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  filterRequests,
  formatDateTime,
  priorityLabel,
  requestCounts,
  type RequestFilterState,
  type StatusFilter,
} from "./advancePayments/requestLabels";
import { RequestFilters, RequestKpis, RequestTable } from "./advancePayments/RequestList";
import { RequestHistory, RouteTimeline, SapPayment } from "./advancePayments/RequestProgress";
import { toApiRequest } from "./advancePayments/requestApi";
import { useRequestDetail, useRequestList, useStoreRequest } from "./advancePayments/requestQueries";
import { formatINR, type RequestForm } from "./advancePayments/rules";

type PageTab = "entries" | "create";

const pageTitle = (
  <span className="flex items-center gap-2.5">
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-white">
      <HiOutlineBanknotes className="size-4" aria-hidden="true" />
    </span>
    Payments
  </span>
);

/** The server's message, thrown so the form shows it above its buttons. */
function rethrow(err: unknown): never {
  throw new Error(advancePaymentError(err));
}

const newFiles = (files: FileAttachment[]) => files.flatMap((f) => (f.file ? [f.file] : []));

/** A request as its requester sees it — where it stands, and what they may still do. */
function EntryDetails({ id, onBack }: { id: number; onBack: () => void }) {
  const detail = useRequestDetail(id);
  const store = useStoreRequest();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const entry = detail.data;
  if (!entry) {
    return (
      <Page>
        <Breadcrumbs items={[{ label: "Payments", onClick: onBack }, { label: "Request" }]} />
        {detail.isError ? (
          <Notice tone="bad" title="Could not open the request">
            {advancePaymentError(detail.error)}
          </Notice>
        ) : (
          <p className="text-[13px] text-subtle">Loading…</p>
        )}
      </Page>
    );
  }

  const amount = requestAmount(entry.form);
  const can = entry.api.can;
  const version = entry.api.flow?.version;

  const save = async (form: RequestForm, files: FileAttachment[], resubmit: boolean) => {
    try {
      const kept = new Set(files.map((f) => f.serverId).filter(Boolean));
      const api = await advancePaymentService.editRequest(entry.serverId, toApiRequest(form), {
        files: newFiles(files),
        removeFileIds: entry.files.flatMap((f) => (f.serverId && !kept.has(f.serverId) ? [f.serverId] : [])),
        resubmit,
        version,
      });
      store(api);
      setEditing(false);
      setNotice({
        tone: "ok",
        text: resubmit
          ? `Resubmitted — now waiting at ${api.flow?.current_stage || "its first stage"}.`
          : "Changes saved.",
      });
    } catch (err) {
      rethrow(err);
    }
  };

  const act = async (action: "cancel" | "resubmit") => {
    setBusy(true);
    try {
      const api = await advancePaymentService.act(entry.serverId, action, remarks.trim(), version);
      store(api);
      setCancelling(false);
      setRemarks("");
      setNotice({
        tone: "ok",
        text: action === "cancel" ? "Request cancelled." : `Resubmitted — now waiting at ${api.flow?.current_stage}.`,
      });
    } catch (err) {
      setNotice({ tone: "bad", text: advancePaymentError(err) });
    } finally {
      setBusy(false);
    }
  };

  const returned = entry.status === "RETURNED";

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Payments", onClick: onBack }, { label: entry.requestNo }]} />

      <PageHeader
        eyebrow="Payments"
        title={entry.requestNo}
        badges={
          <>
            <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
            <Badge tone={PRIORITY_TONE[entry.form.priority]}>{priorityLabel(entry)} priority</Badge>
          </>
        }
        description={`Raised by ${entry.requestedBy} on ${formatDateTime(entry.requestedOn)} · ${formatINR(amount)}`}
        actions={
          <>
            {can.edit && !editing ? (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit Request
              </Button>
            ) : null}
            {can.cancel && !editing ? (
              <Button variant="danger" onClick={() => setCancelling(true)}>
                Cancel Request
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onBack}>
              Back to entries
            </Button>
          </>
        }
      />

      {notice ? (
        <Notice tone={notice.tone} title={notice.tone === "ok" ? "Done" : "Not done"}>
          {notice.text}
        </Notice>
      ) : null}

      {returned && entry.decision ? (
        <Notice tone="hold" title={`Returned to you by ${entry.decision.by}`}>
          {entry.decision.remarks} — edit the request and resubmit it, or cancel it.
        </Notice>
      ) : null}

      {cancelling ? (
        <Card className="p-4 md:p-5">
          <CardHeader>
            <CardTitle>Cancel {entry.requestNo}?</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <Field label="Reason" hint="Optional.">
              {(f) => (
                <Textarea {...f} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelling(false)} disabled={busy}>
                Keep it
              </Button>
              <Button variant="danger" onClick={() => void act("cancel")} disabled={busy}>
                Cancel Request
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {editing ? (
        <Card className="p-4 md:p-5">
          <AdvancePaymentForm
            initial={entry.form}
            initialFiles={entry.files}
            submitLabel={returned ? "Save & Resubmit" : "Save Changes"}
            secondarySubmit={
              returned ? { label: "Save Only", onSubmit: (form, files) => save(form, files, false) } : undefined
            }
            intro={
              <Notice tone="info" title="Editing">
                {returned
                  ? "Resubmitting starts the approval again from its first stage."
                  : "No one has approved it yet, so it can still be changed."}
              </Notice>
            }
            onCancel={() => setEditing(false)}
            onSubmit={(form, files) => save(form, files, returned)}
          />
        </Card>
      ) : (
        <>
          <Card className="p-4 md:p-5">
            <CardHeader>
              <CardTitle>Status</CardTitle>
              {can.resubmit ? (
                <Button variant="primary" size="xs" onClick={() => void act("resubmit")} disabled={busy}>
                  Resubmit as it is
                </Button>
              ) : null}
            </CardHeader>
            <div className="space-y-4">
              <DecisionSummary entry={entry} />
              <RouteTimeline entry={entry} />
              <SapPayment entry={entry} />
            </div>
          </Card>

          <Card className="p-4 md:p-5">
            <CardHeader>
              <CardTitle>Request Details</CardTitle>
            </CardHeader>
            <RequestSummary entry={entry} />
          </Card>

          <DocumentLines entry={entry} />

          {/* How it was paid — shown once it is completed, never before:
              until then the approvers are still deciding it. */}
          {entry.status === "APPROVED" && entry.payout ? (
            <Card className="p-4 md:p-5">
              <CardHeader>
                <CardTitle>Payment &amp; Bank Details</CardTitle>
              </CardHeader>
              <PayoutDetailsForm
                value={entry.payout}
                onChange={() => {}}
                requestAmount={amount}
                readOnly
                company={entry.form.company}
                payeeCardCode={entry.form.type === "EMPLOYEE_ADVANCE" ? "" : entry.form.partner}
              />
            </Card>
          ) : null}

          <Card className="p-4 md:p-5">
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <RequestHistory entry={entry} />
          </Card>
        </>
      )}
    </Page>
  );
}

export default function Advance_Payment_Request() {
  const list = useRequestList("mine");
  const store = useStoreRequest();
  const entries = useMemo(() => list.data ?? [], [list.data]);
  const [tab, setTab] = useState<PageTab>("entries");
  const [filters, setFilters] = useState<RequestFilterState>(NO_FILTERS);
  const [openId, setOpenId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  // The cards count what the search and company filters leave, whatever the
  // status filter — a card must not read 0 just because it is not selected.
  const counts = useMemo(
    () => requestCounts(filterRequests(entries, { ...filters, status: "" })),
    [entries, filters],
  );
  const shown = filterRequests(entries, filters);

  /** A card clicked while on New Request takes you back to the list. */
  const showEntries = (status: StatusFilter) => {
    setFilters({ ...filters, status });
    setTab("entries");
  };

  if (openId !== null) return <EntryDetails id={openId} onBack={() => setOpenId(null)} />;

  const raise = async (form: RequestForm, files: FileAttachment[]) => {
    try {
      const api = await advancePaymentService.createRequest(toApiRequest(form), newFiles(files));
      const entry: AdvanceRequestEntry = store(api);
      // Straight back to the list, showing it where it now sits.
      setFilters({ ...NO_FILTERS, status: "PENDING" });
      setTab("entries");
      setNotice(
        `${entry.requestNo} raised for ${formatINR(requestAmount(form))} — it is now waiting at ` +
          `${api.flow?.current_stage || "its first stage"}.`,
      );
    } catch (err) {
      rethrow(err);
    }
  };

  return (
    <Page>
      <Breadcrumbs
        items={[
          { label: "Payments" },
          { label: tab === "entries" ? "Entries" : "New Request" },
        ]}
      />

      <PageHeader
        eyebrow="Payments"
        title={pageTitle}
        description="Raise advance payments to vendors and employees, and follow each one through approval."
      />

      {notice ? (
        <Notice tone="ok" title="Submitted">
          {notice}
        </Notice>
      ) : null}

      {list.isError ? (
        <Notice tone="bad" title="Could not load your requests">
          {advancePaymentError(list.error)}
        </Notice>
      ) : null}

      <StatRow>
        <RequestKpis
          counts={counts}
          status={filters.status}
          live={tab === "entries"}
          onSelect={showEntries}
        />
      </StatRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabList label="Payments">
          <Tab selected={tab === "entries"} onClick={() => setTab("entries")}>
            Entries
          </Tab>
          <Tab
            selected={tab === "create"}
            onClick={() => {
              setTab("create");
              setNotice("");
            }}
          >
            <HiPlus aria-hidden /> New Request
          </Tab>
        </TabList>

        {/* Filtering belongs to the list, so the controls are only offered
            while the list is the thing on screen. */}
        {tab === "entries" ? <RequestFilters value={filters} onChange={setFilters} /> : null}
      </div>

      {tab === "create" ? (
        <Card className="p-4 md:p-5">
          <AdvancePaymentForm onCancel={() => setTab("entries")} onSubmit={raise} />
        </Card>
      ) : (
        <Card className="p-4 md:p-5">
          <RequestTable
            entries={shown}
            onOpen={(e) => setOpenId(e.serverId)}
            action={() => ({ label: "Details", variant: "secondary" })}
            emptyText={
              list.isLoading
                ? "Loading…"
                : filters.search || filters.company || filters.status
                  ? "No requests match these filters."
                  : "No payment requests yet."
            }
          />
        </Card>
      )}
    </Page>
  );
}
