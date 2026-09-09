/**
 * The per-role KPI row.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EMOJI ARE GONE
 * ─────────────────────────────────────────────────────────────────────────
 * The cards carried 🗓️ ⚡ 📦 📥 ✅ 🕒 📌 as their icons. Every other surface
 * in the app draws thin outline glyphs at a consistent stroke width, so a
 * dashboard of emoji read as a different product — and they render as
 * different pictures on Windows, macOS and Android, so the same screenshot
 * from two people did not match.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE TONES MEAN SOMETHING NOW
 * ─────────────────────────────────────────────────────────────────────────
 * They were `db-card--teal` / `--blue` / `--dark`, cycled so no two adjacent
 * cards matched. `Stat`'s tones are semantic: `brand` for the money and the
 * headline count, `hold` for work that is waiting on someone, `ok` for work
 * that is finished, `neutral` for a plain fact. A reader who learns that on
 * one screen has learned it for all of them.
 *
 * `kpiConfig` still lives here rather than in `useDashboard` because it names
 * icon COMPONENTS; everything it is built from comes straight off the hook.
 */
import type { ComponentType } from "react";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import {
  HiOutlineArchiveBox,
  HiOutlineBolt,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineCurrencyRupee,
  HiOutlineInboxArrowDown,
  HiOutlinePaperClip,
  HiOutlinePresentationChartLine,
} from "react-icons/hi2";

import { Stat, StatRow, type StatTone } from "@/components/ui/page";
import { fmt, fmtCurrency } from "../format";
import type { DashboardState } from "../useDashboard";
import type { SupportedRole } from "../types";

type KpiCard = {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: StatTone;
  label: string;
  value: string;
  sub: string;
  /** Adds the chevron that opens the sales-breakdown dialog. */
  salesBreakdown?: boolean;
};

export default function KpiRow({ dashboard }: { dashboard: DashboardState }) {
  const {
    role,
    kpi,
    completedRevenue,
    outstandingOrders,
    reviewAcceptedCount,
    completionCount,
    billingPendingCount,
    billingHandledCount,
    totalOrders,
    peakMonth,
    showSalesBreakdown,
    setShowSalesBreakdown,
  } = dashboard;

  const kpiConfig = {
    admin: [
      {
        icon: HiOutlineCurrencyRupee,
        tone: "brand",
        label: "Total Sales",
        value: fmtCurrency(completedRevenue),
        sub: "Completed order sales",
        salesBreakdown: true,
      },
      {
        icon: HiOutlineBolt,
        tone: "neutral",
        label: "This Month",
        value: fmt(kpi?.this_month_orders ?? 0),
        sub: "Monthly order momentum",
      },
      {
        icon: HiOutlineCalendarDays,
        tone: "neutral",
        label: "Today Orders",
        value: fmt(kpi?.today_orders ?? 0),
        sub: "Orders created today",
      },
    ],
    auditor: [
      {
        icon: HiOutlineInboxArrowDown,
        tone: "brand",
        label: "This Month Orders",
        value: fmt(kpi?.this_month_orders ?? 0),
        sub: "Orders assigned for audit review",
      },
      {
        icon: HiOutlineClipboardDocumentList,
        // Waiting on this user, so it is the one card on the row that should
        // catch the eye — that is the whole job of an auditor's dashboard.
        tone: "hold",
        label: "Pending Review",
        value: fmt(outstandingOrders),
        sub: "Orders still awaiting decision",
      },
      {
        icon: HiOutlineCheckCircle,
        tone: "ok",
        label: "Accepted Orders",
        value: fmt(reviewAcceptedCount),
        sub: "Orders accepted by auditor",
      },
    ],
    approver: [
      {
        icon: HiOutlineInboxArrowDown,
        tone: "brand",
        label: "This Month Orders",
        value: fmt(totalOrders),
        sub: "Orders assigned for rate approval",
      },
      {
        icon: HiOutlineClipboardDocumentList,
        tone: "hold",
        label: "Pending Approval",
        value: fmt(outstandingOrders),
        sub: "Orders still awaiting rate decision",
      },
      {
        icon: HiOutlineCheckCircle,
        tone: "ok",
        label: "Approved Orders",
        value: fmt(reviewAcceptedCount),
        sub: "Orders approved by rate approver",
      },
    ],
    manager: [
      {
        icon: HiOutlineCurrencyRupee,
        tone: "brand",
        label: "Total Sales",
        value: fmtCurrency(completedRevenue),
        sub: "Completed order sales",
        salesBreakdown: true,
      },
      {
        icon: HiOutlineArchiveBox,
        tone: "ok",
        // Was "Completed  Orders" — two spaces, since 2024.
        label: "Completed Orders",
        value: fmt(completionCount ?? 0),
        sub: "Across selected year",
      },
      {
        icon: HiOutlineBolt,
        tone: "neutral",
        label: "Today Orders",
        value: fmt(kpi?.today_orders ?? 0),
        sub: "Live operational pace",
      },
    ],
    billing: [
      {
        icon: HiOutlineClock,
        tone: "hold",
        label: "Pending Orders",
        value: fmt(billingPendingCount),
        sub: "Orders waiting in billing queue",
      },
      {
        icon: HiOutlinePaperClip,
        tone: "ok",
        label: "Handled Orders",
        value: fmt(billingHandledCount),
        sub: "Orders sent to auditor or rejected",
      },
      {
        icon: HiOutlineCalendarDays,
        tone: "neutral",
        label: "Today Orders",
        value: fmt(kpi?.today_orders ?? 0),
        sub: "Billing orders updated today",
      },
    ],
  } satisfies Record<SupportedRole, KpiCard[]>;

  return (
    <StatRow>
      {kpiConfig[role].map((item) =>
        "salesBreakdown" in item && item.salesBreakdown ? (
          /*
           * `Stat` takes no children, deliberately — a KPI card is a number and
           * a label, not a container. The one card that needs an affordance
           * gets it from a positioned wrapper instead of widening the
           * primitive's API for a single caller.
           */
          <div key={item.label} className="relative [&>[data-slot=stat]]:h-full">
            <Stat
              icon={item.icon}
              tone={item.tone}
              label={item.label}
              value={item.value}
              hint={item.sub}
            />
            <button
              type="button"
              // The form-control reset — Preflight is not imported. See
              // `ui/button` for why a bare <button> is not neutral here.
              className="absolute right-2 top-2 appearance-none rounded-sm border-0 bg-transparent p-1 text-subtle [font-family:inherit] cursor-pointer hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:shadow-focus"
              onClick={() => setShowSalesBreakdown((current) => !current)}
              aria-label={`${showSalesBreakdown ? "Hide" : "Show"} sales breakdown`}
              aria-expanded={showSalesBreakdown}
            >
              {showSalesBreakdown ? (
                <HiChevronUp aria-hidden="true" className="size-4" />
              ) : (
                <HiChevronDown aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        ) : (
          <Stat
            key={item.label}
            icon={item.icon}
            tone={item.tone}
            label={item.label}
            value={item.value}
            hint={item.sub}
          />
        ),
      )}

      {/*
        The two figures the dark hero used to carry. They are KPIs, so they
        belong on the KPI row — having them in a banner meant the page stated
        its headline numbers twice, at two sizes, in two typefaces.
      */}
      <Stat
        icon={HiOutlinePresentationChartLine}
        tone="neutral"
        label="Total Orders"
        value={fmt(kpi?.total_orders ?? 0)}
        hint="In the selected period"
      />
      <Stat
        icon={HiOutlineCalendarDays}
        tone="neutral"
        label="Peak Month"
        value={peakMonth?.label ?? "N/A"}
        hint="Busiest month of the year"
      />
    </StatRow>
  );
}
