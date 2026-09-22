/**
 * The request list both Advance Payment pages show — the requester's Entries
 * tab and the approval desk. Laid out like BackDate's (`pages/backdate/`):
 * KPI cards that ARE the status filter, and search / company / status
 * controls in a row. The cards reuse BackDate's `KpiFilter`, so a card here
 * behaves exactly like a card there — click or Enter/Space selects it, and
 * `aria-pressed` says which count the list is showing.
 */
import { HiMagnifyingGlass } from "react-icons/hi2";

import { Badge } from "../../components/ui/badge";
import { Button, type ButtonVariant } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { cn } from "@/lib/utils";
import { KpiFilter } from "../backdate/filters";

import {
  paymentAgainstLabel,
  requestAmount,
  typeLabel,
  type AdvanceRequestEntry,
} from "./approvalData";
import { COMPANIES } from "./constants";
import {
  PRIORITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  formatDateTime,
  priorityLabel,
  type CompanyFilter,
  type RequestCounts,
  type RequestFilterState,
  type StatusFilter,
} from "./requestLabels";
import { formatINR } from "./rules";

/* ── KPI cards ───────────────────────────────────────────────────────────── */

export function RequestKpis({
  counts,
  status,
  onSelect,
  live = true,
}: {
  counts: RequestCounts;
  status: StatusFilter;
  onSelect: (status: StatusFilter) => void;
  /** False while the list is not on screen — no card is then the active one. */
  live?: boolean;
}) {
  return (
    <>
      <KpiFilter
        label="Pending"
        hint={`${formatINR(counts.pendingAmount)} waiting`}
        value={counts.pending}
        tone="hold"
        active={live && status === "PENDING"}
        onSelect={() => onSelect("PENDING")}
      />
      <KpiFilter
        label="Approved"
        value={counts.approved}
        tone="ok"
        active={live && status === "APPROVED"}
        onSelect={() => onSelect("APPROVED")}
      />
      <KpiFilter
        label="Rejected"
        value={counts.rejected}
        tone="bad"
        active={live && status === "REJECTED"}
        onSelect={() => onSelect("REJECTED")}
      />
      {/* Total clears the status filter rather than selecting a fourth one. */}
      <KpiFilter
        label="Total"
        value={counts.total}
        active={live && status === ""}
        onSelect={() => onSelect("")}
      />
    </>
  );
}

/* ── Search / company / status ───────────────────────────────────────────── */

/** Sized to sit beside a tab strip — the token BackDate's filters use. */
const CONTROL = cn(
  "h-control-xs min-w-0 rounded-sm border border-line bg-surface",
  "[font-family:inherit] text-[12.5px] text-ink",
  "transition-colors hover:border-line-strong",
  "focus-visible:border-brand focus-visible:bg-card focus-visible:shadow-focus focus-visible:outline-none",
);

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "", label: "All requests" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

/** Search, then company, then status — the order they narrow in. */
export function RequestFilters({
  value,
  onChange,
}: {
  value: RequestFilterState;
  onChange: (next: RequestFilterState) => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <div className="relative min-w-0 flex-1 sm:flex-none">
        <HiMagnifyingGlass
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <input
          type="search"
          aria-label="Search requests"
          placeholder="Search no., partner, raised by…"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          className={cn(CONTROL, "w-full pl-7 pr-2.5 placeholder:text-subtle sm:w-60")}
        />
      </div>

      <select
        aria-label="Filter requests by company"
        value={value.company}
        onChange={(e) => onChange({ ...value, company: e.target.value as CompanyFilter })}
        className={cn(CONTROL, "cursor-pointer px-2.5")}
      >
        <option value="">All companies</option>
        {COMPANIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter requests by status"
        value={value.status}
        onChange={(e) => onChange({ ...value, status: e.target.value as StatusFilter })}
        className={cn(CONTROL, "cursor-pointer px-2.5")}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value || "all"} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── The table ───────────────────────────────────────────────────────────── */

export function RequestTable({
  entries,
  onOpen,
  action,
  emptyText,
}: {
  entries: AdvanceRequestEntry[];
  onOpen: (entry: AdvanceRequestEntry) => void;
  /** The row's button — "Review" on the desk, "Details" for the requester. */
  action: (entry: AdvanceRequestEntry) => { label: string; variant: ButtonVariant };
  emptyText: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Request</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Payment Against</TableHead>
          <TableHead>Partner</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={9} className="py-8 text-center text-subtle">
              {emptyText}
            </TableCell>
          </TableRow>
        ) : (
          entries.map((e) => {
            const { label, variant } = action(e);
            return (
              <TableRow key={e.id}>
                <TableCell>
                  <span className="block font-semibold text-ink">{e.requestNo}</span>
                  <span className="block text-[11px] text-subtle">
                    {e.requestedBy} · {formatDateTime(e.requestedOn)}
                  </span>
                </TableCell>
                <TableCell>{e.form.company}</TableCell>
                <TableCell>{typeLabel(e.form)}</TableCell>
                <TableCell>{paymentAgainstLabel(e.form)}</TableCell>
                <TableCell>{e.form.partnerName || e.form.partner}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-ink">
                  {formatINR(requestAmount(e.form))}
                </TableCell>
                <TableCell>
                  <Badge tone={PRIORITY_TONE[e.form.priority]}>{priorityLabel(e)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant={variant}
                    size="xs"
                    aria-label={`${label} ${e.requestNo}`}
                    onClick={() => onOpen(e)}
                  >
                    {label}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
