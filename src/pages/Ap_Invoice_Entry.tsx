import { useEffect, useMemo, useState } from "react";
import {
  HiMagnifyingGlass,
  HiArrowPath,
  HiCheckCircle,
  HiPaperClip,
  HiPencilSquare,
  HiXMark,
} from "react-icons/hi2";
import apInvoiceService, {
  AP_BRANCHES,
  type ApBranch,
  type GrpoDetail,
  type GrpoSummary,
  type TdsCode,
} from "../services/apInvoiceService";
import "../styles/Ap_Invoice_Entry.css";

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
  const [grpo, setGrpo] = useState<GrpoDetail | null>(null);

  // Browse-open-GRPOs panel
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseRows, setBrowseRows] = useState<GrpoSummary[]>([]);
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseLoading, setBrowseLoading] = useState(false);

  // Editable header fields
  const [numAtCard, setNumAtCard] = useState("");
  const [docDate, setDocDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [comments, setComments] = useState("");
  const [attachGrpoDoc, setAttachGrpoDoc] = useState(true);

  // TDS
  const [tdsCodes, setTdsCodes] = useState<TdsCode[]>([]);
  const [tdsLiable, setTdsLiable] = useState(false);
  const [tdsCode, setTdsCode] = useState("");
  const [vendorSubjectToWt, setVendorSubjectToWt] = useState(false);

  // Editable lines
  const [lines, setLines] = useState<LineEdit[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [result, setResult] = useState<{ doc_num: number; doc_total: number | null } | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(""), 3200);
  };

  const readErr = (err: any) =>
    err?.response?.data?.error ||
    err?.response?.data?.detail ||
    (err?.response?.data && Object.values(err.response.data)[0]) ||
    err?.message ||
    "Request failed";

  // ---- reset when the company changes (a GRPO belongs to one company) -------
  useEffect(() => {
    resetForm();
    setBrowseRows([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  function resetForm() {
    setGrpo(null);
    setLines([]);
    setNumAtCard("");
    setDocDate(todayISO());
    setDueDate("");
    setComments("");
    setAttachGrpoDoc(true);
    setTdsLiable(false);
    setTdsCode("");
    setTdsCodes([]);
    setVendorSubjectToWt(false);
    setErrors({});
    setResult(null);
  }

  async function loadGrpo(key: { doc_entry?: number; doc_num?: number | string }) {
    setLoadingGrpo(true);
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
        }))
      );
      setAttachGrpoDoc(g.attachment_entry != null);
      setBrowseOpen(false);
      // vendor TDS (best-effort; failure just means an empty dropdown)
      try {
        const t = await apInvoiceService.getVendorTds(branch, g.card_code);
        setTdsCodes(t.tds_codes);
        setVendorSubjectToWt(!!t.vendor.subject_to_wt);
        if (t.vendor.subject_to_wt && t.vendor.default_wt_code) {
          setTdsLiable(true);
          setTdsCode(t.vendor.default_wt_code);
        }
      } catch {
        setTdsCodes([]);
      }
    } catch (err) {
      setGrpo(null);
      flash(readErr(err));
    } finally {
      setLoadingGrpo(false);
    }
  }

  const onFetch = (e: React.FormEvent) => {
    e.preventDefault();
    const n = docNumInput.trim();
    if (!/^\d+$/.test(n)) {
      flash("Enter a valid numeric GRPO Doc Number.");
      return;
    }
    loadGrpo({ doc_num: n });
  };

  async function openBrowse() {
    setBrowseOpen(true);
    setBrowseLoading(true);
    try {
      setBrowseRows(await apInvoiceService.listOpenGrpos(branch, { search: browseSearch.trim() }));
    } catch (err) {
      flash(readErr(err));
    } finally {
      setBrowseLoading(false);
    }
  }

  const setLineField = (baseLine: number, field: "quantity" | "unit_price", value: string) =>
    setLines((ls) =>
      ls.map((l) => (l.base_line === baseLine ? { ...l, [field]: value } : l))
    );

  // Estimated total (qty x price, pre-tax) — SAP computes the authoritative one.
  const estTotal = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const q = parseFloat(l.quantity);
        const p = parseFloat(l.unit_price);
        return sum + (isFinite(q) && isFinite(p) ? q * p : 0);
      }, 0),
    [lines]
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!numAtCard.trim()) e.numAtCard = "Vendor invoice number is required.";
    if (tdsLiable && !tdsCode) e.tdsCode = "Choose a TDS code, or turn TDS off.";
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
        const row: any = { base_line: l.base_line };
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
        due_date: dueDate || undefined,
        comments: comments.trim() || undefined,
        attachment_entry: attachGrpoDoc ? grpo.attachment_entry : null,
        tds: tdsLiable && tdsCode ? { liable: true, wt_code: tdsCode } : undefined,
        lines: payloadLines,
      });

      setShowReview(false);
      setResult({ doc_num: res.doc_num, doc_total: res.doc_total });
      flash(`AP invoice ${res.doc_num} created.`);
      resetForm();
      setDocNumInput("");
    } catch (err) {
      setShowReview(false);
      flash(readErr(err));
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
    n == null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="ap-page">
      <div className="ap-header">
        <div>
          <h1 className="ap-title">AP Invoice Entry</h1>
          <p className="ap-sub">
            Raise a vendor (A/P) invoice by copying an open GRPO. Grey fields are
            copied from the GRPO; only the highlighted fields are yours to edit.
          </p>
        </div>
      </div>

      {/* ---- Company + GRPO lookup ------------------------------------------ */}
      <div className="ap-card">
        <div className="ap-lookup">
          <div className="ap-field ap-field-branch">
            <span className="ap-label">Company</span>
            <div className="ap-segmented" role="radiogroup" aria-label="Company">
              {AP_BRANCHES.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  role="radio"
                  aria-checked={branch === b.value}
                  className={`ap-segment${branch === b.value ? " ap-segment-active" : ""}`}
                  onClick={() => setBranch(b.value)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <form className="ap-field ap-grow" onSubmit={onFetch}>
            <label className="ap-label" htmlFor="ap-docnum">
              GRPO Doc Number
            </label>
            <div className="ap-inline">
              <input
                id="ap-docnum"
                className="ap-input"
                inputMode="numeric"
                placeholder="e.g. 2026086654"
                value={docNumInput}
                onChange={(e) => setDocNumInput(e.target.value)}
                autoComplete="off"
              />
              <button className="ap-btn ap-btn-primary" type="submit" disabled={loadingGrpo}>
                <HiMagnifyingGlass aria-hidden /> {loadingGrpo ? "Fetching…" : "Fetch GRPO"}
              </button>
              <button type="button" className="ap-btn ap-btn-ghost" onClick={openBrowse}>
                Browse open GRPOs
              </button>
            </div>
          </form>
        </div>

        {browseOpen && (
          <div className="ap-browse">
            <div className="ap-inline">
              <input
                className="ap-input"
                placeholder="Search DocNum or vendor invoice no…"
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && openBrowse()}
              />
              <button className="ap-btn ap-btn-ghost" type="button" onClick={openBrowse}>
                <HiArrowPath aria-hidden /> Refresh
              </button>
              <button className="ap-btn ap-btn-ghost" type="button" onClick={() => setBrowseOpen(false)}>
                <HiXMark aria-hidden /> Close
              </button>
            </div>
            <div className="ap-browse-list">
              {browseLoading ? (
                <div className="ap-muted-row">Loading open GRPOs…</div>
              ) : browseRows.length === 0 ? (
                <div className="ap-muted-row">No open GRPOs found.</div>
              ) : (
                <table className="ap-table">
                  <thead>
                    <tr>
                      <th>DocNum</th>
                      <th>Vendor</th>
                      <th className="ap-r">Total</th>
                      <th>Vendor Inv#</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {browseRows.map((r) => (
                      <tr key={r.doc_entry}>
                        <td>{r.doc_num}</td>
                        <td>
                          <div className="ap-strong">{r.card_name}</div>
                          <div className="ap-dim">{r.card_code}</div>
                        </td>
                        <td className="ap-r">
                          {money(r.doc_total)} {r.currency}
                        </td>
                        <td>{r.num_at_card || "—"}</td>
                        <td>
                          <button
                            className="ap-btn ap-btn-sm"
                            type="button"
                            onClick={() => loadGrpo({ doc_entry: r.doc_entry })}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---- Success banner ------------------------------------------------- */}
      {result && (
        <div className="ap-success">
          <HiCheckCircle aria-hidden />
          <span>
            AP invoice <strong>{result.doc_num}</strong> created in {branchLabel} — total{" "}
            {money(result.doc_total)}.
          </span>
        </div>
      )}

      {/* ---- Entry form (once a GRPO is loaded) ----------------------------- */}
      {grpo && (
        <>
          <div className="ap-card">
            <div className="ap-copied-banner">
              Copied from GRPO <strong>{grpo.doc_num}</strong> — vendor and line
              details are locked to the GRPO.
            </div>

            <div className="ap-vendor">
              <div className="ap-ro">
                <span className="ap-ro-label">Vendor</span>
                <span className="ap-ro-value">
                  {grpo.card_name} <span className="ap-dim">({grpo.card_code})</span>
                </span>
              </div>
              <div className="ap-ro">
                <span className="ap-ro-label">GRPO Total</span>
                <span className="ap-ro-value">
                  {money(grpo.doc_total)} {grpo.currency}
                </span>
              </div>
            </div>

            {/* Editable header fields */}
            <div className="ap-form-grid">
              <div className="ap-field">
                <label className="ap-label ap-req" htmlFor="ap-numatcard">
                  Vendor Invoice No.
                </label>
                <input
                  id="ap-numatcard"
                  className={`ap-input ap-edit${errors.numAtCard ? " ap-input-err" : ""}`}
                  value={numAtCard}
                  onChange={(e) => setNumAtCard(e.target.value)}
                  placeholder="the number on the vendor's invoice"
                />
                {errors.numAtCard && <span className="ap-err">{errors.numAtCard}</span>}
              </div>

              <div className="ap-field">
                <label className="ap-label" htmlFor="ap-docdate">
                  Invoice Date
                </label>
                <input
                  id="ap-docdate"
                  type="date"
                  className="ap-input ap-edit"
                  max={todayISO()}
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                />
              </div>

              <div className="ap-field">
                <label className="ap-label" htmlFor="ap-duedate">
                  Payment Due Date
                </label>
                <input
                  id="ap-duedate"
                  type="date"
                  className="ap-input ap-edit"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="ap-field ap-col-span">
                <label className="ap-label" htmlFor="ap-comments">
                  Remarks
                </label>
                <input
                  id="ap-comments"
                  className="ap-input ap-edit"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="optional note on the invoice"
                />
              </div>
            </div>

            {/* TDS */}
            <div className="ap-tds">
              <label className="ap-check">
                <input
                  type="checkbox"
                  checked={tdsLiable}
                  onChange={(e) => setTdsLiable(e.target.checked)}
                />
                <span>
                  Apply TDS / withholding
                  {vendorSubjectToWt && <span className="ap-pill">vendor is WT-liable</span>}
                </span>
              </label>
              {tdsLiable && (
                <div className="ap-field ap-tds-code">
                  <label className="ap-label ap-req">TDS Code</label>
                  <select
                    className={`ap-input ap-edit${errors.tdsCode ? " ap-input-err" : ""}`}
                    value={tdsCode}
                    onChange={(e) => setTdsCode(e.target.value)}
                  >
                    <option value="">— select —</option>
                    {tdsCodes.map((t) => (
                      <option key={t.wt_code} value={t.wt_code}>
                        {t.wt_code} — {t.wt_name} ({t.rate}%{t.section ? `, ${t.section}` : ""})
                      </option>
                    ))}
                  </select>
                  {errors.tdsCode && <span className="ap-err">{errors.tdsCode}</span>}
                </div>
              )}
            </div>

            {/* Attachment */}
            <label className={`ap-check${grpo.attachment_entry == null ? " ap-check-off" : ""}`}>
              <input
                type="checkbox"
                checked={attachGrpoDoc}
                disabled={grpo.attachment_entry == null}
                onChange={(e) => setAttachGrpoDoc(e.target.checked)}
              />
              <span>
                <HiPaperClip aria-hidden /> Attach the GRPO's document
                {grpo.attachment_entry == null && (
                  <span className="ap-dim"> (GRPO has no attachment)</span>
                )}
              </span>
            </label>
          </div>

          {/* Lines: copied fields read-only, qty & price editable */}
          <div className="ap-card">
            <div className="ap-lines-head">
              <h3>Lines</h3>
              <span className="ap-dim">
                <HiPencilSquare aria-hidden /> Quantity and Unit Price are editable (for
                short/over-billing); everything else is copied.
              </span>
            </div>
            <div className="ap-table-wrap">
              <table className="ap-table ap-lines">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Whse</th>
                    <th>Tax</th>
                    <th className="ap-r">Qty</th>
                    <th className="ap-r">Unit Price</th>
                    <th className="ap-r">Line Est.</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const src = grpo.lines.find((x) => x.base_line === l.base_line)!;
                    const q = parseFloat(l.quantity);
                    const p = parseFloat(l.unit_price);
                    const lineEst = isFinite(q) && isFinite(p) ? q * p : null;
                    return (
                      <tr key={l.base_line}>
                        <td className="ap-ro-cell">{src.item_code}</td>
                        <td className="ap-ro-cell">{src.item_description}</td>
                        <td className="ap-ro-cell">{src.warehouse_code}</td>
                        <td className="ap-ro-cell">{src.tax_code}</td>
                        <td className="ap-r">
                          <input
                            className={`ap-cell-input ap-edit${errors[`q_${l.base_line}`] ? " ap-input-err" : ""}`}
                            inputMode="decimal"
                            value={l.quantity}
                            onChange={(e) => setLineField(l.base_line, "quantity", e.target.value)}
                          />
                          {src.uom && <span className="ap-uom">{src.uom}</span>}
                        </td>
                        <td className="ap-r">
                          <input
                            className={`ap-cell-input ap-edit${errors[`p_${l.base_line}`] ? " ap-input-err" : ""}`}
                            inputMode="decimal"
                            value={l.unit_price}
                            onChange={(e) => setLineField(l.base_line, "unit_price", e.target.value)}
                          />
                        </td>
                        <td className="ap-r ap-ro-cell">{lineEst == null ? "—" : money(lineEst)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} className="ap-r ap-strong">
                      Estimated (pre-tax)
                    </td>
                    <td className="ap-r ap-strong">{money(estTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="ap-actions">
              <button className="ap-btn ap-btn-ghost" type="button" onClick={() => { resetForm(); setDocNumInput(""); }}>
                Cancel
              </button>
              <button className="ap-btn ap-btn-primary" type="button" onClick={onReview}>
                Review &amp; Post
              </button>
            </div>
          </div>
        </>
      )}

      {/* ---- Review modal --------------------------------------------------- */}
      {showReview && grpo && (
        <div className="ap-modal-overlay" onClick={() => !submitting && setShowReview(false)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-head">
              <h3>Confirm A/P Invoice</h3>
              <button className="ap-icon-btn" onClick={() => !submitting && setShowReview(false)}>
                <HiXMark aria-hidden />
              </button>
            </div>
            <div className="ap-modal-body">
              <dl className="ap-review">
                <div><dt>Company</dt><dd>{branchLabel}</dd></div>
                <div><dt>Vendor</dt><dd>{grpo.card_name} ({grpo.card_code})</dd></div>
                <div><dt>From GRPO</dt><dd>{grpo.doc_num}</dd></div>
                <div><dt>Vendor Invoice No.</dt><dd>{numAtCard}</dd></div>
                <div><dt>Invoice Date</dt><dd>{docDate || "—"}</dd></div>
                <div><dt>Due Date</dt><dd>{dueDate || "—"}</dd></div>
                <div><dt>TDS</dt><dd>{tdsLiable && tdsCode ? tdsCode : "None"}</dd></div>
                <div><dt>Attachment</dt><dd>{attachGrpoDoc && grpo.attachment_entry != null ? "GRPO document" : "None"}</dd></div>
                <div><dt>Lines</dt><dd>{lines.length}</dd></div>
                <div><dt>Estimated (pre-tax)</dt><dd>{money(estTotal)} {grpo.currency}</dd></div>
              </dl>
              <p className="ap-note">
                SAP computes the final tax and total from the GRPO. Posting closes the GRPO.
              </p>
            </div>
            <div className="ap-modal-foot">
              <button className="ap-btn ap-btn-ghost" onClick={() => setShowReview(false)} disabled={submitting}>
                Back
              </button>
              <button className="ap-btn ap-btn-primary" onClick={onConfirm} disabled={submitting}>
                {submitting ? "Posting…" : "Post Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="ap-toast">{toast}</div>}
    </div>
  );
}
