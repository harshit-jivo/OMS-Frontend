import { cloneElement, isValidElement, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  HiCheckCircle,
  HiLockClosed,
  HiPencilSquare,
  HiPlusCircle,
  HiTrash,
  HiMagnifyingGlass,
} from "react-icons/hi2";
import trackerService, { ADDITIONAL_CHARGE_TYPES } from "../services/trackerService";
import type { Invoice, InvoiceWrite, Vendor } from "../services/trackerService";
import "../styles/Tracker.css";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toast } from "@/components/ui/toast";
import { errorBody, fieldError, messageFrom } from "@/lib/apiError";
import {
  toInvoicePayload,
  trackerInvoiceSchema,
  type TrackerInvoiceInput,
} from "@/schemas/trackerInvoice";

const EMPTY: InvoiceWrite = {
  invoice_date: "",
  effective_month: "", // held as "YYYY-MM" in the form; sent as "YYYY-MM-01"
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

// Today's date as YYYY-MM-DD (local), used to cap the invoice-date picker.
const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

// Effective month display: first-of-month date -> "Mon YYYY".
const fmtMonth = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};

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
    i.gst_type_name,
    i.gst_rate_label,
    i.invoice_value,
    i.taxable_value,
    i.created_by_name,
  ].some((v) => (v ?? "").toString().toLowerCase().includes(q));

/** Stable empties, so `vendorMatches` / `mine` do not recompute every render. */
const NO_VENDORS: Vendor[] = [];
const NO_INVOICES: Invoice[] = [];

export default function Tracker_Entry() {
  const queryClient = useQueryClient();
  /* The three tracker reads. `lookups` stays `Lookups | null` because the form
     gates on null meaning "not loaded yet". */
  const { data: lookups = null } = useQuery({
    queryKey: ["tracker", "lookups"],
    queryFn: () => trackerService.getLookups(),
  });
  const { data: vendors = NO_VENDORS } = useQuery({
    queryKey: ["tracker", "vendors"],
    // SAP being down is not an error here — the party name falls back to free
    // text — so a failure resolves to an empty list rather than propagating.
    queryFn: () => trackerService.getVendors().catch(() => NO_VENDORS),
  });
  const { data: myInvoices = NO_INVOICES } = useQuery({
    queryKey: ["tracker", "invoices"],
    queryFn: () => trackerService.listInvoices(),
  });
  /*
   * Phase 3.4 — the first form on react-hook-form + zod, and the pattern the
   * rest should follow.
   *
   * `watch()` rather than `getValues()` for the JSX: it subscribes, so the
   * derived GST amount and the vendor combo re-render exactly as they did
   * under `useState`. That keeps this a state-layer swap rather than a
   * rewrite of thirty controlled inputs — which is the only reason a form
   * this size could be converted safely without form-level tests.
   *
   * `mode: "onTouched"` is the behaviour change worth having: the old
   * `validate()` ran only on Review and returned all thirteen errors at once,
   * including for fields the user had already corrected.
   */
  const {
    watch,
    setValue,
    reset,
    trigger,
    setError,
    formState: { errors },
  } = useForm<TrackerInvoiceInput>({
    resolver: zodResolver(trackerInvoiceSchema),
    defaultValues: { ...EMPTY },
    mode: "onTouched",
  });
  const form = watch();
  const [showForm, setShowForm] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [advRemarks, setAdvRemarks] = useState("");
  const [toast, setToast] = useState("");
  const [vendorOpen, setVendorOpen] = useState(false);
  const [delInv, setDelInv] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState(""); // "YYYY-MM" effective-month filter
  const [detailInv, setDetailInv] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  const doDelete = async () => {
    if (!delInv) return;
    setDeleting(true);
    try {
      await trackerService.deleteInvoice(delInv.id);
      flash(`Invoice ${delInv.invoice_number} deleted`);
      setDelInv(null);
      refresh();
    } catch (err) {
      flash(messageFrom(err, "Delete failed"));
    } finally {
      setDeleting(false);
    }
  };


  // Vendors matching the typed party name (client-side filter, capped).
  const vendorMatches = useMemo(() => {
    const q = form.party_name.trim().toLowerCase();
    if (!q) return vendors.slice(0, 50);
    return vendors
      .filter((v) => v.card_name.toLowerCase().includes(q) || v.card_code.toLowerCase().includes(q))
      .slice(0, 50);
  }, [vendors, form.party_name]);

  const pickVendor = (v: Vendor) => {
    setValue("party_name", v.card_name, { shouldValidate: true, shouldTouch: true });
    setValue("party_code", v.card_code);
    setValue("party_gstin", v.gstin);
    setVendorOpen(false);
  };

  /*
   * Re-read the queue. The `setSelected(new Set())` that used to live INSIDE
   * the fetch is kept here deliberately: every caller is a mutation, and a
   * bulk-advanced (now locked) row left checked is the bug that clearing it
   * prevents. A plain `invalidateQueries` would have dropped it silently.
   */
  const refresh = async () => {
    setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: ["tracker", "invoices"] });
  };

  // The head-office / entry desk is shared: show every invoice currently at the
  // entry stage (freshly created or returned back), regardless of creator.
  const mine = useMemo(
    () => myInvoices.filter((i) => i.current_stage_code === "entry"),
    [myInvoices],
  );
  // Omni search + effective-month filter over the head-office queue.
  const shownMine = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? mine.filter((i) => invMatch(i, q)) : mine;
    if (monthFilter) {
      list = list.filter((i) => (i.effective_month || "").slice(0, 7) === monthFilter);
    }
    return list;
  }, [mine, search, monthFilter]);

  const setField = (k: keyof TrackerInvoiceInput, v: string | number) =>
    setValue(k, v as never, { shouldValidate: true, shouldTouch: true });

  const onReview = async () => {
    // `trigger()` runs the same schema the resolver runs, so Review cannot
    // disagree with what the fields are already showing.
    if (await trigger()) setShowReview(true);
  };

  const onConfirm = async () => {
    setSaving(true);
    // Both shape differences (month widening, blank charge amount) live in
    // schemas/trackerInvoice.ts now, next to the rules that allow them.
    const payload: InvoiceWrite = toInvoicePayload(
      trackerInvoiceSchema.parse(form),
    ) as InvoiceWrite;
    try {
      if (editingId) {
        await trackerService.updateInvoice(editingId, payload);
        flash("Invoice updated");
      } else {
        await trackerService.createInvoice(payload);
        flash("Invoice created");
      }
      reset({ ...EMPTY });
      setEditingId(null);
      setShowReview(false);
      setShowForm(false);
      refresh();
    } catch (err) {
      // A duplicate invoice number is a SERVER rule, and it belongs on the
      // field that broke it rather than in a toast the user has to map back
      // to an input. Everything else falls through to the shared extractor.
      const duplicate = fieldError(errorBody(err), "invoice_number");
      if (duplicate) {
        setShowReview(false); // send them back to the form to fix it
        setError("invoice_number", { type: "server", message: duplicate });
      }
      flash(duplicate ?? messageFrom(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  // Row click -> open a read-only detail modal. Show the row immediately, then
  // enrich with the full detail (timeline + payment) from the API.
  const openDetail = async (inv: Invoice) => {
    setDetailInv(inv);
    setDetailLoading(true);
    try {
      const full = await trackerService.getInvoice(inv.id);
      setDetailInv(full);
    } catch {
      /* keep the row data we already have */
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    reset({ ...EMPTY });
    setShowForm(true);
  };

  const startEdit = (inv: Invoice) => {
    setEditingId(inv.id);
    reset({
      invoice_date: inv.invoice_date,
      // Stored as YYYY-MM-DD; the month input wants YYYY-MM.
      effective_month: (inv.effective_month || "").slice(0, 7),
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
    setShowForm(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    reset({ ...EMPTY });
    setShowForm(false);
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      // Statement, not an expression. A ternary evaluated for its side effects
      // reads as if its value mattered, and the linter flags it for exactly
      // that reason; both branches here are mutations.
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Selectable = still editable (unlocked at entry).
  const selectableIds = useMemo(
    () => shownMine.filter((i) => i.editable).map((i) => i.id),
    [shownMine],
  );
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
          (res.errors.length ? `, ${res.errors.length} failed` : ""),
      );
      refresh();
    } catch (err) {
      flash(messageFrom(err, "Advance failed"));
    }
  };

  const field = (key: keyof TrackerInvoiceInput, label: string, node: React.ReactNode) => {
    // Labels here are visual-only (no htmlFor/id): give the control an
    // accessible name that matches what's on screen, without touching layout.
    const labeledNode =
      isValidElement(node) && !(node.props as { "aria-label"?: string })["aria-label"]
        ? cloneElement(node as React.ReactElement<{ "aria-label"?: string }>, {
            "aria-label": label,
          })
        : node;
    return (
      <div className="trk-field">
        <label>{label}</label>
        {labeledNode}
        {errors[key] && <span className="trk-err">{errors[key]?.message}</span>}
      </div>
    );
  };

  const sel = (key: keyof TrackerInvoiceInput, options: { id: number; label: string }[]) => (
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
  const gstAmount = (taxableNum * gstRatePct) / 100;
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
      <Dialog
        open={Boolean(showForm)}
        onOpenChange={(next) => {
          if (!next) cancelEdit();
        }}
      >
        {showForm && (
          <DialogContent title="Invoice form">
            <DialogHeader>
              <DialogTitle>{editingId ? `Edit invoice #${editingId}` : "New invoice"}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="trk-form-grid">
                {field(
                  "invoice_date",
                  "Invoice Date",
                  <input
                    type="date"
                    value={form.invoice_date}
                    max={todayISO()}
                    onChange={(e) => setField("invoice_date", e.target.value)}
                  />,
                )}
                {field(
                  "effective_month",
                  "Effective Month",
                  <input
                    type="month"
                    value={form.effective_month}
                    onChange={(e) => setField("effective_month", e.target.value)}
                  />,
                )}
                {field(
                  "party_name",
                  "Party Name (search SAP vendors)",
                  <div className="trk-combo">
                    <input
                      value={form.party_name}
                      autoComplete="off"
                      aria-label="Party Name (search SAP vendors)"
                      placeholder={vendors.length ? "Type to search vendors…" : "Loading vendors…"}
                      onChange={(e) => {
                        setValue("party_name", e.target.value, {
                          shouldValidate: true,
                          shouldTouch: true,
                        });
                        // Typing over a picked vendor un-picks it: the code and GSTIN below
                        // belong to the name that was there before.
                        setValue("party_code", "");
                        setValue("party_gstin", "");
                        setVendorOpen(true);
                      }}
                      onFocus={() => setVendorOpen(true)}
                      onBlur={() => setTimeout(() => setVendorOpen(false), 150)}
                    />
                    {vendorOpen && vendors.length > 0 && (
                      <div className="trk-combo-list">
                        {vendorMatches.length === 0 ? (
                          <div className="trk-combo-empty">
                            No matching vendor — you can still type a name.
                          </div>
                        ) : (
                          vendorMatches.map((v) => (
                            <div
                              key={v.card_code}
                              className="trk-combo-item"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickVendor(v);
                              }}
                            >
                              <div>
                                {v.card_name}
                                {v.card_type && (
                                  <Badge
                                    outlined
                                    tone={v.card_type === "C" ? "ok" : "info"}
                                    className="trk-badge-mini"
                                  >
                                    {v.card_type === "C" ? "Customer" : "Vendor"}
                                  </Badge>
                                )}
                              </div>
                              <div>
                                <span className="code">
                                  {v.card_code}
                                  {v.state ? ` · ${v.state}` : ""}
                                </span>
                                {v.gstin && <span className="gst"> · {v.gstin}</span>}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>,
                )}
                <div className="trk-field">
                  <label>GST Number</label>
                  <input
                    value={form.party_gstin}
                    aria-label="GST Number"
                    readOnly
                    placeholder={form.party_code ? "" : "Auto-filled when a vendor is selected"}
                    className={`trk-ro${form.party_gstin ? "" : " trk-ro--faint"}`}
                  />
                </div>
                {field(
                  "invoice_number",
                  "Invoice Number",
                  <input
                    value={form.invoice_number}
                    onChange={(e) => setField("invoice_number", e.target.value)}
                  />,
                )}
                {field(
                  "taxable_value",
                  "Taxable Value",
                  <input
                    type="number"
                    step="0.01"
                    value={form.taxable_value}
                    onChange={(e) => setField("taxable_value", e.target.value)}
                  />,
                )}
                {field(
                  "gst_type",
                  "GST",
                  sel(
                    "gst_type",
                    lookups.gst_types.map((g) => ({ id: g.id, label: g.name })),
                  ),
                )}
                {field(
                  "gst_rate",
                  "Rate of GST",
                  sel(
                    "gst_rate",
                    lookups.gst_rates.map((g) => ({ id: g.id, label: g.label })),
                  ),
                )}
                <div className="trk-field">
                  <label>GST Amount</label>
                  <input
                    value={`₹ ${money(gstAmount)}`}
                    aria-label="GST Amount"
                    readOnly
                    className="trk-ro"
                  />
                </div>
                {field(
                  "additional_charge_type",
                  "Additional Charge (optional)",
                  <select
                    value={form.additional_charge_type}
                    onChange={(e) => setField("additional_charge_type", e.target.value)}
                  >
                    <option value="">None</option>
                    {ADDITIONAL_CHARGE_TYPES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>,
                )}
                {field(
                  "additional_charge_amount",
                  "Additional Charge Amount",
                  <input
                    type="number"
                    step="0.01"
                    value={form.additional_charge_amount}
                    disabled={!form.additional_charge_type}
                    placeholder={form.additional_charge_type ? "" : "Select a charge type first"}
                    onChange={(e) => setField("additional_charge_amount", e.target.value)}
                  />,
                )}
                <div className="trk-field">
                  <label>Invoice Value (auto)</label>
                  <input
                    value={`₹ ${money(invoiceValueCalc)}`}
                    aria-label="Invoice Value (auto)"
                    readOnly
                    className="trk-net"
                  />
                </div>
                {field(
                  "category",
                  "Category",
                  sel(
                    "category",
                    lookups.categories.map((c) => ({ id: c.id, label: c.name })),
                  ),
                )}
                {field(
                  "unit",
                  "Unit",
                  sel(
                    "unit",
                    lookups.units.map((u) => ({ id: u.id, label: u.name })),
                  ),
                )}
                {field(
                  "branch",
                  "Branch",
                  sel(
                    "branch",
                    lookups.branches.map((b) => ({ id: b.id, label: b.name })),
                  ),
                )}
                {field(
                  "mode",
                  "Mode of Invoice",
                  sel(
                    "mode",
                    lookups.modes.map((m) => ({ id: m.id, label: m.name })),
                  ),
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <button className="trk-btn trk-btn-ghost" onClick={cancelEdit}>
                Cancel
              </button>
              <button className="trk-btn trk-btn-primary" onClick={onReview}>
                <HiCheckCircle /> Review & {editingId ? "Update" : "Submit"}
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ---- Head office / entry queue (shared across entry users) ---- */}
      <div className="trk-card">
        <div className="trk-header trk-header--tight">
          <div>
            <h3 className="trk-heading-flush">Head Office Queue</h3>
            <div className="trk-sub">
              All invoices at the entry stage — created here or returned back — from any user.
            </div>
          </div>
          <div className="trk-row-gap">
            <div className="trk-search">
              <HiMagnifyingGlass className="trk-search-icon" />
              <input
                className="trk-search-input"
                placeholder="Search invoice no., party, GSTIN, category…"
                aria-label="Search invoice no., party, GSTIN, category"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="trk-field trk-field--flush">
              <input
                type="month"
                value={monthFilter}
                title="Filter by effective month"
                aria-label="Filter by effective month"
                onChange={(e) => setMonthFilter(e.target.value)}
              />
            </div>
            {monthFilter && (
              <button
                className="trk-btn trk-btn-ghost trk-btn--md"
                onClick={() => setMonthFilter("")}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="trk-actionbar">
            <span className="trk-count">{selected.size} selected</span>
            <input
              className="trk-remarks"
              placeholder="Remarks (optional)"
              aria-label="Remarks (optional)"
              value={advRemarks}
              onChange={(e) => setAdvRemarks(e.target.value)}
            />
            <button className="trk-btn trk-btn-success" onClick={bulkAdvance}>
              <HiPlusCircle /> Advance to next stage
            </button>
          </div>
        )}

        <div className="trk-table-wrap">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(selectableIds) : new Set())
                    }
                  />
                </TableHead>
                <TableHead>Invoice No.</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Inv. Date</TableHead>
                <TableHead>Eff. Month</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>State</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shownMine.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12}>
                    <div className="trk-empty">
                      {search.trim() || monthFilter
                        ? "No invoices match your filters."
                        : "No invoices yet."}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {shownMine.map((inv) => (
                <TableRow
                  key={inv.id}
                  className={`trk-clickable${
                    inv.is_overdue ? " trk-row-overdue" : inv.is_locked ? " trk-row-locked" : ""
                  }`}
                  title="Click to view full invoice details"
                  onClick={() => openDetail(inv)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {inv.editable ? (
                      <input
                        type="checkbox"
                        checked={selected.has(inv.id)}
                        onChange={() => toggle(inv.id)}
                      />
                    ) : (
                      <HiLockClosed title="Locked — advanced to next stage" color="#9ca3af" />
                    )}
                  </TableCell>
                  <TableCell>{inv.invoice_number}</TableCell>
                  <TableCell>{inv.party_name}</TableCell>
                  <TableCell>{fmtDate(inv.invoice_date)}</TableCell>
                  <TableCell>{fmtMonth(inv.effective_month)}</TableCell>
                  <TableCell>₹{money(inv.invoice_value)}</TableCell>
                  <TableCell>
                    {inv.gst_type_name} {inv.gst_rate_label}
                  </TableCell>
                  <TableCell>{inv.category_name}</TableCell>
                  <TableCell>{inv.created_by_name}</TableCell>
                  <TableCell>
                    <Badge outlined tone={inv.is_overdue ? "bad" : "neutral"}>
                      {inv.days_at_stage}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {inv.editable ? (
                      <Badge tone="hold" outlined>
                        Editable
                      </Badge>
                    ) : (
                      <Badge outlined>Locked</Badge>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {inv.editable && (
                      <div className="trk-row-actions">
                        <button
                          className="trk-btn trk-btn-ghost trk-btn--sm-wide"
                          onClick={() => startEdit(inv)}
                        >
                          <HiPencilSquare /> Edit
                        </button>
                        <button
                          className="trk-btn trk-btn-danger trk-btn--sm-wide"
                          title="Delete this invoice entry"
                          onClick={() => setDelInv(inv)}
                        >
                          <HiTrash /> Delete
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ---- Review modal ---- */}
      <Dialog
        open={Boolean(showReview)}
        onOpenChange={(next) => {
          if (!next) (() => setShowReview(false))();
        }}
      >
        {showReview && (
          <DialogContent title="Review before submitting">
            <DialogHeader>
              <DialogTitle>Review before {editingId ? "updating" : "submitting"}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="trk-review-grid">
                {[
                  ["Invoice Date", fmtDate(form.invoice_date)],
                  [
                    "Effective Month",
                    form.effective_month ? fmtMonth(`${form.effective_month}-01`) : "—",
                  ],
                  ["Party Name", form.party_name],
                  ["GST Number", form.party_gstin || "—"],
                  ["Invoice Number", form.invoice_number],
                  ["Taxable Value", `₹${money(form.taxable_value)}`],
                  ["GST", nameOf(form.gst_type, lookups.gst_types)],
                  ["Rate of GST", rateOf(form.gst_rate)],
                  ["GST Amount", `₹${money(gstAmount)}`],
                  [
                    "Additional Charge",
                    form.additional_charge_type
                      ? `${chargeLabel(form.additional_charge_type)} — ₹${money(addAmount)}`
                      : "None",
                  ],
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
            </DialogBody>
            <DialogFooter>
              <button className="trk-btn trk-btn-ghost" onClick={() => setShowReview(false)}>
                Go back & correct
              </button>
              <button className="trk-btn trk-btn-primary" onClick={onConfirm} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Confirm update" : "Confirm & submit"}
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={Boolean(delInv)}
        onOpenChange={(next) => {
          if (!next) (() => !deleting && setDelInv(null))();
        }}
      >
        {delInv && (
          <DialogContent title="Delete invoice">
            <DialogHeader>
              <DialogTitle>Delete invoice?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="trk-heading-flush">
                Delete invoice <b>{delInv.invoice_number}</b> — {delInv.party_name} (₹
                {money(delInv.invoice_value)})?
              </p>
              <p className="trk-sub trk-sub--top">
                It will be removed from the entry desk. This can only be done while the invoice is
                still at the entry stage.
              </p>
            </DialogBody>
            <DialogFooter>
              <button
                className="trk-btn trk-btn-ghost"
                disabled={deleting}
                onClick={() => setDelInv(null)}
              >
                Cancel
              </button>
              <button className="trk-btn trk-btn-danger" disabled={deleting} onClick={doDelete}>
                <HiTrash /> {deleting ? "Deleting…" : "Delete"}
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ---- Invoice detail (read-only) ---- */}
      <Dialog
        open={Boolean(detailInv)}
        onOpenChange={(next) => {
          if (!next) (() => setDetailInv(null))();
        }}
      >
        {detailInv && (
          <DialogContent title="Invoice detail">
            <DialogHeader>
              <DialogTitle>
                Invoice {detailInv.invoice_number}
                {detailLoading && <span className="trk-sub"> · loading…</span>}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="trk-review-grid">
                {[
                  ["Invoice Number", detailInv.invoice_number],
                  ["Invoice Date", fmtDate(detailInv.invoice_date)],
                  ["Effective Month", fmtMonth(detailInv.effective_month)],
                  ["Party Name", detailInv.party_name],
                  ["Party Code", detailInv.party_code || "—"],
                  ["GST Number", detailInv.party_gstin || "—"],
                  ["Taxable Value", `₹${money(detailInv.taxable_value)}`],
                  ["GST", `${detailInv.gst_type_name} ${detailInv.gst_rate_label}`],
                  ["GST Amount", `₹${money(detailInv.gst_amount)}`],
                  [
                    "Additional Charge",
                    detailInv.additional_charge_type
                      ? `${detailInv.additional_charge_type_display} — ₹${money(detailInv.additional_charge_amount)}`
                      : "None",
                  ],
                  ["Invoice Value", `₹${money(detailInv.invoice_value)}`],
                  ["Category", detailInv.category_name],
                  ["Unit", detailInv.unit_name],
                  ["Branch", detailInv.branch_name],
                  ["Mode", detailInv.mode_name],
                  ["Current Stage", detailInv.current_stage_name],
                  ["Status", detailInv.status === "COMPLETED" ? "Completed" : "In Progress"],
                  ["Days at Stage", detailInv.days_at_stage],
                  ["Created By", detailInv.created_by_name],
                  ["Created At", fmtDate(detailInv.created_at)],
                ].map(([k, v]) => (
                  <div className="trk-review-item" key={k}>
                    <span className="k">{k}</span>
                    <span className="v">{v || "-"}</span>
                  </div>
                ))}
              </div>

              {detailInv.events && detailInv.events.length > 0 && (
                <div className="trk-block-offset">
                  <h4 className="trk-heading-block">Stage Timeline</h4>
                  <div className="trk-table-wrap">
                    <Table density="compact">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Stage</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>By</TableHead>
                          <TableHead>Entered</TableHead>
                          <TableHead>Exited</TableHead>
                          <TableHead>Days</TableHead>
                          <TableHead>Remarks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailInv.events.map((ev) => (
                          <TableRow key={ev.id}>
                            <TableCell>{ev.stage_name}</TableCell>
                            <TableCell>{ev.event_type}</TableCell>
                            <TableCell>{ev.stage_status || "—"}</TableCell>
                            <TableCell>{ev.acted_by_name || "—"}</TableCell>
                            <TableCell>{fmtDate(ev.entered_at)}</TableCell>
                            <TableCell>{ev.exited_at ? fmtDate(ev.exited_at) : "—"}</TableCell>
                            <TableCell>{ev.days_spent ?? "—"}</TableCell>
                            <TableCell>{ev.remarks || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {detailInv.payment && (
                <div className="trk-block-offset">
                  <h4 className="trk-heading-block">Payment</h4>
                  <div className="trk-review-grid">
                    {[
                      ["Discount", `₹${money(detailInv.payment.discount_amount)}`],
                      ["TDS", `₹${money(detailInv.payment.tds_amount)}`],
                      ["Paid", `₹${money(detailInv.payment.paid_amount)}`],
                      ["Open Balance", `₹${money(detailInv.payment.open_balance)}`],
                      ["Status", detailInv.payment.status],
                    ].map(([k, v]) => (
                      <div className="trk-review-item" key={k}>
                        <span className="k">{k}</span>
                        <span className="v">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <button className="trk-btn trk-btn-ghost" onClick={() => setDetailInv(null)}>
                Close
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Toast message={toast} />
    </div>
  );
}
