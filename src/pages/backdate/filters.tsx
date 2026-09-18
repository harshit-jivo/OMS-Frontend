/**
 * The filter controls the two BackDate pages share.
 *
 * Both pages head a list with the same four counts and narrow it by the same
 * two dimensions, so the controls live here rather than being written twice
 * and drifting. What differs is only where the numbers come from: the
 * requester page counts the caller's own requests, the approval desk counts
 * what is waiting on them.
 */
import { HiMagnifyingGlass } from "react-icons/hi2";

import { Stat } from "../../components/ui/page";
import { cn } from "../../lib/utils";
import {
  BACKDATE_COMPANIES,
  type BackDateCompany,
} from "../../services/backdateService";

/**
 * The status filter, and what each KPI card selects when it is clicked.
 *
 * `COMPLETED` is not a flow status. It means "approved AND the rights actually
 * reached SAP", so it selects a SUBSET of Approved rather than a fifth state.
 * Since SAP became the gate on the final approval the two differ only for
 * requests approved under the old order — which is exactly why it is worth
 * being able to ask for one and not the other.
 */
const STATUSES = [
  { value: "", label: "All requests" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "COMPLETED", label: "Completed (in SAP)" },
  { value: "REJECTED", label: "Rejected" },
] as const;

export type StatusFilter = (typeof STATUSES)[number]["value"];

/** `""` is every company — not a fourth company. */
export type CompanyFilter = "" | BackDateCompany;

/**
 * Both filters are sized to sit at the right of a tab strip rather than in a
 * filter card of their own. `h-control-xs` is the token the Workflows header
 * filter uses, so they line up with the tabs beside them.
 */
const SELECT_CLASS = cn(
  "h-control-xs min-w-0 cursor-pointer rounded-sm",
  "border border-line bg-surface px-2.5",
  "[font-family:inherit] text-[12.5px] text-ink",
  "transition-colors hover:border-line-strong",
  "focus-visible:border-brand focus-visible:bg-card focus-visible:shadow-focus focus-visible:outline-none",
);

/**
 * Find one entry by the number on the screen, or by whose SAP login it is for.
 *
 * Those are the two ways a person refers to one of these requests, and the
 * server matches both: an all-digit term matches the id exactly as well as
 * appearing in a SAP username, so searching "82" finds request 82 rather than
 * burying it under every id containing 82.
 */
export function SearchBox({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <HiMagnifyingGlass
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
        aria-hidden
      />
      <input
        type="search"
        aria-label="Search requests by ID or SAP user"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-control-xs w-52 min-w-0 rounded-sm",
          "border border-line bg-surface pl-7 pr-2.5",
          "[font-family:inherit] text-[12.5px] text-ink placeholder:text-subtle",
          "transition-colors hover:border-line-strong",
          "focus-visible:border-brand focus-visible:bg-card focus-visible:shadow-focus focus-visible:outline-none",
        )}
      />
    </div>
  );
}

export function CompanyFilterSelect({
  value,
  onChange,
}: {
  value: CompanyFilter;
  onChange: (v: CompanyFilter) => void;
}) {
  return (
    <select
      aria-label="Filter requests by company"
      value={value}
      onChange={(e) => onChange(e.target.value as CompanyFilter)}
      className={SELECT_CLASS}
    >
      <option value="">All companies</option>
      {BACKDATE_COMPANIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

export function StatusFilterSelect({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  return (
    <select
      aria-label="Filter requests by status"
      value={value}
      onChange={(e) => onChange(e.target.value as StatusFilter)}
      className={SELECT_CLASS}
    >
      {STATUSES.map((s) => (
        <option key={s.value || "all"} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A KPI card that is also the filter control for the status it counts.
 *
 * `Stat` renders a `<div>`, and a `<div>` is not valid content for a
 * `<button>`, so the card carries the button ROLE and the keyboard handling
 * the role promises instead of being wrapped in one. `aria-pressed` says which
 * count the list below is currently showing.
 */
export function KpiFilter({
  label,
  hint,
  value,
  tone,
  active,
  onSelect,
}: {
  label: string;
  hint?: string;
  value: number;
  tone?: "ok" | "bad" | "hold";
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Stat
      label={label}
      hint={hint}
      value={value}
      tone={tone}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer select-none",
        "focus-visible:outline-none focus-visible:shadow-focus",
        active && "border-brand ring-1 ring-brand/30",
      )}
    />
  );
}

/** The cards, wired to the status filter. Identical on both pages. */
export function KpiFilterRow({
  counts,
  status,
  onSelect,
  live = true,
}: {
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    completed: number;
    total: number;
  };
  status: StatusFilter;
  onSelect: (status: StatusFilter) => void;
  /**
   * Whether the list below is currently showing this filter at all. The
   * requester page can be on its Create tab, where no card is the active one.
   */
  live?: boolean;
}) {
  return (
    <>
      <KpiFilter
        label="Pending"
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
      {/* Sits beside Approved because it is a subset of it, and says so: an
          approved request whose SAP write never landed grants nothing, and a
          reader comparing the two numbers should not have to guess why they
          differ. */}
      <KpiFilter
        label="Completed"
        hint="rights reached SAP"
        value={counts.completed}
        tone="ok"
        active={live && status === "COMPLETED"}
        onSelect={() => onSelect("COMPLETED")}
      />
      <KpiFilter
        label="Rejected"
        value={counts.rejected}
        tone="bad"
        active={live && status === "REJECTED"}
        onSelect={() => onSelect("REJECTED")}
      />
      {/* Total clears the filter rather than selecting a fourth status. */}
      <KpiFilter
        label="Total"
        value={counts.total}
        active={live && status === ""}
        onSelect={() => onSelect("")}
      />
    </>
  );
}
