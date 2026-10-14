/**
 * Payments & Expenses, in two views switched in the top bar (remembered per
 * browser):
 *
 *   Budgets            one page, bento (`expenseDashboard/BudgetBoard`): each
 *                      main budget head's SAP spending this month against
 *                      August's, sized by August's spend; a cell opens its
 *                      breakdown. The default (2026-10-14).
 *   Payment requests   what OMS has IN HAND: the payment requests raised and
 *                      paid in the period, what is pending now — where, with
 *                      whom, for how long — what it is for, and the Expense
 *                      requests. A JI wall board: one slide at a time, moving
 *                      on by itself (space holds, ← → step, 1–5 jump, F
 *                      fullscreen).
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";

import {
  advancePaymentError,
  advancePaymentService,
  type OmsDashboard,
} from "../services/advancePaymentService";
import { useFullscreen } from "./controlPanel/useFullscreen";

import "./expenseDashboard/expenseDashboard.css";
import {
  Change,
  KindDonut,
  Kpi,
  OldestPending,
  OmsRequests,
  RaisedPaidChart,
  Ranked,
  Tile,
} from "./expenseDashboard/board";
import { BudgetBoard } from "./expenseDashboard/BudgetBoard";
import { CarouselStrip } from "./expenseDashboard/CarouselStrip";
import { compactINR, periodLabel, presetRange, type PeriodPreset } from "./expenseDashboard/format";
import { useBoardRotation, useIdleChrome } from "./expenseDashboard/rotation";

type View = "budgets" | "requests";

const VIEW_KEY = "payments-expenses-board-view";

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "requests" ? "requests" : "budgets";
  } catch {
    return "budgets";
  }
}

/** The two views, as chips in either view's top bar. */
function ViewSwitch({ view, onChange }: { view: View; onChange: (next: View) => void }) {
  return (
    <div className="exb-chips exb-source" role="group" aria-label="View">
      <button type="button" className="exb-chip" aria-pressed={view === "budgets"} onClick={() => onChange("budgets")}>
        Budgets
      </button>
      <button type="button" className="exb-chip" aria-pressed={view === "requests"} onClick={() => onChange("requests")}>
        Payment requests
      </button>
    </div>
  );
}

const PRESETS: ReadonlyArray<{ value: PeriodPreset; label: string }> = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3", label: "3 months" },
  { value: "fy", label: "This FY" },
];

/** The payment-request slides, in the order the board is read: the summary first, then what it is made of. */
const SLIDES = [
  { key: "oms-overview", label: "Overview" },
  { key: "oms-pipeline", label: "Pipeline" },
  { key: "oms-breakdown", label: "Breakdown" },
  { key: "oms-purposes", label: "Purposes & budgets" },
  { key: "oms-expenses", label: "Expenses" },
] as const;

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

  if (slide === "oms-purposes") {
    return (
      <div className="exb-slide exb-row exb-row--1-1">
        <Tile title="By payment purpose" hint="Raised this period · requests and amount">
          <Ranked items={data.by_purpose} color="var(--series-1)" extra={(i) => `${i.entries}`} empty="Nothing raised." />
        </Tile>
        <Tile title="By budget head" hint="Raised this period · requests and amount">
          <Ranked items={data.by_budget} color="var(--series-3)" extra={(i) => `${i.entries}`} empty="Nothing raised." />
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

function RequestsBoard({ viewSwitch }: { viewSwitch: ReactNode }) {
  const [preset, setPreset] = useState<PeriodPreset>("this-month");
  const [range, setRange] = useState(() => presetRange("this-month"));
  const [company, setCompany] = useState("");
  const omsQuery = { from: range.from, to: range.to, company };
  const oms = useQuery({
    queryKey: ["oms-dashboard", omsQuery],
    queryFn: () => advancePaymentService.omsDashboard(omsQuery),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const active = oms;
  const slides = SLIDES;

  const boardRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, supported, toggle } = useFullscreen(boardRef);
  const rotation = useBoardRotation(slides.length);
  const rowRef = useRef<HTMLDivElement>(null);
  const { visible } = useIdleChrome(rowRef);
  const now = useClock();

  const { next, previous, togglePaused, goTo } = rotation;

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
  const period = active.data ? active.data.period : range;

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
            {`OMS payment requests, ${company ? company : "all companies"}`}
          </span>
        </div>
        <div className="exb-filters">
          {viewSwitch}
          <div className="exb-chips" role="group" aria-label="Period">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className="exb-chip"
                aria-pressed={preset === p.value}
                onClick={() => {
                  setPreset(p.value);
                  setRange(presetRange(p.value));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
            <label>
              <span className="exb-sr">Company</span>
              <select className="exb-select" aria-label="Company" value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="">All companies</option>
                <option value="OIL">Oil</option>
                <option value="BEVERAGES">Beverages</option>
                <option value="MART">Mart</option>
              </select>
            </label>
        </div>
        <div className="exb-total">
              <b>{oms.data ? compactINR(oms.data.kpis.paid.amount) : "—"}</b>
              <span>{oms.data ? `paid · ${compactINR(oms.data.kpis.pending.amount)} pending` : "fetching"}</span>
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
          <b>The payment requests could not be read</b>
          <p>{advancePaymentError(active.error)}</p>
          <button type="button" onClick={() => void active.refetch()}>
            Try again
          </button>
        </div>
      ) : !active.data ? (
        <div className="exb-state" role="status">
          <b>Reading OMS's payment requests…</b>
          <p>A moment.</p>
        </div>
      ) : (
        // Keyed on the slide: a new slide mounts fresh rather than reconciling into the last.
        <div className="exb-stage" key={slide.key} role="tabpanel" aria-label={slide.label}>
          <OmsSlide slide={slide.key} data={oms.data as OmsDashboard} />
        </div>
      )}
    </div>
  );
}

export default function Payments_Expenses() {
  const [view, setViewState] = useState<View>(readView);
  const setView = (next: View) => {
    setViewState(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* the choice is simply not remembered */
    }
  };
  const viewSwitch = <ViewSwitch view={view} onChange={setView} />;
  return view === "budgets" ? <BudgetBoard viewSwitch={viewSwitch} /> : <RequestsBoard viewSwitch={viewSwitch} />;
}
