/**
 * BackDate Approval — decide requests for back-posting rights in SAP.
 *
 * TWO CONDITIONS GOVERN THIS PAGE, AND ONLY ONE OF THEM IS A PERMISSION.
 *
 *   1. `BackDate_Approval` — opens the page. Decided by `ProtectedPage` from
 *      `routeAccess.ts`, like every other route.
 *   2. being the workflow stage's current EFFECTIVE user — decides whether any
 *      particular request may be actioned.
 *
 * The second is enforced by the backend on every approve/reject, and this page
 * does not try to re-derive it: the Pending queue only ever contains what the
 * server says this user may act on, so "can I see it" and "can I decide it"
 * stay the same question. Holding the key alone shows an empty queue, which is
 * the honest outcome rather than a wall of buttons that all 403.
 *
 * That `effective` user is why a temporary replacement works with no code
 * here — during a delegation window the stand-in's queue fills and the
 * configured user's empties, without anything being reassigned.
 *
 * The table, the detail dialog and the progress dialog are the SAME components
 * the requester's page uses, imported rather than reimplemented: an approver
 * and a requester looking at one request must not be able to see two different
 * accounts of it.
 */
import { useCallback, useEffect, useState } from "react";
import {
  HiArrowPath,
  HiCheckCircle,
  HiExclamationCircle,
  HiShieldCheck,
} from "react-icons/hi2";

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
import { Field, Textarea } from "../components/ui/form";
import { Card, Page, PageHeader, StatRow } from "../components/ui/page";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHeader,
} from "../components/ui/table";
import {
  backdateError,
  backdateService,
  type BackDateInsights,
  type BackDateRequest,
} from "../services/backdateService";
import {
  EntryTableHead,
  EntryTableRow,
  RequestDetailDialog,
  RequestProgressDialog,
} from "./BackDate";
import {
  type CompanyFilter,
  CompanyFilterSelect,
  KpiFilterRow,
  SearchBox,
  type StatusFilter,
  StatusFilterSelect,
} from "./backdate/filters";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export default function BackDateApproval() {
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [company, setCompany] = useState<CompanyFilter>("");
  const [rows, setRows] = useState<BackDateRequest[]>([]);
  const [counts, setCounts] = useState<BackDateInsights | null>(null);
  /**
   * Which of the listed requests are ACTIONABLE by this user.
   *
   * The queue endpoint answers that question and the history endpoint does
   * not, so the ids are remembered rather than re-derived from a status: a
   * request can be PENDING and still not be this user's to decide.
   */
  const [actionable, setActionable] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [detail, setDetail] = useState<BackDateRequest | null>(null);
  const [progress, setProgress] = useState<BackDateRequest | null>(null);
  const [pending, setPending] = useState<
    { request: BackDateRequest; approve: boolean } | null
  >(null);

  // Typing an id should not be one request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        ...(company ? { company } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      };
      const wantsQueue = status === "" || status === "PENDING";
      const wantsHistory = status !== "PENDING";
      const [queue, history, insights] = await Promise.all([
        wantsQueue ? backdateService.approvalQueue(params) : Promise.resolve([]),
        wantsHistory
          ? backdateService.approvalHistory(
              status ? { ...params, status } : params,
            )
          : Promise.resolve([]),
        backdateService.approvalInsights(params),
      ]);
      const queueIds = new Set(queue.map((r) => r.id));
      setActionable(queueIds);
      // History can repeat a queued request when "All" is selected; the queue
      // copy wins because only it carries the right to act.
      setRows([...queue, ...history.filter((r) => !queueIds.has(r.id))]);
      setCounts(insights);
    } catch (e) {
      setError(backdateError(e));
    } finally {
      setLoading(false);
    }
  }, [status, company, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const announce = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 8000);
  };

  return (
    <Page>
      <PageHeader
        title="BackDate Approval"
        description="Approve or reject requests for back-posting rights in SAP"
        eyebrow={<HiShieldCheck aria-hidden />}
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

      {/* `StatRow`, not a `Card`: the cards ARE the row. Wrapping them in a
          card stacked them one per line down the page. */}
      {counts && (
        <StatRow className="mb-4">
          <KpiFilterRow counts={counts} status={status} onSelect={setStatus} />
        </StatRow>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search ID or SAP user"
        />
        <CompanyFilterSelect value={company} onChange={setCompany} />
        <StatusFilterSelect value={status} onChange={setStatus} />
      </div>

      <Card className="p-4 md:p-5">
        {loading && (
          <div className="space-y-2 py-2" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-bad">
            <HiExclamationCircle className="size-7" aria-hidden />
            <p className="whitespace-pre-wrap text-[13px]">{error}</p>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="px-5 py-12 text-center text-[13px] text-subtle">
            {status === "PENDING"
              ? "Nothing is waiting for your approval. Requests appear here only when you are the current approver for their stage."
              : status
                ? `No requests you have ${status.toLowerCase()}${company ? ` for ${company}` : ""}.`
                : `No BackDate requests have reached you${company ? ` for ${company}` : ""} yet.`}
          </p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <EntryTableHead />
              </TableHeader>
              <TableBody>
                {rows.map((request) => (
                  <EntryTableRow
                    key={request.id}
                    request={request}
                    onDetails={() => setDetail(request)}
                    onProgress={() => setProgress(request)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Deciding happens from the detail dialog, not the row: nobody should
          approve a grant from a table without having opened what it says. */}
      <RequestDetailDialog
        request={detail}
        onClose={() => setDetail(null)}
        onEdited={(message) => {
          announce(message);
          load();
        }}
        footer={
          detail && actionable.has(detail.id) && detail.flow?.current_stage ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setPending({ request: detail, approve: false })}
              >
                Reject
              </Button>
              <Button
                variant="primary"
                onClick={() => setPending({ request: detail, approve: true })}
              >
                Approve
              </Button>
            </>
          ) : undefined
        }
      />

      <RequestProgressDialog
        request={progress}
        onClose={() => setProgress(null)}
      />

      <DecisionDialog
        pending={pending}
        onClose={() => setPending(null)}
        onDone={(message) => {
          announce(message);
          load();
        }}
      />
    </Page>
  );
}

function DecisionDialog({
  pending,
  onClose,
  onDone,
}: {
  pending: { request: BackDateRequest; approve: boolean } | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setRemarks("");
    setFormError("");
  }, [pending]);

  if (!pending) {
    return (
      <Dialog open={false} onOpenChange={() => undefined}>
        <DialogContent title="BackDate decision" size="sm">
          <DialogBody />
        </DialogContent>
      </Dialog>
    );
  }

  const { request, approve } = pending;
  const canDecide = !!request.flow?.current_stage;

  const submit = async () => {
    if (!canDecide) return;
    if (!approve && !remarks.trim()) {
      setFormError("Please give a reason for the rejection.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const result = approve
        ? await backdateService.approve(request.id, remarks)
        : await backdateService.reject(request.id, remarks);

      onClose();
      if (!approve) {
        onDone(`Request #${request.id} rejected.`);
        return;
      }
      if (result.flow_status === "PENDING") {
        onDone(`Request #${request.id} approved and moved to the next stage.`);
      } else {
        // "Approved" can only be reached now by SAP having accepted the
        // grant: the last approval calls SAP first and is only written if it
        // succeeded. A refusal arrives as an error, below.
        onDone(`Request #${request.id} approved. Rights applied in SAP.`);
      }
    } catch (e) {
      // A SAP refusal means NOTHING was approved — the request is still
      // sitting at this stage. Say that, and show what SAP actually said, so
      // the approver can correct it from the Details dialog and try again.
      setFormError(backdateError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={approve ? "Approve BackDate Request" : "Reject BackDate Request"}
        size="md"
      >
        <DialogHeader className="pr-10">
          <div className="min-w-0">
            <DialogTitle>
              {approve ? "Approve BackDate Request" : "Reject BackDate Request"}
            </DialogTitle>
            <DialogDescription className="mt-0.5">
              #{request.id} · {request.sap_username} · {request.company}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody>
          {formError && (
            <div className="mb-3.5 rounded-lg bg-bad-soft px-3 py-2.5 text-[13px] whitespace-pre-wrap text-bad">
              {formError}
            </div>
          )}

          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[13px]">
            <dt className="text-subtle">Document type</dt>
            <dd className="m-0 font-medium text-ink">
              {request.document_type_name}
            </dd>
            <dt className="text-subtle">Posting window</dt>
            <dd className="m-0 font-medium text-ink">
              {formatDate(request.from_date)} — {formatDate(request.to_date)}
            </dd>
            <dt className="text-subtle">Action</dt>
            <dd className="m-0 font-medium text-ink">{request.action_label}</dd>
            <dt className="text-subtle">Raised by</dt>
            <dd className="m-0 font-medium text-ink">
              {request.created_by_username}
            </dd>
            {/* The reason for raising it is an action-log entry, not a field of
                the request, and Progress shows it beside every other remark
                with its author and its date. Repeating one of them here,
                stripped of both, is how a summary starts disagreeing with the
                history it summarises. */}
          </dl>

          <Field
            label={approve ? "Remarks" : "Reason for rejection"}
            required={!approve}
            hint={
              approve
                ? "Optional. Recorded in the approval history."
                : "The requester is told this."
            }
          >
            {(c) => (
              <Textarea
                {...c}
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            )}
          </Field>

          {/* SAP is a network call. An approver who cannot tell it is running
              will press the button again, so the busy state is a banner rather
              than a disabled button nobody looks at. */}
          {saving && approve ? (
            <div
              role="status"
              className="mt-3 flex items-center gap-2.5 rounded-lg bg-brand-soft px-3.5 py-2.5 text-[12.5px] text-brand"
            >
              <span
                className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent"
                aria-hidden
              />
              <span>
                Sending the grant to SAP. This can take a few seconds — the
                request is only approved once SAP accepts it.
              </span>
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-brand-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-brand">
              {approve
                ? "If this is the last stage, SAP is called FIRST — the request is approved only if SAP accepts the grant."
                : "Rejecting ends this request. The requester can raise a new one."}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={saving || !canDecide}
            aria-busy={saving}
          >
            {saving
              ? approve
                ? "Calling SAP…"
                : "Rejecting…"
              : approve
                ? "Approve"
                : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
