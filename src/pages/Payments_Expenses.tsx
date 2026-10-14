/**
 * Payments & Expenses — a JI wall board (ji.jivo.in's boards and its board
 * carousel, brought into OMS) with two sources, switched in its top bar:
 *
 *   SAP  what the company actually SPENT: SAP's expense postings (the same
 *        source as Control Panel's Expenses page, so the two agree), compared
 *        with the period before, over twelve months, by category, budget head,
 *        G/L account, branch and variety down to the largest entries. Salaries
 *        are left out by default, as on Control Panel.
 *   OMS  what OMS has IN HAND: the payment requests raised and paid in the
 *        period, what is pending now — where, with whom, for how long — what
 *        it is for (bill or advance, type, company, payee), and the Expense
 *        requests.
 *
 * THE CAROUSEL. One slide at a time, moving on by itself (45s each by default):
 * a progress line on the top edge that never fades, a strip of named dots, a
 * countdown and the controls, floating over the header only while the pointer
 * is at the top. Keys: space holds and releases, ← → step, 1–4 jump, F
 * fullscreen. Switching the source starts its slides from the first.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import {
  advancePaymentError,
  advancePaymentService,
  type ExpenseDashboard,
  type ExpenseDashboardQuery,
  type OmsDashboard,
} from "../services/advancePaymentService";
import { useFullscreen } from "./controlPanel/useFullscreen";

import "./expenseDashboard/expenseDashboard.css";
import {
  CategoryDonut,
  Change,
  Entries,
  HeadBreakdown,
  KindDonut,
  Kpi,
  OldestPending,
  OmsRequests,
  RaisedPaidChart,
  Ranked,
  Tile,
  TrendChart,
} from "./expenseDashboard/board";
import { CarouselStrip } from "./expenseDashboard/CarouselStrip";
import { DIRECT, INDIRECT, compactINR, periodLabel, presetRange, type PeriodPreset } from "./expenseDashboard/format";
import { useBoardRotation, useIdleChrome } from "./expenseDashboard/rotation";

type Source = "sap" | "oms";

const SOURCE_KEY = "payments-expenses-board-source";

function readSource(): Source {
  try {
    return window.localStorage.getItem(SOURCE_KEY) === "oms" ? "oms" : "sap";
  } catch {
    return "sap";
  }
}

const PRESETS: ReadonlyArray<{ value: PeriodPreset; label: string }> = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3", label: "3 months" },
  { value: "fy", label: "This FY" },
];

/** Each source's slides, in the order the board is read: the summary first, then what it is made of. */
const SLIDES = {
  sap: [
    { key: "sap-overview", label: "Overview" },
    { key: "sap-heads", label: "Budget heads" },
    { key: "sap-accounts", label: "Accounts & entries" },
    { key: "sap-mix", label: "Branches & varieties" },
  ],
  oms: [
    { key: "oms-overview", label: "Overview" },
    { key: "oms-pipeline", label: "Pipeline" },
    { key: "oms-breakdown", label: "Breakdown" },
    { key: "oms-expenses", label: "Expenses" },
  ],
} as const;

/* ── SAP: what was spent ────────────────────────────────────────────────── */

/**
 * One slide, memoised: the countdown re-renders the page every second, and
 * without this every chart redrew with it — the flicker. A slide redraws only
 * when its data, its slide or the hold changes.
 */
const SapSlide = memo(function SapSlide({ slide, data, onReading }: { slide: string; data: ExpenseDashboard; onReading: () => void }) {
  const k = data.kpis;
  const directShare = k.total ? Math.round((k.direct / k.total) * 100) : 0;

  if (slide === "sap-overview") {
    return (
      <div className="exb-slide exb-slide--overview">
        <div className="exb-row exb-row--kpis">
          <Kpi
            label="Total spend"
            value={compactINR(k.total)}
            accent="#06b6d4"
            sub={
              <>
                <Change change={k.change} /> vs {compactINR(k.previous)} the period before
              </>
            }
          />
          <Kpi
            label="Direct · Indirect"
            value={`${directShare}% · ${100 - directShare}%`}
            accent="#8b5cf6"
            sub={`${compactINR(k.direct)} direct · ${compactINR(k.indirect)} indirect`}
          >
            <div className="exb-kpi-split" aria-hidden="true">
              <span style={{ width: `${directShare}%`, background: DIRECT }} />
              <span style={{ flex: 1, background: INDIRECT }} />
            </div>
          </Kpi>
          <Kpi
            label="Top budget head"
            value={k.top_head ? compactINR(k.top_head.amount) : "—"}
            accent="#3b82f6"
            sub={k.top_head ? `${k.top_head.name} · ${k.top_head.share}% of spend` : "No spend"}
          />
          <Kpi
            label="Per day"
            value={compactINR(k.per_day)}
            accent="#10b981"
            sub={`${k.entries.toLocaleString("en-IN")} entries · ${data.period.days} days${
              k.salary_included ? "" : ` · salaries ${compactINR(k.salary)} not in`
            }`}
          />
        </div>
        <div className="exb-row exb-row--2-1">
          <Tile title="Monthly trend" hint="Last twelve months · direct and indirect" chart>
            <TrendChart trend={data.trend} />
          </Tile>
          <Tile title="By category" hint="Share of this period" chart>
            <CategoryDonut categories={data.categories} total={k.total} />
          </Tile>
        </div>
      </div>
    );
  }

  if (slide === "sap-heads") {
    return (
      <div className="exb-slide">
        <Tile title="Budget heads" hint="Against the same number of days before · open one for its accounts and entries">
          <HeadBreakdown heads={data.heads} onOpen={onReading} />
        </Tile>
      </div>
    );
  }

  if (slide === "sap-accounts") {
    return (
      <div className="exb-slide exb-row exb-row--1-1">
        <Tile title="Top G/L accounts" hint="Where the money went, by ledger">
          <Ranked items={data.accounts} color="var(--series-2)" />
        </Tile>
        <Tile title="Largest entries" hint="The ten biggest postings">
          <Entries rows={data.largest} />
        </Tile>
      </div>
    );
  }

  return (
    <div className="exb-slide exb-row exb-row--1-1">
      <Tile title="By branch">
        <Ranked items={data.branches} color="var(--series-3)" />
      </Tile>
      <Tile title="By variety">
        <Ranked items={data.varieties} color="var(--series-4)" empty="No variety recorded." />
      </Tile>
    </div>
  );
});

/* ── OMS: what is in hand ───────────────────────────────────────────────── */

const OmsSlide = memo(function OmsSlide({ slide, data }: { slide: string; data: OmsDashboard }) {
  const k = data.kpis;

  if (slide === "oms-overview") {
    return (
      <div className="exb-slide exb-slide--overview">
        <div className="exb-row exb-row--kpis">
          <Kpi
            label="Raised"
            value={compactINR(k.raised.amount)}
            accent="#06b6d4"
            sub={
              <>
                {k.raised.count} requests · <Change change={k.raised.change} /> vs {compactINR(k.raised.previous)}
              </>
            }
          />
          <Kpi
            label="Paid"
            value={compactINR(k.paid.amount)}
            accent="#8b5cf6"
            sub={
              <>
                {k.paid.count} posted to SAP · <Change change={k.paid.change} /> vs {compactINR(k.paid.previous)}
              </>
            }
          />
          <Kpi
            label="Pending now"
            value={compactINR(k.pending.amount)}
            accent="#3b82f6"
            sub={`${k.pending.count} requests${k.pending.returned ? ` · ${k.pending.returned} back with their creator` : ""}`}
          />
          <Kpi
            label="Days to pay"
            value={k.days_to_pay === null ? "—" : k.days_to_pay < 1 ? "< 1 d" : `${k.days_to_pay} d`}
            accent="#10b981"
            sub={`Raised to paid, on average${k.rejected.count ? ` · ${k.rejected.count} rejected (${compactINR(k.rejected.amount)})` : ""}`}
          />
        </div>
        <div className="exb-row exb-row--2-1">
          <Tile title="Raised and paid" hint="Last twelve months" chart>
            <RaisedPaidChart trend={data.trend} />
          </Tile>
          <Tile title="Bill or advance" hint="Raised this period" chart>
            <KindDonut items={data.bill_or_advance} total={k.raised.amount} />
          </Tile>
        </div>
      </div>
    );
  }

  if (slide === "oms-pipeline") {
    const ageing = data.ageing.map((a) => ({ ...a, share: 0 }));
    return (
      <div className="exb-slide exb-row exb-row--1-1">
        <div className="exb-row" style={{ gridTemplateRows: "auto auto minmax(0, 1fr)" }}>
          <Tile title="Waiting at" hint="Pending now, by stage">
            <Ranked items={data.waiting_at} color="var(--series-1)" extra={(i) => `${i.entries}`} empty="Nothing pending." />
          </Tile>
          <Tile title="Waiting on" hint="Whose desk it is on">
            <Ranked items={data.waiting_on} color="var(--series-2)" extra={(i) => `${i.entries}`} empty="Nothing pending." />
          </Tile>
          <Tile title="How long" hint="Since raised">
            <Ranked items={ageing} color="var(--series-3)" extra={(i) => `${i.entries}`} empty="Nothing pending." />
          </Tile>
        </div>
        <Tile title="Waiting longest" hint="The oldest pending requests">
          <OldestPending rows={data.oldest} />
        </Tile>
      </div>
    );
  }

  if (slide === "oms-breakdown") {
    return (
      <div className="exb-slide exb-row exb-row--1-1">
        <div className="exb-row" style={{ gridTemplateRows: "auto minmax(0, 1fr)" }}>
          <Tile title="By type" hint="Raised this period">
            <Ranked items={data.by_type} color="var(--series-1)" extra={(i) => `${i.entries}`} empty="Nothing raised." />
          </Tile>
          <Tile title="By company" hint="Raised this period">
            <Ranked items={data.by_company} color="var(--series-3)" extra={(i) => `${i.entries}`} empty="Nothing raised." />
          </Tile>
        </div>
        <Tile title="Top payees" hint="Raised this period">
          <Ranked items={data.top_payees} color="var(--series-2)" extra={(i) => `${i.entries}`} empty="Nothing raised." />
        </Tile>
      </div>
    );
  }

  return (
    <div className="exb-slide">
      <Tile title="Expense requests" hint="Raised through OMS · by status and where they wait">
        <OmsRequests oms={data.expenses} />
      </Tile>
    </div>
  );
});

/** The time on the wall, to the minute. */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function Payments_Expenses() {
  const [source, setSourceState] = useState<Source>(readSource);
  const [preset, setPreset] = useState<PeriodPreset>("this-month");
  const [query, setQuery] = useState<ExpenseDashboardQuery>({
    ...presetRange("this-month"),
    branch: "",
    kind: "all",
    includeSalary: false,
  });
  const [company, setCompany] = useState("");
  const set = (patch: Partial<ExpenseDashboardQuery>) => setQuery((q) => ({ ...q, ...patch }));

  // A wall screen stays current without anybody pressing anything.
  const sap = useQuery({
    queryKey: ["expense-dashboard", query],
    queryFn: () => advancePaymentService.expenseDashboard(query),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: 10 * 60_000,
    enabled: source === "sap",
  });
  const omsQuery = { from: query.from, to: query.to, company };
  const oms = useQuery({
    queryKey: ["oms-dashboard", omsQuery],
    queryFn: () => advancePaymentService.omsDashboard(omsQuery),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    enabled: source === "oms",
  });
  const active = source === "sap" ? sap : oms;
  const slides = SLIDES[source];

  const boardRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, supported, toggle } = useFullscreen(boardRef);
  const rotation = useBoardRotation(slides.length);
  const rowRef = useRef<HTMLDivElement>(null);
  const { visible } = useIdleChrome(rowRef);
  const now = useClock();

  const { next, previous, togglePaused, goTo, paused } = rotation;
  /** Somebody is reading this slide: hold it, rather than move it from under them. */
  const hold = useCallback(() => {
    if (!paused) togglePaused();
  }, [paused, togglePaused]);

  const setSource = (next: Source) => {
    if (next === source) return;
    setSourceState(next);
    goTo(0);
    try {
      window.localStorage.setItem(SOURCE_KEY, next);
    } catch {
      /* the choice is simply not remembered */
    }
  };

  // Bound on the window: an unattended screen has nothing focused. Typing is left alone.
  // (F and F11 belong to useFullscreen.)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        togglePaused();
      } else if (event.key === "ArrowRight") {
        next();
      } else if (event.key === "ArrowLeft") {
        previous();
      } else if (/^[1-9]$/.test(event.key)) {
        goTo(Number(event.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, togglePaused, goTo]);

  const slide = slides[Math.min(rotation.index, slides.length - 1)];
  const live = active.isError ? "down" : active.isFetching ? "busy" : "live";
  const period = active.data ? active.data.period : { from: query.from, to: query.to };

  return (
    <div ref={boardRef} className="exb" role="region" aria-label="Payments and expenses board">
      <CarouselStrip
        slides={slides}
        index={rotation.index}
        turn={rotation.turn}
        remaining={rotation.remaining}
        paused={rotation.paused}
        dwellSeconds={rotation.dwellSeconds}
        visible={visible}
        rowRef={rowRef}
        isFullscreen={isFullscreen}
        canFullscreen={supported}
        onGoTo={rotation.goTo}
        onPrevious={rotation.previous}
        onNext={rotation.next}
        onTogglePaused={rotation.togglePaused}
        onDwellChange={rotation.setDwellSeconds}
        onToggleFullscreen={toggle}
      />

      <header className="exb-topbar">
        <span className="exb-live" data-state={live}>
          <i />
          {live === "down" ? "OFFLINE" : live === "busy" ? "UPDATING" : "LIVE"}
        </span>
        <div className="exb-title" role="heading" aria-level={1}>
          <b>Payments &amp; Expenses</b>
          <span>
            {periodLabel(period.from, period.to)} ·{" "}
            {source === "sap" ? "SAP actual expenses, Oil company" : `OMS payment requests, ${company ? company : "all companies"}`}
          </span>
        </div>
        <div className="exb-filters">
          {/* The source: what the company spent (SAP), or what OMS has in hand. */}
          <div className="exb-chips exb-source" role="group" aria-label="Source">
            <button type="button" className="exb-chip" aria-pressed={source === "sap"} onClick={() => setSource("sap")}>
              SAP
            </button>
            <button type="button" className="exb-chip" aria-pressed={source === "oms"} onClick={() => setSource("oms")}>
              OMS
            </button>
          </div>
          <div className="exb-chips" role="group" aria-label="Period">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className="exb-chip"
                aria-pressed={preset === p.value}
                onClick={() => {
                  setPreset(p.value);
                  set(presetRange(p.value));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {source === "sap" ? (
            <>
              <label>
                <span className="exb-sr">Branch</span>
                <select className="exb-select" aria-label="Branch" value={query.branch} onChange={(e) => set({ branch: e.target.value })}>
                  <option value="">Both branches</option>
                  <option value="OIL">Oil</option>
                  <option value="BEVERAGES">Beverages</option>
                </select>
              </label>
              <label>
                <span className="exb-sr">Type</span>
                <select
                  className="exb-select"
                  aria-label="Type"
                  value={query.kind}
                  onChange={(e) => set({ kind: e.target.value as ExpenseDashboardQuery["kind"] })}
                >
                  <option value="all">Direct and indirect</option>
                  <option value="direct">Direct</option>
                  <option value="indirect">Indirect</option>
                </select>
              </label>
              <label className="exb-toggle">
                <input type="checkbox" checked={query.includeSalary} onChange={(e) => set({ includeSalary: e.target.checked })} />
                Salaries
              </label>
            </>
          ) : (
            <label>
              <span className="exb-sr">Company</span>
              <select className="exb-select" aria-label="Company" value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="">All companies</option>
                <option value="OIL">Oil</option>
                <option value="BEVERAGES">Beverages</option>
                <option value="MART">Mart</option>
              </select>
            </label>
          )}
        </div>
        <div className="exb-total">
          {source === "sap" ? (
            <>
              <b>{sap.data ? compactINR(sap.data.kpis.total) : "—"}</b>
              <span>{sap.data ? `${compactINR(sap.data.kpis.per_day)} a day` : "fetching"}</span>
            </>
          ) : (
            <>
              <b>{oms.data ? compactINR(oms.data.kpis.paid.amount) : "—"}</b>
              <span>{oms.data ? `paid · ${compactINR(oms.data.kpis.pending.amount)} pending` : "fetching"}</span>
            </>
          )}
        </div>
        <div className="exb-clock">
          <b>{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</b>
          <span>{now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
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
              <path d={isFullscreen ? "M9 3v6H3M15 3v6h6M15 21v-6h6M9 21v-6H3" : "M3 9V3h6M21 9V3h-6M21 15v6h-6M3 15v6h6"} />
            </svg>
          </button>
        ) : null}
      </header>

      {active.isError && !active.data ? (
        <div className="exb-state">
          <b>{source === "sap" ? "The expenses could not be read" : "The payment requests could not be read"}</b>
          <p>{advancePaymentError(active.error)}</p>
          <button type="button" onClick={() => void active.refetch()}>
            Try again
          </button>
        </div>
      ) : !active.data ? (
        <div className="exb-state" role="status">
          <b>{source === "sap" ? "Reading SAP's expenses…" : "Reading OMS's payment requests…"}</b>
          <p>{source === "sap" ? "The first load of a period takes a few seconds." : "A moment."}</p>
        </div>
      ) : (
        // Keyed on the slide: a new slide mounts fresh rather than reconciling into the last.
        <div className="exb-stage" key={slide.key} role="tabpanel" aria-label={slide.label}>
          {source === "sap" ? (
            <SapSlide slide={slide.key} data={sap.data as ExpenseDashboard} onReading={hold} />
          ) : (
            <OmsSlide slide={slide.key} data={oms.data as OmsDashboard} />
          )}
        </div>
      )}
    </div>
  );
}
