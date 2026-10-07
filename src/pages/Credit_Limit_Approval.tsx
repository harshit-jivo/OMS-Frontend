/**
 * Credit Limit Approval — decide requests to change a customer's SAP limit.
 *
 * Two conditions govern this page, and only one is a permission:
 *
 *   1. `Credit_Limit_Approval` — opens the page (`ProtectedPage` +
 *      `routeAccess.ts`).
 *   2. being the current stage's effective user — decides whether a given
 *      request may be actioned. The backend enforces it on every approve /
 *      reject; the Queue tab lists only what the server says this user may
 *      act on, so "can I see it here" and "can I decide it" stay one question.
 *
 * The final approval writes the new limit to SAP first. If SAP refuses (502),
 * nothing is approved, the request stays at this stage, and SAP's message is
 * shown in the decision dialog.
 */
import { useCallback, useEffect, useState } from "react";
import { HiArrowPath, HiShieldCheck } from "react-icons/hi2";

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
import { DetailField, DetailGrid } from "../components/ui/detail";
import { Field, Textarea } from "../components/ui/form";
import { Card, Notice, Page, PageHeader } from "../components/ui/page";
import { Tab, TabList } from "../components/ui/tabs";
import {
  creditLimitError,
  creditLimitService,
  type CreditLimitRequest,
} from "../services/creditLimitService";
import { formatAmount } from "./creditLimit/format";
import {
  CompanyFilterControl,
  RequestDetailDialog,
  RequestTable,
  StateBlock,
  StatusFilterControl,
  type CompanyFilter,
  type StatusFilter,
} from "./creditLimit/shared";
import { useLinkedRequest } from "./creditLimit/useLinkedRequest";

type View = "queue" | "history";

export default function CreditLimitApproval() {
  const [view, setView] = useState<View>("queue");
  const [company, setCompany] = useState<CompanyFilter>("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [rows, setRows] = useState<CreditLimitRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<CreditLimitRequest | null>(null);
  const [pending, setPending] = useState<
    { request: CreditLimitRequest; approve: boolean } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const scope = company ? { company } : {};
      setRows(
        view === "queue"
          ? await creditLimitService.approvalQueue(scope)
          : await creditLimitService.approvalHistory(status ? { ...scope, status } : scope),
      );
    } catch (e) {
      setError(creditLimitError(e));
    } finally {
      setLoading(false);
    }
  }, [view, company, status]);

  useEffect(() => {
    void load();
  }, [load]);

  // A notification links here with `?request=<id>`; the server still decides
  // whether this user may act on it.
  useLinkedRequest(setDetail, setError);

  const announce = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 8000);
  };

  return (
    <Page>
      <PageHeader
        title="Credit Limit Approval"
        description="Approve or reject requests to change a customer's credit limit in SAP"
        eyebrow={<HiShieldCheck aria-hidden />}
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <HiArrowPath aria-hidden /> Refresh
          </Button>
        }
      />

      {notice && (
        <Notice tone="ok" className="mb-4">
          {notice}
        </Notice>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <TabList label="Credit Limit Approval">
          <Tab selected={view === "queue"} onClick={() => setView("queue")}>
            Queue
          </Tab>
          <Tab selected={view === "history"} onClick={() => setView("history")}>
            History
          </Tab>
        </TabList>
        <div className="flex flex-wrap items-center gap-2">
          <CompanyFilterControl value={company} onChange={setCompany} />
          {view === "history" && (
            <StatusFilterControl value={status} onChange={setStatus} />
          )}
        </div>
      </div>

      <Card className="p-4 md:p-5">
        <StateBlock
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyText={
            view === "queue"
              ? "Nothing is waiting for your approval. Requests appear here only when you are the current approver for their stage."
              : `You have not decided any credit limit requests${status ? ` that are now ${status.toLowerCase()}` : ""}${company ? ` for ${company}` : ""}.`
          }
        />
        {!loading && !error && rows.length > 0 && (
          <RequestTable rows={rows} onOpen={setDetail} showRequester />
        )}
      </Card>

      {/* Deciding happens from the detail dialog, not the row: nobody should
          approve a limit without having opened what it says. */}
      <RequestDetailDialog
        request={detail}
        onClose={() => setDetail(null)}
        footer={
          detail && view === "queue" && detail.flow?.status === "PENDING" ? (
            <>
              <Button
                variant="danger"
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

      <DecisionDialog
        pending={pending}
        onClose={() => setPending(null)}
        onDone={(message) => {
          setDetail(null);
          announce(message);
          void load();
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
  pending: { request: CreditLimitRequest; approve: boolean } | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={pending?.approve ? "Approve credit limit" : "Reject credit limit"}
        size="md"
      >
        {/* Keyed so remarks and errors start empty for every decision. */}
        {pending && (
          <DecisionBody
            key={`${pending.request.id}-${pending.approve}`}
            request={pending.request}
            approve={pending.approve}
            onClose={onClose}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DecisionBody({
  request,
  approve,
  onClose,
  onDone,
}: {
  request: CreditLimitRequest;
  approve: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const submit = async () => {
    if (!approve && !remarks.trim()) {
      setFormError("Please give a reason for the rejection.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (!approve) {
        await creditLimitService.reject(request.id, remarks.trim());
        onClose();
        onDone(`Request #${request.id} rejected.`);
        return;
      }
      const result = await creditLimitService.approve(request.id, remarks.trim());
      onClose();
      onDone(
        result?.flow?.status === "APPROVED"
          ? `Request #${request.id} approved. The new credit limit is set in SAP.`
          : `Request #${request.id} approved and moved to the next stage.`,
      );
    } catch (e) {
      // A SAP refusal (502) means nothing was approved — the request is still
      // at this stage. Show SAP's own message so the approver knows why.
      setFormError(creditLimitError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader className="pr-10">
        <div className="min-w-0">
          <DialogTitle>
            {approve ? "Approve credit limit" : "Reject credit limit"}
          </DialogTitle>
          <DialogDescription className="mt-0.5">
            #{request.id} · {request.card_name || request.card_code} · {request.company}
          </DialogDescription>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {formError && (
          <Notice tone="bad">
            <span className="whitespace-pre-wrap">{formError}</span>
          </Notice>
        )}

        <DetailGrid>
          <DetailField label="Current limit" value={formatAmount(request.current_credit_limit)} />
          <DetailField label="New limit" value={formatAmount(request.new_credit_limit)} strong />
          <DetailField label="Balance" value={formatAmount(request.current_balance)} />
        </DetailGrid>

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

        <p className="m-0 text-[12.5px] text-subtle" role={saving && approve ? "status" : undefined}>
          {saving && approve
            ? "Sending to SAP — the request is only approved once SAP accepts the new limit."
            : approve
              ? "If this is the last stage, SAP is updated first; the request is approved only if SAP accepts the new limit."
              : "Rejecting ends this request. The requester can raise a new one."}
        </p>
      </DialogBody>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={approve ? "primary" : "danger"}
          onClick={() => void submit()}
          disabled={saving}
          aria-busy={saving}
        >
          {saving ? (approve ? "Approving…" : "Rejecting…") : approve ? "Approve" : "Reject"}
        </Button>
      </DialogFooter>
    </>
  );
}
