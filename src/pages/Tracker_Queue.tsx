import { useEffect, useMemo, useState } from "react";
import {
  HiArrowUturnLeft,
  HiArrowRight,
  HiArrowDownTray,
  HiClock,
  HiBanknotes,
  HiEye,
  HiMapPin,
  HiMagnifyingGlass,
} from "react-icons/hi2";
import { saveAs } from "file-saver";
import trackerService from "../services/trackerService";
import { exportDateStamp } from "../utils/excelExport";
import type {
  Invoice,
  JsapStatus,
  Lookups,
  PaymentDetail,
  QueueStage,
  Stage,
  StageDecision,
} from "../services/trackerService";
import "../styles/Tracker.css";

const money = (v: string | number) =>
  Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB");
};
const fmtDT = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

// Omni search: match a query against every meaningful invoice field.
const invMatch = (i: Invoice, q: string) =>
  [
    i.invoice_number, i.party_name, i.party_code, i.party_gstin,
    i.category_name, i.unit_name, i.branch_name, i.mode_name,
    i.current_stage_name, i.gst_type_name, i.gst_rate_label,
    i.invoice_value, i.taxable_value, i.return_reason, i.returned_from,
  ].some((v) => (v ?? "").toString().toLowerCase().includes(q));

/**
 * One invoice's JSAP verdict. `undefined` means the lookup is still in flight;
 * `null` means it failed. An unavailable status is not an error — it explains
 * why the invoice can't be linked to a JSAP decision, which is exactly what the
 * handler needs to see.
 */
function JsapCell({ status }: { status?: JsapStatus | null }) {
  if (status === undefined) return <span className="trk-sub">checking…</span>;
  if (status === null) return <span className="trk-badge trk-badge-muted">unavailable</span>;

  if (!status.available) {
    return (
      <>
        <span className="trk-badge trk-badge-muted">
          {status.reason === "not_in_jsap" ? "Not in JSAP"
            : status.reason === "no_party_code" ? "No SAP vendor"
            : status.reason === "no_draft" ? "No SAP draft"
            : status.reason === "not_submitted" ? "Not submitted"
            : status.reason === "rejection_pending" ? "Rejected here"
            : "Unavailable"}
        </span>
        {status.detail && (
          <div className="trk-sub" style={{ fontSize: 11 }}>{status.detail}</div>
        )}
      </>
    );
  }

  const cls = status.status === "A" ? "trk-badge-success"
    : status.status === "R" ? "trk-badge-danger" : "trk-badge-muted";
  return (
    <>
      <span className={"trk-badge " + cls}>{status.label}</span>
      {status.description && (
        <div className="trk-sub" style={{ fontSize: 11, whiteSpace: "normal" }}>
          {status.description}
        </div>
      )}
      {status.doc_entry != null && (
        <div className="trk-sub" style={{ fontSize: 10, color: "#94a3b8" }}>
          draft {status.doc_entry}
        </div>
      )}
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
    d.invoice_number, d.party_name, d.category_name, d.unit_name, d.branch_name,
    d.remarks, d.acted_by_name, d.amount, d.current_stage_name,
  ].some((v) => (v ?? "").toString().toLowerCase().includes(q));

// Statuses that mean "send back" / "need a written reason".
const RETURN_STATUSES = new Set(["RETURN", "REJECTED"]);
/** Stage statuses are stored as keys; show them without the underscores. */
const statusLabel = (s: string) => s.replace(/_/g, " ");
const REASON_STATUSES = new Set(["RETURN", "REJECTED", "HOLD", "DEBIT"]);

// The payment form now captures only the three inputs; every amount, the open
// balance and the status are derived (mirrored from the server maths).
const EMPTY_PAYMENT: Partial<PaymentDetail> = {
  discount_pct: "",
  tds_pct: "",
  paid_amount: "",
  hold_added_back: false,
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function Tracker_Queue() {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [queue, setQueue] = useState<Invoice[]>([]);
  const [stageTabs, setStageTabs] = useState<QueueStage[]>([]);
  const [activeStage, setActiveStage] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [remarks, setRemarks] = useState("");
  const [statusPick, setStatusPick] = useState("");
  const [holdType, setHoldType] = useState("");   // FULL | PARTIAL
  const [amount, setAmount] = useState("");        // hold / debit amount
  const [toast, setToast] = useState("");
  const [subTab, setSubTab] = useState<
    "current" | "returned" | "advanced" | "rejected" | "partial"
    | "ok" | "hold" | "debit"
    | "approved" | "rejected_log" | "sent_back">("current");
  // Send-back tabs: also list rejections the invoice has already come back from.
  const [showResolved, setShowResolved] = useState(false);
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
  const [payForm, setPayForm] = useState<Partial<PaymentDetail>>({ ...EMPTY_PAYMENT });
  // Whether the user has manually typed a paid amount. Until then, the paid
  // field auto-follows the net payable (so it always shows amount-after-deductions).
  const [paidEdited, setPaidEdited] = useState(false);
  const [savingPay, setSavingPay] = useState(false);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  useEffect(() => {
    trackerService.getLookups().then(setLookups).catch(() => flash("Failed to load config"));
    load();
    const t = setInterval(load, 30000); // near real-time
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    try {
      const data = await trackerService.myQueue();
      setQueue(data.invoices);
      setStageTabs(data.stages);
    } catch {
      flash("Failed to load queue");
    }
  };

  // Tabs = every stage this user is assigned to (shown even when empty).
  const stagesInQueue = stageTabs;

  useEffect(() => {
    if (!activeStage && stagesInQueue.length) setActiveStage(stagesInQueue[0].code);
  }, [stagesInQueue, activeStage]);

  const stageCfg: Stage | undefined = useMemo(
    () => lookups?.stages.find((s) => s.code === activeStage),
    [lookups, activeStage]
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
    [queue, activeStage]
  );
  // Rejected-but-awaiting-remarks (SAP/JSAP) get their own tab.
  const rejectedRows = useMemo(
    () => stageRows.filter((i) => i.rejection_pending),
    [stageRows]
  );
  // Partially-paid invoices (terminal stage) get their own tab and are kept out
  // of "Current" so the to-pay list and the part-paid list don't mix.
  const partialRows = useMemo(
    () => stageRows.filter((i) => i.is_partially_paid && !i.rejection_pending),
    [stageRows]
  );
  const currentRows = useMemo(
    () => stageRows.filter(
      (i) => !i.arrived_via_return && !i.rejection_pending && !i.is_partially_paid),
    [stageRows]
  );
  const returnedRows = useMemo(
    () => stageRows.filter((i) => i.arrived_via_return && !i.rejection_pending),
    [stageRows]
  );

  // Rows shown for the active sub-tab.
  const baseRows =
    subTab === "advanced" ? advancedRows :
    subTab === "returned" ? returnedRows :
    subTab === "rejected" ? rejectedRows :
    subTab === "partial" ? partialRows : currentRows;
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

  // Reset sub-tab + selection whenever the stage changes.
  useEffect(() => {
    setSelected(new Set()); setRemarks(""); setStatusPick("");
    setHoldType(""); setAmount(""); setSubTab("current");
  }, [activeStage]);
  const loadDecisions = async (clear = false) => {
    const decision = DECISION_TABS[subTab];
    if (!decision || !activeStage) return;
    setLoadingDecisions(true);
    if (clear) setDecisionRows([]);
    try {
      setDecisionRows(
        await trackerService.getStageDecisions(activeStage, decision, showResolved));
    } catch {
      flash("Failed to load the decision log");
    } finally {
      setLoadingDecisions(false);
    }
  };

  // Reset selection when the sub-tab changes; lazy-load the history tabs.
  useEffect(() => {
    setSelected(new Set());
    if (!activeStage) return;
    if (subTab === "advanced") {
      trackerService.getStageAdvanced(activeStage).then(setAdvancedRows).catch(() => {});
    }
    loadDecisions(true);
  }, [subTab, activeStage, showResolved]);

  // JSAP desk: fetch each parked invoice's budget verdict so the handler can
  // see WHY something is sitting here without opening it one by one.
  useEffect(() => {
    if (!isJsap || !stageRows.length) { setJsapStatuses({}); return; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(stageRows.map(async (inv) => {
        try { return [inv.id, await trackerService.getJsapStatus(inv.id)] as const; }
        catch { return [inv.id, null] as const; }
      }));
      if (cancelled) return;
      const map: Record<number, JsapStatus | null> = {};
      for (const [id, st] of entries) map[id] = st;
      setJsapStatuses(map);
    })();
    return () => { cancelled = true; };
  }, [isJsap, stageRows]);

  // Pull the latest decisions from JSAP: approved invoices advance, rejected
  // ones return to SAP Approval with JSAP's own reason.
  const onSyncJsap = async () => {
    setSyncingJsap(true);
    try {
      const res = await trackerService.syncJsap();
      const n = (res.advanced?.length ?? 0) + (res.returned?.length ?? 0);
      flash(n === 0
        ? `No change — ${res.waiting?.length ?? 0} still awaiting a JSAP decision`
        : `${res.advanced?.length ?? 0} approved, ${res.returned?.length ?? 0} returned`);
      load();
    } catch (err: any) {
      flash(err?.response?.data?.detail || "Could not reach JSAP");
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
    action?: "ADVANCE" | "RETURN"; stage_status?: string; remarks?: string;
    hold_type?: string; amount?: string;
  }) => {
    if (selected.size === 0) { flash("Select at least one invoice"); return; }
    try {
      const res = await trackerService.bulkAction({ ids: [...selected], ...payload });
      flash(
        `${res.processed_count} processed` +
        (res.errors.length ? `, ${res.errors.length} failed: ${res.errors[0]?.error}` : "")
      );
      setRemarks(""); setStatusPick(""); setHoldType(""); setAmount("");
      setSelected(new Set());
      load();
      if (isDecisionTab) loadDecisions();   // the log the action just changed
    } catch (err: any) {
      flash(err?.response?.data?.detail || "Action failed");
    }
  };

  // Full holds are the only decision-log rows still sitting at this desk, so
  // they are the only ones that can be released from the Hold tab.
  const heldHere = useMemo(
    () => decRows.filter((d) => d.is_still_here && d.hold_type === "FULL"),
    [decRows]
  );
  const canReleaseHolds = subTab === "hold" && heldHere.length > 0;
  const allHeldSelected =
    heldHere.length > 0 && heldHere.every((d) => selected.has(d.invoice_id));

  const onAdvance = () => runBulk({ action: "ADVANCE", remarks });
  /** Release the selected full holds: mark them OK and let them move on. */
  const onReleaseHold = (status: string) => {
    if (!selected.size) { flash("Select at least one held invoice"); return; }
    runBulk({ stage_status: status, remarks });
  };
  const onReturn = () => {
    if (!remarks.trim()) { flash("Remarks are mandatory to return"); return; }
    runBulk({ action: "RETURN", remarks });
  };
  // Rejected tab: supply the reason now and send the rejected invoice(s) back.
  const onReturnRejected = () => {
    if (!remarks.trim()) { flash("Enter remarks to return these rejected invoices"); return; }
    runBulk({ stage_status: "REJECTED", remarks });
  };
  const onApplyStatus = () => {
    if (!statusPick) { flash("Pick a status"); return; }
    // REJECTED is allowed WITHOUT remarks — it parks the invoice in the Rejected
    // tab; remarks are supplied later to return it. All other reason statuses
    // still require remarks up front.
    if (statusPick !== "REJECTED" && REASON_STATUSES.has(statusPick) && !remarks.trim()) {
      flash("Remarks are mandatory for this status"); return;
    }
    if (statusPick === "HOLD" && !holdType) {
      flash("Choose a hold type (full or partial)"); return;
    }
    // Partial-hold amount may be waived for RM-PM; let the server decide, but
    // nudge for a debit amount which is always required.
    if (statusPick === "DEBIT" && !amount.trim()) {
      flash("Enter the debit amount"); return;
    }
    runBulk({
      stage_status: statusPick, remarks,
      ...(statusPick === "HOLD" ? { hold_type: holdType } : {}),
      ...(amount.trim() ? { amount } : {}),
    });
  };

  // Export exactly what the active tab is showing (search filter included), in
  // the same register layout as the All-Invoices export — the server builds it
  // from the same `exports.build_workbook`, so the two sheets match column for
  // column. A decision log can list an invoice twice; the register is one row
  // per invoice, so the ids are de-duplicated server-side.
  const tabLabel = TAB_LABELS[subTab]
    ?? subTab.charAt(0).toUpperCase() + subTab.slice(1);
  const exportIds = isDecisionTab
    ? [...new Set(decRows.map((d) => d.invoice_id))]
    : rows.map((i) => i.id);

  const onExport = async () => {
    if (!exportIds.length) { flash("Nothing to export in this tab"); return; }
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
    try { setTimelineInv(await trackerService.getInvoice(id)); }
    catch { flash("Failed to load timeline"); }
  };

  const openPayment = async (inv: Invoice) => {
    try {
      const full = await trackerService.getInvoice(inv.id);
      setPayInv(full);
      const blankZero = (v?: string) => (!v || Number(v) === 0 ? "" : v);
      if (full.payment && (Number(full.payment.paid_amount) > 0
          || Number(full.payment.discount_pct) > 0 || Number(full.payment.tds_pct) > 0)) {
        // Editing an existing (e.g. partial) payment — restore the inputs and
        // treat the paid amount as user-set so it isn't auto-overwritten.
        setPayForm({
          discount_pct: blankZero(full.payment.discount_pct),
          tds_pct: blankZero(full.payment.tds_pct),
          hold_added_back: full.payment.hold_added_back,
          paid_amount: full.payment.paid_amount,
        });
        setPaidEdited(true);
      } else {
        setPayForm({ ...EMPTY_PAYMENT });
        setPaidEdited(false);   // paid auto-follows net payable until edited
      }
    } catch { flash("Failed to load payment"); }
  };

  const savePayment = async (calc: { netPayable: number; paid: number; isPaid: boolean }) => {
    if (!payInv) return;
    if (calc.paid > calc.netPayable + 0.005) {
      flash("Paid amount cannot exceed the net payable"); return;
    }
    setSavingPay(true);
    try {
      await trackerService.updatePayment(payInv.id, {
        discount_pct: payForm.discount_pct || "0",
        tds_pct: payForm.tds_pct || "0",
        hold_added_back: !!payForm.hold_added_back,
        paid_amount: String(round2(calc.paid)),
      });
      flash(calc.isPaid ? "Payment complete — invoice closed" : "Partial payment saved");
      setPayInv(null);
      load();
    } catch (err: any) {
      flash(err?.response?.data?.detail || "Payment save failed");
    } finally {
      setSavingPay(false);
    }
  };

  if (!lookups) return <div className="trk-page">Loading…</div>;

  return (
    <div className="trk-page">
      <div className="trk-header">
        <div>
          <h1>My Stage Queue</h1>
          <div className="trk-sub">Invoices waiting at your desk. Act in one click, in bulk.</div>
        </div>
        <div style={{ position: "relative", minWidth: 260 }}>
          <HiMagnifyingGlass style={{ position: "absolute", left: 10, top: 9, opacity: 0.4 }} />
          <input
            style={{ width: "100%", paddingLeft: 32 }}
            placeholder="Search invoice no., party, GSTIN, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {stagesInQueue.length === 0 ? (
        <div className="trk-card"><div className="trk-empty">Nothing pending at your desk. 🎉</div></div>
      ) : (
        <>
          <div className="trk-tabs">
            {stagesInQueue.map((s) => (
              <button key={s.code}
                className={"trk-tab" + (s.code === activeStage ? " active" : "")}
                onClick={() => setActiveStage(s.code)}>
                {s.name}<span className="trk-tab-count">{s.count}</span>
              </button>
            ))}
          </div>

          {/* Sub-tabs: Current / Returned (all stages) + Advanced (entry only) */}
          <div className="trk-tabs" style={{ marginTop: -6 }}>
            <button className={"trk-tab" + (subTab === "current" ? " active" : "")}
              onClick={() => setSubTab("current")}>
              Current<span className="trk-tab-count">{currentRows.length}</span>
            </button>
            <button className={"trk-tab" + (subTab === "returned" ? " active" : "")}
              onClick={() => setSubTab("returned")}>
              Returned<span className="trk-tab-count">{returnedRows.length}</span>
            </button>
            {isTerminal && (
              <button className={"trk-tab" + (subTab === "partial" ? " active" : "")}
                onClick={() => setSubTab("partial")}>
                Partial<span className="trk-tab-count">{partialRows.length}</span>
              </button>
            )}
            {/* Live: rejected here but the reason is still owed. Distinct from
                the Rejected *log* below, which is what was actually sent back. */}
            {(isSapApproval || isJsap || rejectedRows.length > 0) && (
              <button className={"trk-tab" + (subTab === "rejected" ? " active" : "")}
                onClick={() => setSubTab("rejected")}>
                Awaiting Remarks<span className="trk-tab-count">{rejectedRows.length}</span>
              </button>
            )}
            {isEntry && (
              <button className={"trk-tab" + (subTab === "advanced" ? " active" : "")}
                onClick={() => setSubTab("advanced")}>
                Advanced{subTab === "advanced" && <span className="trk-tab-count">{advancedRows.length}</span>}
              </button>
            )}
            {/* Decision log — what this desk decided. OK, DEBIT and partial
                HOLDs have already advanced, so these read the event history
                rather than the live queue. */}
            {decisionChoices.includes("HOLD") && (
              <button className={"trk-tab" + (subTab === "hold" ? " active" : "")}
                onClick={() => setSubTab("hold")}>
                Hold{subTab === "hold" && <span className="trk-tab-count">{decRows.length}</span>}
              </button>
            )}
            {decisionChoices.includes("OK") && (
              <button className={"trk-tab" + (subTab === "ok" ? " active" : "")}
                onClick={() => setSubTab("ok")}>
                OK{subTab === "ok" && <span className="trk-tab-count">{decRows.length}</span>}
              </button>
            )}
            {decisionChoices.includes("DEBIT") && (
              <button className={"trk-tab" + (subTab === "debit" ? " active" : "")}
                onClick={() => setSubTab("debit")}>
                Debit{subTab === "debit" && <span className="trk-tab-count">{decRows.length}</span>}
              </button>
            )}
            {/* Verdict logs: what this desk approved, and what it sent back
                and has not seen since. */}
            {decisionChoices.includes("APPROVED") && (
              <button className={"trk-tab" + (subTab === "approved" ? " active" : "")}
                onClick={() => setSubTab("approved")}>
                Approved{subTab === "approved" && <span className="trk-tab-count">{decRows.length}</span>}
              </button>
            )}
            {decisionChoices.includes("REJECTED") && (
              <button className={"trk-tab" + (subTab === "rejected_log" ? " active" : "")}
                onClick={() => setSubTab("rejected_log")}>
                Rejected{subTab === "rejected_log" && <span className="trk-tab-count">{decRows.length}</span>}
              </button>
            )}
            {decisionChoices.includes("RETURN") && (
              <button className={"trk-tab" + (subTab === "sent_back" ? " active" : "")}
                onClick={() => setSubTab("sent_back")}>
                Sent Back{subTab === "sent_back" && <span className="trk-tab-count">{decRows.length}</span>}
              </button>
            )}
            {/* Exports exactly what this tab shows, search filter included. */}
            <button className="trk-btn trk-btn-success" style={{ marginLeft: "auto" }}
              onClick={onExport} disabled={exporting || !exportIds.length}
              title={`Export the ${tabLabel} tab in the invoice-register layout`}>
              <HiArrowDownTray /> {exporting ? "Exporting…" : "Export Excel"}
              {exportIds.length > 0 && (
                <span className="trk-tab-count">{exportIds.length}</span>
              )}
            </button>
          </div>

          {/* Rejected tab: supply the reason now to send these back to the previous stage */}
          {subTab === "rejected" && (
            <div className="trk-actionbar" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
              <span className="trk-count">{selected.size} selected</span>
              <input className="trk-remarks" placeholder="Rejection remarks (required to return)"
                value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              <button className="trk-btn trk-btn-warn" onClick={onReturnRejected}
                disabled={selected.size === 0}>
                <HiArrowUturnLeft /> Return with remarks
              </button>
              <span className="trk-sub" style={{ fontSize: 11 }}>
                Rejected without a reason — add remarks to send back to the previous stage.
              </span>
            </div>
          )}

          {/* JSAP desk: pull the decision in from JSAP. The status bar below
              still works, so a handler can also approve/reject by hand — for an
              invoice JSAP never received, or to override what it says. */}
          {!readOnly && subTab !== "rejected" && isJsap && (
            <div className="trk-actionbar" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
              <button className="trk-btn trk-btn-primary" onClick={onSyncJsap}
                disabled={syncingJsap}>
                {syncingJsap ? "Checking JSAP…" : "↻ Refresh from JSAP"}
              </button>
              <span className="trk-sub" style={{ fontSize: 11 }}>
                Approved in JSAP → advances automatically. Rejected → goes back to
                SAP Approval with JSAP's reason. Nothing is sent to JSAP from here —
                use the controls below to decide manually instead.
              </span>
            </div>
          )}

          {/* Action bar (adapts to the active stage's rules) — hidden in read-only history + rejected tab */}
          {!readOnly && subTab !== "rejected" && stageCfg && !stageCfg.is_terminal && (
            <div className="trk-actionbar">
              <span className="trk-count">{selected.size} selected</span>
              {stageCfg.requires_status ? (
                <>
                  <select value={statusPick} onChange={(e) => { setStatusPick(e.target.value); setHoldType(""); setAmount(""); }}>
                    <option value="">Status…</option>
                    {stageCfg.status_choices.map((s) => (
                      <option key={s} value={s}>{statusLabel(s)}</option>
                    ))}
                  </select>
                  {statusPick === "HOLD" && (
                    <select value={holdType} onChange={(e) => setHoldType(e.target.value)}>
                      <option value="">Hold type…</option>
                      <option value="FULL">Full hold (stays here)</option>
                      <option value="PARTIAL">Partial hold (advances)</option>
                    </select>
                  )}
                  {(statusPick === "DEBIT" || (statusPick === "HOLD" && holdType === "PARTIAL")) && (
                    <input type="number" step="0.01" style={{ width: 130 }}
                      placeholder={statusPick === "DEBIT" ? "Debit amount" : "Hold amount"}
                      value={amount} onChange={(e) => setAmount(e.target.value)} />
                  )}
                  <input className="trk-remarks"
                    placeholder={
                      statusPick === "REJECTED" ? "Remarks (optional — blank parks it in Rejected)"
                        : REASON_STATUSES.has(statusPick) ? "Remarks (required)" : "Remarks (optional)"
                    }
                    value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                  <button className="trk-btn trk-btn-primary" onClick={onApplyStatus}
                    disabled={selected.size === 0}>
                    {statusPick === "REJECTED"
                      ? <><HiArrowUturnLeft /> {remarks.trim() ? "Reject & return" : "Reject"}</>
                      : RETURN_STATUSES.has(statusPick) ? <><HiArrowUturnLeft /> Return</>
                      : statusPick === "HOLD" && holdType === "FULL" ? <>⏸ Hold</>
                      : <><HiArrowRight /> Apply</>}
                  </button>
                  {statusPick === "HOLD" && holdType === "PARTIAL" && (
                    <span className="trk-sub" style={{ fontSize: 11 }}>Amount required (except RM-PM)</span>
                  )}
                </>
              ) : (
                <>
                  <input className="trk-remarks" placeholder="Remarks (optional for advance)"
                    value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                  <button className="trk-btn trk-btn-success" onClick={onAdvance}
                    disabled={selected.size === 0}>
                    <HiArrowRight /> Advance
                  </button>
                  {stageCfg.can_return && (
                    <button className="trk-btn trk-btn-warn" onClick={onReturn}
                      disabled={selected.size === 0}>
                      <HiArrowUturnLeft /> Return
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {!readOnly && stageCfg?.is_terminal && (
            <div className="trk-actionbar">
              <HiBanknotes /> Capture payment per invoice using the <b>Payment</b> button.
            </div>
          )}
          {subTab === "returned" && returnedRows.length > 0 && (
            <div className="trk-actionbar" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
              <HiArrowUturnLeft color="#b45309" /> These invoices were <b>sent back to your desk</b> for rework — see the reason in each row.
            </div>
          )}

          {/* Decision-log banner: these tabs are history, not a worklist. */}
          {isDecisionTab && (
            <div className="trk-actionbar" style={{ background: "#f8fafc" }}>
              <span className="trk-sub" style={{ fontSize: 11 }}>
                {subTab === "hold"
                  ? "Every hold recorded at this desk. A full hold keeps the invoice here; a partial hold advances it with the amount withheld."
                  : subTab === "debit"
                  ? "Every debit recorded at this desk, with the amount debited. Debits accumulate on the invoice."
                  : subTab === "approved"
                  ? "Every invoice this desk approved and passed on."
                  : SENT_BACK_TABS.has(subTab)
                  ? `Invoices this desk ${subTab === "rejected_log" ? "rejected" : "sent back"}, with the reason. Once one comes back to this desk it is no longer outstanding and drops off this list.`
                  : "Every invoice this desk passed as OK."}
                {" "}Read-only log — the invoice may have moved on since.
              </span>
              {subTab === "hold" && heldHere.length > 0 && (
                <span className="trk-sub" style={{ fontSize: 11, color: "#b45309" }}>
                  {heldHere.length} still held here — tick them below to release.
                </span>
              )}
              {SENT_BACK_TABS.has(subTab) && (
                <label style={{ display: "flex", alignItems: "center", gap: 6,
                                marginLeft: "auto", fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={showResolved}
                    onChange={(e) => setShowResolved(e.target.checked)} />
                  Also show ones that came back
                </label>
              )}
            </div>
          )}

          {/* Hold tab: release a full hold — it is still parked at this desk,
              so it can be dispositioned straight from the log. */}
          {canReleaseHolds && (
            <div className="trk-actionbar" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
              <span className="trk-count">{selected.size} selected</span>
              <input className="trk-remarks" placeholder="Remarks (optional)"
                value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              <button className="trk-btn trk-btn-success"
                onClick={() => onReleaseHold("OK")} disabled={!selected.size}>
                <HiArrowRight /> Release as OK
                {stageCfg && !stageCfg.is_terminal && " → next stage"}
              </button>
              <span className="trk-sub" style={{ fontSize: 11 }}>
                Clears the hold and advances the invoice — same as dispositioning
                it from the Current tab.
              </span>
            </div>
          )}

          {/* Table */}
          <div className="trk-card">
            <div className="trk-table-wrap">
              {isDecisionTab ? (
              <table className="trk-table">
                <thead>
                  <tr>
                    {canReleaseHolds && (
                      <th>
                        <input type="checkbox" checked={allHeldSelected}
                          onChange={(e) =>
                            setSelected(e.target.checked
                              ? new Set(heldHere.map((d) => d.invoice_id))
                              : new Set())
                          } />
                      </th>
                    )}
                    <th>Invoice No.</th>
                    <th>Party</th>
                    <th>Inv. Date</th>
                    <th>Value</th>
                    <th>Decision</th>
                    {AMOUNT_TABS.has(subTab) && <th>Amount</th>}
                    <th>Remarks</th>
                    <th>By</th>
                    <th>Decided</th>
                    <th>Now At</th>
                  </tr>
                </thead>
                <tbody>
                  {decRows.map((d) => (
                    <tr key={d.event_id}>
                      {canReleaseHolds && (
                        <td>
                          {d.is_still_here && d.hold_type === "FULL" && (
                            <input type="checkbox" checked={selected.has(d.invoice_id)}
                              onChange={() => toggle(d.invoice_id)} />
                          )}
                        </td>
                      )}
                      <td>{d.invoice_number}</td>
                      <td>{d.party_name}</td>
                      <td>{fmtDate(d.invoice_date)}</td>
                      <td>₹{money(d.net_invoice_value ?? d.invoice_value)}</td>
                      <td>
                        <span className={"trk-badge " + (
                          d.decision === "OK" || d.decision === "APPROVED" ? "trk-badge-success"
                            : d.decision === "DEBIT" || d.decision === "REJECTED" ? "trk-badge-danger"
                            : "trk-badge-warn")}>
                          {d.decision}{d.hold_type ? ` · ${d.hold_type}` : ""}
                        </span>
                        {d.awaiting_remarks && (
                          <div className="trk-sub" style={{ fontSize: 11 }}>reason still owed</div>
                        )}
                        {d.came_back && SENT_BACK_TABS.has(subTab) && (
                          <div className="trk-sub" style={{ fontSize: 11, color: "#047857" }}>
                            came back since
                          </div>
                        )}
                      </td>
                      {AMOUNT_TABS.has(subTab) && (
                        <td>
                          {d.amount ? `₹${money(d.amount)}` : "—"}
                          {d.decision === "HOLD" && d.hold_type === "FULL" && (
                            <div className="trk-sub" style={{ fontSize: 11 }}>full value</div>
                          )}
                        </td>
                      )}
                      <td style={{ maxWidth: 260, whiteSpace: "normal" }}>{d.remarks || "—"}</td>
                      <td>{d.acted_by_name || "—"}</td>
                      <td>
                        {fmtDT(d.decided_at)}
                      </td>
                      <td>
                        <span className={"trk-badge " + (d.is_still_here
                          ? "trk-badge-warn" : "trk-badge-stage")}>
                          {d.invoice_status === "COMPLETED" ? "Completed" : d.current_stage_name}
                        </span>
                        {d.is_still_here && (
                          <div className="trk-sub" style={{ fontSize: 11 }}>still here</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {decRows.length === 0 && (
                    <tr><td colSpan={11}><div className="trk-empty">
                      {loadingDecisions ? "Loading…"
                        : SENT_BACK_TABS.has(subTab)
                        ? (showResolved
                          ? "This desk has not sent anything back."
                          : "Nothing outstanding — anything sent back has since come back here.")
                        : `No ${DECISION_TABS[subTab].toLowerCase()} decisions recorded at this stage.`}
                    </div></td></tr>
                  )}
                </tbody>
              </table>
              ) : (
              <table className="trk-table">
                <thead>
                  <tr>
                    {!readOnly && (
                      <th>
                        <input type="checkbox" checked={allSelected}
                          onChange={(e) =>
                            setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                          } />
                      </th>
                    )}
                    <th>Invoice No.</th>
                    <th>Party</th>
                    <th>Inv. Date</th>
                    <th>Value</th>
                    <th>Category</th>
                    <th>Unit / Branch</th>
                    {subTab === "returned" && <><th>Sent Back By</th><th>Reason</th></>}
                    {isJsap && subTab !== "advanced" && <th>JSAP Status</th>}
                    {subTab === "advanced" ? (
                      <><th>Now At</th><th>Advanced On</th></>
                    ) : (
                      <><th>Days Here</th><th>Entered</th></>
                    )}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => (
                    <tr key={inv.id} className={inv.is_overdue && !readOnly ? "trk-row-overdue" : ""}>
                      {!readOnly && (
                        <td>
                          <input type="checkbox" checked={selected.has(inv.id)}
                            onChange={() => toggle(inv.id)} />
                        </td>
                      )}
                      <td>{inv.invoice_number}</td>
                      <td>{inv.party_name}</td>
                      <td>{fmtDate(inv.invoice_date)}</td>
                      <td>
                        ₹{money(inv.net_invoice_value ?? inv.invoice_value)}
                        {Number(inv.debit_amount) > 0 && (
                          <div className="trk-sub" style={{ fontSize: 11, color: "#b45309" }}>
                            −₹{money(inv.debit_amount)} debit
                          </div>
                        )}
                        {inv.is_partially_paid && (
                          <div className="trk-sub" style={{ fontSize: 11, color: "#b45309" }}>
                            bal ₹{money(inv.open_balance || 0)}
                          </div>
                        )}
                      </td>
                      <td>{inv.category_name}</td>
                      <td>{inv.unit_name} / {inv.branch_name}</td>
                      {subTab === "returned" && (
                        <>
                          <td>{inv.returned_from || "-"}{inv.returned_by ? ` (${inv.returned_by})` : ""}</td>
                          <td style={{ maxWidth: 260, whiteSpace: "normal" }}>
                            <span className="trk-badge trk-badge-warn" style={{ whiteSpace: "normal" }}>
                              {inv.return_reason || "—"}
                            </span>
                          </td>
                        </>
                      )}
                      {isJsap && subTab !== "advanced" && (
                        <td style={{ maxWidth: 240, whiteSpace: "normal" }}>
                          <JsapCell status={jsapStatuses[inv.id]} />
                        </td>
                      )}
                      {subTab === "advanced" ? (
                        <>
                          <td><span className="trk-badge trk-badge-stage">{inv.current_stage_name}</span></td>
                          <td>{fmtDT(inv.advanced_at)}</td>
                        </>
                      ) : (
                        <>
                          <td>
                            <span className={"trk-badge " + (inv.is_overdue ? "trk-badge-danger" : "trk-badge-muted")}>
                              <HiClock style={{ verticalAlign: "-2px" }} /> {inv.days_at_stage}
                              {inv.is_overdue ? " ⚠" : ""}
                            </span>
                          </td>
                          <td>{fmtDT(inv.current_stage_entered_at)}</td>
                        </>
                      )}
                      <td style={{ display: "flex", gap: 6 }}>
                        <button className="trk-btn trk-btn-ghost" style={{ padding: "5px 9px" }}
                          title="View full invoice details"
                          onClick={() => setDetailInv(inv)}>
                          <HiEye /> View
                        </button>
                        <button className="trk-btn trk-btn-ghost" style={{ padding: "5px 9px" }}
                          title="View stage-by-stage timeline"
                          onClick={() => openTimeline(inv.id)}>
                          <HiMapPin /> Track
                        </button>
                        {!readOnly && stageCfg?.is_terminal && (
                          <button className="trk-btn trk-btn-primary" style={{ padding: "5px 9px" }}
                            onClick={() => openPayment(inv)}>
                            <HiBanknotes /> Payment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={12}><div className="trk-empty">
                      {subTab === "returned" ? "No returned invoices at this stage."
                        : subTab === "advanced" ? "Nothing advanced from here yet."
                        : subTab === "rejected" ? "No rejected invoices awaiting remarks."
                        : subTab === "partial" ? "No partially-paid invoices."
                        : "No invoices at this stage."}
                    </div></td></tr>
                  )}
                </tbody>
              </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* Invoice details modal (read-only, any stage user can view) */}
      {detailInv && (
        <div className="trk-modal-overlay" onClick={() => setDetailInv(null)}>
          <div className="trk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trk-modal-head">
              <h3>{detailInv.invoice_number} — {detailInv.party_name}</h3>
              <span className="trk-badge trk-badge-stage" style={{ marginLeft: 8 }}>
                {detailInv.current_stage_name}
              </span>
            </div>
            <div className="trk-modal-body">
              {[
                { title: "Invoice", fields: [
                  ["Invoice No.", detailInv.invoice_number],
                  ["Invoice Date", fmtDate(detailInv.invoice_date)],
                  ["Mode", detailInv.mode_name],
                  ["Status", detailInv.status === "COMPLETED" ? "Completed" : "In Progress"],
                ]},
                { title: "Party", fields: [
                  ["Party Name", detailInv.party_name],
                  ["Party Code", detailInv.party_code || "-"],
                  ["Party GSTIN", detailInv.party_gstin || "-"],
                ]},
                { title: "Amounts", fields: [
                  ["Taxable Value", `₹${money(detailInv.taxable_value)}`],
                  ["GST Type", detailInv.gst_type_name],
                  ["GST Rate", detailInv.gst_rate_label],
                  ["GST Amount", `₹${money(detailInv.gst_amount)}`],
                  ["Additional Charge", detailInv.additional_charge_type_display || "-"],
                  ["Additional Amount", `₹${money(detailInv.additional_charge_amount)}`],
                  ["Invoice Value", `₹${money(detailInv.invoice_value)}`],
                  ...(Number(detailInv.debit_amount) > 0 ? [
                    ["Debit (Pre-Audit)", `− ₹${money(detailInv.debit_amount)}`] as [string, string],
                    ["Net Value", `₹${money(detailInv.net_invoice_value)}`] as [string, string],
                  ] : []),
                  ...(Number(detailInv.hold_amount) > 0 ? [
                    ["Hold Amount", `₹${money(detailInv.hold_amount)}`] as [string, string],
                  ] : []),
                ]},
                { title: "Classification", fields: [
                  ["Category", detailInv.category_name],
                  ["Unit", detailInv.unit_name],
                  ["Branch", detailInv.branch_name],
                ]},
                { title: "Workflow", fields: [
                  ["Current Stage", detailInv.current_stage_name],
                  ["Entered Stage", fmtDT(detailInv.current_stage_entered_at)],
                  ["Days at Stage", detailInv.days_at_stage + (detailInv.is_overdue ? " ⚠ overdue" : "")],
                  ...(detailInv.arrived_via_return ? [
                    ["Returned By", `${detailInv.returned_from || "-"}${detailInv.returned_by ? ` (${detailInv.returned_by})` : ""}`] as [string, string],
                    ["Return Reason", detailInv.return_reason || "-"] as [string, string],
                  ] : []),
                ]},
                { title: "Audit", fields: [
                  ["Created By", detailInv.created_by_name],
                  ["Created On", fmtDT(detailInv.created_at)],
                  ["Last Updated", fmtDT(detailInv.updated_at)],
                ]},
              ].map((section) => (
                <div key={section.title} style={{ marginBottom: 14 }}>
                  <div className="trk-sub" style={{ fontWeight: 600, marginBottom: 6 }}>{section.title}</div>
                  <div className="trk-form-grid">
                    {section.fields.map(([label, value]) => (
                      <div className="trk-field" key={label}>
                        <label>{label}</label>
                        <div style={{ padding: "6px 0", fontWeight: 500, wordBreak: "break-word" }}>
                          {value ?? "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="trk-modal-foot">
              <button className="trk-btn trk-btn-ghost" onClick={() => { setDetailInv(null); openTimeline(detailInv.id); }}>
                <HiMapPin /> View Timeline
              </button>
              <button className="trk-btn trk-btn-primary" onClick={() => setDetailInv(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline modal */}
      {timelineInv && (
        <div className="trk-modal-overlay" onClick={() => setTimelineInv(null)}>
          <div className="trk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trk-modal-head">
              <h3>{timelineInv.invoice_number} — {timelineInv.party_name}</h3>
            </div>
            <div className="trk-modal-body">
              <ul className="trk-timeline">
                {(timelineInv.events || []).map((ev) => (
                  <li key={ev.id}>
                    <div className="tl-stage">
                      {ev.stage_name}
                      {ev.stage_status && <span className="trk-badge trk-badge-muted" style={{ marginLeft: 8 }}>{ev.stage_status}{ev.hold_type ? ` · ${ev.hold_type}` : ""}</span>}
                      {ev.amount && <span className="trk-badge trk-badge-warn" style={{ marginLeft: 6 }}>₹{money(ev.amount)}</span>}
                      {ev.receiving_note === "LATE" && <span className="trk-badge trk-badge-late" style={{ marginLeft: 6 }}>Late (after 6 PM)</span>}
                    </div>
                    <div className="tl-meta">
                      {ev.event_type} · in {fmtDT(ev.entered_at)}
                      {ev.exited_at ? ` · out ${fmtDT(ev.exited_at)}` : " · (here now)"}
                      {ev.days_spent ? ` · ${ev.days_spent} days` : ""}
                      {ev.acted_by_name ? ` · ${ev.acted_by_name}` : ""}
                    </div>
                    {ev.remarks && <div className="tl-remark">“{ev.remarks}”</div>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="trk-modal-foot">
              <button className="trk-btn trk-btn-ghost" onClick={() => setTimelineInv(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {payInv && (() => {
        const invoiceValue = round2(Number(payInv.invoice_value || 0));
        const debit = round2(Number(payInv.debit_amount || 0));
        const netInvoice = round2(Number(payInv.net_invoice_value ?? invoiceValue));
        const hold = round2(Number(payInv.hold_amount || 0));
        const holdBack = !!payForm.hold_added_back;
        // Payable base drops the held amount unless the handler releases it.
        const payableBase = Math.max(0, holdBack ? netInvoice : round2(netInvoice - hold));
        const taxable = round2(Number(payInv.taxable_value || 0));
        const dpct = Number(payForm.discount_pct || 0);
        const tpct = Number(payForm.tds_pct || 0);
        // Discount is on the full net invoice value (incl. the held portion).
        const discountAmt = round2(netInvoice * dpct / 100);
        const tdsAmt = round2(taxable * tpct / 100);
        const netPayable = Math.max(0, round2(payableBase - discountAmt - tdsAmt));   // cap this round
        const totalOwed = Math.max(0, round2(netInvoice - discountAmt - tdsAmt));     // incl. hold
        // Paid auto-follows net payable until the user types a value.
        const paid = paidEdited ? Number(payForm.paid_amount || 0) : netPayable;
        // Open balance is against the full obligation — an un-released hold stays open.
        const openBalance = round2(totalOwed - paid);
        const over = paid > netPayable + 0.005;
        const isPaid = !over && openBalance <= 0.005;
        const ro = { background: "#f3f4f6", fontWeight: 600 } as const;

        return (
          <div className="trk-modal-overlay" onClick={() => setPayInv(null)}>
            <div className="trk-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
              <div className="trk-modal-head">
                <h3>Payment — {payInv.invoice_number}</h3>
                <span className="trk-sub" style={{ marginLeft: 8 }}>{payInv.party_name}</span>
              </div>
              <div className="trk-modal-body">
                <div className="trk-form-grid">
                  <div className="trk-field">
                    <label>Invoice Value{debit > 0 ? " (after debit)" : ""}</label>
                    <input readOnly style={ro} value={`₹ ${money(netInvoice)}`} />
                    {debit > 0 && (
                      <span className="trk-sub" style={{ fontSize: 11, color: "#b45309" }}>
                        ₹{money(invoiceValue)} − ₹{money(debit)} debit
                      </span>
                    )}
                  </div>
                  <div className="trk-field">
                    <label>Taxable Value</label>
                    <input readOnly style={ro} value={`₹ ${money(taxable)}`} />
                  </div>

                  {hold > 0 && (
                    <>
                      <div className="trk-field">
                        <label>Hold Amount</label>
                        <input readOnly style={{ ...ro, color: "#b45309" }} value={`₹ ${money(hold)}`} />
                        <span className="trk-sub" style={{ fontSize: 11 }}>
                          {holdBack
                            ? "released — added back to the payable"
                            : `withheld — payable value ₹${money(round2(netInvoice - hold))}`}
                        </span>
                      </div>
                      <div className="trk-field" style={{ justifyContent: "flex-end" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input type="checkbox" checked={holdBack}
                            onChange={(e) => setPayForm((f) => ({ ...f, hold_added_back: e.target.checked }))} />
                          Add hold amount back to the invoice
                        </label>
                      </div>
                    </>
                  )}

                  <div className="trk-field">
                    <label>Discount %</label>
                    <input type="number" step="0.01" min="0" max="100" placeholder="0"
                      value={payForm.discount_pct ?? ""}
                      onChange={(e) => setPayForm((f) => ({ ...f, discount_pct: e.target.value }))} />
                    <span className="trk-sub" style={{ fontSize: 11 }}>
                      on invoice value (after debit{hold > 0 ? ", incl. held" : ""})
                    </span>
                  </div>
                  <div className="trk-field">
                    <label>Discount Amount</label>
                    <input readOnly style={ro} value={`₹ ${money(discountAmt)}`} />
                  </div>

                  <div className="trk-field">
                    <label>TDS %</label>
                    <input type="number" step="0.01" min="0" max="100" placeholder="0"
                      value={payForm.tds_pct ?? ""}
                      onChange={(e) => setPayForm((f) => ({ ...f, tds_pct: e.target.value }))} />
                    <span className="trk-sub" style={{ fontSize: 11 }}>on taxable value</span>
                  </div>
                  <div className="trk-field">
                    <label>TDS Amount</label>
                    <input readOnly style={ro} value={`₹ ${money(tdsAmt)}`} />
                  </div>

                  <div className="trk-field">
                    <label>Net Payable</label>
                    <input readOnly style={{ background: "#eef2ff", fontWeight: 700, color: "#4338ca" }}
                      value={`₹ ${money(netPayable)}`} />
                  </div>
                  <div className="trk-field">
                    <label>Paid Amount</label>
                    <input type="number" step="0.01" min="0" max={netPayable}
                      value={paidEdited ? (payForm.paid_amount ?? "") : netPayable.toFixed(2)}
                      onChange={(e) => { setPaidEdited(true); setPayForm((f) => ({ ...f, paid_amount: e.target.value })); }} />
                    {over && (
                      <span className="trk-err" style={{ fontSize: 11 }}>
                        Cannot exceed net payable (₹{money(netPayable)})
                      </span>
                    )}
                  </div>

                  <div className="trk-field">
                    <label>Open Balance</label>
                    <input readOnly
                      style={{ background: openBalance > 0.005 ? "#fef3c7" : "#dcfce7", fontWeight: 700 }}
                      value={`₹ ${money(openBalance)}`} />
                    {hold > 0 && !holdBack && (
                      <span className="trk-sub" style={{ fontSize: 11, color: "#b45309" }}>
                        includes ₹{money(hold)} held back — release it to close the invoice
                      </span>
                    )}
                  </div>
                  <div className="trk-field">
                    <label>Status</label>
                    <input readOnly style={ro}
                      value={isPaid ? "PAID — completes on save" : "OPEN — stays for balance"} />
                  </div>
                </div>
              </div>
              <div className="trk-modal-foot">
                <button className="trk-btn trk-btn-ghost" onClick={() => setPayInv(null)}>Cancel</button>
                <button className="trk-btn trk-btn-primary" disabled={savingPay || over}
                  onClick={() => savePayment({ netPayable, paid, isPaid })}>
                  {savingPay ? "Saving…" : isPaid ? "Pay in full & close" : "Save partial payment"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {toast && <div className="trk-toast">{toast}</div>}
    </div>
  );
}
