/**
 * All Payment Requests — the register. Every request, whoever raised it and
 * wherever it waits, for an administrator or a holder of
 * `Advance_Payment_View_All` (the server's `scope=all`). Read only: opening a
 * request shows all of it — route, history, documents, payment — and acting
 * stays with the desks.
 *
 * Filters combine (status AND desk AND vendor ...), and each takes several
 * values at once (`register.ts`).
 */
import { useMemo, useState } from "react";
import { HiOutlineArrowPath } from "react-icons/hi2";

import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import {
  FilterActions,
  FilterBar,
  FilterCount,
  FilterDate,
  FilterMultiSelect,
  FilterSearch,
} from "../components/ui/filter-bar";
import { Card, CardHeader, CardTitle, Notice, Page, PageHeader } from "../components/ui/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { advancePaymentError } from "../services/advancePaymentService";

import { payeeOf, paymentAgainstLabel, requestAmount, typeLabel, type AdvanceRequestEntry } from "./advancePayments/approvalData";
import { CollapsibleCard } from "./advancePayments/CollapsibleCard";
import { COMPANIES } from "./advancePayments/constants";
import { PayoutDetailsForm } from "./advancePayments/PayoutDetailsForm";
import { DecisionSummary, DocumentLines, ExpenseLines, RequestSummary } from "./advancePayments/RequestDetails";
import { RequestFilesProvider } from "./advancePayments/RequestFileLink";
import { useNarrow } from "./advancePayments/useNarrow";
import { RequestHistory, RouteTimeline, SapPayment } from "./advancePayments/RequestProgress";
import {
  NO_REGISTER_FILTERS,
  activeFilterCount,
  filterRegister,
  registerOptions,
  whereNow,
  type RegisterFilters,
} from "./advancePayments/register";
import { STATUS_LABEL, STATUS_TONE, formatDateTime, historySummary, statusSummary } from "./advancePayments/requestLabels";
import { useRequestDetail, useRequestList } from "./advancePayments/requestQueries";
import { formatINR } from "./advancePayments/rules";

/* ── One request, all of it ─────────────────────────────────────────────── */

function RegisterDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const detail = useRequestDetail(id);
  const entry = detail.data;
  const crumbs = (last: string) => (
    <Breadcrumbs items={[{ label: "All Payment Requests", onClick: onBack }, { label: last }]} />
  );
  if (!entry) {
    return (
      <Page>
        {crumbs("Request")}
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
  return (
    <RequestFilesProvider value={entry.serverId}>
      <Page>
        {crumbs(entry.requestNo)}
        <PageHeader
          eyebrow="Payments"
          title={entry.requestNo}
          badges={<Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>}
          description={`Raised by ${entry.requestedBy} on ${formatDateTime(entry.requestedOn)} · ${formatINR(amount)} · ${whereNow(entry)}`}
          actions={
            <Button variant="ghost" onClick={onBack}>
              Back to list
            </Button>
          }
        />

        <CollapsibleCard title="Status" summary={statusSummary(entry)}>
          <div className="space-y-4">
            <DecisionSummary entry={entry} />
            <RouteTimeline entry={entry} />
            <SapPayment entry={entry} />
          </div>
        </CollapsibleCard>

        <CollapsibleCard title="History" summary={historySummary(entry)}>
          <RequestHistory entry={entry} />
        </CollapsibleCard>

        <Card className="p-4 md:p-5">
          <CardHeader>
            <CardTitle>Request Details</CardTitle>
          </CardHeader>
          <RequestSummary entry={entry} />
        </Card>

        <DocumentLines entry={entry} />
        <ExpenseLines entry={entry} />

        {/* The account is sent only to those who may see it (Payment and later). */}
        {entry.payout && entry.api.can.see_account ? (
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
              tds={null}
            />
          </Card>
        ) : null}
      </Page>
    </RequestFilesProvider>
  );
}

/* ── The list ───────────────────────────────────────────────────────────── */

function Approvers({ entry }: { entry: AdvanceRequestEntry }) {
  const people = entry.api.approvers ?? [];
  if (!people.length) return <span className="text-subtle">—</span>;
  return <>{people.map((p) => p.name || p.username).join(", ")}</>;
}

function LastActivity({ entry }: { entry: AdvanceRequestEntry }) {
  const last = entry.api.last_activity;
  if (!last) return <span className="text-subtle">—</span>;
  return (
    <>
      <span className="block">
        {last.label}
        {last.by ? ` · ${last.by}` : ""}
      </span>
      <span className="block text-[11px] text-subtle">{formatDateTime(last.on)}</span>
    </>
  );
}

function RegisterTable({ entries, onOpen }: { entries: AdvanceRequestEntry[]; onOpen: (id: number) => void }) {
  const narrow = useNarrow();
  if (narrow) {
    return (
      <div className="space-y-2">
        {entries.map((e) => (
          <article key={e.id} className="rounded-sm border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-ink">{e.requestNo}</span>
              <span className="shrink-0 font-semibold tabular-nums text-ink">{formatINR(requestAmount(e.form))}</span>
            </div>
            <p className="m-0 mt-0.5 truncate text-[12.5px] text-body">{payeeOf(e.form)}</p>
            <p className="m-0 mt-0.5 text-[11px] text-subtle">
              {[e.form.company, typeLabel(e.form), paymentAgainstLabel(e.form)].filter(Boolean).join(" · ")}
            </p>
            <p className="m-0 text-[11px] text-subtle">
              {e.requestedBy} · {formatDateTime(e.requestedOn)}
            </p>
            <p className="m-0 mt-1 text-[12px] text-ink">{whereNow(e)}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
              <Button variant="secondary" size="xs" aria-label={`View ${e.requestNo}`} onClick={() => onOpen(e.serverId)}>
                View
              </Button>
            </div>
          </article>
        ))}
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Request</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Type / Against</TableHead>
          <TableHead>Partner</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Where Now</TableHead>
          <TableHead>Approved / Decided By</TableHead>
          <TableHead>Last Activity</TableHead>
          <TableHead>
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.id}>
            <TableCell>
              <span className="block font-semibold text-ink">{e.requestNo}</span>
              <span className="block text-[11px] text-subtle">
                {e.requestedBy} · {formatDateTime(e.requestedOn)}
              </span>
            </TableCell>
            <TableCell>{e.form.company}</TableCell>
            <TableCell>
              <span className="block">{typeLabel(e.form)}</span>
              <span className="block text-[11px] text-subtle">{paymentAgainstLabel(e.form)}</span>
            </TableCell>
            <TableCell>
              <span className="block">{payeeOf(e.form)}</span>
              {e.form.partner ? <span className="block text-[11px] text-subtle">{e.form.partner}</span> : null}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums text-ink">
              {formatINR(requestAmount(e.form))}
            </TableCell>
            <TableCell>
              <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
            </TableCell>
            <TableCell>{whereNow(e)}</TableCell>
            <TableCell>
              <Approvers entry={e} />
            </TableCell>
            <TableCell>
              <LastActivity entry={e} />
            </TableCell>
            <TableCell className="text-right">
              <Button variant="secondary" size="xs" aria-label={`View ${e.requestNo}`} onClick={() => onOpen(e.serverId)}>
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Advance_Payment_Register() {
  const list = useRequestList("all");
  const entries = useMemo(() => list.data ?? [], [list.data]);
  const [filters, setFilters] = useState<RegisterFilters>(NO_REGISTER_FILTERS);
  const [openId, setOpenId] = useState<number | null>(null);

  const options = useMemo(() => registerOptions(entries), [entries]);
  const shown = useMemo(() => filterRegister(entries, filters), [entries, filters]);
  const total = shown.reduce((sum, e) => sum + requestAmount(e.form), 0);
  const active = activeFilterCount(filters);
  const set = <K extends keyof RegisterFilters>(key: K) => (value: RegisterFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  if (openId !== null) return <RegisterDetail id={openId} onBack={() => setOpenId(null)} />;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Payments" }, { label: "All Payment Requests" }]} />
      <PageHeader
        eyebrow="Payments"
        title="All Payment Requests"
        description="Every request, where it waits and who has decided on it. Filters combine, and each takes several values."
        actions={
          <Button variant="ghost" onClick={() => void list.refetch()} disabled={list.isFetching}>
            <HiOutlineArrowPath className="size-4" aria-hidden="true" />
            {list.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {list.isError ? (
        <Notice tone="bad" title="Could not load the requests">
          {advancePaymentError(list.error)}
        </Notice>
      ) : null}

      <FilterBar>
        <FilterSearch
          label="Search"
          placeholder="No., partner, raised by…"
          value={filters.search}
          onChange={(e) => set("search")(e.target.value)}
        />
        <FilterMultiSelect label="Status" placeholder="Any status" options={options.statuses} value={filters.statuses} onChange={set("statuses")} />
        <FilterMultiSelect label="Desk (waiting at)" placeholder="Any desk" options={options.desks} value={filters.desks} onChange={set("desks")} emptyText="Nothing is waiting" />
        <FilterMultiSelect
          label="Company"
          placeholder="Any company"
          options={COMPANIES.map((c) => ({ value: c as string, label: c as string }))}
          value={filters.companies}
          onChange={set("companies")}
        />
        <FilterMultiSelect label="Type" placeholder="Any type" options={options.types} value={filters.types} onChange={set("types")} />
        <FilterMultiSelect label="Payment Against" placeholder="Bill, PO, …" options={options.against} value={filters.against} onChange={set("against")} />
        <FilterMultiSelect label="Vendor / Payee" placeholder="Any payee" options={options.partners} value={filters.partners} onChange={set("partners")} searchable />
        <FilterMultiSelect label="Approver" placeholder="Anyone" options={options.approvers} value={filters.approvers} onChange={set("approvers")} searchable />
        <FilterMultiSelect label="Raised By" placeholder="Anyone" options={options.creators} value={filters.creators} onChange={set("creators")} searchable />
        <FilterDate label="Raised From" value={filters.from} max={filters.to || undefined} onChange={(e) => set("from")(e.target.value)} />
        <FilterDate label="Raised To" value={filters.to} min={filters.from || undefined} onChange={(e) => set("to")(e.target.value)} />
        <FilterActions>
          <Button variant="ghost" size="xs" onClick={() => setFilters(NO_REGISTER_FILTERS)} disabled={!active}>
            Clear filters{active ? ` (${active})` : ""}
          </Button>
        </FilterActions>
      </FilterBar>

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <FilterCount>
            {shown.length} of {entries.length} · {formatINR(total)}
          </FilterCount>
        </CardHeader>
        {shown.length ? (
          <RegisterTable entries={shown} onOpen={setOpenId} />
        ) : (
          <p className="m-0 py-8 text-center text-[13px] text-subtle">
            {list.isLoading ? "Loading…" : "No requests match these filters."}
          </p>
        )}
      </Card>
    </Page>
  );
}
