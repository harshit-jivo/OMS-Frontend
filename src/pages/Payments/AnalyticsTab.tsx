import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useResource } from "./useApprovalAdmin";
import paymentsDashboardService, {
  DATE_PRESETS,
  DEFAULT_PRESET,
  type ChartSeries,
  type CollectionPerformance,
  type CollectionRow,
  type DashboardCompany,
  type DashboardData,
  type DatePreset,
  type SortField,
} from "../../services/paymentsDashboardService";
import { EmptyState, ErrorState } from "./ApprovalUI";
import CollectionTable from "./CollectionTable";
import PersonDetailDialog from "./PersonDetailDialog";
import { money, prettyDate, SLICE_COLORS, todayIso } from "./dashboardFormat";

/**
 * Payments Dashboard — Analytics.
 *
 * Every number comes from `/api/payments/dashboard/`; nothing on this screen is
 * computed in the browser and nothing is hardcoded. That single call is
 * deliberate: split per widget, a receipt posted between two requests would
 * leave a KPI card contradicting the donut next to it.
 *
 * Charts are recharts, matching Dashboard/Device_Management/Tracker_Reports.
 * They are lazy-loaded (see `DonutChart`) so the ~90 KB chart bundle is fetched
 * only when this tab is opened, not on every visit to the console.
 */

// Loaded on demand. Everything above the fold — filters, KPI cards — renders
// from the same payload without waiting for the chart bundle.
const DonutChart = lazy(() => import("./DonutChart"));

const EMPTY: DashboardData = {
  filters: { company: "", preset: DEFAULT_PRESET, date_from: "", date_to: "" },
  kpis: {
    total_payments: 0,
    total_payments_count: 0,
    deposit_total: 0,
    deposit_collected: 0,
    deposit_count: 0,
    received_total: 0,
    received_count: 0,
    against_invoice: 0,
    against_invoice_count: 0,
    advance_payment: 0,
    advance_count: 0,
    pending_receipts: 0,
    pending_receipts_count: 0,
    pending_deposits: 0,
    pending_deposits_count: 0,
    blocked_total: 0,
    blocked_count: 0,
  },
  charts: {
    received: { total: 0, slices: [] },
    methods: { total: 0, slices: [] },
    deposits: { total: 0, slices: [] },
  },
  collection_performance: {
    results: [],
    pagination: { page: 1, page_size: 25, total: 0, total_pages: 0 },
  },
};

// ===========================================================================
// Animated number
// ===========================================================================

/**
 * Counts a KPI up to its value on change.
 *
 * requestAnimationFrame rather than a CSS transition, because the value is text
 * rather than a style. Respects `prefers-reduced-motion` — a number sprinting
 * upward is exactly the movement that setting exists to stop.
 *
 * The previous value is held in a ref, not state: it is the animation's start
 * point, and storing it in state would schedule a second render per frame.
 */
function useCountUp(target: number, duration = 650): number {
  // What the animation has reached. `null` means "not animating" — the value
  // shown is then the target itself, so a first paint, a reduced-motion user
  // and an unchanged figure all render the real number with no effect writing
  // state to say so.
  const [tween, setTween] = useState<number | null>(null);
  const from = useRef(target);

  useEffect(() => {
    const start = from.current;
    from.current = target;

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduced || start === target) return;

    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      // easeOutCubic: quick start, gentle settle, so the figure lands legibly.
      const eased = 1 - Math.pow(1 - t, 3);
      setTween(t < 1 ? start + (target - start) * eased : null);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Cancelled on unmount and whenever a new target arrives mid-flight, so a
    // fast filter change cannot leave two animations fighting over the value.
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return tween ?? target;
}

// ===========================================================================
// KPI card
// ===========================================================================

interface KpiProps {
  label: string;
  value: number;
  hint: string;
  tooltip: string;
  icon: string;
  tone: "indigo" | "green" | "amber" | "violet" | "sky" | "slate" | "red";
  loading: boolean;
}

function KpiCard({ label, value, hint, tooltip, icon, tone, loading }: KpiProps) {
  const shown = useCountUp(value);

  if (loading) {
    return (
      <div className="pdash-kpi is-loading" aria-hidden="true">
        <div className="pdash-skel pdash-skel-icon" />
        <div className="pdash-kpi-body">
          <div className="pdash-skel pdash-skel-line short" />
          <div className="pdash-skel pdash-skel-line wide" />
          <div className="pdash-skel pdash-skel-line short" />
        </div>
      </div>
    );
  }

  return (
    <div className={`pdash-kpi tone-${tone}`} tabIndex={0} title={tooltip}>
      <span className="pdash-kpi-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="pdash-kpi-body">
        <div className="pdash-kpi-label">{label}</div>
        <div className="pdash-kpi-value">{money(shown)}</div>
        <div className="pdash-kpi-hint">{hint}</div>
      </div>
      <span className="pdash-tip" role="tooltip">
        {tooltip}
      </span>
    </div>
  );
}

// ===========================================================================
// Chart card
// ===========================================================================

function ChartCard({
  title,
  subtitle,
  series,
  centerLabel,
  loading,
  error,
  onRetry,
}: {
  title: string;
  subtitle: string;
  series: ChartSeries;
  centerLabel: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  // Legend entries the user has switched off. Hiding a slice re-scales the
  // remainder, which is the point — "what is the split excluding UPI".
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const visible = useMemo(
    () => series.slices.filter((s) => !hidden.has(s.key)),
    [series.slices, hidden],
  );

  // Recomputed from the visible slices so the centre total and the legend
  // percentages agree with what is actually drawn.
  const shownTotal = useMemo(
    () => visible.reduce((sum, s) => sum + s.amount, 0),
    [visible],
  );

  const hasData = series.slices.some((s) => s.amount > 0);

  return (
    <section className="apv-card pdash-chart-card">
      <div className="apv-card-head">
        <div>
          <h3>{title}</h3>
          <div className="pdash-card-sub">{subtitle}</div>
        </div>
      </div>

      {loading ? (
        <div className="pdash-chart-skel" aria-hidden="true">
          <div className="pdash-skel pdash-skel-donut" />
          <div className="pdash-chart-skel-legend">
            <div className="pdash-skel pdash-skel-line" />
            <div className="pdash-skel pdash-skel-line" />
            <div className="pdash-skel pdash-skel-line" />
          </div>
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !hasData ? (
        <EmptyState
          title="No data in this period"
          hint="Try a wider date range or a different company."
        />
      ) : (
        <div className="pdash-chart-body">
          <Suspense
            fallback={<div className="pdash-skel pdash-skel-donut" />}
          >
            <DonutChart
              slices={visible}
              total={shownTotal}
              centerLabel={centerLabel}
            />
          </Suspense>

          <ul className="pdash-legend">
            {series.slices.map((slice, index) => {
              const off = hidden.has(slice.key);
              // Percentages re-based on what is visible, so a legend showing
              // two of three slices still adds to 100%.
              const percent = off
                ? 0
                : shownTotal
                  ? (slice.amount / shownTotal) * 100
                  : 0;
              return (
                <li key={slice.key}>
                  <button
                    type="button"
                    className={`pdash-legend-item${off ? " is-off" : ""}`}
                    onClick={() => toggle(slice.key)}
                    aria-pressed={!off}
                    title={
                      off
                        ? `${slice.label} — hidden. Click to show.`
                        : `${slice.label}: ${money(slice.amount)} (${percent.toFixed(1)}% of shown). Click to hide.`
                    }
                  >
                    <span
                      className="pdash-legend-dot"
                      style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }}
                      aria-hidden="true"
                    />
                    <span className="pdash-legend-text">
                      <span className="pdash-legend-label">{slice.label}</span>
                      <span className="pdash-legend-value">
                        {money(slice.amount)}
                        <em>({percent.toFixed(1)}%)</em>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// ===========================================================================
// Collection performance
// ===========================================================================

// ===========================================================================
// Tab
// ===========================================================================

export default function AnalyticsTab() {
  const [company, setCompany] = useState("");
  // Last 30 Days by default — a rolling window, so the page never opens nearly
  // empty on the 1st of a month. Matches analytics.DEFAULT_PRESET so a request
  // with no preset resolves to the same range.
  const [preset, setPreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [from, setFrom] = useState(todayIso);
  const [to, setTo] = useState(todayIso);

  // Table controls, kept apart from the filters above: changing a page or a
  // sort must not re-run the KPI and chart aggregations, whose answers have
  // not changed.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortField>("total");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CollectionRow | null>(null);

  // One request per pause in typing, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // a new search invalidates the page number
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Companies come from the same master the payment forms use, so the filter
  // can never offer a category that has no SAP database behind it.
  const companies = useResource<DashboardCompany[]>(
    () => paymentsDashboardService.listCompanies(),
    [],
  );

  // A custom range only queries once both ends are set — otherwise every
  // keystroke in the date input would fire a request for a half-built range.
  const rangeReady = preset !== "custom" || Boolean(from && to);

  // The window every request shares. Memoised so the person dialog's deps do
  // not change identity on each render.
  const windowQuery = useMemo(
    () => ({
      company,
      preset,
      date_from: rangeReady ? from : undefined,
      date_to: rangeReady ? to : undefined,
    }),
    [company, preset, rangeReady, from, to],
  );

  const dashboard = useResource<DashboardData>(
    () =>
      rangeReady
        ? paymentsDashboardService.get({ ...windowQuery, sort, direction })
        : Promise.resolve(EMPTY),
    EMPTY,
    [company, preset, rangeReady ? from : "", rangeReady ? to : ""],
  );

  // Page 1 arrives with the dashboard, so the first paint needs no second
  // request. This only fires once a table control moves off its default.
  const tableDirty =
    page !== 1 || Boolean(debouncedSearch) || sort !== "total" || direction !== "desc";

  const table = useResource<CollectionPerformance>(
    () =>
      tableDirty && rangeReady
        ? paymentsDashboardService.collectionPerformance({
            ...windowQuery,
            search: debouncedSearch,
            sort,
            direction,
            page,
          })
        : Promise.resolve(dashboard.data.collection_performance),
    EMPTY.collection_performance,
    [
      company,
      preset,
      rangeReady ? from : "",
      rangeReady ? to : "",
      debouncedSearch,
      sort,
      direction,
      page,
      tableDirty,
      dashboard.data.collection_performance,
    ],
  );

  const onSort = useCallback((field: SortField) => {
    setSort((current) => {
      if (current === field) {
        // Same column again reverses it rather than re-sorting identically.
        setDirection((d) => (d === "asc" ? "desc" : "asc"));
        return current;
      }
      // A new column starts descending for money (biggest first) and
      // ascending for names (A–Z), which is what each one is read for.
      setDirection(field === "name" ? "asc" : "desc");
      return field;
    });
    setPage(1);
  }, []);

  const { kpis, charts } = dashboard.data;
  const loading = dashboard.loading;
  const error = dashboard.error;

  const rangeText = useMemo(() => {
    const f = dashboard.data.filters;
    if (!f.date_from) return "";
    return f.date_from === f.date_to
      ? prettyDate(f.date_from)
      : `${prettyDate(f.date_from)} – ${prettyDate(f.date_to)}`;
  }, [dashboard.data.filters]);

  return (
    <div className="pdash">
      {/* --- Filters ---------------------------------------------------- */}
      <div className="pdash-filters">
        <label className="pdash-filter">
          <span className="pdash-filter-label">Company</span>
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            title="Limit every figure on this page to one company. Each company is a separate SAP database."
          >
            <option value="">All Companies</option>
            {companies.data.map((c) => (
              <option key={c.company} value={c.company}>
                {c.display_name || c.company}
              </option>
            ))}
          </select>
        </label>

        <label className="pdash-filter">
          <span className="pdash-filter-label">Date Range</span>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as DatePreset)}
            title="Dates are resolved on the server, so everyone sees the same period regardless of their device clock."
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {preset === "custom" && (
          <div className="pdash-custom">
            <label className="pdash-filter">
              <span className="pdash-filter-label">From</span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="pdash-filter">
              <span className="pdash-filter-label">To</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
        )}

        {rangeText && !loading && (
          <div className="pdash-range" title="The period every figure below covers.">
            {rangeText}
          </div>
        )}
      </div>

      {error && !loading && (
        <div className="apv-notice apv-notice-warn pdash-error">
          <span>{error}</span>
          <button type="button" className="apv-btn" onClick={dashboard.reload}>
            Retry
          </button>
        </div>
      )}

      {/* --- KPI cards: settled in SAP ---------------------------------- */}
      <div className="pdash-section-label">
        <span>Posted to SAP</span>
        <em>Settled in the books of record</em>
      </div>

      {/* Four cards, not five: "Total Payments" was removed because it summed
          the same posted receipts as Received Total and always showed an
          identical figure — two cards answering one question. */}
      <div className="pdash-kpis">
        <KpiCard
          label="Deposit Total"
          value={kpis.deposit_total}
          hint={`${kpis.deposit_count} deposit${kpis.deposit_count === 1 ? "" : "s"} posted`}
          tooltip="Deposits posted to SAP — money confirmed into company bank accounts. Measured by the amount banked, so any shortfall against what was collected is excluded."
          icon="🏦"
          tone="green"
          loading={loading}
        />
        <KpiCard
          label="Received Total"
          value={kpis.received_total}
          hint={`${kpis.received_count} receipt${kpis.received_count === 1 ? "" : "s"} settled`}
          tooltip="Amount received from customers and confirmed in SAP. Anything not yet posted — including receipts SAP refused — appears under Not Yet in SAP instead."
          icon="⤓"
          tone="amber"
          loading={loading}
        />
        <KpiCard
          label="Against Invoice"
          value={kpis.against_invoice}
          hint={`${kpis.against_invoice_count} receipt${kpis.against_invoice_count === 1 ? "" : "s"} allocated`}
          tooltip="Posted payments applied to customer invoices rather than taken on account. Together with Advance Payment this adds up to Received Total."
          icon="▦"
          tone="violet"
          loading={loading}
        />
        <KpiCard
          label="Advance Payment"
          value={kpis.advance_payment}
          hint={`${kpis.advance_count} receipt${kpis.advance_count === 1 ? "" : "s"} on account`}
          tooltip="Posted payments with no invoice allocation — money taken on account, to be applied to an invoice later."
          icon="↗"
          tone="sky"
          loading={loading}
        />
      </div>

      {/* --- KPI cards: raised but not settled --------------------------
          Restricting the figures above to posted documents makes them
          trustworthy but would otherwise hide real work. These say what the
          posted totals are NOT counting. */}
      <div className="pdash-section-label">
        <span>Not Yet in SAP</span>
        <em>Created but not settled — excluded from the totals above</em>
      </div>

      <div className="pdash-kpis pdash-kpis-pending">
        <KpiCard
          label="Pending Payments"
          value={kpis.pending_receipts}
          hint={`${kpis.pending_receipts_count} receipt${kpis.pending_receipts_count === 1 ? "" : "s"} not posted`}
          tooltip="Payment receipts raised but not settled in SAP: draft, awaiting approval, mid-post, refused by SAP, or unconfirmed. Rejected and cancelled receipts are excluded — nothing is waiting on those."
          icon="◷"
          tone="slate"
          loading={loading}
        />
        <KpiCard
          label="Pending Deposits"
          value={kpis.pending_deposits}
          hint={`${kpis.pending_deposits_count} deposit${kpis.pending_deposits_count === 1 ? "" : "s"} not posted`}
          tooltip="Bank deposits raised but not settled in SAP. Kept separate from pending payments because banking a receipt and recording it are different steps, and adding them would count the same money twice."
          icon="◷"
          tone="slate"
          loading={loading}
        />
        <KpiCard
          label="Needs Attention"
          value={kpis.blocked_total}
          hint={`${kpis.blocked_count} document${kpis.blocked_count === 1 ? "" : "s"} stuck`}
          tooltip="The subset of pending work that will not clear on its own: SAP refused the document, or never answered. Everything else advances as the approval chain moves; these need somebody to correct and resubmit, or to reconcile."
          icon="⚠"
          tone="red"
          loading={loading}
        />
      </div>

      {/* --- Charts ----------------------------------------------------- */}
      <div className="pdash-charts">
        <ChartCard
          title="Received Payments"
          subtitle="Posted receipts: invoice-linked versus on-account"
          series={charts.received}
          centerLabel="Total Received"
          loading={loading}
          error={error}
          onRetry={dashboard.reload}
        />
        <ChartCard
          title="Received Payment Methods"
          subtitle="How the posted money arrived"
          series={charts.methods}
          centerLabel="Total Received"
          loading={loading}
          error={error}
          onRetry={dashboard.reload}
        />
        <ChartCard
          title="Deposit Details"
          subtitle="Posted deposits, by tender"
          series={charts.deposits}
          centerLabel="Total Deposited"
          loading={loading}
          error={error}
          onRetry={dashboard.reload}
        />
      </div>

      {/* --- Table ------------------------------------------------------ */}
      <CollectionTable
        data={table.data}
        loading={loading || table.loading}
        error={error || table.error}
        onRetry={tableDirty ? table.reload : dashboard.reload}
        search={search}
        onSearch={setSearch}
        sort={sort}
        direction={direction}
        onSort={onSort}
        onPage={setPage}
        onOpen={setSelected}
      />

      {/* Scoped to the same window as the page behind it, so a person's
          totals reconcile with the row that was clicked. */}
      {selected && (
        <PersonDetailDialog
          row={selected}
          query={windowQuery}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
