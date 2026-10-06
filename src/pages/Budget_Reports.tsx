/**
 * Budget Reports — every approver's budget items, for whoever oversees them.
 *
 * The approval desk shows each approver only their own queue and their own
 * decisions. This page shows all of it (JSAP's month-wise report, its
 * DocEntry / vendor search and its Excel export, as one page):
 *
 *   * filters: the DOCUMENT's month (when the spend belongs, not when OMS took
 *     the draft in), company, status, and a search that takes a draft or
 *     document number, a vendor or a budget head;
 *   * the counts for those filters, and per person what waits on them now and
 *     what they approved, auto-approved or rejected;
 *   * the items themselves — a row opens the draft read-only, with its stages,
 *     history and SAP attachments;
 *   * Export: the same filters as an Excel workbook (Approvers, Items, Lines).
 *
 * Read-only: `Budget_Reports` decides nothing. Deciding stays with the stage's
 * user on the approval desk.
 */
import { useCallback, useEffect, useState } from "react";
import {
  HiArrowDownTray,
  HiArrowPath,
  HiExclamationCircle,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineDocumentText,
  HiOutlineEye,
  HiOutlineInbox,
  HiOutlineXCircle,
} from "react-icons/hi2";

import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumbs";
import { Button } from "../components/ui/button";
import { FilterBar, FilterCount, FilterDate, FilterSearch, FilterSelect, FilterSpacer } from "../components/ui/filter-bar";
import { Card, CardHeader, CardTitle, EmptyState, Page, PageHeader, Stat, StatRow } from "../components/ui/page";
import { Pagination } from "../components/ui/pagination";
import { TableSkeleton } from "../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import {
  budgetError,
  budgetService,
  draftLabel,
  routeLabel,
  type BudgetItem,
  type BudgetItemStatus,
  type BudgetReport,
  type BudgetReportFilters,
} from "../services/budgetService";
import { DraftDialog } from "./Budget_Approval";

const PAGE_SIZE = 25;

const STATUS_TONE: Record<BudgetItemStatus, "hold" | "ok" | "bad" | "neutral"> = {
  PENDING: "hold",
  APPROVED: "ok",
  REJECTED: "bad",
  GONE: "neutral",
  SUPERSEDED: "neutral",
};

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (value: string | number) => inr.format(Number(value || 0));

/** This month, as the month input wants it: `YYYY-MM`. */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function BudgetReports() {
  const [filters, setFilters] = useState<BudgetReportFilters>({ month: thisMonth(), company: "", status: "", q: "" });
  const [search, setSearch] = useState("");
  const [report, setReport] = useState<BudgetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<BudgetItem | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await budgetService.report(filters));
    } catch (err) {
      setError(budgetError(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every filter change starts again from the first page. */
  const change = (patch: Partial<BudgetReportFilters>) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const exportExcel = async () => {
    setExporting(true);
    setError("");
    try {
      const blob = await budgetService.exportReport(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `budget-approvals-${filters.month || "all"}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(budgetError(err));
    } finally {
      setExporting(false);
    }
  };

  const items = report?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageNumber = Math.min(page, totalPages);
  const shown = items.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
  const s = report?.summary;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Budget" }, { label: "Budget Reports" }]} />
      <PageHeader
        title="Budget Reports"
        description="Every budget approval, by the document's month: what waits on whom, and who decided what."
        actions={
          <>
            <Button variant="ghost" onClick={() => void load()}>
              <HiArrowPath aria-hidden="true" /> Refresh
            </Button>
            <Button variant="secondary" onClick={() => void exportExcel()} disabled={exporting || loading}>
              <HiArrowDownTray aria-hidden="true" /> {exporting ? "Exporting…" : "Export to Excel"}
            </Button>
          </>
        }
      />

      <FilterBar>
        <FilterDate
          label="Document month"
          type="month"
          value={filters.month}
          onChange={(e) => change({ month: e.target.value })}
        />
        <FilterSelect label="Company" value={filters.company} onChange={(e) => change({ company: e.target.value })}>
          <option value="">All companies</option>
          <option value="OIL">Oil</option>
          <option value="BEVERAGES">Beverages</option>
        </FilterSelect>
        <FilterSelect label="Status" value={filters.status} onChange={(e) => change({ status: e.target.value })}>
          <option value="">Any status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="GONE">No longer in SAP</option>
          <option value="SUPERSEDED">Replaced (draft changed)</option>
        </FilterSelect>
        <FilterSearch
          label="Draft no., vendor or budget head"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") change({ q: search.trim() });
          }}
          onBlur={() => search.trim() !== (filters.q ?? "") && change({ q: search.trim() })}
          placeholder="54447, Facebook, Factory…"
        />
        <FilterSpacer />
        <FilterCount>Items: {loading ? "—" : items.length}</FilterCount>
      </FilterBar>

      {error && (
        <Card className="border-bad/40 bg-bad/5">
          <div className="flex items-start gap-2 p-3 text-[13px] text-bad" role="alert">
            <HiExclamationCircle className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        </Card>
      )}

      <StatRow>
        <Stat label="All items" value={s?.total.count ?? "—"} hint={s ? money(s.total.amount) : undefined}
          icon={HiOutlineDocumentText} loading={loading} />
        <Stat label="Pending" tone="hold" value={s?.pending.count ?? "—"} hint={s ? money(s.pending.amount) : undefined}
          icon={HiOutlineClock} loading={loading} />
        <Stat label="Approved" tone="ok" value={s?.approved.count ?? "—"} hint={s ? money(s.approved.amount) : undefined}
          icon={HiOutlineCheckCircle} loading={loading} />
        <Stat label="Rejected" tone="bad" value={s?.rejected.count ?? "—"} hint={s ? money(s.rejected.amount) : undefined}
          icon={HiOutlineXCircle} loading={loading} />
      </StatRow>

      <Card className="overflow-hidden p-0">
        <CardHeader className="px-4 pt-3">
          <CardTitle>By approver</CardTitle>
        </CardHeader>
        {loading ? (
          <TableSkeleton columns={6} rows={4} label="Loading approvers" />
        ) : (report?.approvers.length ?? 0) === 0 ? (
          <p className="m-0 px-4 pb-4 text-[13px] text-subtle">Nobody has anything here for these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table density="compact" aria-label="Approvers">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead>Approver</TableHead>
                  <TableHead className="text-right">Pending now</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Auto-approved</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report!.approvers.map((a) => (
                  <TableRow key={a.user_id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.pending}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.approved}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.auto_approved}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.rejected}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{a.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {loading ? (
        <TableSkeleton columns={9} label="Loading budget items" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={HiOutlineInbox} title="No budget items" hint="Nothing matches these filters." />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table density="compact" aria-label="Budget items">
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead>Document</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead className="min-w-[180px]">Party</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waiting on</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-semibold text-brand">{draftLabel(row.draft)}</TableCell>
                    <TableCell className="whitespace-nowrap">{when(row.draft.doc_date)}</TableCell>
                    <TableCell>{row.company}</TableCell>
                    <TableCell className="whitespace-nowrap">{routeLabel(row)}</TableCell>
                    <TableCell>{row.draft.card_name || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.amount)}</TableCell>
                    <TableCell>
                      <Badge tone={STATUS_TONE[row.status]}>{row.status_label}</Badge>
                      {row.sap_status === "FAILED" ? (
                        <span className="block text-[11px] text-bad">SAP write failed</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.status === "PENDING" ? (
                        <>
                          {row.current_user?.name ?? "—"}
                          <span className="block text-[11px] text-subtle">
                            {row.current_stage} · since {when(row.waiting_since)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDetail(row)}
                        aria-label={`View ${draftLabel(row.draft)}`}
                        title="View draft"
                      >
                        <HiOutlineEye aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {items.length > PAGE_SIZE && (
        <Pagination
          page={pageNumber}
          totalPages={totalPages}
          onPageChange={setPage}
          summary={`Showing ${(pageNumber - 1) * PAGE_SIZE + 1}–${Math.min(pageNumber * PAGE_SIZE, items.length)} of ${items.length}${report?.truncated ? " (the first 5,000 — narrow the filters)" : ""}`}
        />
      )}

      <DraftDialog item={detail} onClose={() => setDetail(null)} />
    </Page>
  );
}
