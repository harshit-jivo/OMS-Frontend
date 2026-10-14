/**
 * The Expense board's tiles, drawn in JI's board style (see expenseDashboard.css).
 *
 * Charts follow the dataviz rules: one axis, thin marks with a 2px surface gap,
 * rounded data-ends, colour by entity in a fixed order (never by rank), a legend
 * plus printed values (three light slots sit under 3:1 on white, so their values
 * are always printed beside them), and a tooltip on hover.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { ExpenseDashboard, ExpenseHead, ExpenseRanked, ExpenseRow } from "../../services/advancePaymentService";
import { CATEGORY_SLOTS, DIRECT, INDIRECT, axisINR, changeLabel, compactINR, fullINR } from "./format";

/* ── Tiles ──────────────────────────────────────────────────────────────── */

export function Tile({
  title,
  hint,
  children,
  className,
  chart = false,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Holds a chart: its body never scrolls (see `.exb-tile-body--chart`). */
  chart?: boolean;
}) {
  return (
    <section className={`exb-tile${className ? ` ${className}` : ""}`} aria-label={title}>
      <header className="exb-tile-head">
        <h2>{title}</h2>
        {hint ? <span>{hint}</span> : null}
      </header>
      <div className={chart ? "exb-tile-body exb-tile-body--chart" : "exb-tile-body"}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, accent, children }: { label: string; value: ReactNode; sub?: ReactNode; accent: string; children?: ReactNode }) {
  return (
    <div className="exb-kpi" style={{ "--kpi-accent": accent } as CSSProperties}>
      <span className="exb-kpi-label">{label}</span>
      <span className="exb-kpi-value">{value}</span>
      {children}
      {sub ? <span className="exb-kpi-sub">{sub}</span> : null}
    </div>
  );
}

/** "↗ +60.6%" — an arrow and a figure, never colour alone. */
export function Change({ change }: { change: number | null }) {
  if (change === null) return <span className="exb-change">new</span>;
  const up = change > 0;
  return (
    <span className="exb-change">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {up ? <path d="M4 17 10 11l4 4 6-7M14 8h6v6" /> : <path d="M4 7l6 6 4-4 6 7M14 16h6v-6" />}
      </svg>
      {changeLabel(change)}
      <span className="exb-sr">{up ? "more than" : "less than"} the period before</span>
    </span>
  );
}

/* ── The monthly trend ──────────────────────────────────────────────────── */

type TrendPoint = ExpenseDashboard["trend"][number];

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: TrendPoint }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const line = (color: string, name: string, value: number) => (
    <p style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
      <span className="exb-key" style={{ background: color }} /> {name}
      <b style={{ marginLeft: "auto", paddingLeft: 16 }}>{fullINR(value)}</b>
    </p>
  );
  return (
    <div style={{ background: "#fff", border: "1px solid #eaeef3", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#0e1726", boxShadow: "0 8px 24px rgba(14,23,38,.12)" }}>
      <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{label}</p>
      {line(DIRECT, "Direct", d.direct)}
      {line(INDIRECT, "Indirect", d.indirect)}
      <p style={{ display: "flex", margin: "4px 0 0", paddingTop: 4, borderTop: "1px solid #eaeef3", fontWeight: 700 }}>
        Total <b style={{ marginLeft: "auto", paddingLeft: 16 }}>{fullINR(d.total)}</b>
      </p>
    </div>
  );
}

/* Stable across renders, so the chart has nothing to redraw when the page re-renders. */
const TREND_MARGIN = { top: 6, right: 6, left: 0, bottom: 0 };
const AXIS_TICK = { fill: "var(--viz-axis)", fontSize: 11 };
const TREND_CURSOR = { fill: "var(--viz-grid)", opacity: 0.6 };
const BAR_TOP = [4, 4, 0, 0] as [number, number, number, number];
const formatAxis = (v: number) => axisINR(v);
const TREND_TOOLTIP = <TrendTooltip />;

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", height: "100%", minHeight: 0 }}>
      <ul className="exb-legend" aria-label="Legend">
        <li>
          <span className="exb-key" style={{ background: DIRECT }} /> Direct
        </li>
        <li>
          <span className="exb-key" style={{ background: INDIRECT }} /> Indirect
        </li>
      </ul>
      <div role="img" aria-label="Expenses by month, direct and indirect, last twelve months" style={{ minHeight: 160 }}>
        <ResponsiveContainer width="100%" height="100%" debounce={150}>
          <BarChart data={trend} margin={TREND_MARGIN} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis width={68} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={formatAxis} />
            <Tooltip cursor={TREND_CURSOR} content={TREND_TOOLTIP} />
            {/* No grow-in animation: a refetch or a filter change landing mid-animation
                left the bars stuck at zero height (an empty chart under a full axis), and a
                wall board has no use for the motion anyway. */}
            <Bar dataKey="direct" stackId="spend" fill={DIRECT} stroke="var(--viz-surface)" strokeWidth={2} isAnimationActive={false} />
            <Bar dataKey="indirect" stackId="spend" fill={INDIRECT} stroke="var(--viz-surface)" strokeWidth={2} radius={BAR_TOP} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Categories: a donut and its value table ────────────────────────────── */

export function CategoryDonut({ categories, total }: { categories: ExpenseRanked[]; total: number }) {
  if (!categories.length) return <p className="exb-empty">No expenses in this period.</p>;
  return (
    <div className="exb-donut">
      <div className="exb-donut-chart" role="img" aria-label="Share of spend by category">
        <ResponsiveContainer width="100%" height="100%" debounce={150}>
          <PieChart>
            <Pie
              data={categories}
              dataKey="amount"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1}
              stroke="var(--viz-surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {categories.map((c) => (
                <Cell key={c.name} fill={CATEGORY_SLOTS[c.name] ?? "var(--viz-axis)"} />
              ))}
            </Pie>
            <Tooltip formatter={(v, name) => [fullINR(Number(v) || 0), String(name)]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="exb-donut-centre">
          <span>Total</span>
          <b>{compactINR(total)}</b>
        </div>
      </div>
      <table className="exb-table">
        <tbody>
          {categories.map((c) => (
            <tr key={c.name}>
              <td>
                <span style={{ display: "flex", alignItems: "center", gap: "0.5em", whiteSpace: "nowrap" }}>
                  <span className="exb-key" style={{ background: CATEGORY_SLOTS[c.name] }} />
                  <b>{c.name}</b>
                </span>
              </td>
              <td className="num">
                <b>{compactINR(c.amount)}</b>
              </td>
              <td className="num">{c.share}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Ranked bars ────────────────────────────────────────────────────────── */

export function Ranked({
  items,
  color,
  extra,
  empty = "Nothing in this period.",
}: {
  items: Array<ExpenseRanked & { change?: number | null }>;
  color: string;
  extra?: (item: ExpenseRanked & { change?: number | null }) => ReactNode;
  empty?: string;
}) {
  if (!items.length) return <p className="exb-empty">{empty}</p>;
  const max = Math.max(...items.map((i) => i.amount), 1);
  return (
    <ol className="exb-ranked">
      {items.map((item, index) => (
        <li key={item.name} title={`${item.name}: ${fullINR(item.amount)} · ${item.entries} entries`}>
          <div className="exb-ranked-line">
            <span className="exb-ranked-name">
              <em>{index + 1}</em>
              {item.name}
            </span>
            <span className="exb-ranked-figs">
              {extra ? <small>{extra(item)}</small> : null}
              <b>{compactINR(item.amount)}</b>
            </span>
          </div>
          <div className="exb-track">
            <div className="exb-fill" style={{ width: `${(item.amount / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Entries ────────────────────────────────────────────────────────────── */

export function Entries({ rows }: { rows: ExpenseRow[] }) {
  if (!rows.length) return <p className="exb-empty">Nothing in this period.</p>;
  return (
    <table className="exb-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Account</th>
          <th>Budget · Sub budget</th>
          <th>Branch</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.trans_id}-${i}`}>
            <td style={{ whiteSpace: "nowrap" }}>{r.date ?? "—"}</td>
            <td>
              <b>{r.account}</b>
              {r.remarks ? <small>{r.remarks}</small> : null}
            </td>
            <td>
              {r.budget}
              {r.sub_budget ? <small>{r.sub_budget}</small> : null}
            </td>
            <td>{r.branch}</td>
            <td className="num">
              <b>{fullINR(r.amount)}</b>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Budget heads, expandable ───────────────────────────────────────────── */

const FIRST_ROWS = 10;

function HeadDetail({ head }: { head: ExpenseHead }) {
  const [all, setAll] = useState(false);
  return (
    <div className="exb-head-detail">
      <div className="exb-row exb-row--1-1">
        <div>
          <p className="exb-caption">Accounts</p>
          <Ranked items={head.accounts} color="var(--series-1)" />
        </div>
        <div>
          <p className="exb-caption">Sub budgets</p>
          <Ranked items={head.sub_budgets} color="var(--series-3)" empty="No sub budget recorded." />
        </div>
      </div>
      <div>
        <p className="exb-caption">
          Largest entries{head.entries > head.rows.length ? ` (largest ${head.rows.length} of ${head.entries})` : ""}
        </p>
        <Entries rows={all ? head.rows : head.rows.slice(0, FIRST_ROWS)} />
        {head.rows.length > FIRST_ROWS ? (
          <button type="button" className="exb-more" onClick={() => setAll(!all)}>
            {all ? "Show the first ten" : `Show all ${head.rows.length}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function HeadBreakdown({ heads, onOpen }: { heads: ExpenseHead[]; onOpen?: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!heads.length) return <p className="exb-empty">No expenses in this period.</p>;
  return (
    <ul className="exb-heads">
      {heads.map((h) => {
        const isOpen = open === h.name;
        return (
          <li key={h.name} className="exb-head" data-open={isOpen ? "yes" : "no"}>
            <button
              type="button"
              className="exb-head-btn"
              aria-expanded={isOpen}
              onClick={() => {
                setOpen(isOpen ? null : h.name);
                // Somebody reading a head should not have the slide move under them.
                if (!isOpen) onOpen?.();
              }}
            >
              <span>
                <b>{h.name}</b>
                <small>
                  {h.entries} entries · {h.share}% of spend
                </small>
              </span>
              <span className="exb-head-num">
                Before <b>{compactINR(h.previous)}</b>
              </span>
              <span className="exb-head-num">
                Change <b>{changeLabel(h.change)}</b>
              </span>
              <span className="exb-head-amount">{compactINR(h.amount)}</span>
              <svg className="exb-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {isOpen ? <HeadDetail head={h} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ── OMS's own expense requests ─────────────────────────────────────────── */

const STATUS: Record<string, { label: string; tone: "ok" | "hold" | "bad" | "info" | "neutral" }> = {
  IN_APPROVAL: { label: "In approval", tone: "hold" },
  RETURNED: { label: "Returned", tone: "info" },
  COMPLETED: { label: "Paid", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function OmsRequests({ oms }: { oms: ExpenseDashboard["oms"] }) {
  const statuses = Object.keys(STATUS).filter((s) => oms.by_status[s]);
  if (!statuses.length) return <p className="exb-empty">No expense requests raised in OMS yet.</p>;
  return (
    <div>
      <ul className="exb-statuses">
        {statuses.map((s) => (
          <li key={s} className="exb-status" data-tone={STATUS[s].tone}>
            <span>
              <i /> {STATUS[s].label}
            </span>
            <b>{oms.by_status[s].count}</b>
            <small>{compactINR(oms.by_status[s].amount)}</small>
          </li>
        ))}
      </ul>
      {oms.waiting.length ? (
        <>
          <p className="exb-caption">Waiting at</p>
          <ul className="exb-list" style={{ marginBottom: "calc(0.9 * var(--u))" }}>
            {oms.waiting.map((w) => (
              <li key={w.stage}>
                <span>{w.stage}</span>
                <span>
                  {w.count} · <b>{compactINR(w.amount)}</b>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="exb-caption">Latest</p>
      <ul className="exb-list">
        {oms.latest.map((r) => (
          <li key={r.id}>
            <span style={{ minWidth: 0 }}>
              <b>{r.request_no}</b>
              <small>{[r.payee, r.budget, r.stage].filter(Boolean).join(" · ")}</small>
            </span>
            <span style={{ textAlign: "right", flexShrink: 0 }}>
              <b>{compactINR(r.amount)}</b>
              <small>{STATUS[r.status]?.label ?? r.status}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ══════════ The OMS side: payment requests ══════════ */

type RaisedPaid = { month: string; label: string; raised: number; paid: number };

/** Raised and Paid: the same unit (₹) on one axis, side by side, never stacked (they are not parts of a whole). */
export const RAISED = "var(--series-1)";
export const PAID = "var(--series-2)";
const RAISED_PAID_TOOLTIP = <RaisedPaidTooltip />;

function RaisedPaidTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: RaisedPaid }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const line = (color: string, name: string, value: number) => (
    <p style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
      <span className="exb-key" style={{ background: color }} /> {name}
      <b style={{ marginLeft: "auto", paddingLeft: 16 }}>{fullINR(value)}</b>
    </p>
  );
  return (
    <div style={{ background: "#fff", border: "1px solid #eaeef3", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#0e1726", boxShadow: "0 8px 24px rgba(14,23,38,.12)" }}>
      <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{label}</p>
      {line(RAISED, "Raised", d.raised)}
      {line(PAID, "Paid", d.paid)}
    </div>
  );
}

export function RaisedPaidChart({ trend }: { trend: RaisedPaid[] }) {
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", height: "100%", minHeight: 0 }}>
      <ul className="exb-legend" aria-label="Legend">
        <li>
          <span className="exb-key" style={{ background: RAISED }} /> Raised
        </li>
        <li>
          <span className="exb-key" style={{ background: PAID }} /> Paid
        </li>
      </ul>
      <div role="img" aria-label="Payment requests raised and paid, by month, last twelve months" style={{ minHeight: 160 }}>
        <ResponsiveContainer width="100%" height="100%" debounce={150}>
          <BarChart data={trend} margin={TREND_MARGIN} barCategoryGap="24%" barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis width={68} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={formatAxis} />
            <Tooltip cursor={TREND_CURSOR} content={RAISED_PAID_TOOLTIP} />
            <Bar dataKey="raised" fill={RAISED} radius={BAR_TOP} isAnimationActive={false} />
            <Bar dataKey="paid" fill={PAID} radius={BAR_TOP} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Bill · Advance · Expense · Other: a fixed colour each, whatever the order. */
const KIND_SLOTS: Record<string, string> = {
  Bill: "var(--series-1)",
  Advance: "var(--series-2)",
  Expense: "var(--series-3)",
  Other: "var(--series-4)",
};

export function KindDonut({ items, total }: { items: ExpenseRanked[]; total: number }) {
  if (!items.length) return <p className="exb-empty">Nothing raised in this period.</p>;
  return (
    <div className="exb-donut">
      <div className="exb-donut-chart" role="img" aria-label="Raised this period, bill or advance">
        <ResponsiveContainer width="100%" height="100%" debounce={150}>
          <PieChart>
            <Pie
              data={items}
              dataKey="amount"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1}
              stroke="var(--viz-surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {items.map((c) => (
                <Cell key={c.name} fill={KIND_SLOTS[c.name] ?? "var(--viz-axis)"} />
              ))}
            </Pie>
            <Tooltip formatter={(v, name) => [fullINR(Number(v) || 0), String(name)]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="exb-donut-centre">
          <span>Raised</span>
          <b>{compactINR(total)}</b>
        </div>
      </div>
      <table className="exb-table">
        <tbody>
          {items.map((c) => (
            <tr key={c.name}>
              <td>
                <span style={{ display: "flex", alignItems: "center", gap: "0.5em", whiteSpace: "nowrap" }}>
                  <span className="exb-key" style={{ background: KIND_SLOTS[c.name] ?? "var(--viz-axis)" }} />
                  <b>{c.name}</b>
                </span>
              </td>
              <td className="num">{c.entries}</td>
              <td className="num">
                <b>{compactINR(c.amount)}</b>
              </td>
              <td className="num">{c.share}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OldestPending({
  rows,
}: {
  rows: Array<{ id: number; request_no: string; company: string; payee: string; kind: string; amount: number; stage: string; waiting_on: string; days: number }>;
}) {
  if (!rows.length) return <p className="exb-empty">Nothing pending.</p>;
  return (
    <table className="exb-table">
      <thead>
        <tr>
          <th>Request</th>
          <th>Payee</th>
          <th>Waiting at</th>
          <th className="num">Days</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <b>{r.request_no}</b>
              <small>
                {r.company} · {r.kind}
              </small>
            </td>
            <td>{r.payee || "—"}</td>
            <td>
              {r.stage}
              {r.waiting_on && r.waiting_on !== "—" ? <small>{r.waiting_on}</small> : null}
            </td>
            <td className="num">
              <b>{Math.floor(r.days)}</b>
            </td>
            <td className="num">
              <b>{fullINR(r.amount)}</b>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
