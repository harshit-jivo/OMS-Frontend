import { useMemo, useState } from "react";
import {
  HiOutlineArrowPath,
  HiOutlineDocumentPlus,
  HiOutlineMagnifyingGlass,
  HiOutlinePaperClip,
  HiOutlinePencilSquare,
  HiOutlineXMark,
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
import {
  Checkbox,
  Field,
  FieldGroup,
  FormActions,
  FormGrid,
  Input,
} from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  Page,
  PageHeader,
} from "@/components/ui/page";
import { SegmentedControl } from "@/components/ui/segmented";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { showToast } from "@/lib/toastStore";
import { cn } from "@/lib/utils";
import apInvoiceService, {
  AP_BRANCHES,
  type ApBranch,
  type GrpoDetail,
  type GrpoSummary,
  type TdsCode,
} from "../services/apInvoiceService";

// Editable copy of a GRPO line: only quantity & unit_price can change; the rest
// is copied from the GRPO and shown read-only.
interface LineEdit {
  base_line: number;
  quantity: string;
  unit_price: string;
  orig_quantity: number | null;
  orig_unit_price: number | null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Ap_Invoice_Entry() {
  const [branch, setBranch] = useState<ApBranch>("OIL");

  // GRPO lookup
  const [docNumInput, setDocNumInput] = useState("");
  const [loadingGrpo, setLoadingGrpo] = useState(false);
  // The GRPO being loaded from the browse list, so its row can show a spinner
  // while the detail fetch is in flight — without it users re-click, thinking
  // nothing happened (the panel only closes once the fetch returns).
  const [selectingEntry, setSelectingEntry] = useState<number | null>(null);
  const [grpo, setGrpo] = useState<GrpoDetail | null>(null);

  // Browse-open-GRPOs panel
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseRows, setBrowseRows] = useState<GrpoSummary[]>([]);
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseLoading, setBrowseLoading] = useState(false);

  // Editable header fields
  // Labelled to match the SAP A/P invoice screen.
  const [numAtCard, setNumAtCard] = useState(""); // Vendor Ref. No. (NumAtCard)
  const [docDate, setDocDate] = useState(todayISO()); // Posting Date  (DocDate)
  const [taxDate, setTaxDate] = useState(todayISO()); // Document Date (TaxDate)
  const [dueDate, setDueDate] = useState(""); // Due Date      (DocDueDate)
  const [comments, setComments] = useState("");
  const [attachGrpoDoc, setAttachGrpoDoc] = useState(true);
  // Vendor invoice uploaded to SAP (Attachments2) at this step. When present it
  // supersedes reusing the GRPO's own attachment.
  const [uploadedEntry, setUploadedEntry] = useState<number | null>(null);
  const [uploadedName, setUploadedName] = useState("");
  const [uploading, setUploading] = useState(false);

  // TDS — the vendor's applicable WT codes, multi-select.
  const [tdsCodes, setTdsCodes] = useState<TdsCode[]>([]);
  const [tdsLiable, setTdsLiable] = useState(false);
  const [tdsSelected, setTdsSelected] = useState<string[]>([]);
  const [tdsApplicableOnly, setTdsApplicableOnly] = useState(true);
  const [vendorSubjectToWt, setVendorSubjectToWt] = useState(false);

  // Editable lines
  const [lines, setLines] = useState<LineEdit[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    doc_num: number;
    doc_total: number | null;
    is_draft?: boolean;
  } | null>(null);

  const flash = (title: string, message = "") => showToast({ title, message });

  /** The SAP-facing endpoints return their failure three different ways —
   *  `{error}`, `{detail}`, or a field-keyed dict — so the first value of the
   *  body is the last resort before axios's own message. */
  const readErr = (err: unknown) => {
    const axiosErr = err as {
      response?: { data?: { error?: string; detail?: string } & Record<string, unknown> };
      message?: string;
    };
    const data = axiosErr?.response?.data;
    return (
      data?.error ||
      data?.detail ||
      (data && (Object.values(data)[0] as string)) ||
      axiosErr?.message ||
      "Request failed"
    );
  };


  function resetForm() {
    setGrpo(null);
    setLines([]);
    setNumAtCard("");
    setDocDate(todayISO());
    setTaxDate(todayISO());
    setDueDate("");
    setComments("");
    setAttachGrpoDoc(true);
    setUploadedEntry(null);
    setUploadedName("");
    setUploading(false);
    setTdsLiable(false);
    setTdsSelected([]);
    setTdsApplicableOnly(true);
    setTdsCodes([]);
    setVendorSubjectToWt(false);
    setErrors({});
    setResult(null);
  }

  async function loadGrpo(key: { doc_entry?: number; doc_num?: number | string }) {
    if (loadingGrpo) return; // guard: ignore re-clicks while one load is in flight
    setLoadingGrpo(true);
    setSelectingEntry(key.doc_entry ?? null);
    setResult(null);
    try {
      const g = await apInvoiceService.getGrpo(branch, key);
      setGrpo(g);
      setLines(
        g.lines.map((l) => ({
          base_line: l.base_line,
          quantity: l.quantity != null ? String(l.quantity) : "",
          unit_price: l.unit_price != null ? String(l.unit_price) : "",
          orig_quantity: l.quantity,
          orig_unit_price: l.unit_price,
        })),
      );
      setAttachGrpoDoc(g.attachment_entry != null);
      // Default the Vendor Ref. No. from the GRPO; stays editable so the user
      // can replace it with the number actually printed on the invoice.
      setNumAtCard(g.grpo_num_at_card ?? "");
      setBrowseOpen(false);
      // vendor TDS (best-effort; failure just means an empty dropdown)
      try {
        const t = await apInvoiceService.getVendorTds(branch, g.card_code);
        setTdsCodes(t.tds_codes);
        setTdsApplicableOnly(t.applicable_only);
        setVendorSubjectToWt(!!t.vendor.subject_to_wt);
        const preset = t.vendor.default_wt_code;
        if (t.vendor.subject_to_wt && preset) {
          setTdsLiable(true);
          // Pre-tick the vendor's default code, but only if it is on offer.
          setTdsSelected(t.tds_codes.some((c) => c.wt_code === preset) ? [preset] : []);
        }
      } catch {
        setTdsCodes([]);
        setTdsApplicableOnly(true);
      }
    } catch (err) {
      setGrpo(null);
      flash("Could not load the GRPO", readErr(err));
    } finally {
      setLoadingGrpo(false);
      setSelectingEntry(null);
    }
  }

  /** Upload the chosen vendor-invoice file to SAP; on success we hold its
   *  AttachmentEntry to send with the draft. */
  async function onUploadAttachment(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setErrors((e) => ({ ...e, attachment: "" }));
    try {
      const res = await apInvoiceService.uploadAttachment(branch, file);
      setUploadedEntry(res.attachment_entry);
      setUploadedName(res.file_name);
      setAttachGrpoDoc(false); // the uploaded file supersedes the GRPO's copy
      flash("Attachment uploaded", res.file_name);
    } catch (err) {
      setUploadedEntry(null);
      setUploadedName("");
      setErrors((e) => ({ ...e, attachment: readErr(err) }));
    } finally {
      setUploading(false);
    }
  }

  const onFetch = (e: React.FormEvent) => {
    e.preventDefault();
    const n = docNumInput.trim();
    if (!/^\d+$/.test(n)) {
      setErrors({ docNum: "Enter a valid numeric GRPO Doc Number." });
      return;
    }
    setErrors({});
    loadGrpo({ doc_num: n });
  };

  async function openBrowse() {
    setBrowseOpen(true);
    setBrowseLoading(true);
    try {
      setBrowseRows(await apInvoiceService.listOpenGrpos(branch, { search: browseSearch.trim() }));
    } catch (err) {
      flash("Could not list open GRPOs", readErr(err));
    } finally {
      setBrowseLoading(false);
    }
  }

  const setLineField = (baseLine: number, field: "quantity" | "unit_price", value: string) =>
    setLines((ls) => ls.map((l) => (l.base_line === baseLine ? { ...l, [field]: value } : l)));

  // Estimated total (qty x price, pre-tax) — SAP computes the authoritative one.
  const estTotal = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const q = parseFloat(l.quantity);
        const p = parseFloat(l.unit_price);
        return sum + (isFinite(q) && isFinite(p) ? q * p : 0);
      }, 0),
    [lines],
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!numAtCard.trim()) e.numAtCard = "Vendor Ref. No. is required.";
    if (tdsLiable && tdsSelected.length === 0)
      e.tdsCode = "Select at least one TDS code, or turn TDS off.";
    lines.forEach((l) => {
      if (l.quantity !== "" && !(parseFloat(l.quantity) > 0))
        e[`q_${l.base_line}`] = "Qty must be > 0";
      if (l.unit_price !== "" && !(parseFloat(l.unit_price) >= 0))
        e[`p_${l.base_line}`] = "Bad price";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const onReview = () => {
    if (validate()) setShowReview(true);
  };

  async function onConfirm() {
    if (!grpo) return;
    setSubmitting(true);
    try {
      const payloadLines = lines.map((l) => {
        // Only the changed fields travel, so the row is built up key by key.
        const row: { base_line: number; quantity?: number; unit_price?: number } = {
          base_line: l.base_line,
        };
        // Send an override only when the user actually changed the value.
        if (l.quantity !== "" && parseFloat(l.quantity) !== l.orig_quantity)
          row.quantity = parseFloat(l.quantity);
        if (l.unit_price !== "" && parseFloat(l.unit_price) !== l.orig_unit_price)
          row.unit_price = parseFloat(l.unit_price);
        return row;
      });

      const res = await apInvoiceService.createApInvoice(branch, {
        grpo_entry: grpo.doc_entry,
        card_code: grpo.card_code,
        num_at_card: numAtCard.trim(),
        doc_date: docDate || undefined,
        tax_date: taxDate || undefined,
        due_date: dueDate || undefined,
        comments: comments.trim() || undefined,
        attachment_entry: uploadedEntry ?? (attachGrpoDoc ? grpo.attachment_entry : null),
        tds:
          tdsLiable && tdsSelected.length ? { liable: true, wt_codes: tdsSelected } : undefined,
        lines: payloadLines,
      });

      setShowReview(false);
      // Reset FIRST, then set the result: resetForm() clears `result`, so doing
      // it afterwards is what wiped the banner and hid the draft number.
      resetForm();
      setDocNumInput("");
      setResult({ doc_num: res.doc_num, doc_total: res.doc_total, is_draft: res.is_draft });
      flash(
        res.is_draft
          ? `AP invoice draft ${res.doc_num} created`
          : `AP invoice ${res.doc_num} created`,
        `In ${branchLabel}.`,
      );
    } catch (err) {
      setShowReview(false);
      flash("Could not submit the draft", readErr(err));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Route access: now decided once, in components/ProtectedPage.tsx ───────
  // Commented out rather than removed. It asked the right question — the same
  // `trackerPagesFor` the route table asks — but answered it from a raw
  // `localStorage` read, so `isAdmin` was true only for a user whose PRIMARY
  // role is literally "admin": a superuser, a staff account, or an admin held
  // through `extra_roles` was bounced off a page the server would have served.
  //
  //   const role = localStorage.getItem("role");
  //   const isAdmin = (role || "").toLowerCase() === "admin";
  //   const allowed = trackerPagesFor(role, isAdmin).has("Ap_Invoice_Entry");
  //   // Placed after every hook so the hook order stays stable (rules of hooks).
  //   if (!allowed) return <Navigate to="/Dashboard" replace />;
  //
  // `auth/routeAccess.ts` maps this path to `trackerPage: "Ap_Invoice_Entry"`,
  // which reaches the same `trackerPagesFor` through the session rather than
  // through storage. The backend still enforces it for real, via IsTrackerAP.

  const branchLabel = AP_BRANCHES.find((b) => b.value === branch)?.label ?? branch;
  const money = (n: number | null | undefined) =>
    n == null
      ? "—"
      : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Tracker" }, { label: "AP Invoice Entry" }]} />

      <PageHeader
        title="AP Invoice Entry"
        description="Raise a vendor (A/P) invoice by copying an open GRPO. Everything but the vendor invoice number, the dates and the line quantities is copied from the GRPO."
      />

      {/* ---- Company + GRPO lookup ------------------------------------------ */}
      <Card className="space-y-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={onFetch}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id="ap-company-label" className="text-[12px] font-medium text-body">
              Company
            </span>
            {/* A GRPO belongs to ONE company, and the same DocNum exists in all
                three meaning a different document — so this is a form value,
                not a tab. See ui/segmented. */}
            <SegmentedControl
              aria-labelledby="ap-company-label"
              value={branch}
              onChange={(next) => {
                setBranch(next);
                // Switching company clears the form and the browse list. This
                // was an effect on `[branch]` firing thirteen setters — pure
                // derived-state-from-state, and the only suppression on it was
                // `exhaustive-deps`, which does not cover that.
                resetForm();
                setBrowseRows([]);
              }}
              options={AP_BRANCHES.map((b) => ({ value: b.value, label: b.label }))}
            />
          </div>

          <Field
            label="Goods Receipt PO No."
            error={errors.docNum}
            className="min-w-[220px] flex-1 basis-[220px]"
          >
            {(c) => (
              <Input
                {...c}
                inputMode="numeric"
                placeholder="e.g. 2026086654"
                value={docNumInput}
                onChange={(e) => setDocNumInput(e.target.value)}
                autoComplete="off"
              />
            )}
          </Field>

          <div className={cn("flex shrink-0 gap-1.5", errors.docNum && "self-start pt-[22px]")}>
            <Button type="submit" variant="primary" disabled={loadingGrpo}>
              <HiOutlineMagnifyingGlass aria-hidden="true" />{" "}
              {loadingGrpo ? "Fetching…" : "Fetch GRPO"}
            </Button>
            <Button type="button" onClick={() => void openBrowse()}>
              Browse open GRPOs
            </Button>
          </div>
        </form>

        {browseOpen && (
          <div className="space-y-3 rounded-md border border-line bg-surface p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Input
                type="search"
                className="min-w-[240px] flex-1"
                placeholder="Search DocNum or vendor invoice no…"
                aria-label="Search DocNum or vendor invoice no"
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void openBrowse()}
              />
              <Button type="button" onClick={() => void openBrowse()} disabled={browseLoading}>
                <HiOutlineArrowPath aria-hidden="true" /> Refresh
              </Button>
              <Button type="button" variant="ghost" onClick={() => setBrowseOpen(false)}>
                <HiOutlineXMark aria-hidden="true" /> Close
              </Button>
            </div>

            <div
              className={cn(
                "max-h-[360px] overflow-auto rounded-sm border border-line bg-card",
                loadingGrpo && "pointer-events-none opacity-55",
              )}
            >
              {browseLoading ? (
                <TableSkeleton rows={4} columns={5} />
              ) : (
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead>DocNum</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Vendor inv#</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {browseRows.length === 0 ? (
                      <TableEmpty colSpan={5}>
                        No open GRPOs in {branchLabel}
                        {browseSearch.trim() ? " match that search." : "."}
                      </TableEmpty>
                    ) : (
                      browseRows.map((r) => (
                        <TableRow key={r.doc_entry}>
                          <TableCell className="font-medium text-ink">{r.doc_num}</TableCell>
                          <TableCell>
                            <span className="font-medium text-ink">{r.card_name}</span>
                            <span className="mt-0.5 block text-[11px] text-subtle">
                              {r.card_code}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {money(r.doc_total)} {r.currency}
                          </TableCell>
                          <TableCell>{r.num_at_card || "—"}</TableCell>
                          <TableCell className="w-px text-right">
                            <Button
                              size="xs"
                              type="button"
                              disabled={loadingGrpo}
                              aria-busy={selectingEntry === r.doc_entry}
                              onClick={() => void loadGrpo({ doc_entry: r.doc_entry })}
                            >
                              {selectingEntry === r.doc_entry ? (
                                <>
                                  <HiOutlineArrowPath
                                    aria-hidden="true"
                                    className="size-3.5 animate-spin"
                                  />
                                  Loading…
                                </>
                              ) : (
                                "Select"
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ---- Success banner ------------------------------------------------- */}
      {result && (
        <Notice tone="ok">
          {result.is_draft ? (
            <>
              AP invoice{" "}
              <strong className="font-semibold">draft No. {result.doc_num}</strong> created in{" "}
              {branchLabel} — total {money(result.doc_total)}. It now awaits approval in SAP.
            </>
          ) : (
            <>
              AP invoice <strong className="font-semibold">{result.doc_num}</strong> created in{" "}
              {branchLabel} — total {money(result.doc_total)}.
            </>
          )}
        </Notice>
      )}

      {/* ---- Entry form (once a GRPO is loaded) ----------------------------- */}
      {!grpo ? (
        <Card>
          <EmptyState
            icon={HiOutlineDocumentPlus}
            title="No GRPO loaded"
            hint="Fetch one by Doc Number, or browse the open GRPOs for this company."
          />
        </Card>
      ) : (
        <>
          <Card className="space-y-5">
            <CardHeader>
              <CardTitle>
                Copied from GRPO {grpo.doc_num}
              </CardTitle>
              <Badge tone="neutral">{branchLabel}</Badge>
            </CardHeader>

            <DetailGrid>
              <DetailField
                label="Vendor"
                value={`${grpo.card_name} (${grpo.card_code})`}
              />
              <DetailField
                label="Doc. Total (GRPO)"
                value={`${money(grpo.doc_total)} ${grpo.currency}`}
                strong
              />
            </DetailGrid>

            {/* Editable header fields */}
            <FormGrid>
              <Field
                label="Vendor Ref. No."
                required
                error={errors.numAtCard}
                hint="Defaulted from the GRPO — replace it with the number on the vendor's invoice."
              >
                {(c) => (
                  <Input
                    {...c}
                    value={numAtCard}
                    onChange={(e) => setNumAtCard(e.target.value)}
                    placeholder="The number on the vendor's invoice"
                  />
                )}
              </Field>
              <Field label="Document Date" hint="Date on the vendor's invoice (SAP TaxDate).">
                {(c) => (
                  <Input
                    {...c}
                    type="date"
                    max={todayISO()}
                    value={taxDate}
                    onChange={(e) => setTaxDate(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Posting Date" hint="Accounting / GL date (SAP DocDate).">
                {(c) => (
                  <Input
                    {...c}
                    type="date"
                    max={todayISO()}
                    value={docDate}
                    onChange={(e) => setDocDate(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Due Date" hint="Payment due date (SAP DocDueDate).">
                {(c) => (
                  <Input
                    {...c}
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Remarks" span="full">
                {(c) => (
                  <Input
                    {...c}
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Optional note on the invoice"
                  />
                )}
              </Field>
            </FormGrid>

            {/* TDS + attachment */}
            <div className="space-y-4 border-t border-line pt-4">
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                <Checkbox
                  label={
                    <span className="inline-flex items-center gap-2">
                      Apply TDS / withholding
                      {vendorSubjectToWt && <Badge tone="hold">vendor is WT-liable</Badge>}
                    </span>
                  }
                  checked={tdsLiable}
                  onChange={(e) => setTdsLiable(e.target.checked)}
                />
              </div>

              {/* Only the codes SAP has assigned to this vendor, and more than
                  one may apply — SAP enforces the vendor's list on post, so a
                  free choice from the whole master invited a rejection the user
                  could not have predicted. */}
              {tdsLiable && (
                <FieldGroup
                  legend="TDS codes"
                  hint={
                    tdsApplicableOnly
                      ? "Assigned to this vendor — tick every code that applies."
                      : "This vendor has no codes assigned, so all active codes are listed."
                  }
                >
                  {tdsCodes.length === 0 ? (
                    <p className="m-0 text-[12.5px] text-subtle">
                      No withholding tax codes available for this vendor.
                    </p>
                  ) : (
                    <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                      {tdsCodes.map((t) => (
                        <Checkbox
                          key={t.wt_code}
                          label={
                            <span>
                              <span className="font-semibold">{t.wt_code}</span>
                              {t.wt_name ? ` — ${t.wt_name}` : ""}
                              {t.rate != null ? ` (${t.rate}%` : ""}
                              {t.rate != null && t.section ? `, ${t.section})` : t.rate != null ? ")" : ""}
                            </span>
                          }
                          checked={tdsSelected.includes(t.wt_code)}
                          onChange={(e) =>
                            setTdsSelected((prev) =>
                              e.target.checked
                                ? [...prev, t.wt_code]
                                : prev.filter((c) => c !== t.wt_code),
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                  {errors.tdsCode && (
                    <p className="mt-2 mb-0 text-[12px] text-danger">{errors.tdsCode}</p>
                  )}
                </FieldGroup>
              )}

              {/* The vendor invoice is uploaded HERE, at the AP-entry step, the
                  same as in the SAP client. It becomes a SAP Attachments2 row
                  whose AttachmentEntry travels with the draft. */}
              <FieldGroup
                legend="Vendor invoice attachment"
                hint="Uploaded straight into SAP. An uploaded file replaces the GRPO's own document."
              >
                {uploadedEntry != null ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-md border border-ok bg-ok-soft px-3 py-2">
                    <HiOutlinePaperClip aria-hidden="true" className="size-4 shrink-0 text-ok" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {uploadedName}
                    </span>
                    <Badge tone="ok">uploaded to SAP</Badge>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={uploading}
                      onClick={() => {
                        setUploadedEntry(null);
                        setUploadedName("");
                      }}
                    >
                      <HiOutlineXMark aria-hidden="true" /> Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      type="file"
                      aria-label="Vendor invoice file"
                      className="max-w-sm file:mr-3 file:rounded-sm file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-[12px] file:font-semibold file:text-brand"
                      disabled={uploading}
                      accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.xls,.xlsx,.txt,.eml,.msg"
                      onChange={(e) => {
                        void onUploadAttachment(e.target.files?.[0]);
                        e.target.value = ""; // allow re-picking the same file
                      }}
                    />
                    {uploading && (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-subtle">
                        <HiOutlineArrowPath aria-hidden="true" className="size-4 animate-spin" />
                        Uploading to SAP…
                      </span>
                    )}
                  </div>
                )}
                {errors.attachment && (
                  <p className="mt-2 mb-0 text-[12px] text-danger">{errors.attachment}</p>
                )}

                <div className="mt-3 border-t border-line pt-3">
                  <Checkbox
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <HiOutlinePaperClip aria-hidden="true" className="size-4" />
                        Or reuse the GRPO&rsquo;s document
                      </span>
                    }
                    hint={
                      grpo.attachment_entry == null
                        ? "This GRPO has no attachment."
                        : uploadedEntry != null
                          ? "Superseded by the uploaded file."
                          : undefined
                    }
                    checked={attachGrpoDoc && uploadedEntry == null}
                    disabled={grpo.attachment_entry == null || uploadedEntry != null}
                    onChange={(e) => setAttachGrpoDoc(e.target.checked)}
                  />
                </div>
              </FieldGroup>
            </div>
          </Card>

          {/* Lines: copied fields read-only, qty & price editable */}
          <Card className="overflow-hidden p-0">
            <CardHeader className="mb-0 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <CardTitle>Lines</CardTitle>
                <p className="m-0 mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] text-subtle">
                  <HiOutlinePencilSquare aria-hidden="true" className="size-3.5" />
                  Quantity and unit price are editable for short or over-billing; everything else
                  is copied.
                </p>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Whse</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Line est.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => {
                    const src = grpo.lines.find((x) => x.base_line === l.base_line)!;
                    const q = parseFloat(l.quantity);
                    const p = parseFloat(l.unit_price);
                    const lineEst = isFinite(q) && isFinite(p) ? q * p : null;
                    const qtyErr = errors[`q_${l.base_line}`];
                    const priceErr = errors[`p_${l.base_line}`];
                    return (
                      <TableRow key={l.base_line}>
                        <TableCell className="whitespace-nowrap font-medium text-ink">
                          {src.item_code}
                        </TableCell>
                        <TableCell>{src.item_description}</TableCell>
                        <TableCell>{src.warehouse_code}</TableCell>
                        <TableCell>{src.tax_code}</TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <Input
                              className="h-control-sm w-24 text-right"
                              aria-label={`Quantity for ${src.item_code}`}
                              aria-invalid={qtyErr ? true : undefined}
                              inputMode="decimal"
                              value={l.quantity}
                              onChange={(e) =>
                                setLineField(l.base_line, "quantity", e.target.value)
                              }
                            />
                            {src.uom && <span className="text-[11px] text-subtle">{src.uom}</span>}
                          </span>
                          {qtyErr && (
                            <span className="mt-0.5 block text-[11px] text-danger">{qtyErr}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="h-control-sm w-28 text-right"
                            aria-label={`Unit price for ${src.item_code}`}
                            aria-invalid={priceErr ? true : undefined}
                            inputMode="decimal"
                            value={l.unit_price}
                            onChange={(e) =>
                              setLineField(l.base_line, "unit_price", e.target.value)
                            }
                          />
                          {priceErr && (
                            <span className="mt-0.5 block text-[11px] text-danger">{priceErr}</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {lineEst == null ? "—" : money(lineEst)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={6} className="text-right font-semibold text-ink">
                      Estimated (pre-tax)
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-bold tabular-nums text-ink">
                      {money(estTotal)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <FormActions className="px-4 pb-4">
              <Button
                type="button"
                onClick={() => {
                  resetForm();
                  setDocNumInput("");
                }}
              >
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={onReview}>
                Review &amp; submit
              </Button>
            </FormActions>
          </Card>
        </>
      )}

      {/* ---- Review modal --------------------------------------------------- */}
      <Dialog
        open={Boolean(showReview && grpo)}
        onOpenChange={(next) => {
          if (!next && !submitting) setShowReview(false);
        }}
      >
        {showReview && grpo && (
          <DialogContent title="Confirm A/P invoice draft">
            <DialogHeader>
              <DialogTitle>Confirm A/P invoice draft</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <DetailGrid>
                <DetailField label="Company" value={branchLabel} />
                <DetailField label="Vendor" value={`${grpo.card_name} (${grpo.card_code})`} />
                <DetailField label="From GRPO" value={grpo.doc_num} />
                <DetailField label="Vendor Ref. No." value={numAtCard} />
                <DetailField label="Document Date" value={taxDate || "—"} />
                <DetailField label="Posting Date" value={docDate || "—"} />
                <DetailField label="Due Date" value={dueDate || "—"} />
                <DetailField
                  label="TDS"
                  value={tdsLiable && tdsSelected.length ? tdsSelected.join(", ") : "None"}
                />
                <DetailField
                  label="Attachment"
                  value={
                    uploadedEntry != null
                      ? uploadedName
                      : attachGrpoDoc && grpo.attachment_entry != null
                        ? "GRPO document"
                        : "None"
                  }
                />
                <DetailField label="Lines" value={lines.length} />
                <DetailField
                  label="Estimated (pre-tax)"
                  value={`${money(estTotal)} ${grpo.currency}`}
                  strong
                />
              </DetailGrid>
              <Notice tone="info">
                SAP computes the final tax and total from the GRPO. This is submitted as a{" "}
                <strong className="font-semibold">draft</strong> for approval — the GRPO closes
                only once the draft is approved and added in SAP.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setShowReview(false)} disabled={submitting}>
                Back
              </Button>
              <Button variant="primary" onClick={() => void onConfirm()} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit draft"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
