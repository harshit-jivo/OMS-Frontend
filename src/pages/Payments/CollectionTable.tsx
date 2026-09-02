import { EmptyState, ErrorState } from "./ApprovalUI";
import { initials, money } from "./dashboardFormat";
import type {
  CollectionPerformance,
  CollectionRow,
  SortField,
} from "../../services/paymentsDashboardService";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <th className={className}>
      <button
        type="button"
        className={`pdash-sort${active ? " is-active" : ""}`}
        onClick={() => onSort(field)}
        title={
          active
            ? `Sorted ${direction === "asc" ? "ascending" : "descending"}. Click to reverse.`
            : `Sort by ${label.toLowerCase()}`
        }
      >
        {label}
        <span className="pdash-sort-arrow" aria-hidden="true">
          {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

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
    <div className="pdash-bar-cell" title={tooltip}>
      <span className="pdash-bar-amount">{money(amount)}</span>
      <span
        className={`pdash-bar tone-${tone}`}
        role="img"
        aria-label={`${percent}% of the highest`}
      >
        <span className="pdash-bar-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="pdash-bar-pct">{percent}%</span>
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
    <section className="apv-card pdash-table-card">
      <div className="apv-card-head pdash-table-head">
        <div>
          <h3>Collection Performance</h3>
          <div className="pdash-card-sub">
            Everyone who took part — collected, banked, recorded or submitted.
            Bars show each person&apos;s share of the strongest performer in
            that column.
          </div>
        </div>
        <div className="pdash-table-tools">
          <input
            type="search"
            className="pdash-search"
            placeholder="Search name or code…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search participants"
          />
          {!loading && total > 0 && (
            <span className="pdash-count">
              {total} {total === 1 ? "person" : "people"}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="pdash-rows-skel" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="pdash-skel pdash-skel-row" key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            search ? "Nobody matches that search" : "No activity in this period"
          }
          hint={
            search
              ? "Try a different name or code."
              : "People appear here once they collect, bank, record or submit."
          }
        />
      ) : (
        <>
          <div className="apv-table-wrap">
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
                    label="Received Payment"
                    sort={sort}
                    direction={direction}
                    onSort={onSort}
                  />
                  <SortHeader
                    field="deposited"
                    label="Deposit Amount"
                    sort={sort}
                    direction={direction}
                    onSort={onSort}
                  />
                  <SortHeader
                    field="total"
                    label="Total Collected"
                    sort={sort}
                    direction={direction}
                    onSort={onSort}
                    className="pdash-num"
                  />
                  <TableHead aria-label="View details" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.key}
                    className="pdash-row-clickable"
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
                      <div className="pdash-person">
                        <span
                          className={`pdash-avatar kind-${row.kind}`}
                          aria-hidden="true"
                        >
                          {initials(row.name)}
                        </span>
                        <span className="pdash-person-text">
                          <span className="pdash-person-name">{row.name}</span>
                          <span
                            className="pdash-person-code"
                            title={row.role_labels.join(" · ")}
                          >
                            {row.code}
                            {/* A login and a collection person can share a
                                name; the tag says which this row is. */}
                            {row.kind === "user" && (
                              <em className="pdash-kind-tag">login</em>
                            )}
                          </span>
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <BarCell
                        amount={row.received}
                        percent={row.received_percent}
                        tone="blue"
                        tooltip={`${row.name} — ${money(row.received)} across ${row.receipt_count} receipt${row.receipt_count === 1 ? "" : "s"}. Includes invoice and advance payments. Bar is ${row.received_percent}% of the highest.`}
                      />
                    </TableCell>

                    <TableCell>
                      <BarCell
                        amount={row.deposited}
                        percent={row.deposit_percent}
                        tone="green"
                        tooltip={`${row.name} — ${money(row.deposited)} across ${row.deposit_count} deposit${row.deposit_count === 1 ? "" : "s"}. Bar is ${row.deposit_percent}% of the highest.`}
                      />
                    </TableCell>

                    <TableCell className="pdash-num">
                      <span
                        className="pdash-total"
                        title={`Received ${money(row.received)} + deposited ${money(row.deposited)} = ${money(row.total)}`}
                      >
                        {money(row.total)}
                      </span>
                    </TableCell>

                    <TableCell className="pdash-num">
                      <span className="pdash-view" aria-hidden="true">
                        ›
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="pdash-pager">
              <button
                type="button"
                className="apv-btn"
                disabled={page <= 1}
                onClick={() => onPage(page - 1)}
              >
                Previous
              </button>
              <span className="pdash-pager-text">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="apv-btn"
                disabled={page >= totalPages}
                onClick={() => onPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
