/**
 * One participant's collection history, opened from the performance table.
 *
 * Scoped to the SAME company and date window as the dashboard behind it —
 * otherwise a person's totals here would not reconcile with the row that was
 * clicked, which is the first thing anyone checks.
 */
import { lazy, Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice, SectionHeading, Stat, StatRow } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
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

/** Collected vs banked per day, as paired bars.
 *
 *  Hand-drawn rather than a charting component: it is two bars per day against
 *  a shared scale, and the series is already capped server-side at a quarter,
 *  so pulling in a second chart type would cost more than it explains. */
function Timeline({ points }: { points: PersonDetail["timeline"] }) {
  if (!points.length) return null;

  const peak = Math.max(...points.map((p) => Math.max(p.received, p.deposited)), 0);
  if (!peak) return null;

  return (
    <div className="flex h-[110px] items-end gap-1.5 overflow-x-auto rounded-sm border border-line bg-surface p-2.5">
      {points.map((p) => (
        <div className="flex min-w-[22px] flex-1 flex-col items-center gap-1" key={p.date}>
          <div className="flex h-20 w-full items-end justify-center gap-0.5">
            {/* Height is a live ratio against the window's peak day, not a
                fixed set of values — stays inline. */}
            <span
              className="w-1.5 rounded-t-sm bg-brand"
              style={{ height: (p.received / peak) * 100 + "%" }}
              title={prettyDate(p.date) + " — collected " + money(p.received)}
            />
            {/* Same reason as above — computed from live data. */}
            <span
              className="w-1.5 rounded-t-sm bg-ok"
              style={{ height: (p.deposited / peak) * 100 + "%" }}
              title={prettyDate(p.date) + " — banked " + money(p.deposited)}
            />
          </div>
          <span className="text-[10px] tabular-nums text-subtle">{p.date.slice(8)}</span>
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
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : detail.error ? (
        <Notice tone="bad" title="Could not load this person">
          <span className="flex flex-wrap items-center gap-3">
            {detail.error}
            <Button size="xs" onClick={detail.reload}>
              Retry
            </Button>
          </span>
        </Notice>
      ) : (
        <div className="space-y-5">
          {/* --- Who, and over what window --------------------------- */}
          <div className="flex items-start gap-3">
            <span
              className={
                "grid size-12 shrink-0 place-items-center rounded-full text-[15px] font-bold " +
                (d.person.kind === "user"
                  ? "bg-brand-soft text-brand"
                  : "bg-surface-strong text-body")
              }
              aria-hidden="true"
            >
              {initials(d.person.name)}
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[15px] font-semibold text-ink">{d.person.name}</p>
              <p className="m-0 text-[12px] text-subtle">
                {d.person.subtitle}
                {d.person.code ? " · " + d.person.code : ""}
              </p>
              <p className="m-0 mt-0.5 text-[11.5px] text-subtle">
                {d.filters.date_from === d.filters.date_to
                  ? prettyDate(d.filters.date_from)
                  : prettyDate(d.filters.date_from) + " – " + prettyDate(d.filters.date_to)}
                {d.filters.company ? " · " + d.filters.company : ""}
              </p>
              {row.role_labels.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {row.role_labels.map((label) => (
                    <Badge tone="info" key={label}>
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* --- Totals ---------------------------------------------- */}
          <StatRow className="grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
            <Stat
              label="Payments collected"
              value={money(d.kpis.received_total)}
              hint={
                d.kpis.received_count + " receipt" + (d.kpis.received_count === 1 ? "" : "s")
              }
            />
            <Stat
              label="Total deposits"
              value={money(d.kpis.deposit_total)}
              hint={d.kpis.deposit_count + " deposit" + (d.kpis.deposit_count === 1 ? "" : "s")}
              tone="ok"
            />
            <Stat label="Against invoice" value={money(d.kpis.against_invoice)} />
            <Stat label="Advance" value={money(d.kpis.advance_payment)} />
          </StatRow>

          {/* --- Charts ---------------------------------------------- */}
          {(d.charts.received.total > 0 || d.charts.methods.total > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {d.charts.received.total > 0 && (
                <div className="space-y-2">
                  <SectionHeading>Invoice vs advance</SectionHeading>
                  <Suspense fallback={<Skeleton className="size-[150px] rounded-full" />}>
                    <DonutChart
                      slices={d.charts.received.slices}
                      total={d.charts.received.total}
                      centerLabel="Collected"
                    />
                  </Suspense>
                </div>
              )}
              {d.charts.methods.total > 0 && (
                <div className="space-y-2">
                  <SectionHeading>Payment method breakdown</SectionHeading>
                  <Suspense fallback={<Skeleton className="size-[150px] rounded-full" />}>
                    <DonutChart
                      slices={d.charts.methods.slices}
                      total={d.charts.methods.total}
                      centerLabel="Collected"
                    />
                  </Suspense>
                </div>
              )}
            </div>
          )}

          {/* --- Collection timeline --------------------------------- */}
          {d.timeline.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionHeading>Collection timeline</SectionHeading>
                <span className="flex items-center gap-3 text-[11.5px] text-subtle">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
                    Collected
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
                    Banked
                  </span>
                </span>
              </div>
              <Timeline points={d.timeline} />
            </div>
          )}

          {/* --- Recent activity ------------------------------------- */}
          <div className="space-y-2">
            <SectionHeading>Recent activity</SectionHeading>
            {d.recent_activity.length === 0 ? (
              <p className="m-0 rounded-sm border border-line bg-surface px-3 py-4 text-center text-[12px] text-subtle">
                Nothing recorded in this period.
              </p>
            ) : (
              <ul className="m-0 list-none divide-y divide-line rounded-sm border border-line p-0">
                {d.recent_activity.map((event) => (
                  <li
                    key={event.kind + "-" + event.id}
                    className="flex items-center gap-2.5 px-3 py-2"
                  >
                    <span
                      className={
                        "size-2 shrink-0 rounded-full " +
                        (event.kind === "RECEIPT" ? "bg-brand" : "bg-ok")
                      }
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-semibold text-ink">
                        {event.reference}
                      </span>
                      <span className="truncate text-[11.5px] text-subtle">{event.party}</span>
                    </span>
                    <span className="flex shrink-0 flex-col text-right">
                      <span className="text-[13px] font-bold tabular-nums text-ink">
                        {money(event.amount)}
                      </span>
                      <span className="text-[11px] text-subtle">
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
