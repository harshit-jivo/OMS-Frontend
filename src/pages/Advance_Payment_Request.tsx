/**
 * Advance Payments — the requester's page: their ENTRIES, and a NEW REQUEST.
 *
 * Laid out like BackDate's: KPI cards that are the status filter, an Entries
 * / New Request tab strip, and search / company / status controls beside it
 * while the list is showing. The point of the Entries tab is that a requester
 * can see where their request is — pending, approved, rejected, and why —
 * without asking anyone.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT READS SAP, AND WHAT IS ONLY IN THIS TAB
 * ─────────────────────────────────────────────────────────────────────────
 * The form (`advancePayments/AdvancePaymentForm.tsx`, shared with the
 * approval desk's "Edit entry") reads vendors, open bills and employee
 * advance accounts live from `GET /api/advance-payments/…`.
 *
 * There is no create endpoint, so a submitted request goes into the
 * in-memory store (`advancePayments/requestStore.ts`) that the approval desk
 * reads too. It is lost on reload; the Preview notice says so.
 */
import { useMemo, useState } from "react";
import { HiOutlineBanknotes, HiPlus } from "react-icons/hi2";

import { useAuth } from "../auth";
import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, Notice, Page, PageHeader, StatRow } from "../components/ui/page";
import { Tab, TabList } from "../components/ui/tabs";

import { AdvancePaymentForm } from "./advancePayments/AdvancePaymentForm";
import { requestAmount, type AdvanceRequestEntry } from "./advancePayments/approvalData";
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
import { addRequest, useRequests } from "./advancePayments/requestStore";
import { formatINR } from "./advancePayments/rules";

type PageTab = "entries" | "create";

const pageTitle = (
  <span className="flex items-center gap-2.5">
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-white">
      <HiOutlineBanknotes className="size-4" aria-hidden="true" />
    </span>
    Advance Payments
  </span>
);

/** A request as its requester sees it — read-only, with where it stands. */
function EntryDetails({ entry, onBack }: { entry: AdvanceRequestEntry; onBack: () => void }) {
  const amount = requestAmount(entry.form);
  return (
    <Page>
      <Breadcrumbs items={[{ label: "Advance Payments", onClick: onBack }, { label: entry.requestNo }]} />

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
          <Button variant="ghost" onClick={onBack}>
            Back to entries
          </Button>
        }
      />

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <DecisionSummary entry={entry} />
      </Card>

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

      {/* How it was paid — shown once it has been approved, never before:
          until then the approver is still deciding it. */}
      {entry.status === "APPROVED" && entry.payout ? (
        <Card className="p-4 md:p-5">
          <CardHeader>
            <CardTitle>Payment &amp; Bank Details</CardTitle>
          </CardHeader>
          <PayoutDetailsForm value={entry.payout} onChange={() => {}} requestAmount={amount} readOnly />
        </Card>
      ) : null}
    </Page>
  );
}

export default function Advance_Payment_Request() {
  const { session } = useAuth();
  const requester = session?.name || session?.username || "You";

  const entries = useRequests();
  const [tab, setTab] = useState<PageTab>("entries");
  const [filters, setFilters] = useState<RequestFilterState>(NO_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
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

  const opened = entries.find((e) => e.id === openId);
  if (opened) return <EntryDetails entry={opened} onBack={() => setOpenId(null)} />;

  return (
    <Page>
      <Breadcrumbs
        items={[
          { label: "Advance Payments" },
          { label: tab === "entries" ? "Entries" : "New Request" },
        ]}
      />

      <PageHeader
        eyebrow="Payments"
        title={pageTitle}
        description="Raise advance payments to vendors and employees, and follow each one through approval."
      />

      <Notice tone="info" title="Preview">
        Vendors, open bills and employee advance accounts are read live from SAP; purchase orders,
        “All” documents and imprest employees are still sample data. There is no endpoint to store
        a request yet, so entries raised here stay in this browser tab only.
      </Notice>

      {notice ? (
        <Notice tone="ok" title="Submitted">
          {notice}
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
        <TabList label="Advance Payments">
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
          <AdvancePaymentForm
            onCancel={() => setTab("entries")}
            onSubmit={(form, files) => {
              const entry = addRequest(form, files, requester);
              // Straight back to the list, showing it where it now sits.
              setFilters({ ...NO_FILTERS, status: "PENDING" });
              setTab("entries");
              setNotice(
                `${entry.requestNo} raised for ${formatINR(requestAmount(form))} — it is now waiting for approval.`,
              );
            }}
          />
        </Card>
      ) : (
        <Card className="p-4 md:p-5">
          <RequestTable
            entries={shown}
            onOpen={(e) => setOpenId(e.id)}
            action={() => ({ label: "Details", variant: "secondary" })}
            emptyText={
              filters.search || filters.company || filters.status
                ? "No requests match these filters."
                : "No advance payment requests yet."
            }
          />
        </Card>
      )}
    </Page>
  );
}
