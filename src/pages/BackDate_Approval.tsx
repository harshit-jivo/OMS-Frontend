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
  HiXCircle,
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
  type DecisionResult,
} from "../services/backdateService";
import {
  EntryTableHead,
  EntryTableRow,
  RequestDetailDialog,
  RequestProgressDialog,
  SapResultList,
} from "./BackDate";
import {
  type CompanyFilter,
  CompanyFilterSelect,
  KpiFilterRow,
  SearchBox,
  type StatusFilter,
  StatusFilterSelect,
} from "./backdate/filters";
import { newestFirst } from "./backdate/ordering";
import { useDeepLinkedRequest } from "./backdate/useDeepLinkedRequest";

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
  // Starts TRUE. The first fetch is fired from an effect, so a `false` here
  // means one render claiming "loaded, nothing here" before anything has been
  // asked for — an empty-state flash, and the reason a deep-linked request
  // used to be looked for in a list that had not arrived yet.
  const [loading, setLoading] = useState(true);
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
      //
      // Then sorted as ONE list. Concatenating the two ordered each part and
      // the whole thing not at all: every pending request sat above every
      // decided one whatever its age, so under "All" the newest entry could
      // be halfway down the page.
      setRows(
        newestFirst([...queue, ...history.filter((r) => !queueIds.has(r.id))]),
      );
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

  // Arriving from a "needs your approval" notification: open that request's
  // detail dialog, which is the only place the decision can be made. If it is
  // in `rows` via the queue the Approve and Reject buttons come with it; if it
  // has since been decided by someone else it opens read-only, which is the
  // honest answer rather than buttons that would fail.
  useDeepLinkedRequest(rows, !loading, setDetail);

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

      {/* WHY A ROW CAN SAY "PENDING" UNDER "APPROVED".
          These two views list the stages THIS user decided, and a request
          carries on to the approvers above them afterwards — so the tab is
          about their decision and the Status column is about where the
          request has got to. Said out loud, because the two together look
          like a contradiction until you know which question each answers. */}
      {(status === "APPROVED" || status === "REJECTED") && (
        <p className="mb-3 text-[12.5px] text-subtle">
          Requests you {status === "APPROVED" ? "approved" : "rejected"} at
          your stage. The Status column shows where each one has got to since —
          it can still be pending with a later approver.
        </p>
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
        onDecided={() => {
          // The detail dialog is showing the request as it was BEFORE the
          // decision — PENDING, with Approve and Reject still offered. Close
          // it rather than leave a second chance to decide sitting open.
          setDetail(null);
          load();
        }}
        onDone={announce}
      />
    </Page>
  );
}

function DecisionDialog({
  pending,
  onClose,
  onDecided,
  onDone,
}: {
  pending: { request: BackDateRequest; approve: boolean } | null;
  onClose: () => void;
  /** The decision was accepted — close what is now stale, refresh the list. */
  onDecided: () => void;
  /** The approver dismissed the result. */
  onDone: (message: string) => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  /**
   * The decision that just landed, held on screen until the approver says Done.
   *
   * EVERY OUTCOME GETS ONE, not just a final approval. An intermediate
   * approval and a rejection used to close straight onto a banner behind the
   * still-open detail dialog, which went on showing PENDING with Approve and
   * Reject beside it — so the approver could not tell their decision had
   * registered, and the buttons invited them to make it twice. The same
   * dialog in the app (`BackDateDecisionDoneDialog`) already worked this way.
   *
   * On a FINAL approval it also holds SAP's own response on screen. That
   * moment — the one time the approver most wants to see what SAP said — used
   * to be the moment it disappeared.
   */
  const [done, setDone] = useState<
    { approved: boolean; result: DecisionResult } | null
  >(null);

  useEffect(() => {
    setRemarks("");
    setFormError("");
    setDone(null);
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
  /**
   * Whether THIS approval is the one that writes to SAP.
   *
   * Only the last stage calls SAP; every earlier approval just moves the
   * request on. Telling a first-stage approver "Sending the grant to SAP"
   * described something that was not happening — and made the one approval
   * that really does call SAP look no different from the rest.
   */
  const callsSap = approve && !!request.flow?.is_final_stage;

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

      // Decided. The detail dialog behind this one is now describing a
      // request that is no longer in that state, so the parent closes it and
      // refreshes the list NOW — the result dialog is then the only thing on
      // screen, and what is under it is already current.
      setDone({ approved: approve, result });
      onDecided();
    } catch (e) {
      // A SAP refusal means NOTHING was approved — the request is still
      // sitting at this stage. Say that, and show what SAP actually said, so
      // the approver can correct it from the Details dialog and try again.
      setFormError(backdateError(e));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    const { approved, result } = done;
    // A final approval is the one that wrote to SAP — the flow is finished.
    const isFinal = approved && result.flow_status === "APPROVED";
    const title = approved ? "Approved" : "Rejected";
    const subtitle = !approved
      ? "The requester has been told why"
      : isFinal
        ? "SAP accepted the grant"
        : "Forwarded to the next approver";
    const message = !approved
      ? `Request #${request.id} rejected.`
      : isFinal
        ? `Request #${request.id} approved. Rights applied in SAP.`
        : `Request #${request.id} approved and moved to the next stage.`;
    const finish = () => {
      onClose();
      onDone(message);
    };

    return (
      <Dialog open onOpenChange={(o) => !o && finish()}>
        <DialogContent title={title} size={isFinal ? "md" : "sm"}>
          <DialogBody>
            <div className="flex flex-col items-center px-2 pt-2 pb-1 text-center">
              <span
                className={
                  approved
                    ? "flex size-14 items-center justify-center rounded-full bg-ok-soft text-ok"
                    : "flex size-14 items-center justify-center rounded-full bg-bad-soft text-bad"
                }
              >
                {approved ? (
                  <HiCheckCircle className="size-8" aria-hidden />
                ) : (
                  <HiXCircle className="size-8" aria-hidden />
                )}
              </span>
              <DialogTitle className="mt-3">{title}</DialogTitle>
              <DialogDescription className="mt-1">
                #{request.id} · {subtitle}
              </DialogDescription>
              <p className="mt-3 text-[13px] leading-relaxed text-subtle">
                {!approved
                  ? "This ends the request. The requester can raise a new one."
                  : isFinal
                    ? "The back-posting rights are now in SAP."
                    : "It now waits for the next approver in the chain."}
              </p>
            </div>

            {/* The same component the Progress timeline ends with, so one SAP
                call cannot read two different ways. */}
            {isFinal && (
              <div className="mt-4">
                <SapResultList
                  status={result.hana_status ?? null}
                  text={result.hana_status_text ?? ""}
                />
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button variant="primary" onClick={finish}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

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
              #{request.id} · {request.sap_username} · {request.company_label}
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

          {/* THE SAP BOX IS FOR THE LAST APPROVER ONLY. Theirs is the approval
              that writes to SAP; everyone before them is moving the request on,
              and a banner about SAP over that was simply untrue.

              While SAP is being called the box becomes a busy banner rather
              than a disabled button nobody looks at: it is a network call of a
              few seconds, and an approver who cannot tell it is running will
              press the button again. */}
          {callsSap && saving && (
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
          )}
          {callsSap && !saving && (
            <p className="mt-3 rounded-lg bg-brand-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-brand">
              This is the final approval. SAP is called FIRST — the request is
              approved only if SAP accepts the grant.
            </p>
          )}
          {approve && !callsSap && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-subtle">
              After your approval it moves to the next approver.
            </p>
          )}
          {!approve && (
            <p className="mt-3 rounded-lg bg-brand-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-brand">
              Rejecting ends this request. The requester can raise a new one.
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
              ? callsSap
                ? "Calling SAP…"
                : approve
                  ? "Approving…"
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
