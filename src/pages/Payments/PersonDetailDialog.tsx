import { lazy, Suspense } from "react";

import { Modal } from "./ApprovalUI";
import { useResource } from "./useApprovalAdmin";
import { initials, money, prettyDate } from "./dashboardFormat";
import paymentsDashboardService, {
  DEFAULT_PRESET,
  type CollectionRow,
  type DashboardQuery,
  type PersonDetail,
} from "../../services/paymentsDashboardService";

const DonutChart = lazy(() => import("./DonutChart"));

/**
 * One participant's collection history, opened from the performance table.
 *
 * Scoped to the SAME company and date window as the dashboard behind it —
 * otherwise a person's totals here would not reconcile with the row that was
 * clicked, which is the first thing anyone checks.
 */

const EMPTY: PersonDetail = {
  person: { id: 0, kind: "person", key: "", name: "", code: "", subtitle: "" },
  filters: { company: "", preset: DEFAULT_PRESET, date_from: "", date_to: "" },
  kpis: {
    received_total: 0,
    received_count: 0,
    deposit_total: 0,
    deposit_collected: 0,
    deposit_count: 0,
    against_invoice: 0,
    advance_payment: 0,
  },
  charts: {
    received: { total: 0, slices: [] },
    methods: { total: 0, slices: [] },
  },
  timeline: [],
  recent_activity: [],
};

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="pdash-pd-stat">
      <div className="pdash-pd-stat-label">{label}</div>
      <div className="pdash-pd-stat-value">{money(value)}</div>
      {hint && <div className="pdash-pd-stat-hint">{hint}</div>}
    </div>
  );
}

/** Collected vs banked per day, as paired bars.
 *
 *  Hand-drawn rather than a charting component: it is two bars per day against
 *  a shared scale, and the series is already capped server-side at a quarter,
 *  so pulling in a second chart type would cost more than it explains. */
function Timeline({ points }: { points: PersonDetail["timeline"] }) {
  if (!points.length) return null;

  const peak = Math.max(
    ...points.map((p) => Math.max(p.received, p.deposited)),
    0,
  );
  if (!peak) return null;

  return (
    <div className="pdash-pd-timeline">
      {points.map((p) => (
        <div className="pdash-pd-day" key={p.date}>
          <div className="pdash-pd-bars">
            <span
              className="pdash-pd-bar tone-blue"
              style={{ height: `${(p.received / peak) * 100}%` }}
              title={`${prettyDate(p.date)} — collected ${money(p.received)}`}
            />
            <span
              className="pdash-pd-bar tone-green"
              style={{ height: `${(p.deposited / peak) * 100}%` }}
              title={`${prettyDate(p.date)} — banked ${money(p.deposited)}`}
            />
          </div>
          <span className="pdash-pd-day-label">{p.date.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

export default function PersonDetailDialog({
  row,
  query,
  onClose,
}: {
  row: CollectionRow;
  query: DashboardQuery;
  onClose: () => void;
}) {
  const detail = useResource<PersonDetail>(
    () => paymentsDashboardService.person(row.kind, row.id, query),
    EMPTY,
    // Refetches if the dashboard's window changes underneath an open dialog.
    [row.key, query.company, query.preset, query.date_from, query.date_to],
  );

  const d = detail.data;
  const loading = detail.loading;

  return (
    <Modal title={row.name} onClose={onClose} wide>
      {loading ? (
        <div className="pdash-pd-skel" aria-hidden="true">
          <div className="pdash-skel pdash-skel-line wide" />
          <div className="pdash-skel pdash-skel-row" />
          <div className="pdash-skel pdash-skel-row" />
          <div className="pdash-skel pdash-skel-row" />
        </div>
      ) : detail.error ? (
        <div className="apv-notice apv-notice-warn">
          <span>{detail.error}</span>
          <button type="button" className="apv-btn" onClick={detail.reload}>
            Retry
          </button>
        </div>
      ) : (
        <div className="pdash-pd">
          {/* --- Who, and over what window --------------------------- */}
          <div className="pdash-pd-head">
            <span className={`pdash-avatar lg kind-${d.person.kind}`}>
              {initials(d.person.name)}
            </span>
            <div>
              <div className="pdash-pd-name">{d.person.name}</div>
              <div className="pdash-pd-sub">
                {d.person.subtitle}
                {d.person.code ? ` · ${d.person.code}` : ""}
              </div>
              <div className="pdash-pd-window">
                {d.filters.date_from === d.filters.date_to
                  ? prettyDate(d.filters.date_from)
                  : `${prettyDate(d.filters.date_from)} – ${prettyDate(d.filters.date_to)}`}
                {d.filters.company ? ` · ${d.filters.company}` : ""}
              </div>
              {row.role_labels.length > 0 && (
                <div className="pdash-pd-roles">
                  {row.role_labels.map((label) => (
                    <span className="pdash-pd-role" key={label}>
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* --- Totals ---------------------------------------------- */}
          <div className="pdash-pd-stats">
            <Stat
              label="Total Payments Collected"
              value={d.kpis.received_total}
              hint={`${d.kpis.received_count} receipt${d.kpis.received_count === 1 ? "" : "s"}`}
            />
            <Stat
              label="Total Deposits"
              value={d.kpis.deposit_total}
              hint={`${d.kpis.deposit_count} deposit${d.kpis.deposit_count === 1 ? "" : "s"}`}
            />
            <Stat label="Against Invoice" value={d.kpis.against_invoice} />
            <Stat label="Advance" value={d.kpis.advance_payment} />
          </div>

          {/* --- Charts ---------------------------------------------- */}
          <div className="pdash-pd-charts">
            {d.charts.received.total > 0 && (
              <div className="pdash-pd-chart">
                <h4>Invoice vs Advance</h4>
                <Suspense
                  fallback={<div className="pdash-skel pdash-skel-donut" />}
                >
                  <DonutChart
                    slices={d.charts.received.slices}
                    total={d.charts.received.total}
                    centerLabel="Collected"
                  />
                </Suspense>
              </div>
            )}
            {d.charts.methods.total > 0 && (
              <div className="pdash-pd-chart">
                <h4>Payment Method Breakdown</h4>
                <Suspense
                  fallback={<div className="pdash-skel pdash-skel-donut" />}
                >
                  <DonutChart
                    slices={d.charts.methods.slices}
                    total={d.charts.methods.total}
                    centerLabel="Collected"
                  />
                </Suspense>
              </div>
            )}
          </div>

          {/* --- Collection timeline --------------------------------- */}
          {d.timeline.length > 0 && (
            <div className="pdash-pd-section">
              <h4>
                Collection Timeline
                <span className="pdash-pd-legend">
                  <em className="tone-blue" /> Collected
                  <em className="tone-green" /> Banked
                </span>
              </h4>
              <Timeline points={d.timeline} />
            </div>
          )}

          {/* --- Recent activity ------------------------------------- */}
          <div className="pdash-pd-section">
            <h4>Recent Activities</h4>
            {d.recent_activity.length === 0 ? (
              <div className="pdash-pd-none">
                Nothing recorded in this period.
              </div>
            ) : (
              <ul className="pdash-pd-activity">
                {d.recent_activity.map((event) => (
                  <li key={`${event.kind}-${event.id}`}>
                    <span
                      className={`pdash-pd-dot ${event.kind === "RECEIPT" ? "tone-blue" : "tone-green"}`}
                      aria-hidden="true"
                    />
                    <span className="pdash-pd-act-main">
                      <span className="pdash-pd-act-ref">{event.reference}</span>
                      <span className="pdash-pd-act-party">{event.party}</span>
                    </span>
                    <span className="pdash-pd-act-meta">
                      <span className="pdash-pd-act-amount">
                        {money(event.amount)}
                      </span>
                      <span className="pdash-pd-act-date">
                        {prettyDate(event.date)} · {event.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
