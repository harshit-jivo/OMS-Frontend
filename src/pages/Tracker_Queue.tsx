import { useEffect, useMemo, useState } from "react";
import {
  HiArrowUturnLeft,
  HiArrowRight,
  HiClock,
  HiBanknotes,
  HiEye,
  HiMapPin,
  HiMagnifyingGlass,
} from "react-icons/hi2";
import trackerService from "../services/trackerService";
import type {
  Invoice,
  Lookups,
  PaymentDetail,
  QueueStage,
  Stage,
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

// Statuses that mean "send back" / "need a written reason".
const RETURN_STATUSES = new Set(["RETURN", "REJECTED"]);
const REASON_STATUSES = new Set(["RETURN", "REJECTED", "HOLD", "DEBIT"]);

const EMPTY_PAYMENT: Partial<PaymentDetail> = {
  discount_amount: "",
  tds_amount: "",
  paid_amount: "",
  open_balance: "",
  status: "OPEN",
};

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
  const [subTab, setSubTab] = useState<"current" | "returned" | "advanced">("current");
  const [advancedRows, setAdvancedRows] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");

  const [timelineInv, setTimelineInv] = useState<Invoice | null>(null);
  const [detailInv, setDetailInv] = useState<Invoice | null>(null);
  const [payInv, setPayInv] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState<Partial<PaymentDetail>>({ ...EMPTY_PAYMENT });

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

  // All invoices sitting at the active stage, split by how they arrived.
  const stageRows = useMemo(
    () => queue.filter((i) => i.current_stage_code === activeStage),
    [queue, activeStage]
  );
  const currentRows = useMemo(
    () => stageRows.filter((i) => !i.arrived_via_return),
    [stageRows]
  );
  const returnedRows = useMemo(
    () => stageRows.filter((i) => i.arrived_via_return),
    [stageRows]
  );

  // Rows shown for the active sub-tab.
  const baseRows =
    subTab === "advanced" ? advancedRows :
    subTab === "returned" ? returnedRows : currentRows;
  const readOnly = subTab === "advanced";
  // Omni search filters whatever the active sub-tab shows.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? baseRows.filter((i) => invMatch(i, q)) : baseRows;
  }, [baseRows, search]);

  // Reset sub-tab + selection whenever the stage changes.
  useEffect(() => {
    setSelected(new Set()); setRemarks(""); setStatusPick("");
    setHoldType(""); setAmount(""); setSubTab("current");
  }, [activeStage]);
  // Reset selection when the sub-tab changes; lazy-load the advanced history.
  useEffect(() => {
    setSelected(new Set());
    if (subTab === "advanced" && activeStage) {
      trackerService.getStageAdvanced(activeStage).then(setAdvancedRows).catch(() => {});
    }
  }, [subTab, activeStage]);

  const toggle = (id: number) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
      load();
    } catch (err: any) {
      flash(err?.response?.data?.detail || "Action failed");
    }
  };

  const onAdvance = () => runBulk({ action: "ADVANCE", remarks });
  const onReturn = () => {
    if (!remarks.trim()) { flash("Remarks are mandatory to return"); return; }
    runBulk({ action: "RETURN", remarks });
  };
  const onApplyStatus = () => {
    if (!statusPick) { flash("Pick a status"); return; }
    if (REASON_STATUSES.has(statusPick) && !remarks.trim()) {
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

  const openTimeline = async (id: number) => {
    try { setTimelineInv(await trackerService.getInvoice(id)); }
    catch { flash("Failed to load timeline"); }
  };

  const openPayment = async (inv: Invoice) => {
    try {
      const full = await trackerService.getInvoice(inv.id);
      setPayInv(full);
      if (full.payment) {
        // Show blanks (with a placeholder) instead of a pre-filled 0.00.
        const blankZero = (v: string) => (Number(v) === 0 ? "" : v);
        setPayForm({
          discount_amount: blankZero(full.payment.discount_amount),
          tds_amount: blankZero(full.payment.tds_amount),
          paid_amount: blankZero(full.payment.paid_amount),
          open_balance: blankZero(full.payment.open_balance),
          status: full.payment.status,
        });
      } else {
        setPayForm({ ...EMPTY_PAYMENT });
      }
    } catch { flash("Failed to load payment"); }
  };
  const savePayment = async () => {
    if (!payInv) return;
    // Blank amounts save as 0.
    const payload = {
      ...payForm,
      discount_amount: payForm.discount_amount || "0",
      tds_amount: payForm.tds_amount || "0",
      paid_amount: payForm.paid_amount || "0",
      open_balance: payForm.open_balance || "0",
    };
    try {
      await trackerService.updatePayment(payInv.id, payload);
      flash(payForm.status === "PAID" ? "Payment saved — invoice completed" : "Payment saved");
      setPayInv(null);
      load();
    } catch (err: any) {
      flash(err?.response?.data?.detail || "Payment save failed");
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
            {isEntry && (
              <button className={"trk-tab" + (subTab === "advanced" ? " active" : "")}
                onClick={() => setSubTab("advanced")}>
                Advanced{subTab === "advanced" && <span className="trk-tab-count">{advancedRows.length}</span>}
              </button>
            )}
          </div>

          {/* Action bar (adapts to the active stage's rules) — hidden in read-only history */}
          {!readOnly && stageCfg && !stageCfg.is_terminal && (
            <div className="trk-actionbar">
              <span className="trk-count">{selected.size} selected</span>
              {stageCfg.requires_status ? (
                <>
                  <select value={statusPick} onChange={(e) => { setStatusPick(e.target.value); setHoldType(""); setAmount(""); }}>
                    <option value="">Status…</option>
                    {stageCfg.status_choices.map((s) => (
                      <option key={s} value={s}>{s}</option>
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
                      REASON_STATUSES.has(statusPick) ? "Remarks (required)" : "Remarks (optional)"
                    }
                    value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                  <button className="trk-btn trk-btn-primary" onClick={onApplyStatus}
                    disabled={selected.size === 0}>
                    {RETURN_STATUSES.has(statusPick) ? <><HiArrowUturnLeft /> Return</>
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

          {/* Table */}
          <div className="trk-card">
            <div className="trk-table-wrap">
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
                      <td>₹{money(inv.invoice_value)}</td>
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
                        : "No invoices at this stage."}
                    </div></td></tr>
                  )}
                </tbody>
              </table>
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
      {payInv && (
        <div className="trk-modal-overlay" onClick={() => setPayInv(null)}>
          <div className="trk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trk-modal-head">
              <h3>Payment — {payInv.invoice_number}</h3>
            </div>
            <div className="trk-modal-body">
              <div className="trk-form-grid">
                {(["discount_amount", "tds_amount", "paid_amount", "open_balance"] as const).map((k) => (
                  <div className="trk-field" key={k}>
                    <label>{k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</label>
                    <input type="number" step="0.01" placeholder="0.00"
                      value={(payForm[k] as string) ?? ""}
                      onChange={(e) => setPayForm((f) => ({ ...f, [k]: e.target.value }))} />
                  </div>
                ))}
                <div className="trk-field">
                  <label>Status</label>
                  <select value={payForm.status}
                    onChange={(e) => setPayForm((f) => ({ ...f, status: e.target.value as "OPEN" | "PAID" }))}>
                    <option value="OPEN">Open</option>
                    <option value="PAID">Paid</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="trk-modal-foot">
              <button className="trk-btn trk-btn-ghost" onClick={() => setPayInv(null)}>Cancel</button>
              <button className="trk-btn trk-btn-primary" onClick={savePayment}>Save payment</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="trk-toast">{toast}</div>}
    </div>
  );
}
