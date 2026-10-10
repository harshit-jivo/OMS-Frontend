/**
 * Where a request is on its route, and everything that has happened to it.
 *
 *   RouteTimeline   the workflow's stages, in order: done, waiting (and on
 *                   whom), or still to come — for this round
 *   SapPayment      the outgoing payment Audit posted, or why it failed
 *   RequestHistory  the append-only log, newest last, with each remark, and
 *                   under every edit what it changed: Was → Now
 *
 * All three read the server's record (`entry.api`); nothing here decides
 * anything.
 */
import { useState } from "react";

import { showToast } from "../../lib/toastStore";
import { Badge, type BadgeTone } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DetailField, DetailGrid } from "../../components/ui/detail";
import { Timeline, TimelineItem } from "../../components/ui/timeline";
import {
  advancePaymentError,
  advancePaymentService,
  type ApiRequestLog,
  type ApiStage,
} from "../../services/advancePaymentService";
import type { AdvanceRequestEntry } from "./approvalData";
import { editRows } from "./editChanges";
import { formatDateTime } from "./requestLabels";
import { useStoreRequest } from "./requestQueries";

const STAGE_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  CURRENT: { label: "Waiting", tone: "hold" },
  UPCOMING: { label: "To come", tone: "neutral" },
  APPROVED: { label: "Approved", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  RETURNED: { label: "Returned to creator", tone: "note" },
  SENT_BACK: { label: "Sent back to Payment", tone: "note" },
};

function stageState(stage: ApiStage) {
  return STAGE_STATE[stage.state] ?? { label: stage.state, tone: "neutral" as BadgeTone };
}

export function RouteTimeline({ entry }: { entry: AdvanceRequestEntry }) {
  const stages = entry.api.stages ?? [];
  const flow = entry.api.flow;
  if (!flow || stages.length === 0) {
    return <p className="m-0 text-[13px] text-subtle">No approval route yet.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="m-0 text-[12px] text-subtle">
        Workflow {flow.workflow}
        {flow.cycle > 1 ? ` · round ${flow.cycle}` : ""}
      </p>
      <Timeline aria-label="Approval route">
        {stages.map((stage, index) => {
          const state = stageState(stage);
          return (
            <TimelineItem
              key={stage.stage_id}
              tone={state.tone}
              rail={stage.state === "APPROVED" ? "covered" : "idle"}
              last={index === stages.length - 1}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">{stage.name}</span>
                <Badge tone={state.tone}>{state.label}</Badge>
              </div>
              <p className="m-0 text-[12px] text-subtle">
                {stage.user_name || "—"}
                {stage.acted_on ? ` · ${formatDateTime(stage.acted_on)}` : ""}
              </p>
            </TimelineItem>
          );
        })}
      </Timeline>
    </div>
  );
}

export function SapPayment({ entry }: { entry: AdvanceRequestEntry }) {
  const live = entry.api.voucher;
  const failed = [...(entry.api.vouchers ?? [])].reverse().find((v) => v.status === "FAILED");
  const lastFailedIsLatest = failed && (!live || failed.version > live.version);
  if (!live && !failed) return null;
  return (
    <DetailGrid>
      {live ? (
        <>
          <DetailField label="SAP Outgoing Payment" value={String(live.sap_doc_num ?? "—")} strong />
          <DetailField label="DocEntry" value={String(live.sap_doc_entry ?? "—")} />
          <DetailField
            label="Posted"
            value={`${live.posted_by?.name ?? "—"} · ${formatDateTime(live.posted_on ?? "")}`}
          />
        </>
      ) : null}
      {live ? <SapFiles entry={entry} /> : null}
      {lastFailedIsLatest ? (
        <DetailField label="Last posting attempt failed" value={failed.error} span="full" />
      ) : null}
    </DetailGrid>
  );
}

/**
 * The request's files on the posted payment in SAP: attached, or why not —
 * and, for whoever records the payment, a button to attach what SAP lacks
 * (all of them when posting could not, or files added since).
 */
function SapFiles({ entry }: { entry: AdvanceRequestEntry }) {
  const store = useStoreRequest();
  const [busy, setBusy] = useState(false);
  const live = entry.api.voucher;
  if (!live) return null;
  const files = entry.api.files ?? [];
  const missing = files.filter((f) => !f.in_sap).length;
  const value = live.attachment_entry
    ? `Attached (SAP attachment ${live.attachment_entry})${missing ? ` · ${missing} not yet` : ""}`
    : files.length
      ? live.attachment_error || "Not attached"
      : "No files";
  const attach = async () => {
    setBusy(true);
    try {
      store(await advancePaymentService.attachToSap(entry.serverId));
      showToast({ title: "Files attached in SAP", message: entry.requestNo, tone: "ok" });
    } catch (err) {
      showToast({ title: "Could not attach the files", message: advancePaymentError(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <DetailField
      label="Files in SAP"
      span="full"
      value={
        <span className="flex flex-wrap items-center gap-2">
          <span>{value}</span>
          {entry.api.can.attach_to_sap && missing ? (
            <Button variant="secondary" size="xs" onClick={() => void attach()} disabled={busy}>
              {busy ? "Attaching…" : "Attach to SAP"}
            </Button>
          ) : null}
        </span>
      }
    />
  );
}

/** A line of detail under a log row: what changed, what SAP numbered it. */
function logDetail(log: ApiRequestLog): string {
  const data = log.data ?? {};
  if (log.action === "SAP_POSTED" || log.action === "SAP_REPOSTED" || log.action === "SAP_CANCELLED") {
    return `SAP payment ${String(data.doc_num ?? "—")}`;
  }
  if (log.action === "SAP_POST_FAILED") return String(data.error ?? "");
  if (log.action === "UTR_RECORDED") return `UTR ${String(data.utr ?? "")} · ${String(data.method ?? "")} ${String(data.amount ?? "")}`;
  if (log.action === "PARTNER_LINKED") return `Linked to ${String(data.account ?? data.new ?? "")}`;
  if (log.action === "FILE_ADDED" || log.action === "FILE_REMOVED") return String(data.file ?? "");
  if (log.action === "SAP_ATTACHED") {
    return `${(data.files as string[] | undefined)?.join(", ") ?? ""} · SAP attachment ${String(data.attachment ?? "")}`;
  }
  return "";
}

const LOG_TONE: Record<string, BadgeTone> = {
  APPROVED: "ok",
  COMPLETED: "ok",
  SAP_POSTED: "info",
  SAP_REPOSTED: "info",
  REJECTED: "bad",
  SAP_POST_FAILED: "bad",
  SAP_CANCELLED: "bad",
  RETURNED: "note",
  SENT_BACK: "note",
  PAYMENT_EDITED: "hold",
  CANCELLED: "neutral",
};

/** Under an "Edited" or "Payment details updated" row: each change, Was → Now. */
export function EditChanges({ log }: { log: ApiRequestLog }) {
  const rows = editRows(log.data);
  if (rows.length === 0) return null;
  return (
    <table
      aria-label={`Changes ${formatDateTime(log.created_on)}`}
      className="mt-1.5 w-full max-w-2xl border-collapse overflow-hidden rounded-sm border border-line text-[12px]"
    >
      <thead className="bg-surface text-left text-subtle">
        <tr>
          <th className="px-2 py-1 font-semibold">Field</th>
          <th className="px-2 py-1 font-semibold">Was</th>
          <th className="px-2 py-1 font-semibold">Now</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row.field}-${i}`} className="border-t border-line align-top">
            <td className="px-2 py-1 font-semibold text-ink">{row.field}</td>
            <td className="px-2 py-1 text-subtle line-through decoration-subtle/60">{row.was}</td>
            <td className="px-2 py-1 text-ink">{row.now}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RequestHistory({ entry }: { entry: AdvanceRequestEntry }) {
  const logs = entry.api.logs ?? [];
  if (logs.length === 0) return <p className="m-0 text-[13px] text-subtle">No history yet.</p>;
  return (
    <Timeline aria-label="History">
      {logs.map((log, index) => {
        const detail = logDetail(log);
        return (
          <TimelineItem key={log.id} tone={LOG_TONE[log.action] ?? "neutral"} last={index === logs.length - 1}>
            <p className="m-0 text-[13px] text-ink">
              <span className="font-semibold">{log.label}</span>
              {log.stage_name ? <span className="text-subtle"> · {log.stage_name}</span> : null}
            </p>
            <p className="m-0 text-[12px] text-subtle">
              {log.actor?.name ?? "System"}
              {log.on_behalf_of ? ` for ${log.on_behalf_of.name}` : ""} · {formatDateTime(log.created_on)}
            </p>
            {log.remarks ? <p className="m-0 mt-0.5 text-[12.5px] text-body">“{log.remarks}”</p> : null}
            {detail ? <p className="m-0 mt-0.5 text-[12px] text-subtle">{detail}</p> : null}
            {log.action === "PAYOUT_UPDATED" && log.data?.manual_account ? (
              <p className="m-0 mt-1">
                <Badge tone="bad">
                  {log.data.manual_new ? "Bank account entered manually" : "Bank account is a manual entry"} — not from SAP
                </Badge>
              </p>
            ) : null}
            {log.action === "EDITED" || log.action === "PAYMENT_EDITED" || log.action === "PAYOUT_UPDATED" ? (
              <EditChanges log={log} />
            ) : null}
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
