/**
 * The pieces both Credit Limit pages show: the request table, the status
 * badge, the attachment link and the detail dialog (facts, stage progress and
 * history in one place).
 *
 * One definition rather than two, for the same reason as BackDate: the
 * requester and the approver are looking at the same request, and two
 * renderings that drift make it read differently depending on who opened it.
 *
 * Deliberately light: fields are separated by space (`DetailGrid`), sections
 * by a caption (`SectionHeading`), progress is the shared `Timeline`. No box
 * inside the dialog's own box.
 */
import { useEffect, useState } from "react";
import { HiExclamationCircle, HiOutlinePaperClip } from "react-icons/hi2";

import { Badge, type BadgeTone } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DetailField, DetailGrid } from "../../components/ui/detail";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Notice, SectionHeading } from "../../components/ui/page";
import { SegmentedControl } from "../../components/ui/segmented";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Timeline,
  TimelineHead,
  TimelineItem,
  TimelineNote,
} from "../../components/ui/timeline";
import {
  CREDIT_LIMIT_COMPANIES,
  creditLimitError,
  creditLimitService,
  type CreditLimitAttachment,
  type CreditLimitCompany,
  type CreditLimitHistory,
  type CreditLimitRequest,
  type CreditLimitStageProgress,
  type CreditLimitStatus,
} from "../../services/creditLimitService";
import { formatAmount, formatDate, formatDateTime } from "./format";

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

export type StatusFilter = "" | CreditLimitStatus;
export type CompanyFilter = "" | CreditLimitCompany;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const COMPANY_OPTIONS: { value: CompanyFilter; label: string }[] = [
  { value: "", label: "All companies" },
  ...CREDIT_LIMIT_COMPANIES.map((c) => ({ value: c, label: c })),
];

export function StatusFilterControl({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  return (
    <SegmentedControl<StatusFilter>
      aria-label="Filter requests by status"
      size="xs"
      value={value}
      onChange={onChange}
      options={STATUS_OPTIONS}
    />
  );
}

export function CompanyFilterControl({
  value,
  onChange,
}: {
  value: CompanyFilter;
  onChange: (v: CompanyFilter) => void;
}) {
  return (
    <SegmentedControl<CompanyFilter>
      aria-label="Filter requests by company"
      size="xs"
      value={value}
      onChange={onChange}
      options={COMPANY_OPTIONS}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Status + state
 * ------------------------------------------------------------------ */

const STATUS_TONE: Record<CreditLimitStatus, BadgeTone> = {
  PENDING: "hold",
  APPROVED: "ok",
  REJECTED: "bad",
};

export function StatusBadge({ request }: { request: CreditLimitRequest }) {
  const status = request.flow?.status;
  if (!status) return <Badge tone="neutral" caps>Not submitted</Badge>;
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} caps>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

/** "Stage 2 of 3 · Finance (tannu)" for a pending request. */
function stageLine(request: CreditLimitRequest): string {
  const flow = request.flow;
  if (!flow || flow.status !== "PENDING" || !flow.current_stage_sequence) return "";
  const who = flow.current_user_username ? ` (${flow.current_user_username})` : "";
  return `Stage ${flow.current_stage_sequence} of ${flow.total_stage} · ${flow.current_stage_name}${who}`;
}

export function StateBlock({
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
    return <p className="px-5 py-12 text-center text-[13px] text-subtle">{emptyText}</p>;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Attachment
 * ------------------------------------------------------------------ */

/** A server error body that arrived as a Blob (responseType: "blob"). */
async function blobError(error: unknown): Promise<string> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      // Not JSON.
    }
  }
  return creditLimitError(error);
}

/**
 * Open one of a request's files in a new tab.
 *
 * The endpoint needs the auth header, so a plain link cannot fetch it. The
 * tab is opened synchronously (while the browser still ties it to the click)
 * and pointed at the blob once it arrives; if it was blocked, the file is
 * downloaded instead.
 */
function AttachmentLink({
  requestId,
  attachment,
}: {
  requestId: number;
  attachment: CreditLimitAttachment;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const open = async () => {
    setOpening(true);
    setError("");
    const tab = window.open("", "_blank");
    try {
      const blob = await creditLimitService.attachment(requestId, attachment.id);
      const url = URL.createObjectURL(blob);
      if (tab && !tab.closed) {
        tab.location.href = url;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = attachment.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      tab?.close();
      setError(await blobError(e));
    } finally {
      setOpening(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Button
        variant="link"
        size="inline"
        onClick={() => void open()}
        disabled={opening}
        className="gap-1 text-brand"
      >
        <HiOutlinePaperClip aria-hidden />
        {opening ? "Opening…" : attachment.name}
      </Button>
      {error && <span className="text-[12px] text-bad">{error}</span>}
    </span>
  );
}

/** Every supporting document on a request, or a dash when there are none. */
export function AttachmentList({ request }: { request: CreditLimitRequest }) {
  const files = request.attachments ?? [];
  if (files.length === 0) return <span className="text-subtle">—</span>;
  return (
    <span className="flex flex-col items-start gap-1">
      {files.map((file) => (
        <AttachmentLink key={file.id} requestId={request.id} attachment={file} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Table
 * ------------------------------------------------------------------ */

export function RequestTable({
  rows,
  onOpen,
  showRequester = false,
}: {
  rows: CreditLimitRequest[];
  onOpen: (request: CreditLimitRequest) => void;
  /** The approver needs to know who asked; the requester already does. */
  showRequester?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Current limit</TableHead>
            <TableHead className="text-right">New limit</TableHead>
            <TableHead>Valid till</TableHead>
            <TableHead>Status</TableHead>
            {showRequester && <TableHead>Raised by</TableHead>}
            <TableHead className="text-right">
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-[12.5px] font-semibold text-ink">
                #{r.id}
              </TableCell>
              <TableCell>
                <div className="font-medium text-ink">{r.card_name || r.card_code}</div>
                <div className="text-[12px] text-subtle">
                  {r.card_code} · {r.company}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">
                {formatAmount(r.current_credit_limit)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-ink">
                {formatAmount(r.new_credit_limit)}
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(r.valid_till)}</TableCell>
              <TableCell>
                <StatusBadge request={r} />
                {stageLine(r) && (
                  <div className="mt-0.5 text-[12px] text-subtle">{stageLine(r)}</div>
                )}
              </TableCell>
              {showRequester && (
                <TableCell className="whitespace-nowrap">
                  <div>{r.created_by_username}</div>
                  <div className="text-[12px] text-subtle">{formatDateTime(r.created_at)}</div>
                </TableCell>
              )}
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onOpen(r)}>
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Detail dialog
 * ------------------------------------------------------------------ */

const STAGE_STATES: Record<
  CreditLimitStageProgress["status"],
  { label: string; tone: BadgeTone }
> = {
  APPROVED: { label: "Approved", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  AWAITING: { label: "Awaiting review", tone: "hold" },
  UPCOMING: { label: "Not yet reached", tone: "neutral" },
  SKIPPED: { label: "Never reached", tone: "neutral" },
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Raised",
  APPROVE: "Approved",
  REJECT: "Rejected",
};

export function RequestDetailDialog({
  request,
  onClose,
  footer,
}: {
  request: CreditLimitRequest | null;
  onClose: () => void;
  /** Extra footer actions — the approver's Approve / Reject. */
  footer?: React.ReactNode;
}) {
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Credit limit request" size="lg">
        {/* Keyed so a different request remounts with fresh history state. */}
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
  request: CreditLimitRequest;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const [history, setHistory] = useState<CreditLimitHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    creditLimitService
      .history(request.id)
      .then((data) => !cancelled && setHistory(data))
      .catch((e) => !cancelled && setError(creditLimitError(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  const stages = history?.stages ?? [];
  const actions = history?.actions ?? [];
  const flow = request.flow;

  return (
    <>
      <DialogHeader className="pr-10">
        <div className="min-w-0">
          <DialogTitle>
            Request #{request.id} · {request.card_name || request.card_code}
          </DialogTitle>
          <DialogDescription className="mt-0.5">
            {request.card_code} · {request.company}
            {flow?.workflow_code ? ` · ${flow.workflow_code}` : ""}
          </DialogDescription>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge request={request} />
          {stageLine(request) && (
            <span className="text-[12.5px] text-subtle">{stageLine(request)}</span>
          )}
        </div>

        {/* SAP's own words on the last write — on a refusal the request is
            still pending and this is what to correct. */}
        {flow?.sap_response && (
          <Notice tone={flow.status === "APPROVED" ? "ok" : "bad"} title="SAP">
            <span className="whitespace-pre-wrap break-words">{flow.sap_response}</span>
          </Notice>
        )}

        <DetailGrid>
          <DetailField label="Current limit" value={formatAmount(request.current_credit_limit)} />
          <DetailField label="New limit" value={formatAmount(request.new_credit_limit)} strong />
          <DetailField label="Balance" value={formatAmount(request.current_balance)} />
          <DetailField label="Main group" value={request.main_group} />
          <DetailField label="Valid till" value={formatDate(request.valid_till)} />
          <DetailField
            label={(request.attachments?.length ?? 0) > 1 ? "Attachments" : "Attachment"}
            value={<AttachmentList request={request} />}
          />
          <DetailField label="Raised by" value={request.created_by_username} />
          <DetailField label="Raised on" value={formatDateTime(request.created_at)} />
          <DetailField label="Remarks" value={request.remarks} span="full" />
        </DetailGrid>

        <section>
          <SectionHeading className="mb-3">Approval progress</SectionHeading>
          <StateBlock
            loading={loading}
            error={error}
            empty={stages.length === 0}
            emptyText="This request has no approval stages."
          />
          {!loading && !error && stages.length > 0 && (
            <Timeline>
              {stages.map((stage, i) => {
                const state = STAGE_STATES[stage.status] ?? STAGE_STATES.UPCOMING;
                return (
                  <TimelineItem
                    key={stage.stage_id}
                    tone={state.tone}
                    rail={stage.status === "APPROVED" ? "covered" : stage.status === "SKIPPED" ? "skipped" : "idle"}
                    last={i === stages.length - 1}
                  >
                    <TimelineHead>
                      <span>{stage.stage_name}</span>
                      <span className="font-normal text-subtle">Stage {stage.sequence}</span>
                      <Badge tone={state.tone}>{state.label}</Badge>
                      {stage.acted_at && <time>{formatDateTime(stage.acted_at)}</time>}
                    </TimelineHead>
                    <TimelineNote>
                      {stage.acted_by || stage.reviewer || "—"}
                      {stage.remarks ? ` — ${stage.remarks}` : ""}
                    </TimelineNote>
                  </TimelineItem>
                );
              })}
            </Timeline>
          )}
        </section>

        {!loading && !error && actions.length > 0 && (
          <section>
            <SectionHeading className="mb-3">History</SectionHeading>
            <ul className="m-0 list-none space-y-2 p-0 text-[12.5px]">
              {actions.map((a, i) => (
                <li key={a.id ?? i} className="flex flex-wrap gap-x-2">
                  <span className="font-medium text-ink">
                    {ACTION_LABELS[a.action] ?? a.action}
                  </span>
                  <span className="text-body">
                    by {a.acted_by_username || "—"}
                    {a.stage_name ? ` at ${a.stage_name}` : ""}
                  </span>
                  <time className="text-subtle">{formatDateTime(a.acted_at)}</time>
                  {a.remarks && (
                    <span className="basis-full whitespace-pre-wrap text-subtle">{a.remarks}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </DialogBody>

      <DialogFooter>
        {footer}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}
