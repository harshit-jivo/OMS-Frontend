import { useEffect, useMemo, useState } from "react";
import {
  HiCheckCircle,
  HiLockClosed,
  HiPencilSquare,
  HiPlusCircle,
} from "react-icons/hi2";
import trackerService, { ADDITIONAL_CHARGE_TYPES } from "../services/trackerService";
import type { Invoice, InvoiceWrite, Lookups, Vendor } from "../services/trackerService";
import "../styles/Tracker.css";

const EMPTY: InvoiceWrite = {
  invoice_date: "",
  party_name: "",
  party_code: "",
  party_gstin: "",
  invoice_number: "",
  taxable_value: "",
  gst_type: 0,
  gst_rate: 0,
  additional_charge_type: "",
  additional_charge_amount: "",
  category: 0,
  unit: 0,
  branch: 0,
  mode: 0,
};

const money = (v: string | number) =>
  Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB");
};

export default function Tracker_Entry() {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [form, setForm] = useState<InvoiceWrite>({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [myInvoices, setMyInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [advRemarks, setAdvRemarks] = useState("");
  const [toast, setToast] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorOpen, setVendorOpen] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  useEffect(() => {
    trackerService.getLookups().then(setLookups).catch(() => flash("Failed to load lookups"));
    trackerService.getVendors().then(setVendors).catch(() => {/* SAP down -> free text */});
    refresh();
  }, []);

  // Vendors matching the typed party name (client-side filter, capped).
  const vendorMatches = useMemo(() => {
    const q = form.party_name.trim().toLowerCase();
    if (!q) return vendors.slice(0, 50);
    return vendors
      .filter((v) => v.card_name.toLowerCase().includes(q) || v.card_code.toLowerCase().includes(q))
      .slice(0, 50);
  }, [vendors, form.party_name]);

  const pickVendor = (v: Vendor) => {
    setForm((f) => ({ ...f, party_name: v.card_name, party_code: v.card_code, party_gstin: v.gstin }));
    setVendorOpen(false);
  };

  const refresh = async () => {
    try {
      const data = await trackerService.listInvoices();
      setMyInvoices(data);
      setSelected(new Set());
    } catch {
      flash("Failed to load invoices");
    }
  };

  // The head-office / entry desk is shared: show every invoice currently at the
  // entry stage (freshly created or returned back), regardless of creator.
  const mine = useMemo(
    () => myInvoices.filter((i) => i.current_stage_code === "entry"),
    [myInvoices]
  );

  const setField = (k: keyof InvoiceWrite, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.invoice_date) e.invoice_date = "Required";
    if (!form.party_name.trim()) e.party_name = "Required";
    if (!form.invoice_number.trim()) e.invoice_number = "Required";
    if (!form.taxable_value) e.taxable_value = "Required";
    if (!form.gst_type) e.gst_type = "Required";
    if (!form.gst_rate) e.gst_rate = "Required";
    if (!form.category) e.category = "Required";
    if (!form.unit) e.unit = "Required";
    if (!form.branch) e.branch = "Required";
    if (!form.mode) e.mode = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onReview = () => {
    if (validate()) setShowReview(true);
  };

  const onConfirm = async () => {
    setSaving(true);
    // No charge type -> zero amount; blank amount -> 0 (backend needs a number).
    const payload: InvoiceWrite = {
      ...form,
      additional_charge_amount: form.additional_charge_type
        ? (form.additional_charge_amount || "0")
        : "0",
    };
    try {
      if (editingId) {
        await trackerService.updateInvoice(editingId, payload);
        flash("Invoice updated");
      } else {
        await trackerService.createInvoice(payload);
        flash("Invoice created");
      }
      setForm({ ...EMPTY });
      setEditingId(null);
      setShowReview(false);
      setShowForm(false);
      refresh();
    } catch (err: any) {
      const data = err?.response?.data;
      // Surface DRF field errors (e.g. duplicate invoice number), not just detail.
      let msg = data?.detail;
      if (!msg && data && typeof data === "object") {
        if (data.invoice_number) {
          msg = Array.isArray(data.invoice_number) ? data.invoice_number[0] : data.invoice_number;
          setShowReview(false);   // send them back to the form to fix it
          setErrors((e) => ({ ...e, invoice_number: msg }));
        } else {
          const first = Object.values(data)[0] as any;
          msg = Array.isArray(first) ? first[0] : first;
        }
      }
      flash(msg || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY });
    setErrors({});
    setShowForm(true);
  };

  const startEdit = (inv: Invoice) => {
    setEditingId(inv.id);
    setForm({
      invoice_date: inv.invoice_date,
      party_name: inv.party_name,
      party_code: inv.party_code || "",
      party_gstin: inv.party_gstin || "",
      invoice_number: inv.invoice_number,
      taxable_value: inv.taxable_value,
      gst_type: inv.gst_type,
      gst_rate: inv.gst_rate,
      additional_charge_type: inv.additional_charge_type || "",
      additional_charge_amount: inv.additional_charge_amount || "",
      category: inv.category,
      unit: inv.unit,
      branch: inv.branch,
      mode: inv.mode,
    });
    setErrors({});
    setShowForm(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ ...EMPTY });
    setErrors({});
    setShowForm(false);
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Selectable = still editable (unlocked at entry).
  const selectableIds = useMemo(() => mine.filter((i) => i.editable).map((i) => i.id), [mine]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const bulkAdvance = async () => {
    if (selected.size === 0) return;
    try {
      const res = await trackerService.bulkAction({
        ids: [...selected],
        action: "ADVANCE",
        remarks: advRemarks,
      });
      setAdvRemarks("");
      flash(
        `Advanced ${res.processed_count} invoice(s)` +
          (res.errors.length ? `, ${res.errors.length} failed` : "")
      );
      refresh();
    } catch (err: any) {
      flash(err?.response?.data?.detail || "Advance failed");
    }
  };

  const field = (
    key: keyof InvoiceWrite,
    label: string,
    node: React.ReactNode
  ) => (
    <div className="trk-field">
      <label>{label}</label>
      {node}
      {errors[key] && <span className="trk-err">{errors[key]}</span>}
    </div>
  );

  const sel = (
    key: keyof InvoiceWrite,
    options: { id: number; label: string }[]
  ) => (
    <select value={form[key] as number} onChange={(e) => setField(key, Number(e.target.value))}>
      <option value={0}>Select…</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );

  if (!lookups) return <div className="trk-page">Loading…</div>;

  const nameOf = (id: number, list: { id: number; name: string }[]) =>
    list.find((x) => x.id === id)?.name || "-";
  const rateOf = (id: number) => lookups.gst_rates.find((x) => x.id === id)?.label || "-";
  const chargeLabel = (v: string) =>
    ADDITIONAL_CHARGE_TYPES.find((c) => c.value === v)?.label || "-";

  // Derived money: GST amount and the final invoice value.
  const taxableNum = Number(form.taxable_value || 0);
  const gstRatePct = Number(lookups.gst_rates.find((g) => g.id === form.gst_rate)?.rate || 0);
  const gstAmount = taxableNum * gstRatePct / 100;
  const addAmount = Number(form.additional_charge_amount || 0);
  const invoiceValueCalc = taxableNum + gstAmount + addAmount;

  return (
    <div className="trk-page">
      <div className="trk-header">
        <div>
          <h1>Invoice Entry</h1>
          <div className="trk-sub">
            Create invoices, review before submitting, and advance them to the next stage.
          </div>
        </div>
        <button className="trk-btn trk-btn-primary" onClick={openCreate}>
          <HiPlusCircle /> Add Invoice
        </button>
      </div>

      {/* ---- Entry form (modal) ---- */}
      {showForm && (
        <div className="trk-modal-overlay" onClick={cancelEdit}>
          <div className="trk-modal" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
            <div className="trk-modal-head">
              <h3>{editingId ? `Edit invoice #${editingId}` : "New invoice"}</h3>
            </div>
            <div className="trk-modal-body">
              <div className="trk-form-grid">
                {field("invoice_date", "Invoice Date", (
                  <input type="date" value={form.invoice_date}
                    onChange={(e) => setField("invoice_date", e.target.value)} />
                ))}
                {field("party_name", "Party Name (search SAP vendors)", (
                  <div className="trk-combo">
                    <input value={form.party_name} autoComplete="off"
                      placeholder={vendors.length ? "Type to search vendors…" : "Loading vendors…"}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, party_name: e.target.value, party_code: "", party_gstin: "" }));
                        setVendorOpen(true);
                      }}
                      onFocus={() => setVendorOpen(true)}
                      onBlur={() => setTimeout(() => setVendorOpen(false), 150)} />
                    {vendorOpen && vendors.length > 0 && (
                      <div className="trk-combo-list">
                        {vendorMatches.length === 0 ? (
                          <div className="trk-combo-empty">No matching vendor — you can still type a name.</div>
                        ) : vendorMatches.map((v) => (
                          <div key={v.card_code} className="trk-combo-item"
                            onMouseDown={(e) => { e.preventDefault(); pickVendor(v); }}>
                            <div>{v.card_name}</div>
                            <div>
                              <span className="code">{v.card_code}{v.state ? ` · ${v.state}` : ""}</span>
                              {v.gstin && <span className="gst">  ·  {v.gstin}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="trk-field">
                  <label>GST Number</label>
                  <input value={form.party_gstin} readOnly
                    placeholder={form.party_code ? "" : "Auto-filled when a vendor is selected"}
                    style={{ background: "#f3f4f6", fontWeight: form.party_gstin ? 600 : 400 }} />
                </div>
                {field("invoice_number", "Invoice Number", (
                  <input value={form.invoice_number}
                    onChange={(e) => setField("invoice_number", e.target.value)} />
                ))}
                {field("taxable_value", "Taxable Value", (
                  <input type="number" step="0.01" value={form.taxable_value}
                    onChange={(e) => setField("taxable_value", e.target.value)} />
                ))}
                {field("gst_type", "GST", sel("gst_type",
                  lookups.gst_types.map((g) => ({ id: g.id, label: g.name }))))}
                {field("gst_rate", "Rate of GST", sel("gst_rate",
                  lookups.gst_rates.map((g) => ({ id: g.id, label: g.label }))))}
                <div className="trk-field">
                  <label>GST Amount</label>
                  <input value={`₹ ${money(gstAmount)}`} readOnly
                    style={{ background: "#f3f4f6", fontWeight: 600 }} />
                </div>
                {field("additional_charge_type", "Additional Charge (optional)", (
                  <select value={form.additional_charge_type}
                    onChange={(e) => setField("additional_charge_type", e.target.value)}>
                    <option value="">None</option>
                    {ADDITIONAL_CHARGE_TYPES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                ))}
                {field("additional_charge_amount", "Additional Charge Amount", (
                  <input type="number" step="0.01" value={form.additional_charge_amount}
                    disabled={!form.additional_charge_type}
                    placeholder={form.additional_charge_type ? "" : "Select a charge type first"}
                    onChange={(e) => setField("additional_charge_amount", e.target.value)} />
                ))}
                <div className="trk-field">
                  <label>Invoice Value (auto)</label>
                  <input value={`₹ ${money(invoiceValueCalc)}`} readOnly
                    style={{ background: "#eef2ff", fontWeight: 700, color: "#4338ca" }} />
                </div>
                {field("category", "Category", sel("category",
                  lookups.categories.map((c) => ({ id: c.id, label: c.name }))))}
                {field("unit", "Unit", sel("unit",
                  lookups.units.map((u) => ({ id: u.id, label: u.name }))))}
                {field("branch", "Branch", sel("branch",
                  lookups.branches.map((b) => ({ id: b.id, label: b.name }))))}
                {field("mode", "Mode of Invoice", sel("mode",
                  lookups.modes.map((m) => ({ id: m.id, label: m.name }))))}
              </div>
            </div>
            <div className="trk-modal-foot">
              <button className="trk-btn trk-btn-ghost" onClick={cancelEdit}>Cancel</button>
              <button className="trk-btn trk-btn-primary" onClick={onReview}>
                <HiCheckCircle /> Review & {editingId ? "Update" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Head office / entry queue (shared across entry users) ---- */}
      <div className="trk-card">
        <div className="trk-header" style={{ marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Head Office Queue</h3>
            <div className="trk-sub">All invoices at the entry stage — created here or returned back — from any user.</div>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="trk-actionbar">
            <span className="trk-count">{selected.size} selected</span>
            <input className="trk-remarks" placeholder="Remarks (optional)"
              value={advRemarks} onChange={(e) => setAdvRemarks(e.target.value)} />
            <button className="trk-btn trk-btn-success" onClick={bulkAdvance}>
              <HiPlusCircle /> Advance to next stage
            </button>
          </div>
        )}

        <div className="trk-table-wrap">
          <table className="trk-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allSelected}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(selectableIds) : new Set())
                    } />
                </th>
                <th>Invoice No.</th>
                <th>Party</th>
                <th>Inv. Date</th>
                <th>Value</th>
                <th>GST</th>
                <th>Category</th>
                <th>Created By</th>
                <th>Days</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mine.length === 0 && (
                <tr><td colSpan={11}><div className="trk-empty">No invoices yet.</div></td></tr>
              )}
              {mine.map((inv) => (
                <tr key={inv.id}
                  className={inv.is_overdue ? "trk-row-overdue" : inv.is_locked ? "trk-row-locked" : ""}>
                  <td>
                    {inv.editable ? (
                      <input type="checkbox" checked={selected.has(inv.id)}
                        onChange={() => toggle(inv.id)} />
                    ) : (
                      <HiLockClosed title="Locked — advanced to next stage" color="#9ca3af" />
                    )}
                  </td>
                  <td>{inv.invoice_number}</td>
                  <td>{inv.party_name}</td>
                  <td>{fmtDate(inv.invoice_date)}</td>
                  <td>₹{money(inv.invoice_value)}</td>
                  <td>{inv.gst_type_name} {inv.gst_rate_label}</td>
                  <td>{inv.category_name}</td>
                  <td>{inv.created_by_name}</td>
                  <td>
                    <span className={"trk-badge " + (inv.is_overdue ? "trk-badge-danger" : "trk-badge-muted")}>
                      {inv.days_at_stage}
                    </span>
                  </td>
                  <td>
                    {inv.editable ? (
                      <span className="trk-badge trk-badge-warn">Editable</span>
                    ) : (
                      <span className="trk-badge trk-badge-muted">Locked</span>
                    )}
                  </td>
                  <td>
                    {inv.editable && (
                      <button className="trk-btn trk-btn-ghost" style={{ padding: "5px 10px" }}
                        onClick={() => startEdit(inv)}>
                        <HiPencilSquare /> Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Review modal ---- */}
      {showReview && (
        <div className="trk-modal-overlay" onClick={() => setShowReview(false)}>
          <div className="trk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trk-modal-head">
              <h3>Review before {editingId ? "updating" : "submitting"}</h3>
            </div>
            <div className="trk-modal-body">
              <div className="trk-review-grid">
                {[
                  ["Invoice Date", fmtDate(form.invoice_date)],
                  ["Party Name", form.party_name],
                  ["GST Number", form.party_gstin || "—"],
                  ["Invoice Number", form.invoice_number],
                  ["Taxable Value", `₹${money(form.taxable_value)}`],
                  ["GST", nameOf(form.gst_type, lookups.gst_types)],
                  ["Rate of GST", rateOf(form.gst_rate)],
                  ["GST Amount", `₹${money(gstAmount)}`],
                  ["Additional Charge", form.additional_charge_type
                    ? `${chargeLabel(form.additional_charge_type)} — ₹${money(addAmount)}` : "None"],
                  ["Invoice Value", `₹${money(invoiceValueCalc)}`],
                  ["Category", nameOf(form.category, lookups.categories)],
                  ["Unit", nameOf(form.unit, lookups.units)],
                  ["Branch", nameOf(form.branch, lookups.branches)],
                  ["Mode of Invoice", nameOf(form.mode, lookups.modes)],
                ].map(([k, v]) => (
                  <div className="trk-review-item" key={k}>
                    <span className="k">{k}</span>
                    <span className="v">{v || "-"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="trk-modal-foot">
              <button className="trk-btn trk-btn-ghost" onClick={() => setShowReview(false)}>
                Go back & correct
              </button>
              <button className="trk-btn trk-btn-primary" onClick={onConfirm} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Confirm update" : "Confirm & submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="trk-toast">{toast}</div>}
    </div>
  );
}
