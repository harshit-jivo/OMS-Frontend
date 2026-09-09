import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineArrowRight,
  HiOutlineArrowUturnLeft,
  HiOutlineBanknotes,
  HiOutlineClock,
  HiOutlineEye,
  HiOutlineMapPin,
  HiOutlinePauseCircle,
} from "react-icons/hi2";
import { saveAs } from "file-saver";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { FilterBar, FilterCheckbox, FilterCount, FilterSearch, FilterSpacer } from "@/components/ui/filter-bar";
import { Input, Select } from "@/components/ui/form";
import { Card, EmptyState, Notice, Page, PageHeader } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tab, TabList } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { decisionTone, fmtDT, fmtDate, money } from "@/components/tracker/format";
import InvoiceDetailDialog from "@/components/tracker/InvoiceDetailDialog";
import InvoiceTimelineDialog from "@/components/tracker/InvoiceTimelineDialog";
import PaymentDialog, { type PaymentSubmit } from "@/components/tracker/PaymentDialog";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { cn } from "@/lib/utils";
import trackerService from "../services/trackerService";
import { exportDateStamp } from "../utils/excelExport";
import type {
  QueueStage,
  Invoice,
  JsapStatus,
  Stage,
  StageDecision,
} from "../services/trackerService";

// Omni search: match a query against every meaningful invoice field.
const invMatch = (i: Invoice, q: string) =>
  [
    i.invoice_number,
    i.party_name,
    i.party_code,
    i.party_gstin,
    i.category_name,
    i.unit_name,
    i.branch_name,
    i.mode_name,
    i.current_stage_name,
    i.gst_type_name,
    i.gst_rate_label,
    i.invoice_value,
    i.taxable_value,
    i.return_reason,
    i.returned_from,
  ].some((v) => (v ?? "").toString().toLowerCase().includes(q));

/**
 * One invoice's JSAP verdict. `undefined` means the lookup is still in flight;
 * `null` means it failed. An unavailable status is not an error — it explains
 * why the invoice can't be linked to a JSAP decision, which is exactly what the
 * handler needs to see.
 */
const CELL_NOTE = "mt-0.5 text-[11px] leading-snug text-subtle";

/** The bulk-action strip above the table: selection, inputs, one verb. */
const ACTION_BAR =
  "flex flex-wrap items-center gap-3 rounded-card border border-line bg-card px-4 py-3 shadow-card";
const SELECTED_COUNT = "text-[13px] font-semibold text-ink";
const BAR_NOTE = "text-[12px] text-subtle";

function JsapCell({ status }: { status?: JsapStatus | null }) {
  if (status === undefined) return <span className="text-[12px] text-subtle">checking…</span>;
  if (status === null) return <Badge outlined>unavailable</Badge>;

  if (!status.available) {
    return (
      <>
        <Badge outlined>
          {status.reason === "not_in_jsap"
            ? "Not in JSAP"
            : status.reason === "no_party_code"
              ? "No SAP vendor"
              : status.reason === "no_draft"
                ? "No SAP draft"
                : status.reason === "not_submitted"
                  ? "Not submitted"
                  : status.reason === "rejection_pending"
                    ? "Rejected here"
                    : "Unavailable"}
        </Badge>
        {status.detail && <div className={CELL_NOTE}>{status.detail}</div>}
      </>
    );
  }

  const tone: BadgeTone = status.status === "A" ? "ok" : status.status === "R" ? "bad" : "neutral";
  return (
    <>
      <Badge tone={tone} outlined>
        {status.label}
      </Badge>
      {status.description && <div className={CELL_NOTE}>{status.description}</div>}
      {status.doc_entry != null && <div className={CELL_NOTE}>draft {status.doc_entry}</div>}
    </>
  );
}

/**
 * Sub-tabs backed by the desk's decision log rather than by the live queue.
 * A desk's OK / DEBIT / partial-HOLD invoices have already moved on, so these
 * are read-only histories: tab key -> the `decision` the API filters on.
 */
const DECISION_TABS: Record<string, string> = {
  ok: "OK",
  hold: "HOLD",
  debit: "DEBIT",
  approved: "APPROVED",
  rejected_log: "REJECTED",
  sent_back: "RETURN",
};
/**
 * Send-back tabs. A rejection stops being outstanding once the invoice comes
 * back to the desk, so those rows drop out unless "show resolved" is ticked.
 */
const SENT_BACK_TABS = new Set(["rejected_log", "sent_back"]);
/** Tabs where the amount column means something. */
const AMOUNT_TABS = new Set(["hold", "debit"]);

/** Display names for tabs whose key isn't just a capitalised word. */
const TAB_LABELS: Record<string, string> = {
  ok: "OK",
  rejected: "Awaiting Remarks",
  rejected_log: "Rejected",
  sent_back: "Sent Back",
};
const decMatch = (d: StageDecision, q: string) =>
  [
    d.invoice_number,
    d.party_name,
    d.category_name,
    d.unit_name,
    d.branch_name,
    d.remarks,
    d.acted_by_name,
    d.amount,
    d.current_stage_name,
  ].some((v) => (v ?? "").toString().toLowerCase().includes(q));

// Statuses that mean "send back" / "need a written reason".
const RETURN_STATUSES = new Set(["RETURN", "REJECTED"]);
/** Stage statuses are stored as keys; show them without the underscores. */
const statusLabel = (s: string) => s.replace(/_/g, " ");
const REASON_STATUSES = new Set(["RETURN", "REJECTED", "HOLD", "DEBIT"]);

export default function Tracker_Queue() {
  const queryClient = useQueryClient();
  const [activeStage, setActiveStage] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [remarks, setRemarks] = useState("");
  const [statusPick, setStatusPick] = useState("");
  const [holdType, setHoldType] = useState(""); // FULL | PARTIAL
  const [amount, setAmount] = useState(""); // hold / debit amount
  const [subTab, setSubTab] = useState<
    | "current"
    | "returned"
    | "advanced"
    | "rejected"
    | "partial"
    | "ok"
    | "hold"
    | "debit"
    | "approved"
    | "rejected_log"
    | "sent_back"
  >("current");
  // Send-back tabs: also list rejections the invoice has already come back from.
  const [showResolved, setShowResolved] = useState(false);
  // Hold / Debit tabs are split into what is still on this desk and what has
  // since moved on; the moved-on half is collapsed by default so the desk sees
  // only actionable rows. See `splitRows` below.
  const [showMovedOn, setShowMovedOn] = useState(false);
  const [advancedRows, setAdvancedRows] = useState<Invoice[]>([]);
  // Decision-log rows for the OK / Hold / Debit / verdict tabs.
  const [decisionRows, setDecisionRows] = useState<StageDecision[]>([]);
  const [loadingDecisions, setLoadingDecisions] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  // JSAP desk: per-invoice budget verdict, keyed by invoice id (null = lookup failed).
  const [jsapStatuses, setJsapStatuses] = useState<Record<number, JsapStatus | null>>({});
  const [syncingJsap, setSyncingJsap] = useState(false);

  const [timelineInv, setTimelineInv] = useState<Invoice | null>(null);
  const [detailInv, setDetailInv] = useState<Invoice | null>(null);
  const [payInv, setPayInv] = useState<Invoice | null>(null);
  const [savingPay, setSavingPay] = useState(false);

  const flash = (title: string, message = "") => showToast({ title, message });

  /*
   * Phase 3.1. The old version polled `load()` every 30 seconds from a
   * `useEffect`, unconditionally — including while the tab sat in the
   * background, which for a desk left open all day is 2,880 requests nobody
   * asked for. `refetchIntervalInBackground` is false by default, so this
   * polls only while the queue is actually on screen.
   *
   * It also removes the two-writes-per-response pattern (`setQueue` then
   * `setStageTabs` from one payload), which React batched but which meant the
   * two could be read apart by anything that suspended between them.
   */
  const { data: queueData } = useQuery({
    queryKey: ["tracker", "my-queue"],
    queryFn: () => trackerService.myQueue(),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
  // Memoised, not `queueData?.invoices ?? []` inline: that literal is a new
  // array identity on every render, which would make every `useMemo` below it
  // (stageRows, rejectedRows, partialRows, currentRows, returnedRows) recompute
  // every time — the exact cost those memos exist to avoid.
  const EMPTY_INVOICES = useMemo<Invoice[]>(() => [], []);
  const EMPTY_STAGES = useMemo<QueueStage[]>(() => [], []);
  const queue = queueData?.invoices ?? EMPTY_INVOICES;
  const stageTabs = queueData?.stages ?? EMPTY_STAGES;

  const { data: lookups = null } = useQuery({
    queryKey: ["tracker", "lookups"],
    queryFn: () => trackerService.getLookups(),
    staleTime: 5 * 60_000,
  });

  /*
   * What every action still calls after it writes. It no longer refetches
   * directly: invalidating means the queue AND anything else keyed on it
   * (Tracker_Invoices' list, an alerts count) refresh together, rather than
   * this page refreshing and its neighbours going stale.
   */
  const load = () => queryClient.invalidateQueries({ queryKey: ["tracker", "my-queue"] });

  // Tabs = every stage this user is assigned to (shown even when empty).
  const stagesInQueue = stageTabs;

  useEffect(() => {
    if (!activeStage && stagesInQueue.length) setActiveStage(stagesInQueue[0].code);
  }, [stagesInQueue, activeStage]);

  const stageCfg: Stage | undefined = useMemo(
    () => lookups?.stages.find((s) => s.code === activeStage),
    [lookups, activeStage],
  );

  const isEntry = activeStage === "entry";
  const isSapApproval = activeStage === "sap_approval";
  // Which decision tabs this desk offers — driven by its configured statuses,
  // so a retuned stage picks them up without a code change.
  const decisionChoices = stageCfg?.status_choices ?? [];
  const isDecisionTab = subTab in DECISION_TABS;
  // The JSAP desk mirrors a decision taken in JSAP — nobody approves here, so
  // it gets a read-only status panel and a refresh button instead of the
  // usual status/advance controls.
  const isJsap = activeStage === "jsap_approval";
  const isTerminal = !!stageCfg?.is_terminal;

  // All invoices sitting at the active stage, split by how they arrived / state.
  const stageRows = useMemo(
    () => queue.filter((i) => i.current_stage_code === activeStage),
    [queue, activeStage],
  );
  // Rejected-but-awaiting-remarks (SAP/JSAP) get their own tab.
  const rejectedRows = useMemo(() => stageRows.filter((i) => i.rejection_pending), [stageRows]);
  // Partially-paid invoices (terminal stage) get their own tab and are kept out
  // of "Current" so the to-pay list and the part-paid list don't mix.
  const partialRows = useMemo(
    () => stageRows.filter((i) => i.is_partially_paid && !i.rejection_pending),
    [stageRows],
  );
  const currentRows = useMemo(
    () =>
      stageRows.filter(
        (i) => !i.arrived_via_return && !i.rejection_pending && !i.is_partially_paid,
      ),
    [stageRows],
  );
  const returnedRows = useMemo(
    () => stageRows.filter((i) => i.arrived_via_return && !i.rejection_pending),
    [stageRows],
  );

  // Rows shown for the active sub-tab.
  const baseRows =
    subTab === "advanced"
      ? advancedRows
      : subTab === "returned"
        ? returnedRows
        : subTab === "rejected"
          ? rejectedRows
          : subTab === "partial"
            ? partialRows
            : currentRows;
  // History views are look-only: no checkboxes, no action bar.
  const readOnly = subTab === "advanced" || isDecisionTab;
  // Omni search filters whatever the active sub-tab shows.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? baseRows.filter((i) => invMatch(i, q)) : baseRows;
  }, [baseRows, search]);
  const decRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? decisionRows.filter((d) => decMatch(d, q)) : decisionRows;
  }, [decisionRows, search]);

  /**
   * Hold / Debit split into "still on this desk" vs "has moved on".
   *
   * A DEBIT and a PARTIAL hold both ADVANCE the invoice — only a FULL hold
   * parks it here — so these tabs otherwise list rows for invoices that are
   * now at another stage, which reads as "why is this under Pre-Audit?".
   * Rather than drop that history (it is the only record of what this desk
   * decided, and the amounts), the moved-on rows are kept but collapsed
   * behind a divider, so the default view is only what is actionable here.
   *
   * Every other decision tab (OK, verdicts, send-backs) is a pure log and is
   * left as one flat list.
   */
  const isSplitTab = AMOUNT_TABS.has(subTab);
  const { activeDecRows, movedOnDecRows } = useMemo(() => {
    if (!isSplitTab) return { activeDecRows: decRows, movedOnDecRows: [] as StageDecision[] };
    return {
      activeDecRows: decRows.filter((d) => d.is_still_here),
      movedOnDecRows: decRows.filter((d) => !d.is_still_here),
    };
  }, [decRows, isSplitTab]);

  // Reset sub-tab + selection whenever the stage changes.
  useEffect(() => {
    setSelected(new Set());
    setRemarks("");
    setStatusPick("");
    setHoldType("");
    setAmount("");
    setSubTab("current");
    setShowMovedOn(false);
  }, [activeStage]);

  // Collapse the moved-on half again whenever the sub-tab changes.
  useEffect(() => {
    setShowMovedOn(false);
  }, [subTab]);
  const loadDecisions = async (clear = false) => {
    const decision = DECISION_TABS[subTab];
    if (!decision || !activeStage) return;
    setLoadingDecisions(true);
    if (clear) setDecisionRows([]);
    try {
      setDecisionRows(await trackerService.getStageDecisions(activeStage, decision, showResolved));
    } catch {
      flash("Could not load the decision log");
    } finally {
      setLoadingDecisions(false);
    }
  };

  // Reset selection when the sub-tab changes; lazy-load the history tabs.
  useEffect(() => {
    setSelected(new Set());
    if (!activeStage) return;
    if (subTab === "advanced") {
      trackerService
        .getStageAdvanced(activeStage)
        .then(setAdvancedRows)
        .catch(() => {});
    }
    loadDecisions(true);
  }, [subTab, activeStage, showResolved]);

  // JSAP desk: fetch each parked invoice's budget verdict so the handler can
  // see WHY something is sitting here without opening it one by one.
  useEffect(() => {
    if (!isJsap || !stageRows.length) {
      setJsapStatuses({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        stageRows.map(async (inv) => {
          try {
            return [inv.id, await trackerService.getJsapStatus(inv.id)] as const;
          } catch {
            return [inv.id, null] as const;
          }
        }),
      );
      if (cancelled) return;
      const map: Record<number, JsapStatus | null> = {};
      for (const [id, st] of entries) map[id] = st;
      setJsapStatuses(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [isJsap, stageRows]);

  // Pull the latest decisions from JSAP: approved invoices advance, rejected
  // ones return to SAP Approval with JSAP's own reason.
  const onSyncJsap = async () => {
    setSyncingJsap(true);
    try {
      const res = await trackerService.syncJsap();
      const n = (res.advanced?.length ?? 0) + (res.returned?.length ?? 0);
      flash(
        n === 0 ? "No change from JSAP" : "JSAP decisions applied",
        n === 0
          ? `${res.waiting?.length ?? 0} still awaiting a JSAP decision.`
          : `${res.advanced?.length ?? 0} approved, ${res.returned?.length ?? 0} returned.`,
      );
      void load();
    } catch (err) {
      flash("Could not reach JSAP", messageFrom(err, "The request failed."));
    } finally {
      setSyncingJsap(false);
    }
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      // See Tracker_Entry: a ternary used purely for its side effects.
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const runBulk = async (payload: {
    action?: "ADVANCE" | "RETURN";
    stage_status?: string;
    remarks?: string;
    hold_type?: string;
    amount?: string;
  }) => {
    if (selected.size === 0) {
      flash("Select at least one invoice");
      return;
    }
    try {
      const res = await trackerService.bulkAction({ ids: [...selected], ...payload });
      flash(
        `${res.processed_count} processed`,
        res.errors.length ? `${res.errors.length} failed: ${res.errors[0]?.error}` : "",
      );
      setRemarks("");
      setStatusPick("");
      setHoldType("");
      setAmount("");
      setSelected(new Set());
      void load();
      if (isDecisionTab) loadDecisions(); // the log the action just changed
    } catch (err) {
      flash("Action failed", messageFrom(err, "The server refused the request."));
    }
  };

  // Full holds are the only decision-log rows still sitting at this desk, so
  // they are the only ones that can be released from the Hold tab.
  const heldHere = useMemo(
    () => decRows.filter((d) => d.is_still_here && d.hold_type === "FULL"),
    [decRows],
  );
  const canReleaseHolds = subTab === "hold" && heldHere.length > 0;
  const allHeldSelected = heldHere.length > 0 && heldHere.every((d) => selected.has(d.invoice_id));

  const onAdvance = () => runBulk({ action: "ADVANCE", remarks });
  /** Release the selected full holds: mark them OK and let them move on. */
  const onReleaseHold = (status: string) => {
    if (!selected.size) {
      flash("Select at least one held invoice");
      return;
    }
    runBulk({ stage_status: status, remarks });
  };
  const onReturn = () => {
    if (!remarks.trim()) {
      flash("Remarks are mandatory to return");
      return;
    }
    runBulk({ action: "RETURN", remarks });
  };
  // Rejected tab: supply the reason now and send the rejected invoice(s) back.
  const onReturnRejected = () => {
    if (!remarks.trim()) {
      flash("Enter remarks to return these rejected invoices");
      return;
    }
    runBulk({ stage_status: "REJECTED", remarks });
  };
  const onApplyStatus = () => {
    if (!statusPick) {
      flash("Pick a status");
      return;
    }
    // REJECTED is allowed WITHOUT remarks — it parks the invoice in the Rejected
    // tab; remarks are supplied later to return it. All other reason statuses
    // still require remarks up front.
    if (statusPick !== "REJECTED" && REASON_STATUSES.has(statusPick) && !remarks.trim()) {
      flash("Remarks are mandatory for this status");
      return;
    }
    if (statusPick === "HOLD" && !holdType) {
      flash("Choose a hold type (full or partial)");
      return;
    }
    // Partial-hold amount may be waived for RM-PM; let the server decide, but
    // nudge for a debit amount which is always required.
    if (statusPick === "DEBIT" && !amount.trim()) {
      flash("Enter the debit amount");
      return;
    }
    runBulk({
      stage_status: statusPick,
      remarks,
      ...(statusPick === "HOLD" ? { hold_type: holdType } : {}),
      ...(amount.trim() ? { amount } : {}),
    });
  };

  // Export exactly what the active tab is showing (search filter included), in
  // the same register layout as the All-Invoices export — the server builds it
  // from the same `exports.build_workbook`, so the two sheets match column for
  // column. A decision log can list an invoice twice; the register is one row
  // per invoice, so the ids are de-duplicated server-side.
  const tabLabel = TAB_LABELS[subTab] ?? subTab.charAt(0).toUpperCase() + subTab.slice(1);
  // On a split tab (Hold / Debit) export exactly what is on screen: the rows
  // still on this desk, plus the moved-on half ONLY while it is expanded.
  // Exporting every decision row meant the invoices that had already advanced
  // came down again in every sheet, so each export repeated work the desk had
  // finished — the register is meant to be what is still in hand.
  const visibleDecRows = isSplitTab
    ? [...activeDecRows, ...(showMovedOn ? movedOnDecRows : [])]
    : decRows;
  const exportIds = isDecisionTab
    ? [...new Set(visibleDecRows.map((d) => d.invoice_id))]
    : rows.map((i) => i.id);

  const onExport = async () => {
    if (!exportIds.length) {
      flash("Nothing to export in this tab");
      return;
    }
    setExporting(true);
    try {
      const blob = await trackerService.exportStageTab(activeStage, subTab, exportIds);
      saveAs(blob, `${activeStage}-${subTab}-${exportDateStamp()}.xlsx`);
    } catch {
      flash("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const openTimeline = async (id: number) => {
    try {
      setTimelineInv(await trackerService.getInvoice(id));
    } catch {
      flash("Failed to load timeline");
    }
  };

  const openPayment = async (inv: Invoice) => {
    try {
      // The full record, because the payment form needs the existing payment,
      // the debit and the hold — none of which the queue row carries.
      setPayInv(await trackerService.getInvoice(inv.id));
    } catch {
      flash("Could not load the payment");
    }
  };

  const savePayment = async (payment: PaymentSubmit) => {
    if (!payInv) return;
    setSavingPay(true);
    try {
      await trackerService.updatePayment(payInv.id, {
        discount_pct: payment.discount_pct,
        tds_pct: payment.tds_pct,
        hold_added_back: payment.hold_added_back,
        paid_amount: payment.paid_amount,
      });
      flash(
        payment.isPaid ? "Payment complete" : "Partial payment saved",
        payment.isPaid ? `${payInv.invoice_number} is closed.` : "The balance stays open.",
      );
      setPayInv(null);
      void load();
    } catch (err) {
      flash("Could not save the payment", messageFrom(err, "The server refused the request."));
    } finally {
      setSavingPay(false);
    }
  };

  if (!lookups) {
    return (
      <Page>
        <Card>
          <TableSkeleton rows={6} columns={8} />
        </Card>
      </Page>
    );
  }

  /** The sub-tabs this stage offers, in order, each with its count. */
  const subTabs: { key: typeof subTab; label: string; count?: number }[] = [
    { key: "current", label: "Current", count: currentRows.length },
    { key: "returned", label: "Returned", count: returnedRows.length },
    ...(isTerminal ? [{ key: "partial" as const, label: "Partial", count: partialRows.length }] : []),
    ...(isSapApproval || isJsap || rejectedRows.length > 0
      ? [{ key: "rejected" as const, label: "Awaiting Remarks", count: rejectedRows.length }]
      : []),
    ...(isEntry ? [{ key: "advanced" as const, label: "Advanced" }] : []),
    // Decision log — what this desk decided. OK, DEBIT and partial HOLDs have
    // already advanced, so these read the event history, not the live queue.
    ...(decisionChoices.includes("HOLD") ? [{ key: "hold" as const, label: "Hold" }] : []),
    ...(decisionChoices.includes("OK") ? [{ key: "ok" as const, label: "OK" }] : []),
    ...(decisionChoices.includes("DEBIT") ? [{ key: "debit" as const, label: "Debit" }] : []),
    ...(decisionChoices.includes("APPROVED") ? [{ key: "approved" as const, label: "Approved" }] : []),
    ...(decisionChoices.includes("REJECTED")
      ? [{ key: "rejected_log" as const, label: "Rejected" }]
      : []),
    ...(decisionChoices.includes("RETURN") ? [{ key: "sent_back" as const, label: "Sent Back" }] : []),
  ];

  /** What the decision-log banner explains, per tab. */
  const logBlurb =
    subTab === "hold"
      ? "Every hold recorded at this desk. A full hold keeps the invoice here; a partial hold advances it with the amount withheld."
      : subTab === "debit"
        ? "Every debit recorded at this desk, with the amount debited. Debits accumulate on the invoice."
        : subTab === "approved"
          ? "Every invoice this desk approved and passed on."
          : SENT_BACK_TABS.has(subTab)
            ? `Invoices this desk ${subTab === "rejected_log" ? "rejected" : "sent back"}, with the reason. Once one comes back to this desk it is no longer outstanding and drops off this list.`
            : "Every invoice this desk passed as OK.";

  const decisionColumns = 10 + (canReleaseHolds ? 1 : 0) + (AMOUNT_TABS.has(subTab) ? 1 : 0);
  const queueColumns =
    8 +
    (readOnly ? 0 : 1) +
    (subTab === "returned" ? 2 : 0) +
    (isJsap && subTab !== "advanced" ? 1 : 0);

  /** One decision-log row. Shared by the active and moved-on halves of a
   *  split tab, and by the flat list every other decision tab renders. */
  const renderDecisionRow = (d: StageDecision) => (
    <TableRow key={d.event_id}>
      {canReleaseHolds && (
        <TableCell>
          {d.is_still_here && d.hold_type === "FULL" && (
            <input
              type="checkbox"
              className="size-4 cursor-pointer accent-brand"
              checked={selected.has(d.invoice_id)}
              aria-label={`Select invoice ${d.invoice_number}`}
              onChange={() => toggle(d.invoice_id)}
            />
          )}
        </TableCell>
      )}
      <TableCell className="whitespace-nowrap font-medium text-ink">{d.invoice_number}</TableCell>
      <TableCell>{d.party_name}</TableCell>
      <TableCell className="whitespace-nowrap">{fmtDate(d.invoice_date)}</TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">
        ₹{money(d.net_invoice_value ?? d.invoice_value)}
      </TableCell>
      <TableCell>
        <Badge outlined tone={decisionTone(d.decision)}>
          {d.decision}
          {d.hold_type ? ` · ${d.hold_type}` : ""}
        </Badge>
        {d.awaiting_remarks && <div className={CELL_NOTE}>reason still owed</div>}
        {d.came_back && SENT_BACK_TABS.has(subTab) && (
          <div className={cn(CELL_NOTE, "text-ok")}>came back since</div>
        )}
      </TableCell>
      {AMOUNT_TABS.has(subTab) && (
        <TableCell className="whitespace-nowrap text-right tabular-nums">
          {d.amount ? `₹${money(d.amount)}` : "—"}
          {d.decision === "HOLD" && d.hold_type === "FULL" && (
            <div className={CELL_NOTE}>full value</div>
          )}
        </TableCell>
      )}
      <TableCell className="max-w-[240px] whitespace-normal">{d.remarks || "—"}</TableCell>
      <TableCell>{d.acted_by_name || "—"}</TableCell>
      <TableCell className="whitespace-nowrap">{fmtDT(d.decided_at)}</TableCell>
      <TableCell>
        <Badge outlined tone={d.is_still_here ? "hold" : "info"}>
          {d.invoice_status === "COMPLETED" ? "Completed" : d.current_stage_name}
        </Badge>
        {d.is_still_here && <div className={CELL_NOTE}>still here</div>}
      </TableCell>
    </TableRow>
  );

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Tracker" }, { label: "My Stage Queue" }]} />

      <PageHeader
        title="My Stage Queue"
        description="Invoices waiting at your desk. Act in one click, in bulk."
      />

      {stagesInQueue.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing pending at your desk"
            hint="Invoices appear here when they reach a stage you handle."
          />
        </Card>
      ) : (
        <>
          <TabList label="Your stages">
            {stagesInQueue.map((s) => (
              <Tab
                key={s.code}
                selected={s.code === activeStage}
                onClick={() => setActiveStage(s.code)}
              >
                {s.name}
                {/* `onBrand`, not `info`: the selected tab is `bg-brand`, and
                    an `info` badge is translucent brand-blue with brand-blue
                    text — invisible on it, which hid the count of whichever
                    stage you were actually looking at. */}
                <Badge tone={s.code === activeStage ? "onBrand" : "neutral"}>{s.count}</Badge>
              </Tab>
            ))}
          </TabList>

          <TabList label="Queue views" className="flex-wrap">
            {subTabs.map((t) => (
              <Tab
                key={t.key}
                variant="subtle"
                selected={subTab === t.key}
                onClick={() => setSubTab(t.key)}
              >
                {t.label}
                {t.count !== undefined ? (
                  <Badge tone={subTab === t.key ? "info" : "neutral"}>{t.count}</Badge>
                ) : subTab === t.key ? (
                  <Badge tone="info">{isDecisionTab ? decRows.length : advancedRows.length}</Badge>
                ) : null}
              </Tab>
            ))}
          </TabList>

          <FilterBar>
            <FilterSearch
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Invoice no., party, GSTIN, category…"
              fieldClassName="min-w-[280px]"
            />
            {SENT_BACK_TABS.has(subTab) && (
              <FilterCheckbox
                label="Also show ones that came back"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
              />
            )}
            <FilterSpacer />
            <FilterCount>
              {exportIds.length} in {tabLabel}
            </FilterCount>
            <Button onClick={() => void onExport()} disabled={exporting || !exportIds.length}>
              <HiOutlineArrowDownTray aria-hidden="true" />{" "}
              {exporting ? "Exporting…" : "Export Excel"}
            </Button>
          </FilterBar>

          {/* Rejected tab: supply the reason now to send these back. */}
          {subTab === "rejected" && (
            <div className={ACTION_BAR}>
              <span className={SELECTED_COUNT}>{selected.size} selected</span>
              <Input
                className="min-w-[240px] flex-1"
                placeholder="Rejection remarks (required to return)"
                aria-label="Rejection remarks (required to return)"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
              <Button variant="danger" onClick={onReturnRejected} disabled={selected.size === 0}>
                <HiOutlineArrowUturnLeft aria-hidden="true" /> Return with remarks
              </Button>
              <span className={BAR_NOTE}>
                Rejected without a reason — add remarks to send back to the previous stage.
              </span>
            </div>
          )}

          {/* JSAP desk: pull the decision in from JSAP. The status bar below
              still works, so a handler can also approve/reject by hand — for an
              invoice JSAP never received, or to override what it says. */}
          {!readOnly && subTab !== "rejected" && isJsap && (
            <div className={ACTION_BAR}>
              <Button variant="primary" onClick={() => void onSyncJsap()} disabled={syncingJsap}>
                <HiOutlineArrowPath aria-hidden="true" />{" "}
                {syncingJsap ? "Checking JSAP…" : "Refresh from JSAP"}
              </Button>
              <span className={BAR_NOTE}>
                Approved in JSAP advances automatically; rejected goes back to SAP Approval with
                JSAP&rsquo;s reason. Nothing is sent to JSAP from here — decide manually below
                instead.
              </span>
            </div>
          )}

          {/* Action bar (adapts to the active stage's rules) — hidden in the
              read-only history and rejected tabs. */}
          {!readOnly && subTab !== "rejected" && stageCfg && !stageCfg.is_terminal && (
            <div className={ACTION_BAR}>
              <span className={SELECTED_COUNT}>{selected.size} selected</span>
              {stageCfg.requires_status ? (
                <>
                  <Select
                    className="w-44"
                    value={statusPick}
                    aria-label="Status"
                    onChange={(e) => {
                      setStatusPick(e.target.value);
                      setHoldType("");
                      setAmount("");
                    }}
                  >
                    <option value="">Status…</option>
                    {stageCfg.status_choices.map((st) => (
                      <option key={st} value={st}>
                        {statusLabel(st)}
                      </option>
                    ))}
                  </Select>
                  {statusPick === "HOLD" && (
                    <Select
                      className="w-56"
                      value={holdType}
                      aria-label="Hold type"
                      onChange={(e) => setHoldType(e.target.value)}
                    >
                      <option value="">Hold type…</option>
                      <option value="FULL">Full hold (stays here)</option>
                      <option value="PARTIAL">Partial hold (advances)</option>
                    </Select>
                  )}
                  {(statusPick === "DEBIT" || (statusPick === "HOLD" && holdType === "PARTIAL")) && (
                    <Input
                      type="number"
                      step="0.01"
                      className="w-40"
                      placeholder={statusPick === "DEBIT" ? "Debit amount" : "Hold amount"}
                      aria-label={statusPick === "DEBIT" ? "Debit amount" : "Hold amount"}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  )}
                  <Input
                    className="min-w-[220px] flex-1"
                    placeholder={
                      statusPick === "REJECTED"
                        ? "Remarks (optional — blank parks it in Rejected)"
                        : REASON_STATUSES.has(statusPick)
                          ? "Remarks (required)"
                          : "Remarks (optional)"
                    }
                    aria-label="Remarks"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                  <Button variant="primary" onClick={onApplyStatus} disabled={selected.size === 0}>
                    {statusPick === "REJECTED" ? (
                      <>
                        <HiOutlineArrowUturnLeft aria-hidden="true" />{" "}
                        {remarks.trim() ? "Reject & return" : "Reject"}
                      </>
                    ) : RETURN_STATUSES.has(statusPick) ? (
                      <>
                        <HiOutlineArrowUturnLeft aria-hidden="true" /> Return
                      </>
                    ) : statusPick === "HOLD" && holdType === "FULL" ? (
                      <>
                        <HiOutlinePauseCircle aria-hidden="true" /> Hold
                      </>
                    ) : (
                      <>
                        <HiOutlineArrowRight aria-hidden="true" /> Apply
                      </>
                    )}
                  </Button>
                  {statusPick === "HOLD" && holdType === "PARTIAL" && (
                    <span className={BAR_NOTE}>Amount required (except RM-PM).</span>
                  )}
                </>
              ) : (
                <>
                  <Input
                    className="min-w-[220px] flex-1"
                    placeholder="Remarks (optional for advance)"
                    aria-label="Remarks (optional for advance)"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                  <Button variant="primary" onClick={onAdvance} disabled={selected.size === 0}>
                    <HiOutlineArrowRight aria-hidden="true" /> Advance
                  </Button>
                  {stageCfg.can_return && (
                    <Button variant="danger" onClick={onReturn} disabled={selected.size === 0}>
                      <HiOutlineArrowUturnLeft aria-hidden="true" /> Return
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {!readOnly && stageCfg?.is_terminal && (
            <Notice tone="info">
              Capture payment per invoice using the <strong>Payment</strong> button on each row.
            </Notice>
          )}

          {subTab === "returned" && returnedRows.length > 0 && (
            <Notice tone="hold">
              These invoices were <strong>sent back to your desk</strong> for rework — the reason is
              in each row.
            </Notice>
          )}

          {/* Decision-log banner: these tabs are history, not a worklist. */}
          {isDecisionTab && (
            <Notice tone="info">
              {logBlurb} Read-only log — the invoice may have moved on since.
              {subTab === "hold" && heldHere.length > 0 ? (
                <strong className="ml-1 font-semibold text-hold">
                  {heldHere.length} still held here — tick them below to release.
                </strong>
              ) : null}
            </Notice>
          )}

          {/* Hold tab: release a full hold — it is still parked at this desk,
              so it can be dispositioned straight from the log. */}
          {canReleaseHolds && (
            <div className={ACTION_BAR}>
              <span className={SELECTED_COUNT}>{selected.size} selected</span>
              <Input
                className="min-w-[220px] flex-1"
                placeholder="Remarks (optional)"
                aria-label="Remarks (optional)"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
              <Button variant="primary" onClick={() => onReleaseHold("OK")} disabled={!selected.size}>
                <HiOutlineArrowRight aria-hidden="true" /> Release as OK
                {stageCfg && !stageCfg.is_terminal && " → next stage"}
              </Button>
              <span className={BAR_NOTE}>
                Clears the hold and advances the invoice — the same as dispositioning it from
                Current.
              </span>
            </div>
          )}

          <Card className="overflow-hidden p-0" role="tabpanel">
            <div className="overflow-x-auto">
              {isDecisionTab ? (
                loadingDecisions && decRows.length === 0 ? (
                  <TableSkeleton rows={5} columns={decisionColumns} />
                ) : (
                  <Table density="compact">
                    <TableHeader>
                      <TableRow>
                        {canReleaseHolds && (
                          <TableHead className="w-10">
                            <input
                              type="checkbox"
                              className="size-4 cursor-pointer accent-brand"
                              checked={allHeldSelected}
                              aria-label="Select all held invoices"
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? new Set(heldHere.map((d) => d.invoice_id))
                                    : new Set(),
                                )
                              }
                            />
                          </TableHead>
                        )}
                        <TableHead>Invoice No.</TableHead>
                        <TableHead>Party</TableHead>
                        <TableHead>Inv. date</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Decision</TableHead>
                        {AMOUNT_TABS.has(subTab) && <TableHead className="text-right">Amount</TableHead>}
                        <TableHead>Remarks</TableHead>
                        <TableHead>By</TableHead>
                        <TableHead>Decided</TableHead>
                        <TableHead>Now at</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {decRows.length === 0 ? (
                        <TableEmpty colSpan={decisionColumns}>
                          {SENT_BACK_TABS.has(subTab)
                            ? showResolved
                              ? "This desk has not sent anything back."
                              : "Nothing outstanding — anything sent back has since come back here."
                            : `No ${DECISION_TABS[subTab].toLowerCase()} decisions recorded at this stage.`}
                        </TableEmpty>
                      ) : isSplitTab ? (
                        <>
                          {activeDecRows.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={decisionColumns}
                                className="py-3 text-center text-[12px] text-subtle"
                              >
                                Nothing {DECISION_TABS[subTab].toLowerCase()} is still on this
                                desk — a debit and a partial hold both let the invoice move on.
                              </TableCell>
                            </TableRow>
                          ) : (
                            activeDecRows.map(renderDecisionRow)
                          )}

                          {movedOnDecRows.length > 0 && (
                            <>
                              <TableRow>
                                <TableCell colSpan={decisionColumns} className="bg-surface p-0">
                                  <button
                                    type="button"
                                    aria-expanded={showMovedOn}
                                    onClick={() => setShowMovedOn((v) => !v)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-subtle transition-colors hover:bg-surface-strong"
                                  >
                                    <span
                                      aria-hidden
                                      className={cn(
                                        "inline-block transition-transform duration-150",
                                        showMovedOn && "rotate-90",
                                      )}
                                    >
                                      ▶
                                    </span>
                                    Moved on ({movedOnDecRows.length})
                                    <span className="font-normal">
                                      — decided here, now at a later stage
                                    </span>
                                  </button>
                                </TableCell>
                              </TableRow>
                              {showMovedOn && movedOnDecRows.map(renderDecisionRow)}
                            </>
                          )}
                        </>
                      ) : (
                        decRows.map(renderDecisionRow)
                      )}
                    </TableBody>
                  </Table>
                )
              ) : (
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      {!readOnly && (
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            className="size-4 cursor-pointer accent-brand"
                            checked={allSelected}
                            aria-label="Select all invoices"
                            onChange={(e) =>
                              setSelected(
                                e.target.checked ? new Set(rows.map((r) => r.id)) : new Set(),
                              )
                            }
                          />
                        </TableHead>
                      )}
                      <TableHead>Invoice No.</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Inv. date</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit / branch</TableHead>
                      {subTab === "returned" && (
                        <>
                          <TableHead>Sent back by</TableHead>
                          <TableHead>Reason</TableHead>
                        </>
                      )}
                      {isJsap && subTab !== "advanced" && <TableHead>JSAP status</TableHead>}
                      {subTab === "advanced" ? (
                        <>
                          <TableHead>Now at</TableHead>
                          <TableHead>Advanced on</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead>Days here</TableHead>
                          <TableHead>Entered</TableHead>
                        </>
                      )}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableEmpty colSpan={queueColumns}>
                        {subTab === "returned"
                          ? "No returned invoices at this stage."
                          : subTab === "advanced"
                            ? "Nothing advanced from here yet."
                            : subTab === "rejected"
                              ? "No rejected invoices awaiting remarks."
                              : subTab === "partial"
                                ? "No partially-paid invoices."
                                : "No invoices at this stage."}
                      </TableEmpty>
                    ) : (
                      rows.map((inv) => (
                        <TableRow key={inv.id}>
                          {!readOnly && (
                            <TableCell>
                              <input
                                type="checkbox"
                                className="size-4 cursor-pointer accent-brand"
                                checked={selected.has(inv.id)}
                                aria-label={`Select invoice ${inv.invoice_number}`}
                                onChange={() => toggle(inv.id)}
                              />
                            </TableCell>
                          )}
                          <TableCell className="whitespace-nowrap font-medium text-ink">
                            {inv.invoice_number}
                          </TableCell>
                          <TableCell>{inv.party_name}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {fmtDate(inv.invoice_date)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            ₹{money(inv.net_invoice_value ?? inv.invoice_value)}
                            {Number(inv.debit_amount) > 0 && (
                              <div className={cn(CELL_NOTE, "text-hold")}>
                                −₹{money(inv.debit_amount)} debit
                              </div>
                            )}
                            {inv.is_partially_paid && (
                              <div className={cn(CELL_NOTE, "text-hold")}>
                                bal ₹{money(inv.open_balance || 0)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{inv.category_name}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {inv.unit_name} / {inv.branch_name}
                          </TableCell>
                          {subTab === "returned" && (
                            <>
                              <TableCell className="whitespace-nowrap">
                                {inv.returned_from || "—"}
                                {inv.returned_by ? ` (${inv.returned_by})` : ""}
                              </TableCell>
                              <TableCell className="max-w-[240px] whitespace-normal">
                                <Badge tone="hold" outlined className="whitespace-normal">
                                  {inv.return_reason || "—"}
                                </Badge>
                              </TableCell>
                            </>
                          )}
                          {isJsap && subTab !== "advanced" && (
                            <TableCell className="max-w-[240px] whitespace-normal">
                              <JsapCell status={jsapStatuses[inv.id]} />
                            </TableCell>
                          )}
                          {subTab === "advanced" ? (
                            <>
                              <TableCell>
                                <Badge tone="info" outlined>
                                  {inv.current_stage_name}
                                </Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {fmtDT(inv.advanced_at)}
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell>
                                <Badge outlined tone={inv.is_overdue ? "bad" : "neutral"}>
                                  <HiOutlineClock aria-hidden="true" className="size-3" />{" "}
                                  {inv.days_at_stage}
                                </Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {fmtDT(inv.current_stage_entered_at)}
                              </TableCell>
                            </>
                          )}
                          <TableCell className="w-px">
                            <div className="flex flex-nowrap justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="xs"
                                title="View full invoice details"
                                onClick={() => setDetailInv(inv)}
                              >
                                <HiOutlineEye aria-hidden="true" /> View
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                title="View the stage-by-stage timeline"
                                onClick={() => void openTimeline(inv.id)}
                              >
                                <HiOutlineMapPin aria-hidden="true" /> Track
                              </Button>
                              {!readOnly && stageCfg?.is_terminal && (
                                <Button size="xs" onClick={() => void openPayment(inv)}>
                                  <HiOutlineBanknotes aria-hidden="true" /> Payment
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </>
      )}

      <InvoiceDetailDialog
        invoice={detailInv}
        onClose={() => setDetailInv(null)}
        onTimeline={(inv) => {
          setDetailInv(null);
          void openTimeline(inv.id);
        }}
      />

      <InvoiceTimelineDialog invoice={timelineInv} onClose={() => setTimelineInv(null)} />

      {payInv && (
        <PaymentDialog
          invoice={payInv}
          saving={savingPay}
          onClose={() => setPayInv(null)}
          onSave={(payment) => void savePayment(payment)}
        />
      )}
    </Page>
  );
}
