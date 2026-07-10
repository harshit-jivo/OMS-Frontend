import { useEffect, useState, useCallback } from "react";
import { HiMagnifyingGlass, HiBolt } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import type { InvoiceListItem } from "../../services/einvoiceService";
import { NicField, StatusBadge, ErrorAlert, SuccessAlert, apiErrorMessage, CompanyDbSelect } from "../../components/NicUI";
import QrViewer from "../../components/QrViewer";

// Session-level cache so the list + filters survive tab switches / revisits.
// Only a manual "Load Invoices" (or Generate) refetches. Cleared on full reload.
const cache: {
  loaded: boolean;
  companyDb: string;
  search: string;
  limit: string;
  rows: InvoiceListItem[];
} = { loaded: false, companyDb: "JIVO_OIL_HANADB", search: "", limit: "25", rows: [] };

export default function InvoiceBrowser() {
  const [companyDb, setCompanyDb] = useState(cache.companyDb);
  const [search, setSearch] = useState(cache.search);
  const [limit, setLimit] = useState(cache.limit);
  const [rows, setRows] = useState<InvoiceListItem[]>(cache.rows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [busyDoc, setBusyDoc] = useState<number | null>(null);
  const [qrIrn, setQrIrn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await einvoiceService.listInvoices({
        companyDb: companyDb.trim() || undefined,
        search: search.trim() || undefined,
        limit: Number(limit) || 25,
      });
      setRows(data.results);
      cache.rows = data.results;
      cache.loaded = true;
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [companyDb, search, limit]);

  // Persist filters so they're restored on revisit.
  useEffect(() => {
    cache.companyDb = companyDb;
    cache.search = search;
    cache.limit = limit;
  }, [companyDb, search, limit]);

  // Load only the first time ever; afterwards the cached list is reused until
  // the user clicks "Load Invoices" (or generates an IRN).
  useEffect(() => {
    if (!cache.loaded) void load();
  }, [load]);

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
      setError(`DocEntry ${docentry}: ${e.response?.data?.error || apiErrorMessage(err)}`);
    } finally {
      setBusyDoc(null);
    }
  };

  const statusBadge = (r: InvoiceListItem) => {
    if (r.irn_status === "GENERATED") return <StatusBadge tone="ok">IRN done</StatusBadge>;
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
        Browse recent SAP invoices (any source) and generate the IRN for any that don't have one.
      </p>

      <div className="nic-form-grid" style={{ marginTop: 12 }}>
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
          <HiMagnifyingGlass style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {loading ? "Loading…" : "Load Invoices"}
        </button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      <SuccessAlert>{notice}</SuccessAlert>
      {warning ? (
        <div className="nic-alert nic-alert--err" style={{ marginTop: 10, fontWeight: 600 }}>
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
          <table className="nic-table">
            <thead>
              <tr>
                <th>DocEntry</th><th>Doc No</th><th>Customer</th><th>Date</th>
                <th>Total</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.docentry}>
                  <td>{r.docentry}</td>
                  <td className="nic-mono">{r.docnum}</td>
                  <td>{r.cardname}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{(r.docdate || "").slice(0, 10)}</td>
                  <td style={{ textAlign: "right" }}>{Number(r.doctotal).toLocaleString("en-IN")}</td>
                  <td>
                    {statusBadge(r)}
                    {r.last_error ? <div className="nic-note" style={{ marginTop: 4 }}>{r.last_error}</div> : null}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.irn ? (
                      <button className="ofs-secondary" style={{ minHeight: 30, padding: "0 10px", fontSize: 11 }}
                        onClick={() => setQrIrn(r.irn!)}>
                        View QR
                      </button>
                    ) : (
                      <button className="ofs-primary" style={{ minHeight: 30, padding: "0 12px", fontSize: 11 }}
                        onClick={() => void generate(r.docentry)} disabled={busyDoc === r.docentry}>
                        <HiBolt style={{ verticalAlign: "-2px", marginRight: 4 }} />
                        {busyDoc === r.docentry ? "Generating…" : "Generate IRN"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading ? (
        <p className="nic-note">No invoices loaded.</p>
      ) : null}
    </section>
  );
}
