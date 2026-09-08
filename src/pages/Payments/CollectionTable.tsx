/**
 * Collection Performance — every participant in the payment workflow.
 *
 * Deliberately not a top-N list. The point of the table is to show the whole
 * team, and a cut-off silently hides the people whose figures most need
 * looking at.
 *
 * Rows come from four participation paths and two identity types: a
 * CollectionPerson (money was received from them, or they banked it) and an
 * OMS user (they recorded the receipt or submitted the deposit). Rows are keyed
 * by `kind:id` because the two id spaces overlap — person 3 and user 3 are
 * different people.
 */
import { HiOutlineChevronRight, HiOutlineChevronUpDown } from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { FilterBar, FilterCount, FilterSearch } from "@/components/ui/filter-bar";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState } from "./ApprovalUI";
import { initials, money } from "./dashboardFormat";
import type {
  CollectionPerformance,
  CollectionRow,
  SortField,
} from "../../services/paymentsDashboardService";

function SortHeader({
  field,
  label,
  sort,
  direction,
  onSort,
  className = "",
}: {
  field: SortField;
  label: string;
  sort: SortField;
  direction: "asc" | "desc";
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = sort === field;
  return (
    <TableHead
      className={"p-0 " + className}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        /* DESIGN_SYSTEM §1.1 reset — preflight is not imported, so a bare
           <button> keeps the UA's border and font. */
        className={
          "flex w-full cursor-pointer appearance-none items-center gap-1 border-0 bg-transparent px-3 py-2 text-left [font-family:inherit] text-inherit hover:text-ink " +
          (active ? "text-ink" : "")
        }
        onClick={() => onSort(field)}
        title={
          active
            ? "Sorted " + (direction === "asc" ? "ascending" : "descending") + ". Click to reverse."
            : "Sort by " + label.toLowerCase()
        }
      >
        {label}
        <span aria-hidden="true" className={active ? "text-brand" : "text-subtle"}>
          {active ? (direction === "asc" ? "↑" : "↓") : <HiOutlineChevronUpDown />}
        </span>
      </button>
    </TableHead>
  );
}

/**
 * An amount with a bar showing its share of the strongest performer.
 *
 * The bar is `role="img"` with a label rather than bare colour, so the ranking
 * it conveys is available to a screen reader too.
 */
function BarCell({
  amount,
  percent,
  tone,
  tooltip,
}: {
  amount: number;
  percent: number;
  tone: "blue" | "green";
  tooltip: string;
}) {
  return (
    <div className="flex min-w-[150px] items-center gap-2" title={tooltip}>
      <span className="w-[86px] shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-ink">
        {money(amount)}
      </span>
      <span
        className="h-1.5 min-w-[40px] flex-1 overflow-hidden rounded-full bg-surface-strong"
        role="img"
        aria-label={percent + "% of the highest"}
      >
        <span
          className={"block h-full rounded-full " + (tone === "blue" ? "bg-brand" : "bg-ok")}
          style={{ width: percent + "%" }}
        />
      </span>
      <span className="w-[34px] shrink-0 text-[11px] tabular-nums text-subtle">{percent}%</span>
    </div>
  );
}

export default function CollectionTable({
  data,
  loading,
  error,
  onRetry,
  search,
  onSearch,
  sort,
  direction,
  onSort,
  onPage,
  onOpen,
}: {
  data: CollectionPerformance;
  loading: boolean;
  error: string;
  onRetry: () => void;
  search: string;
  onSearch: (value: string) => void;
  sort: SortField;
  direction: "asc" | "desc";
  onSort: (field: SortField) => void;
  onPage: (page: number) => void;
  onOpen: (row: CollectionRow) => void;
}) {
  const rows = data.results;
  const { page, total_pages: totalPages, total } = data.pagination;

  return (
    <Card className="overflow-hidden p-0">
      <CardHeader className="mb-0 flex-col items-stretch gap-3 border-b border-line px-4 py-3">
        <div>
          <CardTitle>Collection performance</CardTitle>
          <p className="m-0 mt-0.5 text-[12px] text-subtle">
            Everyone who took part — collected, banked, recorded or submitted. Bars show each
            person&apos;s share of the strongest performer in that column.
          </p>
        </div>
        <FilterBar className="border-0 bg-transparent p-0">
          <FilterSearch
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Name or code…"
            fieldClassName="min-w-[220px]"
          />
          {!loading && total > 0 && (
            <FilterCount>
              {total} {total === 1 ? "person" : "people"}
            </FilterCount>
          )}
        </FilterBar>
      </CardHeader>

      {loading ? (
        <div className="space-y-2 p-4" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton className="h-10 w-full" key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={search ? "Nobody matches that search" : "No activity in this period"}
          hint={
            search
              ? "Try a different name or code."
              : "People appear here once they collect, bank, record or submit."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <SortHeader
                    field="name"
                    label="Person"
                    sort={sort}
                    direction={direction}
                    onSort={onSort}
                  />
                  <SortHeader
                    field="received"
                    label="Received payment"
                    sort={sort}
                    direction={direction}
                    onSort={onSort}
                  />
                  <SortHeader
                    field="deposited"
                    label="Deposit amount"
                    sort={sort}
                    direction={direction}
                    onSort={onSort}
                  />
                  <SortHeader
                    field="total"
                    label="Total collected"
                    sort={sort}
                    direction={direction}
                    onSort={onSort}
                    className="text-right"
                  />
                  <TableHead aria-label="View details" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.key}
                    className="cursor-pointer"
                    onClick={() => onOpen(row)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen(row);
                      }
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={
                            "grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold " +
                            (row.kind === "user"
                              ? "bg-brand-soft text-brand"
                              : "bg-surface-strong text-body")
                          }
                          aria-hidden="true"
                        >
                          {initials(row.name)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold text-ink">{row.name}</span>
                          <span
                            className="flex items-center gap-1.5 text-[11px] text-subtle"
                            title={row.role_labels.join(" · ")}
                          >
                            {row.code}
                            {/* A login and a collection person can share a
                                name; the tag says which this row is. */}
                            {row.kind === "user" && <Badge tone="neutral">login</Badge>}
                          </span>
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <BarCell
                        amount={row.received}
                        percent={row.received_percent}
                        tone="blue"
                        tooltip={
                          row.name +
                          " — " +
                          money(row.received) +
                          " across " +
                          row.receipt_count +
                          " receipt" +
                          (row.receipt_count === 1 ? "" : "s") +
                          ". Includes invoice and advance payments. Bar is " +
                          row.received_percent +
                          "% of the highest."
                        }
                      />
                    </TableCell>

                    <TableCell>
                      <BarCell
                        amount={row.deposited}
                        percent={row.deposit_percent}
                        tone="green"
                        tooltip={
                          row.name +
                          " — " +
                          money(row.deposited) +
                          " across " +
                          row.deposit_count +
                          " deposit" +
                          (row.deposit_count === 1 ? "" : "s") +
                          ". Bar is " +
                          row.deposit_percent +
                          "% of the highest."
                        }
                      />
                    </TableCell>

                    <TableCell className="text-right">
                      <span
                        className="font-bold tabular-nums text-ink"
                        title={
                          "Received " +
                          money(row.received) +
                          " + deposited " +
                          money(row.deposited) +
                          " = " +
                          money(row.total)
                        }
                      >
                        {money(row.total)}
                      </span>
                    </TableCell>

                    <TableCell className="text-right text-subtle">
                      <HiOutlineChevronRight aria-hidden="true" className="inline" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={onPage}
              className="border-t border-line px-4 py-3"
            />
          )}
        </>
      )}
    </Card>
  );
}
