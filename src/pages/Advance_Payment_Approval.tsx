/**
 * Payments Approval — the desk every stage of a request's route works from.
 *
 * Lists only what is yours to act on: requests waiting at your stage today
 * (or one you stand in for), and completed ones where you hold Payment or
 * Final, to record the UTR. What you may do to an
 * opened request is the server's answer (`api.can`), which depends on the
 * stage it waits at and whether that stage is yours today:
 *
 *   approval stages            any number before Payment, named freely:
 *                              approve, reject, or return it to its creator
 *   Payment                    fill the PAYMENT & BANK DETAILS (whom it is
 *                              paid to, from which of our accounts, by what
 *                              method) and approve once they add up exactly.
 *                              A payee account typed by hand (not one SAP
 *                              holds) asks for the user's password first.
 *   Audit                      approve or reject; nothing is in SAP yet
 *   Final                      approving POSTS the outgoing payment to SAP
 *                              and completes it — the money may go — or it
 *                              is sent back to Payment (then Audit, Final)
 *
 * Rejecting needs a reason at every stage, and is final. After completion
 * the Payment or Final approver records each transfer's UTR, read from the
 * bank's proof (`advancePayments/PaymentProofPanel.tsx`).
 *
 * The server checks all of it again: a button shown here is a convenience,
 * never the permission.
 */
import { useEffect, useMemo, useState } from "react";
import {
  HiOutlineArrowUturnLeft,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
} from "react-icons/hi2";

import { useAuth } from "../auth";
import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import { Field, Textarea } from "../components/ui/form";
import { Card, CardHeader, CardTitle, Notice, Page, PageHeader, StatRow } from "../components/ui/page";
import {
  advancePaymentError,
  advancePaymentProblems,
  advancePaymentService,
  type AdvancePaymentCompany,
  type ApiRequest,
  type StageAction,
} from "../services/advancePaymentService";

import { requestAmount, type AdvanceRequestEntry } from "./advancePayments/approvalData";
import { ManualAccountPassword } from "./advancePayments/ManualAccountPassword";
import { PartnerBalance } from "./advancePayments/PartnerBalance";
import { PaymentProofPanel } from "./advancePayments/PaymentProofPanel";
import { PayoutDetailsForm } from "./advancePayments/PayoutDetailsForm";
import { startPayout, validatePayout, type PayoutDetails } from "./advancePayments/payout";
import { DecisionSummary, DocumentLines, RequestSummary } from "./advancePayments/RequestDetails";
import {
  PRIORITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  filterRequests,
  formatDateTime,
  priorityLabel,
  requestCounts,
  showsBalance,
  type RequestFilterState,
} from "./advancePayments/requestLabels";
import { RequestFilters, RequestKpis, RequestTable } from "./advancePayments/RequestList";
import { RequestHistory, RouteTimeline, SapPayment } from "./advancePayments/RequestProgress";
import { payoutFileChanges, payoutToApi } from "./advancePayments/requestApi";
import { useRequestDetail, useRequestList, useStoreRequest } from "./advancePayments/requestQueries";
import { formatINR } from "./advancePayments/rules";

/** What each stage is told when the request is waiting on them. */
function stageGuidance(entry: AdvanceRequestEntry): string {
  const flow = entry.api.flow;
  switch (flow?.current_role) {
    case "PAYMENT":
      return entry.api.partner_not_in_sap
        ? `${entry.form.partnerName} has no employee advance account in SAP yet. Create it in SAP first — approving checks SAP and links the request to it.`
        : "Fill in the payment and bank details and save them. Approving needs them complete and adding up to the request.";
    case "AUDIT":
      return "Check the request and its payment details, then approve it on to Final, or reject it. Nothing is posted to SAP yet.";
    case "FINAL":
      return "Approving posts the outgoing payment to SAP and completes the request: the money may then be transferred. If SAP refuses it, the request stays here and says why. Or send it back to Payment to correct, or reject it.";
    default:
      return "Approve it, return it to its creator to correct and resubmit, or reject it.";
  }
}

function ReviewRequest({ id, onBack }: { id: number; onBack: () => void }) {
  const { session } = useAuth();
  const approver = session?.name || session?.username || "Approver";
  const detail = useRequestDetail(id);
  const store = useStoreRequest();
  const entry = detail.data;

  const [draft, setDraft] = useState<PayoutDetails | undefined>(undefined);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  // Typing the payee's account by hand: the password token, and what to do
  // once the password dialog confirms it.
  const [manualToken, setManualToken] = useState<string | null>(null);
  const [afterPassword, setAfterPassword] = useState<(() => void) | null>(null);

  // A fresh copy of the payout whenever the server's version moves: after a
  // save, a decision, or someone else's action.
  const version = entry?.api.flow?.version;
  useEffect(() => {
    if (!entry) return;
    if (entry.api.can.edit_payout && !entry.payout) {
      setDraft(startPayout(requestAmount(entry.form), entry.form.partnerName.toUpperCase()));
    } else {
      setDraft(entry.payout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the version on purpose
  }, [entry?.serverId, version]);

  if (!entry) {
    return (
      <Page>
        <Breadcrumbs items={[{ label: "Payments Approval", onClick: onBack }, { label: "Request" }]} />
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
  const flow = entry.api.flow;
  const deciding = can.approve || can.reject;

  /** Save the payout, then send the files it gained and drop the ones it lost. */
  const persistPayout = async (payout: PayoutDetails): Promise<ApiRequest> => {
    let api = await advancePaymentService.savePayout(entry.serverId, payoutToApi(payout), version, manualToken);
    const changes = payoutFileChanges(payout, api.payout ?? { ...payoutToApi(payout), lines: [] }, entry.payout);
    for (const item of changes.upload) {
      api = await advancePaymentService.addRequestFile(entry.serverId, item.file, item.purpose, item.lineId);
    }
    for (const fileId of changes.remove) {
      api = await advancePaymentService.removeRequestFile(entry.serverId, fileId);
    }
    return api;
  };

  const run = async (work: () => Promise<ApiRequest>, done: string) => {
    setBusy(true);
    try {
      const api = await work();
      store(api);
      setRemarks("");
      setNotice({ tone: "ok", text: done });
    } catch (err) {
      // The token ran out (or was never asked for): ask again, then retry.
      if (advancePaymentProblems(err).includes("manual_password")) {
        setManualToken(null);
        setAfterPassword(() => () => void run(work, done));
      }
      setNotice({ tone: "bad", text: advancePaymentError(err) });
    } finally {
      setBusy(false);
    }
  };

  const savePayout = () => {
    if (!draft) return;
    void run(() => persistPayout(draft), "Payment details saved.");
  };

  const decide = (action: StageAction, done: string) => {
    if (action !== "approve" && !remarks.trim()) {
      setNotice({ tone: "bad", text: "Say why, in the remarks." });
      return;
    }
    if (action === "approve" && can.edit_payout && draft) {
      const { missing, problems } = validatePayout(draft, amount);
      const messages = [...(missing.length ? [`Still needed: ${missing.join(", ")}.`] : []), ...problems];
      if (messages.length) {
        setNotice({ tone: "bad", text: messages.join(" ") });
        return;
      }
    }
    void run(async () => {
      let current = version;
      if (action === "approve" && can.edit_payout && draft) {
        current = (await persistPayout(draft)).flow?.version;
      }
      return advancePaymentService.act(entry.serverId, action, remarks.trim(), current);
    }, done);
  };

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Payments Approval", onClick: onBack }, { label: entry.requestNo }]} />

      <PageHeader
        eyebrow="Payments"
        title={entry.requestNo}
        badges={
          <>
            <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
            {flow?.current_stage ? <Badge tone="info">At {flow.current_stage}</Badge> : null}
            <Badge tone={PRIORITY_TONE[entry.form.priority]}>{priorityLabel(entry)} priority</Badge>
          </>
        }
        description={`Raised by ${entry.requestedBy} on ${formatDateTime(entry.requestedOn)} · ${formatINR(amount)}`}
        actions={
          <Button variant="ghost" onClick={onBack}>
            Back to list
          </Button>
        }
      />

      {notice ? (
        <Notice tone={notice.tone} title={notice.tone === "ok" ? "Done" : "Not done"}>
          {notice.text}
        </Notice>
      ) : null}

      {deciding ? (
        <Notice tone="info" title={`Waiting on you: ${flow?.current_stage}`}>
          {stageGuidance(entry)}
        </Notice>
      ) : null}

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>Status</CardTitle>
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
        {/* From Payment on, never before: what the payment is weighed against. */}
        {showsBalance(entry) ? (
          <div className="mt-4 border-t border-line pt-4">
            <PartnerBalance entry={entry} />
          </div>
        ) : null}
      </Card>

      <DocumentLines entry={entry} />

      {draft ? (
        <Card className="p-4 md:p-5">
          <CardHeader>
            <CardTitle>Payment &amp; Bank Details</CardTitle>
            {can.edit_payout ? (
              <Button variant="secondary" size="xs" onClick={savePayout} disabled={busy}>
                Save Payment Details
              </Button>
            ) : (
              <Badge tone="note">Filled at Payment</Badge>
            )}
          </CardHeader>
          <PayoutDetailsForm
            value={draft}
            onChange={setDraft}
            requestAmount={amount}
            readOnly={!can.edit_payout}
            company={entry.form.company}
            // An Employee is paid to a G/L account, not a SAP partner,
            // so there are no bank accounts on file to offer.
            payeeCardCode={entry.form.type === "EMPLOYEE_ADVANCE" ? "" : entry.form.partner}
            manualEntry={
              can.edit_payout
                ? { unlocked: manualToken !== null, unlock: (then) => setAfterPassword(() => then) }
                : undefined
            }
          />
        </Card>
      ) : null}

      <ManualAccountPassword
        requestId={entry.serverId}
        open={afterPassword !== null}
        onClose={() => setAfterPassword(null)}
        onConfirmed={(token) => {
          setManualToken(token);
          const then = afterPassword;
          setAfterPassword(null);
          then?.();
        }}
      />

      {entry.payout && entry.status === "APPROVED" && can.record_utr ? (
        <Card className="p-4 md:p-5">
          <CardHeader>
            <CardTitle>Record Payment</CardTitle>
            <Badge tone="note">After paying</Badge>
          </CardHeader>
          <PaymentProofPanel
            lines={entry.payout.lines}
            context={{
              company: entry.form.company as AdvancePaymentCompany,
              toAccount: entry.payout.toAccountNumber,
              cardCode: entry.form.type === "EMPLOYEE_ADVANCE" ? "" : entry.form.partner,
              // The request's documents, by number and by the vendor's own
              // reference: either may be in the transfer's remarks.
              invoices: entry.form.selected.flatMap((doc) =>
                doc.reference ? [doc.number, doc.reference] : [doc.number],
              ),
              recordedBy: approver,
            }}
            onRecord={(lineId, utr, proof) => {
              const line = entry.payout?.lines.find((l) => l.id === lineId);
              if (!line?.serverId) return;
              void run(
                () => advancePaymentService.recordUtr(entry.serverId, line.serverId as number, utr, proof ?? null),
                `UTR ${utr} recorded.`,
              );
            }}
          />
        </Card>
      ) : null}

      {deciding ? (
        <Card className="p-4 md:p-5">
          <CardHeader>
            <CardTitle>Decision</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <Field
              label="Approver Remarks"
              hint="Required to reject, return or send back; optional to approve."
            >
              {(f) => (
                <Textarea
                  {...f}
                  rows={3}
                  placeholder="Enter remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              <Button variant="danger" onClick={() => decide("reject", "Rejected.")} disabled={busy}>
                <HiOutlineXCircle className="size-4" aria-hidden="true" />
                Reject
              </Button>
              {can.return_to_creator ? (
                <Button
                  variant="secondary"
                  onClick={() => decide("return", "Returned to its creator.")}
                  disabled={busy}
                >
                  <HiOutlineArrowUturnLeft className="size-4" aria-hidden="true" />
                  Return to Creator
                </Button>
              ) : null}
              {can.send_back ? (
                <Button
                  variant="secondary"
                  onClick={() => decide("send-back", "Sent back to Payment.")}
                  disabled={busy}
                >
                  <HiOutlineArrowUturnLeft className="size-4" aria-hidden="true" />
                  Send Back to Payment
                </Button>
              ) : null}
              <Button variant="primary" onClick={() => decide("approve", "Approved.")} disabled={busy}>
                <HiOutlineCheckCircle className="size-4" aria-hidden="true" />
                {busy ? "Working…" : "Approve"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <RequestHistory entry={entry} />
      </Card>
    </Page>
  );
}

export default function Advance_Payment_Approval() {
  const list = useRequestList("desk");
  // Waiting on you first, then newest first.
  const entries = useMemo(
    () =>
      [...(list.data ?? [])].sort(
        (a, b) => Number(Boolean(b.api.flow?.awaiting_me)) - Number(Boolean(a.api.flow?.awaiting_me)),
      ),
    [list.data],
  );
  // Opens on what needs deciding — the desk's first job.
  const [filters, setFilters] = useState<RequestFilterState>({
    search: "",
    company: "",
    status: "PENDING",
  });
  const [openId, setOpenId] = useState<number | null>(null);

  // The cards count what the search and company filters leave, whatever the
  // status filter — a card must not read 0 just because it is not selected.
  const counts = useMemo(
    () => requestCounts(filterRequests(entries, { ...filters, status: "" })),
    [entries, filters],
  );
  const shown = filterRequests(entries, filters);
  const awaiting = entries.filter((e) => e.api.flow?.awaiting_me).length;

  if (openId !== null) return <ReviewRequest id={openId} onBack={() => setOpenId(null)} />;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Payments" }, { label: "Payments Approval" }]} />

      <PageHeader
        eyebrow="Payments"
        title="Payments Approval"
        description="Review payment requests at your stage: approve, return, send back or reject, and fill the payment details at Payment."
      />

      {list.isError ? (
        <Notice tone="bad" title="Could not load the requests">
          {advancePaymentError(list.error)}
        </Notice>
      ) : null}

      <StatRow>
        <RequestKpis
          counts={counts}
          status={filters.status}
          onSelect={(status) => setFilters({ ...filters, status })}
        />
      </StatRow>

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>
            Requests{awaiting ? <Badge tone="hold" className="ml-2">{awaiting} waiting on you</Badge> : null}
          </CardTitle>
          <RequestFilters value={filters} onChange={setFilters} />
        </CardHeader>
        <RequestTable
          entries={shown}
          onOpen={(e) => setOpenId(e.serverId)}
          action={(e) =>
            e.api.flow?.awaiting_me
              ? { label: "Review", variant: "primary" }
              : { label: "View", variant: "secondary" }
          }
          emptyText={list.isLoading ? "Loading…" : "No requests match these filters."}
        />
      </Card>
    </Page>
  );
}
