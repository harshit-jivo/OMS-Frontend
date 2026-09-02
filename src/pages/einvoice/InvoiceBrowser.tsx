import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HiMagnifyingGlass, HiBolt } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import type { InvoiceListItem } from "../../services/einvoiceService";
import { NicField, StatusBadge, ErrorAlert, SuccessAlert, CompanyDbSelect } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import QrViewer from "../../components/QrViewer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/*
 * The module-level `cache` object that used to live here is gone — it held the
 * rows AND the filters, was written from an effect, and `cache.loaded` was only
 * set on SUCCESS, so a failed first load re-fired `load()` on every keystroke
 * in the Search box until one succeeded.
 *
 * The rows are now the query cache, keyed on the APPLIED filters. Behaviour
 * change to know about: the filter VALUES no longer survive a tab switch
 * (Einvoice.tsx mounts each tab conditionally). The data still does — returning
 * with the default filters is a cache hit and paints instantly, which is what
 * the module cache actually bought.
 */
const DEFAULTS = { companyDb: "JIVO_OIL_HANADB", search: "", limit: "25" };
const NO_ROWS: InvoiceListItem[] = [];

export default function InvoiceBrowser() {
  const [companyDb, setCompanyDb] = useState(DEFAULTS.companyDb);
  const [search, setSearch] = useState(DEFAULTS.search);
  const [limit, setLimit] = useState(DEFAULTS.limit);
  /* The COMMITTED filters — "Load Invoices" applies them. Keying on the raw
     inputs would fire a request per keystroke. */
  const [applied, setApplied] = useState(DEFAULTS);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [busyDoc, setBusyDoc] = useState<number | null>(null);
  const [qrIrn, setQrIrn] = useState<string | null>(null);

  const {
    data: rows = NO_ROWS,
    isFetching: loading,
    error: loadError,
  } = useQuery({
    queryKey: ["einvoice", "invoices", applied],
    queryFn: async () =>
      (
        await einvoiceService.listInvoices({
          companyDb: applied.companyDb.trim() || undefined,
          search: applied.search.trim() || undefined,
          limit: Number(applied.limit) || 25,
        })
      ).results,
  });

  const load = async () => {
    setApplied({ companyDb, search, limit });
    await queryClient.invalidateQueries({ queryKey: ["einvoice", "invoices"] });
  };

  const generate = async (docentry: number) => {
    setBusyDoc(docentry);
    setError("");
    setNotice("");
    setWarning("");
    try {
      const resp = await einvoiceService.generateFromInvoice(docentry, { companyDb: companyDb.trim() || undefined });
      if (resp.result?.Irn) setNotice(`IRN generated for DocEntry ${docentry}.`);
      else if (resp.error) setError(`DocEntry ${docentry}: ${resp.error}`);
      if (resp.test_warning) setWarning(resp.test_warning);
      await load();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(`DocEntry ${docentry}: ${e.response?.data?.error || messageFrom(err, "Request failed")}`);
    } finally {
      setBusyDoc(null);
    }
  };

  const sourceLabel = (s: InvoiceListItem["irn_source"]) =>
    s === "@UTL_MDEXTH" ? "SAP" : s === "OMS_IRN_LOG" ? "OMS log" : s === "OMS" ? "OMS" : "";

  const statusBadge = (r: InvoiceListItem) => {
    if (r.irn_status === "GENERATED") {
      const src = sourceLabel(r.irn_source);
      return (
        <StatusBadge tone="ok" title={src ? `IRN found in ${r.irn_source}` : undefined}>
          {src ? `IRN done (${src})` : "IRN done"}
        </StatusBadge>
      );
    }
    if (r.irn_status === "FAILED") return <StatusBadge tone="err">Failed</StatusBadge>;
    if (r.irn_status === "SKIPPED") return <StatusBadge tone="muted">Skipped</StatusBadge>;
    return <StatusBadge tone="warn">No IRN</StatusBadge>;
  };

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head">
        <span className="ofs-card-mark" />
        <h2>Invoices — Generate IRN</h2>
      </div>
      <p className="nic-note">
        Shows only invoices that don't yet have an IRN (checked in SAP <code>@UTL_MDEXTH</code>,
        <code> OMS_IRN_LOG</code>, and OMS) — the ones you still need to generate. Invoices that
        already have an IRN are hidden.
      </p>

      <div className="nic-form-grid nic-form-grid--spaced">
        <NicField label="Company DB">
          <CompanyDbSelect value={companyDb} onChange={setCompanyDb} />
        </NicField>
        <NicField label="Search" hint="DocNum or customer name">
          <input className="nic-input" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()} placeholder="626070166 or SAKSHI" />
        </NicField>
        <NicField label="Rows">
          <select className="nic-select" value={limit} onChange={(e) => setLimit(e.target.value)}>
            {["25", "50", "100"].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </NicField>
      </div>
      <div className="nic-actions-row">
        <button className="ofs-primary" onClick={() => void load()} disabled={loading}>
          <HiMagnifyingGlass className="nic-icon-lead" />
          {loading ? "Loading…" : "Load Invoices"}
        </button>
      </div>

      {/* The load failure is rendered BEFORE the empty state below. It used to
          fall through to "No pending invoices — every recent invoice already
          has an IRN", which is the worst possible wrong message here. */}
      <ErrorAlert>{error || (loadError ? messageFrom(loadError, "Request failed") : "")}</ErrorAlert>
      <SuccessAlert>{notice}</SuccessAlert>
      {warning ? (
        <div className="nic-alert nic-alert--err nic-alert--strong">
          <span>{warning}</span>
        </div>
      ) : null}

      {qrIrn ? (
        <div className="nic-result">
          <QrViewer src={einvoiceService.qrImageUrl(qrIrn)} irn={qrIrn}
            caption={`Signed QR for IRN ${qrIrn.slice(0, 12)}…`} />
          <div className="nic-actions-row">
            <button className="ofs-secondary" onClick={() => setQrIrn(null)}>Close QR</button>
          </div>
        </div>
      ) : null}

      {rows.length ? (
        <div className="nic-table-wrap">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>DocEntry</TableHead><TableHead>Doc No</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead>
                <TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.docentry}>
                  <TableCell>{r.docentry}</TableCell>
                  <TableCell className="nic-mono">{r.docnum}</TableCell>
                  <TableCell>{r.cardname}</TableCell>
                  <TableCell className="nic-nowrap">{(r.docdate || "").slice(0, 10)}</TableCell>
                  <TableCell className="nic-num">{Number(r.doctotal).toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    {statusBadge(r)}
                    {r.last_error ? <div className="nic-note nic-note--stacked">{r.last_error}</div> : null}
                  </TableCell>
                  <TableCell className="nic-nowrap">
                    {r.irn && r.irn_source === "OMS" ? (
                      // QR is renderable only for OMS-generated IRNs (signed QR stored in OMS DB)
                      <button className="ofs-secondary nic-btn-xs"
                        onClick={() => setQrIrn(r.irn!)}>
                        View QR
                      </button>
                    ) : r.irn ? (
                      // Already has an IRN in SAP (@UTL_MDEXTH) / OMS_IRN_LOG — nothing to generate.
                      <span className="nic-note" title={r.irn}>Generated in {sourceLabel(r.irn_source)}</span>
                    ) : (
                      <button className="ofs-primary nic-btn-xs nic-btn-xs--wide"
                        onClick={() => void generate(r.docentry)} disabled={busyDoc === r.docentry}>
                        <HiBolt className="nic-icon-inline" />
                        {busyDoc === r.docentry ? "Generating…" : "Generate IRN"}
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : !loading ? (
        <p className="nic-note">
          {loadError
            ? "Could not load invoices."
            : "No pending invoices — every recent invoice already has an IRN. Use Search to find a specific one."}
        </p>
      ) : null}
    </section>
  );
}
