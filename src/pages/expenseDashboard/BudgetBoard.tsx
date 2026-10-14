/**
 * The Budget board — one page in JI's wall-board style (ji.jivo.in, its Plant
 * Control board): every main budget head's SAP spending this month against
 * what it spent in August (the yardstick, decided 2026-10-14), Oil, Beverages
 * and Mart together.
 *
 * TWO COLUMNS, 90:10. Left, JI's rows, each on its own tinted panel with a
 * rail naming it — Sales with Oil · Raju, Mart · Prabhjot and Beverages ·
 * Shunty beside it; Factory with its Oil and Beverages plants; Back Office,
 * Freight (delivery) and Bank Interest. Right, the smaller heads — Salary,
 * Freight, Bank Interest, Rent, Electricity: their total, a pie of them, and
 * a line each that opens its breakdown (`ROWS`, `SIDE`).
 *
 * A CARD, as JI's: its name and a pill (how far into August's total, or the
 * state in words), one line of context, the figure, a segmented bar — spent
 * (company by company on a split head), then what is left of August, pale —
 * and a short legend. Amber when ahead of August's pace for the day, red past
 * August's total, always with the word.
 *
 * JI'S COLOUR RULE: colour belongs to the head — its rail, its cards' wash and
 * bars — never to its rank; a split head's companies wear tints of its hue.
 *
 * Clicking a card opens its head — no charts (user, 2026-10-14): a card per
 * company, then a row per SAP budget › sub budget that opens onto its G/L
 * accounts as cards, each opening onto its largest postings this month.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
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

/**
 * Each head's hue: the dataviz reference palette's cool slots and three more,
 * validated as a set (all hard checks pass; every cell carries its name, the
 * relief the two warnings ask for). None is amber or red, which the meters
 * keep for "ahead of pace" and "over August".
 */
const HEAD_HUE: Record<string, string> = {
  SALES: "#6250d6",
  SALARY: "#1baf7a",
  FREIGHT: "#2a78d6",
  FINANCE: "#e87ba4",
  // The rows that are those costs' own budgets wear their hues.
  DELIVERY: "#2a78d6",
  INTEREST: "#e87ba4",
  FACTORY: "#008300",
  // Violet (2026-10-14): in the side pie, beside Rent and Salary, the teal it
  // had failed the colour-blind check; this passes every pair round the circle.
  ELECTRICITY: "#7e57c2",
  BACKOFFICE: "#9b4dca",
  RENT: "#7a8c1a",
};

const hueOf = (key: string) => HEAD_HUE[key] ?? "#a2968c";

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

/**
 * Heads shown company by company, beside their total (user, 2026-10-14):
 * Sales by company, each with its owner; Factory by its two plants.
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

/** One card's numbers: a head, or one company's part of it. */
interface CardData {
  id: string;
  /** The head a click opens. */
  headKey: string;
  /** Whose hue the card wears: its head's. */
  hue: string;
  title: string;
  /** Whose it is, where someone owns it (Sales: Raju for Oil). */
  owner?: string;
  /** A company's card: its breakdown opens on that company alone. */
  company?: string;
  base: number;
  current: number;
  ratio: number | null;
}

interface SectionData {
  key: string;
  label: string;
  hue: string;
  cards: CardData[];
}

function headCard(head: BudgetHead): CardData {
  return {
    id: head.key,
    headKey: head.key,
    hue: hueOf(head.key),
    title: head.name,
    base: head.base,
    current: head.current,
    ratio: head.ratio,
  };
}

function partCards(head: BudgetHead): CardData[] {
  return (SPLITS[head.key] ?? []).map(({ company, label }) => {
    const row = head.by_company.find((c) => c.company === company);
    const owner = head.owners.find((o) => o.company === company);
    const base = row?.base ?? 0;
    const current = row?.current ?? 0;
    return {
      id: `${head.key}-${company}`,
      headKey: head.key,
      hue: hueOf(head.key),
      title: label,
      owner: owner?.name,
      company,
      base,
      current,
      ratio: base ? current / base : null,
    };
  });
}

/**
 * The board, in two columns, 90:10 (user, 2026-10-14). Left: the rows — every
 * posting counted by its SAP budget, so together they are the whole: Sales with
 * its companies, Factory with its plants, and Back Office in three: Back
 * Office, Freight (delivery), Bank Interest. Right: the total, and a pie of the
 * five costs that cut across those rows (salary, freight, interest, rent,
 * electricity) — a slice opens its breakdown.
 */
const ROWS: ReadonlyArray<{ key: string; label: string; heads: readonly string[] }> = [
  { key: "SALES", label: "Sales", heads: ["SALES"] },
  { key: "FACTORY", label: "Factory", heads: ["FACTORY"] },
  { key: "BACKOFFICE", label: "Back Office", heads: ["BACKOFFICE", "DELIVERY", "INTEREST"] },
];

/** The rows on the left, each in its given order. */
function rowsOf(data: BoardData): SectionData[] {
  const byKey = new Map(shownHeads(data).map((h) => [h.key, h] as const));
  const cardsOf = (head: BudgetHead) => [headCard(head), ...partCards(head)];
  return ROWS.map((row) => ({
    key: row.key,
    label: row.label,
    hue: hueOf(row.heads[0]),
    cards: row.heads.flatMap((key) =>
      byKey.has(key) ? cardsOf(byKey.get(key) as BudgetHead) : [],
    ),
  })).filter((row) => row.cards.length > 0);
}

/** The side's first square: the whole budget, this month against August. */
function SideTotal({ total, pace }: { total: BoardData["total"]; pace: number }) {
  const state = stateOf(total.ratio, pace);
  return (
    <div className="bgb-side-card bgb-side-total" data-state={state}>
      <span className="bgb-side-title">Total Budget</span>
      <span className="bgb-card-figure">
        <b className="bgb-side-value">{compactINR(total.current)}</b>
        <em>spent</em>
      </span>
      <span className="bgb-of">Total {compactINR(total.base)}</span>
      <span className="bgb-measure">
        <Meter ratio={total.ratio} state={state} label="The whole budget against August" />
        <b className="bgb-pct">{percent(total.ratio)}</b>
      </span>
    </div>
  );
}

const RADIAN = Math.PI / 180;

/**
 * A slice's label, inside it: the cost's name, and its share in bold — read
 * without hovering (user, 2026-10-14). Dark ink with a white outline, so it
 * reads on every slice's hue; a small slice's sits nearer the rim, where the
 * slice is widest. One under 2% is left to the tooltip.
 */
function sliceLabel({ cx, cy, midAngle, outerRadius, percent, name }: PieLabelRenderProps) {
  if (!percent || percent < 0.02) return null;
  const angle = -(Number(midAngle) || 0) * RADIAN;
  const r = Number(outerRadius) * (percent < 0.12 ? 0.78 : 0.58);
  const x = Number(cx) + r * Math.cos(angle);
  const y = Number(cy) + r * Math.sin(angle);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      className="bgb-pie-label"
      data-small={percent < 0.12 || undefined}
    >
      <tspan x={x} dy="-0.55em">
        {name}
      </tspan>
      <tspan x={x} dy="1.2em" className="bgb-pie-pct">
        {Math.round(percent * 100)}%
      </tspan>
    </text>
  );
}

/**
 * The side's second square: a pie of this month's spending on the five costs,
 * each slice in its cost's hue (validated round the circle in this order),
 * named with its share inside it, filling its card. Hovering gives the rupees; clicking opens
 * its breakdown.
 */
function SidePie({ costs, onOpen }: { costs: BudgetHead[]; onOpen: (open: Opening) => void }) {
  // Short names inside the slices: a long one ran over its neighbours.
  const short: Record<string, string> = { FINANCE: "Interest" };
  // Largest first, clockwise from twelve o'clock.
  const slices = costs
    .map((c) => ({
      key: c.key,
      name: short[c.key] ?? c.name,
      value: Math.max(c.current, 0),
      fill: hueOf(c.key),
    }))
    .sort((a, b) => b.value - a.value);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <div
      className="bgb-side-card bgb-side-pie"
      role="img"
      aria-label={`This month's ${slices.map((s) => `${s.name} ${compactINR(s.value)}`).join(", ")}`}
    >
      <span className="bgb-side-title">Top 5 spends</span>
      {total > 0 ? (
        <div className="bgb-pie-area">
          <ResponsiveContainer width="100%" height="100%" debounce={150}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={0}
                outerRadius="98%"
                startAngle={90}
                endAngle={-270}
                label={sliceLabel}
                labelLine={false}
                stroke="#fff"
                strokeWidth={2}
                isAnimationActive={false}
                onClick={(_slice, index) => onOpen({ key: slices[index].key })}
              >
                {slices.map((s) => (
                  <Cell key={s.key} fill={s.fill} cursor="pointer" />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [fullINR(Number(value) || 0), String(name)]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <span className="bgb-side-empty">Nothing spent yet this month</span>
      )}
    </div>
  );
}

/** The pill at a card's top right: the percentage spent — amber ahead of pace, red with ▲ past the total. */
function Badge({ ratio, state }: { ratio: number | null; state: State }) {
  return (
    <span className="bgb-badge" data-state={state === "ok" ? undefined : state}>
      {state === "over" ? "▲ " : ""}
      {percent(ratio)}
    </span>
  );
}

/**
 * The bar, in JI's segmented style: what is spent, then what is left of the
 * total, pale. Past the total, the part beyond it in red.
 */
function Bar({ card, state }: { card: CardData; state: State }) {
  const basis = Math.max(card.base, card.current, 1);
  const segments: Array<{ key: string; size: number; tone: string }> = [];
  const within = card.base > 0 ? Math.min(card.current, card.base) : card.current;
  if (within > 0)
    segments.push({
      key: "spent",
      size: within / basis,
      tone: state === "ahead" ? "ahead" : "spent",
    });
  if (card.base > 0 && card.current > card.base) {
    segments.push({ key: "over", size: (card.current - card.base) / basis, tone: "over" });
  }
  if (card.base > card.current)
    segments.push({ key: "left", size: (card.base - card.current) / basis, tone: "left" });
  return (
    <span className="bgb-bar" role="img" aria-label={`${percent(card.ratio)} of the total`}>
      {segments.map((s) => (
        <i key={s.key} data-tone={s.tone} style={{ flexGrow: s.size }} />
      ))}
    </span>
  );
}

/** Under the bar: the total — the figure above it is what is spent. */
function Legend({ card }: { card: CardData }) {
  return (
    <span className="bgb-legend-row">
      <span>
        Total <b>{compactINR(card.base)}</b>
      </span>
    </span>
  );
}

/** What a click opens: a head, or one company's part of it. */
type Opening = { key: string; company?: string };

const Card = memo(function Card({
  card,
  pace,
  onOpen,
  ownerLine = false,
}: {
  card: CardData;
  pace: number;
  onOpen: (open: Opening) => void;
  /** Keep the owner's line even without an owner, so the row's figures and bars line up. */
  ownerLine?: boolean;
}) {
  const state = stateOf(card.ratio, pace);
  const name =
    card.id === card.headKey
      ? card.title
      : `${card.headKey === "SALES" ? "Sales" : "Factory"}, ${card.title}`;
  return (
    <button
      type="button"
      className="bgb-card"
      data-state={state}
      style={{ "--accent": card.hue } as CSSProperties}
      onClick={() => onOpen({ key: card.headKey, company: card.company })}
      aria-label={`${name}: ${compactINR(card.current)} this month, ${percent(card.ratio)} of ${compactINR(card.base)} in August. Open the breakdown.`}
    >
      <span className="bgb-card-top">
        <b className="bgb-card-title">{card.title}</b>
        <Badge ratio={card.ratio} state={state} />
      </span>
      {/* The owner, large and bold on a line of its own under the title: the
          name a reader looks for first (user, 2026-10-14). */}
      {card.owner ? (
        <b className="bgb-owner">{card.owner}</b>
      ) : ownerLine ? (
        <b className="bgb-owner" aria-hidden="true">
          &nbsp;
        </b>
      ) : null}
      <span className="bgb-card-figure">
        <b>{compactINR(card.current)}</b>
        <em>spent</em>
      </span>
      <Bar card={card} state={state} />
      <Legend card={card} />
    </button>
  );
});

function Section({
  section,
  pace,
  onOpen,
}: {
  section: SectionData;
  pace: number;
  onOpen: (open: Opening) => void;
}) {
  return (
    <section
      className="bgb-row"
      aria-label={section.label}
      style={{ "--accent": section.hue, "--cards": section.cards.length } as CSSProperties}
    >
      <div className="bgb-rail" aria-hidden="true">
        <span>{section.label}</span>
      </div>
      <div className="bgb-cards">
        {section.cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            pace={pace}
            onOpen={onOpen}
            ownerLine={section.cards.some((c) => c.owner)}
          />
        ))}
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
function CompanyCards({ head, pace }: { head: BudgetHead; pace: number }) {
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
        return (
          <div key={c.company} className="bgb-company" data-state={state}>
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
          </div>
        );
      })}
    </div>
  );
}

/** One collapsible row's line: its name, August, this month, and the share of August. */
function RowLine({
  name,
  base,
  current,
  entries,
}: {
  name: string;
  base: number;
  current: number;
  entries: number;
}) {
  const over = base > 0 && current > base;
  return (
    <summary className="bgb-tree-line">
      <span className="bgb-tree-name">
        {name}
        {entries ? (
          <em>
            {entries.toLocaleString("en-IN")} {entries === 1 ? "entry" : "entries"}
          </em>
        ) : null}
      </span>
      <span className="bgb-tree-base">{compactINR(base)}</span>
      <b className="bgb-tree-now">{compactINR(current)}</b>
      <span className="bgb-tree-pct" data-state={over ? "over" : undefined}>
        {base ? percent(current / base) : current ? "new" : "—"}
      </span>
    </summary>
  );
}

type AccountData = BudgetHead["tree"][number]["accounts"][number];

/** A posting: date · company · what it was · amount. */
function Postings({ postings }: { postings: AccountData["postings"] }) {
  return (
    <ul className="bgb-postings">
      {postings.map((p, k) => (
        <li key={k}>
          <span className="bgb-posting-date">{shortDate(p.date)}</span>
          <span className="bgb-posting-co">{COMPANY_LABEL[p.company] ?? p.company}</span>
          <span className="bgb-posting-text" title={p.remarks}>
            {p.remarks || `Entry ${p.doc_num ?? ""}`}
          </span>
          <b>{fullINR(p.amount)}</b>
        </li>
      ))}
    </ul>
  );
}

/**
 * A G/L account under an open budget, as a card: this month, August, the bar.
 * With postings this month it opens — taking the whole width — to list them;
 * without, it is just the card.
 */
function AccountCard({ account, pace }: { account: AccountData; pace: number }) {
  const ratio = account.base ? account.current / account.base : null;
  const state = stateOf(ratio, pace);
  const face = (
    <>
      <span className="bgb-account-top">
        <b className="bgb-account-name" title={account.name}>
          {account.name}
        </b>
        {account.entries ? (
          <em>
            {account.entries.toLocaleString("en-IN")} {account.entries === 1 ? "entry" : "entries"}
          </em>
        ) : null}
      </span>
      <span className="bgb-figure">
        <b className="bgb-account-value">{compactINR(account.current)}</b>
        <span className="bgb-of">Total {compactINR(account.base)}</span>
      </span>
      <span className="bgb-measure">
        <Meter ratio={ratio} state={state} label={`${account.name} against August`} />
        <b className="bgb-pct">{account.base ? percent(ratio) : account.current ? "new" : "—"}</b>
      </span>
    </>
  );
  if (!account.postings.length) {
    return (
      <div className="bgb-account" data-state={state}>
        <span className="bgb-account-face">{face}</span>
      </div>
    );
  }
  return (
    <details className="bgb-account" data-state={state}>
      <summary className="bgb-account-face">{face}</summary>
      <Postings postings={account.postings} />
    </details>
  );
}

/**
 * What a head is made of: each SAP budget › sub budget as a row that opens
 * onto its G/L accounts, as cards; an account card opens onto its largest
 * postings this month. The biggest budget starts open.
 */
function Breakdown({ tree, pace }: { tree: BudgetHead["tree"]; pace: number }) {
  if (!tree.length) return <p className="bgb-empty">Nothing posted here in either month.</p>;
  return (
    <div className="bgb-tree" role="list">
      <div className="bgb-tree-head" aria-hidden="true">
        <span>SAP budget › sub budget</span>
        <span>Total</span>
        <span>Spent</span>
        <span />
      </div>
      {tree.map((budget, i) => (
        <details key={budget.name} className="bgb-tree-budget" role="listitem" open={i === 0}>
          <RowLine {...budget} />
          <div className="bgb-account-cards">
            {budget.accounts.map((account) => (
              <AccountCard key={account.name} account={account} pace={pace} />
            ))}
          </div>
        </details>
      ))}
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
}: {
  head: BudgetHead;
  company?: string;
  data: BoardData;
  onClose: () => void;
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
              <CompanyCards head={head} pace={data.current.pace} />
            </section>
          )}
          <section className="bgb-section bgb-section--wide">
            <h3>Where it went</h3>
            <Breakdown tree={view.tree} pace={data.current.pace} />
          </section>
        </div>
      </div>
    </div>,
    document.fullscreenElement ?? document.body,
  );
}

/* ── The board ───────────────────────────────────────────────────────────── */

/** The time on the wall, to the minute. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="bgb-clock">
      <b>{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</b>
      <span>
        {now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
      </span>
    </div>
  );
}

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

/** Other only when it is worth a cell: at least 1% of the yardstick month. */
function shownHeads(data: BoardData): BudgetHead[] {
  return data.heads.filter(
    (h) => h.key !== "OTHER" || Math.abs(h.base) >= Math.abs(data.total.base) * 0.01,
  );
}

export function BudgetBoard({ viewSwitch }: { viewSwitch: ReactNode }) {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);
  const [open, setOpen] = useState<Opening | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, supported, toggle } = useFullscreen(boardRef);

  const board = useQuery({
    queryKey: ["budget-board", month],
    queryFn: () => advancePaymentService.budgetBoard(month),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: 10 * 60_000,
  });
  const data = board.data;
  const live = board.isError ? "down" : board.isFetching ? "busy" : "live";
  const rows = data ? rowsOf(data) : [];
  const opened =
    data && open ? [...data.heads, ...data.costs].find((h) => h.key === open.key) : undefined;

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
            {data
              ? `${data.current.label}${data.current.pace < 1 ? ` · day ${data.current.elapsed} of ${data.current.days}` : ""}`
              : ""}
          </span>
        </div>
        <div className="exb-filters">
          {viewSwitch}
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
        <Clock />
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
      ) : (
        <div className="bgb-body">
          <div
            className="bgb-rows"
            // The rows share the screen, the first a little taller.
            style={{
              gridTemplateRows: ["1.15fr", ...rows.slice(1).map(() => "1fr")]
                .map((fr) => `minmax(0, ${fr})`)
                .join(" "),
            }}
          >
            {rows.map((section) => (
              <Section
                key={section.key}
                section={section}
                pace={data.current.pace}
                onOpen={setOpen}
              />
            ))}
          </div>
          <aside className="bgb-side" aria-label="Total and costs">
            <SideTotal total={data.total} pace={data.current.pace} />
            <SidePie costs={data.costs} onOpen={setOpen} />
          </aside>
        </div>
      )}

      {opened && data && open ? (
        <Detail head={opened} company={open.company} data={data} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
