import { useState } from "react";
import { HiDocumentMagnifyingGlass, HiTruck } from "react-icons/hi2";
import { ewaybillService } from "../../services/ewaybillService";
import type { EwbFromInvoicePreview, EwbGenerateResponse, TransportOverrides } from "../../services/ewaybillService";
import {
  NicField, KeyValues, JsonView, ValidationList, ErrorAlert, SuccessAlert, StatusBadge, apiErrorMessage,
} from "../../components/NicUI";
import DateInput from "../../components/DateInput";

const TRANS_MODES = [["", "—"], ["1", "1 — Road"], ["2", "2 — Rail"], ["3", "3 — Air"], ["4", "4 — Ship"]];

export default function GenerateEwb() {
  const [docentry, setDocentry] = useState("");
  const [companyDb, setCompanyDb] = useState("");
  const [mode, setMode] = useState("auto");
  const [t, setT] = useState<TransportOverrides>({ transDistance: 0, transMode: "1", vehicleType: "R" });
  const [preview, setPreview] = useState<EwbFromInvoicePreview | null>(null);
  const [resp, setResp] = useState<EwbGenerateResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "generate">("");

  const setField = (k: keyof TransportOverrides, v: string) => setT((p) => ({ ...p, [k]: v }));

  const cleanTransport = (): TransportOverrides => {
    const out: TransportOverrides = {};
    Object.entries(t).forEach(([k, v]) => {
      if (v !== "" && v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
    });
    return out;
  };

  const doPreview = async () => {
    if (!docentry.trim()) return setError("Enter a SAP invoice DocEntry.");
    setError(""); setPreview(null); setResp(null); setBusy("preview");
    try {
      setPreview(await ewaybillService.previewFromInvoice(docentry.trim(), {
        companyDb: companyDb.trim() || undefined, mode,
      }));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const doGenerate = async () => {
    if (!docentry.trim()) return setError("Enter a SAP invoice DocEntry.");
    setError(""); setResp(null); setBusy("generate");
    try {
      const r = await ewaybillService.generateFromInvoice(docentry.trim(), { transport: cleanTransport() }, {
        companyDb: companyDb.trim() || undefined, mode,
      });
      setResp(r);
      if (r.error) setError(r.error);
    } catch (err) {
      const e = err as { response?: { data?: EwbGenerateResponse } };
      if (e.response?.data) { setResp(e.response.data); setError(e.response.data.error || apiErrorMessage(err)); }
      else setError(apiErrorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const result = resp?.result;
  const ewbNo = result?.EwbNo ?? result?.ewayBillNo;
  const validTill = result?.EwbValidTill ?? result?.validUpto;

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head">
        <span className="ofs-card-mark" />
        <h2>Generate e-Way Bill from SAP Invoice</h2>
      </div>
      <p className="nic-note">
        Auto-uses <strong>EWB-by-IRN</strong> when the invoice already has a generated IRN, else the
        standalone GENEWAYBILL. Transport details are usually entered at dispatch — fill them below.
      </p>

      <div className="nic-form-grid" style={{ marginTop: 14 }}>
        <NicField label="Invoice DocEntry">
          <input className="nic-input" value={docentry} inputMode="numeric"
            onChange={(e) => setDocentry(e.target.value)} placeholder="76029" />
        </NicField>
        <NicField label="Company DB (optional)">
          <input className="nic-input" value={companyDb} onChange={(e) => setCompanyDb(e.target.value)}
            placeholder="JIVO_OIL_HANADB" />
        </NicField>
        <NicField label="Mode">
          <select className="nic-select" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="auto">Auto (prefer IRN)</option>
            <option value="irn">EWB by IRN</option>
            <option value="standalone">Standalone</option>
          </select>
        </NicField>
      </div>

      <div className="ofs-card-head" style={{ marginTop: 18 }}>
        <span className="ofs-card-mark" />
        <h2 style={{ fontSize: 15 }}>Transport (Part-B)</h2>
      </div>
      <div className="nic-form-grid">
        <NicField label="Transport Mode">
          <select className="nic-select" value={t.transMode ?? ""} onChange={(e) => setField("transMode", e.target.value)}>
            {TRANS_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </NicField>
        <NicField label="Distance (km)" hint="0 = NIC auto-computes from pincodes">
          <input className="nic-input" value={String(t.transDistance ?? "")} inputMode="numeric"
            onChange={(e) => setField("transDistance", e.target.value)} placeholder="0" />
        </NicField>
        <NicField label="Vehicle No">
          <input className="nic-input" value={t.vehicleNo ?? ""} onChange={(e) => setField("vehicleNo", e.target.value)}
            placeholder="HR55AB1234" />
        </NicField>
        <NicField label="Vehicle Type">
          <select className="nic-select" value={t.vehicleType ?? ""} onChange={(e) => setField("vehicleType", e.target.value)}>
            <option value="">—</option>
            <option value="R">R — Regular</option>
            <option value="O">O — Over Dimensional Cargo</option>
          </select>
        </NicField>
        <NicField label="Transporter ID" hint="15-char GSTIN / Transporter ID">
          <input className="nic-input nic-mono" value={t.transporterId ?? ""}
            onChange={(e) => setField("transporterId", e.target.value)} placeholder="06AAA…" />
        </NicField>
        <NicField label="Transporter Doc No">
          <input className="nic-input" value={t.transDocNo ?? ""} onChange={(e) => setField("transDocNo", e.target.value)} />
        </NicField>
        <NicField label="Transporter Doc Date" hint="dd/mm/yyyy">
          <DateInput value={t.transDocDate ?? ""} onChange={(v) => setField("transDocDate", v)} />
        </NicField>
      </div>

      <div className="nic-actions-row">
        <button className="ofs-secondary" onClick={() => void doPreview()} disabled={!!busy}>
          <HiDocumentMagnifyingGlass style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {busy === "preview" ? "Loading…" : "Preview & Validate"}
        </button>
        <button className="ofs-primary" onClick={() => void doGenerate()} disabled={!!busy}>
          <HiTruck style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {busy === "generate" ? "Generating…" : "Generate e-Way Bill"}
        </button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {resp?.validation_errors ? <ValidationList errors={resp.validation_errors} /> : null}

      {preview ? (
        <div className="nic-result">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <StatusBadge tone={preview.valid ? "ok" : "err"}>
              {preview.valid ? "Valid" : `${preview.error_count} issue(s)`}
            </StatusBadge>
            <StatusBadge tone="muted">{preview.mode === "ewb_by_irn" ? "EWB by IRN" : "Standalone"}</StatusBadge>
            {preview.irn ? <StatusBadge tone="muted">IRN {preview.irn.slice(0, 12)}…</StatusBadge> : null}
          </div>
          <ValidationList errors={preview.validation_errors} />
          <JsonView data={preview.payload} title="EWB payload to be sent" />
        </div>
      ) : null}

      {result && ewbNo ? (
        <div className="nic-result">
          <SuccessAlert>e-Way Bill generated.</SuccessAlert>
          <KeyValues
            items={[
              ["EWB No", <span className="nic-mono">{String(ewbNo)}</span>],
              ["Valid Till", validTill ? String(validTill) : ""],
              ["Mode", resp?.mode],
              ["Record ID", resp?.record_id],
            ]}
          />
          {resp?.persistence_warning ? (
            <div className="nic-alert nic-alert--err" style={{ marginTop: 12 }}><span>{resp.persistence_warning}</span></div>
          ) : null}
          <JsonView data={result} title="Full NIC response" />
        </div>
      ) : null}
    </section>
  );
}
