import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineLockClosed,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi2";

import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DetailField, DetailGrid } from "@/components/ui/detail";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterBar, FilterCount, FilterDate, FilterSearch, FilterSpacer } from "@/components/ui/filter-bar";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, Page, PageHeader } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDate, fmtMonth, money, todayISO } from "@/components/tracker/format";
import InvoiceDetailDialog from "@/components/tracker/InvoiceDetailDialog";
import { errorBody, fieldError, messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { cn } from "@/lib/utils";
import {
  toInvoicePayload,
  trackerInvoiceSchema,
  type TrackerInvoiceInput,
} from "@/schemas/trackerInvoice";
import trackerService, { ADDITIONAL_CHARGE_TYPES } from "../services/trackerService";
import type { Invoice, InvoiceWrite, Vendor } from "../services/trackerService";

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
  const [vendorOpen, setVendorOpen] = useState(false);
  const [delInv, setDelInv] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState(""); // "YYYY-MM" effective-month filter
  const [detailInv, setDetailInv] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const flash = (title: string, message = "") => showToast({ title, message });

  const doDelete = async () => {
    if (!delInv) return;
    setDeleting(true);
    try {
      await trackerService.deleteInvoice(delInv.id);
      flash("Invoice deleted", `${delInv.invoice_number} is off the entry desk.`);
      setDelInv(null);
      refresh();
    } catch (err) {
      flash("Could not delete the invoice", messageFrom(err, "The server refused the request."));
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
        flash("Invoice updated", form.invoice_number);
      } else {
        await trackerService.createInvoice(payload);
        flash("Invoice created", form.invoice_number);
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
      flash("Could not save the invoice", duplicate ?? messageFrom(err, "The server refused the request."));
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
        `Advanced ${res.processed_count} invoice${res.processed_count === 1 ? "" : "s"}`,
        res.errors.length ? `${res.errors.length} failed.` : "They are now at the next stage.",
      );
      refresh();
    } catch (err) {
      flash("Could not advance", messageFrom(err, "The server refused the request."));
    }
  };

  /** A labelled control wired to the schema's error for that key. */
  const field = (
    key: keyof TrackerInvoiceInput,
    label: string,
    render: (control: {
      id: string;
      "aria-describedby": string | undefined;
      "aria-invalid": boolean | undefined;
      required: boolean;
    }) => React.ReactNode,
    span?: "full",
  ) => (
    <Field key={key} label={label} error={errors[key]?.message} span={span}>
      {render}
    </Field>
  );

  /** The id-valued selects: category, unit, branch, GST type and rate. */
  const sel = (key: keyof TrackerInvoiceInput, options: { id: number; label: string }[]) =>
    function SelectControl(control: {
      id: string;
      "aria-describedby": string | undefined;
      "aria-invalid": boolean | undefined;
    }) {
      return (
        <Select
          {...control}
          value={form[key] as number}
          onChange={(e) => setField(key, Number(e.target.value))}
        >
          <option value={0}>Select…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    };

  if (!lookups) {
    return (
      <Page>
        <Card>
          <TableSkeleton rows={5} columns={6} />
        </Card>
      </Page>
    );
  }

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

  const vendorOptions = vendorMatches.map((v) => ({
    value: v.card_code,
    label: v.card_name,
    hint: [v.card_code, v.state, v.gstin].filter(Boolean).join(" · "),
  }));

  const reviewRows: [string, string][] = [
    ["Invoice date", fmtDate(form.invoice_date)],
    ["Effective month", form.effective_month ? fmtMonth(`${form.effective_month}-01`) : "—"],
    ["Party name", form.party_name],
    ["GST number", form.party_gstin || "—"],
    ["Invoice number", form.invoice_number],
    ["Taxable value", `₹${money(form.taxable_value)}`],
    ["GST", nameOf(form.gst_type, lookups.gst_types)],
    ["Rate of GST", rateOf(form.gst_rate)],
    ["GST amount", `₹${money(gstAmount)}`],
    [
      "Additional charge",
      form.additional_charge_type
        ? `${chargeLabel(form.additional_charge_type)} — ₹${money(addAmount)}`
        : "None",
    ],
    ["Invoice value", `₹${money(invoiceValueCalc)}`],
    ["Category", nameOf(form.category, lookups.categories)],
    ["Unit", nameOf(form.unit, lookups.units)],
    ["Branch", nameOf(form.branch, lookups.branches)],
    ["Mode of invoice", nameOf(form.mode, lookups.modes)],
  ];

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Tracker" }, { label: "Invoice Entry" }]} />

      <PageHeader
        title="Invoice Entry"
        description="Create invoices, review before submitting, and advance them to the next stage."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <HiOutlinePlus aria-hidden="true" /> Add invoice
          </Button>
        }
      />

      {/* ---- Entry form (modal) ---- */}
      <Dialog
        open={showForm}
        onOpenChange={(next) => {
          if (!next) cancelEdit();
        }}
      >
        {showForm && (
          <DialogContent title="Invoice form" size="lg">
            <DialogHeader>
              <DialogTitle>{editingId ? `Edit invoice #${editingId}` : "New invoice"}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <FormGrid>
                {field("invoice_date", "Invoice date", (c) => (
                  <Input
                    {...c}
                    type="date"
                    value={form.invoice_date}
                    max={todayISO()}
                    onChange={(e) => setField("invoice_date", e.target.value)}
                  />
                ))}
                {field("effective_month", "Effective month", (c) => (
                  <Input
                    {...c}
                    type="month"
                    value={form.effective_month}
                    onChange={(e) => setField("effective_month", e.target.value)}
                  />
                ))}

                {/* The party is typed OR picked. It is not a plain SearchSelect:
                    an invoice may name a party SAP has never heard of, so the
                    free text is the value and the vendor list only fills the
                    code and GSTIN beside it. */}
                {field(
                  "party_name",
                  "Party name",
                  (c) => (
                    <div className="relative">
                      <Input
                        {...c}
                        value={form.party_name}
                        autoComplete="off"
                        placeholder={vendors.length ? "Type to search vendors…" : "Loading vendors…"}
                        onChange={(e) => {
                          setValue("party_name", e.target.value, {
                            shouldValidate: true,
                            shouldTouch: true,
                          });
                          // Typing over a picked vendor un-picks it: the code and
                          // GSTIN below belong to the name that was there before.
                          setValue("party_code", "");
                          setValue("party_gstin", "");
                          setVendorOpen(true);
                        }}
                        onFocus={() => setVendorOpen(true)}
                        onBlur={() => setTimeout(() => setVendorOpen(false), 150)}
                      />
                      {vendorOpen && vendors.length > 0 && (
                        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-64 overflow-y-auto rounded-card border border-line bg-card p-1 shadow-panel">
                          {vendorOptions.length === 0 ? (
                            <p className="m-0 px-2.5 py-3 text-center text-[12px] text-subtle">
                              No matching vendor — you can still type a name.
                            </p>
                          ) : (
                            vendorOptions.map((o) => (
                              <button
                                key={o.value}
                                type="button"
                                className="flex w-full appearance-none flex-col items-start gap-0.5 rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left [font-family:inherit] cursor-pointer hover:bg-surface"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const v = vendorMatches.find((m) => m.card_code === o.value);
                                  if (v) pickVendor(v);
                                }}
                              >
                                <span className="text-[13px] font-medium text-ink">{o.label}</span>
                                <span className="text-[11px] text-subtle">{o.hint}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ),
                )}

                <Field
                  label="GST number"
                  hint={form.party_code ? undefined : "Auto-filled when a vendor is picked."}
                >
                  {(c) => (
                    <Input
                      {...c}
                      value={form.party_gstin}
                      readOnly
                      className="bg-surface-strong text-body"
                    />
                  )}
                </Field>

                {field("invoice_number", "Invoice number", (c) => (
                  <Input
                    {...c}
                    value={form.invoice_number}
                    onChange={(e) => setField("invoice_number", e.target.value)}
                  />
                ))}
                {field("taxable_value", "Taxable value", (c) => (
                  <Input
                    {...c}
                    type="number"
                    step="0.01"
                    value={form.taxable_value}
                    onChange={(e) => setField("taxable_value", e.target.value)}
                  />
                ))}
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
                <Field label="GST amount">
                  {(c) => (
                    <Input
                      {...c}
                      value={`₹ ${money(gstAmount)}`}
                      readOnly
                      className="bg-surface-strong text-body"
                    />
                  )}
                </Field>
                {field("additional_charge_type", "Additional charge (optional)", (c) => (
                  <Select
                    {...c}
                    value={form.additional_charge_type}
                    onChange={(e) => setField("additional_charge_type", e.target.value)}
                  >
                    <option value="">None</option>
                    {ADDITIONAL_CHARGE_TYPES.map((ch) => (
                      <option key={ch.value} value={ch.value}>
                        {ch.label}
                      </option>
                    ))}
                  </Select>
                ))}
                {field("additional_charge_amount", "Additional charge amount", (c) => (
                  <Input
                    {...c}
                    type="number"
                    step="0.01"
                    value={form.additional_charge_amount}
                    disabled={!form.additional_charge_type}
                    placeholder={form.additional_charge_type ? "" : "Select a charge type first"}
                    onChange={(e) => setField("additional_charge_amount", e.target.value)}
                  />
                ))}
                <Field label="Invoice value (auto)">
                  {(c) => (
                    <Input
                      {...c}
                      value={`₹ ${money(invoiceValueCalc)}`}
                      readOnly
                      className="bg-brand-soft font-bold text-brand"
                    />
                  )}
                </Field>
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
                  "Mode of invoice",
                  sel(
                    "mode",
                    lookups.modes.map((m) => ({ id: m.id, label: m.name })),
                  ),
                )}
              </FormGrid>
            </DialogBody>
            <DialogFooter>
              <Button onClick={cancelEdit}>Cancel</Button>
              <Button variant="primary" onClick={() => void onReview()}>
                <HiOutlineCheckCircle aria-hidden="true" /> Review &amp;{" "}
                {editingId ? "update" : "submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ---- Head office / entry queue (shared across entry users) ---- */}
      <FilterBar>
        <FilterSearch
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Invoice no., party, GSTIN, category…"
          fieldClassName="min-w-[280px]"
        />
        <FilterDate
          label="Effective month"
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          fieldClassName="max-w-[200px]"
        />
        {monthFilter && (
          <Button variant="ghost" onClick={() => setMonthFilter("")}>
            Clear
          </Button>
        )}
        <FilterSpacer />
        <FilterCount>
          {shownMine.length} {shownMine.length === 1 ? "invoice" : "invoices"}
        </FilterCount>
      </FilterBar>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-brand-line bg-brand-soft/60 px-4 py-3">
          <span className="text-[13px] font-semibold text-ink">{selected.size} selected</span>
          <Input
            className="min-w-[220px] flex-1"
            placeholder="Remarks (optional)"
            aria-label="Remarks (optional)"
            value={advRemarks}
            onChange={(e) => setAdvRemarks(e.target.value)}
          />
          <Button variant="primary" onClick={() => void bulkAdvance()}>
            <HiOutlineArrowRight aria-hidden="true" /> Advance to next stage
          </Button>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <CardTitle>Head office queue</CardTitle>
            <p className="m-0 mt-0.5 text-[12.5px] text-subtle">
              All invoices at the entry stage — created here or returned back — from any user.
            </p>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer accent-brand"
                    aria-label="Select every editable invoice"
                    checked={allSelected}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(selectableIds) : new Set())
                    }
                  />
                </TableHead>
                <TableHead>Invoice No.</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Inv. date</TableHead>
                <TableHead>Eff. month</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shownMine.length === 0 ? (
                <TableEmpty colSpan={12}>
                  {search.trim() || monthFilter
                    ? "No invoices match these filters."
                    : "Nothing at the entry desk."}
                </TableEmpty>
              ) : (
                shownMine.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className={cn("cursor-pointer", !inv.editable && "opacity-70")}
                    title="Click to view full invoice details"
                    onClick={() => void openDetail(inv)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {inv.editable ? (
                        <input
                          type="checkbox"
                          className="size-4 cursor-pointer accent-brand"
                          aria-label={`Select invoice ${inv.invoice_number}`}
                          checked={selected.has(inv.id)}
                          onChange={() => toggle(inv.id)}
                        />
                      ) : (
                        <HiOutlineLockClosed
                          aria-label="Locked — advanced to the next stage"
                          className="size-4 text-subtle"
                        />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium text-ink">
                      {inv.invoice_number}
                    </TableCell>
                    <TableCell>{inv.party_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(inv.invoice_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmtMonth(inv.effective_month)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      ₹{money(inv.invoice_value)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
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
                      <Badge tone={inv.editable ? "hold" : "neutral"} outlined>
                        {inv.editable ? "Editable" : "Locked"}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-px" onClick={(e) => e.stopPropagation()}>
                      {inv.editable && (
                        <div className="flex flex-nowrap justify-end gap-1">
                          <Button variant="ghost" size="xs" onClick={() => startEdit(inv)}>
                            <HiOutlinePencilSquare aria-hidden="true" /> Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="xs"
                            title="Delete this invoice entry"
                            onClick={() => setDelInv(inv)}
                          >
                            <HiOutlineTrash aria-hidden="true" /> Delete
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ---- Review modal ---- */}
      <Dialog
        open={showReview}
        onOpenChange={(next) => {
          if (!next) setShowReview(false);
        }}
      >
        {showReview && (
          <DialogContent title="Review before submitting" size="lg">
            <DialogHeader>
              <DialogTitle>Review before {editingId ? "updating" : "submitting"}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <DetailGrid>
                {reviewRows.map(([label, value]) => (
                  <DetailField
                    key={label}
                    label={label}
                    value={value}
                    strong={label === "Invoice value"}
                  />
                ))}
              </DetailGrid>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setShowReview(false)}>Go back &amp; correct</Button>
              <Button variant="primary" onClick={() => void onConfirm()} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Confirm update" : "Confirm &amp; submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={Boolean(delInv)}
        onOpenChange={(next) => {
          if (!next && !deleting) setDelInv(null);
        }}
      >
        {delInv && (
          <DialogContent title="Delete invoice" size="sm">
            <DialogHeader>
              <DialogTitle>Delete {delInv.invoice_number}?</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-2 text-[13px] text-body">
              <p className="m-0">
                <strong className="font-semibold text-ink">{delInv.party_name}</strong> · ₹
                {money(delInv.invoice_value)}
              </p>
              <p className="m-0">
                It will be removed from the entry desk. This can only be done while the invoice is
                still at the entry stage.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button disabled={deleting} onClick={() => setDelInv(null)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={deleting} onClick={() => void doDelete()}>
                <HiOutlineTrash aria-hidden="true" /> {deleting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ---- Invoice detail (read-only) ---- */}
      <InvoiceDetailDialog
        invoice={detailInv}
        loading={detailLoading}
        onClose={() => setDetailInv(null)}
      />
    </Page>
  );
}
