/**
 * The filter controls the two BackDate pages share.
 *
 * Both pages head a list with the same four counts and narrow it by the same
 * two dimensions, so the controls live here rather than being written twice
 * and drifting. What differs is only where the numbers come from: the
 * requester page counts the caller's own requests, the approval desk counts
 * what is waiting on them.
 */
import { Stat } from "../../components/ui/page";
import { cn } from "../../lib/utils";
import {
  BACKDATE_COMPANIES,
  type BackDateCompany,
} from "../../services/backdateService";

/** The status filter, and what each KPI card selects when it is clicked. */
const STATUSES = [
  { value: "", label: "All requests" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
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
  value,
  tone,
  active,
  onSelect,
}: {
  label: string;
  value: number;
  tone?: "ok" | "bad" | "hold";
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Stat
      label={label}
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

/** The four cards, wired to a status filter. Identical on both pages. */
export function KpiFilterRow({
  counts,
  status,
  onSelect,
  live = true,
}: {
  counts: { pending: number; approved: number; rejected: number; total: number };
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
