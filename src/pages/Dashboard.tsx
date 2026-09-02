/**
 * The Dashboard page: the hero header, the KPI row, the visual-overview
 * panel, every dialog, and the two chart sections below.
 *
 * Everything else moved out in Phase 4 decomposition — the data-fetching,
 * state and all role-aware derivations into `dashboard/useDashboard`, the
 * per-role KPI cards into `dashboard/components/KpiRow`, the top-parties /
 * progress / status-pie panel into `dashboard/components/VisualOverviewPanel`,
 * every dialog into `dashboard/components/DashboardDialogs`, the two chart
 * rows into `dashboard/components/ChartsSection`, and the admin-only
 * state-wise item box into `dashboard/components/StateItemSalesSection`.
 * What's left here is what belongs to neither: the loading/error gates and
 * the hero header (year/month filters, role welcome copy).
 */
import { MONTH_OPTIONS, YEARS } from "./dashboard/constants";
import ChartsSection from "./dashboard/components/ChartsSection";
import DashboardDialogs from "./dashboard/components/DashboardDialogs";
import KpiRow from "./dashboard/components/KpiRow";
import StateItemSalesSection from "./dashboard/components/StateItemSalesSection";
import VisualOverviewPanel from "./dashboard/components/VisualOverviewPanel";
import { useDashboard } from "./dashboard/useDashboard";
import { fmt } from "./dashboard/format";
import "../styles/Dashboard.css";

export default function Dashboard() {
  const dashboard = useDashboard();
  const { loading, error, kpi, charts, fetchData, roleMeta, year, setYear, month, setMonth, peakMonth } =
    dashboard;

  if (loading) {
    return (
      <div className="db-loading">
        <div className="db-spinner" />
        Loading dashboard...
      </div>
    );
  }

  if (error && !kpi && !charts) {
    return (
      <div className="db-root">
        <div className="db-empty-state">
          <h2>Dashboard unavailable</h2>
          <p>{error}</p>
          <button className="db-retry-btn" onClick={() => void fetchData()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="db-root">
      <style>{`
        @media (max-width: 1024px) {
          .db-kpi-row { grid-template-columns: repeat(2, 1fr) !important; }
          .db-overview-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .db-state-item-list { grid-template-columns: 1fr !important; }
          .db-charts-row { display: flex !important; flex-direction: column !important; gap: 24px !important; }
        }
        @media (max-width: 768px) {
          .db-kpi-row, .db-overview-grid { grid-template-columns: 1fr !important; display: flex !important; flex-direction: column !important; }
          .db-header { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
          .db-hero-summary { flex-wrap: wrap !important; justify-content: flex-start !important; margin-top: 16px !important; gap: 12px !important; }
          .db-overview-top, .db-chart-head { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
          .db-overview-top > div { width: 100%; }
          .db-party-list-details { flex: 1; min-width: 0; word-break: break-word; }
          .db-legend { flex-wrap: wrap !important; }
        }
        @media (max-width: 480px) {
          .db-filter-group { width: 100% !important; }
          .db-year-select { width: 100% !important; }
          .db-segmented-control { width: 100% !important; display: flex !important; flex-wrap: wrap !important; }
          .db-segmented-btn { flex: 1 1 auto !important; text-align: center !important; }
          .db-highlight-sub { word-break: break-word; }
        }
      `}</style>
      <div className="db-hero">
        <div className="db-hero-main">
          <div className="db-header">
            <div>
              <h1 className="db-title">{roleMeta.title}</h1>
              <p className="db-subtitle">{roleMeta.subtitle}</p>
            </div>
            <div className="db-filter-group">
              <select
                className="db-year-select"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Select year"
              >
                {YEARS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                className="db-year-select"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="Select month"
              >
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="db-hero-summary">
            {/* <div className="db-hero-summary-item">
              <span>{isBilling ? "Handled" : "Revenue"}</span>
              <strong>{isBilling ? fmt(completionCount) : fmtCurrency(kpi?.total_revenue ?? 0)}</strong>
            </div> */}
            <div className="db-hero-summary-item">
              <span>Total Orders</span>
              <strong>{fmt(kpi?.total_orders ?? 0)}</strong>
            </div>
            <div className="db-hero-summary-item">
              <span>Peak Month</span>
              <strong>{peakMonth?.label ?? "N/A"}</strong>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="db-inline-alert">{error}</div> : null}

      <KpiRow dashboard={dashboard} />
      <VisualOverviewPanel dashboard={dashboard} />
      <DashboardDialogs dashboard={dashboard} />
      <ChartsSection dashboard={dashboard} />
      <StateItemSalesSection dashboard={dashboard} />
    </div>
  );
}
