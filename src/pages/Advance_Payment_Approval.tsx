/**
 * Advance Payments — Approval desk. UI ONLY.
 *
 * There is no endpoint that creates a request, so the desk reads the
 * in-memory store (`advancePayments/requestStore.ts`): the sample requests,
 * plus anything raised on `/Advance_Payment_Request` in this browser tab.
 * Every decision changes that store only — nothing is saved, and nothing
 * reaches SAP.
 *
 * The list is laid out like BackDate's: KPI cards that ARE the status filter,
 * then search, company and status controls. What the approver does here, and
 * the requester cannot:
 *
 *   * EDIT the entry — through the same `AdvancePaymentForm` the requester
 *     used, so an approver cannot save an entry the requester could not have
 *     submitted;
 *   * fill PAYMENT & BANK DETAILS — whom it is paid to, from which of our
 *     accounts, by UPI / cheque / cash — laid out like the app's Receive
 *     Payment card (see `advancePayments/payout.ts`);
 *   * APPROVE, which requires those details to be complete and to add up to
 *     exactly the requested amount, or REJECT, which requires a reason.
 */
import { useMemo, useState } from "react";
import { HiOutlineCheckCircle, HiOutlinePencilSquare, HiOutlineXCircle } from "react-icons/hi2";

import { useAuth } from "../auth";
import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import { Field, Textarea } from "../components/ui/form";
import { Card, CardHeader, CardTitle, Notice, Page, PageHeader, StatRow } from "../components/ui/page";

import { AdvancePaymentForm } from "./advancePayments/AdvancePaymentForm";
import { requestAmount, type AdvanceRequestEntry } from "./advancePayments/approvalData";
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
  type RequestFilterState,
} from "./advancePayments/requestLabels";
import { RequestFilters, RequestKpis, RequestTable } from "./advancePayments/RequestList";
import { updateRequest, useRequests } from "./advancePayments/requestStore";
import { formatINR } from "./advancePayments/rules";

export default function Advance_Payment_Approval() {
  const { session } = useAuth();
  const approver = session?.name || session?.username || "Approver";

  const entries = useRequests();
  // Opens on what needs deciding — the desk's first job.
  const [filters, setFilters] = useState<RequestFilterState>({
    search: "",
    company: "",
    status: "PENDING",
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const entry = entries.find((e) => e.id === openId) ?? null;

  // The cards count what the search and company filters leave, whatever the
  // status filter — a card must not read 0 just because it is not selected.
  const counts = useMemo(
    () => requestCounts(filterRequests(entries, { ...filters, status: "" })),
    [entries, filters],
  );
  const shown = filterRequests(entries, filters);

  const open = (target: AdvanceRequestEntry) => {
    // A pending request starts its payout with one line for the whole amount,
    // addressed to the partner — the common case is one UPI transfer.
    if (target.status === "PENDING" && !target.payout) {
      updateRequest(target.id, {
        payout: startPayout(requestAmount(target.form), target.form.partnerName.toUpperCase()),
      });
    }
    setOpenId(target.id);
    setEditing(false);
    setRemarks("");
    setNotice(null);
  };

  const close = () => {
    setOpenId(null);
    setEditing(false);
    setNotice(null);
  };

  /* ── Detail view ───────────────────────────────────────────────────────── */

  if (entry) {
    const amount = requestAmount(entry.form);
    const pending = entry.status === "PENDING";
    const payout = entry.payout;

    const approve = () => {
      if (!payout) return;
      const { missing, problems } = validatePayout(payout, amount);
      const messages = [
        ...(missing.length ? [`Still needed: ${missing.join(", ")}.`] : []),
        ...problems,
      ];
      if (messages.length) {
        setNotice({ tone: "bad", text: messages.join(" ") });
        return;
      }
      updateRequest(entry.id, {
        status: "APPROVED",
        decision: { status: "APPROVED", by: approver, on: new Date().toISOString(), remarks: remarks.trim() },
      });
      setNotice({
        tone: "ok",
        text: "Approved — preview only: nothing was saved, and nothing was sent to SAP.",
      });
    };

    const reject = () => {
      if (!remarks.trim()) {
        setNotice({ tone: "bad", text: "Say why it is being rejected, in Approver Remarks." });
        return;
      }
      updateRequest(entry.id, {
        status: "REJECTED",
        decision: { status: "REJECTED", by: approver, on: new Date().toISOString(), remarks: remarks.trim() },
      });
      setNotice({ tone: "ok", text: "Rejected — preview only: nothing was saved." });
    };

    return (
      <Page>
        <Breadcrumbs
          items={[{ label: "Advance Payment Approvals", onClick: close }, { label: entry.requestNo }]}
        />

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
              {pending && !editing ? (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <HiOutlinePencilSquare className="size-4" aria-hidden="true" />
                  Edit Entry
                </Button>
              ) : null}
              <Button variant="ghost" onClick={close}>
                Back to list
              </Button>
            </>
          }
        />

        {notice ? (
          <Notice tone={notice.tone} title={notice.tone === "ok" ? "Done" : "Cannot approve yet"}>
            {notice.text}
          </Notice>
        ) : null}

        {editing ? (
          <Card className="p-4 md:p-5">
            <AdvancePaymentForm
              initial={entry.form}
              initialFiles={entry.files}
              submitLabel="Save Changes"
              intro={
                <Notice tone="info" title="Editing">
                  You are correcting {entry.requestNo} before deciding it. The same rules apply as
                  when it was raised. Nothing is saved to the server.
                </Notice>
              }
              onCancel={() => setEditing(false)}
              onSubmit={(form, files) => {
                updateRequest(entry.id, {
                  form,
                  files,
                  editedBy: { by: approver, on: new Date().toISOString() },
                });
                setEditing(false);
                setNotice({ tone: "ok", text: "Entry updated. Check the payment details still add up." });
              }}
            />
          </Card>
        ) : (
          <>
            <Card className="p-4 md:p-5">
              <CardHeader>
                <CardTitle>Request Details</CardTitle>
                {entry.editedBy ? (
                  <Badge tone="info">
                    Edited by {entry.editedBy.by} · {formatDateTime(entry.editedBy.on)}
                  </Badge>
                ) : null}
              </CardHeader>
              <RequestSummary entry={entry} />
            </Card>

            <DocumentLines entry={entry} />

            {payout ? (
              <Card className="p-4 md:p-5">
                <CardHeader>
                  <CardTitle>Payment &amp; Bank Details</CardTitle>
                  <Badge tone="note">Approver only</Badge>
                </CardHeader>
                <PayoutDetailsForm
                  value={payout}
                  onChange={(next: PayoutDetails) => updateRequest(entry.id, { payout: next })}
                  requestAmount={amount}
                  readOnly={!pending}
                />
              </Card>
            ) : null}

            <Card className="p-4 md:p-5">
              <CardHeader>
                <CardTitle>Decision</CardTitle>
              </CardHeader>
              {entry.decision ? (
                <DecisionSummary entry={entry} />
              ) : (
                <div className="space-y-4">
                  <Field label="Approver Remarks" hint="Required to reject; optional to approve.">
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
                    <Button variant="danger" onClick={reject}>
                      <HiOutlineXCircle className="size-4" aria-hidden="true" />
                      Reject
                    </Button>
                    <Button variant="primary" onClick={approve}>
                      <HiOutlineCheckCircle className="size-4" aria-hidden="true" />
                      Approve
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </Page>
    );
  }

  /* ── List view ─────────────────────────────────────────────────────────── */

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Advance Payments" }, { label: "Approvals" }]} />

      <PageHeader
        eyebrow="Payments"
        title="Advance Payment Approvals"
        description="Review advance payment requests, add the payment and bank details, and approve or reject."
      />

      <Notice tone="info" title="Preview">
        Sample requests, plus any raised in this browser tab — there is no endpoint to store one
        yet. Decisions and edits are not saved or sent to SAP.
      </Notice>

      <StatRow>
        <RequestKpis
          counts={counts}
          status={filters.status}
          onSelect={(status) => setFilters({ ...filters, status })}
        />
      </StatRow>

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <RequestFilters value={filters} onChange={setFilters} />
        </CardHeader>
        <RequestTable
          entries={shown}
          onOpen={open}
          action={(e) =>
            e.status === "PENDING"
              ? { label: "Review", variant: "primary" }
              : { label: "View", variant: "secondary" }
          }
          emptyText="No requests match these filters."
        />
      </Card>
    </Page>
  );
}
