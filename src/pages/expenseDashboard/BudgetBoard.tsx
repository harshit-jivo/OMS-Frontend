/**
 * The Budget board — one screen, nothing to scroll (user, 2026-10-15, after a
 * mockup): every rupee SAP posted this month against what was spent in August
 * (the yardstick, decided 2026-10-14), Oil, Beverages and Mart together.
 *
 * TOP TO BOTTOM
 * 1. The banner: this month's spending, the whole budget, how much of it is
 *    used and how much of the month is gone.
 * 2. Three category cards — Sales (Oil · Raju, Mart · Prabhjot, Beverages ·
 *    Shunty), Factory (its Oil and Beverages plants), Other Heads (Back
 *    Office, Freight (delivery), Bank Interest). Each: its figure, a bar of its
 *    lines' spending against its total, and a line each that opens its
 *    breakdown. Together the three are the whole (`CATEGORIES`).
 * 3. The top 5 spends — the costs that cut across the cards (salary, freight,
 *    interest, rent, electricity) — as a half pie (where it went) and as bars.
 *
 * Numbers only, no explaining sentences (user, 2026-10-15).
 *
 * COLOUR belongs to the head, never its rank; a split head's companies wear
 * tints of its hue. Amber is kept for ahead of August's pace for the day, red
 * for past August's total — always with the figure or ▲ beside it.
 *
 * Clicking opens a head (or one company's part of it) — no charts (user,
 * 2026-10-14): a card per company, then a row per SAP budget › sub budget that
 * opens onto its G/L accounts as cards, each opening onto its largest postings.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  type LabelProps,
  type PieLabelRenderProps,
} from "recharts";

import {
  advancePaymentError,
  advancePaymentService,
  type BudgetBoard as BoardData,
  type BudgetHead,
} from "../../services/advancePaymentService";
import { useFullscreen } from "../controlPanel/useFullscreen";
import { compactINR, fullINR } from "./format";

import "./expenseDashboard.css";
import "./budgetBoard.css";

/** On track · ahead of August's pace for the day · past August's whole month · nothing to measure against. */
type State = "ok" | "ahead" | "over" | "none";

/** How far ahead of the day's share of August counts as "ahead" — not every rupee early. */
const AHEAD_MARGIN = 0.1;

function stateOf(ratio: number | null, pace: number): State {
  if (ratio === null) return "none";
  if (ratio > 1) return "over";
  if (ratio > pace + AHEAD_MARGIN) return "ahead";
  return "ok";
}

const percent = (ratio: number | null) => (ratio === null ? "—" : `${Math.round(ratio * 100)}%`);

const ratioOf = (base: number, current: number) => (base ? current / base : null);

/**
 * Each head's hue: the dataviz reference palette's cool slots and three more,
 * validated as a set (all hard checks pass; Sales, Factory and Back Office
 * pass on their own too, for the half pie). None is amber or red, which the
 * states keep.
 */
const HEAD_HUE: Record<string, string> = {
  SALES: "#6250d6",
  SALARY: "#1baf7a",
  FREIGHT: "#2a78d6",
  FINANCE: "#e87ba4",
  // The heads that are those costs' own budgets wear their hues.
  DELIVERY: "#2a78d6",
  INTEREST: "#e87ba4",
  FACTORY: "#008300",
  // Violet (2026-10-14): the teal it had failed the colour-blind check beside Rent and Salary.
  ELECTRICITY: "#7e57c2",
  BACKOFFICE: "#9b4dca",
  RENT: "#7a8c1a",
};

const hueOf = (key: string) => HEAD_HUE[key] ?? "#93a0ae";

const hueStyle = (key: string) => ({ "--accent": hueOf(key) }) as CSSProperties;

/** The word that goes with the colour. */
function StateWord({ ratio, state }: { ratio: number | null; state: State }) {
  if (state === "over")
    return (
      <span className="bgb-word" data-state="over">
        ▲ {Math.round(((ratio ?? 1) - 1) * 100)}% over
      </span>
    );
  if (state === "ahead")
    return (
      <span className="bgb-word" data-state="ahead">
        Ahead of pace
      </span>
    );
  return null;
}

/** This month against August: the fill to the ratio, capped at full. */
function Meter({ ratio, state, label }: { ratio: number | null; state: State; label: string }) {
  const fill = Math.min(1, Math.max(0, ratio ?? 0)) * 100;
  return (
    <div
      className="bgb-meter"
      data-state={state}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((ratio ?? 0) * 100)}
    >
      <i style={{ width: `${fill}%` }} />
    </div>
  );
}

/** The percentage spent, as a pill: amber ahead of pace, red with ▲ past the total. */
function Pct({ ratio, state }: { ratio: number | null; state: State }) {
  return (
    <span className="bgb-pct-pill" data-state={state === "ok" ? undefined : state}>
      {state === "over" ? "▲ " : ""}
      {percent(ratio)}
    </span>
  );
}

/**
 * Heads shown company by company (user, 2026-10-14): Sales by company, each
 * with its owner; Factory by its two plants. These always have their line; a
 * company outside them gets one only when it has spending, so a card's lines
 * add up to its figure.
 */
const SPLITS: Record<string, ReadonlyArray<{ company: string; label: string }>> = {
  SALES: [
    { company: "OIL", label: "Oil" },
    { company: "MART", label: "Mart" },
    { company: "BEVERAGES", label: "Beverages" },
  ],
  FACTORY: [
    { company: "OIL", label: "Oil" },
    { company: "BEVERAGES", label: "Beverages" },
  ],
};

const COMPANY_LABEL: Record<string, string> = { OIL: "Oil", BEVERAGES: "Beverages", MART: "Mart" };

/** What a click opens: a head, or one company's part of it. */
type Opening = { key: string; company?: string };

/** One line of a category card, and one piece of its bar. */
interface Line {
  id: string;
  open: Opening;
  /** What the line says, and what a screen reader hears first. */
  label: string;
  name: string;
  /** Whose it is, where someone owns it (Sales: Raju for Oil). */
  owner?: string;
  base: number;
  current: number;
  /** Its dot and bar piece: a tint of the head's hue, or a head's own. */
  tone: string;
  hue: string;
}

interface Category {
  key: string;
  label: string;
  hue: string;
  /** A one-head card opens that head; Other Heads, three heads, opens by its lines. */
  open?: Opening;
  base: number;
  current: number;
  lines: Line[];
}

/**
 * The three cards, every posting counted by its SAP budget, so together they
 * are the whole: Sales and Factory by company, and Other Heads (user,
 * 2026-10-15): Back Office, Freight (delivery), Bank Interest and — when it is
 * worth a line — Other.
 */
const CATEGORIES: ReadonlyArray<{ key: string; label: string; heads: readonly string[] }> = [
  { key: "SALES", label: "Sales", heads: ["SALES"] },
  { key: "FACTORY", label: "Factory", heads: ["FACTORY"] },
  {
    key: "BACKOFFICE",
    label: "Other Heads",
    heads: ["BACKOFFICE", "DELIVERY", "INTEREST", "OTHER"],
  },
];

/** A split head's companies: its own first, in order, then any other with spending. */
function companyLines(head: BudgetHead): Line[] {
  const split = SPLITS[head.key] ?? [];
  const others = head.by_company
    .filter((c) => !split.some((s) => s.company === c.company) && (c.base || c.current))
    .map((c) => ({ company: c.company, label: c.label }));
  return [...split, ...others].map(({ company, label }, i) => {
    const row = head.by_company.find((c) => c.company === company);
    return {
      id: `${head.key}-${company}`,
      open: { key: head.key, company },
      label: `${head.name}, ${label}`,
      name: label,
      owner: head.owners.find((o) => o.company === company)?.name,
      base: row?.base ?? 0,
      current: row?.current ?? 0,
      tone: `shade-${Math.min(i, 2)}`,
      hue: hueOf(head.key),
    };
  });
}

function headLine(head: BudgetHead): Line {
  return {
    id: head.key,
    open: { key: head.key },
    label: head.name,
    name: head.name,
    // A whole head's one owner (Back Office: Nirmal Didi), named on its line.
    owner: head.owners.find((o) => !o.company)?.name,
    base: head.base,
    current: head.current,
    tone: "spent",
    hue: hueOf(head.key),
  };
}

function categoriesOf(data: BoardData): Category[] {
  const byKey = new Map(shownHeads(data).map((h) => [h.key, h] as const));
  return CATEGORIES.flatMap((cat) => {
    const heads = cat.heads.flatMap((key) =>
      byKey.has(key) ? [byKey.get(key) as BudgetHead] : [],
    );
    if (!heads.length) return [];
    const single = heads.length === 1 && heads[0].key === cat.key;
    return [
      {
        key: cat.key,
        label: cat.label,
        hue: hueOf(cat.key),
        open: single ? { key: cat.key } : undefined,
        base: heads.reduce((sum, h) => sum + h.base, 0),
        current: heads.reduce((sum, h) => sum + h.current, 0),
        lines: single ? companyLines(heads[0]) : heads.map(headLine),
      },
    ];
  });
}

/** Other only when it is worth a line: at least 1% of the yardstick month. */
function shownHeads(data: BoardData): BudgetHead[] {
  return data.heads.filter(
    (h) => h.key !== "OTHER" || Math.abs(h.base) >= Math.abs(data.total.base) * 0.01,
  );
}

/* ── The banner ──────────────────────────────────────────────────────────── */

function Hero({ data }: { data: BoardData }) {
  const { total, current } = data;
  const state = stateOf(total.ratio, current.pace);
  const left = total.base - total.current;
  return (
    <section className="bgb-hero" aria-label="This month" data-state={state}>
      <div className="bgb-hero-main">
        <span className="bgb-hero-kicker">Spent · {current.label}</span>
        <span className="bgb-hero-figure">
          <b>{compactINR(total.current)}</b>
          <span>of {compactINR(total.base)}</span>
        </span>
        <Meter ratio={total.ratio} state={state} label="The whole budget against August" />
      </div>
      <dl className="bgb-hero-stats">
        <div data-state={state === "ok" ? undefined : state}>
          <dt>Budget used</dt>
          <dd>
            {state === "over" ? "▲ " : ""}
            {percent(total.ratio)}
          </dd>
        </div>
        <div>
          <dt>{left < 0 ? "Over by" : "Left"}</dt>
          <dd>{compactINR(Math.abs(left))}</dd>
        </div>
        <div>
          <dt>Month gone</dt>
          <dd>{percent(current.pace)}</dd>
        </div>
      </dl>
    </section>
  );
}

/* ── A category card ─────────────────────────────────────────────────────── */

/**
 * The card's bar: each line's spending in its tint, then what is left of the
 * total, pale. Past the total there is nothing left to draw: the pill says ▲.
 */
function Stack({ cat }: { cat: Category }) {
  const basis = Math.max(cat.base, cat.current, 1);
  const left = cat.base - cat.current;
  return (
    <span
      className="bgb-stack"
      role="img"
      aria-label={`${percent(ratioOf(cat.base, cat.current))} of the total`}
    >
      {cat.lines
        .filter((line) => line.current > 0)
        .map((line) => (
          <i
            key={line.id}
            data-tone={line.tone}
            style={{ flexGrow: line.current / basis, "--accent": line.hue } as CSSProperties}
          />
        ))}
      {left > 0 ? <i data-tone="left" style={{ flexGrow: left / basis }} /> : null}
    </span>
  );
}

function CategoryCard({
  cat,
  pace,
  onOpen,
}: {
  cat: Category;
  pace: number;
  onOpen: (open: Opening) => void;
}) {
  const ratio = ratioOf(cat.base, cat.current);
  const state = stateOf(ratio, pace);
  const face = (
    <>
      <span className="bgb-cat-top">
        <b className="bgb-cat-title">{cat.label}</b>
        <Pct ratio={ratio} state={state} />
      </span>
      <span className="bgb-cat-figure">
        <b>{compactINR(cat.current)}</b>
        <em>spent</em>
      </span>
      <Stack cat={cat} />
      <span className="bgb-cat-total">
        Total <b>{compactINR(cat.base)}</b>
      </span>
    </>
  );
  return (
    <section
      className="bgb-cat"
      aria-label={cat.label}
      data-state={state}
      style={{ "--accent": cat.hue } as CSSProperties}
    >
      {cat.open ? (
        <button
          type="button"
          className="bgb-cat-face"
          onClick={() => onOpen(cat.open as Opening)}
          aria-label={`${cat.label}: ${compactINR(cat.current)} this month, ${percent(ratio)} of ${compactINR(cat.base)}. Open the breakdown.`}
        >
          {face}
        </button>
      ) : (
        <div className="bgb-cat-face">{face}</div>
      )}
      <ul className="bgb-lines">
        {cat.lines.map((line) => {
          const lineRatio = ratioOf(line.base, line.current);
          const lineState = stateOf(lineRatio, pace);
          return (
            <li key={line.id}>
              <button
                type="button"
                className="bgb-line"
                data-state={lineState}
                style={{ "--accent": line.hue } as CSSProperties}
                onClick={() => onOpen(line.open)}
                aria-label={`${line.label}: ${compactINR(line.current)} this month, ${percent(lineRatio)} of ${compactINR(line.base)}. Open the breakdown.`}
              >
                <i className="bgb-dot" data-tone={line.tone} aria-hidden="true" />
                <span className="bgb-line-name">
                  {line.name}
                  {line.owner ? <b className="bgb-owner">{line.owner}</b> : null}
                </span>
                <b className="bgb-line-value">{compactINR(line.current)}</b>
                <span className="bgb-line-of">/ {compactINR(line.base)}</span>
                <Pct ratio={lineRatio} state={lineState} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── The charts ──────────────────────────────────────────────────────────── */

const RADIAN = Math.PI / 180;

/** Below this share a slice is too thin to hold its label: it goes outside the rim. */
const INSIDE_SHARE = 0.1;

/**
 * The half pie's labels, read without hovering (user, 2026-10-14): dark ink
 * with a white outline, so they read on every hue. A slice of 10% or more has
 * its name and share inside it; a thinner one has them on one line just
 * outside the rim — the smallest sit together at the right end, so each is
 * lifted clear of the one below it. Under 1% is left to the tooltip.
 */
function halfPieLabels(slices: ReadonlyArray<{ name: string; value: number }>) {
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  // Each slice's middle, in degrees: from 180 (left) clockwise to 0 (right).
  let start = 180;
  const mids = slices.map((s) => {
    const sweep = (s.value / total) * 180;
    start -= sweep;
    return start + sweep / 2;
  });
  const outside = (i: number) => {
    const share = slices[i].value / total;
    return share >= 0.01 && share < INSIDE_SHARE;
  };

  return function label({ cx, cy, outerRadius, percent, name }: PieLabelRenderProps) {
    if (!percent || percent < 0.01) return null;
    const share = `${Math.round(percent * 100)}%`;
    const index = slices.findIndex((s) => s.name === name);
    const radius = Number(outerRadius);
    if (!outside(index)) {
      const angle = mids[index] * RADIAN;
      const x = Number(cx) + radius * 0.6 * Math.cos(angle);
      const y = Number(cy) - radius * 0.6 * Math.sin(angle);
      return (
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="bgb-pie-label">
          <tspan x={x} dy="-0.55em">
            {name}
          </tspan>
          <tspan x={x} dy="1.2em" className="bgb-pie-pct">
            {share}
          </tspan>
        </text>
      );
    }
    // From the right end inwards, each outside label at least a line above the last.
    const line = Math.max(14, radius * 0.12);
    const reach = radius + line * 0.5;
    let floor = Number(cy) + line * 0.5;
    let x = 0;
    let y = 0;
    for (let i = slices.length - 1; i >= index; i--) {
      if (!outside(i)) continue;
      const angle = mids[i] * RADIAN;
      floor = Math.min(Number(cy) - reach * Math.sin(angle), floor - line);
      if (i === index) {
        x = Number(cx) + reach * Math.cos(angle);
        y = floor;
      }
    }
    return (
      <text
        x={x}
        y={y}
        textAnchor={x >= Number(cx) ? "start" : "end"}
        dominantBaseline="central"
        className="bgb-pie-label"
        data-outside
      >
        {name} <tspan className="bgb-pie-pct">{share}</tspan>
      </text>
    );
  };
}

/**
 * The top 5 spends — the costs that cut across the cards: salary, freight,
 * interest, rent, electricity — largest first, each in its hue (validated
 * round the circle in this order). Short names, to fit inside a slice or
 * under a bar.
 */
/** A slice of the half pie, or a bar: what it is, its rupees, its hue. */
type Slice = { key: string; name: string; value: number; fill: string };

function spendsOf(costs: BudgetHead[]): Slice[] {
  const short: Record<string, string> = { FINANCE: "Interest" };
  return costs
    .map((c) => ({
      key: c.key,
      name: short[c.key] ?? c.name,
      value: Math.max(c.current, 0),
      fill: hueOf(c.key),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Where this month's money went, as a half pie, largest from the left (user,
 * 2026-10-15): the whole board's top 5 spends, or an owner's accounts. A
 * slice opens its breakdown where `onPick` says how.
 */
function WhereItWent({
  slices,
  onPick,
  empty = "₹0",
}: {
  slices: Slice[];
  onPick?: (key: string) => void;
  /** Said in place of the chart when nothing was spent. */
  empty?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <section className="bgb-chart" aria-label="Where it went">
      <h2 className="bgb-chart-title">Where it went</h2>
      {total > 0 ? (
        <div
          className="bgb-chart-area bgb-half"
          role="img"
          aria-label={`This month's ${slices.map((s) => `${s.name} ${compactINR(s.value)}`).join(", ")}`}
        >
          <div className="bgb-half-box">
            <ResponsiveContainer width="100%" height="100%" debounce={150}>
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  // Left of centre: the thin slices, labelled outside, are on the right.
                  cx="36%"
                  cy="100%"
                  innerRadius={0}
                  // Of half the box's height: the box is 2.6 times as wide as it is
                  // tall, room beside the pie for the thin slices' labels.
                  outerRadius="172%"
                  startAngle={180}
                  endAngle={0}
                  label={halfPieLabels(slices)}
                  labelLine={false}
                  stroke="#fff"
                  strokeWidth={2}
                  isAnimationActive={false}
                  onClick={(_slice, index) => onPick?.(slices[index].key)}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.fill} cursor={onPick ? "pointer" : "default"} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [fullINR(Number(value) || 0), String(name)]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <span className="bgb-chart-empty">{empty}</span>
      )}
    </section>
  );
}

/** A bar's figure, on top of it and on one line (recharts' own wraps to the bar's width). */
function barFigure({ x, y, width, value }: LabelProps) {
  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) - 8}
      textAnchor="middle"
      className="bgb-bar-label"
    >
      {compactINR(Number(value) || 0)}
    </text>
  );
}

/** The top 5 spends as bars, each with its figure on top. A bar opens its breakdown. */
function TopSpends({
  bars,
  onPick,
  title = "Top 5 spends",
  empty = "₹0",
}: {
  bars: Slice[];
  onPick: (key: string) => void;
  title?: string;
  /** Said in place of the chart when nothing was spent. */
  empty?: string;
}) {
  if (!bars.some((b) => b.value > 0)) {
    return (
      <section className="bgb-chart" aria-label={title}>
        <h2 className="bgb-chart-title">{title}</h2>
        <span className="bgb-chart-empty">{empty}</span>
      </section>
    );
  }
  return (
    <section className="bgb-chart" aria-label={title}>
      <h2 className="bgb-chart-title">{title}</h2>
      <div
        className="bgb-chart-area"
        role="img"
        aria-label={`This month's ${bars.map((b) => `${b.name} ${compactINR(b.value)}`).join(", ")}`}
      >
        <ResponsiveContainer width="100%" height="100%" debounce={150}>
          <BarChart
            data={bars}
            margin={{ top: 28, right: 8, bottom: 0, left: 8 }}
            barCategoryGap="22%"
          >
            <XAxis
              dataKey="name"
              axisLine={{ stroke: "var(--hair)" }}
              tickLine={false}
              interval={0}
              tick={{ className: "bgb-bar-tick" }}
            />
            <Tooltip
              cursor={{ fill: "rgba(14, 23, 38, 0.04)" }}
              formatter={(value) => [fullINR(Number(value) || 0), "Spent"]}
            />
            <Bar
              dataKey="value"
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(_bar, index) => onPick(bars[index].key)}
            >
              {bars.map((b) => (
                <Cell key={b.key} fill={b.fill} />
              ))}
              <LabelList dataKey="value" content={barFigure} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ── The breakdown of one head: cards and rows, no charts (user, 2026-10-14) ── */

const shortDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "—";

/** A company's card: this month, August beside it, and how far into August. */
function CompanyCards({
  head,
  pace,
  onPick,
}: {
  head: BudgetHead;
  pace: number;
  /** A company's card opens that company alone (user, 2026-10-16). */
  onPick?: (company: string) => void;
}) {
  if (!head.by_company.length) return null;
  // A split head's companies in the board's order (Sales: Oil, Mart, Beverages).
  const split = SPLITS[head.key] ?? [];
  const place = (company: string) => {
    const i = split.findIndex((s) => s.company === company);
    return i === -1 ? split.length : i;
  };
  const companies = [...head.by_company].sort((x, y) => place(x.company) - place(y.company));
  return (
    <div className="bgb-company-cards">
      {companies.map((c) => {
        const ratio = c.base ? c.current / c.base : null;
        const state = stateOf(ratio, pace);
        const owner = head.owners.find((o) => o.company === c.company);
        const Tag = onPick ? "button" : "div";
        return (
          <Tag
            key={c.company}
            className="bgb-company"
            data-state={state}
            {...(onPick
              ? {
                  type: "button" as const,
                  onClick: () => onPick(c.company),
                  "aria-label": `${c.label}: ${compactINR(c.current)} this month, ${percent(ratio)} of ${compactINR(c.base)}. Open ${c.label} alone.`,
                }
              : {})}
          >
            <span className="bgb-company-name">
              {c.label}
              {owner ? <b className="bgb-owner">{owner.name}</b> : null}
            </span>
            <b className="bgb-company-value">{compactINR(c.current)}</b>
            <span className="bgb-of">Total {compactINR(c.base)}</span>
            <span className="bgb-measure">
              <Meter ratio={ratio} state={state} label={`${c.label} against August`} />
              <b className="bgb-pct">{percent(ratio)}</b>
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

/** "REPAIR AND MAINTENANCE" -> "Repair And Maintenance". */
const titled = (name: string) => name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

type AccountData = BudgetHead["tree"][number]["accounts"][number];

/** An account's largest postings this month, as a table. */
function PostingTable({ postings }: { postings: AccountData["postings"] }) {
  if (!postings.length) return <p className="bgb-empty">No postings this month.</p>;
  return (
    <table className="bgb-postings-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Company</th>
          <th>Document</th>
          <th>Narration</th>
          <th className="bgb-num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {postings.map((p, k) => (
          <tr key={k}>
            <td>{shortDate(p.date)}</td>
            <td>{COMPANY_LABEL[p.company] ?? p.company}</td>
            <td className="bgb-num-plain">{p.doc_num ?? "—"}</td>
            <td className="bgb-narration">{p.remarks || "—"}</td>
            <td className="bgb-num">
              <b>{fullINR(p.amount)}</b>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A budget or an account, as a card: its name, what it spent, a bar, its total
 * — nothing to read past the figures. A click goes a level down.
 */
function FigureCard({
  name,
  base,
  current,
  pace,
  opens,
  onOpen,
}: {
  name: string;
  base: number;
  current: number;
  pace: number;
  /** What a click opens, for a screen reader: "its accounts". */
  opens: string;
  onOpen?: () => void;
}) {
  const ratio = ratioOf(base, current);
  const state = stateOf(ratio, pace);
  const said = `${name}: ${compactINR(current)} this month, ${percent(ratio)} of ${compactINR(base)}.`;
  // Name, amount, a thin bar, one quiet line — no pill, no count (user, 2026-10-16).
  const body = (
    <>
      <b className="bgb-bcard-name">{name}</b>
      <b className="bgb-bcard-value">{compactINR(current)}</b>
      <Meter ratio={ratio} state={state} label={`${name} against its total`} />
      <span className="bgb-bcard-foot">
        <span>of {compactINR(base)}</span>
        <b data-state={state === "ok" ? undefined : state}>
          {state === "over" ? "▲ " : ""}
          {percent(ratio)}
        </b>
      </span>
    </>
  );
  return onOpen ? (
    <button
      type="button"
      className="bgb-bcard"
      data-state={state}
      onClick={onOpen}
      aria-label={`${said} Open ${opens}.`}
    >
      {body}
    </button>
  ) : (
    <div className="bgb-bcard" data-state={state} data-still="true" aria-label={said}>
      {body}
    </div>
  );
}

/**
 * What a head (or a company's part of it, or one budget) is made of, a level
 * at a time (user, 2026-10-16): its budgets as cards; a budget's accounts as
 * cards; an account's largest postings as a table — with a trail back up.
 * `start`: open on that budget's accounts.
 */
function Drill({ tree, pace, start }: { tree: BudgetHead["tree"]; pace: number; start?: string }) {
  const [budgetName, setBudgetName] = useState(start);
  const [accountName, setAccountName] = useState<string>();
  const budget = tree.find((b) => b.name === budgetName);
  const account = budget?.accounts.find((a) => a.name === accountName);
  if (!tree.length) return <p className="bgb-empty">Nothing posted here in either month.</p>;

  const trail: Array<{ label: string; go?: () => void }> = [
    {
      label: "Budgets",
      go: budget
        ? () => {
            setBudgetName(undefined);
            setAccountName(undefined);
          }
        : undefined,
    },
  ];
  if (budget)
    trail.push({ label: budget.name, go: account ? () => setAccountName(undefined) : undefined });
  if (account) trail.push({ label: titled(account.name) });

  return (
    <div className="bgb-drill">
      <nav className="bgb-crumbs" aria-label="Where you are">
        {trail.map((step, i) => (
          <span key={i} className="bgb-crumb">
            {i ? <i aria-hidden="true">›</i> : null}
            {step.go ? (
              <button type="button" onClick={step.go}>
                {step.label}
              </button>
            ) : (
              <b aria-current="page">{step.label}</b>
            )}
          </span>
        ))}
      </nav>
      {account ? (
        <PostingTable postings={account.postings} />
      ) : budget ? (
        budget.accounts.length ? (
          <div className="bgb-bcards">
            {budget.accounts.map((a) => (
              <FigureCard
                key={a.name}
                name={titled(a.name)}
                base={a.base}
                current={a.current}
                pace={pace}
                opens="its postings"
                onOpen={a.postings.length ? () => setAccountName(a.name) : undefined}
              />
            ))}
          </div>
        ) : (
          <p className="bgb-empty">Nothing posted here in either month.</p>
        )
      ) : (
        <div className="bgb-bcards">
          {tree.map((b) => (
            <FigureCard
              key={b.name}
              name={b.name}
              base={b.base}
              current={b.current}
              pace={pace}
              opens="its accounts"
              onOpen={() => setBudgetName(b.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A head's breakdown — or, opened from a company's card, that company's alone:
 * its figures, its owner, and only its budgets, accounts and postings.
 */
function Detail({
  head,
  company,
  data,
  onClose,
  onCompany,
}: {
  head: BudgetHead;
  company?: string;
  data: BoardData;
  onClose: () => void;
  /** Switch to one company's part of the head, or (undefined) back to all of it. */
  onCompany?: (company?: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const part = company ? head.by_company.find((c) => c.company === company) : undefined;
  const label = company ? (COMPANY_LABEL[company] ?? company) : "";
  const owner = company ? head.owners.find((o) => o.company === company) : undefined;
  const view = company
    ? {
        title: `${head.name} · ${label}`,
        base: part?.base ?? 0,
        current: part?.current ?? 0,
        ratio: part?.base ? (part.current ?? 0) / part.base : null,
        entries: part?.entries ?? 0,
        tree: part?.tree ?? [],
      }
    : {
        title: head.name,
        base: head.base,
        current: head.current,
        ratio: head.ratio,
        entries: head.entries,
        tree: head.tree,
      };
  const state = stateOf(view.ratio, data.current.pace);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Above the OMS shell, not inside it: the shell's layout would clip a fixed
  // overlay. Into the fullscreen board when there is one, which alone is drawn then.
  return createPortal(
    <div className="bgb-overlay" onClick={onClose}>
      <div
        className="bgb-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bgb-detail-title"
        style={hueStyle(head.key)}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bgb-detail-head" data-state={state}>
          <div>
            {company && onCompany && head.by_company.length > 1 ? (
              <button type="button" className="bgb-back" onClick={() => onCompany(undefined)}>
                ← All companies
              </button>
            ) : null}
            <h2 id="bgb-detail-title">{view.title}</h2>
            {company ? (
              owner ? (
                <p className="bgb-owners">
                  <b className="bgb-owner">{owner.name}</b>
                </p>
              ) : null
            ) : head.owners.length ? (
              <p className="bgb-owners">
                {head.owners.map((o) => (
                  <span key={o.company}>
                    <b className="bgb-owner">{o.name}</b> <em>{o.label}</em>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          <div className="bgb-figure">
            <b className="bgb-value">{compactINR(view.current)}</b>
            <span className="bgb-of">
              Total {compactINR(view.base)} · {view.entries.toLocaleString("en-IN")} entries
            </span>
          </div>
          <div className="bgb-measure">
            <Meter
              ratio={view.ratio}
              state={state}
              label={`${view.title} against ${data.baseline.label}`}
            />
            <b className="bgb-pct">{percent(view.ratio)}</b>
            <StateWord ratio={view.ratio} state={state} />
          </div>
          <button
            ref={closeRef}
            type="button"
            className="exb-icon-btn bgb-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="bgb-detail-body">
          {company ? null : (
            <section className="bgb-section bgb-section--wide">
              <h3>By company</h3>
              <CompanyCards head={head} pace={data.current.pace} onPick={onCompany} />
            </section>
          )}
          <section className="bgb-section bgb-section--wide">
            <h3>Where it went</h3>
            <Drill key={company ?? "all"} tree={view.tree} pace={data.current.pace} />
          </section>
        </div>
      </div>
    </div>,
    document.fullscreenElement ?? document.body,
  );
}
/* ── An owner's own board ───────────────────────────────────────────────── */

type BudgetData = BudgetHead["tree"][number];

/** The panel an owner's card or budget opens: a title, its figures, and what is below them. */
function OwnerPanel({
  title,
  base,
  current,
  entries,
  hue,
  pace,
  section,
  onClose,
  children,
}: {
  title: string;
  base: number;
  current: number;
  entries: number;
  hue: string;
  pace: number;
  section: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const ratio = ratioOf(base, current);
  const state = stateOf(ratio, pace);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="bgb-overlay" onClick={onClose}>
      <div
        className="bgb-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bgb-owner-panel-title"
        style={{ "--accent": hue } as CSSProperties}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bgb-detail-head" data-state={state}>
          <div>
            <h2 id="bgb-owner-panel-title">{title}</h2>
          </div>
          <div className="bgb-figure">
            <b className="bgb-value">{compactINR(current)}</b>
            <span className="bgb-of">
              of {compactINR(base)} · {entries.toLocaleString("en-IN")} entries
            </span>
          </div>
          <div className="bgb-measure">
            <Meter ratio={ratio} state={state} label={`${title} against its total`} />
            <b className="bgb-pct">{percent(ratio)}</b>
            <StateWord ratio={ratio} state={state} />
          </div>
          <button
            ref={closeRef}
            type="button"
            className="exb-icon-btn bgb-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="bgb-detail-body">
          <section className="bgb-section bgb-section--wide">
            <h3>{section}</h3>
            {children}
          </section>
        </div>
      </div>
    </div>,
    document.fullscreenElement ?? document.body,
  );
}

/** One of an owner's three big cards: a company, or a SAP budget, with its sub budgets. */
interface OwnerGroup {
  key: string;
  label: string;
  hue: string;
  base: number;
  current: number;
  entries: number;
  /** What the panel it opens lists: its budgets (or, of a one-budget card, that budget's accounts). */
  items: BudgetData[];
  /** Its lines, where they differ from `items`: an account's card lists the budgets it is booked under. */
  lines?: BudgetData[];
}

type AccountRow = BudgetData["accounts"][number];

/** An account as a budget-shaped item: a card or a line that opens onto that account alone. */
const asItem = (account: AccountRow, name = account.name): BudgetData => ({
  name,
  base: account.base,
  current: account.current,
  entries: account.entries,
  accounts: [account],
});

/**
 * The owner's three cards' hues: the board's own three, validated together
 * (all checks pass), none amber or red.
 */
const GROUP_HUES = ["#6250d6", "#008300", "#9b4dca"];
/** Lines on an owner's card; the panel it opens has them all. */
const GROUP_LINES = 4;

const sumOf = (items: BudgetData[], pick: (b: BudgetData) => number) =>
  items.reduce((sum, b) => sum + pick(b), 0);

/**
 * An owner's spending in three big cards, as the whole board's (user,
 * 2026-10-16): by company when their head spans three, else by SAP budget
 * (Sales, Med MKT…), else by budget › sub budget; past three, the largest two
 * and "Everything else".
 */
function ownerGroups(head: BudgetHead): OwnerGroup[] {
  const make = (key: string, label: string, items: BudgetData[], lines?: BudgetData[]) => ({
    key,
    label,
    items: [...items].sort((a, b) => b.current - a.current || b.base - a.base),
    lines,
    base: sumOf(items, (b) => b.base),
    current: sumOf(items, (b) => b.current),
    entries: sumOf(items, (b) => b.entries),
  });
  // Three cards on top, always (user, 2026-10-16): the first way of cutting
  // the head that gives at least three — by company, by SAP budget, by budget
  // › sub budget, by G/L account — else the one that gives the most.
  const byBudget = new Map<string, BudgetData[]>();
  for (const item of head.tree) {
    const budget = item.name.split(" › ")[0];
    byBudget.set(budget, [...(byBudget.get(budget) ?? []), item]);
  }
  // An account across the budgets it is booked under: one card, a line per budget.
  const byAccount = new Map<string, { total: AccountRow; parts: BudgetData[] }>();
  for (const budget of head.tree) {
    for (const account of budget.accounts) {
      const seen = byAccount.get(account.name);
      const total = seen
        ? {
            ...seen.total,
            base: seen.total.base + account.base,
            current: seen.total.current + account.current,
            entries: seen.total.entries + account.entries,
            postings: [...seen.total.postings, ...account.postings]
              .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
              .slice(0, 8),
          }
        : account;
      byAccount.set(account.name, {
        total,
        parts: [...(seen?.parts ?? []), asItem(account, budget.name)],
      });
    }
  }
  const cuts = [
    head.by_company.length > 1
      ? head.by_company.map((c) => make(c.company, c.label, c.tree ?? []))
      : [],
    [...byBudget].map(([budget, items]) => make(budget, budget, items)),
    head.tree.map((item) => make(item.name, item.name, [item])),
    [...byAccount.values()].map(({ total, parts }) =>
      make(total.name, titled(total.name), [asItem(total, titled(total.name))], parts),
    ),
  ];
  let groups =
    cuts.find((cut) => cut.length >= 3) ?? cuts.reduce((a, b) => (b.length > a.length ? b : a));
  groups = [...groups].sort((a, b) => b.current - a.current || b.base - a.base);
  if (groups.length > 3) {
    const rest = groups.slice(2).flatMap((g) => g.items);
    groups = [...groups.slice(0, 2), make("REST", "Everything else", rest)];
  }
  return groups.map((g, i) => ({ ...g, hue: GROUP_HUES[i % GROUP_HUES.length] }));
}

/**
 * A card's lines: its own (an account's budgets), else its items — and a
 * one-budget card lists that budget's accounts rather than repeating itself.
 */
function linesOf(group: OwnerGroup): BudgetData[] {
  if (group.lines) return group.lines;
  if (group.items.length === 1 && group.items[0].accounts.length > 0) {
    return group.items[0].accounts.map((a) => asItem(a, titled(a.name)));
  }
  return group.items;
}

/** A group as a card of the whole board's kind. `i`: its place, which its lines and face are keyed by. */
function groupCategory(group: OwnerGroup, i: number): Category {
  return {
    key: group.key,
    label: group.label,
    hue: group.hue,
    open: { key: `group:${i}` },
    base: group.base,
    current: group.current,
    lines: linesOf(group)
      .slice(0, GROUP_LINES)
      .map((item, n) => ({
        id: `${group.key}-${n}`,
        open: { key: `line:${i}:${n}` },
        label: `${group.label}, ${item.name}`,
        name: item.name,
        base: item.base,
        current: item.current,
        tone: `shade-${Math.min(n, 2)}`,
        hue: group.hue,
      })),
  };
}

/** The hues of "where it went" by account: the cost hues, validated round the circle in this order. */
const ACCOUNT_HUES = ["#1baf7a", "#2a78d6", "#e87ba4", "#7e57c2", "#7a8c1a"];
const REST_HUE = "#b4bcc6";

/** Short enough to sit inside a slice or beside it: "SALARY EXPENSE" -> "Salary Expense", cut at 14. */
function shortName(name: string) {
  const full = titled(name);
  return full.length > 14 ? `${full.slice(0, 13)}…` : full;
}

/** What the money was spent on: the G/L accounts across the head, the largest five and the rest. */
function accountSlices(head: BudgetHead): Slice[] {
  const byAccount = new Map<string, number>();
  for (const budget of head.tree) {
    for (const account of budget.accounts) {
      byAccount.set(account.name, (byAccount.get(account.name) ?? 0) + account.current);
    }
  }
  const top = [...byAccount]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const slices: Slice[] = top.map(([name, value], i) => ({
    key: name,
    name: shortName(name),
    value,
    fill: ACCOUNT_HUES[i],
  }));
  const rest = head.current - top.reduce((sum, [, value]) => sum + value, 0);
  if (rest > head.current * 0.005)
    slices.push({ key: "REST", name: "Other", value: rest, fill: REST_HUE });
  return slices;
}

/** Its five largest SAP budgets, as bars in the head's hue. */
function budgetBars(head: BudgetHead): Slice[] {
  return [...head.tree]
    .sort((a, b) => b.current - a.current)
    .slice(0, 5)
    .filter((b) => b.current > 0)
    .map((b) => ({
      key: b.name,
      name: b.name.split(" › ").pop() ?? b.name,
      value: b.current,
      fill: hueOf(head.key),
    }));
}

/** What an owner opened: a card's budgets, or one budget's accounts (`start`). */
type OwnerOpen = {
  title: string;
  base: number;
  current: number;
  entries: number;
  hue: string;
  tree: BudgetData[];
  start?: string;
};

const openBudget = (budget: BudgetData, hue: string, title = budget.name): OwnerOpen => ({
  title,
  base: budget.base,
  current: budget.current,
  entries: budget.entries,
  hue,
  tree: [budget],
  start: budget.name,
});

/**
 * The board an owner sees, laid out as the whole board (user, 2026-10-16):
 * their figures in the banner; three big cards of their spending, each
 * opening onto its budgets and a budget onto its accounts and postings;
 * where it went, by account, as a half pie; and their top 5 budgets as bars.
 * An owner of more than one (Avtar: Bank Interest, Interest & Finance)
 * switches between them. An administrator sees the same under "View as".
 */
function OwnerBoard({ data }: { data: BoardData }) {
  const heads = [...data.heads, ...data.costs];
  const [active, setActive] = useState(0);
  const [opened, setOpened] = useState<OwnerOpen | null>(null);
  const head = heads[Math.min(active, heads.length - 1)];
  if (!head) return null;
  const groups = ownerGroups(head);
  const pace = data.current.pace;
  // A month with nothing booked yet says so, rather than drawing empty charts.
  const nothingYet = `Nothing booked in ${data.current.label} yet`;
  // The banner: the view's total, or the chosen head's when there are several.
  const shown: BoardData =
    heads.length > 1
      ? { ...data, total: { base: head.base, current: head.current, ratio: head.ratio } }
      : data;
  const onOpen = (open: Opening) => {
    const [kind, at, line] = open.key.split(":");
    const group = groups[Number(at)];
    if (!group) return;
    if (kind === "line") {
      setOpened(openBudget(linesOf(group)[Number(line)], group.hue));
    } else if (group.items.length === 1) {
      // One budget (or one account): straight to its accounts.
      setOpened(openBudget(group.items[0], group.hue, group.label));
    } else {
      setOpened({
        title: group.label,
        base: group.base,
        current: group.current,
        entries: group.entries,
        hue: group.hue,
        tree: group.items,
      });
    }
  };
  const byBudget = (key: string) => {
    const budget = head.tree.find((b) => b.name === key);
    if (budget) setOpened(openBudget(budget, hueOf(head.key)));
  };
  return (
    <div className={`bgb-main${heads.length > 1 ? " bgb-main--tabs" : ""}`}>
      <Hero data={shown} />
      {heads.length > 1 ? (
        <div className="exb-chips bgb-owner-tabs" role="group" aria-label="Which">
          {heads.map((h, i) => (
            <button
              key={h.key}
              type="button"
              className="exb-chip"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
            >
              {h.name}
            </button>
          ))}
        </div>
      ) : null}
      {groups.length ? (
        <div className="bgb-cats" style={{ "--cats": groups.length } as CSSProperties}>
          {groups.map((group, i) => (
            <CategoryCard
              key={group.key}
              cat={groupCategory(group, i)}
              pace={pace}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <p className="bgb-empty">Nothing posted this month.</p>
      )}
      <div className="bgb-charts">
        <WhereItWent slices={accountSlices(head)} empty={nothingYet} />
        <TopSpends
          title="Top 5 spends"
          bars={budgetBars(head)}
          onPick={byBudget}
          empty={nothingYet}
        />
      </div>
      {opened ? (
        <OwnerPanel
          title={opened.title}
          base={opened.base}
          current={opened.current}
          entries={opened.entries}
          hue={opened.hue}
          pace={pace}
          section={opened.start ? "Accounts" : "Budgets"}
          onClose={() => setOpened(null)}
        >
          <Drill tree={opened.tree} pace={pace} start={opened.start} />
        </OwnerPanel>
      ) : null}
    </div>
  );
}

/* ── The board ───────────────────────────────────────────────────────────── */

/** This month and the five before it: `[{value: "2026-10", label: "Oct 2026"}]`. */
function recentMonths(today = new Date()): Array<{ value: string; label: string }> {
  return Array.from({ length: 6 }, (_, back) => {
    const d = new Date(today.getFullYear(), today.getMonth() - back, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
    };
  });
}

export function BudgetBoard({ viewSwitch }: { viewSwitch: ReactNode }) {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);
  const [open, setOpen] = useState<Opening | null>(null);
  // An administrator's "View as": an owner's board, as the owner sees it ("" = the whole board).
  const [viewAs, setViewAs] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, supported, toggle } = useFullscreen(boardRef);

  const board = useQuery({
    queryKey: ["budget-board", month, viewAs],
    queryFn: () => advancePaymentService.budgetBoard(month, viewAs),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: 10 * 60_000,
  });
  const data = board.data;
  const live = board.isError ? "down" : board.isFetching ? "busy" : "live";
  const cats = data ? categoriesOf(data) : [];
  const opened =
    data && open ? [...data.heads, ...data.costs].find((h) => h.key === open.key) : undefined;
  const updated = board.dataUpdatedAt
    ? new Date(board.dataUpdatedAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div ref={boardRef} className="exb bgb" role="region" aria-label="Budget heads board">
      <header className="exb-topbar bgb-topbar">
        <span className="exb-live" data-state={live}>
          <i />
          {live === "down" ? "OFFLINE" : live === "busy" ? "UPDATING" : "LIVE"}
        </span>
        <div className="exb-title" role="heading" aria-level={1}>
          <b>Payments &amp; Expenses</b>
          <span>
            {data?.view ? `${data.view.label} · ${data.view.owner}` : "All companies · SAP data"}
            {data
              ? ` · ${data.current.label}${data.current.pace < 1 ? ` · day ${data.current.elapsed} of ${data.current.days}` : ""}`
              : ""}
          </span>
        </div>
        <div className="exb-filters">
          {data?.view && !data.can_switch ? null : viewSwitch}
          {data?.can_switch ? (
            <label className="bgb-view-as">
              <span>View as</span>
              <select
                className="exb-select"
                aria-label="View as"
                value={viewAs}
                onChange={(e) => {
                  setViewAs(e.target.value);
                  setOpen(null);
                }}
              >
                <option value="">Everyone (whole board)</option>
                {(data.views ?? []).map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.owner} — {v.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <span className="exb-sr">Month</span>
            <select
              className="exb-select"
              aria-label="Month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="bgb-updated">
          <span>Last updated</span>
          <b>{updated || "—"}</b>
        </div>
        {supported ? (
          <button
            type="button"
            className="exb-icon-btn"
            onClick={toggle}
            aria-label={isFullscreen ? "Exit fullscreen" : "Show fullscreen"}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Show fullscreen (F)"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d={
                  isFullscreen
                    ? "M9 3v6H3M15 3v6h6M15 21v-6h6M9 21v-6H3"
                    : "M3 9V3h6M21 9V3h-6M21 15v6h-6M3 15v6h6"
                }
              />
            </svg>
          </button>
        ) : null}
      </header>

      {board.isError && !data ? (
        <div className="exb-state">
          <b>The expenses could not be read</b>
          <p>{advancePaymentError(board.error)}</p>
          <button type="button" onClick={() => void board.refetch()}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <div className="exb-state" role="status">
          <b>Reading SAP's expenses…</b>
          <p>Two companies, two months: the first load takes a few seconds.</p>
        </div>
      ) : data.view ? (
        <OwnerBoard key={data.view.key} data={data} />
      ) : (
        <div className="bgb-main">
          <Hero data={data} />
          <div className="bgb-cats">
            {cats.map((cat) => (
              <CategoryCard key={cat.key} cat={cat} pace={data.current.pace} onOpen={setOpen} />
            ))}
          </div>
          <div className="bgb-charts">
            <WhereItWent slices={spendsOf(data.costs)} onPick={(key) => setOpen({ key })} />
            <TopSpends bars={spendsOf(data.costs)} onPick={(key) => setOpen({ key })} />
          </div>
        </div>
      )}

      {opened && data && open ? (
        <Detail
          head={opened}
          company={open.company}
          data={data}
          onClose={() => setOpen(null)}
          onCompany={(company) => setOpen({ key: open.key, company })}
        />
      ) : null}
    </div>
  );
}
