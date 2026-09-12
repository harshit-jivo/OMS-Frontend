/**
 * Tracker reports — turnaround, bottlenecks and ageing across the flow.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  HiOutlineArrowDownTray,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineFunnel,
  HiOutlineInboxStack,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  FilterActions,
  FilterBar,
  FilterDate,
  FilterSelect,
} from "@/components/ui/filter-bar";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Page,
  PageHeader,
  Stat,
  StatRow,
} from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { showToast } from "@/lib/toastStore";
// SheetJS (422 kB) is fetched when the user asks for the export, not when
// the report page opens — see utils/xlsxLoader.ts.
import { loadXlsx } from "../utils/xlsxLoader";
import trackerService from "../services/trackerService";
import type { ReportFilters } from "../services/trackerService";

// Green → amber → orange → red, oldest bucket reddest.
const AGE_COLORS = ["#10b981", "#f59e0b", "#f97316", "#ef4444"];

// Chart chrome, matched to the tokens the rest of the app draws with.
const GRID = "#eef0f3";
const BRAND = "#2563eb";
const BAD = "#ef4444";
// Second series on the throughput chart. Validated against BRAND: CVD ΔE 29.3
// (deutan), normal-vision 32.0 — comfortably clear of the ΔE 15 floor.
const BRAND_ALT = "#10b981";

/**
 * Per-disposition colours for the decisions table.
 *
 * Re-stepped, not chosen by eye: the obvious amber/orange pair for HOLD and
 * DEBIT measured ΔE 9.6 for NORMAL vision — under the 15 floor, i.e. hard to
 * tell apart even without a colour-vision deficiency — so DEBIT moved to violet.
 * The set now passes lightness, chroma, CVD separation and the normal-vision
 * floor. Colour is never the only cue here: every row is a labelled count, which
 * is also what discharges the sub-3:1 contrast warning on the lighter fills.
 *
 * SKIPPED is deliberately the neutral ink token rather than a hue. It is not a
 * decision anyone made — it marks a desk a fast-tracked invoice was sent past —
 * so it should read as absence, not as a fifth verdict.
 */
const DECISION_TONES: Record<string, string> = {
  OK: "#10b981",
  APPROVED: "#10b981",
  HOLD: "#f59e0b",
  DEBIT: "#8b5cf6",
  RETURN: "#ef4444",
  REJECTED: "#ef4444",
  SKIPPED: "#94a3b8",
};
const DECISION_FALLBACK = "#64748b";

export default function Tracker_Reports() {
  // Draft vs applied, as on Tracker_Invoices: `applied` IS the query key, so
  // going back to a filter set already seen is a cache hit rather than a
  // round trip, and the report on screen can never disagree with the filters
  // that produced it.
  const [filters, setFilters] = useState<ReportFilters>({});
  const [applied, setApplied] = useState<ReportFilters>({});

  const { data: lookups = null } = useQuery({
    queryKey: ["tracker", "lookups"],
    queryFn: () => trackerService.getLookups(),
    staleTime: 5 * 60_000,
  });

  const { data = null, isFetching: loading } = useQuery({
    queryKey: ["tracker", "reports", applied],
    queryFn: () => trackerService.getReports(applied),
  });

  const load = (next: ReportFilters = filters) => setApplied(next);

  const exportExcel = async () => {
    if (!data) return;
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([data.summary]), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.pending_by_stage), "Pending");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.avg_days_per_stage), "Avg Days");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.bottleneck_by_person), "By Person");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.bottleneck_by_vendor), "By Vendor");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data.bottleneck_by_category),
      "By Category",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.ageing), "Ageing");
    XLSX.writeFile(wb, "tracker-report.xlsx");
    showToast({ title: "Report exported", message: "tracker-report.xlsx" });
  };

  const setF = (k: keyof ReportFilters, v: string | number) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Tracker" }, { label: "Reports" }]} />

      <PageHeader
        title="Tracker Reports"
        description="Turnaround, bottlenecks and ageing across the invoice flow."
        actions={
          <Button onClick={() => void exportExcel()} disabled={!data}>
            <HiOutlineArrowDownTray aria-hidden="true" /> Export Excel
          </Button>
        }
      />

      <FilterBar>
        <FilterDate
          label="From"
          value={filters.from || ""}
          onChange={(e) => setF("from", e.target.value)}
        />
        <FilterDate label="To" value={filters.to || ""} onChange={(e) => setF("to", e.target.value)} />
        <FilterSelect
          label="Branch"
          value={filters.branch || ""}
          onChange={(e) => setF("branch", Number(e.target.value))}
        >
          <option value="">All branches</option>
          {lookups?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Unit"
          value={filters.unit || ""}
          onChange={(e) => setF("unit", Number(e.target.value))}
        >
          <option value="">All units</option>
          {lookups?.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Category"
          value={filters.category || ""}
          onChange={(e) => setF("category", Number(e.target.value))}
        >
          <option value="">All categories</option>
          {lookups?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterActions>
          <Button variant="primary" onClick={() => load()}>
            <HiOutlineFunnel aria-hidden="true" /> Apply
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setFilters({});
              load({});
            }}
          >
            Reset
          </Button>
        </FilterActions>
      </FilterBar>

      {loading || !data ? (
        <>
          <StatRow>
            <Stat label="In progress" value="" loading />
            <Stat label="Completed" value="" loading />
            <Stat label="Overdue" value="" loading />
            <Stat label="Avg cycle (days)" value="" loading />
          </StatRow>
          <Card>
            <Skeleton className="h-[280px] w-full" />
          </Card>
        </>
      ) : (
        <>
          <StatRow>
            <Stat
              label="In progress"
              value={data.summary.in_progress}
              icon={HiOutlineInboxStack}
              tone="brand"
            />
            <Stat
              label="Completed"
              value={data.summary.completed}
              icon={HiOutlineCheckCircle}
              tone="ok"
            />
            <Stat
              label="Overdue"
              value={data.summary.overdue}
              icon={HiOutlineExclamationTriangle}
              tone={data.summary.overdue ? "bad" : "neutral"}
            />
            <Stat
              label="Avg cycle (days)"
              value={data.summary.avg_cycle_days}
              icon={HiOutlineClock}
              tone="hold"
            />
          </StatRow>

          <Card>
            <CardHeader>
              <CardTitle>Average days per stage</CardTitle>
            </CardHeader>
            {data.avg_days_per_stage.length === 0 ? (
              <EmptyState title="No stage timings yet" className="py-10" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={data.avg_days_per_stage}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis
                    dataKey="stage_name"
                    fontSize={11}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="avg_days" name="Avg days" fill={BRAND} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pending invoices per stage</CardTitle>
            </CardHeader>
            {data.pending_by_stage.length === 0 ? (
              <EmptyState title="Nothing pending at any stage" className="py-10" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={data.pending_by_stage}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis
                    dataKey="stage_name"
                    fontSize={11}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" name="Pending" fill={BRAND} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="overdue" name="Overdue" fill={BAD} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Volume per stage</CardTitle>
            </CardHeader>
            <p className="mb-3 text-[12.5px] text-subtle">
              Invoices that <strong>reached</strong> each desk in the selected
              period, against the decisions those desks recorded. This is
              throughput — unlike “Pending per stage” above, which is a snapshot
              of what is sitting there right now, so the two will not tally.
            </p>
            {data.flow_by_stage.every((s) => !s.arrived && !s.decided) ? (
              <EmptyState
                title="Nothing moved in this period"
                className="py-10"
              />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={data.flow_by_stage}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis
                    dataKey="stage_name"
                    fontSize={11}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="arrived" name="Arrived" fill={BRAND} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="decided" name="Decided" fill={BRAND_ALT} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Decisions by stage</CardTitle>
            </CardHeader>
            <p className="mb-3 text-[12.5px] text-subtle">
              What each desk decided in the period. An invoice held and later
              advanced counts twice — those are two real decisions, not a
              duplicate. <strong>Skipped</strong> marks a desk a fast-tracked
              invoice was sent past.
            </p>
            {/* A table, not a stacked bar: the question is "how many approved,
                how many rejected", and that is a number. Nine stages × up to
                five dispositions would also be an unreadable stack. It doubles
                as the table view the lighter fills require. */}
            <div className="overflow-x-auto">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Arrived</TableHead>
                    <TableHead className="text-right">Decided</TableHead>
                    <TableHead>Breakdown</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.flow_by_stage.filter((s) => s.arrived || s.decided)
                    .length === 0 ? (
                    <TableEmpty colSpan={4}>
                      No stage activity in this period.
                    </TableEmpty>
                  ) : (
                    data.flow_by_stage
                      .filter((s) => s.arrived || s.decided)
                      .map((s) => (
                        <TableRow key={s.stage_code}>
                          <TableCell className="whitespace-nowrap font-medium text-ink">
                            {s.stage_name}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.arrived}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.decided}
                          </TableCell>
                          <TableCell>
                            {s.decisions.length === 0 ? (
                              <span className="text-subtle">—</span>
                            ) : (
                              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                {s.decisions.map((d) => (
                                  <span
                                    key={d.status}
                                    className="flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="size-2.5 shrink-0 rounded-full"
                                      style={{
                                        background:
                                          DECISION_TONES[d.status] ??
                                          DECISION_FALLBACK,
                                      }}
                                    />
                                    <span className="text-[12.5px] text-subtle">
                                      {d.status}
                                    </span>
                                    <span className="text-[12.5px] font-semibold tabular-nums text-ink">
                                      {d.count}
                                    </span>
                                  </span>
                                ))}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ageing of open invoices</CardTitle>
            </CardHeader>
            {data.ageing.length === 0 ? (
              <EmptyState title="No open invoices" className="py-10" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.ageing} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="bucket" fontSize={12} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Open invoices" radius={[4, 4, 0, 0]}>
                    {data.ageing.map((_, i) => (
                      <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))] sm:gap-6">
            <BottleneckTable title="Slowest people" rows={data.bottleneck_by_person} keyLabel="Person" />
            <BottleneckTable title="Slowest vendors" rows={data.bottleneck_by_vendor} keyLabel="Vendor" />
            <BottleneckTable title="By category" rows={data.bottleneck_by_category} keyLabel="Category" />
          </div>
        </>
      )}
    </Page>
  );
}

function BottleneckTable({
  title,
  rows,
  keyLabel,
}: {
  title: string;
  rows: { key: string; avg_days: number; visits: number }[];
  keyLabel: string;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <CardHeader className="mb-0 border-b border-line px-4 py-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHead>{keyLabel}</TableHead>
            <TableHead>Avg days</TableHead>
            <TableHead className="text-right">Visits</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={3}>No data.</TableEmpty>
          ) : (
            rows.slice(0, 10).map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-ink">{r.key}</TableCell>
                <TableCell>
                  <Badge tone={r.avg_days > 5 ? "bad" : r.avg_days > 3 ? "hold" : "ok"} outlined>
                    {r.avg_days}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
