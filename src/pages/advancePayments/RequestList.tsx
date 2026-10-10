/**
 * The request list both Advance Payment pages show — the requester's Entries
 * tab and the approval desk. Laid out like BackDate's (`pages/backdate/`):
 * KPI cards that ARE the status filter, and search / company / status
 * controls in a row. The cards reuse BackDate's `KpiFilter`, so a card here
 * behaves exactly like a card there — click or Enter/Space selects it, and
 * `aria-pressed` says which count the list is showing.
 */
import type { ReactNode } from "react";
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
  payeeOf,
  paymentAgainstLabel,
  requestAmount,
  typeLabel,
  vendorRefs,
  type AdvanceRequestEntry,
} from "./approvalData";
import { COMPANIES } from "./constants";
import {
  STATUS_LABEL,
  STATUS_TONE,
  formatDateTime,
  type CompanyFilter,
  type DeskCounts,
  type DeskFilter,
  type RequestCounts,
  type RequestFilterState,
  type StatusFilter,
} from "./requestLabels";
import { formatINR } from "./rules";
import { useNarrow } from "./useNarrow";

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

/**
 * The approval desk's cards: what waits at YOUR stage, and what YOU approved,
 * rejected or returned. Other approvers' decisions are not counted here.
 */
export function DeskKpis({
  counts,
  status,
  onSelect,
}: {
  counts: DeskCounts;
  status: DeskFilter;
  onSelect: (status: DeskFilter) => void;
}) {
  return (
    <>
      <KpiFilter
        label="Pending at your stage"
        hint={`${formatINR(counts.pendingAmount)} waiting`}
        value={counts.pending}
        tone="hold"
        active={status === "PENDING"}
        onSelect={() => onSelect("PENDING")}
      />
      <KpiFilter
        label="Approved by you"
        value={counts.approved}
        tone="ok"
        active={status === "APPROVED"}
        onSelect={() => onSelect("APPROVED")}
      />
      <KpiFilter
        label="Rejected by you"
        value={counts.rejected}
        tone="bad"
        active={status === "REJECTED"}
        onSelect={() => onSelect("REJECTED")}
      />
      <KpiFilter
        label="All entries"
        hint={counts.returned ? `incl. ${counts.returned} returned by you` : undefined}
        value={counts.total}
        active={status === ""}
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
  { value: "RETURNED", label: "Returned" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

/** Search, then company, then status — the order they narrow in. */
export function RequestFilters<S extends string = StatusFilter>({
  value,
  onChange,
  statusOptions = STATUS_OPTIONS as ReadonlyArray<{ value: S; label: string }>,
}: {
  value: RequestFilterState<S>;
  onChange: (next: RequestFilterState<S>) => void;
  statusOptions?: ReadonlyArray<{ value: S; label: string }>;
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
        onChange={(e) => onChange({ ...value, status: e.target.value as S })}
        className={cn(CONTROL, "cursor-pointer px-2.5")}
      >
        {statusOptions.map((s) => (
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
  status,
  selection,
}: {
  entries: AdvanceRequestEntry[];
  onOpen: (entry: AdvanceRequestEntry) => void;
  /** The row's button — "Review" on the desk, "Details" for the requester. */
  action: (entry: AdvanceRequestEntry) => { label: string; variant: ButtonVariant };
  emptyText: string;
  /**
   * The status column, when it is not the request's own status: the desk
   * shows the approver's OWN decision instead.
   */
  status?: { header: string; cell: (entry: AdvanceRequestEntry) => ReactNode };
  /** A tick per row that can be selected (the desk: what you may decide), and a tick for all of them. */
  selection?: {
    canSelect: (entry: AdvanceRequestEntry) => boolean;
    selected: ReadonlySet<number>;
    onChange: (next: Set<number>) => void;
  };
}) {
  const narrow = useNarrow();
  const selectable = selection ? entries.filter(selection.canSelect).map((e) => e.serverId) : [];
  const allTicked = selectable.length > 0 && selectable.every((id) => selection?.selected.has(id));
  const toggle = (id: number) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };
  const tickAll = () => selection?.onChange(allTicked ? new Set() : new Set(selectable));

  if (narrow) {
    return (
      <div className="space-y-2">
        {selection && selectable.length ? (
          <label className="flex cursor-pointer items-center gap-2 px-1 text-[12.5px] text-body">
            <input
              type="checkbox"
              className="size-4 cursor-pointer accent-brand"
              aria-label="Select all waiting on you"
              checked={allTicked}
              onChange={tickAll}
            />
            Select all waiting on you
          </label>
        ) : null}
        {entries.length === 0 ? (
          <p className="m-0 py-8 text-center text-[13px] text-subtle">{emptyText}</p>
        ) : (
          entries.map((e) => {
            const { label, variant } = action(e);
            return (
              <article key={e.id} className="rounded-sm border border-line bg-surface p-3">
                <div className="flex items-start gap-2.5">
                  {selection?.canSelect(e) ? (
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand"
                      aria-label={`Select ${e.requestNo}`}
                      checked={selection.selected.has(e.serverId)}
                      onChange={() => toggle(e.serverId)}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-ink">{e.requestNo}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">
                        {formatINR(requestAmount(e.form))}
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 truncate text-[12.5px] text-body">{payeeOf(e.form)}</p>
                    <p className="m-0 mt-0.5 text-[11px] text-subtle">
                      {[e.form.company, typeLabel(e.form), paymentAgainstLabel(e.form)].filter(Boolean).join(" · ")}
                    </p>
                    <p className="m-0 text-[11px] text-subtle">
                      {e.requestedBy} · {formatDateTime(e.requestedOn)}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        {status ? (
                          status.cell(e)
                        ) : (
                          <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                        )}
                      </div>
                      <Button
                        variant={variant}
                        size="xs"
                        aria-label={`${label} ${e.requestNo}`}
                        onClick={() => onOpen(e)}
                      >
                        {label}
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {selection ? (
            <TableHead className="w-8">
              <input
                type="checkbox"
                className="size-4 cursor-pointer accent-brand"
                aria-label="Select all waiting on you"
                disabled={selectable.length === 0}
                checked={allTicked}
                onChange={tickAll}
              />
            </TableHead>
          ) : null}
          <TableHead>Request</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Payment Against</TableHead>
          <TableHead>Partner</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>{status?.header ?? "Status"}</TableHead>
          <TableHead>
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={selection ? 9 : 8} className="py-8 text-center text-subtle">
              {emptyText}
            </TableCell>
          </TableRow>
        ) : (
          entries.map((e) => {
            const { label, variant } = action(e);
            return (
              <TableRow key={e.id}>
                {selection ? (
                  <TableCell className="w-8">
                    {selection.canSelect(e) ? (
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-brand"
                        aria-label={`Select ${e.requestNo}`}
                        checked={selection.selected.has(e.serverId)}
                        onChange={() => toggle(e.serverId)}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
                <TableCell>
                  <span className="block font-semibold text-ink">{e.requestNo}</span>
                  <span className="block text-[11px] text-subtle">
                    {e.requestedBy} · {formatDateTime(e.requestedOn)}
                  </span>
                </TableCell>
                <TableCell>{e.form.company}</TableCell>
                <TableCell>{typeLabel(e.form)}</TableCell>
                <TableCell>{paymentAgainstLabel(e.form)}</TableCell>
                <TableCell>
                  {payeeOf(e.form)}
                  {vendorRefs(e.form).length ? (
                    <span className="block text-[11px] text-subtle">
                      Vendor Ref. {vendorRefs(e.form).join(", ")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-ink">
                  {formatINR(requestAmount(e.form))}
                </TableCell>
                <TableCell>
                  {status ? (
                    status.cell(e)
                  ) : (
                    <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                  )}
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
