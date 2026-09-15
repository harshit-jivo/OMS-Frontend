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
 */
import { useCallback, useEffect, useState } from "react";
import {
  HiArrowPath,
  HiCheckCircle,
  HiExclamationCircle,
  HiShieldCheck,
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
import { Field, Textarea } from "../components/ui/form";
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
import {
  backdateError,
  backdateService,
  type BackDateInsights,
  type BackDateRequest,
} from "../services/backdateService";
import {
  CompanyFilterSelect,
  KpiFilterRow,
  StatusFilterSelect,
  type CompanyFilter,
  type StatusFilter,
} from "./backdate/filters";
import { RequestDetailDialog } from "./BackDate";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export default function BackDateApproval() {
  /*
   * The desk opens on PENDING rather than on everything, because the only list
   * with anything to DO in it is the one waiting on this user. The other
   * statuses are a record of what they already decided.
   */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>("");
  const [rows, setRows] = useState<BackDateRequest[]>([]);
  const [insights, setInsights] = useState<BackDateInsights | null>(null);
  /**
   * Which rows came from the QUEUE — the ones this user may act on now.
   *
   * Not `statusFilter === "PENDING"`: the All view mixes the queue with
   * already-decided requests, and only the queue half is actionable. The
   * backend enforces this regardless; showing the buttons anywhere else would
   * just be offering a guaranteed 403.
   */
  const [actionable, setActionable] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [detail, setDetail] = useState<BackDateRequest | null>(null);
  const [deciding, setDeciding] = useState<{
    request: BackDateRequest;
    approve: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const scope = companyFilter ? { company: companyFilter } : {};

      // Pending is the SERVER's answer to "what may this user act on",
      // resolved from the stage's current effective user — not a client-side
      // filter over everything. Decided requests come from a different
      // endpoint, so All is the two of them merged rather than one call.
      const wantsQueue = statusFilter === "" || statusFilter === "PENDING";
      const wantsHistory = statusFilter !== "PENDING";

      const [queue, history, counts] = await Promise.all([
        wantsQueue ? backdateService.approvalQueue(scope) : Promise.resolve([]),
        wantsHistory
          ? backdateService.approvalHistory(
              statusFilter ? { ...scope, status: statusFilter } : scope,
            )
          : Promise.resolve([]),
        backdateService.approvalInsights(scope),
      ]);

      const queueIds = new Set(queue.map((r) => r.id));
      setActionable(queueIds);
      // Queue first: what needs doing sits above what is already done.
      setRows([...queue, ...history.filter((r) => !queueIds.has(r.id))]);
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

      {insights && (
        <StatRow className="mb-4">
          <KpiFilterRow
            counts={insights}
            status={statusFilter}
            onSelect={setStatusFilter}
          />
        </StatRow>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <CompanyFilterSelect value={companyFilter} onChange={setCompanyFilter} />
        <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
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
            {statusFilter === "PENDING"
              ? "Nothing is waiting for your approval. Requests appear here only when you are the current approver for their stage."
              : statusFilter
                ? `No requests you have ${statusFilter.toLowerCase()}` +
                  `${companyFilter ? ` for ${companyFilter}` : ""}.`
                : `No BackDate requests have reached you` +
                  `${companyFilter ? ` for ${companyFilter}` : ""} yet.`}
          </p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">ID</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>SAP User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Raised By</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-[12.5px]">{row.id}</TableCell>
                    <TableCell>
                      {/* One badge per company: the SET is the request, and
                          an approver is deciding all of it at once. */}
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
                    <TableCell>
                      <div>{row.created_by_username}</div>
                      <div className="text-[12px] text-subtle">
                        {formatDate(row.created_at)}
                      </div>
                    </TableCell>
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
                          {row.flow.has_active_replacement && (
                            <div className="text-[12px] text-hold">
                              you are covering {row.flow.current_user_username}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="secondary" size="sm" onClick={() => setDetail(row)}>
                          Details
                        </Button>
                        {actionable.has(row.id) && row.flow?.current_stage && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeciding({ request: row, approve: false })}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setDeciding({ request: row, approve: true })}
                            >
                              Approve
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <RequestDetailDialog request={detail} onClose={() => setDetail(null)} />

      <DecisionDialog
        pending={deciding}
        onClose={() => setDeciding(null)}
        onDone={(message) => {
          flash(message);
          void load();
        }}
      />
    </Page>
  );
}

/* ================================================================== *
 * Approve / reject
 * ================================================================== */

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
  // Decisions are addressed by REQUEST id: there is no task table, and a
  // request waits at one stage at a time, so nothing else is needed to say
  // which decision is being made.
  const canDecide = !!request.flow?.current_stage;

  const submit = async () => {
    if (!canDecide) return;
    // A rejection must say why — the requester is told the reason, and JSAP
    // told them nothing at all.
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
      } else if (result.hana_applied === false) {
        // Deliberately not phrased as success. The approval stands; the SAP
        // rights do not exist. JSAP reported 200/Success here regardless.
        onDone(
          `Request #${request.id} approved, but SAP did not accept the rights. ` +
            `${result.hana_status_text ?? ""} An administrator can retry the SAP write.`,
        );
      } else {
        onDone(`Request #${request.id} approved. Rights applied in SAP.`);
      }
    } catch (e) {
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
            <dd className="m-0 font-medium text-ink">{request.document_type}</dd>
            <dt className="text-subtle">Posting window</dt>
            <dd className="m-0 font-medium text-ink">
              {formatDate(request.from_date)} — {formatDate(request.to_date)}
            </dd>
            <dt className="text-subtle">Action</dt>
            <dd className="m-0 font-medium text-ink">{request.action_label}</dd>
            <dt className="text-subtle">Raised by</dt>
            <dd className="m-0 font-medium text-ink">{request.created_by_username}</dd>
            {request.remarks && (
              <>
                <dt className="text-subtle">Reason given</dt>
                <dd className="m-0 whitespace-pre-wrap text-body">{request.remarks}</dd>
              </>
            )}
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

          {/* Final approval is what actually grants the rights in SAP, so say
              so before the button is pressed rather than after. */}
          <p className="mt-3 rounded-lg bg-brand-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-brand">
            {approve
              ? "If this is the last stage, approving grants the back-posting rights in SAP immediately."
              : "Rejecting ends this request. The requester can raise a new one."}
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving || !canDecide}>
            {saving
              ? approve
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
