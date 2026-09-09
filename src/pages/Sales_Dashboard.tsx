/**
 * The Sales Dashboard — order and revenue analytics, per role.
 *
 * Formerly `/Dashboard`, which was the landing page as well; `/Home` took that
 * job so this could carry a permission (`Sales_Dashboard`). See section 11 of
 * `docs/codebase/DESIGN_SYSTEM.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE HERO BECAME
 * ─────────────────────────────────────────────────────────────────────────
 * There was a dark full-bleed banner carrying the greeting, the two period
 * selects, and two figures (Total Orders, Peak Month) that existed nowhere
 * else. It is gone, and each of its three jobs went where that kind of thing
 * lives everywhere else in the app:
 *
 *   * the greeting -> `PageHeader`;
 *   * the selects  -> a `FilterBar`, because that is what they are — the
 *     period every number below is computed for;
 *   * the two figures -> the `StatRow`, because they are numbers, and having
 *     them in a banner meant the page had its KPIs in two places at two
 *     sizes.
 *
 * The `<style>` block of `!important` media queries went with it. It was
 * re-declaring the grid at three breakpoints because `.db-kpi-row` and
 * friends were fixed-column grids; `StatRow` and the panels below are
 * `auto-fit`, so there is nothing left to override.
 */
import { HiOutlineArrowPath, HiOutlineCalendarDays } from "react-icons/hi2";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { Card, Notice, Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { MONTH_OPTIONS, YEARS } from "./dashboard/constants";
import ChartsSection from "./dashboard/components/ChartsSection";
import DashboardDialogs from "./dashboard/components/DashboardDialogs";
import KpiRow from "./dashboard/components/KpiRow";
import StateItemSalesSection from "./dashboard/components/StateItemSalesSection";
import VisualOverviewPanel from "./dashboard/components/VisualOverviewPanel";
import { useDashboard } from "./dashboard/useDashboard";

export default function Sales_Dashboard() {
  const dashboard = useDashboard();
  const { loading, error, kpi, charts, fetchData, roleMeta, year, setYear, month, setMonth } =
    dashboard;

  const periodFilters = (
    <FilterBar>
      <FilterSelect
        label="Year"
        icon={HiOutlineCalendarDays}
        fieldClassName="max-w-[180px] flex-none"
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
      >
        {YEARS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect
        label="Month"
        fieldClassName="max-w-[180px] flex-none"
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
      >
        {MONTH_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </FilterSelect>
    </FilterBar>
  );

  /*
   * The failure state keeps the header and the period picker.
   *
   * The version this replaces returned a bare "Dashboard unavailable" box with
   * a Retry button and nothing else — so a user whose 2026 request failed lost
   * the year selector along with the data, and could not try another period
   * without reloading the page.
   */
  if (error && !kpi && !charts) {
    return (
      <Page>
        <Breadcrumbs items={[{ label: "Reports" }, { label: "Sales Dashboard" }]} />
        <PageHeader title="Sales Dashboard" description={roleMeta.subtitle} />
        {periodFilters}
        <Card>
          <Notice tone="bad" title="Dashboard unavailable">
            {error}
          </Notice>
          <div className="mt-3">
            <Button variant="primary" onClick={() => void fetchData()}>
              <HiOutlineArrowPath aria-hidden="true" /> Retry
            </Button>
            
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Reports" }, { label: "Sales Dashboard" }]} />

      <PageHeader
        title="Sales Dashboard"
        description={roleMeta.subtitle}
        actions={
          <Button variant="ghost" onClick={() => void fetchData()} disabled={loading}>
            <HiOutlineArrowPath
              aria-hidden="true"
              className={loading ? "motion-safe:animate-spin" : undefined}
            />
            Refresh
          </Button>
        }
      />

      {periodFilters}

      {/* A partial failure — one of the two calls answered — is worth saying
          out loud rather than silently rendering half a dashboard. */}
      {error ? <Notice tone="hold">{error}</Notice> : null}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <KpiRow dashboard={dashboard} />
          <VisualOverviewPanel dashboard={dashboard} />
          <ChartsSection dashboard={dashboard} />
          <StateItemSalesSection dashboard={dashboard} />
        </>
      )}

      <DashboardDialogs dashboard={dashboard} />
    </Page>
  );
}

/**
 * The loading state, shaped like the page.
 *
 * It was a centred spinner over the words "Loading dashboard...", which tells
 * the reader nothing about what is coming and reflows the whole page when it
 * resolves. This holds the layout.
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading dashboard</span>
      <div className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] sm:gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[86px] w-full" />
        ))}
      </div>
      <Skeleton className="h-[300px] w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[280px] w-full" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    </div>
  );
}
